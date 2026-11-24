/* Activiteiten en geschat verbruik.
   Verbruik = extra bovenop rust: (MET − 1) × kg × uren (Compendium of Physical Activities).
   Stappen: ≈ 0,5 kcal per kg per km, staplengte ≈ 0,415 × lengte.
   Het is een ruwe schatting; nooit bedoeld om eten te "verdienen" of te compenseren. */
'use strict';

const ACTIVITIES = {
  wandelen: { label: 'Wandelen', met: [2.3, 3.0, 4.8], distance: true, unit: 'km' },
  fietsen: { label: 'Fietsen', met: [4.0, 7.0, 10.0], distance: true, unit: 'km' },
  lopen: { label: 'Lopen (joggen)', met: [6.5, 9.0, 11.0], distance: true, unit: 'km' },
  zwemmen: { label: 'Zwemmen', met: [4.8, 6.0, 9.8], distance: true, unit: 'km' },
  kracht: { label: 'Fitness / kracht', met: [3.0, 3.5, 6.0] },
  cardio: { label: 'Cardiotoestel', met: [3.5, 5.0, 9.0], distance: false },
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
  let met = A.met[Math.max(0, INTENS.indexOf(a.int))] || A.met[1];
  // 2024 Adult Compendium: tempo is afgeleid uit afstand en tijd; terrein, helling en stops zijn onbekend.
  if (a.distanceKm > 0 && a.min > 0) {
    const speed = a.distanceKm * 60 / a.min;
    if (a.type === 'wandelen') met = speed < 3.2 ? 2.3 : speed < 4 ? 2.8 : speed < 4.5 ? 3.0 : speed < 5.6 ? 3.8 : speed < 6.4 ? 4.8 : speed < 7.2 ? 5.5 : speed < 8 ? 7.0 : 8.5;
    if (a.type === 'fietsen') met = speed < 16 ? 4.0 : speed < 19 ? 6.8 : speed < 22.5 ? 8.0 : speed < 26 ? 10.0 : 12.0;
    if (a.type === 'lopen') met = speed < 6.4 ? 3.3 : speed < 6.8 ? 6.5 : speed < 7.8 ? 7.8 : speed < 8.5 ? 8.5 : speed < 9.5 ? 9.0 : speed < 10.2 ? 9.3 : speed < 10.8 ? 10.5 : speed < 11.3 ? 11.0 : speed < 12.1 ? 11.8 : speed < 12.9 ? 12.0 : speed < 13.8 ? 12.5 : 13.0;
    if (a.type === 'zwemmen') met = speed < 1.5 ? 5.8 : speed < 2 ? 8.0 : 9.8;
  }
  const minutes = Number(a.min);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) return 0;
  return Math.round(Math.max(0, met - 1) * currentWeight(k) * minutes / 60);
}
function stepsKm(steps) { return steps * ((DB.profile.heightCm || 172) * 0.415 / 100) / 1000; }
function stepsKcal(steps, k) {
  if (!isNum(steps)) return null;
  // Broad level-ground walking estimate: gross distance cost approximated at 0.5 kcal/kg/km.
  return Math.round(0.5 * currentWeight(k) * stepsKm(steps));
}
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
  return tr((ACTIVITIES[a.type] || ACTIVITIES.anders).label) + (a.note ? ' (' + a.note + ')' : '') + ' · ' + a.min + ' ' + tr('min') + ' ' + tr(a.int) + (a.distanceKm > 0 ? ' · ' + fmtNum(a.distanceKm, 1) + ' km' : '') + ' · ≈ ' + fmtNum(activityKcal(a, k)) + ' kcal';
}
function activitiesHtml(d, k, editable) {
  const acts = (d && d.activities) || [];
  let h = acts.map(a => '<div class="it"><div><b>' + esc(tr((ACTIVITIES[a.type] || ACTIVITIES.anders).label)) + (a.note ? ' <span class="muted">· ' + esc(a.note) + '</span>' : '') + '</b><small>' + a.min + ' ' + tr('min') + ' · ' + tr(a.int) + (a.distanceKm > 0 ? ' · ' + fmtNum(a.distanceKm, 1) + ' km' : '') + ' · ≈ ' + fmtNum(activityKcal(a, k)) + ' kcal ' + tr('extra') + '</small></div>' +
    (editable ? '<button class="iconbtn sm" data-act="delAct" data-k="' + k + '" data-id="' + a.id + '" aria-label="' + tr('Verwijder') + '">✕</button>' : '') + '</div>').join('');
  if (d && isNum(d.steps)) h += '<div class="it"><div><b>' + tr('Stappen') + '</b><small>' + fmtNum(d.steps) + ' ' + tr('stappen') + ' · ≈ ' + fmtNum(stepsKm(d.steps), 1) + ' km · ≈ ' + fmtNum(stepsKcal(d.steps, k)) + ' kcal ' + tr('extra') + '</small></div></div>';
  return h ? '<div class="items">' + h + '</div>' : '<p class="muted small">' + tr('Nog geen activiteiten.') + '</p>';
}

/* Sheet om een activiteit toe te voegen. */
let ACT_CB = null, ACT_DRAFT = null;
function openActivitySheet(k, cb, preset = {}) {
  ACT_CB = cb; ACT_DRAFT = { id: uid(), type: preset.type || 'wandelen', min: preset.min || 30, int: preset.int || 'matig', distanceKm: preset.distanceKm || 0, k };
  renderActivitySheet();
  $('#sheet').hidden = false; document.body.classList.add('noscroll');
}
function renderActivitySheet() {
  const A = ACT_DRAFT;
  let h = '<div class="sheet-h"><h2>' + tr('Activiteit') + '</h2><button class="iconbtn" data-act="closeSheet" aria-label="' + tr('Sluiten') + '">✕</button></div>';
  h += '<div class="chips">' + Object.entries(ACTIVITIES).map(([k, v]) => '<button class="chip ' + (A.type === k ? 'on' : '') + '" data-act="actType" data-t="' + k + '">' + tr(v.label) + '</button>').join('') + '</div>';
  if (A.type === 'anders') h += '<label class="fld"><span>' + tr('Wat?') + '</span><input id="actnote" maxlength="200" value="' + esc(A.note || '') + '" placeholder="' + tr('bv. klimmen') + '"></label>';
  h += '<div class="fld"><span>' + tr('Hoe lang?') + '</span><div class="amt-q"><button type="button" class="amt-b" data-act="actMin" data-d="-5">−</button><input type="number" inputmode="numeric" id="actmin" min="1" max="1440" step="1" value="' + A.min + '"><button type="button" class="amt-b" data-act="actMin" data-d="5">+</button></div><small class="muted">' + tr('minuten') + '</small></div>';
  h += '<div class="fld"><span>' + tr('Hoe zwaar?') + '</span><div class="seg">' + INTENS.map(i => '<button class="' + (A.int === i ? 'on' : '') + '" data-act="actInt" data-i="' + i + '">' + tr(i) + '</button>').join('') + '</div><small class="muted">' + tr('Licht: praten gaat makkelijk. Matig: praten gaat, zingen niet. Zwaar: praten lukt amper.') + '</small></div>';
  if (['wandelen', 'fietsen', 'lopen', 'zwemmen'].includes(A.type)) h += '<label class="fld"><span>' + trf('Afstand in {unit} (optioneel)', { unit: tr('km') }) + '</span><input id="actdistance" type="number" inputmode="decimal" min="0" max="200" step="0.1" value="' + (A.distanceKm || '') + '"><small class="muted">' + tr('Afstand en duur geven een tempo-inschatting. Helling, terrein, pauzes, fietsweerstand en zwemslag kennen we niet. Laat leeg als je afstand het niet weet.') + '</small></label>';
  if (!Object.keys(DB.days).some(x => (!A.k || x <= A.k) && isNum(DB.days[x].weight)) && !isNum(DB.profile.startWeight)) h += '<p class="note small">' + tr('Geen gewicht ingevuld: deze schatting gebruikt tijdelijk 80 kg. Vul je gewicht in voor een persoonlijkere schatting.') + '</p>';
  if (A.type === 'wandelen') h += '<p class="note small">' + tr('Heb je je stappen al ingevuld? Dan telt een wandeling niet dubbel: het verbruik komt dan uit je stappen.') + '</p>';
  h += '<p class="muted" id="actsum">' + trf('≈ {kcal} kcal extra bovenop rust (ruwe schatting, op basis van {weight} kg)', { kcal: fmtNum(activityKcal(A, A.k)), weight: fmtNum(currentWeight(A.k), 1) }) + '</p>';
  h += '<button class="btn big" data-act="actSave">' + tr('Bewaren') + '</button>';
  $('#sheet .sheet-in').innerHTML = h;
}
ACT.actType = el => { ACT_DRAFT.type = el.dataset.t; if (!['wandelen', 'fietsen', 'lopen', 'zwemmen'].includes(ACT_DRAFT.type)) ACT_DRAFT.distanceKm = 0; renderActivitySheet(); };
ACT.actInt = el => { ACT_DRAFT.int = el.dataset.i; renderActivitySheet(); };
ACT.actMin = el => { ACT_DRAFT.min = Math.min(1440, Math.max(1, (Number($('#actmin').value) || 0) + Number(el.dataset.d))); renderActivitySheet(); };
document.addEventListener('input', e => {
  if (e.target.id === 'actmin' && ACT_DRAFT) { ACT_DRAFT.min = Number(e.target.value) || 0; const s = $('#actsum'); if (s) s.textContent = trf('≈ {kcal} kcal extra bovenop rust (ruwe schatting, op basis van {weight} kg)', { kcal: fmtNum(activityKcal(ACT_DRAFT, ACT_DRAFT.k)), weight: fmtNum(currentWeight(ACT_DRAFT.k), 1) }); }
  if (e.target.id === 'actdistance' && ACT_DRAFT) { ACT_DRAFT.distanceKm = Number(e.target.value) || 0; const s = $('#actsum'); if (s) s.textContent = trf('≈ {kcal} kcal extra bovenop rust (ruwe schatting, op basis van {weight} kg)', { kcal: fmtNum(activityKcal(ACT_DRAFT, ACT_DRAFT.k)), weight: fmtNum(currentWeight(ACT_DRAFT.k), 1) }); }
  if (e.target.id === 'actnote' && ACT_DRAFT) ACT_DRAFT.note = e.target.value;
});
ACT.actSave = () => {
  const A = ACT_DRAFT;
  if (!Number.isInteger(Number(A.min)) || Number(A.min) < 1 || Number(A.min) > 1440) return toast(tr('Kies een duur tussen 1 minuut en 24 uur.'));
  if (A.distanceKm && (A.distanceKm > 200 || A.distanceKm * 60 / A.min > ({ wandelen: 12, fietsen: 80, lopen: 30, zwemmen: 8 }[A.type] || 80))) return toast(tr('Controleer de afstand en duur van je activiteit.'));
  const a = { id: A.id, type: A.type, min: Number(A.min), int: A.int }; if (A.distanceKm > 0) a.distanceKm = A.distanceKm; if (A.note) a.note = String(A.note).trim().slice(0, 200);
  const cb = ACT_CB; ACT_DRAFT = null; closeSheet();
  if (cb) cb(a); else { const d = getDay(A.k, true); d.activities = (d.activities || []).concat(a); if (!save()) return; toast(tr('Activiteit bewaard')); render(); }
};
ACT.delAct = el => { const d = getDay(el.dataset.k); d.activities = (d.activities || []).filter(a => a.id !== el.dataset.id); save(); render(); };
ACT.quickAct = () => openActivitySheet(todayKey());
ACT.dayAct = el => openActivitySheet(el.dataset.k);
