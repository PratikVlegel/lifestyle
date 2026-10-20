/* Opt-in Web Push. Diary data stays local; the server receives only push setup data and reminder ids/times. */
'use strict';

const PUSH_CLEANUP_KEY = 'vd-push-cleanup-v1';
function pendingPushCleanup() {
  try {
    const list = JSON.parse(localStorage.getItem(PUSH_CLEANUP_KEY) || '[]');
    return Array.isArray(list) ? [...new Set(list.filter(x => typeof x === 'string' && x.startsWith('https://') && x.length <= 2048))].slice(0, 100) : [];
  } catch (_) { return []; }
}
function savePendingPushCleanup(list) {
  try {
    const clean = [...new Set(list.filter(x => typeof x === 'string' && x.startsWith('https://') && x.length <= 2048))].slice(-100);
    if (clean.length) localStorage.setItem(PUSH_CLEANUP_KEY, JSON.stringify(clean)); else localStorage.removeItem(PUSH_CLEANUP_KEY);
    return true;
  }
  catch (_) { return false; }
}
async function flushPushCleanup() {
  const pending = pendingPushCleanup();
  if (!pending.length) return true;
  if (!navigator.onLine || !cloudReady() || !getAuth()) return false;
  const remaining = [];
  for (const endpoint of pending) {
    try { await sb('/rest/v1/webpush_subscriptions?endpoint=eq.' + encodeURIComponent(endpoint), { method: 'DELETE' }); }
    catch (e) { remaining.push(endpoint); console.warn('push cleanup pending', e); }
  }
  return savePendingPushCleanup(remaining) && !remaining.length;
}
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
  return DB.reminders.filter(r => r && r.on && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time || '')).slice(0, MAX_REMINDERS).map(r => ({
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
  } catch (e) { if (!quiet) toast(tr('Pushherinnering bijwerken mislukt. Je agenda-export blijft beschikbaar.')); console.warn('push schedule sync failed', e); }
}
ACT.webPushEnable = async () => {
  if (!webPushSupported()) return toast(tr('Push is niet beschikbaar in deze browser. Gebruik de agenda-export als alternatief.'));
  if (!pushPublicKey()) return toast(tr('Push wordt nog geconfigureerd. De agenda-export blijft beschikbaar.'));
  if (pendingPushCleanup().length && !(await flushPushCleanup())) return toast(tr('Verbind met internet om de oude pushregistratie te verwijderen voordat je meldingen opnieuw inschakelt.'));
  if (Notification.permission === 'denied') return toast(tr('Meldingen zijn geblokkeerd in je browserinstellingen.'));
  let subscription = null;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return toast(tr('Je hebt geen toestemming gegeven voor pushmeldingen.'));
    const registration = await navigator.serviceWorker.ready;
    subscription = await registration.pushManager.getSubscription();
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(pushPublicKey()) });
    await persistWebPushSubscription(subscription);
    DB.settings.pushEnabled = true; save(); toast(tr('Pushherinneringen staan aan op dit toestel.')); render();
  } catch (e) {
    if (subscription) { try { await subscription.unsubscribe(); } catch (_) { } }
    DB.settings.pushEnabled = false; save();
    toast(tr('Push instellen lukte niet. Je bestaande agenda-export blijft beschikbaar.'));
    console.warn('push opt-in failed', e);
  }
};
ACT.webPushDisable = async () => {
  let subscription = null, cleanupQueued = true;
  try {
    const registration = await navigator.serviceWorker.ready;
    subscription = await registration.pushManager.getSubscription();
  } catch (e) { console.warn('push unsubscribe cleanup failed', e); }
  if (subscription && subscription.endpoint) {
    cleanupQueued = savePendingPushCleanup([...pendingPushCleanup(), subscription.endpoint]);
    if (cleanupQueued) await flushPushCleanup();
    try { await subscription.unsubscribe(); } catch (e) { console.warn('browser push unsubscribe failed', e); }
  }
  DB.settings.pushEnabled = false; save();
  const cleanupPending = !cleanupQueued || pendingPushCleanup().length > 0;
  toast(tr(cleanupPending ? 'Push is uit op dit toestel. Serveropruiming is nog niet gelukt; probeer het opnieuw zodra je online bent.' : 'Pushherinneringen zijn uitgeschakeld.'));
  render();
};
window.addEventListener('online', () => { flushPushCleanup(); refreshWebPushSchedule(true); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshWebPushSchedule(true);
});
