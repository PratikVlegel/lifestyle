/* Honger-score, snelkoppelingen, favorieten, boodschappenlijst en rapporten per doelgroep. */
'use strict';

/* ---------- honger en trek (1–5) ---------- */
const HUNGER_LBL = { 1: 'geen', 2: 'beetje', 3: 'normaal', 4: 'veel', 5: 'heel veel' };
function hungerRow(slot, label) {
  const v = CI.hunger && CI.hunger[slot];
  return '<div class="fld hunger"><span>' + label + ' <small class="muted">(optioneel)</small></span><div class="scale h5">' +
    [1, 2, 3, 4, 5].map(i => '<button class="' + (v === i ? 'on' : '') + '" data-act="ciHunger" data-s="' + slot + '" data-v="' + i + '">' + i + '<small>' + HUNGER_LBL[i] + '</small></button>').join('') + '</div></div>';
}
ACT.ciHunger = el => { CI.hunger = CI.hunger || {}; const v = Number(el.dataset.v); CI.hunger[el.dataset.s] = CI.hunger[el.dataset.s] === v ? undefined : v; rerenderCI(); };

/* ---------- zelfde als gisteren ---------- */
function yesterdayItems(slot) {
  const d = DB.days[addDays(CI.k, -1)];
  return d ? (d.meals || []).filter(m => m.slot === slot && !m.nothing && m.desc && !/^onbekend/.test(m.desc)) : [];
}
function copyItem(m) {
  const c = JSON.parse(JSON.stringify(m)); c.id = uid(); delete c.slot; delete c.time;
  if (c.prepId) { const p = prepById(c.prepId); if (!p || !(p.left > 0)) { delete c.prepId; delete c.portion; c.src = 'vrij'; } }
  return c;
}
ACT.ciSame = el => { const s = el.dataset.s; CI.items[s] = (CI.items[s] || []).concat(yesterdayItems(s).map(copyItem)); CI.ans[s] = undefined; rerenderCI(); };

/* ---------- vaak gegeten (favorieten) ---------- */
function frequentItems(max) {
  const cnt = new Map();
  for (const k of rangeKeys(todayKey(), 45)) {
    const d = DB.days[k]; if (!d) continue;
    for (const m of d.meals || []) {
      if (m.nothing || !m.desc || /^onbekend/.test(m.desc) || m.prepId) continue;
      const key = m.desc.toLowerCase();
      const e = cnt.get(key) || { n: 0, m, last: k }; e.n++; if (k >= e.last) { e.m = m; e.last = k; } cnt.set(key, e);
    }
  }
  return [...cnt.values()].filter(e => e.n >= 1).sort((a, b) => b.n - a.n || b.last.localeCompare(a.last)).slice(0, max || 15);
}
function favResults() {
  const list = frequentItems(15);
  if (!list.length) return '<p class="muted">Nog niets. Wat je vaak eet, verschijnt hier vanzelf.</p>';
  return list.map((e, i) => '<button class="pick wide" data-act="pickFav" data-i="' + i + '"><b>' + esc(e.m.desc) + '</b><small>' + nutrLine(e.m) + ' · ' + e.n + '× in 45 dagen</small></button>').join('');
}
ACT.pickFav = el => { const e = frequentItems(15)[Number(el.dataset.i)]; closeSheet(); PICK_CB && PICK_CB([copyItem(e.m)]); };

/* ---------- boodschappenlijst uit mealpreps ---------- */
function shopState() { DB.shop = DB.shop || { sel: {}, done: {}, extra: [] }; return DB.shop; }
function shopItems() {
  const S = shopState(), map = new Map(), loose = [];
  for (const [id, mult] of Object.entries(S.sel)) {
    const p = prepById(id); if (!p || !mult) continue;
    for (const g of p.ingredients || []) {
      if (!g.name || /^Hele prep/i.test(g.name)) continue;
      const key = g.name.trim().toLowerCase();
      if (isNum(g.grams)) { const e = map.get(key) || { name: g.name.trim(), g: 0, from: [] }; e.g += g.grams * mult; e.from.push(p.name); map.set(key, e); }
      else loose.push({ name: g.name.trim(), from: [p.name] });
    }
  }
  const items = [...map.values()].map(e => ({ key: e.name.toLowerCase(), label: e.name, amt: e.g >= 1000 ? fmtNum(e.g / 1000, 2) + ' kg' : fmtNum(e.g) + ' g', from: [...new Set(e.from)] }));
  for (const l of loose) if (!map.has(l.name.toLowerCase())) items.push({ key: l.name.toLowerCase(), label: l.name, amt: '', from: l.from });
  for (const x of S.extra) items.push({ key: 'x:' + x, label: x, amt: '', from: [] });
  return items.sort((a, b) => a.label.localeCompare(b.label, 'nl'));
}
function renderShop() {
  const S = shopState();
  let h = header('Boodschappenlijst', 'Kies wat je deze week maakt', true);
  const preps = DB.preps.slice().sort((a, b) => (b.feedback && b.feedback.again === 'ja') - (a.feedback && a.feedback.again === 'ja') || (b.date || '').localeCompare(a.date || ''));
  h += '<div class="card"><h3>Mealpreps</h3>' + preps.map(p => {
    const m = S.sel[p.id] || 0;
    return '<div class="stepper"><span>' + esc(p.name) + (p.feedback && p.feedback.again === 'ja' ? ' <small class="muted">★ favoriet</small>' : '') + '</span><button data-act="shopMult" data-id="' + p.id + '" data-d="-1">−</button><b>' + (m ? m + '×' : '–') + '</b><button data-act="shopMult" data-id="' + p.id + '" data-d="1">+</button></div>';
  }).join('') + '</div>';
  const items = shopItems();
  h += '<div class="card list"><h3>Lijst</h3>' + (items.length ? items.map(it => '<label class="check"><input type="checkbox" data-chg="shopDone" data-k="' + esc(it.key) + '"' + (S.done[it.key] ? ' checked' : '') + '><span class="n">' + esc(it.label) + (it.amt ? ' <b>' + it.amt + '</b>' : '') + '<small class="muted"> ' + esc(it.from.join(', ')) + '</small></span></label>').join('') : '<p class="muted">Kies hierboven een of meer mealpreps.</p>') +
    '<div class="inrow"><input id="shopx" placeholder="Iets anders toevoegen (bv. skyr)"><button class="btn ghost" data-act="shopAdd">+</button></div></div>';
  h += '<div class="inrow wrap"><button class="btn" data-act="shopShare">Deel lijst</button><button class="link" data-act="shopReset">Alles uitvinken</button><button class="link danger" data-act="shopClear">Lijst leegmaken</button></div>';
  view().innerHTML = h;
}
ACT.shopMult = el => { const S = shopState(); S.sel[el.dataset.id] = Math.max(0, (S.sel[el.dataset.id] || 0) + Number(el.dataset.d)); if (!S.sel[el.dataset.id]) delete S.sel[el.dataset.id]; save(); const y = scrollY; render(); scrollTo(0, y); };
ACT.shopDone = el => { const S = shopState(); if (el.checked) S.done[el.dataset.k] = true; else delete S.done[el.dataset.k]; save(); };
ACT.shopAdd = () => { const v = ($('#shopx').value || '').trim(); if (!v) return; shopState().extra.push(v); save(); render(); };
ACT.shopReset = () => { shopState().done = {}; save(); render(); };
ACT.shopClear = () => { if (!confirm('Lijst leegmaken?')) return; DB.shop = { sel: {}, done: {}, extra: [] }; save(); render(); };
ACT.shopShare = () => { const S = shopState(); shareText('Boodschappen\n' + shopItems().filter(i => !S.done[i.key]).map(i => '☐ ' + i.label + (i.amt ? ' – ' + i.amt : '')).join('\n'), 'Boodschappenlijst'); };

/* ---------- rapporten per doelgroep ---------- */
const AUDIENCES = {
  dietist: { label: 'Diëtist', parts: ['profiel', 'voeding', 'maaltijden', 'ritme', 'honger', 'preps', 'gewicht', 'drinken'] },
  psycholoog: { label: 'Psycholoog', parts: ['stemming', 'slaap', 'ritme', 'honger', 'notities', 'middelen'] },
  coach: { label: 'Sportcoach', parts: ['beweging', 'voeding', 'slaap', 'gewicht', 'energie'] },
  arts: { label: 'Huisarts', parts: ['profiel', 'slaap', 'gewicht', 'middelen', 'stemming', 'voeding'] },
  alles: { label: 'Alles', parts: ['profiel', 'voeding', 'maaltijden', 'ritme', 'honger', 'preps', 'beweging', 'slaap', 'stemming', 'energie', 'notities', 'middelen', 'gewicht', 'drinken'] }
};
let REP = { a: 'dietist', n: 14 };
function renderReport() {
  let h = '<div class="noprint">' + header('Rapport', 'Alleen wat relevant is, klaar om te printen of te delen', true);
  h += '<div class="chips">' + Object.entries(AUDIENCES).map(([k, v]) => '<button class="chip ' + (REP.a === k ? 'on' : '') + '" data-act="repA" data-a="' + k + '">' + v.label + '</button>').join('') + '</div>';
  h += '<div class="seg">' + [7, 14, 30].map(n => '<button class="' + (REP.n === n ? 'on' : '') + '" data-act="repN" data-n="' + n + '">' + n + ' dagen</button>').join('') + '</div>';
  h += '<div class="inrow wrap"><button class="btn" data-act="repPrint">Afdrukken / PDF</button><button class="btn ghost" data-act="repShare">Deel als tekst</button></div></div>';
  h += '<article class="report" id="report">' + reportHtml(REP.a, REP.n) + '</article>';
  view().innerHTML = h;
}
ACT.repA = el => { REP.a = el.dataset.a; render(); };
ACT.repN = el => { REP.n = Number(el.dataset.n); render(); };
ACT.repPrint = () => window.print();
ACT.repShare = () => shareText(document.getElementById('report').innerText, 'Rapport ' + AUDIENCES[REP.a].label);
function reportHtml(aud, n) {
  const end = completeKey(), keys = rangeKeys(end, n).filter(k => DB.days[k]);
  const P = DB.profile, G = DB.goals, A = AUDIENCES[aud];
  const avgOf = name => avg(keys.map(k => dv(name, k)).filter(isNum));
  const cntOf = name => keys.filter(k => isNum(dv(name, k))).length;
  const row = (l, v) => '<tr><td>' + esc(tr(l)) + '</td><td>' + v + '</td></tr>';
  const sec = (t, body) => body ? '<section><h3>' + esc(tr(t)) + '</h3>' + body + '</section>' : '';
  const tbl = rows => '<table>' + rows.filter(Boolean).join('') + '</table>';
  const mv = (name, extra) => { const v = avgOf(name); return isNum(v) ? fmtV(name, v) + ' <small>(' + cntOf(name) + ' d' + (extra ? ', ' + extra : '') + ')</small>' : '–'; };
  let h = '<header><h2>Rapport voor ' + esc(A.label.toLowerCase()) + '</h2><p>' + esc(P.name || '') + ' · ' + fmtDay(addDays(end, -(n - 1))) + ' – ' + fmtDay(end) + ' · ' + keys.length + ' dagen met gegevens</p><p class="small">Zelf geregistreerd. Kcal en voedingswaarden zijn ruwe schattingen; "–" = onbekend. Slaap hoort bij de nacht vóór de dag.</p></header>';
  for (const part of A.parts) {
    if (part === 'profiel') h += sec('Profiel en doelen', '<p>' + esc([P.sex === 'v' ? 'vrouw' : 'man', P.age ? P.age + ' jaar' : '', P.heightCm ? P.heightCm + ' cm' : ''].filter(Boolean).join(', ')) + '. Doelen: ' + G.kcal + ' kcal, ' + G.protein + ' g eiwit, ' + G.fiber + ' g vezels, ' + fmtNum(G.waterMl / 1000, 1) + ' l water, ' + G.stepsMin + '–' + G.stepsMax + ' stappen.</p>' + (P.notes ? '<p class="small">' + esc(P.notes) + '</p>' : ''));
    if (part === 'voeding') h += sec('Voeding (gemiddeld per volledige dag)', tbl([row('Kcal', mv('kcal')), row('Eiwit', mv('protein')), row('Vezels', mv('fiber')), row('Kcal vóór het avondeten', mv('dayKcal')), row('Kcal vanaf het avondeten', mv('eveKcal'))]));
    if (part === 'drinken') h += sec('Drinken', tbl([row('Water', mv('water')), row('Cafeïne', mv('caffeine')), row('Alcohol', mv('alcohol'))]));
    if (part === 'maaltijden') h += sec('Wat er gegeten werd', '<table class="days">' + keys.slice().reverse().map(k => { const d = DB.days[k], kc = dayNutr(d, 'kcal'); return '<tr><td><b>' + fmtDay(k, true) + '</b><br><small>' + (kc ? (kc.lb ? '≥ ' : '≈ ') + fmtNum(kc.v) + ' kcal' : 'kcal ?') + '</small></td><td>' + SLOT_ORDER.map(s => (d.meals || []).filter(m => m.slot === s).map(m => '<div><small>' + tr(SLOTS[s]) + (m.time ? ' ' + m.time : '') + ':</small> ' + (m.nothing ? tr('niets') : esc(m.desc)) + (d.hunger && isNum(d.hunger[s]) ? ' <small>(' + tr('honger') + ' ' + d.hunger[s] + '/5)</small>' : '') + '</div>').join('')).join('') + '</td></tr>'; }).join('') + '</table>');
    if (part === 'ritme') {
      const late = keys.filter(k => (DB.days[k].meals || []).some(m => m.slot === 'na' && !m.nothing)).length;
      const noLunch = keys.filter(k => (DB.days[k].meals || []).some(m => m.slot === 'lunch' && m.nothing)).length;
      h += sec('Eetritme', '<p>Gegeten na het avondeten op ' + late + ' van ' + keys.length + ' dagen; lunch overgeslagen op ' + noLunch + ' dagen.</p>');
    }
    if (part === 'honger') h += sec('Honger en trek (1–5)', tbl([row('Honger vóór het avondeten', mv('hungerDinner')), row('Trek \'s avonds', mv('hungerEve'))]));
    if (part === 'preps') { const f = DB.preps.filter(p => p.feedback); if (f.length) h += sec('Mealpreps: eigen beoordeling', '<ul>' + f.map(p => '<li>' + esc(p.name) + ': ' + esc(feedbackSummary(p.feedback)) + (p.feedback.note ? ' · "' + esc(p.feedback.note) + '"' : '') + '</li>').join('') + '</ul>'); }
    if (part === 'beweging') {
      const types = {}; keys.forEach(k => (DB.days[k].activities || []).forEach(a => { types[a.type] = (types[a.type] || 0) + a.min; }));
      h += sec('Beweging', tbl([row('Stappen', mv('steps')), row('Extra verbruik (schatting)', mv('burn')), row('Activiteiten', Object.keys(types).length ? Object.entries(types).map(([t, m]) => (ACTIVITIES[t] || ACTIVITIES.anders).label + ' ' + m + ' min').join(', ') : 'geen gelogd')]));
    }
    if (part === 'energie') h += sec('Energie', tbl([row('Energie', mv('energy'))]));
    if (part === 'slaap') {
      const cp = keys.map(k => DB.days[k].cpap).filter(Boolean);
      h += sec('Slaap', tbl([row('Slaap (nacht ervoor)', mv('sleepH')), row('Nachten < 6 u', String(keys.filter(k => isNum(dv('sleepH', k)) && dv('sleepH', k) < 6).length)), row('CPAP', cp.length ? 'hele nacht ' + cp.filter(c => /hele|ja/.test(c)).length + '×, deels ' + cp.filter(c => /deel|vanaf/.test(c)).length + '×, niet ' + cp.filter(c => c === 'nee').length + '×' : '–')]));
    }
    if (part === 'stemming') h += sec('Stemming', tbl([row('Stemming', mv('mood')), row('Dagen met stemming ≤ 5', String(keys.filter(k => isNum(dv('mood', k)) && dv('mood', k) <= 5).length))]));
    if (part === 'notities') { const ns = keys.slice().reverse().filter(k => DB.days[k].moodNote || DB.days[k].notes); if (ns.length) h += sec('Notities', '<ul>' + ns.map(k => '<li><b>' + fmtDay(k) + (isNum(DB.days[k].mood) ? ' (' + DB.days[k].mood + '/10)' : '') + ':</b> ' + esc([DB.days[k].moodNote, DB.days[k].notes].filter(Boolean).join(' · ')) + '</li>').join('') + '</ul>'); }
    if (part === 'middelen') {
      const vp = keys.map(k => DB.days[k].vape).filter(Boolean);
      h += sec('Cafeïne, alcohol, vapen', tbl([row('Cafeïne', mv('caffeine')), row('Alcohol', mv('alcohol', 'totaal ' + keys.reduce((s, k) => s + (isNum(dv('alcohol', k)) ? dv('alcohol', k) : 0), 0) + ' glazen')), row('Vapen', vp.length ? Object.entries(vp.reduce((o, v) => (o[v] = (o[v] || 0) + 1, o), {})).map(([v, c]) => v + ' ' + c + '×').join(', ') : '–')]));
    }
    if (part === 'gewicht') {
      const w = keys.map(k => ({ k, v: DB.days[k].weight })).filter(x => isNum(x.v));
      h += sec('Gewicht (vóór ontbijt)', w.length ? '<p>' + w.map(x => fmtDay(x.k) + ': ' + fmtNum(x.v, 1) + ' kg').join(' · ') + '</p><p class="small">Gemiddeld ' + fmtNum(avg(w.map(x => x.v)), 1) + ' kg over ' + w.length + ' wegingen.</p>' : '<p>Geen wegingen.</p>');
    }
  }
  return h;
}
