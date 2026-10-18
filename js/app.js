/* Schermen, check-ins en interactie. */
'use strict';

const $ = s => document.querySelector(s);
const view = () => $('#view');
const ACT = {};
let CI = null;          // check-in concept
let PREP = null;        // mealprep-concept
let PERIOD = 30;        // KPI-periode
let PICK_CB = null;     // callback van de itemkiezer

/* ================= router ================= */
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
window.addEventListener('hashchange', render);
function render() {
  const h = location.hash.replace(/^#\/?/, '');
  const [page, a, b] = h.split('/');
  if (!DB.intakeDone && page !== 'intake') return go('#/intake');
  document.querySelectorAll('nav.tabs a').forEach(el => el.classList.toggle('on', el.dataset.tab === (page || 'home') || (el.dataset.tab === 'dagboek' && page === 'dag') || (el.dataset.tab === 'preps' && page === 'prep') || (el.dataset.tab === 'home' && (page === 'kpi' || page === 'checkin'))));
  $('nav.tabs').hidden = page === 'intake';
  window.scrollTo(0, 0);
  try {
    switch (page || 'home') {
      case 'home': return renderHome();
      case 'kpi': return renderKpi(a);
      case 'checkin': return renderCheckin(a, b);
      case 'dagboek': return renderDays();
      case 'dag': return renderDay(a);
      case 'preps': return renderPreps();
      case 'prep': return renderPrep(a);
      case 'inzicht': return renderInsights();
      case 'meer': return renderMore(a);
      case 'intake': return renderIntake(a || '1');
      default: return renderHome();
    }
  } catch (e) {
    console.error(e);
    view().innerHTML = '<div class="card"><h2>Er liep iets mis</h2><p class="muted">' + esc(e.message) + '</p><button class="btn" data-act="home">Terug</button></div>';
  }
}
ACT.home = () => go('#/');
ACT.back = () => history.length > 1 ? history.back() : go('#/');

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACT[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.ci) ciInput(el);
  if (el.dataset.pp) prepInput(el);
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.ci && (el.type === 'checkbox' || el.tagName === 'SELECT')) ciInput(el);
  if (el.dataset.pp && el.tagName === 'SELECT') prepInput(el);
  if (el.dataset.chg && ACT[el.dataset.chg]) ACT[el.dataset.chg](el, e);
});

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}
function header(title, sub, back) {
  return '<header class="top">' + (back ? '<button class="iconbtn" data-act="back" aria-label="Terug">‹</button>' : '') +
    '<div><h1>' + esc(title) + '</h1>' + (sub ? '<p class="muted">' + esc(sub) + '</p>' : '') + '</div></header>';
}

/* ================= home ================= */
const KPI_ORDER = ['kcal', 'protein', 'water', 'steps', 'sleep', 'mood', 'energy', 'weight', 'fiber', 'caffeine'];
function renderHome() {
  const k = todayKey();
  const due = dueReminder();
  const st = reminderStatus(k);
  let h = header('Vandaag', fmtDay(k, true));
  if (due) {
    h += '<button class="due" data-act="openCheckin" data-id="' + due.id + '"><span class="due-t">Check-in klaar</span><span class="due-l">' + esc(due.label) + ' · ' + due.time + '</span><span class="due-go">Invullen ›</span></button>';
  }
  h += '<div class="chips row">' + st.map(x => '<button class="chip ' + (x.done ? 'done' : x.due ? 'open' : '') + '" data-act="openCheckin" data-id="' + x.r.id + '">' + (x.done ? '✓ ' : '') + x.r.time + ' ' + esc(x.r.label) + '</button>').join('') + '</div>';
  h += '<div class="quick"><button class="btn ghost" data-act="quickWater">+ glas water</button><button class="btn ghost" data-act="quickCoffee">+ koffie</button><button class="btn ghost" data-act="quickEat">+ eten</button></div>';
  h += '<h2 class="sec">Kerncijfers</h2><div class="kpis">' + KPI_ORDER.map(kpiTile).join('') + '</div>';
  const day = getDay(k);
  h += '<h2 class="sec">Gegeten vandaag</h2>' + mealsList(day, k, false);
  view().innerHTML = h;
}
function kpiTile(key) {
  const M = METRICS[key];
  const k = todayKey();
  const ser = metricSeries(key, k, 14);
  const evening = ['steps', 'sleep', 'mood', 'energy'].includes(key);
  let cur = ser[ser.length - 1], when = 'vandaag';
  if (!isNum(cur.v) && (evening || key === 'weight')) {
    const last = [...ser].reverse().find(x => isNum(x.v));
    if (last) { cur = last; when = last.k === addDays(k, -1) ? 'gisteren' : fmtDay(last.k); }
  }
  const a7 = avg(statVals(key, metricSeries(key, completeKey(), 7)));
  const goal = M.goal ? M.goal() : null;
  let bar = '';
  if (goal && M.sum || key === 'water') {
    const pct = isNum(cur.v) ? Math.min(100, Math.round(cur.v / goal * 100)) : 0;
    bar = '<div class="prog"><i style="width:' + pct + '%"></i></div>';
  }
  const val = isNum(cur.v) ? (cur.lb ? '≥ ' : '') + fmtNum(cur.v, M.dec) : '–';
  return '<button class="kpi" data-act="openKpi" data-k="' + key + '">' +
    '<span class="kl">' + M.label + '</span>' +
    '<span class="kv">' + val + '<small> ' + M.unit + '</small></span>' +
    '<span class="ks">' + (isNum(cur.v) ? when : 'nog niets') + (goal ? ' · doel ' + fmtNum(goal, M.dec) + (M.goal2 ? '–' + fmtNum(M.goal2(), 0) : '') : '') + '</span>' + bar +
    sparkline(ser, M.chart) +
    '<span class="ks">7 d gem. ' + fmtNum(a7, M.dec) + '</span></button>';
}
ACT.openKpi = el => go('#/kpi/' + el.dataset.k);
ACT.openCheckin = el => go('#/checkin/' + el.dataset.id);
ACT.quickWater = () => { const d = getDay(todayKey(), true); d.waterMl = (isNum(d.waterMl) ? d.waterMl : 0) + DB.settings.glassMl; save(); toast('Water: ' + fmtNum(d.waterMl / 1000, 2) + ' l vandaag'); render(); };
ACT.quickCoffee = () => { const d = getDay(todayKey(), true); d.caffeine = (isNum(d.caffeine) ? d.caffeine : 0) + 1; save(); toast('Cafeïne: ' + d.caffeine + ' shots vandaag'); render(); };
ACT.quickEat = () => openPicker(items => {
  const d = getDay(todayKey(), true);
  const slot = slotForNow();
  items.forEach(it => { it.slot = slot; it.time = nowTime(); d.meals.push(it); if (it.prepId) usePortion(it.prepId, it.portion); });
  save(); toast('Genoteerd bij ' + SLOTS[slot]); render();
});
function slotForNow() {
  const t = nowTime();
  if (t < '10:30') return 'ontbijt'; if (t < '12:00') return 'tussen1'; if (t < '14:30') return 'lunch';
  if (t < '17:30') return 'tussen2'; if (t < '20:30') return 'avond'; return 'na';
}

function mealsList(day, k, editable) {
  if (!day || !(day.meals || []).length) return '<p class="muted card">Nog niets genoteerd.</p>';
  let h = '<div class="card list">';
  for (const s of SLOT_ORDER) {
    const ms = day.meals.filter(m => m.slot === s);
    if (!ms.length) continue;
    h += '<div class="slot"><div class="slot-h">' + SLOTS[s] + '</div>';
    for (const m of ms) {
      h += '<div class="meal"><div class="mt">' + (m.time ? '<span class="tm">' + esc(m.time) + '</span>' : '') + (m.nothing ? '<em>niets gegeten</em>' : esc(m.desc)) + '</div>' +
        '<div class="mn">' + (m.nothing ? '' : nutrLine(m)) + '</div>' +
        (editable ? '<div class="ma"><button class="link" data-act="editMeal" data-k="' + k + '" data-id="' + m.id + '">Wijzig</button><button class="link danger" data-act="delMeal" data-k="' + k + '" data-id="' + m.id + '">Verwijder</button></div>' : '') + '</div>';
    }
    h += '</div>';
  }
  const kc = dayNutr(day, 'kcal');
  if (kc) h += '<div class="total">Totaal ' + (kc.lb ? '≥ ' : '≈ ') + fmtNum(kc.v) + ' kcal' + (day.kcalOverride ? ' (dagschatting)' : '') + '</div>';
  return h + '</div>';
}
function nutrLine(m) {
  const p = [];
  p.push(isNum(m.kcal) ? '≈ ' + fmtNum(m.kcal) + ' kcal' : 'kcal onbekend');
  if (isNum(m.protein)) p.push(fmtNum(m.protein) + ' g eiwit');
  if (isNum(m.fiber)) p.push(fmtNum(m.fiber) + ' g vezels');
  return p.join(' · ');
}

/* ================= KPI-detail ================= */
const KPI_CAT = { kcal: 'voeding', protein: 'voeding', fiber: 'voeding', water: 'voeding', steps: 'activiteit', sleep: 'slaap', mood: 'stemming', energy: 'stemming', weight: 'gewicht', caffeine: 'slaap' };
function renderKpi(key) {
  const M = METRICS[key]; if (!M) return go('#/');
  const ser = metricSeries(key, todayKey(), PERIOD);
  const vals = statVals(key, ser);
  const goal = M.goal ? M.goal() : null;
  let h = header(M.label, 'Laatste ' + PERIOD + ' dagen', true);
  h += '<div class="seg">' + [7, 30, 90].map(p => '<button class="' + (p === PERIOD ? 'on' : '') + '" data-act="period" data-p="' + p + '">' + p + ' d</button>').join('') + '</div>';
  h += '<div class="stats">' +
    stat('Gemiddeld', fmtNum(avg(vals), M.dec) + ' ' + M.unit) +
    stat('Laagste', vals.length ? fmtNum(Math.min(...vals), M.dec) : '–') +
    stat('Hoogste', vals.length ? fmtNum(Math.max(...vals), M.dec) : '–') +
    stat(M.sum || key === 'water' ? 'Volledige dagen' : 'Dagen met data', vals.length + '/' + PERIOD) + '</div>' +
    (M.sum || key === 'water' ? '<p class="muted small">Gemiddelde, laagste en hoogste tellen alleen volledige dagen: zonder onbekende maaltijden en zonder de lopende dag.</p>' : '');
  const opts = { goal, goal2: M.goal2 ? M.goal2() : null, goalIsMax: M.goalIsMax, dec: M.dec, unit: M.unit, label: M.label, ma: M.ma, min: M.min, max: M.max };
  h += '<div class="card"><h3>' + M.label + ' per dag</h3>' + (M.chart === 'bar' ? barChart(ser, opts) : lineChart(ser, opts)) +
    '<p class="muted small">' + (goal ? 'Stippellijn = ' + (M.goalIsMax ? 'maximum ' : 'doel ') + fmtNum(goal, M.dec) + (M.goal2 ? '–' + fmtNum(M.goal2()) : '') + '. ' : '') + (M.sum ? 'Lichtere staaf = ondergrens (een deel is onbekend). ' : '') + (M.ma ? 'Dikke lijn = 7-daags gemiddelde.' : '') + '</p></div>';

  if (key === 'kcal') {
    const rows = rangeKeys(todayKey(), Math.min(PERIOD, 30)).map(k => {
      const d = DB.days[k], parts = {};
      if (d && !d.kcalOverride) for (const m of d.meals || []) if (isNum(m.kcal)) parts[m.slot] = (parts[m.slot] || 0) + m.kcal;
      return { k, parts };
    });
    h += '<div class="card"><h3>Wanneer komen je kcal binnen?</h3>' + stackChart(rows, { goal, label: 'kcal per maaltijdmoment' }) + slotAverages(rows) + '</div>';
  }
  if (key === 'mood' || key === 'energy') {
    const pts = pairs(PERIOD, d => d.sleepH, d => M.get(d));
    h += '<div class="card"><h3>' + M.label + ' tegenover slaap</h3>' + scatterChart(pts, { xLabel: 'slaap (u, nacht ervoor)', yLabel: M.label.toLowerCase() + ' /10', ymin: 0, ymax: 10 }) + '</div>';
    const pts2 = pairs(PERIOD, d => d.steps, d => M.get(d));
    h += '<div class="card"><h3>' + M.label + ' tegenover stappen</h3>' + scatterChart(pts2, { xLabel: 'stappen', yLabel: M.label.toLowerCase() + ' /10', ymin: 0, ymax: 10 }) + '</div>';
  }
  if (key === 'sleep') {
    const pts = pairs(PERIOD, d => d.sleepH, d => d.energy);
    h += '<div class="card"><h3>Slaap en energie</h3>' + scatterChart(pts, { xLabel: 'slaap (u)', yLabel: 'energie /10', ymin: 0, ymax: 10 }) + '</div>';
  }
  if (key === 'caffeine') {
    const pts = pairs(PERIOD, d => d.caffeine, d => d.sleepH, 1);
    h += '<div class="card"><h3>Cafeïne en de nacht erna</h3>' + scatterChart(pts, { xLabel: 'shots cafeïne', yLabel: 'slaap volgende nacht (u)' }) + '</div>';
  }
  if (key === 'steps') {
    const wk = [1, 2, 3, 4, 5, 6, 0].map(w => ({ w, v: avg(ser.filter(x => parseKey(x.k).getDay() === w).map(x => x.v)) }));
    const mx = Math.max(1, ...wk.map(x => x.v || 0));
    h += '<div class="card"><h3>Gemiddeld per weekdag</h3><div class="hbars">' + wk.map(x => '<div class="hb"><span>' + WD[x.w].slice(0, 2) + '</span><i style="width:' + ((x.v || 0) / mx * 100) + '%"></i><b>' + fmtNum(x.v) + '</b></div>').join('') + '</div></div>';
  }
  const ins = buildInsights(Math.max(PERIOD, 14)).filter(i => i.cat === KPI_CAT[key]);
  if (ins.length) h += '<h2 class="sec">Wat valt op</h2>' + ins.map(insightCard).join('');
  h += '<h2 class="sec">Per dag</h2><div class="card table">' + [...ser].reverse().filter(x => DB.days[x.k]).map(x => {
    const d = DB.days[x.k];
    const extra = (key === 'mood' && d.moodNote) ? ' <span class="muted">' + esc(d.moodNote) + '</span>' : (key === 'sleep' && d.cpap) ? ' <span class="muted">CPAP: ' + esc(d.cpap) + '</span>' : '';
    return '<a class="tr" href="#/dag/' + x.k + '"><span>' + fmtDay(x.k, true) + '</span><b>' + (isNum(x.v) ? (x.lb ? '≥ ' : '') + fmtNum(x.v, M.dec) : '–') + '</b>' + extra + '</a>';
  }).join('') + '</div>';
  view().innerHTML = h;
}
function stat(l, v) { return '<div class="stat"><span>' + l + '</span><b>' + v + '</b></div>'; }
function slotAverages(rows) {
  const used = rows.filter(r => Object.keys(r.parts).length);
  if (!used.length) return '';
  const tot = used.reduce((s, r) => s + Object.values(r.parts).reduce((a, b) => a + b, 0), 0);
  return '<div class="hbars">' + SLOT_ORDER.map((s, si) => {
    const v = used.reduce((a, r) => a + (r.parts[s] || 0), 0);
    const pct = tot ? v / tot * 100 : 0;
    return '<div class="hb"><span>' + SLOTS[s] + '</span><i class="s' + si + '" style="width:' + pct + '%"></i><b>' + Math.round(pct) + '%</b></div>';
  }).join('') + '</div>';
}
ACT.period = el => { PERIOD = Number(el.dataset.p); render(); };

/* ================= check-in ================= */
function renderCheckin(rid, dateKey) {
  const r = DB.reminders.find(x => x.id === rid) || { id: 'vrij', label: 'Iets noteren', time: nowTime(), kind: 'vrij' };
  const k = dateKey || (new Date().getHours() < 4 ? addDays(todayKey(), -1) : todayKey());
  if (!CI || CI.rid !== r.id || CI.k !== k) CI = newCheckin(r, k);
  const day = getDay(k);
  let h = header(r.label, fmtDay(k, true) + ' · ' + r.time, true);
  if (day && day.done && day.done[r.id]) h += '<p class="note">Deze check-in is vandaag al ingevuld. Wat je nu bewaart, komt erbij.</p>';
  h += '<div class="seg small">' + [addDays(todayKey(), -1), todayKey()].map(x => '<button class="' + (x === k ? 'on' : '') + '" data-act="ciDate" data-k="' + x + '">' + (x === todayKey() ? 'Vandaag' : 'Gisteren') + '</button>').join('') + '</div>';
  const kind = r.kind;
  if (kind === 'ontbijt') {
    h += field('weight', 'Gewicht vóór het ontbijt', 'number', { unit: 'kg', step: '0.1', unknown: 'niet gewogen' });
    h += slotBlock('ontbijt', 'Wat at je als ontbijt?');
    h += drinks();
  } else if (kind === 'lunch') {
    h += slotBlock('tussen1', 'Tussen ontbijt en lunch?');
    h += slotBlock('lunch', 'Wat at je als lunch?');
    h += drinks();
  } else if (kind === 'avond') {
    h += slotBlock('tussen2', 'Tussen lunch en avondeten?');
    h += slotBlock('avond', 'Wat at je als avondeten?');
    h += drinks();
  } else if (kind === 'dag') {
    const miss = ['ontbijt', 'lunch', 'avond'].filter(s => !(day && day.meals.some(m => m.slot === s)));
    if (miss.length) h += '<p class="note">Nog niet ingevuld vandaag: ' + miss.map(s => SLOTS[s].toLowerCase()).join(', ') + '. <a href="#/dag/' + k + '">Aanvullen in het dagboek</a></p>';
    h += '<div class="card"><h3>Slaap (afgelopen nacht)</h3>' +
      field('sleepH', 'Hoeveel uur geslapen?', 'number', { unit: 'u', step: '0.25', unknown: 'onbekend', bare: true }) +
      choice('sleepQ', 'Hoe uitgerust?', ['slecht', 'matig', 'uitgerust', 'goed uitgerust']) +
      choice('cpap', 'CPAP?', ['hele nacht', 'deel van de nacht', 'nee']) + '</div>';
    h += '<div class="card"><h3>Hoe was je dag?</h3>' + scale('energy', 'Energie') + scale('mood', 'Stemming') +
      '<label class="fld"><span>Waarom zo? (werk, mensen, honger, slaap…)</span><input type="text" data-ci="moodNote" value="' + esc(CI.f.moodNote || '') + '" placeholder="bv. drukke dag, ruzie op het werk"></label></div>';
    h += '<div class="card"><h3>Beweging en drinken</h3>' +
      field('steps', 'Stappen', 'number', { unit: '', step: '1', unknown: 'onbekend', bare: true }) +
      field('waterL', 'Water vandaag in totaal', 'number', { unit: 'l', step: '0.25', unknown: 'onbekend', bare: true, hint: 'Al genoteerd: ' + (day && isNum(day.waterMl) ? fmtNum(day.waterMl / 1000, 2) + ' l' : 'niets') }) +
      field('caffeine', 'Koffie / espresso / energiedrank (shots)', 'number', { unit: 'shots', step: '1', unknown: 'onbekend', bare: true }) +
      choice('vape', 'Vapen', ['niet', 'paar keer', 'om de 3 u', 'om de 2 u', 'elk uur']) +
      field('alcohol', 'Alcohol (glazen)', 'number', { unit: 'glazen', step: '1', unknown: 'onbekend', bare: true }) +
      (Number(CI.f.alcohol) > 0 ? '<label class="fld"><span>Wat gedronken?</span><input type="text" data-ci="alcoholNote" value="' + esc(CI.f.alcoholNote || '') + '"></label>' : '') + '</div>';
    h += slotBlock('na', 'Iets gegeten of gedronken na het avondeten?');
    h += '<label class="fld card"><span>Notitie voor vandaag (optioneel)</span><textarea data-ci="notes" rows="2">' + esc(CI.f.notes || '') + '</textarea></label>';
  } else {
    h += '<label class="fld card"><span>Moment</span><select data-ci="slot">' + SLOT_ORDER.map(s => '<option value="' + s + '"' + (CI.f.slot === s ? ' selected' : '') + '>' + SLOTS[s] + '</option>').join('') + '</select></label>';
    h += slotBlock(CI.f.slot || slotForNow(), 'Wat at of dronk je?');
    h += drinks();
  }
  h += '<div class="err" id="cierr" hidden></div><button class="btn big" data-act="ciSave">Bewaren</button>';
  view().innerHTML = h;
}
function newCheckin(r, k) {
  const day = getDay(k);
  const f = {};
  if (r.kind === 'dag') {
    if (day) {
      for (const x of ['sleepH', 'sleepQ', 'cpap', 'energy', 'mood', 'moodNote', 'steps', 'vape', 'alcohol', 'alcoholNote', 'notes', 'caffeine']) if (day[x] !== undefined && day[x] !== null) f[x] = day[x];
      if (isNum(day.waterMl)) f.waterL = Math.round(day.waterMl / 250) / 4;
    }
  }
  if (r.kind === 'vrij') f.slot = slotForNow();
  return { rid: r.id, kind: r.kind, k, time: r.kind === 'vrij' ? nowTime() : r.time, f, items: {}, ans: {}, glasses: 0, shots: 0 };
}
ACT.ciDate = el => { go('#/checkin/' + CI.rid + '/' + el.dataset.k); };

function field(name, label, type, o) {
  const v = CI.f[name];
  const unk = v === '?';
  const inner = '<span>' + label + '</span><div class="inrow"><input type="' + type + '" inputmode="decimal" step="' + (o.step || 'any') + '" data-ci="' + name + '" value="' + (unk || v === undefined ? '' : esc(v)) + '"' + (unk ? ' disabled' : '') + '>' + (o.unit ? '<em>' + o.unit + '</em>' : '') +
    '<button class="chip sm ' + (unk ? 'on' : '') + '" data-act="ciUnknown" data-f="' + name + '">' + o.unknown + '</button></div>' + (o.hint ? '<small class="muted">' + esc(o.hint) + '</small>' : '');
  return o.bare ? '<label class="fld" data-req="' + name + '">' + inner + '</label>' : '<label class="fld card" data-req="' + name + '">' + inner + '</label>';
}
function choice(name, label, opts) {
  return '<div class="fld" data-req="' + name + '"><span>' + label + '</span><div class="chips">' + opts.concat(['onbekend']).map(o => '<button class="chip ' + (CI.f[name] === (o === 'onbekend' ? '?' : o) ? 'on' : '') + '" data-act="ciChoice" data-f="' + name + '" data-v="' + esc(o === 'onbekend' ? '?' : o) + '">' + o + '</button>').join('') + '</div></div>';
}
function scale(name, label) {
  const v = CI.f[name];
  let h = '<div class="fld" data-req="' + name + '"><span>' + label + ' /10</span><div class="scale">';
  for (let i = 1; i <= 10; i++) h += '<button class="' + (v === i ? 'on' : '') + '" data-act="ciChoice" data-f="' + name + '" data-v="' + i + '" data-num="1">' + i + '</button>';
  return h + '</div><button class="chip sm ' + (v === '?' ? 'on' : '') + '" data-act="ciChoice" data-f="' + name + '" data-v="?">onbekend</button></div>';
}
function slotBlock(slot, q) {
  const items = CI.items[slot] || [];
  const a = CI.ans[slot];
  let h = '<div class="card slotblock" data-req="slot:' + slot + '"><h3>' + q + '</h3>';
  if (items.length) {
    h += '<div class="items">' + items.map((it, i) => '<div class="it"><div><b>' + esc(it.desc) + '</b><small>' + nutrLine(it) + '</small></div><button class="iconbtn sm" data-act="ciDelItem" data-s="' + slot + '" data-i="' + i + '" aria-label="Verwijder">✕</button></div>').join('') + '</div>';
  }
  h += '<div class="chips">' +
    '<button class="chip add" data-act="ciAdd" data-s="' + slot + '">+ toevoegen</button>' +
    (items.length ? '' : '<button class="chip ' + (a === 'niets' ? 'on' : '') + '" data-act="ciAns" data-s="' + slot + '" data-v="niets">niets gegeten</button><button class="chip ' + (a === '?' ? 'on' : '') + '" data-act="ciAns" data-s="' + slot + '" data-v="?">weet ik niet</button>') + '</div>';
  if (items.length) h += '<label class="fld"><span>Hoe laat?</span><input type="time" data-ci="time_' + slot + '" value="' + esc(CI.f['time_' + slot] || defaultTime(slot)) + '"></label>';
  return h + '</div>';
}
function defaultTime(slot) { return ['tussen1', 'tussen2', 'na'].includes(slot) ? '' : CI.time; }
function drinks() {
  return '<div class="card"><h3>Gedronken sinds de vorige check-in</h3>' +
    '<div class="stepper"><span>Glazen water (' + DB.settings.glassMl + ' ml)</span><button data-act="ciStep" data-f="glasses" data-d="-1">−</button><b>' + CI.glasses + '</b><button data-act="ciStep" data-f="glasses" data-d="1">+</button></div>' +
    '<div class="stepper"><span>Koffie / espresso (shots)</span><button data-act="ciStep" data-f="shots" data-d="-1">−</button><b>' + CI.shots + '</b><button data-act="ciStep" data-f="shots" data-d="1">+</button></div></div>';
}
function ciInput(el) {
  const f = el.dataset.ci;
  CI.f[f] = el.type === 'number' ? (el.value === '' ? undefined : Number(el.value.replace(',', '.'))) : el.value;
  if (f === 'slot') renderCheckin(CI.rid, CI.k);
  if (f === 'alcohol') { const show = Number(el.value) > 0; if (show !== !!document.querySelector('[data-ci="alcoholNote"]')) { const y = scrollY; renderCheckin(CI.rid, CI.k); scrollTo(0, y); const n = document.querySelector('[data-ci="alcohol"]'); if (n) { n.focus(); } } }
}
function rerenderCI() { const y = scrollY; renderCheckin(CI.rid, CI.k); scrollTo(0, y); }
ACT.ciUnknown = el => { const f = el.dataset.f; CI.f[f] = CI.f[f] === '?' ? undefined : '?'; rerenderCI(); };
ACT.ciChoice = el => { const f = el.dataset.f; const v = el.dataset.num ? Number(el.dataset.v) : el.dataset.v; CI.f[f] = CI.f[f] === v ? undefined : v; rerenderCI(); };
ACT.ciAns = el => { const s = el.dataset.s; CI.ans[s] = CI.ans[s] === el.dataset.v ? undefined : el.dataset.v; rerenderCI(); };
ACT.ciStep = el => { const f = el.dataset.f; CI[f] = Math.max(0, CI[f] + Number(el.dataset.d)); rerenderCI(); };
ACT.ciDelItem = el => { const s = el.dataset.s; CI.items[s].splice(Number(el.dataset.i), 1); rerenderCI(); };
ACT.ciAdd = el => { const s = el.dataset.s; openPicker(items => { CI.items[s] = (CI.items[s] || []).concat(items); CI.ans[s] = undefined; rerenderCI(); }); };

ACT.ciSave = () => {
  const errs = [];
  document.querySelectorAll('[data-req]').forEach(n => n.classList.remove('bad'));
  document.querySelectorAll('[data-req]').forEach(n => {
    const req = n.dataset.req;
    let ok;
    if (req.startsWith('slot:')) { const s = req.slice(5); ok = (CI.items[s] || []).length || CI.ans[s]; }
    else ok = CI.f[req] !== undefined && CI.f[req] !== '' && !(typeof CI.f[req] === 'number' && isNaN(CI.f[req]));
    if (!ok) { n.classList.add('bad'); errs.push(n); }
  });
  if (errs.length) {
    const e = $('#cierr'); e.hidden = false; e.textContent = 'Nog ' + errs.length + (errs.length > 1 ? ' vragen' : ' vraag') + ' open. Vul in of kies "onbekend" / "weet ik niet".';
    errs[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const d = getDay(CI.k, true);
  const f = CI.f;
  if (CI.kind === 'ontbijt') d.weight = f.weight === '?' ? '?' : f.weight;
  for (const [slot, items] of Object.entries(CI.items)) {
    const t = f['time_' + slot] || defaultTime(slot) || '';
    for (const it of items) { it.slot = slot; it.time = t; d.meals.push(it); if (it.prepId) usePortion(it.prepId, it.portion); }
  }
  for (const [slot, a] of Object.entries(CI.ans)) {
    if (!a || (CI.items[slot] || []).length) continue;
    d.meals.push(a === 'niets' ? { id: uid(), slot, nothing: true } : { id: uid(), slot, desc: 'onbekend (niet meer geweten)', kcal: null });
  }
  if (CI.kind === 'dag') {
    for (const x of ['sleepH', 'sleepQ', 'cpap', 'energy', 'mood', 'moodNote', 'steps', 'vape', 'alcohol', 'alcoholNote', 'notes', 'caffeine']) if (f[x] !== undefined) d[x] = f[x];
    if (f.waterL !== undefined) d.waterMl = f.waterL === '?' ? (isNum(d.waterMl) ? d.waterMl : '?') : Math.round(f.waterL * 1000);
  } else {
    if (CI.glasses) d.waterMl = (isNum(d.waterMl) ? d.waterMl : 0) + CI.glasses * DB.settings.glassMl;
    if (CI.shots) d.caffeine = (isNum(d.caffeine) ? d.caffeine : 0) + CI.shots;
  }
  if (CI.rid !== 'vrij') d.done[CI.rid] = true;
  save();
  const kc = dayNutr(d, 'kcal');
  toast('Bewaard.' + (kc ? ' Vandaag ' + (kc.lb ? '≥ ' : '≈ ') + fmtNum(kc.v) + ' kcal (ruwe schatting).' : ''));
  CI = null;
  go('#/');
};

/* ================= itemkiezer (sheet) ================= */
let PICK_TAB = 'prep';
function openPicker(cb) { PICK_CB = cb; renderPicker(); $('#sheet').hidden = false; document.body.classList.add('noscroll'); }
function closeSheet() { $('#sheet').hidden = true; document.body.classList.remove('noscroll'); stopScan(); }
ACT.closeSheet = closeSheet;
function renderPicker(msg) {
  let h = '<div class="sheet-h"><h2>Eten toevoegen</h2><button class="iconbtn" data-act="closeSheet" aria-label="Sluiten">✕</button></div>';
  h += '<div class="seg">' + [['prep', 'Mealprep'], ['lib', 'Bibliotheek'], ['vrij', 'Vrij']].map(([k, l]) => '<button class="' + (PICK_TAB === k ? 'on' : '') + '" data-act="pickTab" data-t="' + k + '">' + l + '</button>').join('') + '</div>';
  if (msg) h += '<p class="note">' + esc(msg) + '</p>';
  if (PICK_TAB === 'prep') {
    const preps = DB.preps.slice().sort((a, b) => (b.left > 0) - (a.left > 0) || (b.date || '').localeCompare(a.date || ''));
    if (!preps.length) h += '<p class="muted">Nog geen mealpreps. Maak er een in het tabblad Mealprep.</p>';
    h += preps.map(p => {
      const { per } = prepTotals(p);
      return '<div class="pick"><div><b>' + esc(p.name) + '</b><small>≈ ' + fmtNum(per.kcal) + ' kcal · ' + fmtNum(per.protein) + ' g eiwit per portie · ' + (isNum(p.left) ? fmtNum(p.left, p.left % 1 ? 2 : 0) + ' over' : '') + '</small></div><div class="chips">' +
        [[1, '1'], [0.75, '¾'], [2 / 3, '⅔'], [0.5, '½'], [1 / 3, '⅓'], [0.25, '¼']].map(([v, l]) => '<button class="chip" data-act="pickPrep" data-id="' + p.id + '" data-p="' + v + '">' + l + '</button>').join('') + '</div></div>';
    }).join('');
  } else if (PICK_TAB === 'lib') {
    h += '<div class="inrow"><input type="search" id="libq" placeholder="Zoek in je bibliotheek" data-chg="libSearch"><button class="btn ghost" data-act="scanFood">Scan barcode</button></div>';
    h += '<div id="libres">' + libResults('') + '</div>';
  } else {
    h += '<label class="fld"><span>Wat?</span><input id="vdesc" type="text" placeholder="bv. croissant, mixgrill met frieten"></label>' +
      '<div class="grid3"><label class="fld"><span>kcal</span><input id="vkcal" type="number" inputmode="decimal"></label><label class="fld"><span>eiwit g</span><input id="vprot" type="number" inputmode="decimal"></label><label class="fld"><span>vezels g</span><input id="vfib" type="number" inputmode="decimal"></label></div>' +
      '<p class="muted small">Weet je de kcal niet? Laat leeg; dan telt de dag als ondergrens (≥).</p><button class="btn" data-act="pickFree">Toevoegen</button>';
  }
  $('#sheet .sheet-in').innerHTML = h;
}
function libResults(q) {
  const list = DB.foods.filter(f => !q || f.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  if (!list.length) return '<p class="muted">Niets gevonden. Producten komen in je bibliotheek als je ze scant of in een mealprep gebruikt.</p>';
  return list.map(f => '<div class="pick"><div><b>' + esc(f.name) + '</b><small>' + fmtNum(f.per.kcal) + ' kcal · ' + fmtNum(f.per.protein, 1) + ' g eiwit per 100 g</small></div><div class="inrow"><input type="number" inputmode="decimal" placeholder="gram" id="g_' + f.id + '" value="' + (f.unitG || '') + '"><button class="btn ghost" data-act="pickFood" data-id="' + f.id + '">+</button></div></div>').join('');
}
ACT.libSearch = el => { $('#libres').innerHTML = libResults(el.value); };
document.addEventListener('keyup', e => { if (e.target.id === 'libq') $('#libres').innerHTML = libResults(e.target.value); });
ACT.pickTab = el => { PICK_TAB = el.dataset.t; renderPicker(); };
ACT.pickPrep = el => { const p = prepById(el.dataset.id); const it = itemFromPrep(p, Number(el.dataset.p)); closeSheet(); PICK_CB && PICK_CB([it]); };
ACT.pickFood = el => {
  const f = DB.foods.find(x => x.id === el.dataset.id); const g = Number(($('#g_' + f.id).value || '').replace(',', '.'));
  if (!g) return toast('Vul het aantal gram in.');
  f.unitG = g; save(); closeSheet(); PICK_CB && PICK_CB([itemFromFood(f, g)]);
};
ACT.pickFree = () => {
  const desc = $('#vdesc').value.trim(); if (!desc) return toast('Wat at je?');
  const num = id => { const v = $(id).value.replace(',', '.'); return v === '' ? null : Number(v); };
  const it = { id: uid(), src: 'vrij', desc, kcal: num('#vkcal'), protein: num('#vprot'), fiber: num('#vfib') };
  closeSheet(); PICK_CB && PICK_CB([it]);
};

/* ---------- barcode scannen (Open Food Facts, online) ---------- */
let SCAN = null;
async function scanBarcode(onFood) {
  let h = '<div class="sheet-h"><h2>Barcode scannen</h2><button class="iconbtn" data-act="closeSheet">✕</button></div>';
  const supported = 'BarcodeDetector' in window;
  h += supported ? '<video id="scanv" playsinline muted></video><p class="muted small">Richt de camera op de barcode.</p>' : '<p class="note">Je browser ondersteunt geen camerascan. Typ de barcode in.</p>';
  h += '<div class="inrow"><input id="bcode" type="text" inputmode="numeric" placeholder="barcode (EAN)"><button class="btn ghost" data-act="lookupCode">Zoek</button></div><div id="scanmsg"></div>';
  $('#sheet .sheet-in').innerHTML = h; $('#sheet').hidden = false;
  SCAN = { onFood };
  if (!supported) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    SCAN.stream = stream;
    const v = $('#scanv'); v.srcObject = stream; await v.play();
    const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    const loop = async () => {
      if (!SCAN || !SCAN.stream) return;
      try { const r = await det.detect(v); if (r.length) { $('#bcode').value = r[0].rawValue; stopScan(true); return lookup(r[0].rawValue); } } catch (e) { }
      SCAN.t = setTimeout(loop, 300);
    };
    loop();
  } catch (e) { $('#scanmsg').innerHTML = '<p class="note">Camera niet beschikbaar: ' + esc(e.message) + '</p>'; }
}
function stopScan(keep) { if (SCAN && SCAN.stream) { SCAN.stream.getTracks().forEach(t => t.stop()); SCAN.stream = null; clearTimeout(SCAN.t); } if (!keep) SCAN = null; }
ACT.lookupCode = () => lookup($('#bcode').value.trim());
async function lookup(code) {
  if (!code) return;
  const m = $('#scanmsg'); m.innerHTML = '<p class="muted">Zoeken…</p>';
  const known = DB.foods.find(f => f.barcode === code);
  if (known) { SCAN.onFood(known); return; }
  if (!navigator.onLine) { m.innerHTML = '<p class="note">Offline: barcode opzoeken kan niet. Voeg het product manueel toe.</p>'; return; }
  try {
    const r = await fetch('https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(code) + '.json?fields=product_name,product_name_nl,brands,nutriments,serving_quantity');
    const j = await r.json();
    if (!j.product) throw new Error('Product niet gevonden in Open Food Facts.');
    const n = j.product.nutriments || {};
    const num = x => isNum(Number(x)) && x !== undefined && x !== '' ? Math.round(Number(x) * 10) / 10 : null;
    const food = { id: uid(), barcode: code, name: [j.product.product_name_nl || j.product.product_name, j.product.brands].filter(Boolean).join(' – ') || code,
      per: { kcal: num(n['energy-kcal_100g']), protein: num(n.proteins_100g), carbs: num(n.carbohydrates_100g), fat: num(n.fat_100g), fiber: num(n.fiber_100g) }, unitG: num(j.product.serving_quantity) };
    DB.foods.push(food); save();
    SCAN.onFood(food);
  } catch (e) { m.innerHTML = '<p class="note">' + esc(e.message) + ' Vul de waarden van het etiket zelf in.</p>'; }
}
ACT.scanFood = () => scanBarcode(food => { PICK_TAB = 'lib'; renderPicker('Gevonden: ' + food.name + '. Vul het aantal gram in.'); const q = $('#libq'); if (q) { q.value = food.name; $('#libres').innerHTML = libResults(food.name); } });

/* ================= dagboek ================= */
function renderDays() {
  const keys = Object.keys(DB.days).sort().reverse();
  let h = header('Dagboek', keys.length + ' dagen geregistreerd');
  h += '<div class="inrow"><button class="btn" data-act="newEntry">+ Iets noteren</button><button class="btn ghost" data-act="pickDate">Andere dag</button><input type="date" id="pdate" hidden data-chg="openDate"></div>';
  h += '<div class="card table">' + keys.map(k => {
    const d = DB.days[k], kc = dayNutr(d, 'kcal');
    return '<a class="tr day" href="#/dag/' + k + '"><span>' + fmtDay(k, true) + '</span><b>' + (kc ? (kc.lb ? '≥ ' : '≈ ') + fmtNum(kc.v) + ' kcal' : '–') + '</b><small>' +
      [isNum(d.steps) ? fmtNum(d.steps) + ' st.' : '', isNum(d.mood) ? 'stemming ' + d.mood : '', isNum(d.sleepH) ? d.sleepH + ' u slaap' : '', isNum(d.weight) ? d.weight + ' kg' : ''].filter(Boolean).join(' · ') + '</small></a>';
  }).join('') + '</div>';
  view().innerHTML = h;
}
ACT.newEntry = () => go('#/checkin/vrij');
ACT.pickDate = () => { const i = $('#pdate'); i.hidden = false; i.showPicker ? i.showPicker() : i.focus(); };
ACT.openDate = el => { if (el.value) go('#/dag/' + el.value); };

function renderDay(k) {
  const d = getDay(k, true);
  let h = header(fmtDay(k, true), 'Alles van deze dag', true);
  h += mealsList(d, k, true);
  h += '<div class="chips">' + SLOT_ORDER.map(s => '<button class="chip add" data-act="dayAdd" data-k="' + k + '" data-s="' + s + '">+ ' + SLOTS[s].toLowerCase() + '</button>').join('') + '</div>';
  const f = (n, l, u, step) => '<label class="fld"><span>' + l + '</span><div class="inrow"><input type="' + (step === 'text' ? 'text' : 'number') + '" inputmode="decimal" step="' + (step || 'any') + '" data-dk="' + n + '" value="' + (d[n] === undefined || d[n] === null ? '' : esc(n === 'waterMl' && isNum(d[n]) ? d[n] / 1000 : d[n])) + '">' + (u ? '<em>' + u + '</em>' : '') + '</div></label>';
  h += '<div class="card"><h3>Cijfers</h3><p class="muted small">"?" = onbekend. Slaap = de nacht ervóór.</p><div class="grid2">' +
    f('weight', 'Gewicht', 'kg', '0.1') + f('sleepH', 'Slaap', 'u', '0.25') + f('energy', 'Energie', '/10', '1') + f('mood', 'Stemming', '/10', '1') +
    f('steps', 'Stappen', '', '1') + f('waterMl', 'Water', 'l', '0.25') + f('caffeine', 'Cafeïne', 'shots', '1') + f('alcohol', 'Alcohol', 'glazen', '1') + '</div>' +
    f('cpap', 'CPAP', '', 'text') + f('vape', 'Vapen', '', 'text') + f('moodNote', 'Waarom zo (stemming)', '', 'text') + f('notes', 'Notitie', '', 'text') +
    (d.kcalOverride ? '<p class="muted small">Kcal van deze dag komt uit een dagschatting (' + (d.kcalOverride.lb ? '≥ ' : '≈ ') + fmtNum(d.kcalOverride.v) + '). <button class="link" data-act="dropOverride" data-k="' + k + '">Gebruik de maaltijden</button></p>' : '') +
    '<button class="btn" data-act="saveDay" data-k="' + k + '">Cijfers bewaren</button></div>';
  if (d.done && Object.keys(d.done).length) h += '<p class="muted small">Check-ins gedaan: ' + DB.reminders.filter(r => d.done[r.id]).map(r => r.label).join(', ') + '</p>';
  h += '<button class="link danger" data-act="delDay" data-k="' + k + '">Hele dag verwijderen</button>';
  view().innerHTML = h;
}
ACT.dayAdd = el => openPicker(items => { const d = getDay(el.dataset.k, true); items.forEach(it => { it.slot = el.dataset.s; it.time = ''; d.meals.push(it); if (it.prepId) usePortion(it.prepId, it.portion); }); save(); render(); });
ACT.saveDay = el => {
  const d = getDay(el.dataset.k, true);
  document.querySelectorAll('[data-dk]').forEach(i => {
    const n = i.dataset.dk; let v = i.value.trim();
    if (i.type === 'number') { v = v === '' ? null : Number(v.replace(',', '.')); if (n === 'waterMl' && isNum(v)) v = Math.round(v * 1000); }
    else if (v === '') v = null;
    d[n] = v;
  });
  save(); toast('Bewaard'); render();
};
ACT.dropOverride = el => { delete getDay(el.dataset.k).kcalOverride; save(); render(); };
ACT.delMeal = el => { const d = getDay(el.dataset.k); const m = d.meals.find(x => x.id === el.dataset.id); if (!confirm('Verwijderen: ' + (m.desc || 'item') + '?')) return; if (m.prepId) usePortion(m.prepId, -m.portion); d.meals = d.meals.filter(x => x !== m); save(); render(); };
ACT.delDay = el => { if (!confirm('Hele dag ' + fmtDay(el.dataset.k) + ' verwijderen?')) return; delete DB.days[el.dataset.k]; save(); go('#/dagboek'); };
ACT.editMeal = el => {
  const d = getDay(el.dataset.k); const m = d.meals.find(x => x.id === el.dataset.id);
  $('#sheet .sheet-in').innerHTML = '<div class="sheet-h"><h2>Wijzigen</h2><button class="iconbtn" data-act="closeSheet">✕</button></div>' +
    '<label class="fld"><span>Omschrijving</span><input id="em_desc" value="' + esc(m.desc || '') + '"></label>' +
    '<div class="grid2"><label class="fld"><span>Tijd</span><input id="em_time" type="time" value="' + esc(m.time || '') + '"></label><label class="fld"><span>Moment</span><select id="em_slot">' + SLOT_ORDER.map(s => '<option value="' + s + '"' + (m.slot === s ? ' selected' : '') + '>' + SLOTS[s] + '</option>').join('') + '</select></label>' +
    '<label class="fld"><span>kcal</span><input id="em_kcal" type="number" inputmode="decimal" value="' + (isNum(m.kcal) ? m.kcal : '') + '"></label><label class="fld"><span>eiwit g</span><input id="em_protein" type="number" inputmode="decimal" value="' + (isNum(m.protein) ? m.protein : '') + '"></label>' +
    '<label class="fld"><span>vezels g</span><input id="em_fiber" type="number" inputmode="decimal" value="' + (isNum(m.fiber) ? m.fiber : '') + '"></label></div>' +
    '<button class="btn" data-act="saveMeal" data-k="' + el.dataset.k + '" data-id="' + m.id + '">Bewaren</button>';
  $('#sheet').hidden = false;
};
ACT.saveMeal = el => {
  const m = getDay(el.dataset.k).meals.find(x => x.id === el.dataset.id);
  const num = id => { const v = $(id).value.replace(',', '.'); return v === '' ? null : Number(v); };
  m.desc = $('#em_desc').value; m.time = $('#em_time').value; m.slot = $('#em_slot').value; m.nothing = false;
  m.kcal = num('#em_kcal'); m.protein = num('#em_protein'); m.fiber = num('#em_fiber'); delete m.lb;
  save(); closeSheet(); render();
};

/* ================= mealprep ================= */
function renderPreps() {
  let h = header('Mealprep', 'Bereken je preps uit etiketten en hoeveelheden');
  h += '<button class="btn" data-act="newPrep">+ Nieuwe mealprep berekenen</button>';
  const list = DB.preps.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  h += list.map(p => {
    const { per } = prepTotals(p);
    return '<a class="card prepc' + (p.left > 0 ? '' : ' empty') + '" href="#/prep/' + p.id + '"><div class="pc-h"><b>' + esc(p.name) + '</b><span class="pill">' + (isNum(p.left) ? fmtNum(p.left, p.left % 1 ? 2 : 0) + ' / ' + p.portions + ' over' : p.portions + ' porties') + '</span></div>' +
      '<div class="macro">' + ['kcal', 'protein', 'carbs', 'fat', 'fiber'].map(n => '<span><b>' + fmtNum(per[n]) + '</b>' + (n === 'kcal' ? 'kcal' : 'g ' + NUTR_LABEL[n]) + '</span>').join('') + '</div>' +
      '<small class="muted">per portie · gemaakt ' + (p.date ? fmtDay(p.date) : '?') + (p.plan ? ' · ' + esc(p.plan) : '') + '</small></a>';
  }).join('');
  h += '<h2 class="sec">Bibliotheek</h2><p class="muted small">' + DB.foods.length + ' producten met voedingswaarden per 100 g. Ze worden automatisch bewaard als je een etiket invult of scant.</p>';
  view().innerHTML = h;
}
ACT.newPrep = () => { PREP = { id: uid(), name: '', date: todayKey(), portions: 3, left: 3, plan: '', cooked: null, ingredients: [blankIng()] , isNew: true }; go('#/prep/nieuw'); };
function blankIng() { return { id: uid(), name: '', grams: null, mode: 'per100', per: { kcal: null, protein: null, carbs: null, fat: null, fiber: null } }; }
function renderPrep(id) {
  if (id !== 'nieuw' && (!PREP || PREP.id !== id)) { const p = prepById(id); if (!p) return go('#/preps'); PREP = JSON.parse(JSON.stringify(p)); }
  if (!PREP) return go('#/preps');
  const P = PREP;
  let h = header(P.isNew ? 'Nieuwe mealprep' : P.name, 'Vul per ingrediënt de hoeveelheid en het etiket in', true);
  h += '<div class="card"><label class="fld"><span>Naam</span><input data-pp="name" value="' + esc(P.name) + '" placeholder="bv. Chili met bioburger en rijst"></label>' +
    '<div class="grid2"><label class="fld"><span>Porties</span><input type="number" inputmode="numeric" data-pp="portions" value="' + P.portions + '"></label><label class="fld"><span>Nog over</span><input type="number" inputmode="decimal" step="0.25" data-pp="left" value="' + (isNum(P.left) ? P.left : '') + '"></label></div><label class="fld"><span>Gemaakt op</span><input type="date" data-pp="date" value="' + esc(P.date || '') + '"></label>' +
    '<label class="fld"><span>Planning (optioneel)</span><input data-pp="plan" value="' + esc(P.plan || '') + '" placeholder="bv. lunch ma–wo"></label>' +
    '<label class="fld"><span>Gewicht bereid, hele pot (optioneel)</span><div class="inrow"><input type="number" inputmode="decimal" data-pp="cooked" value="' + (isNum(P.cooked) ? P.cooked : '') + '"><em>g</em></div></label></div>';
  h += '<h2 class="sec">Ingrediënten</h2>';
  h += P.ingredients.map((g, i) => '<div class="card ing" data-i="' + i + '">' +
    '<div class="inrow"><input class="grow" data-pp="ing.' + i + '.name" value="' + esc(g.name) + '" placeholder="Ingrediënt" list="foodlist"><button class="iconbtn sm" data-act="delIng" data-i="' + i + '" aria-label="Verwijder">✕</button></div>' +
    '<div class="grid2"><label class="fld"><span>Hoeveelheid (hele prep)</span><div class="inrow"><input type="number" inputmode="decimal" data-pp="ing.' + i + '.grams" value="' + (isNum(g.grams) ? g.grams : '') + '"><em>g/ml</em></div></label>' +
    '<label class="fld"><span>Waarden zijn</span><select data-pp="ing.' + i + '.mode"><option value="per100"' + (g.mode !== 'totaal' ? ' selected' : '') + '>per 100 g (etiket)</option><option value="totaal"' + (g.mode === 'totaal' ? ' selected' : '') + '>totaal voor deze hoeveelheid</option></select></label></div>' +
    '<div class="grid5">' + NUTR.map(n => '<label class="fld"><span>' + NUTR_LABEL[n] + '</span><input type="number" inputmode="decimal" data-pp="ing.' + i + '.per.' + n + '" value="' + (isNum(g.per[n]) ? g.per[n] : '') + '"></label>').join('') + '</div>' +
    '<div class="chips"><button class="chip" data-act="ingLib" data-i="' + i + '">Uit bibliotheek</button><button class="chip" data-act="ingScan" data-i="' + i + '">Scan barcode</button>' + (DB.settings.apiKey ? '<label class="chip">Foto etiket (AI)<input type="file" accept="image/*" capture="environment" hidden data-chg="ingPhoto" data-i="' + i + '"></label>' : '') + '</div>' +
    '<small class="muted" id="ingsum_' + i + '">' + ingSummary(g) + '</small></div>').join('');
  h += '<datalist id="foodlist">' + DB.foods.map(f => '<option value="' + esc(f.name) + '">').join('') + '</datalist>';
  h += '<button class="btn ghost" data-act="addIng">+ ingrediënt</button>';
  h += '<div class="card sticky" id="preptot">' + prepTotalsHtml() + '</div>';
  h += '<div class="inrow"><button class="btn big" data-act="savePrep">Bewaar mealprep</button>' + (P.isNew ? '' : '<button class="btn ghost" data-act="sharePrep">Deel</button>') + '</div>';
  if (!P.isNew) h += '<div class="inrow"><button class="link" data-act="dupPrep">Opnieuw maken (kopie)</button><button class="link danger" data-act="delPrep">Verwijderen</button></div>';
  view().innerHTML = h;
}
function ingSummary(g) {
  const t = ingTotals(g);
  if (!isNum(t.kcal)) return 'Nog geen kcal.';
  return 'Samen ≈ ' + fmtNum(t.kcal) + ' kcal' + (isNum(t.protein) ? ', ' + fmtNum(t.protein) + ' g eiwit' : '') + ' in de hele prep.';
}
function prepTotalsHtml() {
  const { tot, per, missing } = prepTotals(PREP);
  const p = Math.max(1, Number(PREP.portions) || 1);
  let h = '<div class="pt-h"><b>Per portie</b><small>' + p + ' porties</small></div><div class="macro big">' + NUTR.map(n => '<span><b>' + fmtNum(per[n]) + '</b>' + (n === 'kcal' ? 'kcal' : 'g ' + NUTR_LABEL[n]) + '</span>').join('') + '</div>';
  h += '<small class="muted">Hele prep ≈ ' + fmtNum(tot.kcal) + ' kcal, ' + fmtNum(tot.protein) + ' g eiwit' + (isNum(PREP.cooked) ? ' · ≈ ' + fmtNum(PREP.cooked / p) + ' g bereid per portie' : '') + '.';
  const miss = NUTR.filter(n => missing[n]).map(n => NUTR_LABEL[n]);
  if (miss.length) h += ' Ontbreekt bij sommige ingrediënten: ' + miss.join(', ') + ' (telt als 0).';
  if (per.kcal) h += ' Eiwit levert ' + Math.round(per.protein * 4 / per.kcal * 100) + '% van de kcal.';
  return h + '</small>';
}
function prepInput(el) {
  const path = el.dataset.pp.split('.');
  let v = el.value;
  const numeric = el.type === 'number';
  if (numeric) v = v === '' ? null : Number(v.replace(',', '.'));
  if (path[0] === 'ing') {
    const g = PREP.ingredients[Number(path[1])];
    if (path[2] === 'per') g.per[path[3]] = v; else g[path[2]] = v;
    if (path[2] === 'name') {
      const f = DB.foods.find(x => x.name.toLowerCase() === String(v).toLowerCase());
      if (f && NUTR.every(n => !isNum(g.per[n]))) { g.per = Object.assign({}, f.per); g.mode = 'per100'; g.foodId = f.id; const y = scrollY; renderPrep(PREP.id); scrollTo(0, y); return; }
    }
    const s = $('#ingsum_' + path[1]); if (s) s.textContent = ingSummary(g);
  } else {
    if (path[0] === 'portions' && isNum(v) && (PREP.isNew || PREP.left === PREP.portions)) { PREP.left = v; const l = document.querySelector('[data-pp="left"]'); if (l) l.value = v; }
    PREP[path[0]] = v;
  }
  $('#preptot').innerHTML = prepTotalsHtml();
}
ACT.addIng = () => { PREP.ingredients.push(blankIng()); const y = scrollY; renderPrep(PREP.isNew ? 'nieuw' : PREP.id); scrollTo(0, y + 200); };
ACT.delIng = el => { PREP.ingredients.splice(Number(el.dataset.i), 1); if (!PREP.ingredients.length) PREP.ingredients.push(blankIng()); const y = scrollY; renderPrep(PREP.isNew ? 'nieuw' : PREP.id); scrollTo(0, y); };
function fillIng(i, food) {
  const g = PREP.ingredients[i];
  g.name = g.name || food.name; g.per = Object.assign({}, food.per); g.mode = 'per100'; g.foodId = food.id;
  closeSheet(); const y = scrollY; renderPrep(PREP.isNew ? 'nieuw' : PREP.id); scrollTo(0, y);
}
ACT.ingScan = el => { const i = Number(el.dataset.i); $('#sheet').hidden = false; scanBarcode(food => fillIng(i, food)); };
ACT.ingLib = el => {
  const i = Number(el.dataset.i);
  $('#sheet .sheet-in').innerHTML = '<div class="sheet-h"><h2>Uit bibliotheek</h2><button class="iconbtn" data-act="closeSheet">✕</button></div>' +
    (DB.foods.length ? DB.foods.map(f => '<button class="pick wide" data-act="ingLibPick" data-i="' + i + '" data-id="' + f.id + '"><b>' + esc(f.name) + '</b><small>' + fmtNum(f.per.kcal) + ' kcal / 100 g</small></button>').join('') : '<p class="muted">Je bibliotheek is nog leeg.</p>');
  $('#sheet').hidden = false;
};
ACT.ingLibPick = el => fillIng(Number(el.dataset.i), DB.foods.find(f => f.id === el.dataset.id));
ACT.ingPhoto = async el => {
  const i = Number(el.dataset.i), file = el.files[0]; if (!file) return;
  toast('Etiket lezen…');
  try {
    const r = await aiReadLabel(file);
    const food = { id: uid(), name: r.name || PREP.ingredients[i].name || 'Product', per: { kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, fiber: r.fiber } };
    if (PREP.ingredients[i].name) food.name = PREP.ingredients[i].name;
    DB.foods.push(food); save(); fillIng(i, food); toast('Etiket gelezen. Controleer even de cijfers.');
  } catch (e) { toast(e.message); }
};
ACT.savePrep = () => {
  if (!PREP.name.trim()) return toast('Geef de mealprep een naam.');
  const ingr = PREP.ingredients.filter(g => g.name || isNum(g.grams));
  if (!ingr.length) return toast('Voeg minstens één ingrediënt toe.');
  PREP.ingredients = ingr;
  for (const g of ingr) {
    if (g.mode === 'per100' && g.name && NUTR.some(n => isNum(g.per[n])) && !DB.foods.some(f => f.name.toLowerCase() === g.name.toLowerCase())) DB.foods.push({ id: uid(), name: g.name, per: Object.assign({}, g.per) });
  }
  const isNew = PREP.isNew; delete PREP.isNew;
  if (!isNum(PREP.left)) PREP.left = PREP.portions;
  const i = DB.preps.findIndex(p => p.id === PREP.id);
  if (i >= 0) DB.preps[i] = PREP; else DB.preps.push(PREP);
  save(); toast(isNew ? 'Mealprep bewaard. Je kan hem kiezen bij elke check-in.' : 'Bewaard');
  const id = PREP.id; PREP = null; go('#/prep/' + id);
};
ACT.dupPrep = () => { const c = JSON.parse(JSON.stringify(PREP)); c.id = uid(); c.date = todayKey(); c.left = c.portions; c.isNew = true; PREP = c; go('#/prep/nieuw'); };
ACT.delPrep = () => { if (!confirm('Mealprep verwijderen? Wat je al at, blijft in je dagboek.')) return; DB.preps = DB.preps.filter(p => p.id !== PREP.id); save(); PREP = null; go('#/preps'); };
ACT.sharePrep = () => {
  const { per, tot } = prepTotals(PREP);
  const txt = PREP.name + ' (' + PREP.portions + ' porties, gemaakt ' + fmtDay(PREP.date || todayKey()) + ')\n' +
    PREP.ingredients.map(g => '- ' + g.name + ': ' + (g.grams ?? '?') + ' g' + (g.mode === 'per100' && isNum(g.per.kcal) ? ' (' + g.per.kcal + ' kcal/100 g)' : '')).join('\n') +
    '\nPer portie ≈ ' + fmtNum(per.kcal) + ' kcal, ' + fmtNum(per.protein) + ' g eiwit, ' + fmtNum(per.carbs) + ' g koolhydraten, ' + fmtNum(per.fat) + ' g vet, ' + fmtNum(per.fiber) + ' g vezels. Hele prep ≈ ' + fmtNum(tot.kcal) + ' kcal (ruwe schatting).';
  shareText(txt, PREP.name);
};
async function shareText(txt, title) {
  if (navigator.share) { try { await navigator.share({ title, text: txt }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(txt); toast('Gekopieerd naar het klembord'); } catch (e) { prompt('Kopieer:', txt); }
}

/* ================= inzicht ================= */
function insightCard(i) {
  return '<div class="card ins ' + i.tone + '"><div class="ins-h"><span class="tag">' + i.cat + '</span><b>' + esc(i.title) + '</b></div><p>' + esc(i.text).replace(/\n/g, '<br>') + '</p><small class="muted">Op basis van ' + esc(i.evidence) + '</small></div>';
}
function renderInsights() {
  const ins = buildInsights(30);
  let h = header('Inzicht en advies', 'Laatste 30 dagen · offline berekend');
  h += '<p class="muted small">Dit zijn verbanden in je eigen cijfers, geen oorzaken en geen diagnose. Hoe meer dagen volledig ingevuld, hoe betrouwbaarder.</p>';
  h += ins.length ? ins.map(insightCard).join('') : '<p class="card muted">Nog te weinig gegevens. Na een paar dagen check-ins verschijnen hier je eerste analyses.</p>';
  h += '<h2 class="sec">Diepere analyse met AI</h2>';
  if (DB.settings.apiKey) {
    h += '<div class="card"><label class="fld"><span>Vraag (optioneel)</span><textarea id="aiq" rows="2" placeholder="bv. Waarom voel ik me op woensdag zo moe?"></textarea></label><button class="btn" data-act="runAI">Analyseer mijn laatste 3 weken</button><div id="aiout"></div></div>';
  } else {
    h += '<p class="card muted small">Stel een eigen Claude API-sleutel in bij Meer → AI om hier op knop een diepere analyse te vragen. Zonder sleutel kan je de samenvatting delen en in een chat plakken.</p>';
  }
  h += '<div class="inrow"><button class="btn ghost" data-act="shareWeek">Deel weeksamenvatting</button></div>';
  if (DB.ai.length) h += '<h2 class="sec">Eerdere analyses</h2>' + DB.ai.slice().reverse().slice(0, 5).map(a => '<details class="card"><summary>' + fmtDay(a.k, true) + (a.q ? ' · ' + esc(a.q) : '') + '</summary>' + mdLite(a.text) + '</details>').join('');
  view().innerHTML = h;
}
ACT.runAI = async el => {
  const out = $('#aiout'); const q = $('#aiq').value.trim();
  el.disabled = true; out.innerHTML = '<p class="muted">Bezig met analyseren…</p>';
  try {
    const text = await askAI(q);
    DB.ai.push({ k: todayKey(), q, text }); if (DB.ai.length > 30) DB.ai.shift(); save();
    out.innerHTML = mdLite(text);
  } catch (e) { out.innerHTML = '<p class="note">' + esc(e.message) + '</p>'; }
  el.disabled = false;
};
ACT.shareWeek = () => shareText(weekSummaryText(7), 'Weeksamenvatting');
function mdLite(t) {
  const lines = esc(t).split('\n'); let h = '', inList = false;
  for (let l of lines) {
    l = l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    if (/^\s*[-•*]\s+/.test(l)) { if (!inList) { h += '<ul>'; inList = true; } h += '<li>' + l.replace(/^\s*[-•*]\s+/, '') + '</li>'; continue; }
    if (inList) { h += '</ul>'; inList = false; }
    if (/^#+\s/.test(l)) h += '<h3>' + l.replace(/^#+\s/, '') + '</h3>';
    else if (l.trim()) h += '<p>' + l + '</p>';
  }
  return '<div class="ai">' + h + (inList ? '</ul>' : '') + '</div>';
}

/* ================= meer / instellingen ================= */
function renderMore(sub) {
  let h = header('Meer', '');
  const G = DB.goals, P = DB.profile, S = DB.settings;
  h += '<div class="card"><h3>Herinneringen</h3><p class="muted small">Pas tijden aan of voeg er toe. Zo kan je ook op een andere dag andere tijden gebruiken.</p>';
  h += DB.reminders.map((r, i) => '<div class="rem"><input type="checkbox" ' + (r.on ? 'checked' : '') + ' data-chg="remOn" data-i="' + i + '" aria-label="aan"><input type="time" value="' + r.time + '" data-chg="remTime" data-i="' + i + '"><input type="text" value="' + esc(r.label) + '" data-chg="remLabel" data-i="' + i + '"><select data-chg="remKind" data-i="' + i + '">' + [['ontbijt', 'ontbijt + weging'], ['lunch', 'lunch'], ['avond', 'avondeten'], ['dag', 'dagopname'], ['vrij', 'vrij']].map(([v, l]) => '<option value="' + v + '"' + (r.kind === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select><button class="iconbtn sm" data-act="remDel" data-i="' + i + '" aria-label="verwijder">✕</button></div>').join('');
  h += '<button class="btn ghost" data-act="remAdd">+ herinnering</button>';
  h += '<h3>Meldingen op je gsm</h3><p class="muted small">Een web-app kan geen meldingen inplannen terwijl hij dicht is. Daarom twee betrouwbare manieren die ook offline werken:</p>' +
    '<ol class="small"><li><b>Agenda (aanbevolen):</b> download het agendabestand en importeer het in Google Agenda of Samsung Agenda. Elke herinnering geeft een melding met een link die meteen de juiste check-in opent.</li><li><b>Wekker:</b> zet per herinnering een terugkerende wekker in je Klok-app.</li></ol>' +
    '<div class="inrow"><button class="btn" data-act="ics">Download agendabestand (.ics)</button></div>' +
    '<div class="chips">' + DB.reminders.filter(r => r.on).map(r => '<a class="chip" href="' + alarmIntent(r) + '">⏰ ' + r.time + '</a>').join('') + '</div>' +
    '<label class="fld"><span>Adres van deze app (voor de links in de agenda)</span><input type="url" value="' + esc(S.appUrl || appBase()) + '" data-chg="setAppUrl"></label>' +
    '<label class="toggle"><input type="checkbox" ' + (S.notify ? 'checked' : '') + ' data-chg="setNotify"> Ook meldingen geven zolang de app open staat</label></div>';

  h += '<div class="card"><h3>Profiel en doelen</h3><div class="grid2">' +
    gfield('profile.name', 'Naam', P.name, 'text') + gfield('profile.age', 'Leeftijd', P.age) + gfield('profile.heightCm', 'Lengte (cm)', P.heightCm) +
    gfield('goals.kcal', 'Kcal per dag', G.kcal) + gfield('goals.protein', 'Eiwit (g)', G.protein) + gfield('goals.fiber', 'Vezels (g)', G.fiber) + gfield('goals.waterMl', 'Water (ml)', G.waterMl) +
    gfield('goals.stepsMin', 'Stappen min.', G.stepsMin) + gfield('goals.stepsMax', 'Stappen max.', G.stepsMax) + gfield('goals.sleepH', 'Slaap (u)', G.sleepH) + gfield('goals.caffeineMax', 'Max. cafeïne (shots)', G.caffeineMax) +
    gfield('settings.glassMl', 'Eén glas = ml', S.glassMl) + '</div>' +
    '<label class="fld"><span>Context voor analyses (medisch, werk, gewoontes)</span><textarea rows="4" data-chg="setG" data-p="profile.notes">' + esc(P.notes || '') + '</textarea></label></div>';

  h += '<div class="card"><h3>AI (optioneel)</h3><p class="muted small">Met een eigen Claude API-sleutel (console.anthropic.com) kan de app een diepere analyse maken, etiketten van een foto lezen en een markdown-dagboek inlezen. Je betaalt per gebruik; één analyse kost meestal een paar cent. De sleutel blijft op dit toestel en zit niet in back-ups.</p>' +
    '<label class="fld"><span>API-sleutel</span><input type="password" autocomplete="off" value="' + esc(S.apiKey) + '" data-chg="setG" data-p="settings.apiKey" placeholder="sk-ant-…"></label>' +
    '<label class="fld"><span>Model</span><input type="text" value="' + esc(S.model) + '" data-chg="setG" data-p="settings.model"></label></div>';

  h += '<div class="card"><h3>Back-up en import</h3><p class="muted small">Alles staat enkel op deze gsm. Maak geregeld een back-up (bv. wekelijks naar Drive).</p>' +
    '<div class="inrow wrap"><button class="btn" data-act="exportData">Back-up maken</button><label class="btn ghost">Back-up of dagboek importeren<input type="file" accept=".json,application/json" hidden data-chg="importFile"></label></div>' +
    '<div class="inrow wrap"><label class="btn ghost">Markdown-dagboek inlezen (AI)<input type="file" accept=".md,.txt,text/plain,text/markdown" hidden data-chg="importMd"></label><button class="btn ghost" data-act="shareWeek">Weeksamenvatting delen</button></div>' +
    '<button class="link" data-act="redoIntake">Intake opnieuw doen</button> · <button class="link danger" data-act="wipe">Alles wissen</button></div>';
  h += '<p class="muted small center">Voedingsdagboek · werkt offline · versie ' + APP_VERSION + '</p>';
  view().innerHTML = h;
}
function gfield(p, l, v, type) { return '<label class="fld"><span>' + l + '</span><input type="' + (type || 'number') + '" inputmode="' + (type ? 'text' : 'decimal') + '" value="' + (v === null || v === undefined ? '' : esc(v)) + '" data-chg="setG" data-p="' + p + '"></label>'; }
ACT.setG = el => {
  const [a, b] = el.dataset.p.split('.');
  let v = el.value; if (el.type === 'number') v = v === '' ? null : Number(v.replace(',', '.'));
  DB[a][b] = v; save(); toast('Bewaard');
};
ACT.remOn = el => { DB.reminders[el.dataset.i].on = el.checked; save(); };
ACT.remTime = el => { DB.reminders[el.dataset.i].time = el.value; DB.reminders.sort((a, b) => a.time.localeCompare(b.time)); save(); render(); };
ACT.remLabel = el => { DB.reminders[el.dataset.i].label = el.value; save(); };
ACT.remKind = el => { DB.reminders[el.dataset.i].kind = el.value; save(); };
ACT.remDel = el => { if (!confirm('Herinnering verwijderen?')) return; DB.reminders.splice(Number(el.dataset.i), 1); save(); render(); };
ACT.remAdd = () => { DB.reminders.push({ id: 'r' + uid(), label: 'Tussendoor', time: '16:00', kind: 'vrij', on: true }); DB.reminders.sort((a, b) => a.time.localeCompare(b.time)); save(); render(); };
ACT.setAppUrl = el => { DB.settings.appUrl = el.value.trim(); save(); };
ACT.setNotify = async el => {
  if (el.checked) {
    if (!('Notification' in window)) { el.checked = false; return toast('Meldingen niet ondersteund.'); }
    const p = await Notification.requestPermission();
    if (p !== 'granted') { el.checked = false; return toast('Meldingen niet toegestaan.'); }
  }
  DB.settings.notify = el.checked; save();
};
function appBase() { return location.origin + location.pathname; }
function alarmIntent(r) {
  const [hh, mm] = r.time.split(':').map(Number);
  return 'intent:#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.alarm.HOUR=' + hh + ';i.android.intent.extra.alarm.MINUTES=' + mm + ';S.android.intent.extra.alarm.MESSAGE=' + encodeURIComponent('Voedingsdagboek: ' + r.label) + ';end';
}
ACT.ics = () => {
  const base = DB.settings.appUrl || appBase();
  const start = todayKey().replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const fold = s => s.replace(/[,;]/g, m => '\\' + m);
  let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Voedingsdagboek//NL\r\nCALSCALE:GREGORIAN\r\n' +
    'BEGIN:VTIMEZONE\r\nTZID:Europe/Brussels\r\nBEGIN:DAYLIGHT\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0200\r\nTZNAME:CEST\r\nDTSTART:19700329T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r\nEND:DAYLIGHT\r\nBEGIN:STANDARD\r\nTZOFFSETFROM:+0200\r\nTZOFFSETTO:+0100\r\nTZNAME:CET\r\nDTSTART:19701025T030000\r\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n';
  for (const r of DB.reminders.filter(x => x.on)) {
    const t = r.time.replace(':', '') + '00';
    const [hh, mm] = r.time.split(':').map(Number);
    const end = pad(mm + 5 >= 60 ? hh + 1 : hh) + pad((mm + 5) % 60) + '00';
    const link = base + '#/checkin/' + r.id;
    ics += 'BEGIN:VEVENT\r\nUID:' + r.id + '-' + start + '@voedingsdagboek\r\nDTSTAMP:' + stamp + '\r\nDTSTART;TZID=Europe/Brussels:' + start + 'T' + t + '\r\nDTEND;TZID=Europe/Brussels:' + start + 'T' + end + '\r\nRRULE:FREQ=DAILY\r\nTRANSP:TRANSPARENT\r\nCLASS:PRIVATE\r\n' +
      'SUMMARY:' + fold('Check-in: ' + r.label) + '\r\nDESCRIPTION:' + fold('Open je voedingsdagboek: ' + link) + '\r\nURL:' + link + '\r\n' +
      'BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:' + fold(r.label) + '\r\nTRIGGER:PT0M\r\nEND:VALARM\r\nEND:VEVENT\r\n';
  }
  ics += 'END:VCALENDAR\r\n';
  download('voedingsdagboek-herinneringen.ics', ics, 'text/calendar');
};
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
ACT.exportData = async () => {
  const name = 'voedingsdagboek-backup-' + todayKey() + '.json';
  const txt = exportJSON();
  const file = new File([txt], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); DB.settings.lastBackup = todayKey(); save(); return; } catch (e) { if (e.name === 'AbortError') return; } }
  download(name, txt, 'application/json'); DB.settings.lastBackup = todayKey(); save();
};
ACT.importFile = async el => {
  const f = el.files[0]; if (!f) return;
  try {
    const obj = JSON.parse(await f.text());
    const n = Object.keys(obj.days || {}).length;
    const mode = Object.keys(DB.days).length && !confirm(n + ' dagen gevonden. OK = samenvoegen met wat er al staat, Annuleren = alles vervangen.') ? 'replace' : 'merge';
    if (mode === 'replace' && !confirm('Zeker? Alles op deze gsm wordt vervangen.')) return;
    importJSON(obj, mode); toast(n + ' dagen ingelezen.'); go('#/');
  } catch (e) { alert('Import mislukt: ' + e.message); }
  el.value = '';
};
ACT.importMd = async el => {
  const f = el.files[0]; if (!f) return;
  if (!DB.settings.apiKey) { el.value = ''; return alert('Hiervoor is een API-sleutel nodig (Meer → AI). Zonder sleutel: importeer een .json-bestand.'); }
  toast('Dagboek wordt ingelezen… (kan een minuut duren)');
  try { const obj = await aiImportMarkdown(await f.text()); importJSON(obj, 'merge'); toast(Object.keys(obj.days || {}).length + ' dagen ingelezen. Controleer even in het dagboek.'); go('#/dagboek'); }
  catch (e) { alert('Inlezen mislukt: ' + e.message); }
  el.value = '';
};
ACT.redoIntake = () => go('#/intake/2');
ACT.wipe = () => { if (!confirm('Alles op deze gsm wissen? Maak eerst een back-up.')) return; if (!confirm('Echt alles wissen?')) return; localStorage.removeItem(STORE_KEY); DB = defaultData(); go('#/intake'); };

/* ================= intake ================= */
let INTAKE = null;
function renderIntake(step) {
  if (!INTAKE) INTAKE = { profile: Object.assign({}, DB.profile), goals: Object.assign({}, DB.goals), reminders: JSON.parse(JSON.stringify(DB.reminders)), weight: null };
  const I = INTAKE;
  let h = '';
  if (step === '1') {
    h = '<div class="hero"><h1>Voedingsdagboek</h1><p>Je eigen dagboek voor eten, drinken, slaap, stemming en stappen. Werkt offline, alles blijft op je gsm.</p></div>' +
      '<div class="card"><h3>Heb je al een dagboek?</h3><p class="muted small">Importeer het bestand dat je kreeg (.json). Dan staan je dagen, mealpreps, doelen en check-in-tijden er meteen in.</p><label class="btn">Dagboek importeren<input type="file" accept=".json,application/json" hidden data-chg="importFile"></label></div>' +
      '<div class="card"><h3>Nieuw beginnen</h3><p class="muted small">Een korte intake van 1 minuut: wie je bent, je doelen en wanneer je herinneringen wil.</p><button class="btn ghost" data-act="intakeGo" data-s="2">Start intake</button></div>';
  } else if (step === '2') {
    h = header('Over jou', 'Stap 1 van 3') + '<div class="card"><div class="grid2">' +
      ifield('profile.name', 'Naam', I.profile.name, 'text') +
      '<label class="fld"><span>Geslacht</span><select data-chg="intakeSet" data-p="profile.sex"><option value="m"' + (I.profile.sex === 'm' ? ' selected' : '') + '>man</option><option value="v"' + (I.profile.sex === 'v' ? ' selected' : '') + '>vrouw</option></select></label>' +
      ifield('profile.age', 'Leeftijd', I.profile.age) + ifield('profile.heightCm', 'Lengte (cm)', I.profile.heightCm) + ifield('weight', 'Gewicht nu (kg, optioneel)', I.weight) +
      '<label class="fld"><span>Activiteit</span><select data-chg="intakeSet" data-p="profile.activity">' + [['zittend', 'zittend werk'], ['licht', 'licht actief'], ['matig', 'matig actief'], ['actief', 'actief']].map(([v, l]) => '<option value="' + v + '"' + (I.profile.activity === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label></div>' +
      '<label class="fld"><span>Wat moet de app weten? (medisch, werk, gewoontes, wat je wil bereiken)</span><textarea rows="4" data-chg="intakeSet" data-p="profile.notes" placeholder="bv. CPAP voor slaapapneu, bureauwerk, vaak honger \'s avonds">' + esc(I.profile.notes || '') + '</textarea></label></div>' +
      '<button class="btn big" data-act="intakeGo" data-s="3">Verder</button>';
  } else if (step === '3') {
    const bmr = mifflin(I);
    h = header('Je doelen', 'Stap 2 van 3') + '<div class="card">' + (bmr ? '<p class="note">Onderhoud volgens de formule ≈ ' + fmtNum(bmr) + ' kcal per dag (Mifflin-St Jeor, geschat, niet gemeten). Kies je richtpunt eventueel samen met je diëtist.</p>' : '') + '<div class="grid2">' +
      ifield('goals.kcal', 'Kcal per dag', I.goals.kcal) + ifield('goals.protein', 'Eiwit (g)', I.goals.protein) + ifield('goals.fiber', 'Vezels (g)', I.goals.fiber) + ifield('goals.waterMl', 'Water (ml)', I.goals.waterMl) +
      ifield('goals.stepsMin', 'Stappen min.', I.goals.stepsMin) + ifield('goals.stepsMax', 'Stappen max.', I.goals.stepsMax) + ifield('goals.sleepH', 'Slaap (u)', I.goals.sleepH) + ifield('goals.caffeineMax', 'Max. cafeïne (shots)', I.goals.caffeineMax) + '</div></div>' +
      '<button class="btn big" data-act="intakeGo" data-s="4">Verder</button>';
  } else if (step === '4') {
    h = header('Je check-ins', 'Stap 3 van 3') + '<div class="card"><p class="muted small">Op deze momenten vraagt de app wat je at, dronk en hoe je je voelt. Je kan ze later altijd aanpassen.</p>' +
      I.reminders.map((r, i) => '<div class="rem"><input type="checkbox" ' + (r.on ? 'checked' : '') + ' data-chg="intakeRem" data-f="on" data-i="' + i + '"><input type="time" value="' + r.time + '" data-chg="intakeRem" data-f="time" data-i="' + i + '"><span>' + esc(r.label) + '</span></div>').join('') + '</div>' +
      '<button class="btn big" data-act="intakeDone">Klaar, start het dagboek</button>';
  }
  view().innerHTML = h;
}
function ifield(p, l, v, type) { return '<label class="fld"><span>' + l + '</span><input type="' + (type || 'number') + '" inputmode="' + (type ? 'text' : 'decimal') + '" value="' + (v === null || v === undefined ? '' : esc(v)) + '" data-chg="intakeSet" data-p="' + p + '"></label>'; }
ACT.intakeSet = el => {
  const parts = el.dataset.p.split('.');
  let v = el.value; if (el.type === 'number') v = v === '' ? null : Number(v.replace(',', '.'));
  if (parts.length === 1) INTAKE[parts[0]] = v; else INTAKE[parts[0]][parts[1]] = v;
};
ACT.intakeRem = el => { const r = INTAKE.reminders[el.dataset.i]; r[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value; };
ACT.intakeGo = el => go('#/intake/' + el.dataset.s);
function mifflin(I) {
  const w = I.weight || I.profile.startWeight, hgt = I.profile.heightCm, a = I.profile.age;
  if (!w || !hgt || !a) return null;
  const f = { zittend: 1.2, licht: 1.375, matig: 1.55, actief: 1.725 }[I.profile.activity] || 1.2;
  return Math.round((10 * w + 6.25 * hgt - 5 * a + (I.profile.sex === 'v' ? -161 : 5)) * f / 10) * 10;
}
ACT.intakeDone = () => {
  DB.profile = INTAKE.profile; DB.goals = INTAKE.goals; DB.reminders = INTAKE.reminders.sort((a, b) => a.time.localeCompare(b.time));
  if (INTAKE.weight) { DB.profile.startWeight = INTAKE.weight; const d = getDay(todayKey(), true); if (!isNum(d.weight)) d.weight = INTAKE.weight; }
  DB.intakeDone = true; save(); INTAKE = null;
  toast('Klaar! Zet nu je herinneringen op je gsm via Meer.');
  go('#/');
};

/* ================= meldingen terwijl de app open is ================= */
const NOTIFIED = {};
function tickReminders() {
  if (!DB.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  const k = todayKey(), t = nowTime(), day = getDay(k);
  for (const r of DB.reminders.filter(x => x.on)) {
    const key = k + r.id;
    if (r.time === t && !NOTIFIED[key] && !(day && day.done && day.done[r.id])) {
      NOTIFIED[key] = true;
      navigator.serviceWorker && navigator.serviceWorker.ready.then(reg => reg.showNotification('Check-in: ' + r.label, { body: 'Tik om in te vullen.', tag: key, icon: 'icons/icon-192.png', data: { url: appBase() + '#/checkin/' + r.id } }));
    }
  }
}

/* ================= start ================= */
const APP_VERSION = '1.0.1';
function boot() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(e => console.warn(e));
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  const off = $('#offline');
  const upd = () => { off.hidden = navigator.onLine; };
  window.addEventListener('online', upd); window.addEventListener('offline', upd); upd();
  setInterval(tickReminders, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (location.hash === '' || location.hash === '#/')) render(); });
  render();
}
boot();
