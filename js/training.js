/* Offline planner. Informational training blocks, not medical advice or a replacement for a coach.
   Sources: BAA marathon plans, World Athletics load and recovery guidance, official HYROX format. */
'use strict';

const TRAIN_DAYS = [
  ['ma', 'Maandag'], ['di', 'Dinsdag'], ['wo', 'Woensdag'], ['do', 'Donderdag'],
  ['vr', 'Vrijdag'], ['za', 'Zaterdag'], ['zo', 'Zondag']
];
const TRAIN_CATEGORIES = {
  general: { label: 'Algemeen doel', goals: { weight: 'Afvallen / fitter worden', general: 'Algemene conditie' } },
  fitness: { label: 'Fitness', goals: { strength: 'Kracht opbouwen', muscle: 'Spiermassa opbouwen', interval: 'Conditie / interval' } },
  running: { label: 'Lopen', goals: { runStart: 'Lopen rustig opbouwen', run5k: 'Toewerken naar 5 km' } },
  recovery: { label: 'Terugkeer na revalidatie', goals: { rehab: 'Veilig terug naar bewegen' } },
  events: { label: 'Wedstrijd of evenement', goals: { race5k: '5 km-wedstrijd', race10k: '10 km-wedstrijd', half: 'Halve marathon', marathon: 'Marathon', race: 'Andere hardloopwedstrijd', hyrox: 'HYROX' } }
};
const TRAIN_GOALS = Object.assign({}, ...Object.values(TRAIN_CATEGORIES).map(c => c.goals));
const TRAIN_LEVELS = [
  ['beginner', 'Beginner'], ['intermediate', 'Gemiddeld / medior'],
  ['advanced', 'Ervaren'], ['competitive', 'Zeer ervaren / wedstrijdgericht']
];
const TRAIN_MAX_DAYS = { beginner: 3, intermediate: 4, advanced: 5, competitive: 5 };
function goalsInCategory(category) { return TRAIN_CATEGORIES[category]?.goals || TRAIN_CATEGORIES.general.goals; }
function savedTrainingPlans() {
  const p = DB.training || (DB.training = {});
  if (!Array.isArray(p.plans)) p.plans = [];
  return p.plans;
}
function activeTrainingPlan() {
  return savedTrainingPlans().find(p => p.id === DB.training.activePlanId && p.status === 'active') || null;
}
function moodHomeCard() {
  if (!DB.settings.moodInsights) return '';
  const readiness = moodDiaryReadiness();
  if (!readiness.ready) return '<a class="card diary-wellbeing" href="#/dag/' + todayKey() + '"><b>' + tr('Bouw je persoonlijke overzicht op') + '</b><p class="small">' + trf('{count} van de 14 stemmingsdagen bijgehouden. Noteer per dag ook hoe je je voelt; daarna verschijnen je vergelijkingen.', { count: readiness.count }) + '</p><span class="plan-go">' + tr('Dagboek aanvullen ›') + '</span></a>';
  return '<a class="card mood-home" href="#/stemming"><b>' + tr('Stemming en gewoontes') + '</b><span class="small">' + tr('Je persoonlijke overzicht staat klaar. ›') + '</span></a>';
}
function maxTrainingDays(p) {
  const levelMax = TRAIN_MAX_DAYS[p.level] || 3;
  if (p.goal === 'runStart') return Math.min(levelMax, 3);
  if (p.goal === 'rehab') return Math.min(levelMax, 3);
  if (['strength', 'muscle'].includes(p.goal)) return Math.min(levelMax, p.level === 'beginner' ? 2 : p.level === 'intermediate' ? 3 : 4);
  if (['race5k', 'race10k', 'half', 'marathon', 'race'].includes(p.goal)) return Math.min(levelMax, p.goal === 'marathon' ? 4 : p.level === 'beginner' ? 3 : 4);
  if (p.goal === 'hyrox') return Math.min(levelMax, p.level === 'beginner' ? 3 : p.level === 'intermediate' ? 4 : 5);
  if (p.goal === 'run5k') return Math.min(levelMax, p.level === 'beginner' ? 3 : 4);
  return Math.min(levelMax, p.level === 'beginner' ? 3 : 4);
}
function eventWeeksLeft(value) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number), target = new Date(y, m - 1, d), today = new Date();
  if (target.getFullYear() !== y || target.getMonth() !== m - 1 || target.getDate() !== d) return null;
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / 604800000);
}
function trainingData() {
  const d = DB.training || (DB.training = { category: 'general', goal: 'weight', level: 'beginner', access: 'no', equipment: 'none', days: ['ma', 'wo', 'vr'], timeOfDay: 'any', minutes: 45, nutritionFocus: 'none', activityGoal: 'none', weeklyActivityMinutes: 150, eventDate: '', eventName: '', comfortableRunKm: 0, weeklyRunKm: 0, currentRunDays: 0, rehabCleared: false, generated: null });
  if (!Object.hasOwn(TRAIN_CATEGORIES, d.category)) d.category = Object.keys(TRAIN_CATEGORIES).find(k => Object.hasOwn(TRAIN_CATEGORIES[k].goals, d.goal)) || 'general';
  if (!Object.hasOwn(TRAIN_GOALS, d.goal)) d.goal = 'general';
  if (!Object.hasOwn(goalsInCategory(d.category), d.goal)) d.category = Object.keys(TRAIN_CATEGORIES).find(k => Object.hasOwn(TRAIN_CATEGORIES[k].goals, d.goal)) || 'general';
  if (!TRAIN_LEVELS.some(([key]) => key === d.level)) d.level = 'beginner';
  if (!['yes', 'no'].includes(d.access)) d.access = 'no';
  if (!['none', 'home', 'gym'].includes(d.equipment)) d.equipment = 'none';
  if (!['none', 'regularity', 'protein', 'fiber'].includes(d.nutritionFocus)) d.nutritionFocus = 'none';
  if (!['none', 'guideline', 'custom'].includes(d.activityGoal)) d.activityGoal = 'none';
  d.rehabCleared = d.rehabCleared === true;
  d.weeklyActivityMinutes = Math.max(1, Math.min(2000, Number(d.weeklyActivityMinutes) || 150));
  if (typeof d.eventDate !== 'string') d.eventDate = '';
  if (typeof d.eventName !== 'string') d.eventName = '';
  d.comfortableRunKm = Math.max(0, Math.min(100, Number(d.comfortableRunKm) || 0));
  d.weeklyRunKm = Math.max(0, Math.min(250, Number(d.weeklyRunKm) || 0));
  d.currentRunDays = Math.max(0, Math.min(7, Math.floor(Number(d.currentRunDays) || 0)));
  if (!['any', 'morning', 'afternoon', 'evening'].includes(d.timeOfDay)) d.timeOfDay = 'any';
  d.minutes = Math.max(15, Math.min(180, Number(d.minutes) || 45));
  const selected = new Set(Array.isArray(d.days) ? d.days : ['ma', 'wo', 'vr']);
  d.days = TRAIN_DAYS.map(([key]) => key).filter(key => selected.has(key)).slice(0, maxTrainingDays(d));
  return d;
}
function renderTrainingPlan() {
  const p = trainingData();
  let h = header('Trainingsplan', 'Een rustige basis op maat van je agenda', true);
  h += '<div class="card"><p class="muted small">' + tr('Dit is een algemene startindeling, geen medisch advies. Train binnen je mogelijkheden en bouw rustig op. Bij klachten, een blessure of een medische aandoening: bespreek je plan met je zorgverlener.') + '</p>';
  if (p.goal === 'weight') h += '<p class="muted small"><b>' + tr('Afvallen / fitter worden') + ':</b> ' + tr('deze beweegindeling kan je fitheid ondersteunen, maar garandeert geen gewichtsverlies en stelt geen calorie-inname voor.') + '</p>';
  h += '<label class="fld"><span>' + tr('Waar wil je eerst aan werken?') + '</span><select data-chg="trainingField" data-f="category">' + Object.entries(TRAIN_CATEGORIES).map(([k, c]) => '<option value="' + k + '"' + (p.category === k ? ' selected' : '') + '>' + tr(c.label) + '</option>').join('') + '</select></label>';
  h += '<label class="fld"><span>' + tr('Wat is je doel?') + '</span><select data-chg="trainingField" data-f="goal">' + Object.entries(goalsInCategory(p.category)).map(([k, label]) => '<option value="' + k + '"' + (p.goal === k ? ' selected' : '') + '>' + tr(label) + '</option>').join('') + '</select></label>';
  h += '<div class="grid2"><label class="fld"><span>' + tr('Je niveau') + '</span><select data-chg="trainingField" data-f="level">' + TRAIN_LEVELS.map(([k, l]) => '<option value="' + k + '"' + (p.level === k ? ' selected' : '') + '>' + tr(l) + '</option>').join('') + '</select><small class="muted">' + tr('Kies op basis van je recente trainingservaring. Wedstrijdgericht betekent niet automatisch professioneel.') + '</small></label>';
  h += '<label class="fld"><span>' + tr('Toegang tot fitness?') + '</span><select data-chg="trainingField" data-f="access">' + [['no', 'Nee'], ['yes', 'Ja']].map(([k, l]) => '<option value="' + k + '"' + (p.access === k ? ' selected' : '') + '>' + tr(l) + '</option>').join('') + '</select></label></div>';
  h += '<label class="fld"><span>' + tr('Wat heb je beschikbaar?') + '</span><select data-chg="trainingField" data-f="equipment">' + [['none', 'Geen materiaal'], ['home', 'Thuis: banden of gewichten'], ['gym', 'Volledige fitness']].map(([k, l]) => '<option value="' + k + '"' + (p.equipment === k ? ' selected' : '') + '>' + tr(l) + '</option>').join('') + '</select></label>';
  h += '<fieldset class="fld"><legend>' + tr('Welke dagen passen meestal?') + '</legend><div class="grid2">' + TRAIN_DAYS.map(([k, l]) => '<label class="check"><input type="checkbox" data-chg="trainingDay" data-day="' + k + '"' + (p.days.includes(k) ? ' checked' : '') + '><span class="n">' + tr(l) + '</span></label>').join('') + '</div><small class="muted">' + tr('Kies maximaal {count} trainingsdagen voor dit doel en niveau; de overige dagen zijn hersteldagen.').replace('{count}', maxTrainingDays(p)) + '</small></fieldset>';
  h += '<label class="fld"><span>' + tr('Hoeveel tijd per training?') + '</span><input type="number" min="15" max="180" step="5" value="' + esc(p.minutes ?? 45) + '" data-chg="trainingField" data-f="minutes"><small class="muted">15–180 ' + tr('minuten') + '</small></label>';
  h += '<label class="fld"><span>' + tr('Wanneer komt trainen meestal uit?') + '</span><select data-chg="trainingField" data-f="timeOfDay">' + [['any', 'Geen voorkeur'], ['morning', 'Ochtend'], ['afternoon', 'Middag'], ['evening', 'Avond']].map(([k, l]) => '<option value="' + k + '"' + (p.timeOfDay === k ? ' selected' : '') + '>' + tr(l) + '</option>').join('') + '</select></label>';
  h += '<label class="fld"><span>' + tr('Voedingsfocus (optioneel)') + '</span><select data-chg="trainingField" data-f="nutritionFocus">' + [['none', 'Geen'], ['regularity', 'Regelmaat in maaltijden'], ['protein', 'Eiwitbron bij maaltijden'], ['fiber', 'Meer vezelrijke keuzes']].map(([k, l]) => '<option value="' + k + '"' + (p.nutritionFocus === k ? ' selected' : '') + '>' + tr(l) + '</option>').join('') + '</select><small class="muted">' + tr('Dit geeft een aandachtspunt, geen dieet- of calorievoorschrift.') + '</small></label>';
  h += '<label class="fld"><span>' + tr('Beweegdoel (optioneel)') + '</span><select data-chg="trainingField" data-f="activityGoal">' + [['none', 'Geen'], ['guideline', 'Richtlijn voor volwassenen'], ['custom', 'Eigen weekdoel in minuten']].map(([k, l]) => '<option value="' + k + '"' + (p.activityGoal === k ? ' selected' : '') + '>' + tr(l) + '</option>').join('') + '</select></label>';
  if (p.activityGoal === 'custom') h += '<label class="fld"><span>' + tr('Minuten beweging per week') + '</span><input type="number" min="1" max="2000" step="5" value="' + esc(p.weeklyActivityMinutes) + '" data-chg="trainingField" data-f="weeklyActivityMinutes"><small class="muted">' + tr('Vul je eigen haalbare streefdoel in; wandelen en fietsen tellen ook mee.') + '</small></label>';
  if (p.goal === 'rehab') h += '<div class="card note"><b>' + tr('Alleen met akkoord van je behandelaar') + '</b><p class="small">' + tr('Deze app stelt geen diagnose of revalidatie-oefeningen op. Gebruik dit alleen als arts of kinesitherapeut je toestemming gaf om te trainen; volg hun oefeningen, grenzen en opbouw.') + '</p><label class="check"><input type="checkbox" data-chg="trainingField" data-f="rehabCleared"' + (p.rehabCleared ? ' checked' : '') + '><span class="n">' + tr('Mijn behandelaar heeft bewegen/trainen toegestaan en ik volg diens richtlijnen') + '</span></label></div>';
  h += '<p class="muted small">' + tr('Persoonlijke instellingen: je profiel kan geslacht en lichaamsgewicht bevatten, maar bepaalt niet automatisch een ander trainingsschema. Doel, ervaring, beschikbare dagen, tijd en materiaal sturen de oefeningen. Afvallen of spiermassa opbouwen geeft geen gegarandeerd resultaat of automatisch calorievoorschrift.') + '</p>';
  if (['runStart', 'run5k'].includes(p.goal)) h += '<p class="muted small">' + tr('Voor looptrainingen plan je minstens één volledige rustdag tussen twee gekozen loopdagen.') + '</p>';
  if (p.category === 'events') {
    if (p.goal !== 'hyrox') h += '<label class="fld"><span>' + tr('Wat loop je nu comfortabel als langste afstand? (km)') + '</span><input type="number" min="0" max="100" step="0.5" value="' + esc(p.comfortableRunKm) + '" data-chg="trainingField" data-f="comfortableRunKm"><small class="muted">' + tr('Gebruik 0 als je nu nog niet loopt. Wedstrijdopbouw wordt alleen getoond als je huidige basis erbij past.') + '</small></label>';
    h += '<div class="grid2"><label class="fld"><span>' + tr('Gemiddeld aantal loopkilometers per week in de laatste 4 weken') + '</span><input type="number" min="0" max="250" step="1" value="' + esc(p.weeklyRunKm) + '" data-chg="trainingField" data-f="weeklyRunKm"><small class="muted">' + tr('Een schatting is genoeg; vul 0 in als je niet hebt gelopen.') + '</small></label>' +
      '<label class="fld"><span>' + tr('Op hoeveel dagen per week liep je gemiddeld?') + '</span><input type="number" min="0" max="7" step="1" value="' + esc(p.currentRunDays) + '" data-chg="trainingField" data-f="currentRunDays"><small class="muted">' + tr('Gemiddeld over de laatste 4 weken.') + '</small></label></div>';
    if (p.goal === 'race') h += '<label class="fld"><span>' + tr('Welke hardloopwedstrijd wil je doen?') + '</span><input type="text" maxlength="80" value="' + esc(p.eventName) + '" data-chg="trainingField" data-f="eventName" placeholder="' + tr('Bijvoorbeeld trailrun of obstacle run') + '"><small class="muted">' + tr('Voor andere sporten dan hardlopen is dit basisplan niet geschikt.') + '</small></label>';
    h += '<label class="fld"><span>' + tr('Wedstrijddatum (optioneel)') + '</span><input type="date" value="' + esc(p.eventDate) + '" data-chg="trainingField" data-f="eventDate"><small class="muted">' + tr('Met een datum plant de app de trainingsblokken terug vanaf de wedstrijd. De planner kort een programma niet in als de datum te dichtbij is.') + '</small></label>';
  }
  h += '<button class="btn big" data-act="generateTrainingPlan">' + tr('Maak mijn weekindeling') + '</button></div>';
  if (p.generated) h += renderGeneratedTraining(p.generated);
  if (p.category === 'events') h += renderEventGuidance(p);
  view().innerHTML = h;
}
function customTrainingDraft() {
  const t = DB.training;
  if (!t.customDraft || typeof t.customDraft !== 'object') t.customDraft = { name: tr('Mijn trainingsschema'), goal: 'strength', level: 'beginner', weeks: 8, days: ['ma', 'wo', 'vr'], sessions: {} };
  const d = t.customDraft;
  if (d.name === 'Mijn trainingsschema') d.name = tr(d.name);
  if (!d.sessions || typeof d.sessions !== 'object') d.sessions = {};
  d.days = TRAIN_DAYS.map(([key]) => key).filter(k => Array.isArray(d.days) && d.days.includes(k));
  for (const key of d.days) {
    if (!d.sessions[key]) d.sessions[key] = { day: Object.fromEntries(TRAIN_DAYS)[key], title: 'Krachttraining', detail: '', exercises: [{ name: '', sets: 3, reps: '8–12', rest: 90, holdSeconds: null, weightKg: null }] };
    if (!Array.isArray(d.sessions[key].exercises)) d.sessions[key].exercises = [];
  }
  if (!Object.hasOwn(TRAIN_GOALS, d.goal) || ['rehab', 'marathon', 'hyrox'].includes(d.goal)) d.goal = 'strength';
  if (!TRAIN_LEVELS.some(([key]) => key === d.level)) d.level = 'beginner';
  d.weeks = Math.max(1, Math.min(24, Math.floor(Number(d.weeks) || 8)));
  return d;
}
function validRepRange(value) {
  const m = String(value || '').trim().match(/^(\d{1,3})(?:[–-](\d{1,3}))?$/);
  if (!m) return false;
  const low = Number(m[1]), high = m[2] ? Number(m[2]) : low;
  return low >= 1 && high >= low;
}
function validExerciseTarget(value) {
  const text = String(value || '').trim();
  if (validRepRange(text)) return true;
  const m = text.match(/^(\d{1,3})(?:[–-](\d{1,3}))?\s*(?:s|sec|seconden|sek\.?|sekunden)$/i);
  if (!m) return false;
  const low = Number(m[1]), high = m[2] ? Number(m[2]) : low;
  return low >= 1 && high >= low;
}
function exerciseTargetText(x) {
  const parts = [esc(x.reps) + (validRepRange(x.reps) ? ' ' + tr('herhalingen') : '')];
  if (Number(x.holdSeconds) > 0) parts.push(Number(x.holdSeconds) + ' ' + tr('sec vasthouden'));
  if (Number(x.weightKg) > 0) parts.push(fmtNum(Number(x.weightKg), 2) + ' ' + tr('kg'));
  return parts.join(' · ');
}
const CUSTOM_EXERCISE_LIBRARY = [
  { id: 'goblet-squat', name: 'Goblet squat', focus: 'Benen en heupen', target: '8–12' },
  { id: 'chair-squat', name: 'Stoel squat', focus: 'Benen; stoel als steun', target: '8–12' },
  { id: 'glute-bridge', name: 'Heupbrug', focus: 'Billen en heupen', target: '10–15' },
  { id: 'push-up', name: 'Push-up', focus: 'Borst en armen', target: '6–12' },
  { id: 'wall-push-up', name: 'Push-up tegen de muur', focus: 'Borst en armen; handen tegen de muur', target: '8–15' },
  { id: 'dumbbell-row', name: 'Roeien met dumbbell', focus: 'Rug; trek gecontroleerd', target: '8–12' },
  { id: 'band-row', name: 'Roeien met weerstandsband', focus: 'Rug; trek de band naar je toe', target: '8–12' },
  { id: 'dead-bug', name: 'Dead bug', focus: 'Romp; houd je onderrug rustig', target: '8–12' },
  { id: 'plank', name: 'Plank', focus: 'Romp; houd je lichaam in een rechte lijn', target: '30 sec' },
  { id: 'side-plank', name: 'Zijwaartse plank', focus: 'Romp en heupen; houd je heupen gestapeld', target: '20 sec' },
  { id: 'bird-dog', name: 'Bird dog', focus: 'Romp en coördinatie; houd elke herhaling 3 seconden stabiel', target: '8', holdSeconds: 3 },
  { id: 'calf-raise', name: 'Kuitheffen', focus: 'Kuiten en enkels', target: '10–15' }
];
function renderCustomTrainingBuilder() {
  const d = customTrainingDraft();
  let h = header('Zelf samenstellen', 'Maak een weekschema met je eigen oefeningen, sets en herhalingen', true);
  h += '<div class="card note"><b>' + tr('Jij bepaalt de inhoud en opbouw') + '</b><p class="small">' + tr('Dit herhaalt jouw weekindeling; het verhoogt gewicht of herhalingen niet automatisch. Verhoog pas iets als je techniek goed blijft en je hersteld bent. Een zelfgemaakt schema is geen revalidatieadvies.') + '</p></div>';
  h += '<div class="card"><label class="fld"><span>' + tr('Naam van je schema') + '</span><input maxlength="60" value="' + esc(d.name) + '" data-chg="customTrainingField" data-f="name"></label>';
  h += '<div class="grid2"><label class="fld"><span>' + tr('Doel') + '</span><select data-chg="customTrainingField" data-f="goal">' + Object.entries(TRAIN_GOALS).filter(([k]) => !['rehab', 'marathon', 'hyrox', 'race', 'race5k', 'race10k', 'half'].includes(k)).map(([k, v]) => '<option value="' + k + '"' + (d.goal === k ? ' selected' : '') + '>' + esc(tr(v)) + '</option>').join('') + '</select></label><label class="fld"><span>' + tr('Niveau') + '</span><select data-chg="customTrainingField" data-f="level">' + TRAIN_LEVELS.map(([k, v]) => '<option value="' + k + '"' + (d.level === k ? ' selected' : '') + '>' + tr(v) + '</option>').join('') + '</select></label></div>';
  h += '<label class="fld"><span>' + tr('Hoeveel weken wil je dit schema volgen?') + '</span><input type="number" min="1" max="24" value="' + d.weeks + '" data-chg="customTrainingField" data-f="weeks"></label>';
  h += '<fieldset class="fld"><legend>' + tr('Trainingsdagen') + '</legend><div class="custom-days">' + TRAIN_DAYS.map(([k, label]) => '<label class="check"><input type="checkbox" data-chg="customTrainingDay" data-day="' + k + '"' + (d.days.includes(k) ? ' checked' : '') + '><span class="n">' + tr(label) + '</span></label>').join('') + '</div></fieldset></div>';
  h += '<div class="card community-guide"><p class="small">' + tr('Typ je eigen oefening of kies een suggestie uit de oefenbibliotheek.') + '</p><a class="btn ghost" href="#/train-community-exercises">' + tr('Community-oefeningen zoeken en kiezen ›') + '</a></div>';
  h += d.days.map(k => {
    const s = d.sessions[k];
  const exercises = s.exercises.map((x, i) => '<div class="exercise-editor"><div class="exercise-name-row"><label class="fld"><span>' + tr('Oefening') + '</span><input maxlength="80" list="customExerciseLibrary" placeholder="' + tr('bv. goblet squat') + '" value="' + esc(x.name || '') + '" data-chg="customExerciseField" data-day="' + k + '" data-i="' + i + '" data-f="name"></label><button class="iconbtn sm" data-act="customExerciseRemove" data-day="' + k + '" data-i="' + i + '" aria-label="' + tr('Oefening verwijderen') + '">×</button></div><div class="exercise-focus-row"><label class="fld exercise-focus"><span>' + tr('Focus of uitleg (optioneel)') + '</span><input maxlength="160" placeholder="' + tr('bv. techniek, evenwicht of bovenrug') + '" value="' + esc(x.focus || '') + '" data-chg="customExerciseField" data-day="' + k + '" data-i="' + i + '" data-f="focus"></label><div class="exercise-action-stack"><button class="iconbtn sm" data-act="customExerciseCopy" data-day="' + k + '" data-i="' + i + '" aria-label="' + tr('Oefening kopiëren') + '" title="' + tr('Oefening kopiëren') + '">⧉</button><button class="iconbtn sm" data-act="shareExercise" data-day="' + k + '" data-i="' + i + '" aria-label="' + tr('Deel deze oefening') + '" title="' + tr('Deel deze oefening') + '">↗</button></div></div><div class="exercise-load-row"><label class="fld"><span>' + tr('Sets') + '</span><input type="number" min="1" max="10" value="' + esc(x.sets || 3) + '" data-chg="customExerciseField" data-day="' + k + '" data-i="' + i + '" data-f="sets"></label><label class="fld"><span>' + tr('Herhalingen of duur') + '</span><input maxlength="16" placeholder="' + tr('bv. 8–12 of 30 sec') + '" value="' + esc(x.reps || '8–12') + '" data-chg="customExerciseField" data-day="' + k + '" data-i="' + i + '" data-f="reps"></label><label class="fld"><span>' + tr('Rust (sec)') + '</span><input type="number" min="0" max="600" value="' + esc(x.rest ?? 90) + '" data-chg="customExerciseField" data-day="' + k + '" data-i="' + i + '" data-f="rest"></label></div><details class="exercise-extra"><summary>' + tr('Extra opties (optioneel)') + '</summary><div class="grid2"><label class="fld"><span>' + tr('Vasthouden (sec per herhaling)') + '</span><input type="number" min="0" max="60" placeholder="' + tr('bv. 3') + '" value="' + esc(x.holdSeconds ?? '') + '" data-chg="customExerciseField" data-day="' + k + '" data-i="' + i + '" data-f="holdSeconds"></label><label class="fld"><span>' + tr('Gewicht (kg)') + '</span><input type="number" min="0" max="500" step="0.25" placeholder="' + tr('optioneel') + '" value="' + esc(x.weightKg ?? '') + '" data-chg="customExerciseField" data-day="' + k + '" data-i="' + i + '" data-f="weightKg"></label></div></details></div>').join('');
    return '<section class="card"><div class="custom-session-head"><h3>' + tr(s.day) + '</h3><button class="chip sm" data-act="customSessionCopy" data-day="' + k + '">' + tr('Kopieer naar andere dagen') + '</button></div><label class="fld"><span>' + tr('Naam training') + '</span><input maxlength="60" value="' + esc(s.title) + '" data-chg="customSessionField" data-day="' + k + '" data-f="title"></label><label class="fld"><span>' + tr('Notitie of uitvoering') + '</span><textarea maxlength="500" rows="2" data-chg="customSessionField" data-day="' + k + '" data-f="detail" placeholder="' + tr('Tempo, techniek, alternatief…') + '">' + esc(s.detail || '') + '</textarea></label>' + exercises + '<button class="btn ghost" data-act="customExerciseAdd" data-day="' + k + '">+ ' + tr('Oefening toevoegen') + '</button></section>';
  }).join('');
  h += '<datalist id="customExerciseLibrary">' + CUSTOM_EXERCISE_LIBRARY.map(x => '<option value="' + esc(tr(x.name)) + '"></option>').join('') + '</datalist>';
  h += '<button class="btn big" data-act="generateCustomTraining">' + tr('Voorbeeld bekijken') + '</button>';
  view().innerHTML = h;
}
function renderCustomTrainingPreview(g) {
  const first = g.weeks[0];
  return '<h2 class="sec">' + tr('Jouw eigen schema') + '</h2><div class="card"><b>' + esc(g.name) + '</b><p class="muted small">' + tr((TRAIN_LEVELS.find(x => x[0] === g.level) || ['', 'Beginner'])[1]) + ' · ' + g.weeks.length + ' ' + tr('weken') + ' · ' + first.sessions.length + ' ' + tr('dagen per week') + '</p><p class="small">' + tr('Dezelfde weeksjabloon wordt herhaald. Je kunt belasting zelf geleidelijk aanpassen; er is geen automatische progressie.') + '</p></div>' + first.sessions.map(s => '<div class="card"><h3>' + tr(s.day) + ' · ' + esc(s.title) + '</h3>' + (s.detail ? '<p>' + esc(s.detail) + '</p>' : '') + '<ul>' + s.exercises.map(x => '<li><b>' + esc(x.name) + '</b> · ' + x.sets + ' ' + tr('sets') + ' × ' + exerciseTargetText(x) + ' · ' + x.rest + ' ' + tr('sec rust') + (x.focus ? '<br><span class="muted small">' + esc(x.focus) + '</span>' : '') + '</li>').join('') + '</ul></div>').join('');
}
ACT.customTrainingField = el => {
  const d = customTrainingDraft(), f = el.dataset.f;
  if (f === 'weeks') { const n = Number(el.value); if (!Number.isInteger(n) || n < 1 || n > 24) { el.value = d.weeks; return toast(tr('Kies 1 tot 24 weken.')); } d.weeks = n; }
  else d[f] = el.value.slice(0, f === 'name' ? 60 : 40);
  DB.training.generated = null; save(); renderCustomTrainingBuilder();
};
ACT.customTrainingDay = el => {
  const d = customTrainingDraft(), key = el.dataset.day;
  if (el.checked && !d.days.includes(key)) { d.days = TRAIN_DAYS.map(([k]) => k).filter(k => d.days.includes(k) || k === key); if (!d.sessions[key]) d.sessions[key] = { day: Object.fromEntries(TRAIN_DAYS)[key], title: 'Krachttraining', detail: '', exercises: [{ name: '', sets: 3, reps: '8–12', rest: 90, holdSeconds: null, weightKg: null }] }; }
  else if (!el.checked) d.days = d.days.filter(k => k !== key);
  save(); renderCustomTrainingBuilder();
};
ACT.customSessionField = el => { const d = customTrainingDraft(), s = d.sessions[el.dataset.day]; if (s) s[el.dataset.f] = el.value.slice(0, el.dataset.f === 'title' ? 60 : 500); save(); };
ACT.customExerciseField = el => {
  const d = customTrainingDraft(), x = d.sessions[el.dataset.day]?.exercises[Number(el.dataset.i)]; if (!x) return;
  const f = el.dataset.f, value = ['sets', 'rest', 'holdSeconds'].includes(f) ? (el.value === '' && f === 'holdSeconds' ? null : Number(el.value)) : f === 'weightKg' ? (el.value === '' ? null : Number(el.value)) : el.value;
  if (['sets', 'rest'].includes(f) && (!Number.isInteger(value) || value < (f === 'sets' ? 1 : 0) || value > (f === 'sets' ? 10 : 600))) { el.value = x[f]; return toast(f === 'sets' ? tr('Sets: kies 1 tot 10.') : tr('Rust: kies 0 tot 600 seconden.')); }
  if (f === 'holdSeconds' && value !== null && (!Number.isInteger(value) || value < 0 || value > 60)) { el.value = x[f] ?? ''; return toast(tr('Houdtijd: kies 0 tot 60 seconden.')); }
  if (f === 'weightKg' && value !== null && (!Number.isFinite(value) || value < 0 || value > 500)) { el.value = x[f] ?? ''; return toast(tr('Gewicht: kies 0 tot 500 kg.')); }
  if (f === 'reps' && !validExerciseTarget(value)) { el.value = x.reps; return toast(tr('Vul herhalingen in (bv. 8–12) of een duur in seconden (bv. 30 sec).')); }
  x[f] = f === 'name' ? value.slice(0, 80) : f === 'focus' ? value.slice(0, 160) : value;
  if (f === 'name') {
    const suggestion = CUSTOM_EXERCISE_LIBRARY.find(item => tr(item.name) === value.trim());
    if (suggestion) { x.focus = tr(suggestion.focus); x.reps = suggestion.target; x.holdSeconds = suggestion.holdSeconds ?? null; renderCustomTrainingBuilder(); }
  }
  save();
};
ACT.customExerciseAdd = el => { const d = customTrainingDraft(); if (d.sessions[el.dataset.day].exercises.length >= 20) return toast(tr('Maximaal 20 oefeningen per training.')); d.sessions[el.dataset.day].exercises.push({ name: '', sets: 3, reps: '8–12', rest: 90, holdSeconds: null, weightKg: null }); save(); renderCustomTrainingBuilder(); };
ACT.customExerciseCopy = el => {
  const d = customTrainingDraft(), exercises = d.sessions[el.dataset.day]?.exercises, index = Number(el.dataset.i);
  if (!exercises || !exercises[index]) return;
  if (exercises.length >= 20) return toast(tr('Maximaal 20 oefeningen per training.'));
  exercises.splice(index + 1, 0, JSON.parse(JSON.stringify(exercises[index]))); save(); renderCustomTrainingBuilder();
};
ACT.customSessionCopy = el => {
  const d = customTrainingDraft(), sourceKey = el.dataset.day, source = d.sessions[sourceKey];
  const targets = d.days.filter(key => key !== sourceKey);
  if (!targets.length) return toast(tr('Kies minstens één andere trainingsdag om naartoe te kopiëren.'));
  const hasContent = session => session && (session.title !== 'Krachttraining' || session.detail || session.exercises.some(x => x.name || x.focus));
  if (targets.some(key => hasContent(d.sessions[key])) && !confirm(tr('Dit vervangt de inhoud van de andere gekozen trainingsdagen. Doorgaan?'))) return;
  const labels = Object.fromEntries(TRAIN_DAYS);
  for (const key of targets) d.sessions[key] = Object.assign({}, JSON.parse(JSON.stringify(source)), { day: labels[key] });
  save(); renderCustomTrainingBuilder(); toast(tr('Training naar de andere gekozen dagen gekopieerd.'));
};
ACT.customExerciseRemove = el => { const d = customTrainingDraft(); d.sessions[el.dataset.day]?.exercises.splice(Number(el.dataset.i), 1); save(); renderCustomTrainingBuilder(); };
ACT.generateCustomTraining = () => {
  const d = customTrainingDraft(); if (!d.name.trim()) return toast(tr('Geef je schema een naam.')); if (!d.days.length) return toast(tr('Kies minstens één trainingsdag.'));
  for (const day of d.days) { const s = d.sessions[day]; if (!s.exercises.length || s.exercises.some(x => !x.name.trim() || !Number.isInteger(Number(x.sets)) || Number(x.sets) < 1 || Number(x.sets) > 10 || !Number.isInteger(Number(x.rest)) || Number(x.rest) < 0 || Number(x.rest) > 600 || !validExerciseTarget(x.reps) || (x.holdSeconds != null && (!Number.isInteger(Number(x.holdSeconds)) || Number(x.holdSeconds) < 0 || Number(x.holdSeconds) > 60)) || (x.weightKg != null && (!Number.isFinite(Number(x.weightKg)) || Number(x.weightKg) < 0 || Number(x.weightKg) > 500)))) return toast(tr('Vul per trainingsdag minstens één oefening in met 1–10 sets, een herhalingsaantal of duur in seconden en 0–600 seconden rust.')); }
  const labels = Object.fromEntries(TRAIN_DAYS), sessions = d.days.map(k => Object.assign({}, JSON.parse(JSON.stringify(d.sessions[k])), { day: labels[k] }));
  const weeks = Array.from({ length: d.weeks }, (_, i) => ({ number: i + 1, phase: 'Eigen weekschema', focus: 'Pas je belasting alleen aan als je techniek en herstel goed blijven.', sessions: JSON.parse(JSON.stringify(sessions)) }));
  DB.training.generated = { programType: 'custom', customPlan: true, name: d.name.trim().slice(0, 60), goal: d.goal, level: d.level, days: d.days.slice(), weeks };
  save(); go('#/train');
};

function renderSavedTrainingEditor(id) {
  const p = savedTrainingPlans().find(x => x.id === id);
  if (!p || !Array.isArray(p.weeks)) { view().innerHTML = header('Schema aanpassen', '', true) + '<div class="card note">' + tr('Dit opgeslagen schema is niet gevonden.') + '</div>'; return; }
  let h = header('Schema aanpassen', 'Pas je volledige schema aan; alle weken blijven behouden', true);
  h += '<div class="card note"><p class="small">' + tr('Je past alleen je eigen bewaarde schema aan. De oorspronkelijke communityversie blijft staan; je voortgang en weekindeling blijven behouden.') + '</p><label class="fld"><span>' + tr('Naam van je schema') + '</span><input maxlength="60" value="' + esc(p.name || '') + '" data-chg="savedPlanName" data-id="' + esc(id) + '"></label></div>';
  h += p.weeks.map((week, wi) => '<details class="card train-week"' + (wi === 0 ? ' open' : '') + '><summary><b>' + tr('Week') + ' ' + (wi + 1) + '</b><span class="muted small">' + esc(week.phase || '') + '</span></summary><label class="fld"><span>' + tr('Focus van deze week') + '</span><input maxlength="300" value="' + esc(week.focus || '') + '" data-chg="savedPlanWeekField" data-id="' + esc(id) + '" data-w="' + wi + '" data-f="focus"></label><label class="fld"><span>' + tr('Fase of naam van de week') + '</span><input maxlength="80" value="' + esc(week.phase || '') + '" data-chg="savedPlanWeekField" data-id="' + esc(id) + '" data-w="' + wi + '" data-f="phase"></label>' + (week.sessions || []).map((session, si) => '<div class="card"><h3>' + esc(tr(session.day || 'Training {number}').replace('{number}', si + 1)) + '</h3><label class="fld"><span>' + tr('Naam training') + '</span><input maxlength="80" value="' + esc(session.title || '') + '" data-chg="savedPlanSessionField" data-id="' + esc(id) + '" data-w="' + wi + '" data-s="' + si + '" data-f="title"></label><label class="fld"><span>' + tr('Notitie of uitvoering') + '</span><textarea rows="2" maxlength="1200" data-chg="savedPlanSessionField" data-id="' + esc(id) + '" data-w="' + wi + '" data-s="' + si + '" data-f="detail">' + esc(session.detail || '') + '</textarea></label>' + (session.exercises || []).map((x, xi) => '<div class="exercise-editor"><label class="fld"><span>' + tr('Oefening') + '</span><input maxlength="80" value="' + esc(x.name || '') + '" data-chg="savedPlanExerciseField" data-id="' + esc(id) + '" data-w="' + wi + '" data-s="' + si + '" data-i="' + xi + '" data-f="name"></label><label class="fld"><span>' + tr('Focus of uitleg (optioneel)') + '</span><input maxlength="160" value="' + esc(x.focus || '') + '" data-chg="savedPlanExerciseField" data-id="' + esc(id) + '" data-w="' + wi + '" data-s="' + si + '" data-i="' + xi + '" data-f="focus"></label><div class="exercise-load-row"><label class="fld"><span>' + tr('Sets') + '</span><input type="number" min="1" max="10" value="' + esc(x.sets || 1) + '" data-chg="savedPlanExerciseField" data-id="' + esc(id) + '" data-w="' + wi + '" data-s="' + si + '" data-i="' + xi + '" data-f="sets"></label><label class="fld"><span>' + tr('Herhalingen of duur') + '</span><input maxlength="16" value="' + esc(x.reps || '') + '" data-chg="savedPlanExerciseField" data-id="' + esc(id) + '" data-w="' + wi + '" data-s="' + si + '" data-i="' + xi + '" data-f="reps"></label><label class="fld"><span>' + tr('Rust (sec)') + '</span><input type="number" min="0" max="600" value="' + esc(x.rest ?? 0) + '" data-chg="savedPlanExerciseField" data-id="' + esc(id) + '" data-w="' + wi + '" data-s="' + si + '" data-i="' + xi + '" data-f="rest"></label></div><details class="exercise-extra"><summary>' + tr('Extra opties (optioneel)') + '</summary><div class="grid2"><label class="fld"><span>' + tr('Vasthouden (sec per herhaling)') + '</span><input type="number" min="0" max="60" placeholder="' + tr('bv. 3') + '" value="' + esc(x.holdSeconds ?? '') + '" data-chg="savedPlanExerciseField" data-id="' + esc(id) + '" data-w="' + wi + '" data-s="' + si + '" data-i="' + xi + '" data-f="holdSeconds"></label><label class="fld"><span>' + tr('Gewicht (kg)') + '</span><input type="number" min="0" max="500" step="0.25" placeholder="' + tr('optioneel') + '" value="' + esc(x.weightKg ?? '') + '" data-chg="savedPlanExerciseField" data-id="' + esc(id) + '" data-w="' + wi + '" data-s="' + si + '" data-i="' + xi + '" data-f="weightKg"></label></div></details><button class="link danger" data-act="removeSavedPlanExercise" data-id="' + esc(id) + '" data-w="' + wi + '" data-s="' + si + '" data-i="' + xi + '">' + tr('Verwijder oefening') + '</button></div>').join('') + '<button class="btn ghost" data-act="addSavedPlanExercise" data-id="' + esc(id) + '" data-w="' + wi + '" data-s="' + si + '">+ ' + tr('Oefening toevoegen') + '</button></div>').join('') + '</details>').join('');
  view().innerHTML = h;
}
function editSavedPlanNode(el) {
  const p = savedTrainingPlans().find(x => x.id === el.dataset.id);
  const week = p?.weeks?.[Number(el.dataset.w)], session = week?.sessions?.[Number(el.dataset.s)];
  if (session && !Array.isArray(session.exercises)) session.exercises = [];
  const exercise = session?.exercises?.[Number(el.dataset.i)];
  return { p, week, session, exercise };
}
ACT.savedPlanName = el => { const p = savedTrainingPlans().find(x => x.id === el.dataset.id); if (p) { p.name = el.value.trim().slice(0,60) || tr('Mijn trainingsschema'); save(); } };
ACT.savedPlanWeekField = el => { const { p, week } = editSavedPlanNode(el); if (!p || !week) return; week[el.dataset.f] = el.value.slice(0, el.dataset.f === 'phase' ? 80 : 300); save(); };
ACT.savedPlanSessionField = el => { const { p, session } = editSavedPlanNode(el); if (!p || !session) return; session[el.dataset.f] = el.value.slice(0, el.dataset.f === 'title' ? 80 : 1200); save(); };
ACT.savedPlanExerciseField = el => {
  const { p, exercise } = editSavedPlanNode(el); if (!p || !exercise) return;
  const f = el.dataset.f, value = ['sets','rest','holdSeconds'].includes(f) ? (el.value === '' && f === 'holdSeconds' ? null : Number(el.value)) : f === 'weightKg' ? (el.value === '' ? null : Number(el.value)) : el.value;
  if (f === 'sets' && (!Number.isInteger(value) || value < 1 || value > 10)) { el.value = exercise.sets; return toast(tr('Sets: kies 1 tot 10.')); }
  if (f === 'rest' && (!Number.isInteger(value) || value < 0 || value > 600)) { el.value = exercise.rest; return toast(tr('Rust: kies 0 tot 600 seconden.')); }
  if (f === 'reps' && !validExerciseTarget(value)) { el.value = exercise.reps; return toast(tr('Vul herhalingen in (bv. 8–12) of een duur in seconden (bv. 30 sec).')); }
  if (f === 'holdSeconds' && value !== null && (!Number.isInteger(value) || value < 0 || value > 60)) { el.value = exercise[f] ?? ''; return toast(tr('Houdtijd: kies 0 tot 60 seconden.')); }
  if (f === 'weightKg' && value !== null && (!Number.isFinite(value) || value < 0 || value > 500)) { el.value = exercise[f] ?? ''; return toast(tr('Gewicht: kies 0 tot 500 kg.')); }
  exercise[f] = ['name','focus'].includes(f) ? value.slice(0, f === 'name' ? 80 : 160) : value; save();
};
ACT.addSavedPlanExercise = el => { const { p, session } = editSavedPlanNode(el); if (!p || !session) return; if (session.exercises.length >= 20) return toast(tr('Maximaal 20 oefeningen per training.')); session.exercises.push({ name:'', focus:'', sets:3, reps:'8–12', rest:90, holdSeconds:null, weightKg:null }); save(); renderSavedTrainingEditor(p.id); };
ACT.removeSavedPlanExercise = el => { const { p, session, exercise } = editSavedPlanNode(el); if (!p || !session || !exercise || !confirm(tr('Deze oefening uit je schema verwijderen?'))) return; session.exercises.splice(Number(el.dataset.i),1); save(); renderSavedTrainingEditor(p.id); };
ACT.editSavedTrainingPlan = el => go('#/schema-bewerken/' + encodeURIComponent(el.dataset.id));

function renderTrainingHub() {
  const plans = savedTrainingPlans(), active = activeTrainingPlan();
  let h = header('Schema’s', 'Kies, start en volg een plan op jouw tempo', true);
  h += '<div class="card"><p>' + tr('Je schema’s blijven op dit toestel bewaard. Je kan er één tegelijk actief volgen, pauzeren of stopzetten.') + '</p><div class="inrow wrap"><a class="btn" href="#/train">' + tr('Schema op maat') + '</a><a class="btn ghost" href="#/train-custom">' + tr('Zelf samenstellen') + '</a></div><p><a class="link" href="#/train-community">' + tr('Ontdek schema’s van de community ›') + '</a></p><a class="link" href="#/train-community-exercises">' + tr('Community-oefeningen zoeken en kiezen ›') + '</a></div>';
  if (active) {
    const wi = Math.min(Math.max(0, active.currentWeek - 1), active.weeks.length - 1), week = active.weeks[wi];
    const done = active.doneSessions || [], count = done.filter(k => k.startsWith(week.number + ':')).length;
    h += '<h2 class="sec">' + tr('Actief schema') + '</h2><div class="card plan-active"><div class="plan-head"><span class="pill">' + tr('WEEK {current} VAN {total}').replace('{current}', week.number).replace('{total}', active.weeks.length) + '</span><span class="muted small">' + esc(tr((TRAIN_LEVELS.find(x => x[0] === active.level) || ['', ''])[1])) + '</span></div><h2 class="plan-title">' + esc(active.customPlan ? active.name : tr(TRAIN_GOALS[active.goal] || active.name || 'Trainingsschema')) + '</h2><p class="muted small">' + esc(tr(week.phase || 'Opbouw')) + (week.focus ? ' · ' + esc(tr(week.focus)) : '') + '</p><div class="prog"><i style="width:' + Math.round(count / Math.max(1, week.sessions.length) * 100) + '%"></i></div><p class="muted small">' + tr('{done} van {total} trainingen afgevinkt deze week').replace('{done}', count).replace('{total}', week.sessions.length) + '</p>';
    const planText = value => active.customPlan ? String(value || '') : trTrainingText(value);
    h += week.sessions.map((s, i) => { const key = week.number + ':' + i, checked = done.includes(key); return '<div class="plan-session' + (checked ? ' complete' : '') + '"><div><b>' + esc(active.customPlan ? s.day : tr(s.day || 'Training {number}').replace('{number}', i + 1)) + ' · ' + esc(planText(s.title)) + '</b>' + (s.detail ? '<p>' + esc(planText(s.detail)) + '</p>' : '') + ((s.exercises || []).length ? '<ul class="small">' + s.exercises.map(x => '<li><b>' + esc(active.customPlan ? x.name : trTrainingText(x.name)) + '</b> · ' + x.sets + ' ' + tr('sets') + ' × ' + exerciseTargetText(x) + ' · ' + x.rest + ' ' + tr('sec rust') + (x.focus ? '<br><span class="muted">' + esc(active.customPlan ? x.focus : trTrainingText(x.focus)) + '</span>' : '') + '</li>').join('') + '</ul>' : '') + '</div><div class="plan-session-actions"><button class="chip sm ' + (checked ? 'done' : '') + '" data-act="togglePlanSession" data-id="' + esc(active.id) + '" data-week="' + week.number + '" data-i="' + i + '" aria-pressed="' + checked + '">' + tr(checked ? '✓ Klaar' : 'Markeer klaar') + '</button>' + (checked ? '<button class="chip sm" data-act="logPlanActivity" data-id="' + esc(active.id) + '" data-week="' + week.number + '" data-i="' + i + '">' + tr('Log kcal-schatting') + '</button>' : '') + '</div></div>'; }).join('');
    if (done.length && week.sessions.every((_, i) => done.includes(week.number + ':' + i))) h += '<div class="card note"><b>' + tr('Deze week is afgevinkt') + '</b><p class="small">' + tr('Kijk de afgevinkte trainingen nog even na. Je kan ze hierboven terugzetten voordat je verdergaat.') + '</p><button class="btn big" data-act="advanceTrainingWeek" data-id="' + esc(active.id) + '">' + tr(active.currentWeek < active.weeks.length ? 'Open de volgende week' : 'Rond schema af') + '</button></div>';
    h += '<div class="inrow wrap"><button class="btn ghost" data-act="editSavedTrainingPlan" data-id="' + esc(active.id) + '">' + tr('Schema aanpassen') + '</button><button class="btn ghost" data-act="shareTrainingPlan" data-id="' + esc(active.id) + '">' + tr('Deel met community') + '</button><button class="btn ghost" data-act="pauseTrainingPlan" data-id="' + esc(active.id) + '">' + tr('Pauzeer schema') + '</button><button class="link danger" data-act="stopTrainingPlan" data-id="' + esc(active.id) + '">' + tr('Zet schema stop') + '</button></div></div>';
  } else h += '<div class="card muted">' + tr('Je volgt momenteel geen actief schema. Kies hieronder een gepauzeerd schema om verder te gaan of stel een nieuw schema samen.') + '</div>';
  const others = plans.filter(p => !active || p.id !== active.id);
  if (others.length) h += '<h2 class="sec">' + tr('Opgeslagen schema’s') + '</h2>' + others.map(p => {
    const status = { paused: 'Gepauzeerd', stopped: 'Gestopt', completed: 'Afgerond' }[p.status] || 'Opgeslagen';
    const button = p.status === 'paused' ? '<button class="btn ghost" data-act="resumeTrainingPlan" data-id="' + esc(p.id) + '">' + tr('Verder volgen') + '</button>' : p.status === 'completed' ? '<button class="btn ghost" data-act="restartTrainingPlan" data-id="' + esc(p.id) + '">' + tr('Opnieuw starten') + '</button>' : '<button class="btn ghost" data-act="resumeTrainingPlan" data-id="' + esc(p.id) + '">' + tr('Opnieuw activeren') + '</button>';
    return '<div class="card plan-saved"><div class="plan-head"><span class="pill">' + tr(status).toUpperCase() + '</span><span class="muted small">' + esc(p.createdAt || '') + '</span></div><b>' + esc(p.customPlan ? p.name : tr(TRAIN_GOALS[p.goal] || p.name || 'Trainingsschema')) + '</b><p class="muted small">' + esc(tr((TRAIN_LEVELS.find(x => x[0] === p.level) || ['', ''])[1])) + ' · ' + p.weeks.length + ' ' + tr('weken') + '</p><div class="inrow wrap">' + button + '<button class="btn ghost" data-act="editSavedTrainingPlan" data-id="' + esc(p.id) + '">' + tr('Schema aanpassen') + '</button><button class="btn ghost" data-act="shareTrainingPlan" data-id="' + esc(p.id) + '">' + tr('Deel') + '</button><button class="link danger" data-act="deleteTrainingPlan" data-id="' + esc(p.id) + '">' + tr('Verwijder') + '</button></div></div>';
  }).join('');
  if (!plans.length) h += '<p class="muted small">' + tr('Als je een schema maakt en op “Start dit schema” tikt, verschijnt het hier én op Vandaag.') + '</p>';
  view().innerHTML = h;
}
let TRAINING_COMMUNITY_CACHE = {};
let TRAINING_COMMUNITY_ROWS = [];
function publicTrainingPlan(p) {
  const weeks = (Array.isArray(p.weeks) ? p.weeks : []).slice(0, 24).map((w, i) => ({
    number: i + 1, phase: String(w.phase || '').slice(0, 80), focus: String(w.focus || '').slice(0, 300),
    sessions: (Array.isArray(w.sessions) ? w.sessions : []).slice(0, 7).map(s => ({
      day: String(s.day || '').slice(0, 30), title: String(s.title || '').slice(0, 80), detail: String(s.detail || '').slice(0, 1200),
      exercises: (Array.isArray(s.exercises) ? s.exercises : []).slice(0, 20).map(x => ({ name: String(x.name || '').slice(0, 80), focus: String(x.focus || '').slice(0, 160), sets: Math.max(1, Math.min(10, Number(x.sets) || 1)), reps: String(x.reps || '').slice(0, 16), rest: Math.max(0, Math.min(600, Number(x.rest) || 0)), holdSeconds: x.holdSeconds == null || x.holdSeconds === '' ? null : Math.max(0, Math.min(60, Number(x.holdSeconds) || 0)), weightKg: x.weightKg == null || x.weightKg === '' ? null : Math.max(0, Math.min(500, Number(x.weightKg) || 0)) }))
    }))
  }));
  if (!weeks.length || weeks.some(w => !w.sessions.length)) throw new Error('Dit schema heeft geen volledige weken om te delen.');
  return { title: String(p.name || TRAIN_GOALS[p.goal] || 'Trainingsschema').trim().slice(0, 80), goal: String(TRAIN_GOALS[p.goal] || p.goal || 'Algemeen').slice(0, 40), level: TRAIN_LEVELS.some(([k]) => k === p.level) ? p.level : 'beginner', weeks };
}
function normalizeCommunityTrainingPlan(row) {
  const text = (value, max) => typeof value === 'string' && value.length <= max;
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  const optionalNumber = (value, min, max) => value === null || value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max);
  if (!row || typeof row !== 'object' || Array.isArray(row) || !text(row.title, 80) || !row.title.trim() ||
      !text(row.goal, 40) || !row.goal.trim() || !TRAIN_LEVELS.some(([level]) => level === row.level) ||
      !Array.isArray(row.weeks) || row.weeks.length < 1 || row.weeks.length > 24) return null;
  const weeks = [];
  for (const [index, week] of row.weeks.entries()) {
    if (!week || typeof week !== 'object' || Array.isArray(week) || !integer(week.number, 1, 24) ||
        !text(week.phase, 80) || !text(week.focus, 300) || !Array.isArray(week.sessions) || week.sessions.length < 1 || week.sessions.length > 7) return null;
    const sessions = [];
    for (const session of week.sessions) {
      if (!session || typeof session !== 'object' || Array.isArray(session) || !text(session.day, 30) ||
          !text(session.title, 80) || !text(session.detail, 1200) || !Array.isArray(session.exercises) || session.exercises.length > 20) return null;
      const exercises = [];
      for (const exercise of session.exercises) {
        if (!exercise || typeof exercise !== 'object' || Array.isArray(exercise) || !text(exercise.name, 80) ||
            !text(exercise.focus, 160) || !text(exercise.reps, 16) || !integer(exercise.sets, 1, 10) ||
            !integer(exercise.rest, 0, 600) || !optionalNumber(exercise.holdSeconds, 0, 60) ||
            (exercise.holdSeconds != null && !Number.isInteger(exercise.holdSeconds)) || !optionalNumber(exercise.weightKg, 0, 500)) return null;
        exercises.push(exercise);
      }
      sessions.push(session);
    }
    weeks.push(week);
  }
  return Object.assign({}, row, { weeks });
}
ACT.shareTrainingPlan = async el => {
  const p = savedTrainingPlans().find(x => x.id === el.dataset.id); if (!p) return;
  if (!cloudReady() || !DB.settings.member) return toast(tr('Schema’s delen kan na aanmelden bij de community.'));
  if (!navigator.onLine) return toast(tr('Schema’s delen kan alleen met internet.'));
  let profileName = DB.settings.communityName;
  if (!profileName) { profileName = prompt(tr('Welke communitynaam mogen andere leden bij dit schema zien?')); if (!profileName) return; }
  try {
    profileName = await saveCommunityProfile(profileName);
    if (!confirm(tr('Dit schema wordt zichtbaar voor alle leden. Deel alleen oefeningen en notities die je openbaar wilt maken; je trainingsgeschiedenis wordt niet gedeeld.'))) return;
    const body = publicTrainingPlan(p); await ensureSession();
    let id = p.sharedId;
    if (id) await sb('/rest/v1/shared_training_plans?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: Object.assign({}, body, { updated_at: new Date().toISOString() }) });
    else { const rows = await sb('/rest/v1/shared_training_plans', { method: 'POST', headers: { Prefer: 'return=representation' }, body }); id = rows[0].id; p.sharedId = id; save(); }
    const url = appBase() + '#/train-shared/' + id;
    try { if (navigator.share) await navigator.share({ title: body.title, text: 'Trainingsschema van ' + profileName, url }); else { await navigator.clipboard.writeText(url); toast(tr('Link gekopieerd.')); } }
    catch (e) { if (e.name !== 'AbortError') { try { await navigator.clipboard.writeText(url); toast(tr('Link gekopieerd.')); } catch (_) { prompt(tr('Deel deze link:'), url); } } }
  } catch (e) { toast(trOr(e.message, 'Trainingsschema delen is mislukt. Controleer je verbinding en probeer opnieuw.')); }
};
async function renderTrainingCommunity() {
  let h = header('Communityschema’s', 'Ontdek schema’s die leden bewust hebben gedeeld', true);
  view().innerHTML = h + '<p class="muted">' + tr('Schema’s laden…') + '</p>';
  if (!cloudReady() || !DB.settings.member) { view().innerHTML = h + '<div class="card note">' + tr('Log in als communitylid om gedeelde schema’s te bekijken.') + '</div>'; return; }
  if (!navigator.onLine) { view().innerHTML = h + '<div class="card note">' + tr('Gedeelde schema’s laden kan alleen met internet.') + '</div>'; return; }
  try {
    const rows = await sb('/rest/v1/shared_training_plans?select=*&order=created_at.desc&limit=100', {});
    const reviews = rows.length ? await sb('/rest/v1/shared_training_plan_reviews?select=plan_id,rating,comment,created_by,created_at&limit=1000', {}) : [];
    let names = {}; try { names = await fetchCommunityProfiles(rows.map(x => x.created_by).concat(reviews.map(x => x.created_by))); } catch (e) { }
    const current = (cloudUser() || {}).id;
    TRAINING_COMMUNITY_ROWS = rows.map(r => {
      const safe = normalizeCommunityTrainingPlan(r); if (!safe) return null;
      const rs = reviews.filter(x => x.plan_id === r.id), stats = { n: rs.length, avg: rs.length ? rs.reduce((a, x) => a + x.rating, 0) / rs.length : null };
      const plan = Object.assign({}, safe, { authorName: names[r.created_by] || 'Communitylid', stats, reviews: rs.map(x => Object.assign({}, x, { authorName: names[x.created_by] || 'Communitylid', mine: x.created_by === current })) });
      TRAINING_COMMUNITY_CACHE[r.id] = plan; return plan;
    }).filter(Boolean);
    h += '<div class="card community-guide"><b>' + tr('Zo werkt schema’s delen') + '</b><p class="small">' + tr('Deel een eigen weekplan bewust met leden. Zij kunnen het bekijken, beoordelen en een kopie aan hun eigen schema’s toevoegen. Je trainingsgeschiedenis en voortgang worden niet meegedeeld.') + '</p><a class="link" href="#/community-profiel">' + tr('Communitynaam instellen ›') + '</a></div>' +
      '<div class="card"><label class="fld"><span>' + tr('Zoek op schemanaam of communitynaam') + '</span><input type="search" id="communityPlanSearch" data-community-filter="plans" placeholder="' + tr('Zoek in gedeelde schema’s') + '"></label><div class="grid2"><label class="fld"><span>' + tr('Doel of type') + '</span><select id="communityPlanGoal" data-community-filter="plans"><option value="all">' + tr('Alle doelen') + '</option>' + Object.entries(TRAIN_GOALS).map(([key, label]) => '<option value="' + esc(key) + '">' + esc(tr(label)) + '</option>').join('') + '</select></label><label class="fld"><span>' + tr('Niveau') + '</span><select id="communityPlanLevel" data-community-filter="plans"><option value="all">' + tr('Alle niveaus') + '</option>' + TRAIN_LEVELS.map(([key, label]) => '<option value="' + key + '">' + tr(label) + '</option>').join('') + '</select></label></div><small class="muted">' + tr('Zoekopdracht doorzoekt de nieuwste 100 gedeelde schema’s.') + '</small></div><div id="communityPlanResults"></div>';
    view().innerHTML = h; renderTrainingCommunityList();
  } catch (e) { view().innerHTML = h + '<div class="card note">' + esc(trOr(e.message, 'Gedeelde schema’s zijn nog niet beschikbaar. Controleer of de communitytabellen op Supabase zijn bijgewerkt.')) + '</div>'; }
}
function renderTrainingCommunityList() {
  const target = document.getElementById('communityPlanResults'); if (!target) return;
  const needle = ((document.getElementById('communityPlanSearch') || {}).value || '').toLocaleLowerCase().trim();
  const goal = (document.getElementById('communityPlanGoal') || {}).value || 'all';
  const level = (document.getElementById('communityPlanLevel') || {}).value || 'all';
  const rows = TRAINING_COMMUNITY_ROWS.filter(r => {
    if (needle && !(r.title + ' ' + r.authorName).toLocaleLowerCase().includes(needle)) return false;
    if (goal !== 'all' && r.goal !== goal) return false;
    if (level !== 'all' && r.level !== level) return false;
    return true;
  });
  const cards = rows.map(r => {
    const weeks = Array.isArray(r.weeks) ? r.weeks.length : 0, sessions = r.weeks?.[0]?.sessions?.length || 0, label = TRAIN_LEVELS.find(x => x[0] === r.level)?.[1] || 'Beginner';
    const review = r.stats.avg === null ? tr('Nog geen beoordelingen') : '★ ' + fmtNum(r.stats.avg, 1) + '/5 · ' + r.stats.n + ' ' + tr(r.stats.n === 1 ? 'beoordeling' : 'beoordelingen');
    return '<a class="card plan-community" href="#/train-shared/' + encodeURIComponent(r.id) + '"><div class="plan-head"><b>' + esc(r.title) + '</b><span class="pill">' + weeks + ' ' + tr('weken') + '</span></div><p class="muted small">' + esc(r.authorName) + ' · ' + esc(tr(TRAIN_GOALS[r.goal] || r.goal)) + ' · ' + esc(tr(label)) + ' · ' + sessions + ' ' + tr('trainingsdagen/week') + '</p><p class="small">' + review + '</p><span class="plan-go">' + tr('Schema bekijken ›') + '</span></a>';
  }).join('');
  target.innerHTML = cards || '<div class="card muted">' + (TRAINING_COMMUNITY_ROWS.length ? tr('Geen schema’s gevonden met deze filters.') : tr('Er zijn nog geen schema’s gedeeld. Deel je eigen schema om de community op gang te brengen.')) + '</div>';
}
async function renderSharedTraining(id) {
  let h = header('Communityschema', 'Gedeeld trainingsplan', true);
  view().innerHTML = h + '<p class="muted">' + tr('Schema laden…') + '</p>';
  if (!cloudReady() || !DB.settings.member || !navigator.onLine) { view().innerHTML = h + '<div class="card note">' + tr('Bekijk een gedeeld schema als communitylid met internetverbinding.') + '</div>'; return; }
  try {
    let p = TRAINING_COMMUNITY_CACHE[id];
    if (!p) {
      const rows = await sb('/rest/v1/shared_training_plans?select=*&id=eq.' + encodeURIComponent(id) + '&limit=1', {}); p = normalizeCommunityTrainingPlan(rows[0]);
      if (p) { const reviews = await sb('/rest/v1/shared_training_plan_reviews?select=plan_id,rating,comment,created_by,created_at&plan_id=eq.' + encodeURIComponent(id), {}); let names = {}; try { names = await fetchCommunityProfiles([p.created_by].concat(reviews.map(x => x.created_by))); } catch (e) { } p = Object.assign({}, p, { authorName: names[p.created_by] || 'Communitylid', reviews: reviews.map(x => Object.assign({}, x, { authorName: names[x.created_by] || 'Communitylid', mine: x.created_by === (cloudUser() || {}).id })) }); TRAINING_COMMUNITY_CACHE[id] = p; }
    }
    if (!p) { view().innerHTML = h + '<div class="card note">' + tr('Dit gedeelde schema bevat ongeldige gegevens en kan niet veilig worden getoond.') + '</div>'; return; }
    const weeks = p.weeks.map(w => '<details class="card train-week"><summary><b>' + tr('Week') + ' ' + esc(String(w.number)) + ' · ' + esc(tr(w.phase || 'Opbouw')) + '</b><span class="muted small">' + esc(w.focus || '') + '</span></summary>' + w.sessions.map(s => '<div class="train-session"><b>' + esc(tr(s.day)) + ' · ' + esc(s.title === 'Krachttraining' ? tr(s.title) : s.title) + '</b>' + (s.detail ? '<p>' + esc(s.detail) + '</p>' : '') + (s.exercises.length ? '<ul>' + s.exercises.map(x => '<li><b>' + esc(x.name) + '</b> · ' + esc(String(x.sets)) + ' ' + tr('sets') + ' × ' + exerciseTargetText(x) + ' · ' + esc(String(x.rest)) + ' ' + tr('sec rust') + (x.focus ? '<br><span class="muted small">' + esc(x.focus) + '</span>' : '') + '</li>').join('') + '</ul>' : '') + '</div>').join('') + '</details>').join('');
    const mine = p.reviews.find(x => x.mine), isAuthor = p.created_by && p.created_by === (cloudUser() || {}).id;
    const reviewForm = isAuthor ? '<p class="muted small">' + tr('Dit is jouw schema. Andere communityleden kunnen het beoordelen.') + '</p>' : '<h3>' + tr('Beoordeel dit schema') + '</h3><p class="muted small">' + tr('Deel je indruk met andere leden. Je beoordeling is zichtbaar onder je communitynaam.') + '</p><label class="fld"><span>' + tr('Beoordeling') + '</span><select id="trainingRating"><option value="">' + tr('Kies sterren') + '</option>' + [1, 2, 3, 4, 5].map(n => '<option value="' + n + '"' + (mine && mine.rating === n ? ' selected' : '') + '>' + '★'.repeat(n) + ' · ' + n + '/5</option>').join('') + '</select></label><label class="fld"><span>' + tr('Reactie (optioneel)') + '</span><textarea id="trainingComment" maxlength="600" rows="3" placeholder="' + tr('Wat werkte goed of wat moet iemand weten?') + '">' + esc(mine && mine.comment || '') + '</textarea></label><button class="btn" data-act="saveTrainingReview" data-id="' + esc(id) + '">' + tr('Beoordeling plaatsen') + '</button>';
    const reviewHtml = '<div class="card">' + reviewForm + (p.reviews.length ? '<h3>' + tr('Beoordelingen') + '</h3>' + p.reviews.slice().reverse().slice(0, 15).map(x => '<p class="community-review"><b>' + esc(x.authorName) + '</b> · ' + '★'.repeat(x.rating) + ' ' + x.rating + '/5' + (x.comment ? '<br>' + esc(x.comment) : '') + '</p>').join('') : '<p class="muted small">' + tr('Nog geen beoordelingen.') + '</p>') + '</div>';
    h += '<div class="card plan-community"><h2>' + esc(p.title === 'Mijn trainingsschema' ? tr(p.title) : p.title) + '</h2><p class="muted small">' + tr('Gedeeld door') + ' ' + esc(p.authorName) + ' · ' + esc(tr(TRAIN_GOALS[p.goal] || p.goal)) + ' · ' + esc(tr((TRAIN_LEVELS.find(x => x[0] === p.level) || ['', 'Beginner'])[1])) + '</p><button class="btn" data-act="copySharedTrainingPlan" data-id="' + esc(id) + '">' + tr('Bewaar bij mijn schema’s') + '</button><p class="muted small">' + tr('Na bewaren kan je alle weken aanpassen; de volledige trainingsopbouw blijft behouden.') + '</p></div>' + weeks + reviewHtml;
    view().innerHTML = h;
  } catch (e) { console.error('Gedeeld schema laden mislukt', e); view().innerHTML = h + '<div class="card note">' + tr('Schema of beoordelingen laden mislukt. Probeer het opnieuw.') + '</div>'; }
}
ACT.saveTrainingReview = async el => {
  const rating = Number($('#trainingRating').value), comment = $('#trainingComment').value.trim().slice(0, 600);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return toast(tr('Kies eerst een beoordeling van 1 tot 5 sterren.'));
  try {
    if (!DB.settings.communityName) { const name = prompt(tr('Kies een communitynaam. Die is zichtbaar bij je beoordeling, niet je echte accountgegevens.')); if (!name) return; await saveCommunityProfile(name); }
    await ensureSession();
    await sb('/rest/v1/shared_training_plan_reviews?on_conflict=plan_id,created_by', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: { plan_id: el.dataset.id, rating, comment: comment || null, updated_at: new Date().toISOString() } });
    delete TRAINING_COMMUNITY_CACHE[el.dataset.id]; toast(tr('Je beoordeling staat bij het schema.')); await renderSharedTraining(el.dataset.id);
  } catch (e) { console.error('Trainingsbeoordeling opslaan mislukt', e); toast(tr('Je beoordeling opslaan is mislukt. Probeer het opnieuw.')); }
};
ACT.copySharedTrainingPlan = el => {
  const shared = TRAINING_COMMUNITY_CACHE[el.dataset.id]; if (!shared) return toast(tr('Ververs de community en probeer opnieuw.'));
  const copy = publicTrainingPlan({ name: shared.title, goal: shared.goal, level: shared.level, weeks: shared.weeks });
  const p = { id: uid(), name: copy.title, goal: shared.goal, level: copy.level, weeks: copy.weeks, customPlan: true, status: 'paused', createdAt: todayKey(), currentWeek: 1, doneSessions: [], copiedFrom: shared.id };
  savedTrainingPlans().unshift(p); save(); toast(tr('Schema bewaard bij jouw schema’s.')); go('#/schemas');
};
function activeTrainingHomeCard() {
  const p = activeTrainingPlan();
  if (!p) return '<a class="card plan-home-empty" href="#/schemas"><b>' + tr('Je trainingsschema') + '</b><span class="muted small">' + tr('Nog geen actief schema. Kies een plan en volg hier je voortgang.') + '</span><span class="plan-go">' + tr('Schema’s bekijken ›') + '</span></a>';
  const week = p.weeks[Math.min(Math.max(0, p.currentWeek - 1), p.weeks.length - 1)];
  const done = (p.doneSessions || []).filter(k => k.startsWith(week.number + ':')).length;
  return '<a class="card plan-home" href="#/schemas"><div class="plan-head"><span class="pill">' + tr('ACTIEF · WEEK {current}/{total}').replace('{current}', week.number).replace('{total}', p.weeks.length) + '</span><b>' + esc(p.customPlan ? p.name : tr(TRAIN_GOALS[p.goal] || p.name || 'Trainingsschema')) + '</b></div><p class="small">' + esc(tr(week.phase || 'Opbouw')) + ' · ' + tr('{done}/{total} trainingen afgerond').replace('{done}', done).replace('{total}', week.sessions.length) + '</p><div class="prog"><i style="width:' + Math.round(done / Math.max(1, week.sessions.length) * 100) + '%"></i></div><span class="plan-go">' + tr('Schema openen ›') + '</span></a>';
}
ACT.startTrainingPlan = () => {
  const draft = DB.training && DB.training.generated;
  if (!draft) return toast(tr('Maak eerst een schema om te starten.'));
  const weeks = Array.isArray(draft.weeks) ? draft.weeks : [{ number: 1, phase: 'Basisweek', focus: 'Herhaal deze week en bouw rustig op.', sessions: draft.sessions || [] }];
  if (!weeks.length || !weeks[0].sessions.length) return toast(tr('Dit schema heeft geen trainingsdagen om te volgen.'));
  const plans = savedTrainingPlans(), old = activeTrainingPlan();
  if (old) old.status = 'paused';
  const p = JSON.parse(JSON.stringify(draft));
  p.id = uid(); p.name = draft.name || TRAIN_GOALS[p.goal] || 'Persoonlijk schema'; p.customPlan = !!draft.customPlan; p.status = 'active'; p.createdAt = todayKey(); p.currentWeek = 1; p.doneSessions = []; p.weeks = weeks;
  plans.unshift(p); DB.training.activePlanId = p.id; save(); toast(tr(old ? 'Nieuwe schema gestart; je vorige staat op pauze.' : 'Schema gestart. Je voortgang staat op Vandaag en Schema’s.')); go('#/schemas');
};
ACT.pauseTrainingPlan = el => { const p = savedTrainingPlans().find(x => x.id === el.dataset.id); if (!p) return; p.status = 'paused'; DB.training.activePlanId = null; save(); renderTrainingHub(); };
ACT.stopTrainingPlan = el => { if (!confirm(tr('Dit schema stopzetten? Je voortgang blijft bewaard.'))) return; const p = savedTrainingPlans().find(x => x.id === el.dataset.id); if (!p) return; p.status = 'stopped'; DB.training.activePlanId = null; save(); renderTrainingHub(); };
ACT.resumeTrainingPlan = el => { const p = savedTrainingPlans().find(x => x.id === el.dataset.id); if (!p) return; const old = activeTrainingPlan(); if (old && old.id !== p.id) old.status = 'paused'; p.status = 'active'; DB.training.activePlanId = p.id; save(); renderTrainingHub(); };
ACT.restartTrainingPlan = el => { const p = savedTrainingPlans().find(x => x.id === el.dataset.id); if (!p) return; p.currentWeek = 1; p.doneSessions = []; p.status = 'active'; const old = activeTrainingPlan(); if (old && old.id !== p.id) old.status = 'paused'; DB.training.activePlanId = p.id; save(); renderTrainingHub(); };
ACT.deleteTrainingPlan = el => { if (!confirm(tr('Schema en opgeslagen voortgang verwijderen?'))) return; DB.training.plans = savedTrainingPlans().filter(p => p.id !== el.dataset.id); if (DB.training.activePlanId === el.dataset.id) DB.training.activePlanId = null; save(); renderTrainingHub(); };
ACT.togglePlanSession = el => {
  const p = activeTrainingPlan(); if (!p || p.id !== el.dataset.id || p.status !== 'active') return;
  const week = p.weeks.find(w => w.number === Number(el.dataset.week)); if (!week || week.number !== p.currentWeek) return;
  const key = week.number + ':' + Number(el.dataset.i), done = p.doneSessions || (p.doneSessions = []);
  if (done.includes(key)) p.doneSessions = done.filter(x => x !== key); else done.push(key);
  save(); renderTrainingHub();
};
ACT.logPlanActivity = el => {
  const p = savedTrainingPlans().find(x => x.id === el.dataset.id);
  const week = p && p.weeks.find(x => x.number === Number(el.dataset.week));
  const session = week && week.sessions[Number(el.dataset.i)];
  if (!p || !session || !activeTrainingPlan() || activeTrainingPlan().id !== p.id || !(p.doneSessions || []).includes(week.number + ':' + Number(el.dataset.i))) return;
  const runningGoals = ['runStart', 'run5k', 'race5k', 'race10k', 'half', 'marathon', 'race'];
  const preset = { type: runningGoals.includes(p.goal) ? 'lopen' : p.goal === 'interval' ? 'cardio' : (session.exercises || []).length ? 'kracht' : 'cardio' };
  openActivitySheet(todayKey(), activity => {
    const d = getDay(todayKey(), true);
    d.activities = (d.activities || []).concat(activity);
    save(); toast(tr('Activiteit bewaard')); renderTrainingHub();
  }, preset);
};
ACT.advanceTrainingWeek = el => {
  const p = activeTrainingPlan(); if (!p || p.id !== el.dataset.id) return;
  const week = p.weeks.find(w => w.number === p.currentWeek);
  if (!week || !week.sessions.every((_, i) => (p.doneSessions || []).includes(week.number + ':' + i))) return toast(tr('Vink eerst alle trainingen van deze week af.'));
  if (p.currentWeek < p.weeks.length) { p.currentWeek++; toast(tr('Volgende week staat klaar.')); }
  else { p.status = 'completed'; DB.training.activePlanId = null; toast(tr('Schema afgerond. Je voortgang is bewaard.')); }
  save(); renderTrainingHub();
};
function renderGeneratedTraining(g) {
  if (g.programType === 'custom') return renderCustomTrainingPreview(g) + draftPlanActions();
  if (g.programType === 'progressive') return renderProgressiveProgram(g) + draftPlanActions();
  if (g.weeks) return renderEventProgram(g) + draftPlanActions();
  const sessions = (g.sessions || []).map(s => '<div class="card"><h3>' + esc(tr(s.day)) + ' · ' + esc(trTrainingText(s.title)) + '</h3><p>' + esc(trTrainingText(s.detail)) + '</p><p class="muted small">' + g.minutes + ' min · ' + esc(tr(s.effort)) + '</p></div>').join('');
  const focus = { regularity: 'Kies een eetmoment dat vaak wegvalt en maak daar een haalbare routine van.', protein: 'Voeg bij een of meer maaltijden een eiwitbron toe die je graag eet.', fiber: 'Voeg geleidelijk een vezelrijke keuze toe, zoals fruit, groente, volkoren of peulvruchten.' }[g.nutritionFocus];
  const activityGoal = g.activityGoal === 'guideline' ? 'Voor volwassenen is een richtpunt 150–300 minuten matig intensieve beweging per week (of 75–150 minuten intensief), plus spierversterkende activiteit op minstens 2 dagen. Bouw hier rustig naartoe; wandelen en fietsen tellen ook mee.' : g.activityGoal === 'custom' ? 'Jouw gekozen beweegdoel: ' + g.weeklyActivityMinutes + ' minuten per week. Wandelen en fietsen tellen mee; pas het doel aan als herstel of omstandigheden daarom vragen.' : '';
  const levels = Object.fromEntries(TRAIN_LEVELS.map(([key, label]) => [key, label.toLowerCase()]));
  const place = g.access === 'yes' ? 'met toegang tot fitness' : 'zonder fitness';
  const timing = { any: 'geen tijdsvoorkeur', morning: 'bij voorkeur in de ochtend', afternoon: 'bij voorkeur in de middag', evening: 'bij voorkeur in de avond' }[g.timeOfDay] || 'geen tijdsvoorkeur';
  return '<h2 class="sec">' + tr('Voorbeeld van je schema') + '</h2><div class="card"><p><b>' + tr((g.goal === 'race' && g.eventName) ? g.eventName : TRAIN_GOALS[g.goal] || TRAIN_GOALS.general) + '</b> · ' + tr(levels[g.level] || 'beginner') + ' · ' + g.sessions.length + ' ' + tr('trainingen') + '</p><p class="muted small">' + g.sessions.length * g.minutes + ' ' + tr('minuten') + ' ' + tr('gepland deze week') + ' · ' + tr(place) + ' · ' + tr(timing) + '. ' + tr('Bekijk het voorbeeld en start het daarna om het bij Schema’s te volgen.') + '</p></div>' + sessions + (focus ? '<div class="card"><h3>' + tr('Optionele voedingsfocus') + '</h3><p>' + tr(focus) + '</p></div>' : '') + (activityGoal ? '<div class="card"><h3>' + tr('Optioneel beweegdoel') + '</h3><p>' + tr(activityGoal) + '</p></div>' : '') + draftPlanActions();
}
function draftPlanActions() { return '<div class="card plan-draft"><h3>' + tr('Wil je dit schema volgen?') + '</h3><p class="muted small">' + tr('Start het om je trainingen af te vinken. Je kan het later pauzeren, hervatten of stopzetten.') + '</p><button class="btn big" data-act="startTrainingPlan">' + tr('Start dit schema') + '</button><a class="link" href="#/schemas">' + tr('Terug naar mijn schema’s') + '</a></div>'; }
function trTrainingText(value) {
  const text = String(value || '');
  let dynamic = text.match(/^(\d+) min wandelen, fietsen of een andere activiteit op praattempo\.$/);
  if (dynamic) return trf('{minutes} min wandelen, fietsen of een andere activiteit op praattempo.', { minutes: dynamic[1] });
  dynamic = text.match(/^(\d+) min ontspannen wandelen of fietsen, of neem volledige rust als je moe bent\.$/);
  if (dynamic) return trf('{minutes} min ontspannen wandelen of fietsen, of neem volledige rust als je moe bent.', { minutes: dynamic[1] });
  dynamic = text.match(/^Wandel 5 min rustig in en 5 min uit\. Wissel daarna (\d+) min totaal rustig joggen af met wandelpauzes \(bijv\. 1 min jog \/ 2 min wandelen\)\. (.+)$/);
  if (dynamic) return trf('Wandel 5 min rustig in en 5 min uit. Wissel daarna {minutes} min totaal rustig joggen af met wandelpauzes (bijv. 1 min jog / 2 min wandelen). {guidance}', { minutes: dynamic[1], guidance: tr(dynamic[2]) });
  dynamic = text.match(/^Warm 5–10 min rustig op\. Doe (\d+) × (\d+) sec vlot maar controleerbaar, met minstens even lang rustig herstel\. Koel af\. Geen sprint; stop als je klachten krijgt\.$/);
  if (dynamic) return trf('Warm 5–10 min rustig op. Doe {reps} × {seconds} sec vlot maar controleerbaar, met minstens even lang rustig herstel. Koel af. Geen sprint; stop als je klachten krijgt.', { reps: dynamic[1], seconds: dynamic[2] });
  dynamic = text.match(/^Beweeg (\d+) min op praattempo\. Wissel lopen met wandelen af als nodig; verhoog niet tegelijk duur én snelheid\.$/);
  if (dynamic) return trf('Beweeg {minutes} min op praattempo. Wissel lopen met wandelen af als nodig; verhoog niet tegelijk duur én snelheid.', { minutes: dynamic[1] });
  dynamic = text.match(/^Kies (\d+) min ontspannen loop-wandelblokken\. Ervaren lopers kunnen enkele korte ontspannen versnellingen toevoegen, met volledig herstel\.$/);
  if (dynamic) return trf('Kies {minutes} min ontspannen loop-wandelblokken. Ervaren lopers kunnen enkele korte ontspannen versnellingen toevoegen, met volledig herstel.', { minutes: dynamic[1] });
  dynamic = text.match(/^Beweeg (\d+) min comfortabel\. Beginners houden wandelpauzes; neem minstens een rustdag tussen looptrainingen\.$/);
  if (dynamic) return trf('Beweeg {minutes} min comfortabel. Beginners houden wandelpauzes; neem minstens een rustdag tussen looptrainingen.', { minutes: dynamic[1] });
  dynamic = text.match(/^Loop-wandeltraining (\d+)$/);
  if (dynamic) return trf('Loop-wandeltraining {number}', { number: dynamic[1] });
  dynamic = text.match(/^Jouw gekozen beweegdoel: (\d+) minuten per week\. Wandelen en fietsen tellen mee; pas het doel aan als herstel of omstandigheden daarom vragen\.$/);
  if (dynamic) return trf('Jouw gekozen beweegdoel: {minutes} minuten per week. Wandelen en fietsen tellen mee; pas het doel aan als herstel of omstandigheden daarom vragen.', { minutes: dynamic[1] });
  dynamic = text.match(/^Jouw gekozen beweegdoel: (\d+) minuten per week\. Pas dit aan als herstel of omstandigheden daarom vragen\.$/);
  if (dynamic) return trf('Jouw gekozen beweegdoel: {minutes} minuten per week. Pas dit aan als herstel of omstandigheden daarom vragen.', { minutes: dynamic[1] });
  dynamic = text.match(/^(\d+[–-]\d+ minuten|\d+ minuten|kort en ontspannen) op praattempo\. Wissel lopen met wandelen af en herhaal de vorige week als herstel niet goed voelt\.$/);
  if (dynamic) return trf('{duration} op praattempo. Wissel lopen met wandelen af en herhaal de vorige week als herstel niet goed voelt.', { duration: tr(dynamic[1]) });
  dynamic = text.match(/^(.+) Richtlijn voor deze opbouwfase: (.+?) per oefening\.$/);
  if (dynamic) return trTrainingText(dynamic[1]) + ' ' + trf('Richtlijn voor deze opbouwfase: {sets} per oefening.', { sets: tr(dynamic[2]) });
  dynamic = text.match(/^(.+) Doe ongeveer de helft van je sets uit week (\d+); week 8 is eveneens lichter\.$/);
  if (dynamic) return trTrainingText(dynamic[1]) + ' ' + trf('Doe ongeveer de helft van je sets uit week {week}; week 8 is eveneens lichter.', { week: dynamic[2] });
  dynamic = text.match(/^(.+) Werk doorgaans in een comfortabele reeks van 6–15 herhalingen\. Verhoog pas als de huidige sets goed herstellen; wie al ervaring heeft kan op termijn richting ongeveer 10 wekelijkse sets per spiergroep opbouwen\.$/);
  if (dynamic) return trTrainingText(dynamic[1]) + ' ' + tr('Werk doorgaans in een comfortabele reeks van 6–15 herhalingen. Verhoog pas als de huidige sets goed herstellen; wie al ervaring heeft kan op termijn richting ongeveer 10 wekelijkse sets per spiergroep opbouwen.');
  const walk = text.match(/^(\d+) min op een matig tempo waarbij praten nog lukt\. Bouw rustig op; dit ondersteunt fitheid maar garandeert geen gewichtsverlies\.$/);
  if (walk) return trf('{minutes} min op een matig tempo waarbij praten nog lukt. Bouw rustig op; dit ondersteunt fitheid maar garandeert geen gewichtsverlies.', { minutes: walk[1] });
  const match = text.match(/^Kies (\d+(?:–\d+)?) pijnvrije bewegingen voor benen, heupen, duwen, trekken en romp met (.+?)\. Doe (1–2|2–3) beheerste sets; stop met 2–3 herhalingen over\.(.*)$/);
  if (match) {
    const base = trf('Kies {count} pijnvrije bewegingen voor benen, heupen, duwen, trekken en romp met {equipment}. Doe {sets} beheerste sets; stop met 2–3 herhalingen over.', { count: match[1], equipment: tr(match[2]), sets: match[3] });
    let tail = match[4].trim();
    tail = tail.replace(/Richtlijn voor deze opbouwfase: (.+?) per oefening\./g, (_, sets) => trf('Richtlijn voor deze opbouwfase: {sets} per oefening.', { sets: tr(sets) }));
    tail = tail.replace(/Doe ongeveer de helft van je sets uit week (\d+); week 8 is eveneens lichter\./g, (_, week) => trf('Doe ongeveer de helft van je sets uit week {week}; week 8 is eveneens lichter.', { week }));
    tail = tail.replace(/Houd de sessie kort en beheersbaar\./g, () => tr('Houd de sessie kort en beheersbaar.'));
    tail = tail.replace(/Herhaal de grote spiergroepen met andere comfortabele varianten: bijvoorbeeld squat\/stoel-opstaan, heupstrekken, duwen, trekken en rompstabiliteit\. Houd techniek en herstel voorop\./g, () => tr('Herhaal de grote spiergroepen met andere comfortabele varianten: bijvoorbeeld squat/stoel-opstaan, heupstrekken, duwen, trekken en rompstabiliteit. Houd techniek en herstel voorop.'));
    tail = tail.replace(/Herhaal je full-body basis\. Als je alle herhalingen goed en ruim gecontroleerd haalt, verhoog dan hoogstens één kleine stap het gewicht of de herhalingen\./g, () => tr('Herhaal je full-body basis. Als je alle herhalingen goed en ruim gecontroleerd haalt, verhoog dan hoogstens één kleine stap het gewicht of de herhalingen.'));
    tail = tail.replace(/Werk doorgaans in een comfortabele reeks van 6–15 herhalingen\. Verhoog pas als de huidige sets goed herstellen; wie al ervaring heeft kan op termijn richting ongeveer 10 wekelijkse sets per spiergroep opbouwen\./g, () => tr('Werk doorgaans in een comfortabele reeks van 6–15 herhalingen. Verhoog pas als de huidige sets goed herstellen; wie al ervaring heeft kan op termijn richting ongeveer 10 wekelijkse sets per spiergroep opbouwen.'));
    return base + (tail ? ' ' + tail : '');
  }
  dynamic = text.match(/^Richtlijn voor deze opbouwfase: (.+?) per oefening\.$/);
  if (dynamic) return trf('Richtlijn voor deze opbouwfase: {sets} per oefening.', { sets: tr(dynamic[1]) });
  dynamic = text.match(/^Doe ongeveer de helft van je sets uit week (\d+); week 8 is eveneens lichter\.$/);
  if (dynamic) return trf('Doe ongeveer de helft van je sets uit week {week}; week 8 is eveneens lichter.', { week: dynamic[1] });
  return tr(text);
}
function renderProgressiveProgram(g) {
  const cards = g.weeks.map(w => '<details class="card train-week"' + (w.number === 1 ? ' open' : '') + '><summary><b>' + tr('Week') + ' ' + w.number + ' · ' + tr(w.phase) + '</b><span class="muted small">' + tr(w.focus) + '</span></summary>' + w.sessions.map(s => '<div class="train-session"><b>' + tr(s.day) + ' · ' + trTrainingText(s.title) + '</b><p>' + trTrainingText(s.detail) + '</p></div>').join('') + '</details>').join('');
  const caution = g.goal === 'rehab' ? '<div class="card note"><b>' + tr('Revalidatie blijft onder regie van je behandelaar') + '</b><p class="small">' + tr('Dit is alleen een weekindeling om de door je behandelaar goedgekeurde activiteiten te plannen. De app verhoogt geen oefeningen, gewicht of intensiteit. Stop en vraag advies bij scherpe/toenemende pijn, terugkerende zwelling of verlies van beweging/kracht.') + '</p><p class="muted small">' + tr('Richtlijn') + ': <a href="https://leedscommunityhealthcare.nhs.uk/our-services-a-z/musculoskeletal-msk/return-to-activity-or-sport-after-injury/" target="_blank" rel="noopener">' + tr('Leeds Community Healthcare NHS · terugkeer na blessure') + '</a></p></div>' : '<div class="card"><p class="muted small">' + tr('Verhoog alleen als je goed herstelt; herhaal gerust een week. Rustdagen zijn onderdeel van het plan. Bij pijn of een medische aandoening: overleg met een zorgverlener.') + '</p></div>';
  const source = g.goal === 'runStart' ? '<p class="muted small">' + tr('Opbouwprincipe: afwisselend wandelen en lopen met rust tussen loopdagen, zoals bij') + ' <a href="https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/" target="_blank" rel="noopener">NHS Couch to 5K</a>. ' + tr('Dit is een eigen, vereenvoudigde planning en geen kopie van het NHS-programma.') + '</p>' : ['strength', 'muscle'].includes(g.goal) ? '<p class="muted small">' + tr('Krachtprincipes afgestemd op de') + ' <a href="https://acsm.org/resistance-training-guidelines-update-2026/" target="_blank" rel="noopener">ACSM · 2026</a>: ' + tr('train grote spiergroepen minstens 2 dagen per week, kies een haalbare belasting en bouw geleidelijk op. Je hoeft niet tot spierfalen te trainen.') + '</p>' : '';
  const nutritionFocus = { regularity: 'Kies een eetmoment dat vaak wegvalt en maak daar een haalbare routine van.', protein: 'Voeg bij een of meer maaltijden een eiwitbron toe die je graag eet.', fiber: 'Voeg geleidelijk een vezelrijke keuze toe, zoals fruit, groente, volkoren of peulvruchten.' }[g.nutritionFocus];
  const activityGoal = g.activityGoal === 'guideline' ? 'Voor volwassenen is een algemeen richtpunt 150–300 minuten matige beweging per week (of 75–150 minuten intensieve beweging), plus spierversterkende activiteit op minstens 2 dagen. Bouw hier rustig naartoe.' : g.activityGoal === 'custom' ? 'Jouw gekozen beweegdoel: ' + g.weeklyActivityMinutes + ' minuten per week. Pas dit aan als herstel of omstandigheden daarom vragen.' : '';
  const place = g.access === 'yes' && g.equipment === 'gym' ? 'fitness met toestellen' : g.equipment === 'home' ? 'thuis met banden/gewichten' : 'zonder materiaal';
  const time = g.goal === 'rehab' ? tr('volgens de duur van je behandelaar') : tr('richttijd') + ' ' + g.minutes + ' ' + tr('min per training');
  return '<h2 class="sec">' + trf('Jouw {count}-weekse opbouw', { count: g.weeks.length }) + '</h2><div class="card"><p><b>' + tr(TRAIN_GOALS[g.goal]) + '</b> · ' + tr((TRAIN_LEVELS.find(x => x[0] === g.level) || ['', 'Beginner'])[1]) + ' · ' + g.days.length + ' ' + tr('trainingsdagen per week') + '</p><p class="muted small">' + tr('Aangepast aan je gekozen dagen, beschikbare tijd, niveau en materiaal') + ' (' + tr(place) + '; ' + time + '). ' + (g.goal === 'weight' ? tr('Beweging ondersteunt je gezondheid; gewichtsverlies hangt ook af van voeding en andere factoren en wordt niet gegarandeerd.') : '') + '</p></div>' + source + cards + caution + (nutritionFocus ? '<div class="card"><h3>' + tr('Optionele voedingsfocus') + '</h3><p>' + tr(nutritionFocus) + '</p></div>' : '') + (activityGoal ? '<div class="card"><h3>' + tr('Optioneel beweegdoel') + '</h3><p>' + trTrainingText(activityGoal) + '</p></div>' : '');
}
function renderEventGuidance(p) {
  const marathonReady = p.weeklyRunKm >= 20 && p.comfortableRunKm >= 12 && p.currentRunDays >= 3;
  let text = p.goal === 'marathon'
    ? (marathonReady
      ? tr('De 20-weekse marathonopbouw is bedoeld voor lopers die al geregeld trainen: gemiddeld minstens 20 km per week, een comfortabele lange duurloop van 12 km en ongeveer 3 loopdagen per week. Dit is een startcheck, geen garantie op wedstrijdklaarheid.')
      : tr('Een marathonblok is pas passend als je de laatste weken al ongeveer 20 km per week liep, een comfortabele lange duurloop van 12 km aankunt en meestal 3 dagen per week loopt. Vul je basis eerlijk in: anders krijg je eerst een rustige 8-weekse loopbasis, geen versneld marathonschema.'))
    : tr('HYROX combineert 8 loopkilometers met 8 vaste workoutstations. Het programma bouwt eerst conditie en techniek op, daarna combineert het lopen en stations. De gekozen fitnessuitrusting bepaalt welke veilige oefenvarianten worden voorgesteld.');
  const weeks = p.goal === 'hyrox' ? (['advanced', 'competitive'].includes(p.level) ? 8 : 12) : 20;
  const left = eventWeeksLeft(p.eventDate);
  if (left !== null && left < weeks) text += ' ' + trf('Er zijn {left} weken tot de datum; dat is korter dan dit {weeks}-weekse blok. De planner perst de belasting niet samen. Kies een latere wedstrijd of bespreek een aangepast plan met een coach.', { left: Math.max(0, left), weeks });
  else if (left !== null && left > weeks) text += ' ' + trf('Er zijn {left} weken tot de datum. Het wedstrijdblok van {weeks} weken start over {before} weken; gebruik de tijd tot dan voor rustige basisopbouw.', { left, weeks, before: left - weeks });
  return '<div class="card note"><b>' + tr('Meerweeks wedstrijdplan') + '</b><p class="small">' + text + '</p><p class="muted small">' + tr('Bouw liever maar één trainingsprikkel tegelijk op en neem herstel serieus. Stop bij scherpe of toenemende pijn. Bij een blessure, aandoening of vragen over jouw belastbaarheid: laat een arts of gekwalificeerde coach meekijken.') + '</p><p class="muted small">' + tr('Gebaseerd op de algemene opbouwprincipes van') + ' <a href="https://www.baa.org/races/boston-marathon/info-for-athletes/boston-marathon-training/" target="_blank" rel="noopener">Boston Athletic Association</a> ' + tr('en') + ' <a href="https://worldathletics.org/personal-best/performance/injury-prevention-runners" target="_blank" rel="noopener">World Athletics</a>, ' + tr('plus het') + ' <a href="https://hyrox.com/the-fitness-race/" target="_blank" rel="noopener">' + tr('officiële HYROX-format') + '</a> ' + tr('en') + ' <a href="https://www.hyrox365.com/about-hyrox/training" target="_blank" rel="noopener">' + tr('HYROX365-trainingsopbouw') + '</a>.</p></div>';
}
function renderEventProgram(g) {
  if (g.notReady) return renderFoundationProgram(g);
  const cards = (g.weeks || []).map(w => '<details class="card train-week"' + (w.number === 1 ? ' open' : '') + '><summary><b>' + tr('Week') + ' ' + w.number + ' · ' + esc(tr(w.phase)) + '</b><span class="muted small">' + esc(tr(w.focus)) + '</span></summary>' +
    w.sessions.map(s => '<div class="train-session"><b>' + esc(tr(s.day)) + ' · ' + esc(trEventText(s.title)) + '</b><p>' + esc(trEventText(s.detail)) + '</p></div>').join('') + '</details>').join('');
  const timing = g.startLabel ? '<p class="small">' + esc(g.startLabel) + '</p>' : '';
  const timeNote = g.goal === 'marathon'
    ? '<p class="muted small">' + tr('De lange duurloop wordt geleidelijk langer en kan ruim boven je ingestelde sessietijd uitkomen. Als je die tijd of afstand niet kunt vrijmaken, schuif je doel op in plaats van trainingen samen te persen.') + '</p>'
    : '<p class="muted small">' + trf('Houd de HYROX-trainingen binnen je gekozen tijd ({minutes} minuten) door minder rondes te doen; techniek en herstel gaan voor extra volume.', { minutes: Number(g.minutes || 45) }) + '</p>';
  return '<h2 class="sec">' + tr(g.goal === 'marathon' ? '20-weekse marathonopbouw' : '{weeks}-weekse HYROX-opbouw').replace('{weeks}', g.weeks.length) + '</h2>' +
    '<div class="card"><p><b>' + esc(tr(TRAIN_GOALS[g.goal])) + '</b> · ' + esc(tr((TRAIN_LEVELS.find(x => x[0] === g.level) || ['', 'Beginner'])[1])) + '</p><p class="muted small">' + tr('De weken combineren herstel, rustige duur, kracht/techniek en een geleidelijke specifieke prikkel. Gebruik de praat-test voor rustige inspanning; er staan bewust geen tempo’s of wedstrijdgewichten in, want die hangen af van jouw basis en HYROX-divisie.') + '</p>' + timing + timeNote + '</div>' + cards +
    '<div class="card fb"><b>' + tr('Praktische trainingsregels') + '</b><ul><li>' + tr('Plan zware dagen niet direct na elkaar; vervang een training door rust als je nog duidelijk vermoeid bent.') + '</li><li>' + tr('Verhoog afstand of intensiteit geleidelijk, niet allebei tegelijk.') + '</li><li>' + tr('Voor HYROX: oefen techniek en materiaal eerst licht; een volledige racesimulatie is niet nodig.') + '</li><li>' + tr('De vaste HYROX-stations zijn SkiErg, sled push, sled pull, burpee broad jumps, roeien, farmer carry, sandbag lunges en wall balls; tussen stations loop je telkens ongeveer 1 km. Controleer de actuele regels en gewichten voor jouw divisie.') + '</li></ul></div>';
}
function trEventText(value) {
  const text = String(value || '');
  const setsSuffix = ' Doe 2–3 beheerste sets en houd 2–3 herhalingen in reserve; geen maximale gewichten.';
  const tiredSuffix = ' Maak dit een lichte techniekdag als je vermoeid bent.';
  if (text.endsWith(setsSuffix)) return trEventText(text.slice(0, -setsSuffix.length)) + tr(setsSuffix);
  if (text.endsWith(tiredSuffix)) return trEventText(text.slice(0, -tiredSuffix.length)) + tr(tiredSuffix);
  let m = text.match(/^Lange rustige duurloop · (\d+(?:\.\d+)?) km$/);
  if (m) return trf('Lange rustige duurloop · {km} km', { km: m[1] });
  m = text.match(/^(\d+) minuten op praattempo; wissel lopen en wandelen af als dat beter bij je basis past\.$/);
  if (m) return trf('{minutes} minuten op praattempo; wissel lopen en wandelen af als dat beter bij je basis past.', { minutes: m[1] });
  m = text.match(/^Doe (\d+) rustige rondes: 400–800 m lopen plus één of twee bekende oefeningen\. Neem volledig herstel; geen volledige racesimulatie\.$/);
  if (m) return trf('Doe {rounds} rustige rondes: 400–800 m lopen plus één of twee bekende oefeningen. Neem volledig herstel; geen volledige racesimulatie.', { rounds: m[1] });
  return tr(text);
}
function renderFoundationProgram(g) {
  const sessions = (g.weeks || []).map(w => '<div class="card"><b>' + tr('Week') + ' ' + w.number + ' · ' + esc(tr(w.phase)) + '</b><p>' + esc(tr(w.focus)) + '</p>' + w.sessions.map(s => '<p class="small"><b>' + esc(tr(s.day)) + ' · ' + esc(tr(s.title)) + ':</b> ' + esc(tr(s.detail)) + '</p>').join('') + '</div>').join('');
  return '<h2 class="sec">' + tr('Eerst je loopbasis opbouwen') + '</h2><div class="card note"><p>' + tr('Op basis van je huidige loopkilometers en langste afstand maak ik nog geen marathonspecifiek programma. Deze 8 weken helpen je rustig regelmaat opbouwen; ze maken je niet automatisch klaar voor een marathon. Kies daarna opnieuw je wedstrijdplan wanneer je basis stabiel is.') + '</p></div>' + sessions;
}
function marathonLongRunKm(week, comfortableKm) {
  if (week === 20) return 42.2;
  let peak = Math.max(12, Math.min(18, comfortableKm)), target = peak;
  for (let n = 2; n <= Math.min(week, 16); n++) {
    if (n % 4 === 0) target = peak * 0.8;
    else { peak = Math.min(32, peak + 1.1); target = peak; }
  }
  if (week === 17) target = peak * 0.8;
  if (week === 18) target = peak * 0.6;
  if (week === 19) target = peak * 0.4;
  return Math.round(target * 2) / 2;
}
function eventProgram(p) {
  const isHyrox = p.goal === 'hyrox', duration = isHyrox ? (['advanced', 'competitive'].includes(p.level) ? 8 : 12) : 20;
  const weeksLeft = eventWeeksLeft(p.eventDate);
  if (weeksLeft !== null && weeksLeft < duration) return null;
  const ready = p.weeklyRunKm >= 20 && p.comfortableRunKm >= 12 && p.currentRunDays >= 3;
  if (!isHyrox && !ready) return { goal: p.goal, level: p.level, notReady: true, weeks: foundationProgram(p) };
  const startLabel = p.eventDate
    ? (weeksLeft > duration ? trf('Het specifieke blok begint over {weeks} weken. De eerste week valt rond {date}.', { weeks: weeksLeft - duration, date: new Date(new Date(p.eventDate + 'T12:00:00').getTime() - duration * 7 * 86400000).toLocaleDateString(currentLocale()) }) : tr('Week 1 begint nu; pas de weekindeling aan als je agenda verandert.'))
    : tr('Zonder wedstrijddatum start week 1 vanaf nu. Zet de wedstrijddatum erbij om de opbouw hierop af te stemmen.');
  const weeks = Array.from({ length: duration }, (_, idx) => {
    const n = idx + 1, phase = eventPhase(n, duration, isHyrox), days = p.days.map((k, i) => ({ key: k, label: Object.fromEntries(TRAIN_DAYS)[k], i }));
    return isHyrox ? hyroxWeek(n, duration, phase, days, p) : marathonWeek(n, duration, phase, days, p);
  });
  return { goal: p.goal, level: p.level, weeks, startLabel };
}
function eventPhase(n, duration, hyrox) {
  if (hyrox) return n === duration ? 'Taper en frisheid' : n >= duration - 2 ? 'Wedstrijdspecifiek' : n % 4 === 0 ? 'Herstelweek' : n >= Math.ceil(duration * 0.5) ? 'Opbouw en combineren' : 'Basis en techniek';
  if (n >= 18) return n === 20 ? 'Wedstrijdweek' : 'Taper en herstel';
  if ([4, 8, 12, 16].includes(n)) return 'Herstelweek';
  if (n >= 13) return 'Piekblok';
  if (n >= 5) return 'Duur en kracht opbouwen';
  return 'Rustige basis';
}
function marathonWeek(n, duration, phase, days, p) {
  const km = marathonLongRunKm(n, p.comfortableRunKm), quality = n >= 6 && n < 17 && !phase.includes('Herstel') && !phase.includes('Taper');
  if (n === duration) return { number: n, phase, focus: 'Rustig aan de start en volg je afgesproken raceplan.', sessions: [{ day: p.eventDate ? new Date(p.eventDate + 'T12:00:00').toLocaleDateString(currentLocale(), { weekday: 'long', day: 'numeric', month: 'short' }) : 'Wedstrijddag', title: 'Marathon · 42,2 km', detail: 'Start beheerst. Gebruik alleen voeding en drinken die je eerder hebt getest; volg de actuele wedstrijdinformatie.' }] };
  const sessions = days.map((d, i) => {
    if (i === days.length - 1) return { day: d.label, title: 'Lange rustige duurloop · ' + km + ' km', detail: phase === 'Taper en herstel' ? 'Loop ontspannen; houd de afstand bewust lager zodat je fris blijft.' : 'Rustig praattempo. Verhoog niet als je huidige afstand, herstel of klachten daar niet bij passen.' };
    if (i === 1 && quality) return { day: d.label, title: 'Beheerste kwaliteit', detail: 'Rustige warming-up, daarna enkele korte blokken op een stevig maar controleerbaar tempo met ruim herstel, gevolgd door rustig uitlopen. Stop vóór uitputting.' };
    if (i === 1 && p.days.length >= 4) return { day: d.label, title: 'Kracht en stabiliteit', detail: 'Technisch beheerste oefeningen voor benen, heupen en romp; houd ruimte over en train niet tot falen.' };
    return { day: d.label, title: 'Rustige duurloop', detail: 'Loop op praattempo. Houd de duur passend bij je recente weekvolume; in herstel- en taperweken maak je deze korter.' };
  });
  return { number: n, phase, focus: phase === 'Herstelweek' ? 'Minder belasting, behoud je rustige routine.' : phase === 'Taper en herstel' ? 'Minder kilometers; kom uitgerust aan de start.' : phase === 'Wedstrijdweek' ? 'Rust, korte losse beweging en wedstrijddag.' : 'Verhoog de belasting pas als je goed hersteld bent.', sessions };
}
function hyroxWeek(n, duration, phase, days, p) {
  const taper = n === duration, specific = phase === 'Wedstrijdspecifiek';
  const progression = (n - 1) / Math.max(1, duration - 1);
  const aerobicMinutes = Math.max(15, Math.min(p.minutes, Math.round((20 + progression * 20) / 5) * 5));
  const rounds = Math.max(2, Math.min(5, 2 + Math.floor(progression * 4)));
  const strength = p.access === 'yes' && p.equipment === 'gym' ? 'Oefen licht en technisch de stations: SkiErg, sled push, sled pull, burpee broad jumps, roeien, farmer carry, sandbag lunges en wall balls.' : p.equipment === 'home' ? 'Oefen licht met dragen, gecontroleerde lunges, squats en burpee-varianten. Kies veilige alternatieven; een thuistraining vervangt geen sled, ergometer of wall-ball-materiaal.' : 'Werk met lichaamsgewicht aan squats, lunges, gecontroleerde burpee-varianten en rompstabiliteit. Sla stations over die je niet veilig kunt nabootsen.';
  const sessions = days.map((d, i) => {
    if (taper) return i === 0
      ? { day: d.label, title: 'Lichte loop en mobiliteit', detail: 'Korte, ontspannen inspanning; eindig fris.' }
      : { day: i === days.length - 1 && p.eventDate ? new Date(p.eventDate + 'T12:00:00').toLocaleDateString(currentLocale(), { weekday: 'long', day: 'numeric', month: 'short' }) : d.label, title: i === days.length - 1 && p.eventDate ? 'HYROX-wedstrijd' : 'Rust of lichte techniek', detail: p.eventDate && i === days.length - 1 ? 'Volg de briefing en officiële stationvolgorde. Houd het tempo beheerst.' : 'Geen zware intervallen of vermoeiende racesimulatie in de taper.' };
    if (i === 0) return { day: d.label, title: specific ? 'Rustige loopintervallen' : 'Aerobe loopbasis', detail: specific ? 'Wissel 4 rustige loopblokken van 3–5 minuten af met ruim wandel- of dribbelherstel. Houd de inspanning beheerst.' : aerobicMinutes + ' minuten op praattempo; wissel lopen en wandelen af als dat beter bij je basis past.' };
    if (i === 1) return { day: d.label, title: phase === 'Herstelweek' ? 'Lichte kracht en techniek' : 'Kracht en techniek', detail: strength + ' Doe 2–3 beheerste sets en houd 2–3 herhalingen in reserve; geen maximale gewichten.' };
    if (i === 2) return { day: d.label, title: specific ? 'Korte HYROX-combinaties' : 'Lichte conditie en functionele beweging', detail: specific ? 'Doe ' + rounds + ' rustige rondes: 400–800 m lopen plus één of twee bekende oefeningen. Neem volledig herstel; geen volledige racesimulatie.' : 'Wissel korte rustige cardio af met eenvoudige functionele bewegingen. Blijf binnen je gekozen tijdsvenster en stop ruim vóór uitputting.' };
    if (i === 3) return { day: d.label, title: 'Aanvullende kracht', detail: strength + ' Maak dit een lichte techniekdag als je vermoeid bent.' };
    return { day: d.label, title: 'Herstelbeweging', detail: 'Wandelen of rustige mobiliteit; dit mag ook volledige rust zijn.' };
  });
  return { number: n, phase, focus: taper ? 'Verminder trainingsbelasting en houd je fris.' : phase === 'Herstelweek' ? 'Behoud techniek, verlaag volume en herstel.' : phase === 'Wedstrijdspecifiek' ? 'Combineer lopen met een klein aantal stations, zonder uitputting.' : 'Bouw aerobe basis, kracht en bewegingstechniek geleidelijk op.', sessions };
}
function progressiveProgram(p) {
  const duration = p.goal === 'runStart' ? 9 : 8;
  const levelIndex = Math.max(0, TRAIN_LEVELS.findIndex(([key]) => key === p.level));
  const dayLabels = Object.fromEntries(TRAIN_DAYS), days = p.days.map(key => dayLabels[key]);
  const equipment = p.equipment === 'gym' && p.access === 'yes' ? 'machines of losse gewichten' : p.equipment === 'home' ? 'lichaamsgewicht, banden of thuisgewichten' : 'lichaamsgewicht en een stevige stoel of muur';
  const exerciseCount = p.minutes < 25 ? '3' : p.minutes < 40 ? '4' : '4–6';
  const strengthDetails = [
    'Kies ' + exerciseCount + ' pijnvrije bewegingen voor benen, heupen, duwen, trekken en romp met ' + equipment + '. Doe ' + (p.level === 'beginner' ? '1–2' : '2–3') + ' beheerste sets; stop met 2–3 herhalingen over.',
    'Herhaal de grote spiergroepen met andere comfortabele varianten: bijvoorbeeld squat/stoel-opstaan, heupstrekken, duwen, trekken en rompstabiliteit. Houd techniek en herstel voorop.',
    'Herhaal je full-body basis. Als je alle herhalingen goed en ruim gecontroleerd haalt, verhoog dan hoogstens één kleine stap het gewicht of de herhalingen.'
  ];
  const weeks = Array.from({ length: duration }, (_, ix) => {
    const n = ix + 1, recovery = n === 4 || n === 8, final = n === duration;
    const phase = recovery ? 'Herstelweek' : final ? 'Afronden en evalueren' : n <= 2 ? 'Rustig starten' : n <= 5 ? 'Basis opbouwen' : 'Verder opbouwen';
    const focus = recovery ? 'Minder volume, houd de routine comfortabel.' : final ? 'Behoud wat goed werkt; geen eindtest nodig.' : 'Kleine, haalbare stap en voldoende herstel.';
    const sessions = days.map((day, i) => {
      if (p.goal === 'rehab') return { day, title: i === 0 ? 'Behandelaar-goedgekeurde activiteit' : i === 1 ? 'Oefeningen volgens je behandelplan' : 'Rust of afgesproken lichte beweging', detail: 'Plan uitsluitend de activiteit en oefeningen die je behandelaar heeft toegestaan. Volg diens exacte duur, belasting, herhalingen en hersteladvies. Deze app voegt geen oefening of progressie toe.' };
      if (p.goal === 'runStart') {
        const runMinutes = Math.min(20, Math.max(1, Math.round((p.minutes - 10) * ((n - 1) / 8) * (recovery ? 0.7 : 1))));
        return { day, title: 'Loop-wandeltraining ' + (i + 1), detail: 'Wandel 5 min rustig in en 5 min uit. Wissel daarna ' + runMinutes + ' min totaal rustig joggen af met wandelpauzes (bijv. 1 min jog / 2 min wandelen). ' + (recovery ? 'Herstelweek: herhaal kortere blokken uit de vorige week.' : 'Praattempo; als dit niet comfortabel is, wandel dan meer of herhaal de vorige week.') };
      }
      if (['strength', 'muscle'].includes(p.goal)) {
        const earlierWeek = n === 4 ? 3 : 7;
        const sets = recovery ? 'ongeveer de helft van je sets uit week ' + earlierWeek : p.level === 'beginner' ? (n <= 2 ? '1–2 sets' : '2 sets') : (n <= 2 ? '2 sets' : '2–3 sets');
        const detail = recovery ? strengthDetails[0] + ' Doe ' + sets + '; week 8 is eveneens lichter.' : strengthDetails[i % strengthDetails.length] + ' Richtlijn voor deze opbouwfase: ' + sets + ' per oefening.';
        if (p.goal === 'muscle' && !recovery) return { day, title: 'Spiermassa · full-body kracht', detail: detail + ' Werk doorgaans in een comfortabele reeks van 6–15 herhalingen. Verhoog pas als de huidige sets goed herstellen; wie al ervaring heeft kan op termijn richting ongeveer 10 wekelijkse sets per spiergroep opbouwen.' };
        return { day, title: p.goal === 'muscle' ? 'Spiermassa · lichtere krachtbasis' : 'Krachttraining · full-body', detail };
      }
      if (p.goal === 'interval') {
        const reps = recovery ? 4 : Math.min(8, 3 + Math.floor(n / 2) + (levelIndex >= 2 ? 1 : 0)), seconds = recovery ? 45 : Math.min(120, 45 + Math.floor(n / 2) * 15);
        if (i === 0 && !recovery) return { day, title: 'Beheerste intervallen', detail: 'Warm 5–10 min rustig op. Doe ' + reps + ' × ' + seconds + ' sec vlot maar controleerbaar, met minstens even lang rustig herstel. Koel af. Geen sprint; stop als je klachten krijgt.' };
        if (i === 0 && recovery) return { day, title: 'Rustige conditie', detail: 'Kies een comfortabele wandeling, fietsrit of andere lichte cardio. Laat de intervallen deze week weg.' };
      }
      if (p.goal === 'run5k') {
        const minutes = Math.min(p.minutes, recovery ? 20 : Math.min(40, 20 + n * 2));
        if (i === 1 || (i === 0 && days.length === 1)) return { day, title: 'Rustige duur · lopen/wandelen', detail: 'Beweeg ' + minutes + ' min op praattempo. Wissel lopen met wandelen af als nodig; verhoog niet tegelijk duur én snelheid.' };
        if (i === 2 || (i === 0 && days.length > 1)) return { day, title: 'Loop-wandelbasis', detail: 'Kies ' + Math.max(15, minutes - 5) + ' min ontspannen loop-wandelblokken. Ervaren lopers kunnen enkele korte ontspannen versnellingen toevoegen, met volledig herstel.' };
        return { day, title: 'Rustig lopen / wandelen', detail: 'Beweeg ' + Math.max(15, minutes - 5) + ' min comfortabel. Beginners houden wandelpauzes; neem minstens een rustdag tussen looptrainingen.' };
      }
      const minutes = Math.min(p.minutes, recovery ? 20 : Math.min(50, 15 + n * (3 + levelIndex)));
      if (i === 0 && (p.goal === 'weight' || p.goal === 'general')) return { day, title: 'Full-body kracht', detail: strengthDetails[0] + ' Houd de sessie kort en beheersbaar.' };
      if (p.goal === 'weight' && i === 1) return { day, title: 'Wandelen of fietsen', detail: minutes + ' min op een matig tempo waarbij praten nog lukt. Bouw rustig op; dit ondersteunt fitheid maar garandeert geen gewichtsverlies.' };
      if (p.goal === 'weight' && i === 2) return { day, title: 'Full-body kracht', detail: strengthDetails[1] };
      if (p.goal === 'general' && i === 1) return { day, title: 'Rustige conditie', detail: minutes + ' min wandelen, fietsen of een andere activiteit op praattempo.' };
      if (i === 0 && p.goal === 'interval') return { day, title: 'Rustige conditie', detail: minutes + ' min comfortabel wandelen, fietsen of andere cardio.' };
      if (p.goal === 'interval' && i === 1) return { day, title: 'Kracht en mobiliteit', detail: strengthDetails[0] };
      return { day, title: 'Rustige beweging / herstel', detail: minutes + ' min ontspannen wandelen of fietsen, of neem volledige rust als je moe bent.' };
    });
    return { number: n, phase, focus, sessions };
  });
  return { programType: 'progressive', weeks, days, duration };
}
function foundationProgram(p) {
  return Array.from({ length: 8 }, (_, i) => {
    const n = i + 1, recovery = n === 4 || n === 8, days = p.days.slice(0, 3);
    const duration = recovery ? 'kort en ontspannen' : n <= 2 ? '20–25 minuten' : n <= 5 ? '25–30 minuten' : '30–35 minuten';
    return { number: n, phase: recovery ? 'Herstel' : 'Rustig opbouwen', focus: recovery ? 'Minder doen is onderdeel van opbouw.' : 'Regelmaat en comfortabel bewegen.', sessions: days.map((key, idx) => ({ day: Object.fromEntries(TRAIN_DAYS)[key], title: idx === 1 ? 'Kracht en mobiliteit' : 'Lopen / wandelen', detail: idx === 1 ? 'Lichte oefeningen voor benen en romp; stop ruim voor uitputting.' : duration + ' op praattempo. Wissel lopen met wandelen af en herhaal de vorige week als herstel niet goed voelt.' })) };
  });
}
function trainingSession(p, i, day) {
  const levelNote = p.level === 'beginner' ? ' Begin met 1–2 rustige rondes en neem pauze wanneer nodig.' : ['advanced', 'competitive'].includes(p.level) ? ' Kies een uitdagende maar technisch beheerste variant.' : ' Doe enkele gecontroleerde rondes en houd wat reserve over.';
  const strength = p.equipment === 'gym'
    ? 'Kies een comfortabele machine- of gewichtsoefening voor benen, heupen, duwen en trekken; houd de beweging gecontroleerd.' + levelNote
    : p.equipment === 'home'
      ? 'Kies een comfortabele oefening voor benen, heupen, duwen en trekken met je banden of gewichten; houd de beweging gecontroleerd.' + levelNote
      : 'Probeer pijnvrije varianten zoals opstaan uit een stoel, muurpush-ups, heupbrug en bird-dog; houd de beweging gecontroleerd.' + levelNote;
  const easy = 'Rustig tempo waarbij je nog kunt praten. Begin met ' + (p.level === 'beginner' ? 'korte blokken en wandelpauzes' : 'een gelijkmatig tempo') + '.';
  let options;
  if (p.goal === 'strength') options = [
    ['Kracht A', strength], ['Kracht B', strength + ' Wissel enkele oefeningen af met je vorige sessie.'],
    ['Kracht C of herstel', 'Herhaal een lichte krachttraining of kies een rustige wandeling als je nog vermoeid bent.'],
    ['Herstelbeweging', 'Kies een ontspannen wandeling of lichte mobiliteit; geef je spieren tijd om te herstellen.']
  ];
  else if (p.goal === 'interval') options = [
    ['Rustige conditie', easy], ['Korte intervallen', 'Warm rustig op. Wissel enkele korte, vlotte inspanningen af met ruim herstel; stop als je pijn of duizeligheid voelt.'],
    ['Kracht en mobiliteit', strength + ' Sluit af met lichte mobiliteit.'], ['Rustige conditie', easy]
  ];
  else if (p.goal === 'runStart') options = [
    ['Start met lopen / wandelen', 'Wissel korte, rustige loopstukken af met wandelen. Houd het tempo comfortabel; wandelen is een volwaardig onderdeel van deze startfase.'],
    ['Kracht en stabiliteit', strength + ' Houd dit rustig zodat je fris blijft voor je volgende loopmoment.'],
    ['Rustige wandeling', 'Kies een ontspannen wandeling of lichte mobiliteit. Bouw eerst de gewoonte op; sneller of langer hoeft nog niet.']
  ];
  else if (p.goal === 'run5k' || ['race5k', 'race10k', 'half', 'marathon', 'race'].includes(p.goal)) {
    const run = p.level === 'beginner' ? 'Wissel rustige loopstukken af met wandelen. Houd het tempo comfortabel en bouw de looptijd geleidelijk op.' : 'Loop op een comfortabel praattempo; houd herstel tussen loopmomenten.';
    const longer = ['marathon', 'half'].includes(p.goal)
      ? (p.comfortableRunKm > 0 ? 'Loop de langere sessie rustig en blijf voorlopig rond of onder je huidige comfortabele langste afstand (' + fmtNum(p.comfortableRunKm, 1) + ' km). Verhoog afstand geleidelijk; dit is geen marathonopbouw.' : 'Begin met afwisselend rustig lopen en wandelen. Stel nog geen lange-afstandsdoel in; deze planner kan geen veilige marathonopbouw vanaf nul bepalen.')
      : 'Loop of wandel comfortabel en verhoog afstand of duur niet tegelijk met intensiteit.';
    if (p.goal === 'race5k') options = [
      ['Rustig lopen / wandelen', run], ['Kracht en stabiliteit', strength + ' Houd dit rustig zodat je fris blijft voor je volgende loopmoment.'],
      ['Korte vlotte blokken', p.level === 'beginner' ? 'Kies nog een rustige loop-wandelsessie in plaats van snelle intervallen.' : 'Warm rustig op; doe enkele korte, vlotte blokken met ruim herstel en koel rustig af.'],
      ['Herstelbeweging', 'Kies een ontspannen wandeling of lichte mobiliteit; deze sessie mag ook rust zijn.']
    ];
    else options = [
      ['Rustig lopen / wandelen', run], ['Kracht en stabiliteit', strength + ' Houd dit rustig zodat je fris blijft voor je volgende loopmoment.'],
      ['Rustige duur', longer],
      ['Rustige loop of herstel', p.goal === 'race10k' && ['advanced', 'competitive'].includes(p.level) ? 'Alleen als je al regelmatig loopt: korte, beheerste versnellingen met volledig herstel. Anders kies een rustige duur.' : 'Loop of wandel op een comfortabel tempo; deze sessie mag ook herstelbeweging zijn.']
    ];
  }
  else if (p.goal === 'hyrox') options = [
    ['Rustige loopbasis', 'Loop of wandel rustig op praattempo; bouw je loopbasis geleidelijk op.'],
    ['Krachtbasis', strength],
    ['Functionele bewegingen', p.equipment === 'gym' ? 'Oefen op submaximale inspanning met dragen, roeien of ski-erg, lunges en lichte wall balls; kies alleen materiaal dat je beheerst.' : p.equipment === 'home' ? 'Oefen op submaximale inspanning met dragen, lunges, squats en gecontroleerde burpee-varianten; gebruik alleen materiaal dat je beheerst.' : 'Oefen rustig met dragen, lunges, squats en gecontroleerde burpee-varianten; geen zware sleds of race-simulatie nodig.'],
    ['Rustige combinatie', 'Wissel een korte, rustige cardio-inspanning af met eenvoudige functionele bewegingen. Stop ruim voor uitputting; dit is geen wedstrijdsimulatie.'],
    ['Herstelbeweging', 'Kies een rustige wandeling of mobiliteit. Een hersteltraining mag licht blijven; herstel hoort bij de voorbereiding.']
  ];
  else if (p.goal === 'weight') options = [
    ['Krachtbasis', strength], ['Wandelen of fietsen', easy],
    ['Kracht of rustige conditie', i % 2 ? strength : easy],
    ['Herstelbeweging', 'Kies een ontspannen wandeling of lichte mobiliteit; je hoeft een training niet in te halen.']
  ];
  else options = [
    ['Krachtbasis', strength], ['Rustige conditie', easy],
    ['Kracht of wandelen', i % 2 ? strength : easy], ['Herstelbeweging', 'Kies een ontspannen wandeling of lichte mobiliteit; dit mag ook een rustdag worden.']
  ];
  const chosen = options[i % options.length];
  return { day, title: chosen[0], detail: chosen[1], effort: chosen[0].includes('interval') ? 'vlot maar beheerst, met herstel' : 'licht tot matig' };
}
ACT.trainingField = el => {
  const p = trainingData(), f = el.dataset.f;
  const value = el.type === 'checkbox' ? el.checked : ['minutes', 'weeklyActivityMinutes', 'comfortableRunKm', 'weeklyRunKm', 'currentRunDays'].includes(f) ? Number(el.value) : el.value;
  if (f === 'minutes' && (!Number.isFinite(value) || value < 15 || value > 180)) { el.value = p.minutes; toast(tr('Kies een trainingsduur tussen 15 en 180 minuten.')); return; }
  if (f === 'comfortableRunKm' && (!Number.isFinite(value) || value < 0 || value > 100)) { el.value = p.comfortableRunKm; toast(tr('Kies een afstand tussen 0 en 100 kilometer.')); return; }
  if (f === 'weeklyRunKm' && (!Number.isFinite(value) || value < 0 || value > 250)) { el.value = p.weeklyRunKm; toast(tr('Kies een gemiddelde tussen 0 en 250 kilometer.')); return; }
  if (f === 'currentRunDays' && (!Number.isInteger(value) || value < 0 || value > 7)) { el.value = p.currentRunDays; toast(tr('Kies een aantal dagen tussen 0 en 7.')); return; }
  if (f === 'category') { p.category = value; p.goal = Object.keys(goalsInCategory(value))[0]; p.days = p.days.slice(0, maxTrainingDays(p)); p.generated = null; save(); renderTrainingPlan(); return; }
  if (f === 'eventDate' && value) {
    const weeks = eventWeeksLeft(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || weeks === null || weeks < 0) { el.value = p.eventDate || ''; toast(tr('Kies een geldige datum vanaf vandaag.')); return; }
  }
  if (f === 'weeklyActivityMinutes' && (!Number.isFinite(value) || value < 1 || value > 2000)) { el.value = p.weeklyActivityMinutes; toast(tr('Kies een beweegdoel tussen 1 en 2.000 minuten per week.')); return; }
  if (f === 'goal' && !Object.hasOwn(goalsInCategory(p.category), value)) return;
  p[f] = value;
  if (f === 'goal' || f === 'level') {
    const maxDays = maxTrainingDays(p);
    if (p.days.length > maxDays) {
      p.days = p.days.slice(0, maxDays);
      toast(tr('Ik heb de gekozen dagen aangepast aan het maximum voor dit doel en niveau.'));
    }
  }
  p.generated = null; save(); renderTrainingPlan();
};
ACT.trainingDay = el => {
  const p = trainingData(), day = el.dataset.day;
  const days = new Set(p.days);
  if (el.checked) {
    if (days.size >= maxTrainingDays(p)) { el.checked = false; return toast(trf('Kies maximaal {count} trainingsdagen voor dit doel en niveau.', { count: maxTrainingDays(p) })); }
    days.add(day);
  } else days.delete(day);
  p.days = TRAIN_DAYS.map(([key]) => key).filter(key => days.has(key)); p.generated = null; save(); renderTrainingPlan();
};
ACT.generateTrainingPlan = () => {
  const p = trainingData();
  if (!p.days.length) return toast(tr('Kies minstens één trainingsdag.'));
  if (p.goal === 'rehab' && !p.rehabCleared) return toast(tr('Vraag eerst toestemming en richtlijnen aan je arts of kinesitherapeut.'));
  if (['marathon', 'hyrox'].includes(p.goal)) {
    if (p.days.length < 3) return toast(tr('Kies minstens 3 trainingsdagen voor dit wedstrijdplan.'));
    const plan = eventProgram(p);
    if (!plan) return toast(tr('Er is te weinig tijd voor een veilige standaardopbouw. Kies een latere wedstrijddatum of overleg met een gekwalificeerde coach.'));
    p.generated = Object.assign({ category: p.category, goal: p.goal, level: p.level, eventDate: p.eventDate, minutes: p.minutes }, plan);
    save(); renderTrainingPlan(); return;
  }
  if (['runStart', 'run5k'].includes(p.goal)) {
    const chosen = p.days.map(k => TRAIN_DAYS.findIndex(d => d[0] === k));
    if (chosen.some((day, i) => i > 0 && day - chosen[i - 1] < 2) || (chosen.length > 1 && chosen[0] === 0 && chosen[chosen.length - 1] === 6)) return toast(tr('Plan minstens één volledige rustdag tussen looptrainingen, ook over de weekgrens.'));
  }
  const progressive = progressiveProgram(p);
  if (p.goal === 'rehab') progressive.weeks = progressive.weeks.map(w => Object.assign(w, { phase: w.number === 1 ? 'Afspraken met behandelaar plannen' : 'Alleen verder volgens behandelaar' }));
  p.generated = Object.assign({ category: p.category, goal: p.goal, level: p.level, access: p.access, equipment: p.equipment, timeOfDay: p.timeOfDay, minutes: p.minutes, nutritionFocus: p.nutritionFocus, activityGoal: p.activityGoal, weeklyActivityMinutes: p.weeklyActivityMinutes, eventDate: p.eventDate, eventName: p.eventName, comfortableRunKm: p.comfortableRunKm }, progressive);
  save(); renderTrainingPlan();
};
