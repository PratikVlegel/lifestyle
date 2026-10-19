import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildPushPayload, type PushSubscription, type VapidKeys } from 'npm:@block65/webcrypto-web-push@2.0.0';

type Reminder = { id: string; time: string };
type Device = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  timezone: string;
  language: string;
  reminders: Reminder[];
};

const cors = { 'Access-Control-Allow-Origin': 'null', 'Access-Control-Allow-Headers': 'content-type,x-push-cron-secret' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function permittedEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    const host = u.hostname.toLowerCase();
    return u.protocol === 'https:' && (host === 'fcm.googleapis.com' || host === 'web.push.apple.com' || host.endsWith('.push.services.mozilla.com') || host.endsWith('.notify.windows.com'));
  } catch { return false; }
}

function localParts(now: Date, timezone: string) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map(x => [x.type, x.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, minute: Number(values.hour) * 60 + Number(values.minute) };
}

function scheduledDate(now: Date, timezone: string, reminderTime: string): string | null {
  const m = reminderTime.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const target = Number(m[1]) * 60 + Number(m[2]);
  const here = localParts(now, timezone);
  const lateBy = (here.minute - target + 1440) % 1440;
  if (lateBy > 1) return null; // tolerate a one-minute cron delay, but send at most once per local date
  if (here.minute >= target) return here.date;
  const d = new Date(`${here.date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function notificationText(language: string) {
  const copy: Record<string, [string, string]> = {
    'nl-BE': ['Tijd voor je check-in', 'Open je dagboek wanneer het jou past.'],
    'en-GB': ['Time for your check-in', 'Open your diary whenever it suits you.'],
    'fr-FR': ['C’est l’heure de votre suivi', 'Ouvrez votre journal quand vous le souhaitez.'],
    'de-DE': ['Zeit für deinen Eintrag', 'Öffne dein Tagebuch, wenn es dir passt.']
  };
  return copy[language] || copy['nl-BE'];
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const cronSecret = Deno.env.get('PUSH_CRON_SECRET') || '';
  if (!safeEqual(req.headers.get('x-push-cron-secret') || '', cronSecret)) return json({ error: 'unauthorized' }, 401);

  const url = Deno.env.get('SUPABASE_URL') || '';
  const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
  const serviceKey = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const vapid: VapidKeys = {
    subject: Deno.env.get('VAPID_SUBJECT') || '',
    publicKey: Deno.env.get('VAPID_PUBLIC_KEY') || '',
    privateKey: Deno.env.get('VAPID_PRIVATE_KEY') || ''
  };
  if (!url || !serviceKey || !vapid.subject || !vapid.publicKey || !vapid.privateKey) return json({ error: 'push_not_configured' }, 503);

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const now = new Date(), max = 500, pageSize = 100;
  let sent = 0, skipped = 0, failed = 0;
  const staleBefore = new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10);
  await admin.from('webpush_deliveries').delete().lt('local_date', staleBefore);

  for (let offset = 0; offset < max; offset += pageSize) {
    const { data, error } = await admin.from('webpush_subscriptions')
      .select('id,endpoint,p256dh,auth_secret,timezone,language,reminders')
      .eq('enabled', true).order('created_at').range(offset, offset + pageSize - 1);
    if (error) return json({ error: 'subscription_read_failed' }, 500);
    const devices = (data || []) as Device[];
    if (!devices.length) break;

    for (const d of devices) {
      if (!permittedEndpoint(d.endpoint)) { await admin.from('webpush_subscriptions').delete().eq('id', d.id); failed++; continue; }
      let zoneOk = true;
      try { new Intl.DateTimeFormat('en', { timeZone: d.timezone }); } catch { zoneOk = false; }
      if (!zoneOk || !Array.isArray(d.reminders)) { skipped++; continue; }
      for (const r of d.reminders.slice(0, 20)) {
        if (!r || typeof r.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(r.id)) continue;
        const localDate = scheduledDate(now, d.timezone, r.time);
        if (!localDate) continue;
        const { data: claimed, error: claimError } = await admin.rpc('claim_webpush_delivery', {
          p_subscription_id: d.id, p_reminder_id: r.id, p_local_date: localDate
        });
        if (claimError) { failed++; continue; }
        if (!claimed) { skipped++; continue; }

        let ok = false, errText = '';
        try {
          const subscription: PushSubscription = {
            endpoint: d.endpoint, expirationTime: null,
            keys: { p256dh: d.p256dh, auth: d.auth_secret }
          };
          const [title, body] = notificationText(d.language);
          const appUrl = Deno.env.get('APP_URL') || 'https://pratikvlegel.github.io/lifestyle/';
          const payload = await buildPushPayload({ data: JSON.stringify({ title, body, url: `${appUrl}#/checkin/${encodeURIComponent(r.id)}` }), options: { ttl: 120 } }, subscription, vapid);
          const response = await fetch(d.endpoint, { ...payload, redirect: 'manual' });
          if (response.status === 404 || response.status === 410) {
            await admin.from('webpush_subscriptions').delete().eq('id', d.id);
            errText = `subscription_gone_${response.status}`;
          } else if (response.ok) ok = true;
          else errText = `push_service_${response.status}`;
        } catch (e) { errText = e instanceof Error ? e.message.slice(0, 200) : 'send_failed'; }

        await admin.rpc('finish_webpush_delivery', {
          p_subscription_id: d.id, p_reminder_id: r.id, p_local_date: localDate,
          p_success: ok, p_error: ok ? null : errText
        });
        if (ok) sent++; else failed++;
      }
    }
    if (devices.length < pageSize) break;
  }
  return json({ sent, skipped, failed });
});
