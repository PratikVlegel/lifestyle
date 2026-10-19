/* Weekrapport en kleine experimenten die de app zelf meet. */
'use strict';

/* ---------- weekrapport ---------- */
const WEEK_ROWS = [
  ['kcal', 'Kcal (volledige dagen)'], ['protein', 'Eiwit'], ['fiber', 'Vezels'], ['water', 'Water'],
  ['steps', 'Stappen'], ['burn', 'Beweging'], ['sleepH', 'Slaap'], ['energy', 'Energie'], ['mood', 'Stemming'],
  ['hungerEve', 'Trek \'s avonds'], ['eveKcal', 'Kcal vanaf avondeten'], ['caffeine', 'Cafeïne'], ['alcohol', 'Alcohol']
];
function weekStats(endKey) {
  const keys = rangeKeys(endKey, 7);
  const out = {};
  for (const [name] of WEEK_ROWS) out[name] = avg(keys.map(k => dv(name, k)).filter(isNum));
  out.alcoholTotal = keys.reduce((s, k) => s + (isNum(dv('alcohol', k)) ? dv('alcohol', k) : 0), 0);
  const w = keys.map(k => DB.days[k] && DB.days[k].weight).filter(isNum);
  out.weight = avg(w); out.weighings = w.length;
  out.complete = keys.filter(k => DB.days[k] && dayComplete(DB.days[k])).length;
  out.days = keys.filter(k => DB.days[k]).length;
  out.acts = keys.reduce((s, k) => s + ((DB.days[k] && DB.days[k].activities) || []).length, 0);
  const moods = keys.map(k => ({ k, v: dv('mood', k) })).filter(x => isNum(x.v));
  out.best = moods.length ? moods.reduce((a, b) => b.v > a.v ? b : a) : null;
  return out;
}
function weekEnd() { const t = todayKey(); const dow = parseKey(t).getDay(); return dow === 0 ? t : addDays(t, -dow); } // laatste zondag (of vandaag)
function renderWeek(endArg) {
  const end = endArg || (parseKey(todayKey()).getDay() === 0 ? completeKey() : weekEnd());
  const cur = weekStats(end), prev = weekStats(addDays(end, -7));
  let h = header('Je week', fmtDay(addDays(end, -6)) + ' – ' + fmtDay(end), true);
  h += '<div class="seg"><button data-act="weekNav" data-k="' + addDays(end, -7) + '">' + tr('‹ vorige') + '</button>' + (end < weekEnd() ? '<button data-act="weekNav" data-k="' + addDays(end, 7) + '">' + tr('volgende ›') + '</button>' : '') + '</div>';
  h += '<div class="card table week-compare"><div class="tr week-head"><span class="muted">' + tr('Gemiddeld per dag') + '</span><b class="muted">' + tr('Deze week') + '</b><small class="muted" style="width:auto">' + tr('Vorige week') + '</small></div>' +
    WEEK_ROWS.map(([name, label]) => {
      const a = cur[name], b = prev[name];
      if (!isNum(a) && !isNum(b)) return '';
      const D = DVARS[name];
      let arrow = '';
      if (isNum(a) && isNum(b) && Math.abs(a - b) > Math.max(Math.abs(b) * 0.05, D.d ? 0.2 : 1)) arrow = a > b ? ' ↑' : ' ↓';
      return '<div class="tr"><span>' + tr(label) + '</span><b>' + (isNum(a) ? fmtV(name, a) : '–') + arrow + '</b><small class="muted" style="width:auto">' + (isNum(b) ? fmtV(name, b) : '–') + '</small></div>';
    }).join('') + '</div>';
  const notes = [];
  if (isNum(cur.weight)) notes.push('Gewicht: weekgemiddelde ' + fmtNum(cur.weight, 1) + ' kg over ' + cur.weighings + ' weging' + (cur.weighings > 1 ? 'en' : '') + (isNum(prev.weight) ? ' (vorige week ' + fmtNum(prev.weight, 1) + ' kg)' : '') + '.');
  notes.push('Registratie: ' + cur.complete + ' van de 7 dagen volledig' + (cur.complete >= 6 ? ', sterk!' : '.'));
  if (cur.acts) notes.push(cur.acts + ' extra activiteit' + (cur.acts > 1 ? 'en' : '') + ' gelogd.');
  if (cur.alcoholTotal) notes.push(cur.alcoholTotal + ' glazen alcohol deze week.');
  if (cur.best) notes.push('Beste dag: ' + fmtDay(cur.best.k, true) + ' (stemming ' + cur.best.v + '/10).');
  h += '<div class="card"><h3>' + tr('In het kort') + '</h3>' + notes.map(n => '<p class="small">' + esc(n) + '</p>').join('') + '</div>';
  const ins = buildInsights(14).filter(i => i.tone === 'tip').slice(0, 3);
  if (ins.length) h += '<h2 class="sec">' + tr('Om op te letten deze week') + '</h2>' + ins.map(insightCard).join('');
  h += '<div class="inrow wrap"><button class="btn ghost" data-act="shareWeek">' + tr('Deel als tekst') + '</button><a class="btn ghost" href="#/rapport">' + tr('Rapport maken') + '</a><a class="btn ghost" href="#/experimenten">' + tr('Experiment starten') + '</a></div>';
  DB.settings.weekSeen = end; save();
  view().innerHTML = h;
}
ACT.weekNav = el => renderWeek(el.dataset.k);
function weekCard() {
  const t = todayKey(), dow = parseKey(t).getDay(), hour = new Date().getHours();
  const end = dow === 0 ? t : addDays(t, -dow);
  if (DB.settings.weekSeen && DB.settings.weekSeen >= end) return '';
  if (!((dow === 0 && hour >= 18) || dow === 1 || dow === 2)) return '';
  if (rangeKeys(end, 7).filter(k => DB.days[k]).length < 3) return '';
  return '<a class="card fb wk" href="#/week"><b>Je weekrapport staat klaar</b><p class="small">Hoe was je week tegenover de vorige? Kcal, eiwit, slaap, stemming, beweging en wat opvalt.</p></a>';
}

/* ---------- experimenten ---------- */
const EXPERIMENTS = [
  { id: 'eiwitontbijt', title: 'Eiwitrijk ontbijt', do: 'Ontbijt met minstens 20 g eiwit (eieren, skyr, kwark, hüttenkäse)', q: 'Had je ontbijt minstens 20 g eiwit?', m: ['hungerEve', 'eveKcal', 'energy'] },
  { id: 'snack16', title: 'Vast tussendoortje rond 16 u', do: 'Een klein, eiwitrijk tussendoortje tussen 15 en 17 u', q: 'Had je een tussendoortje rond 16 u?', m: ['hungerEve', 'hungerDinner', 'eveKcal'] },
  { id: 'lunch', title: 'Lunch nooit overslaan', do: 'Elke dag een volwaardige lunch, ook op drukke dagen', q: 'Heb je vandaag geluncht?', m: ['hungerEve', 'eveKcal', 'mood'] },
  { id: 'koffie14', title: 'Laatste koffie vóór 14 u', do: 'Na 14 u geen koffie, espresso of energiedrank', q: 'Was je laatste koffie vóór 14 u?', m: ['sleepH', 'energy', 'mood'], lagSleep: true },
  { id: 'wandel', title: '10 minuten wandelen na het avondeten', do: 'Kort wandelen na het avondeten', q: 'Ben je na het avondeten gaan wandelen?', m: ['steps', 'hungerEve', 'mood'] },
  { id: 'water', title: '2 liter water', do: 'Minstens 2 liter water per dag', q: 'Heb je 2 liter water gedronken?', m: ['energy', 'hungerEve', 'mood'] },
  { id: 'cpap', title: 'CPAP de hele nacht', do: 'Elke nacht de hele nacht CPAP', q: 'Had je vannacht de hele nacht CPAP op?', m: ['energy', 'mood', 'steps'] },
  { id: 'scherm', title: 'Schermen uit 30 min voor het slapen', do: 'Geen gsm of laptop het laatste halfuur', q: 'Had je het laatste halfuur geen scherm?', m: ['sleepH', 'energy'], lagSleep: true },
  { id: 'keuken', title: 'Keuken dicht na het avondeten', do: 'Na het avondeten tanden poetsen en niets meer eten, tenzij gepland', q: 'Bleef de keuken dicht na het avondeten?', m: ['hungerEve', 'eveKcal', 'sleepH'] }
];
function renderExperiments() {
  DB.experiments = DB.experiments || [];
  const act = DB.experiments.find(e => !e.closed);
  let h = header('Experimenten', 'Probeer één ding een week en zie wat het doet', true);
  if (act) {
    const E = EXPERIMENTS.find(x => x.id === act.id);
    const endK = addDays(act.start, act.days - 1);
    const doneDays = Object.values(act.log || {}).filter(v => v === true).length;
    h += '<div class="card fb"><b>Bezig: ' + esc(E.title) + '</b><p class="small">' + esc(E.do) + '</p><p class="small muted">' + fmtDay(act.start) + ' – ' + fmtDay(endK) + ' · ' + doneDays + ' van de ' + act.days + ' dagen gelukt. Je antwoordt elke avond bij de dagopname.</p>' +
      (todayKey() > endK ? '<button class="btn" data-act="expClose">Bekijk resultaat</button>' : '<button class="link danger" data-act="expStop">Stoppen</button>') + '</div>';
  }
  const done = DB.experiments.filter(e => e.closed);
  if (done.length) h += '<h2 class="sec">Resultaten</h2>' + done.slice().reverse().map(e => '<div class="card"><b>' + esc((EXPERIMENTS.find(x => x.id === e.id) || {}).title || e.id) + '</b><small class="muted"> · ' + fmtDay(e.start) + '</small>' + expResultHtml(e) + '</div>').join('');
  if (!act) {
    h += '<h2 class="sec">Kies een experiment</h2><p class="muted small">De app vergelijkt de dagen waarop het lukte met je twee weken ervoor. Eén experiment tegelijk, zo blijft het meetbaar.</p>';
    h += EXPERIMENTS.map(E => '<div class="card"><b>' + esc(E.title) + '</b><p class="small">' + esc(E.do) + '</p><small class="muted">Meet: ' + E.m.map(x => DVARS[x].l).join(', ') + '</small><div><button class="btn ghost" data-act="expStart" data-id="' + E.id + '">Start 7 dagen</button></div></div>').join('');
  }
  view().innerHTML = h;
}
ACT.expStart = el => { DB.experiments = DB.experiments || []; DB.experiments.push({ id: el.dataset.id, start: todayKey(), days: 7, log: {} }); save(); toast('Gestart. Elke avond vraagt de dagopname of het gelukt is.'); render(); };
ACT.expStop = () => { const a = DB.experiments.find(e => !e.closed); if (!confirm('Experiment stoppen?')) return; a.closed = true; a.stopped = true; save(); render(); };
ACT.expClose = () => { const a = DB.experiments.find(e => !e.closed); a.closed = true; save(); render(); };
function expResult(e) {
  const E = EXPERIMENTS.find(x => x.id === e.id);
  const yes = Object.entries(e.log || {}).filter(([, v]) => v === true).map(([k]) => k);
  const base = rangeKeys(addDays(e.start, -1), 14);
  const shift = k => E.lagSleep ? addDays(k, 1) : k; // slaap hoort bij de nacht erna
  return E.m.map(name => {
    const s = name === 'sleepH' ? shift : (k => k);
    const a = avg(yes.map(k => dv(name, s(k))).filter(isNum)), b = avg(base.map(k => dv(name, s(k))).filter(isNum));
    return { name, a, b, n: yes.length };
  });
}
function expResultHtml(e) {
  if (e.stopped) return '<p class="small muted">Vroegtijdig gestopt.</p>';
  const r = expResult(e);
  if (!r[0].n) return '<p class="small muted">Geen dagen als gelukt aangeduid.</p>';
  return '<div class="table small">' + r.map(x => '<div class="tr"><span>' + DVARS[x.name].l + '</span><b>' + (isNum(x.a) ? fmtV(x.name, x.a) : '–') + '</b><small class="muted" style="width:auto">ervoor ' + (isNum(x.b) ? fmtV(x.name, x.b) : '–') + '</small></div>').join('') + '</div><p class="small muted">Op ' + r[0].n + ' geslaagde dagen. Met zo weinig dagen is dit een eerste aanwijzing, geen bewijs.</p>';
}
/* Vraag in de dagopname */
function expQuestionHtml() {
  const a = (DB.experiments || []).find(e => !e.closed);
  if (!a || CI.k < a.start || CI.k > addDays(a.start, a.days - 1)) return '';
  const E = EXPERIMENTS.find(x => x.id === a.id), v = (a.log || {})[CI.k];
  return '<div class="card fb"><h3>Experiment: ' + esc(E.title) + '</h3><div class="fld"><span>' + esc(E.q) + '</span><div class="chips"><button class="chip ' + (v === true ? 'on' : '') + '" data-act="expLog" data-v="1">ja</button><button class="chip ' + (v === false ? 'on' : '') + '" data-act="expLog" data-v="0">nee</button></div></div></div>';
}
ACT.expLog = el => { const a = DB.experiments.find(e => !e.closed); a.log = a.log || {}; a.log[CI.k] = el.dataset.v === '1'; save(); rerenderCI(); };
