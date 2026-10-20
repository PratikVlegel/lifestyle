/* Honger-score, snelkoppelingen, favorieten, boodschappenlijst en rapporten per doelgroep. */
'use strict';

/* ---------- honger en trek (1–5) ---------- */
const HUNGER_LBL = { 1: 'geen', 2: 'beetje', 3: 'normaal', 4: 'veel', 5: 'heel veel' };
function hungerRow(slot, label) {
  const v = CI.hunger && CI.hunger[slot];
  return '<div class="fld hunger"><span>' + tr(label) + ' <small class="muted">(' + tr('optioneel') + ')</small></span><div class="scale h5">' +
    [1, 2, 3, 4, 5].map(i => '<button class="' + (v === i ? 'on' : '') + '" data-act="ciHunger" data-s="' + slot + '" data-v="' + i + '">' + i + '<small>' + tr(HUNGER_LBL[i]) + '</small></button>').join('') + '</div></div>';
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
  if (!list.length) return '<p class="muted">' + tr('Nog niets. Wat je vaak eet, verschijnt hier vanzelf.') + '</p>';
  return list.map((e, i) => '<button class="pick wide" data-act="pickFav" data-i="' + i + '"><b>' + esc(e.m.desc) + '</b><small>' + nutrLine(e.m) + ' · ' + trf('In 45 dagen: {count} keer', { count: e.n }) + '</small></button>').join('');
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
  return items.sort((a, b) => a.label.localeCompare(b.label, currentLocale()));
}
function renderShop() {
  const S = shopState();
  let h = header('Boodschappenlijst', 'Kies wat je deze week maakt', true);
  const preps = DB.preps.slice().sort((a, b) => (b.feedback && b.feedback.again === 'ja') - (a.feedback && a.feedback.again === 'ja') || (b.date || '').localeCompare(a.date || ''));
  h += '<div class="card"><h3>' + tr('Mealpreps') + '</h3>' + preps.map(p => {
    const m = S.sel[p.id] || 0;
    return '<div class="stepper"><span>' + esc(p.name) + (p.feedback && p.feedback.again === 'ja' ? ' <small class="muted">★ ' + tr('favoriet') + '</small>' : '') + '</span><button data-act="shopMult" data-id="' + p.id + '" data-d="-1">−</button><b>' + (m ? m + '×' : '–') + '</b><button data-act="shopMult" data-id="' + p.id + '" data-d="1">+</button></div>';
  }).join('') + '</div>';
  const items = shopItems();
  h += '<div class="card list"><h3>' + tr('Lijst') + '</h3>' + (items.length ? items.map(it => '<label class="check"><input type="checkbox" data-chg="shopDone" data-k="' + esc(it.key) + '"' + (S.done[it.key] ? ' checked' : '') + '><span class="n">' + esc(it.label) + (it.amt ? ' <b>' + it.amt + '</b>' : '') + '<small class="muted"> ' + esc(it.from.join(', ')) + '</small></span></label>').join('') : '<p class="muted">' + tr('Kies hierboven een of meer mealpreps.') + '</p>') +
    '<div class="inrow"><input id="shopx" placeholder="' + esc(tr('Iets anders toevoegen (bv. skyr)')) + '"><button class="btn ghost" data-act="shopAdd" aria-label="' + esc(tr('Toevoegen')) + '">+</button></div></div>';
  h += '<div class="inrow wrap"><button class="btn" data-act="shopShare">' + tr('Deel lijst') + '</button><button class="link" data-act="shopReset">' + tr('Alles uitvinken') + '</button><button class="link danger" data-act="shopClear">' + tr('Lijst leegmaken') + '</button></div>';
  view().innerHTML = h;
}
ACT.shopMult = el => { const S = shopState(); S.sel[el.dataset.id] = Math.max(0, (S.sel[el.dataset.id] || 0) + Number(el.dataset.d)); if (!S.sel[el.dataset.id]) delete S.sel[el.dataset.id]; save(); const y = scrollY; render(); scrollTo(0, y); };
ACT.shopDone = el => { const S = shopState(); if (el.checked) S.done[el.dataset.k] = true; else delete S.done[el.dataset.k]; save(); };
ACT.shopAdd = () => { const v = ($('#shopx').value || '').trim(); if (!v) return; shopState().extra.push(v); save(); render(); };
ACT.shopReset = () => { shopState().done = {}; save(); render(); };
ACT.shopClear = () => { if (!confirm(tr('Lijst leegmaken?'))) return; DB.shop = { sel: {}, done: {}, extra: [] }; save(); render(); };
ACT.shopShare = () => { const S = shopState(); shareText(tr('Boodschappen') + '\n' + shopItems().filter(i => !S.done[i.key]).map(i => '☐ ' + i.label + (i.amt ? ' – ' + i.amt : '')).join('\n'), tr('Boodschappenlijst')); };

/* ---------- rapporten per doelgroep ---------- */
const AUDIENCES = {
  dietist: { label: 'Diëtist', parts: ['profiel', 'voeding', 'maaltijden', 'ritme', 'honger', 'preps', 'gewicht', 'drinken', 'supplementen'] },
  psycholoog: { label: 'Psycholoog', parts: ['stemming', 'slaap', 'ritme', 'honger', 'middelen', 'supplementen', 'notities'] },
  coach: { label: 'Sportcoach', parts: ['beweging', 'voeding', 'slaap', 'gewicht', 'energie', 'supplementen'] },
  arts: { label: 'Huisarts', parts: ['profiel', 'slaap', 'gewicht', 'middelen', 'stemming', 'voeding', 'supplementen'] },
  alles: { label: 'Alles', parts: ['profiel', 'voeding', 'maaltijden', 'ritme', 'honger', 'preps', 'beweging', 'slaap', 'stemming', 'energie', 'notities', 'middelen', 'gewicht', 'drinken', 'supplementen'] }
};
const REPORT_NICOTINE_FORMS = {
  cigarette: 'Sigaretten', vape: 'Vape', nicotineGum: 'Nicotinekauwgom', nicotinePouch: 'Nicotinezakjes of snus',
  nicotinePatch: 'Nicotinepleister', heatedTobacco: 'Verhitte tabak', otherNicotine: 'Andere nicotinevorm'
};
const REPORT_OLD_VAPE = { 'niet': 'niet', 'paar keer': 'paar keer', 'om de 3 u': 'om de 3 u', 'om de 2 u': 'om de 2 u', 'elk uur': 'elk uur' };
function reportCount(count, singular, plural) {
  return trf(count === 1 ? singular : plural, { count });
}
function alcoholReport(dateKeys) {
  const values = dateKeys.map(k => DB.days[k]?.alcohol).filter(v => isNum(v) && v >= 0);
  if (!values.length) return tr('No alcohol entries were recorded in this period; missing entries are unknown.');
  const zero = values.filter(v => v === 0).length;
  return esc(trf('Days with an alcohol entry: {logged}. Average per recorded day: {average} glasses. Entries explicitly marked zero: {zero}. Days unknown or unrecorded: {unknown}.', {
    logged: values.length, average: fmtNum(values.reduce((sum, value) => sum + value, 0) / values.length, 1), zero, unknown: dateKeys.length - values.length
  }));
}
function nicotineReport(dateKeys) {
  const formCounts = {}, oldVapeCounts = {}, labels = REPORT_NICOTINE_FORMS;
  let usedDays = 0, noUseDays = 0, knownDays = 0;
  for (const k of dateKeys) {
    const d = DB.days[k]; if (!d) continue;
    if (Object.hasOwn(d, 'nicotineForms')) {
      if (!Array.isArray(d.nicotineForms)) continue;
      knownDays++;
      if (d.nicotineForms.length) usedDays++; else noUseDays++;
      for (const form of d.nicotineForms) if (labels[form]) formCounts[form] = (formCounts[form] || 0) + 1;
      continue;
    }
    if (!Object.hasOwn(REPORT_OLD_VAPE, d.vape)) continue;
    knownDays++;
    oldVapeCounts[d.vape] = (oldVapeCounts[d.vape] || 0) + 1;
    if (d.vape === 'niet') noUseDays++;
    else { usedDays++; formCounts.vape = (formCounts.vape || 0) + 1; }
  }
  const unknown = dateKeys.length - knownDays;
  const summary = esc(trf('Days with one or more nicotine forms: {used}. Days explicitly marked no nicotine: {none}. Days unknown or unrecorded: {unknown} of {total}.', { used: usedDays, none: noUseDays, unknown, total: dateKeys.length }));
  const forms = Object.entries(formCounts).map(([key, count]) => '<li>' + esc(tr(labels[key])) + ': ' + esc(reportCount(count, '{count} day', '{count} days')) + '</li>').join('');
  const oldScale = Object.entries(oldVapeCounts).map(([value, count]) => '<li>' + esc(tr(value)) + ': ' + esc(reportCount(count, '{count} day', '{count} days')) + '</li>').join('');
  return '<p>' + summary + '</p>' + (forms ? '<p>' + tr('Recorded nicotine forms (a day can include more than one):') + '</p><ul>' + forms + '</ul>' : '') +
    (oldScale ? '<p>' + tr('Older vaping frequency entries (days):') + '</p><ul>' + oldScale + '</ul><p class="small">' + tr('These older options are rough frequency descriptions, not a count of puffs or a nicotine dose. Current nicotine entries record the form, not the amount used.') + '</p>' : '');
}
function reportMoodMedian(values) {
  const sorted = values.slice().sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function reportSubstanceMood(dateKeys) {
  if (!DB.settings.moodInsights) return '<p class="muted small">' + tr('Mood comparisons are off. Enable them in Mood and habits if you want this report to compare substances with mood.') + '</p>';
  const comparisons = [
    { label: 'alcohol', get: d => isNum(d.alcohol) && d.alcohol >= 0 ? d.alcohol > 0 : null },
    { label: 'nicotine', get: d => Object.hasOwn(d, 'nicotineForms') ? Array.isArray(d.nicotineForms) ? d.nicotineForms.length > 0 : null : Object.hasOwn(REPORT_OLD_VAPE, d.vape) ? d.vape !== 'niet' : null }
  ];
  const rows = comparisons.map(({ label, get }) => {
    const yes = [], no = [];
    for (const key of dateKeys) {
      const d = DB.days[key]; if (!d || !isValidDailyRating(d.mood)) continue;
      const present = get(d); if (present === true) yes.push(d.mood); else if (present === false) no.push(d.mood);
    }
    if (yes.length < 5 || no.length < 5) return '<p class="muted small">' + esc(trf('{label}: not enough mood-scored days for a comparison (at least 5 in each group are needed).', { label: tr(label) })) + '</p>';
    return '<p>' + esc(trf('Median mood was {withMood}/10 on days with {label} logged ({withDays} days) and {withoutMood}/10 on days with none logged ({withoutDays} days). This describes co-occurrence, not cause.', {
      withMood: fmtNum(reportMoodMedian(yes), 1), label: tr(label), withDays: yes.length, withoutMood: fmtNum(reportMoodMedian(no), 1), withoutDays: no.length
    })) + '</p>';
  }).join('');
  return '<p class="muted small">' + tr('These optional comparisons use only days with both a mood score and a known substance entry. Missing entries are excluded; a pattern does not show cause or effect.') + '</p>' + rows;
}
function supplementReport(dateKeys) {
  const logged = dateKeys.filter(k => DB.days[k] && DB.days[k].supplementsLogged === true);
  const noUse = logged.filter(k => !(DB.days[k].supplements || []).length).length;
  const unknown = dateKeys.length - logged.length, products = new Map();
  for (const k of logged) for (const s of DB.days[k].supplements || []) {
    const id = s.name.trim().toLocaleLowerCase('nl-BE'); if (!id) continue;
    if (!products.has(id)) products.set(id, { name: s.name.trim(), dates: new Set(), doses: new Set() });
    const p = products.get(id); p.dates.add(k); if (s.dose) p.doses.add(s.dose);
  }
  const entries = [...products.values()].map(p => '<li><b>' + esc(p.name) + '</b> · ' + esc(reportCount(p.dates.size, '{count} logged day', '{count} logged days')) + (p.doses.size ? ' · ' + esc(tr('Recorded dose(s):')) + ' ' + [...p.doses].map(esc).join(', ') : '') + '</li>').join('');
  return '<p>' + esc(trf('Supplement logs: {logged} of {total} days. Explicitly marked no use: {none}. Unknown or unrecorded: {unknown}.', { logged: logged.length, total: dateKeys.length, none: noUse, unknown })) + '</p>' + (entries ? '<ul>' + entries + '</ul>' : '') + '<p class="small muted">' + tr('Self-reported product names and label doses; this report does not assess whether use or dose is appropriate.') + '</p>';
}
let REP = { a: 'dietist', n: 14 };
function renderReport() {
  let h = '<div class="noprint">' + header('Rapport', 'Alleen wat relevant is, klaar om te printen of te delen', true);
  h += '<div class="chips">' + Object.entries(AUDIENCES).map(([k, v]) => '<button class="chip ' + (REP.a === k ? 'on' : '') + '" data-act="repA" data-a="' + k + '">' + tr(v.label) + '</button>').join('') + '</div>';
  h += '<div class="seg">' + [7, 14, 30].map(n => '<button class="' + (REP.n === n ? 'on' : '') + '" data-act="repN" data-n="' + n + '">' + trf('{count} days', { count: n }) + '</button>').join('') + '</div>';
  h += '<div class="inrow wrap"><button class="btn" data-act="repPrint">' + tr('Afdrukken / PDF') + '</button><button class="btn ghost" data-act="repShare">' + tr('Deel als tekst') + '</button></div><p class="muted small report-disclosure">' + tr('Review this report before sharing or printing. It includes only the selected sections and period, and may contain personal details, weight, mood, substance use and free-text notes. Nothing is shared until you choose Share.') + '</p></div>';
  h += '<article class="report" id="report">' + reportHtml(REP.a, REP.n) + '</article>';
  view().innerHTML = h;
}
ACT.repA = el => { REP.a = el.dataset.a; render(); };
ACT.repN = el => { REP.n = Number(el.dataset.n); render(); };
ACT.repPrint = () => window.print();
ACT.repShare = () => shareText(document.getElementById('report').innerText, trf('Report for {audience}', { audience: tr(AUDIENCES[REP.a].label) }));
function reportHtml(aud, n) {
  const end = completeKey(), periodKeys = rangeKeys(end, n), keys = periodKeys.filter(k => DB.days[k]);
  const P = DB.profile, G = DB.goals, A = AUDIENCES[aud];
  const reportSlotKcal = (key, name) => {
    const d = DB.days[key];
    if (!d || d.kcalOverride) return null;
    const slots = name === 'dayKcal' ? ['ontbijt', 'tussen1', 'lunch', 'tussen2'] : ['avond', 'na'];
    const values = (d.meals || []).filter(m => slots.includes(m.slot) && !m.nothing && isNum(m.kcal) && !(Array.isArray(m.lb) && m.lb.includes('kcal'))).map(m => m.kcal);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  const valueOnDay = (name, key) => ['dayKcal', 'eveKcal'].includes(name) ? reportSlotKcal(key, name) : dv(name, key);
  const avgOf = name => avg(keys.map(k => valueOnDay(name, k)).filter(isNum));
  const cntOf = name => keys.filter(k => isNum(valueOnDay(name, k))).length;
  const reportValue = (name, value) => {
    const D = DVARS[name];
    const unit = D.u === 'u' ? tr('hours') : D.u === 'glazen' ? tr('glasses') : D.u === 'shots' ? tr('servings') : D.u;
    return fmtNum(value, D.d) + (unit ? ' ' + unit : '');
  };
  const row = (l, v) => '<tr><th scope="row">' + esc(tr(l)) + '</th><td>' + v + '</td></tr>';
  const sec = (t, body) => body ? '<section><h3>' + esc(tr(t)) + '</h3>' + body + '</section>' : '';
  const tbl = rows => '<table>' + rows.filter(Boolean).join('') + '</table>';
  const mv = (name, extra) => { const v = avgOf(name); return isNum(v) ? reportValue(name, v) + ' <small>(' + reportCount(cntOf(name), '{count} logged day', '{count} logged days') + (extra ? ', ' + extra : '') + ')</small>' : '–'; };
  let h = '<header><h2>' + esc(trf('Report for {audience}', { audience: tr(A.label).toLocaleLowerCase(currentLocale()) })) + '</h2><p>' + esc(P.name || '') + ' · ' + fmtDay(periodKeys[0]) + ' – ' + fmtDay(end) + ' · ' + reportCount(keys.length, '{count} day with data', '{count} days with data') + '</p><p class="small">' + tr('Self-reported. Calories and nutrition values are rough estimates; “–” means unknown. Sleep refers to the night before that day.') + (A.parts.includes('stemming') ? ' ' + tr('Mood scores are daily self-reflections, not a validated psychological assessment.') : '') + '</p></header>';
  for (const part of A.parts) {
    if (part === 'profiel') {
      const profileSummary = [P.sex === 'v' ? tr('vrouw') : P.sex === 'm' ? tr('man') : '', P.age ? trf('{count} years', { count: P.age }) : '', P.heightCm ? P.heightCm + ' cm' : ''].filter(Boolean).join(', ');
      h += sec('Profiel en doelen', '<p>' + (profileSummary ? esc(profileSummary) + '. ' : '') + esc(trf('Goals: {kcal} kcal, {protein} g protein, {fiber} g fibre, {water} l water, {stepsMin}–{stepsMax} steps.', { kcal: G.kcal, protein: G.protein, fiber: G.fiber, water: fmtNum(G.waterMl / 1000, 1), stepsMin: G.stepsMin, stepsMax: G.stepsMax })) + '</p>' + (P.notes ? '<div class="report-context"><b>' + tr('Your context note') + '</b><p>' + esc(P.notes) + '</p></div>' : ''));
    }
    if (part === 'voeding') h += sec('Voeding (gemiddeld op dagen met berekenbare waarden)', '<p class="small muted">' + tr('Averages use only days with a calculable value; incomplete entries may be missing. Estimated values are not a clinical nutrition assessment.') + '</p>' + tbl([row('Kcal', mv('kcal')), row('Eiwit', mv('protein')), row('Koolhydraten', mv('carbs')), row('Vet', mv('fat')), row('Vezels', mv('fiber')), row('Kcal uit geregistreerde maaltijden vóór het avondeten', mv('dayKcal')), row('Kcal uit geregistreerde maaltijden vanaf het avondeten', mv('eveKcal'))]));
    if (part === 'drinken') h += sec('Drinken', '<p class="small muted">' + tr('Coffee servings and glasses are self-reported; serving size can vary. Missing entries are not counted as zero.') + '</p>' + tbl([row('Water', mv('water')), row('Koffie (porties)', mv('caffeine')), row('Alcohol', alcoholReport(periodKeys))]));
    if (part === 'maaltijden') {
      const mealDays = keys.slice().reverse().filter(k => (DB.days[k].meals || []).length);
      const mealCards = mealDays.map(k => {
        const d = DB.days[k], kc = dayNutr(d, 'kcal');
        const meals = SLOT_ORDER.map(s => (d.meals || []).filter(m => m.slot === s).map(m => '<div class="report-meal"><b>' + esc(tr(SLOTS[s]) + (m.time ? ' · ' + m.time : '')) + '</b><p>' + (m.nothing ? esc(tr('niets')) : esc(m.desc)) + '</p>' + (d.hunger && isNum(d.hunger[s]) ? '<small>' + esc(tr('honger')) + ' ' + d.hunger[s] + '/5</small>' : '') + '</div>').join('')).join('');
        return '<article class="report-day"><div class="report-dayhead"><b>' + fmtDay(k, true) + '</b><span>' + (kc ? (kc.lb ? '≥ ' : '≈ ') + fmtNum(kc.v) + ' kcal' : tr('kcal ?')) + '</span></div>' + meals + '</article>';
      }).join('');
      h += sec('Wat er gegeten werd', '<p class="small muted">' + tr('Only recorded meals are shown. An unlisted meal or day is unknown, not proof that nothing was eaten.') + '</p>' + (mealCards ? '<div class="report-days">' + mealCards + '</div>' : '<p>' + tr('No meal entries were recorded in this period.') + '</p>') + '<p class="small muted">' + reportCount(mealDays.length, '{count} day with meal entries', '{count} days with meal entries') + '</p>');
    }
    if (part === 'ritme') {
      const mealKeys = keys.filter(k => (DB.days[k].meals || []).length);
      const late = mealKeys.filter(k => (DB.days[k].meals || []).some(m => m.slot === 'na' && !m.nothing)).length;
      const noLunch = mealKeys.filter(k => (DB.days[k].meals || []).some(m => m.slot === 'lunch' && m.nothing)).length;
      if (mealKeys.length) h += sec('Eetritme', '<p>' + esc(trf('Food was logged after dinner on {late} of {days} days with meal entries; lunch was explicitly marked as skipped on {lunch} of those days.', { late, days: mealKeys.length, lunch: noLunch })) + '</p>');
    }
    if (part === 'honger') h += sec('Honger en trek (1–5)', tbl([row('Honger vóór het avondeten', mv('hungerDinner')), row('Trek \'s avonds', mv('hungerEve'))]));
    if (part === 'preps') {
      const f = DB.preps.filter(p => p.feedback && p.date && periodKeys.includes(p.date));
      if (f.length) h += sec('Mealpreps: eigen beoordeling', '<p class="small muted">' + tr('Feedback is linked to the meal prep; the date it was eaten is not recorded.') + '</p><ul>' + f.map(p => '<li><b>' + esc(p.name) + '</b> · ' + fmtDay(p.date) + ': ' + esc(feedbackSummary(p.feedback)) + (p.feedback.note ? ' · "' + esc(p.feedback.note) + '"' : '') + '</li>').join('') + '</ul>');
    }
    if (part === 'beweging') {
      const types = {}; keys.forEach(k => (DB.days[k].activities || []).forEach(a => { const item = types[a.type] || (types[a.type] = { minutes: 0, sessions: 0, timedSessions: 0 }); if (isNum(a.min)) { item.minutes += a.min; item.timedSessions++; } item.sessions++; }));
      const activitySummary = Object.keys(types).length
        ? Object.entries(types).map(([t, v]) => esc(tr((ACTIVITIES[t] || ACTIVITIES.anders).label)) + ': ' + (v.timedSessions ? reportCount(v.timedSessions, '{minutes} min recorded across {count} session', '{minutes} min recorded across {count} sessions').replace('{minutes}', fmtNum(v.minutes)) + (v.timedSessions < v.sessions ? ' · ' + reportCount(v.sessions - v.timedSessions, 'duration missing for {count} session', 'duration missing for {count} sessions') : '') : reportCount(v.sessions, '{count} session; duration not recorded', '{count} sessions; duration not recorded'))).join('; ')
        : esc(tr('geen gelogd'));
      h += sec('Beweging', '<p class="small muted">' + tr('Activity minutes are totals for this period, based on recorded sessions only.') + '</p>' + tbl([
        row('Stappen', mv('steps')),
        row('Extra verbruik (schatting)', mv('burn')),
        row('Activiteiten', activitySummary)
      ]));
    }
    if (part === 'energie') h += sec('Energie', tbl([row('Energie', mv('energy'))]));
    if (part === 'slaap') {
      const cp = keys.map(k => DB.days[k].cpap).filter(Boolean);
      const full = cp.filter(c => /hele|ja/.test(c)).length, partial = cp.filter(c => /deel|vanaf/.test(c)).length, no = cp.filter(c => c === 'nee').length;
      h += sec('Slaap', tbl([row('Slaap (nacht ervoor)', mv('sleepH')), row('Nachten < 6 u', trf('{count} of {total} recorded nights', { count: keys.filter(k => isNum(dv('sleepH', k)) && dv('sleepH', k) < 6).length, total: cntOf('sleepH') })), row('CPAP', cp.length ? trf('CPAP nights: {count}. Full night: {full}; part night: {partial}; none: {no}; other: {unknown}.', { count: cp.length, full, partial, no, unknown: cp.length - full - partial - no }) : '–')]));
    }
    if (part === 'stemming') h += sec('Stemming', tbl([row('Stemming', mv('mood')), row('Dagen met stemming ≤ 5', trf('{count} of {total} mood-scored days', { count: keys.filter(k => isValidDailyRating(dv('mood', k)) && dv('mood', k) <= 5).length, total: cntOf('mood') }))]));
    if (part === 'notities') { const ns = keys.slice().reverse().filter(k => DB.days[k].moodNote || DB.days[k].notes); if (ns.length) h += sec('Notities', '<ul>' + ns.map(k => '<li><b>' + fmtDay(k) + (isValidDailyRating(DB.days[k].mood) ? ' (' + DB.days[k].mood + '/10)' : '') + ':</b> ' + esc([DB.days[k].moodNote, DB.days[k].notes].filter(Boolean).join(' · ')) + '</li>').join('') + '</ul>'); }
    if (part === 'middelen') h += sec('Geregistreerd gebruik', '<div class="report-subsection"><h4>' + tr('Alcohol') + '</h4><p>' + alcoholReport(periodKeys) + '</p></div><div class="report-subsection"><h4>' + tr('Nicotine') + '</h4>' + nicotineReport(periodKeys) + '</div>' + (aud === 'psycholoog' ? '<div class="report-subsection"><h4>' + tr('Coffee servings') + '</h4><p>' + mv('caffeine') + '</p><p class="small muted">' + tr('Self-reported servings, not a measured caffeine dose in milligrams.') + '</p></div><div class="report-subsection"><h4>' + tr('Substances and mood') + '</h4>' + reportSubstanceMood(periodKeys) + '</div>' : ''));
    if (part === 'supplementen') h += sec('Supplementen', supplementReport(periodKeys));
    if (part === 'gewicht') {
      const w = keys.map(k => ({ k, v: DB.days[k].weight })).filter(x => isNum(x.v));
      h += sec('Gewicht (vóór ontbijt)', w.length ? '<p>' + w.map(x => fmtDay(x.k) + ': ' + fmtNum(x.v, 1) + ' kg').join(' · ') + '</p><p class="small">' + reportCount(w.length, 'Average {weight} kg across {count} weigh-in.', 'Average {weight} kg across {count} weigh-ins.').replace('{weight}', fmtNum(avg(w.map(x => x.v)), 1)) + '</p>' : '<p>' + tr('No weigh-ins recorded.') + '</p>');
    }
  }
  return h;
}
