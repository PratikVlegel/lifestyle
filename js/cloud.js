/* Gedeelde producten, mealprep-recepten, beoordelingen en foto's via Supabase.
   Het dagboek zelf blijft lokaal; AI-acties sturen de nodige invoer naar Anthropic. */
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

/* --- synchronisatie ---
   Een product is "hetzelfde" bij dezelfde naam, hetzelfde merk en dezelfde kcal.
   Zo komt een product nooit dubbel in de bibliotheek, ook niet als je het dagboek
   opnieuw importeert of de app op een ander toestel gebruikt. */
function foodKey(f) {
  const kcal = f.per ? f.per.kcal : f.kcal;
  return String(f.name || '').trim().toLowerCase() + '|' + String(f.brand || '').trim().toLowerCase() + '|' + (isNum(Number(kcal)) && kcal !== null ? Number(kcal) : '');
}
async function fetchAllRemote() {
  let rows = [], page = 0;
  while (true) {
    const part = await sb('/rest/v1/foods?select=*&order=created_at.asc&limit=1000&offset=' + page * 1000, {});
    rows = rows.concat(part); if (part.length < 1000) break; page++;
  }
  return rows;
}
let SYNCING = false;
async function cloudSync(quiet) {
  if (!cloudReady() || !navigator.onLine || SYNCING || !DB.settings.member) return;
  SYNCING = true;
  try {
    const sharing = DB.settings.share !== false;
    if (sharing) await ensureSession();
    let rows = await fetchAllRemote();
    const before = DB.foods.length;
    reconcile(rows);
    if (sharing) {
      const byKey = new Map(rows.map(r => [foodKey(r), r]));
      for (const f of DB.foods.filter(f => shareable(f) && (!f.rid || (f.dirty && f.own)))) {
        try { await pushFood(f, byKey); } catch (e) { console.warn('push', f.name, e.message); }
      }
      rows = await fetchAllRemote();
      reconcile(rows);
    }
    DB.settings.libSyncAt = new Date().toISOString();
    save();
    const added = DB.foods.length - before;
    if (!quiet && added > 0) toast(added + ' nieuwe product' + (added > 1 ? 'en' : '') + ' uit de gedeelde bibliotheek');
    if (/^#\/(bieb|preps)/.test(location.hash)) render();
  } catch (e) { console.warn('sync', e); if (!quiet) toast('Synchroniseren mislukt: ' + e.message); }
  SYNCING = false;
}
/* Lokale bibliotheek gelijkzetten met de gedeelde: koppelen, bijwerken, ontdubbelen. */
function reconcile(rows) {
  const ids = new Set(rows.map(r => r.id));
  for (const f of DB.foods) if (f.rid && !ids.has(f.rid)) { delete f.rid; f.own = false; f.dirty = true; } // verwijderd of opgeruimd
  for (const row of rows) mergeRemote(row);
  dedupeLocal();
}
function mergeRemote(row) {
  if ((DB.settings.hidden || []).includes(row.id)) return;
  const rf = rowToFood(row), key = foodKey(rf);
  const local = DB.foods.find(f => f.rid === row.id)
    || (row.barcode && DB.foods.find(f => !f.rid && f.barcode === row.barcode))
    || DB.foods.find(f => !f.rid && foodKey(f) === key);
  if (local) {
    if (local.rid === row.id && local.dirty && local.own) return; // eigen lokale wijziging wint, wordt zo gepusht
    const keep = { id: local.id, units: local.units, used: local.used, lastG: local.lastG };
    Object.assign(local, rf, { id: keep.id, used: keep.used, lastG: keep.lastG });
    local.units = mergeUnits(rf.units, keep.units);
    delete local.dirty;
  } else DB.foods.push(rf);
}
function mergeUnits(a, b) {
  const out = (a || []).slice();
  for (const u of b || []) if (!out.some(x => String(x.n).toLowerCase() === String(u.n).toLowerCase())) out.push(u);
  return out;
}
/* Dubbele producten samenvoegen; verwijzingen in recepten en maaltijden blijven kloppen. */
function dedupeLocal() {
  const groups = new Map();
  for (const f of DB.foods) {
    const k = f.rid ? 'r:' + f.rid : 'k:' + foodKey(f);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  // ook producten zonder rid samenvoegen met een gedeeld product met dezelfde sleutel
  const byKey = new Map();
  for (const f of DB.foods) { const k = foodKey(f); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(f); }
  const remap = new Map(), drop = new Set();
  const merge = list => {
    if (list.length < 2) return;
    const keep = list.slice().sort((x, y) => (!!y.rid - !!x.rid) || (!!y.own - !!x.own) || ((y.used || 0) - (x.used || 0)))[0];
    for (const f of list) if (f !== keep && !drop.has(f.id)) {
      keep.units = mergeUnits(keep.units, f.units);
      keep.used = (keep.used || 0) + (f.used || 0);
      if (!keep.barcode && f.barcode) keep.barcode = f.barcode;
      remap.set(f.id, keep.id); drop.add(f.id);
    }
  };
  for (const list of groups.values()) merge(list);
  for (const list of byKey.values()) {
    const rids = new Set(list.filter(f => f.rid && !drop.has(f.id)).map(f => f.rid));
    if (rids.size <= 1) merge(list.filter(f => !drop.has(f.id)));
  }
  if (!drop.size) return 0;
  DB.foods = DB.foods.filter(f => !drop.has(f.id));
  for (const p of DB.preps) for (const g of p.ingredients || []) if (g.foodId && remap.has(g.foodId)) g.foodId = remap.get(g.foodId);
  for (const d of Object.values(DB.days)) for (const m of d.meals || []) if (m.foodId && remap.has(m.foodId)) m.foodId = remap.get(m.foodId);
  return drop.size;
}
async function pushFood(f, byKey) {
  if (DB.settings.share === false || !shareable(f)) return;
  await ensureSession();
  const row = foodToRow(f);
  const link = r => { const keep = { id: f.id, units: f.units, used: f.used, lastG: f.lastG }; Object.assign(f, rowToFood(r), { id: keep.id, used: keep.used, lastG: keep.lastG }); f.units = mergeUnits(f.units, keep.units); };
  if (f.rid && f.own) {
    try {
      const r = await sb('/rest/v1/foods?id=eq.' + f.rid, { method: 'PATCH', body: row, headers: { Prefer: 'return=representation' } });
      if (r && r[0]) f.updated = r[0].updated_at;
    } catch (e) { if (e.status !== 409) throw e; } // zou een dubbel maken: lokaal houden
  } else if (!f.rid) {
    const known = byKey && byKey.get(foodKey(f));
    if (known) link(known);
    else {
      try {
        const r = await sb('/rest/v1/foods', { method: 'POST', body: row, headers: { Prefer: 'return=representation' } });
        f.rid = r[0].id; f.own = true; f.updated = r[0].updated_at;
      } catch (e) {
        if (e.status !== 409) throw e;
        const all = await fetchAllRemote(); // bestaat al (zelfde barcode of naam/merk/kcal): koppelen
        const ex = all.find(r => (row.barcode && r.barcode === row.barcode) || foodKey(r) === foodKey(f));
        if (ex) link(ex); else throw e;
      }
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
