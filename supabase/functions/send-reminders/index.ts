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
const PUSH_TIMEOUT_MS = 10_000;
// Android parks idle phones in Doze. Normal-priority pushes then wait until the next
// maintenance window; with a short TTL the push service silently drops them.
// High urgency wakes the device; a 2-hour TTL still delivers after a short offline spell.
// The topic (reminder id) makes a newer push replace an undelivered older one.
const PUSH_TTL_SECONDS = 2 * 60 * 60;
const MAX_REMINDER_LATE_MINUTES = 6 * 60;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function safePushError(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') return 'push_timeout';
  // Fetch errors can include the full subscription endpoint, which contains a
  // provider token. Keep only the error class in the delivery ledger.
  const name = error instanceof Error ? error.name.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) : '';
  return name ? `push_error_${name}` : 'send_failed';
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
  if (lateBy > MAX_REMINDER_LATE_MINUTES) return null; // allow bounded retries, but do not send stale reminders all day
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
  const now = new Date(), pageSize = 100;
  let sent = 0, skipped = 0, failed = 0;
  const staleBefore = new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10);
  await admin.from('webpush_deliveries').delete().lt('local_date', staleBefore);

  // Keyset pagination is stable while expired endpoints are deleted below.
  // Offset pagination would skip rows whenever a deletion shifts later pages.
  let afterId = '';
  let scanned = 0;
  while (true) {
    let query = admin.from('webpush_subscriptions')
      .select('id,endpoint,p256dh,auth_secret,timezone,language,reminders')
      .eq('enabled', true).order('id').limit(pageSize);
    if (afterId) query = query.gt('id', afterId);
    const { data, error } = await query;
    if (error) return json({ error: 'subscription_read_failed' }, 500);
    const devices = (data || []) as Device[];
    if (!devices.length) break;
    afterId = devices[devices.length - 1].id;
    scanned += devices.length;

    const processDevice = async (d: Device) => {
      const result = { sent: 0, skipped: 0, failed: 0 };
      if (!permittedEndpoint(d.endpoint)) {
        await admin.from('webpush_subscriptions').delete().eq('id', d.id);
        result.failed++;
        return result;
      }
      let zoneOk = true;
      try { new Intl.DateTimeFormat('en', { timeZone: d.timezone }); } catch { zoneOk = false; }
      if (!zoneOk || !Array.isArray(d.reminders)) { result.skipped++; return result; }
      for (const r of d.reminders.slice(0, 20)) {
        if (!r || typeof r.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(r.id)) continue;
        const localDate = scheduledDate(now, d.timezone, r.time);
        if (!localDate) continue;
        const { data: claimed, error: claimError } = await admin.rpc('claim_webpush_delivery', {
          p_subscription_id: d.id, p_reminder_id: r.id, p_local_date: localDate
        });
        if (claimError) { result.failed++; continue; }
        if (!claimed) { result.skipped++; continue; }

        let ok = false, errText = '';
        try {
          const subscription: PushSubscription = {
            endpoint: d.endpoint, expirationTime: null,
            keys: { p256dh: d.p256dh, auth: d.auth_secret }
          };
          const [title, body] = notificationText(d.language);
          const appUrl = Deno.env.get('APP_URL') || 'https://pratikvlegel.github.io/lifestyle/';
          const payload = await buildPushPayload({ data: JSON.stringify({ title, body, url: `${appUrl}#/checkin/${encodeURIComponent(r.id)}` }), options: { ttl: PUSH_TTL_SECONDS, urgency: 'high', topic: r.id.slice(0, 32) } }, subscription, vapid);
          const response = await fetch(d.endpoint, { ...payload, redirect: 'manual', signal: AbortSignal.timeout(PUSH_TIMEOUT_MS) });
          if (response.status === 404 || response.status === 410) {
            await admin.from('webpush_subscriptions').delete().eq('id', d.id);
            errText = `subscription_gone_${response.status}`;
          } else if (response.ok) ok = true;
          else errText = `push_service_${response.status}`;
        } catch (e) { errText = safePushError(e); }

        await admin.rpc('finish_webpush_delivery', {
          p_subscription_id: d.id, p_reminder_id: r.id, p_local_date: localDate,
          p_success: ok, p_error: ok ? null : errText
        });
        if (ok) result.sent++; else result.failed++;
      }
      return result;
    };

    // Limit parallel work so a busy reminder minute does not send one request
    // at a time or create an unbounded burst against push providers.
    let nextDevice = 0;
    const workers = Math.min(10, devices.length);
    await Promise.all(Array.from({ length: workers }, async () => {
      while (nextDevice < devices.length) {
        const d = devices[nextDevice++];
        const result = await processDevice(d);
        sent += result.sent;
        skipped += result.skipped;
        failed += result.failed;
      }
    }));

    if (devices.length < pageSize) break;
  }
  return json({ sent, skipped, failed, scanned });
});
