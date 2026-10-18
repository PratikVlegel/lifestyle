/* Gedeelde productenbibliotheek via Supabase.
   Alleen producten (etiketwaarden) gaan online. Het dagboek zelf blijft op het toestel. */
'use strict';

const AUTH_KEY = 'vd-auth';
function cloudCfg() {
  const c = window.VD_CONFIG || {};
  return { url: (DB.settings.sbUrl || c.supabaseUrl || '').replace(/\/$/, ''), key: DB.settings.sbKey || c.supabaseAnonKey || '' };
}
function cloudReady() { const c = cloudCfg(); return !!(c.url && c.key); }
function getAuth() { try { return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); } catch (e) { return null; } }
function setAuth(a) { try { a ? localStorage.setItem(AUTH_KEY, JSON.stringify(a)) : localStorage.removeItem(AUTH_KEY); } catch (e) { } }

async function freshToken() {
  const a = getAuth();
  if (!a) return null;
  if (a.expires_at && a.expires_at * 1000 > Date.now() + 60000) return a.access_token;
  const c = cloudCfg();
  const r = await fetch(c.url + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: c.key, 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: a.refresh_token }) });
  if (!r.ok) { if (r.status === 400 || r.status === 401) setAuth(null); return null; }
  const j = await r.json();
  setAuth({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), user: j.user ? { id: j.user.id, email: j.user.email } : a.user });
  return j.access_token;
}
async function sb(path, opts) {
  opts = opts || {};
  const c = cloudCfg();
  const token = opts.anon ? null : await freshToken();
  const headers = Object.assign({ apikey: c.key, 'content-type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}, opts.headers || {});
  const r = await fetch(c.url + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const txt = await r.text();
  let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { }
  if (!r.ok) { const e = new Error((j && (j.message || j.msg || j.error_description)) || ('Fout ' + r.status)); e.status = r.status; e.code = j && j.code; throw e; }
  return j;
}

/* --- anoniem account: geen e-mail of wachtwoord nodig.
   Zo kan elk toestel producten toevoegen en zijn eigen producten later aanpassen. --- */
async function ensureSession() {
  if (getAuth()) { const t = await freshToken(); if (t) return t; }
  const c = cloudCfg();
  const r = await fetch(c.url + '/auth/v1/signup', { method: 'POST', headers: { apikey: c.key, 'content-type': 'application/json' }, body: JSON.stringify({ data: {} }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(j.msg || j.message || ('Aanmelden mislukt (' + r.status + ')'));
  setAuth({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), user: { id: j.user.id } });
  return j.access_token;
}
function cloudUser() { const a = getAuth(); return a && a.user; }

/* --- omzetten --- */
function rowToFood(row) {
  const uid = (cloudUser() || {}).id;
  return { id: 's_' + row.id, rid: row.id, name: row.name, brand: row.brand || '', barcode: row.barcode || '', units: Array.isArray(row.units) ? row.units : [],
    per: { kcal: num(row.kcal), protein: num(row.protein), carbs: num(row.carbs), fat: num(row.fat), fiber: num(row.fiber) },
    source: row.source || 'gedeeld', own: !!uid && row.created_by === uid, updated: row.updated_at };
}
function foodToRow(f) {
  const r = { name: String(f.name || '').slice(0, 200), brand: f.brand ? String(f.brand).slice(0, 120) : null, barcode: /^[0-9]{6,14}$/.test(f.barcode || '') ? f.barcode : null, units: f.units || [], source: f.source || 'app' };
  for (const n of ['kcal', 'protein', 'carbs', 'fat', 'fiber']) { const v = f.per && f.per[n]; r[n] = isNum(v) ? v : null; }
  return r;
}
function num(v) { return v === null || v === undefined || v === '' ? null : Number(v); }
function shareable(f) { return f && f.name && f.per && isNum(f.per.kcal) && !/^Hele prep/i.test(f.name); }

/* --- synchronisatie --- */
let SYNCING = false;
async function cloudSync(quiet) {
  if (!cloudReady() || !navigator.onLine || SYNCING) return;
  SYNCING = true;
  try {
    if (DB.settings.share !== false) {
      await ensureSession();
      for (const f of DB.foods.filter(f => (f.dirty || !f.rid) && shareable(f))) {
        try { await pushFood(f); } catch (e) { console.warn('push', f.name, e.message); }
      }
    }
    const since = DB.settings.libSync || '1970-01-01T00:00:00Z';
    let rows = [], page = 0;
    while (true) {
      const part = await sb('/rest/v1/foods?select=*&updated_at=gt.' + encodeURIComponent(since) + '&order=updated_at.asc&limit=1000&offset=' + page * 1000, {});
      rows = rows.concat(part); if (part.length < 1000) break; page++;
    }
    for (const row of rows) mergeRemote(row);
    if (rows.length) DB.settings.libSync = rows[rows.length - 1].updated_at;
    DB.settings.libSyncAt = new Date().toISOString();
    save();
    if (!quiet && rows.length) toast(rows.length + ' product' + (rows.length > 1 ? 'en' : '') + ' bijgewerkt uit de gedeelde bibliotheek');
    if (/^#\/bieb/.test(location.hash)) render();
  } catch (e) { console.warn('sync', e); if (!quiet) toast('Synchroniseren mislukt: ' + e.message); }
  SYNCING = false;
}
function mergeRemote(row) {
  if ((DB.settings.hidden || []).includes(row.id)) return;
  const rf = rowToFood(row);
  let local = DB.foods.find(f => f.rid === row.id) || (row.barcode && DB.foods.find(f => !f.rid && f.barcode === row.barcode));
  if (local) {
    if (local.dirty && local.own !== false) return; // eigen lokale wijziging wint, wordt zo gepusht
    const keepId = local.id, keepUnits = local.units;
    Object.assign(local, rf, { id: keepId });
    if ((!rf.units || !rf.units.length) && keepUnits) local.units = keepUnits;
  } else DB.foods.push(rf);
}
async function pushFood(f) {
  if (DB.settings.share === false || !shareable(f)) return;
  await ensureSession();
  const row = foodToRow(f);
  if (f.rid && f.own) {
    const r = await sb('/rest/v1/foods?id=eq.' + f.rid, { method: 'PATCH', body: row, headers: { Prefer: 'return=representation' } });
    if (r && r[0]) f.updated = r[0].updated_at;
  } else if (!f.rid) {
    try {
      const r = await sb('/rest/v1/foods', { method: 'POST', body: row, headers: { Prefer: 'return=representation' } });
      f.rid = r[0].id; f.own = true; f.updated = r[0].updated_at;
    } catch (e) {
      if (e.status === 409 && row.barcode) { // barcode bestaat al: koppel aan het bestaande product
        const ex = await sb('/rest/v1/foods?select=*&barcode=eq.' + row.barcode);
        if (ex && ex[0]) { const keep = f.id; Object.assign(f, rowToFood(ex[0]), { id: keep }); }
      } else throw e;
    }
  }
  delete f.dirty;
  save();
}
async function deleteRemote(f) {
  if (f.rid && f.own && getAuth()) await sb('/rest/v1/foods?id=eq.' + f.rid, { method: 'DELETE' });
}
async function cloudBarcode(code) {
  if (!cloudReady() || !navigator.onLine) return null;
  try { const r = await sb('/rest/v1/foods?select=*&barcode=eq.' + encodeURIComponent(code), {}); return r && r[0] ? rowToFood(r[0]) : null; }
  catch (e) { return null; }
}
