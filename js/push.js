/* Opt-in Web Push. Only local reminder ids and times leave this device. */
'use strict';

function pushPublicKey() { return String((window.VD_CONFIG || {}).pushVapidPublicKey || '').trim(); }
function webPushSupported() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const installed = !!(window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches);
  return !!(window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && (!ios || installed));
}
function vapidBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const raw = atob(padded), out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function webPushSchedule() {
  return DB.reminders.filter(r => r && r.on && /^\d{2}:\d{2}$/.test(r.time || '')).slice(0, 20).map(r => ({
    id: String(r.id || '').slice(0, 40), time: r.time
  })).filter(r => /^[a-zA-Z0-9_-]{1,40}$/.test(r.id));
}
async function persistWebPushSubscription(subscription) {
  const raw = subscription.toJSON();
  if (!raw.endpoint || !raw.keys || !raw.keys.p256dh || !raw.keys.auth) throw new Error('De browser gaf geen volledige pushregistratie terug.');
  await ensureSession();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Brussels';
  await sb('/rest/v1/webpush_subscriptions?on_conflict=endpoint', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: {
      user_id: cloudUser().id, endpoint: raw.endpoint, p256dh: raw.keys.p256dh, auth_secret: raw.keys.auth,
      timezone, language: currentLocale(), reminders: webPushSchedule(), enabled: true, updated_at: new Date().toISOString()
    }
  });
}
async function refreshWebPushSchedule(quiet) {
  if (!DB.settings.pushEnabled || !webPushSupported() || !cloudReady()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) { DB.settings.pushEnabled = false; save(); return; }
    await persistWebPushSubscription(subscription);
  } catch (e) { if (!quiet) toast('Pushherinnering bijwerken mislukt. Je agenda-export blijft beschikbaar.'); console.warn('push schedule sync failed', e); }
}
ACT.webPushEnable = async () => {
  if (!webPushSupported()) return toast('Push is niet beschikbaar in deze browser. Gebruik de agenda-export als alternatief.');
  if (!pushPublicKey()) return toast('Push wordt nog geconfigureerd. De agenda-export blijft beschikbaar.');
  if (Notification.permission === 'denied') return toast('Meldingen zijn geblokkeerd in je browserinstellingen.');
  let subscription = null;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return toast('Je hebt geen toestemming gegeven voor pushmeldingen.');
    const registration = await navigator.serviceWorker.ready;
    subscription = await registration.pushManager.getSubscription();
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(pushPublicKey()) });
    await persistWebPushSubscription(subscription);
    DB.settings.pushEnabled = true; save(); toast('Pushherinneringen staan aan op dit toestel.'); render();
  } catch (e) {
    if (subscription) { try { await subscription.unsubscribe(); } catch (_) { } }
    DB.settings.pushEnabled = false; save();
    toast('Push instellen lukte niet. Je bestaande agenda-export blijft beschikbaar.');
    console.warn('push opt-in failed', e);
  }
};
ACT.webPushDisable = async () => {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription && cloudReady() && getAuth()) {
      await sb('/rest/v1/webpush_subscriptions?endpoint=eq.' + encodeURIComponent(subscription.endpoint), { method: 'DELETE' });
    }
    if (subscription) await subscription.unsubscribe();
  } catch (e) { console.warn('push unsubscribe cleanup failed', e); }
  DB.settings.pushEnabled = false; save(); toast('Pushherinneringen zijn uitgeschakeld.'); render();
};
