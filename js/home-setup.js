/* Startscherm op maat: waarvoor gebruik je de app?
   De keuze bepaalt welke kaarten, kerncijfers, snelknoppen en check-ins op Vandaag staan.
   Alles blijft lokaal op dit toestel en kan achteraf per onderdeel worden aangepast. */
'use strict';

const PURPOSES = [
  ['food', 'Voeding bijhouden', 'Maaltijden, kcal en eiwit'],
  ['mealprep', 'Mealpreps plannen', 'Recepten, porties en feedback'],
  ['training', 'Een trainingsschema volgen', 'Je schema en voortgang op Vandaag'],
  ['movement', 'Meer bewegen', 'Stappen en activiteit'],
  ['weight', 'Mijn gewicht opvolgen', 'Gewicht en trend'],
  ['wellbeing', 'Slaap, stemming en gewoontes', 'Slaap, energie, stemming en cafeïne']
];
const PURPOSE_KEYS = PURPOSES.map(p => p[0]);
const HOME_SECTIONS = [
  ['checkins', 'Check-ins van vandaag'],
  ['training', 'Trainingsschema'],
  ['prepFeedback', 'Vraag om mealprep-feedback'],
  ['week', 'Weekrapport (begin van de week)'],
  ['quick', 'Snelknoppen (+ eten, + water …)'],
  ['meals', 'Gegeten vandaag'],
  ['tip', 'Tip van de dag']
];
const HOME_SECTION_KEYS = HOME_SECTIONS.map(s => s[0]);
const MEAL_REMINDER_KINDS = ['ontbijt', 'lunch', 'avond', 'vrij'];

function cleanPurposes(list) { return Array.isArray(list) ? PURPOSE_KEYS.filter(k => list.includes(k)) : null; }
function selectedPurposes() { return cleanPurposes(DB.settings.purposes); }
function homeSectionOn(key) {
  const s = DB.settings.homeSections;
  return !Array.isArray(s) || s.includes(key);
}

/* Standaardinstellingen voor een gekozen combinatie van doelen. Lege keuze = alles tonen. */
function purposeDefaults(purposes) {
  const has = k => purposes.includes(k);
  const foodish = has('food') || has('mealprep');
  const kpis = [];
  const add = (...keys) => keys.forEach(k => { if (!kpis.includes(k)) kpis.push(k); });
  if (foodish) add('kcal', 'protein');
  if (has('food')) add('water');
  if (has('movement') || has('training')) add('steps');
  if (has('training')) add('burn');
  if (has('weight')) add('weight');
  if (has('wellbeing')) add('sleep', 'mood', 'energy');
  add('diary');
  const sections = ['checkins', 'week'];
  if (has('training')) sections.push('training');
  if (has('mealprep')) sections.push('prepFeedback');
  if (foodish || has('movement') || has('training') || has('wellbeing')) sections.push('quick');
  if (foodish) sections.push('meals');
  const groups = new Set(purposes.map(p => ({ food: 'food', mealprep: 'food', training: 'movement', movement: 'movement', wellbeing: 'wellbeing' })[p]).filter(Boolean));
  const homeFocus = groups.size === 1 ? [...groups][0] : 'balanced';
  return { kpis, sections, homeFocus };
}
/* Check-ins afstemmen: maaltijdcheck-ins alleen bij voeding/mealprep (ontbijt + weging ook bij gewicht).
   De dagopname blijft aan. Zelfgemaakte herinneringen met een ander type blijven ongemoeid. */
function purposeReminders(reminders, purposes) {
  const has = k => purposes.includes(k);
  const foodish = has('food') || has('mealprep');
  for (const r of reminders) {
    if (r.kind === 'ontbijt') r.on = foodish || has('weight');
    else if (MEAL_REMINDER_KINDS.includes(r.kind)) r.on = foodish;
    else if (r.kind === 'dag') r.on = true;
  }
  return reminders;
}
function applyPurposeSettings(purposes) {
  const S = DB.settings;
  if (!purposes || !purposes.length) {
    S.purposes = null; delete S.homeSections; delete S.homeKpis; S.homeFocus = 'balanced';
  } else {
    const d = purposeDefaults(purposes);
    S.purposes = purposes; S.homeSections = d.sections; S.homeKpis = d.kpis; S.homeFocus = d.homeFocus;
  }
  S.purposePromptDone = true;
}
function homeQuickButtons() {
  const p = selectedPurposes();
  const all = [['quickEat', '+ eten', ['food', 'mealprep']], ['quickAct', '+ activiteit', ['movement', 'training']], ['quickWater', '+ glas water', ['food', 'wellbeing']], ['quickCoffee', '+ koffie', ['wellbeing']]];
  return all.filter(([, , need]) => !p || !p.length || need.some(k => p.includes(k)));
}
function purposeOptionsHtml(selected, chg) {
  return '<div class="purpose-options">' + PURPOSES.map(([k, label, sub]) =>
    '<label class="purpose-option"><input type="checkbox" data-chg="' + chg + '" data-k="' + k + '"' + (selected.includes(k) ? ' checked' : '') + '><span><b>' + esc(tr(label)) + '</b><small class="muted">' + esc(tr(sub)) + '</small></span></label>').join('') + '</div>';
}
function purposePromptCard() {
  if (Array.isArray(DB.settings.purposes) || DB.settings.purposePromptDone) return '';
  return '<div class="card"><b>' + tr('Te druk? Kies wat je wilt zien') + '</b><p class="small">' + tr('Vertel waarvoor je de app gebruikt. Vandaag toont dan alleen wat daarbij past; de rest blijft bereikbaar via de tabbladen.') + '</p><div class="inrow wrap"><a class="btn" href="#/startscherm">' + tr('Kiezen') + '</a><button class="link" data-act="purposePromptDismiss">' + tr('Nee, alles tonen') + '</button></div></div>';
}
ACT.purposePromptDismiss = () => { DB.settings.purposePromptDone = true; save(); render(); };

/* ---------- scherm: Startscherm op maat ---------- */
let PURPOSE_DRAFT = null;
function renderHomeSetup() {
  if (!PURPOSE_DRAFT) PURPOSE_DRAFT = { purposes: selectedPurposes() || [], reminders: true };
  const D = PURPOSE_DRAFT;
  let h = header('Startscherm op maat', 'Kies wat je op Vandaag wilt zien', true);
  h += '<section class="card"><h2>' + tr('Waarvoor gebruik je de app?') + '</h2><p class="small muted">' + tr('Vink aan wat voor jou belangrijk is. Je kunt meerdere dingen kiezen.') + '</p>' + purposeOptionsHtml(D.purposes, 'purposeDraft') +
    '<label class="toggle"><input type="checkbox" data-chg="purposeDraftReminders"' + (D.reminders ? ' checked' : '') + '> ' + tr('Pas ook mijn check-in-herinneringen hierop aan') + '</label>' +
    '<button class="btn big" data-act="purposeApply">' + tr('Toepassen') + '</button>' +
    '<button class="link" data-act="purposeShowAll">' + tr('Alles weer tonen') + '</button></section>';
  h += '<section class="card"><h2>' + tr('Fijn afstellen') + '</h2><p class="small muted">' + tr('Zet onderdelen van Vandaag apart aan of uit.') + '</p><div class="home-kpi-options">' +
    HOME_SECTIONS.map(([k, label]) => '<label class="toggle"><input type="checkbox" data-chg="homeSectionToggle" data-k="' + k + '"' + (homeSectionOn(k) ? ' checked' : '') + '> ' + esc(tr(label)) + '</label>').join('') + '</div></section>';
  h += homeKpiSettingsCard();
  view().innerHTML = h;
}
ACT.purposeDraft = el => {
  const set = new Set(PURPOSE_DRAFT.purposes);
  if (el.checked) set.add(el.dataset.k); else set.delete(el.dataset.k);
  PURPOSE_DRAFT.purposes = PURPOSE_KEYS.filter(k => set.has(k));
};
ACT.purposeDraftReminders = el => { PURPOSE_DRAFT.reminders = el.checked; };
ACT.purposeApply = () => {
  const p = PURPOSE_DRAFT.purposes;
  if (!p.length) return toast(tr('Kies minstens één doel, of tik op ‘Alles weer tonen’.'));
  applyPurposeSettings(p);
  if (PURPOSE_DRAFT.reminders) { purposeReminders(DB.reminders, p); if (typeof refreshWebPushSchedule === 'function') refreshWebPushSchedule(false); }
  save(); PURPOSE_DRAFT = null; toast(tr('Vandaag is aangepast')); go('#/');
};
ACT.purposeShowAll = () => { applyPurposeSettings(null); save(); PURPOSE_DRAFT = null; toast(tr('Alles wordt weer getoond')); go('#/'); };
ACT.homeSectionToggle = el => {
  const current = HOME_SECTION_KEYS.filter(homeSectionOn);
  DB.settings.homeSections = el.checked ? HOME_SECTION_KEYS.filter(k => current.includes(k) || k === el.dataset.k) : current.filter(k => k !== el.dataset.k);
  DB.settings.purposePromptDone = true; save();
};
window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/startscherm')) PURPOSE_DRAFT = null; });
