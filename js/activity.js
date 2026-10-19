/* Activiteiten en geschat verbruik.
   Verbruik = extra bovenop rust: (MET − 1) × kg × uren (Compendium of Physical Activities).
   Stappen: ≈ 0,5 kcal per kg per km, staplengte ≈ 0,415 × lengte.
   Het is een ruwe schatting; nooit bedoeld om eten te "verdienen" of te compenseren. */
'use strict';

const ACTIVITIES = {
  wandelen: { label: 'Wandelen', met: [3.0, 3.8, 4.8] },
  fietsen: { label: 'Fietsen', met: [4.0, 6.8, 8.5] },
  lopen: { label: 'Lopen (joggen)', met: [7.0, 9.0, 11.0] },
  zwemmen: { label: 'Zwemmen', met: [5.0, 7.0, 9.5] },
  kracht: { label: 'Fitness / kracht', met: [3.5, 5.0, 6.0] },
  cardio: { label: 'Cardiotoestel', met: [5.0, 7.0, 8.5] },
  padel: { label: 'Padel / tennis', met: [5.0, 7.0, 8.0] },
  voetbal: { label: 'Voetbal / basket', met: [6.0, 7.5, 9.5] },
  dansen: { label: 'Dansen', met: [4.5, 5.5, 7.3] },
  yoga: { label: 'Yoga / stretchen', met: [2.5, 3.0, 4.0] },
  huishouden: { label: 'Huishouden / tuin', met: [2.5, 3.5, 4.5] },
  anders: { label: 'Iets anders', met: [3.0, 5.0, 7.0] }
};
const INTENS = ['licht', 'matig', 'zwaar'];

function currentWeight(k) {
  const keys = Object.keys(DB.days).filter(x => !k || x <= k).sort().reverse();
  for (const x of keys) if (isNum(DB.days[x].weight)) return DB.days[x].weight;
  return DB.profile.startWeight || 80;
}
function activityKcal(a, k) {
  const A = ACTIVITIES[a.type] || ACTIVITIES.anders;
  const met = A.met[Math.max(0, INTENS.indexOf(a.int))] || A.met[1];
  return Math.round(Math.max(0, met - 1) * currentWeight(k) * (a.min || 0) / 60);
}
function stepsKm(steps) { return steps * ((DB.profile.heightCm || 172) * 0.415 / 100) / 1000; }
function stepsKcal(steps, k) { return isNum(steps) ? Math.round(0.5 * currentWeight(k) * stepsKm(steps)) : null; }
/* Totaal extra verbruik van een dag. Wandelactiviteiten tellen niet dubbel met stappen. */
function dayBurn(d, k) {
  if (!d) return null;
  const acts = (d.activities || []).filter(a => a.type !== 'wandelen');
  const s = stepsKcal(d.steps, k);
  const a = acts.reduce((t, x) => t + activityKcal(x, k), 0);
  const walkOnly = !isNum(d.steps) ? (d.activities || []).filter(x => x.type === 'wandelen').reduce((t, x) => t + activityKcal(x, k), 0) : 0;
  if (s === null && !acts.length && !walkOnly) return null;
  return (s || 0) + a + walkOnly;
}
METRICS.burn = { label: 'Beweging', unit: 'kcal', chart: 'bar', dec: 0, get: (d, k) => dayBurn(d, k) };

METRICS.fat = { label: 'Vet', unit: 'g', chart: 'bar', dec: 0, sum: true, get: d => vOf(dayNutr(d, 'fat')), lb: d => { const r = dayNutr(d, 'fat'); return r && r.lb; } };

function activityLine(a, k) {
  return tr((ACTIVITIES[a.type] || ACTIVITIES.anders).label) + (a.note ? ' (' + a.note + ')' : '') + ' · ' + a.min + ' ' + tr('min') + ' ' + tr(a.int) + ' · ≈ ' + fmtNum(activityKcal(a, k)) + ' kcal';
}
function activitiesHtml(d, k, editable) {
  const acts = (d && d.activities) || [];
  let h = acts.map(a => '<div class="it"><div><b>' + esc(tr((ACTIVITIES[a.type] || ACTIVITIES.anders).label)) + (a.note ? ' <span class="muted">· ' + esc(a.note) + '</span>' : '') + '</b><small>' + a.min + ' ' + tr('min') + ' · ' + tr(a.int) + ' · ≈ ' + fmtNum(activityKcal(a, k)) + ' kcal ' + tr('extra') + '</small></div>' +
    (editable ? '<button class="iconbtn sm" data-act="delAct" data-k="' + k + '" data-id="' + a.id + '" aria-label="' + tr('Verwijder') + '">✕</button>' : '') + '</div>').join('');
  if (d && isNum(d.steps)) h += '<div class="it"><div><b>' + tr('Stappen') + '</b><small>' + fmtNum(d.steps) + ' ' + tr('stappen') + ' · ≈ ' + fmtNum(stepsKm(d.steps), 1) + ' km · ≈ ' + fmtNum(stepsKcal(d.steps, k)) + ' kcal ' + tr('extra') + '</small></div></div>';
  return h ? '<div class="items">' + h + '</div>' : '<p class="muted small">' + tr('Nog geen activiteiten.') + '</p>';
}

/* Sheet om een activiteit toe te voegen. */
let ACT_CB = null, ACT_DRAFT = null;
function openActivitySheet(k, cb) {
  ACT_CB = cb; ACT_DRAFT = { id: uid(), type: 'wandelen', min: 30, int: 'matig', k };
  renderActivitySheet();
  $('#sheet').hidden = false; document.body.classList.add('noscroll');
}
function renderActivitySheet() {
  const A = ACT_DRAFT;
  let h = '<div class="sheet-h"><h2>' + tr('Activiteit') + '</h2><button class="iconbtn" data-act="closeSheet" aria-label="' + tr('Sluiten') + '">✕</button></div>';
  h += '<div class="chips">' + Object.entries(ACTIVITIES).map(([k, v]) => '<button class="chip ' + (A.type === k ? 'on' : '') + '" data-act="actType" data-t="' + k + '">' + tr(v.label) + '</button>').join('') + '</div>';
  if (A.type === 'anders') h += '<label class="fld"><span>' + tr('Wat?') + '</span><input id="actnote" value="' + esc(A.note || '') + '" placeholder="' + tr('bv. klimmen') + '"></label>';
  h += '<div class="fld"><span>' + tr('Hoe lang?') + '</span><div class="amt-q"><button type="button" class="amt-b" data-act="actMin" data-d="-5">−</button><input type="number" inputmode="numeric" id="actmin" value="' + A.min + '"><button type="button" class="amt-b" data-act="actMin" data-d="5">+</button></div><small class="muted">' + tr('minuten') + '</small></div>';
  h += '<div class="fld"><span>' + tr('Hoe zwaar?') + '</span><div class="seg">' + INTENS.map(i => '<button class="' + (A.int === i ? 'on' : '') + '" data-act="actInt" data-i="' + i + '">' + tr(i) + '</button>').join('') + '</div><small class="muted">' + tr('Licht: praten gaat makkelijk. Matig: praten gaat, zingen niet. Zwaar: praten lukt amper.') + '</small></div>';
  if (A.type === 'wandelen') h += '<p class="note small">' + tr('Heb je je stappen al ingevuld? Dan telt een wandeling niet dubbel: het verbruik komt dan uit je stappen.') + '</p>';
  h += '<p class="muted" id="actsum">' + trf('≈ {kcal} kcal extra bovenop rust (ruwe schatting, op basis van {weight} kg)', { kcal: fmtNum(activityKcal(A, A.k)), weight: fmtNum(currentWeight(A.k), 1) }) + '</p>';
  h += '<button class="btn big" data-act="actSave">' + tr('Bewaren') + '</button>';
  $('#sheet .sheet-in').innerHTML = h;
}
ACT.actType = el => { ACT_DRAFT.type = el.dataset.t; renderActivitySheet(); };
ACT.actInt = el => { ACT_DRAFT.int = el.dataset.i; renderActivitySheet(); };
ACT.actMin = el => { ACT_DRAFT.min = Math.max(5, (Number($('#actmin').value) || 0) + Number(el.dataset.d)); renderActivitySheet(); };
document.addEventListener('input', e => {
  if (e.target.id === 'actmin' && ACT_DRAFT) { ACT_DRAFT.min = Number(e.target.value) || 0; const s = $('#actsum'); if (s) s.textContent = trf('≈ {kcal} kcal extra bovenop rust (ruwe schatting, op basis van {weight} kg)', { kcal: fmtNum(activityKcal(ACT_DRAFT, ACT_DRAFT.k)), weight: fmtNum(currentWeight(ACT_DRAFT.k), 1) }); }
  if (e.target.id === 'actnote' && ACT_DRAFT) ACT_DRAFT.note = e.target.value;
});
ACT.actSave = () => {
  const A = ACT_DRAFT; if (!(A.min > 0)) return toast(tr('Hoe lang duurde het?'));
  const a = { id: A.id, type: A.type, min: A.min, int: A.int }; if (A.note) a.note = A.note.trim();
  const cb = ACT_CB; ACT_DRAFT = null; closeSheet();
  if (cb) cb(a); else { const d = getDay(A.k, true); d.activities = (d.activities || []).concat(a); save(); toast(tr('Activiteit bewaard')); render(); }
};
ACT.delAct = el => { const d = getDay(el.dataset.k); d.activities = (d.activities || []).filter(a => a.id !== el.dataset.id); save(); render(); };
ACT.quickAct = () => openActivitySheet(todayKey());
ACT.dayAct = el => openActivitySheet(el.dataset.k);
