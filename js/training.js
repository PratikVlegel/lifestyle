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
  return '<a class="card mood-home" href="#/stemming"><b>Stemming en gewoontes</b><span class="small">Je persoonlijke overzicht staat klaar. ›</span></a>';
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
  h += '<div class="card"><p class="muted small">Dit is een algemene startindeling, geen medisch advies. Train binnen je mogelijkheden en bouw rustig op. Bij klachten, een blessure of een medische aandoening: bespreek je plan met je zorgverlener.</p>';
  if (p.goal === 'weight') h += '<p class="muted small"><b>Afvallen / fitter worden:</b> deze beweegindeling kan je fitheid ondersteunen, maar garandeert geen gewichtsverlies en stelt geen calorie-inname voor.</p>';
  h += '<label class="fld"><span>Waar wil je eerst aan werken?</span><select data-chg="trainingField" data-f="category">' + Object.entries(TRAIN_CATEGORIES).map(([k, c]) => '<option value="' + k + '"' + (p.category === k ? ' selected' : '') + '>' + c.label + '</option>').join('') + '</select></label>';
  h += '<label class="fld"><span>Wat is je doel?</span><select data-chg="trainingField" data-f="goal">' + Object.entries(goalsInCategory(p.category)).map(([k, label]) => '<option value="' + k + '"' + (p.goal === k ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label>';
  h += '<div class="grid2"><label class="fld"><span>Je niveau</span><select data-chg="trainingField" data-f="level">' + TRAIN_LEVELS.map(([k, l]) => '<option value="' + k + '"' + (p.level === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select><small class="muted">Kies op basis van je recente trainingservaring. Wedstrijdgericht betekent niet automatisch professioneel.</small></label>';
  h += '<label class="fld"><span>Toegang tot fitness?</span><select data-chg="trainingField" data-f="access">' + [['no', 'Nee'], ['yes', 'Ja']].map(([k, l]) => '<option value="' + k + '"' + (p.access === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label></div>';
  h += '<label class="fld"><span>Wat heb je beschikbaar?</span><select data-chg="trainingField" data-f="equipment">' + [['none', 'Geen materiaal'], ['home', 'Thuis: banden of gewichten'], ['gym', 'Volledige fitness']].map(([k, l]) => '<option value="' + k + '"' + (p.equipment === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>';
  h += '<fieldset class="fld"><legend>Welke dagen passen meestal?</legend><div class="grid2">' + TRAIN_DAYS.map(([k, l]) => '<label class="check"><input type="checkbox" data-chg="trainingDay" data-day="' + k + '"' + (p.days.includes(k) ? ' checked' : '') + '><span class="n">' + l + '</span></label>').join('') + '</div><small class="muted">Kies maximaal ' + maxTrainingDays(p) + ' trainingsdagen voor dit doel en niveau; de overige dagen zijn hersteldagen.</small></fieldset>';
  h += '<label class="fld"><span>Hoeveel tijd per training?</span><input type="number" min="15" max="180" step="5" value="' + esc(p.minutes ?? 45) + '" data-chg="trainingField" data-f="minutes"><small class="muted">15–180 minuten</small></label>';
  h += '<label class="fld"><span>Wanneer komt trainen meestal uit?</span><select data-chg="trainingField" data-f="timeOfDay">' + [['any', 'Geen voorkeur'], ['morning', 'Ochtend'], ['afternoon', 'Middag'], ['evening', 'Avond']].map(([k, l]) => '<option value="' + k + '"' + (p.timeOfDay === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>';
  h += '<label class="fld"><span>Voedingsfocus (optioneel)</span><select data-chg="trainingField" data-f="nutritionFocus">' + [['none', 'Geen'], ['regularity', 'Regelmaat in maaltijden'], ['protein', 'Eiwitbron bij maaltijden'], ['fiber', 'Meer vezelrijke keuzes']].map(([k, l]) => '<option value="' + k + '"' + (p.nutritionFocus === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select><small class="muted">Dit geeft een aandachtspunt, geen dieet- of calorievoorschrift.</small></label>';
  h += '<label class="fld"><span>Beweegdoel (optioneel)</span><select data-chg="trainingField" data-f="activityGoal">' + [['none', 'Geen'], ['guideline', 'Richtlijn voor volwassenen'], ['custom', 'Eigen weekdoel in minuten']].map(([k, l]) => '<option value="' + k + '"' + (p.activityGoal === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>';
  if (p.activityGoal === 'custom') h += '<label class="fld"><span>Minuten beweging per week</span><input type="number" min="1" max="2000" step="5" value="' + esc(p.weeklyActivityMinutes) + '" data-chg="trainingField" data-f="weeklyActivityMinutes"><small class="muted">Vul je eigen haalbare streefdoel in; wandelen en fietsen tellen ook mee.</small></label>';
  if (p.goal === 'rehab') h += '<div class="card note"><b>Alleen met akkoord van je behandelaar</b><p class="small">Deze app stelt geen diagnose of revalidatie-oefeningen op. Gebruik dit alleen als arts of kinesitherapeut je toestemming gaf om te trainen; volg hun oefeningen, grenzen en opbouw.</p><label class="check"><input type="checkbox" data-chg="trainingField" data-f="rehabCleared"' + (p.rehabCleared ? ' checked' : '') + '><span class="n">Mijn behandelaar heeft bewegen/trainen toegestaan en ik volg diens richtlijnen</span></label></div>';
  h += '<p class="muted small">Persoonlijke instellingen: je profiel kan geslacht en lichaamsgewicht bevatten, maar bepaalt niet automatisch een ander trainingsschema. Doel, ervaring, beschikbare dagen, tijd en materiaal sturen de oefeningen. Afvallen of spiermassa opbouwen geeft geen gegarandeerd resultaat of automatisch calorievoorschrift.</p>';
  if (['runStart', 'run5k'].includes(p.goal)) h += '<p class="muted small">Voor looptrainingen plan je minstens één volledige rustdag tussen twee gekozen loopdagen.</p>';
  if (p.category === 'events') {
    if (p.goal !== 'hyrox') h += '<label class="fld"><span>Wat loop je nu comfortabel als langste afstand? (km)</span><input type="number" min="0" max="100" step="0.5" value="' + esc(p.comfortableRunKm) + '" data-chg="trainingField" data-f="comfortableRunKm"><small class="muted">Gebruik 0 als je nu nog niet loopt. Wedstrijdopbouw wordt alleen getoond als je huidige basis erbij past.</small></label>';
    h += '<div class="grid2"><label class="fld"><span>Gemiddeld aantal loopkilometers per week in de laatste 4 weken</span><input type="number" min="0" max="250" step="1" value="' + esc(p.weeklyRunKm) + '" data-chg="trainingField" data-f="weeklyRunKm"><small class="muted">Een schatting is genoeg; vul 0 in als je niet hebt gelopen.</small></label>' +
      '<label class="fld"><span>Op hoeveel dagen per week liep je gemiddeld?</span><input type="number" min="0" max="7" step="1" value="' + esc(p.currentRunDays) + '" data-chg="trainingField" data-f="currentRunDays"><small class="muted">Gemiddeld over de laatste 4 weken.</small></label></div>';
    if (p.goal === 'race') h += '<label class="fld"><span>Welke hardloopwedstrijd wil je doen?</span><input type="text" maxlength="80" value="' + esc(p.eventName) + '" data-chg="trainingField" data-f="eventName" placeholder="Bijvoorbeeld trailrun of obstacle run"><small class="muted">Voor andere sporten dan hardlopen is dit basisplan niet geschikt.</small></label>';
    h += '<label class="fld"><span>Wedstrijddatum (optioneel)</span><input type="date" value="' + esc(p.eventDate) + '" data-chg="trainingField" data-f="eventDate"><small class="muted">Met een datum plant de app de trainingsblokken terug vanaf de wedstrijd. De planner kort een programma niet in als de datum te dichtbij is.</small></label>';
  }
  h += '<button class="btn big" data-act="generateTrainingPlan">Maak mijn weekindeling</button></div>';
  if (p.generated) h += renderGeneratedTraining(p.generated);
  if (p.category === 'events') h += renderEventGuidance(p);
  view().innerHTML = h;
}
function renderTrainingHub() {
  const plans = savedTrainingPlans(), active = activeTrainingPlan();
  let h = header('Schema’s', 'Kies, start en volg een plan op jouw tempo', true);
  h += '<div class="card"><p>Je schema’s blijven op dit toestel bewaard. Je kan er één tegelijk actief volgen, pauzeren of stopzetten.</p><a class="btn big" href="#/train">Stel een nieuw schema samen</a></div>';
  if (active) {
    const wi = Math.min(Math.max(0, active.currentWeek - 1), active.weeks.length - 1), week = active.weeks[wi];
    const done = active.doneSessions || [], count = done.filter(k => k.startsWith(week.number + ':')).length;
    h += '<h2 class="sec">Actief schema</h2><div class="card plan-active"><div class="plan-head"><span class="pill">WEEK ' + week.number + ' VAN ' + active.weeks.length + '</span><span class="muted small">' + esc((TRAIN_LEVELS.find(x => x[0] === active.level) || ['', ''])[1]) + '</span></div><h2 class="plan-title">' + esc(TRAIN_GOALS[active.goal] || active.name || 'Trainingsschema') + '</h2><p class="muted small">' + esc(week.phase || 'Opbouw') + (week.focus ? ' · ' + esc(week.focus) : '') + '</p><div class="prog"><i style="width:' + Math.round(count / Math.max(1, week.sessions.length) * 100) + '%"></i></div><p class="muted small">' + count + ' van ' + week.sessions.length + ' trainingen afgevinkt deze week</p>';
    h += week.sessions.map((s, i) => { const key = week.number + ':' + i, checked = done.includes(key); return '<div class="plan-session' + (checked ? ' complete' : '') + '"><div><b>' + esc(s.day || 'Training ' + (i + 1)) + ' · ' + esc(s.title) + '</b><p>' + esc(s.detail) + '</p></div><button class="chip sm ' + (checked ? 'done' : '') + '" data-act="togglePlanSession" data-id="' + esc(active.id) + '" data-week="' + week.number + '" data-i="' + i + '" aria-pressed="' + checked + '">' + (checked ? '✓ Klaar' : 'Markeer klaar') + '</button></div>'; }).join('');
    if (done.length && week.sessions.every((_, i) => done.includes(week.number + ':' + i))) h += '<div class="card note"><b>Deze week is afgevinkt</b><p class="small">Kijk de afgevinkte trainingen nog even na. Je kan ze hierboven terugzetten voordat je verdergaat.</p><button class="btn big" data-act="advanceTrainingWeek" data-id="' + esc(active.id) + '">' + (active.currentWeek < active.weeks.length ? 'Open de volgende week' : 'Rond schema af') + '</button></div>';
    h += '<div class="inrow wrap"><button class="btn ghost" data-act="pauseTrainingPlan" data-id="' + esc(active.id) + '">Pauzeer schema</button><button class="link danger" data-act="stopTrainingPlan" data-id="' + esc(active.id) + '">Zet schema stop</button></div></div>';
  } else h += '<div class="card muted">Je volgt momenteel geen actief schema. Kies hieronder een gepauzeerd schema om verder te gaan of stel een nieuw schema samen.</div>';
  const others = plans.filter(p => !active || p.id !== active.id);
  if (others.length) h += '<h2 class="sec">Opgeslagen schema’s</h2>' + others.map(p => {
    const status = { paused: 'Gepauzeerd', stopped: 'Gestopt', completed: 'Afgerond' }[p.status] || 'Opgeslagen';
    const button = p.status === 'paused' ? '<button class="btn ghost" data-act="resumeTrainingPlan" data-id="' + esc(p.id) + '">Verder volgen</button>' : p.status === 'completed' ? '<button class="btn ghost" data-act="restartTrainingPlan" data-id="' + esc(p.id) + '">Opnieuw starten</button>' : '<button class="btn ghost" data-act="resumeTrainingPlan" data-id="' + esc(p.id) + '">Opnieuw activeren</button>';
    return '<div class="card plan-saved"><div class="plan-head"><span class="pill">' + status.toUpperCase() + '</span><span class="muted small">' + esc(p.createdAt || '') + '</span></div><b>' + esc(TRAIN_GOALS[p.goal] || p.name || 'Trainingsschema') + '</b><p class="muted small">' + esc((TRAIN_LEVELS.find(x => x[0] === p.level) || ['', ''])[1]) + ' · ' + p.weeks.length + ' weken</p><div class="inrow wrap">' + button + '<button class="link danger" data-act="deleteTrainingPlan" data-id="' + esc(p.id) + '">Verwijder</button></div></div>';
  }).join('');
  if (!plans.length) h += '<p class="muted small">Als je een schema maakt en op “Start dit schema” tikt, verschijnt het hier én op Vandaag.</p>';
  view().innerHTML = h;
}
function activeTrainingHomeCard() {
  const p = activeTrainingPlan();
  if (!p) return '<a class="card plan-home-empty" href="#/schemas"><b>Je trainingsschema</b><span class="muted small">Nog geen actief schema. Kies een plan en volg hier je voortgang.</span><span class="plan-go">Schema’s bekijken ›</span></a>';
  const week = p.weeks[Math.min(Math.max(0, p.currentWeek - 1), p.weeks.length - 1)];
  const done = (p.doneSessions || []).filter(k => k.startsWith(week.number + ':')).length;
  return '<a class="card plan-home" href="#/schemas"><div class="plan-head"><span class="pill">ACTIEF · WEEK ' + week.number + '/' + p.weeks.length + '</span><b>' + esc(TRAIN_GOALS[p.goal] || p.name || 'Trainingsschema') + '</b></div><p class="small">' + esc(week.phase || 'Opbouw') + ' · ' + done + '/' + week.sessions.length + ' trainingen afgerond</p><div class="prog"><i style="width:' + Math.round(done / Math.max(1, week.sessions.length) * 100) + '%"></i></div><span class="plan-go">Schema openen ›</span></a>';
}
ACT.startTrainingPlan = () => {
  const draft = DB.training && DB.training.generated;
  if (!draft) return toast('Maak eerst een schema om te starten.');
  const weeks = Array.isArray(draft.weeks) ? draft.weeks : [{ number: 1, phase: 'Basisweek', focus: 'Herhaal deze week en bouw rustig op.', sessions: draft.sessions || [] }];
  if (!weeks.length || !weeks[0].sessions.length) return toast('Dit schema heeft geen trainingsdagen om te volgen.');
  const plans = savedTrainingPlans(), old = activeTrainingPlan();
  if (old) old.status = 'paused';
  const p = JSON.parse(JSON.stringify(draft));
  p.id = uid(); p.name = TRAIN_GOALS[p.goal] || 'Persoonlijk schema'; p.status = 'active'; p.createdAt = todayKey(); p.currentWeek = 1; p.doneSessions = []; p.weeks = weeks;
  plans.unshift(p); DB.training.activePlanId = p.id; save(); toast(old ? 'Nieuwe schema gestart; je vorige staat op pauze.' : 'Schema gestart. Je voortgang staat op Vandaag en Schema’s.'); go('#/schemas');
};
ACT.pauseTrainingPlan = el => { const p = savedTrainingPlans().find(x => x.id === el.dataset.id); if (!p) return; p.status = 'paused'; DB.training.activePlanId = null; save(); renderTrainingHub(); };
ACT.stopTrainingPlan = el => { if (!confirm('Dit schema stopzetten? Je voortgang blijft bewaard.')) return; const p = savedTrainingPlans().find(x => x.id === el.dataset.id); if (!p) return; p.status = 'stopped'; DB.training.activePlanId = null; save(); renderTrainingHub(); };
ACT.resumeTrainingPlan = el => { const p = savedTrainingPlans().find(x => x.id === el.dataset.id); if (!p) return; const old = activeTrainingPlan(); if (old && old.id !== p.id) old.status = 'paused'; p.status = 'active'; DB.training.activePlanId = p.id; save(); renderTrainingHub(); };
ACT.restartTrainingPlan = el => { const p = savedTrainingPlans().find(x => x.id === el.dataset.id); if (!p) return; p.currentWeek = 1; p.doneSessions = []; p.status = 'active'; const old = activeTrainingPlan(); if (old && old.id !== p.id) old.status = 'paused'; DB.training.activePlanId = p.id; save(); renderTrainingHub(); };
ACT.deleteTrainingPlan = el => { if (!confirm('Schema en opgeslagen voortgang verwijderen?')) return; DB.training.plans = savedTrainingPlans().filter(p => p.id !== el.dataset.id); if (DB.training.activePlanId === el.dataset.id) DB.training.activePlanId = null; save(); renderTrainingHub(); };
ACT.togglePlanSession = el => {
  const p = activeTrainingPlan(); if (!p || p.id !== el.dataset.id || p.status !== 'active') return;
  const week = p.weeks.find(w => w.number === Number(el.dataset.week)); if (!week || week.number !== p.currentWeek) return;
  const key = week.number + ':' + Number(el.dataset.i), done = p.doneSessions || (p.doneSessions = []);
  if (done.includes(key)) p.doneSessions = done.filter(x => x !== key); else done.push(key);
  save(); renderTrainingHub();
};
ACT.advanceTrainingWeek = el => {
  const p = activeTrainingPlan(); if (!p || p.id !== el.dataset.id) return;
  const week = p.weeks.find(w => w.number === p.currentWeek);
  if (!week || !week.sessions.every((_, i) => (p.doneSessions || []).includes(week.number + ':' + i))) return toast('Vink eerst alle trainingen van deze week af.');
  if (p.currentWeek < p.weeks.length) { p.currentWeek++; toast('Volgende week staat klaar.'); }
  else { p.status = 'completed'; DB.training.activePlanId = null; toast('Schema afgerond. Je voortgang is bewaard.'); }
  save(); renderTrainingHub();
};
function renderGeneratedTraining(g) {
  if (g.programType === 'progressive') return renderProgressiveProgram(g) + draftPlanActions();
  if (g.weeks) return renderEventProgram(g) + draftPlanActions();
  const sessions = (g.sessions || []).map(s => '<div class="card"><h3>' + esc(s.day) + ' · ' + esc(s.title) + '</h3><p>' + esc(s.detail) + '</p><p class="muted small">' + g.minutes + ' min · ' + esc(s.effort) + '</p></div>').join('');
  const focus = { regularity: 'Kies een eetmoment dat vaak wegvalt en maak daar een haalbare routine van.', protein: 'Voeg bij een of meer maaltijden een eiwitbron toe die je graag eet.', fiber: 'Voeg geleidelijk een vezelrijke keuze toe, zoals fruit, groente, volkoren of peulvruchten.' }[g.nutritionFocus];
  const activityGoal = g.activityGoal === 'guideline' ? 'Voor volwassenen is een richtpunt 150–300 minuten matig intensieve beweging per week (of 75–150 minuten intensief), plus spierversterkende activiteit op minstens 2 dagen. Bouw hier rustig naartoe; wandelen en fietsen tellen ook mee.' : g.activityGoal === 'custom' ? 'Jouw gekozen beweegdoel: ' + g.weeklyActivityMinutes + ' minuten per week. Wandelen en fietsen tellen mee; pas het doel aan als herstel of omstandigheden daarom vragen.' : '';
  const levels = Object.fromEntries(TRAIN_LEVELS.map(([key, label]) => [key, label.toLowerCase()]));
  const place = g.access === 'yes' ? 'met toegang tot fitness' : 'zonder fitness';
  const timing = { any: 'geen tijdsvoorkeur', morning: 'bij voorkeur in de ochtend', afternoon: 'bij voorkeur in de middag', evening: 'bij voorkeur in de avond' }[g.timeOfDay] || 'geen tijdsvoorkeur';
  return '<h2 class="sec">Voorbeeld van je schema</h2><div class="card"><p><b>' + esc((g.goal === 'race' && g.eventName) ? g.eventName : TRAIN_GOALS[g.goal] || TRAIN_GOALS.general) + '</b> · ' + esc(levels[g.level] || 'beginner') + ' · ' + g.sessions.length + ' trainingen</p><p class="muted small">' + g.sessions.length * g.minutes + ' minuten gepland deze week · ' + place + ' · ' + timing + '. Bekijk het voorbeeld en start het daarna om het bij Schema’s te volgen.</p></div>' + sessions + (focus ? '<div class="card"><h3>Optionele voedingsfocus</h3><p>' + focus + '</p></div>' : '') + (activityGoal ? '<div class="card"><h3>Optioneel beweegdoel</h3><p>' + activityGoal + '</p></div>' : '') + draftPlanActions();
}
function draftPlanActions() { return '<div class="card plan-draft"><h3>Wil je dit schema volgen?</h3><p class="muted small">Start het om je trainingen af te vinken. Je kan het later pauzeren, hervatten of stopzetten.</p><button class="btn big" data-act="startTrainingPlan">Start dit schema</button><a class="link" href="#/schemas">Terug naar mijn schema’s</a></div>'; }
function renderProgressiveProgram(g) {
  const cards = g.weeks.map(w => '<details class="card train-week"' + (w.number === 1 ? ' open' : '') + '><summary><b>Week ' + w.number + ' · ' + esc(w.phase) + '</b><span class="muted small">' + esc(w.focus) + '</span></summary>' + w.sessions.map(s => '<div class="train-session"><b>' + esc(s.day) + ' · ' + esc(s.title) + '</b><p>' + esc(s.detail) + '</p></div>').join('') + '</details>').join('');
  const caution = g.goal === 'rehab' ? '<div class="card note"><b>Revalidatie blijft onder regie van je behandelaar</b><p class="small">Dit is alleen een weekindeling om de door je behandelaar goedgekeurde activiteiten te plannen. De app verhoogt geen oefeningen, gewicht of intensiteit. Stop en vraag advies bij scherpe/toenemende pijn, terugkerende zwelling of verlies van beweging/kracht.</p><p class="muted small">Richtlijn: <a href="https://leedscommunityhealthcare.nhs.uk/our-services-a-z/musculoskeletal-msk/return-to-activity-or-sport-after-injury/" target="_blank" rel="noopener">Leeds Community Healthcare NHS · terugkeer na blessure</a></p></div>' : '<div class="card"><p class="muted small">Verhoog alleen als je goed herstelt; herhaal gerust een week. Rustdagen zijn onderdeel van het plan. Bij pijn of een medische aandoening: overleg met een zorgverlener.</p></div>';
  const source = g.goal === 'runStart' ? '<p class="muted small">Opbouwprincipe: afwisselend wandelen en lopen met rust tussen loopdagen, zoals bij <a href="https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/" target="_blank" rel="noopener">NHS Couch to 5K</a>. Dit is een eigen, vereenvoudigde planning en geen kopie van het NHS-programma.</p>' : ['strength', 'muscle'].includes(g.goal) ? '<p class="muted small">Krachtprincipes afgestemd op de <a href="https://acsm.org/resistance-training-guidelines-update-2026/" target="_blank" rel="noopener">ACSM-richtlijn 2026</a>: train grote spiergroepen minstens 2 dagen per week, kies een haalbare belasting en bouw geleidelijk op. Je hoeft niet tot spierfalen te trainen.</p>' : '';
  const nutritionFocus = { regularity: 'Kies een eetmoment dat vaak wegvalt en maak daar een haalbare routine van.', protein: 'Voeg bij een of meer maaltijden een eiwitbron toe die je graag eet.', fiber: 'Voeg geleidelijk een vezelrijke keuze toe, zoals fruit, groente, volkoren of peulvruchten.' }[g.nutritionFocus];
  const activityGoal = g.activityGoal === 'guideline' ? 'Voor volwassenen is een algemeen richtpunt 150–300 minuten matige beweging per week (of 75–150 minuten intensieve beweging), plus spierversterkende activiteit op minstens 2 dagen. Bouw hier rustig naartoe.' : g.activityGoal === 'custom' ? 'Jouw gekozen beweegdoel: ' + g.weeklyActivityMinutes + ' minuten per week. Pas dit aan als herstel of omstandigheden daarom vragen.' : '';
  const place = g.access === 'yes' && g.equipment === 'gym' ? 'fitness met toestellen' : g.equipment === 'home' ? 'thuis met banden/gewichten' : 'zonder materiaal';
  const time = g.goal === 'rehab' ? 'volgens de duur van je behandelaar' : 'richttijd ' + g.minutes + ' min per training';
  return '<h2 class="sec">Jouw ' + g.weeks.length + '-weekse opbouw</h2><div class="card"><p><b>' + esc(TRAIN_GOALS[g.goal]) + '</b> · ' + esc((TRAIN_LEVELS.find(x => x[0] === g.level) || ['', 'Beginner'])[1]) + ' · ' + g.days.length + ' trainingsdagen per week</p><p class="muted small">Aangepast aan je gekozen dagen, beschikbare tijd, niveau en materiaal (' + place + '; ' + time + '). ' + (g.goal === 'weight' ? 'Beweging ondersteunt je gezondheid; gewichtsverlies hangt ook af van voeding en andere factoren en wordt niet gegarandeerd.' : '') + '</p></div>' + source + cards + caution + (nutritionFocus ? '<div class="card"><h3>Optionele voedingsfocus</h3><p>' + nutritionFocus + '</p></div>' : '') + (activityGoal ? '<div class="card"><h3>Optioneel beweegdoel</h3><p>' + activityGoal + '</p></div>' : '');
}
function renderEventGuidance(p) {
  const marathonReady = p.weeklyRunKm >= 20 && p.comfortableRunKm >= 12 && p.currentRunDays >= 3;
  let text = p.goal === 'marathon'
    ? (marathonReady
      ? 'De 20-weekse marathonopbouw is bedoeld voor lopers die al geregeld trainen: gemiddeld minstens 20 km per week, een comfortabele lange duurloop van 12 km en ongeveer 3 loopdagen per week. Dit is een startcheck, geen garantie op wedstrijdklaarheid.'
      : 'Een marathonblok is pas passend als je de laatste weken al ongeveer 20 km per week liep, een comfortabele lange duurloop van 12 km aankunt en meestal 3 dagen per week loopt. Vul je basis eerlijk in: anders krijg je eerst een rustige 8-weekse loopbasis, geen versneld marathonschema.')
    : 'HYROX combineert 8 loopkilometers met 8 vaste workoutstations. Het programma bouwt eerst conditie en techniek op, daarna combineert het lopen en stations. De gekozen fitnessuitrusting bepaalt welke veilige oefenvarianten worden voorgesteld.';
  const weeks = p.goal === 'hyrox' ? (['advanced', 'competitive'].includes(p.level) ? 8 : 12) : 20;
  const left = eventWeeksLeft(p.eventDate);
  if (left !== null && left < weeks) text += ' Er zijn ' + Math.max(0, left) + ' weken tot de datum; dat is korter dan dit ' + weeks + '-weekse blok. De planner perst de belasting niet samen. Kies een latere wedstrijd of bespreek een aangepast plan met een coach.';
  else if (left !== null && left > weeks) text += ' Er zijn ' + left + ' weken tot de datum. Het wedstrijdblok van ' + weeks + ' weken start over ' + (left - weeks) + ' weken; gebruik de tijd tot dan voor rustige basisopbouw.';
  return '<div class="card note"><b>Meerweeks wedstrijdplan</b><p class="small">' + text + '</p><p class="muted small">Bouw liever maar één trainingsprikkel tegelijk op en neem herstel serieus. Stop bij scherpe of toenemende pijn. Bij een blessure, aandoening of vragen over jouw belastbaarheid: laat een arts of gekwalificeerde coach meekijken.</p><p class="muted small">Gebaseerd op de algemene opbouwprincipes van <a href="https://www.baa.org/races/boston-marathon/info-for-athletes/boston-marathon-training/" target="_blank" rel="noopener">Boston Athletic Association</a> en <a href="https://worldathletics.org/personal-best/performance/injury-prevention-runners" target="_blank" rel="noopener">World Athletics</a>, plus het <a href="https://hyrox.com/the-fitness-race/" target="_blank" rel="noopener">officiële HYROX-format</a> en <a href="https://www.hyrox365.com/about-hyrox/training" target="_blank" rel="noopener">HYROX365-trainingsopbouw</a>.</p></div>';
}
function renderEventProgram(g) {
  if (g.notReady) return renderFoundationProgram(g);
  const cards = (g.weeks || []).map(w => '<details class="card train-week"' + (w.number === 1 ? ' open' : '') + '><summary><b>Week ' + w.number + ' · ' + esc(w.phase) + '</b><span class="muted small">' + esc(w.focus) + '</span></summary>' +
    w.sessions.map(s => '<div class="train-session"><b>' + esc(s.day) + ' · ' + esc(s.title) + '</b><p>' + esc(s.detail) + '</p></div>').join('') + '</details>').join('');
  const timing = g.startLabel ? '<p class="small">' + esc(g.startLabel) + '</p>' : '';
  const timeNote = g.goal === 'marathon'
    ? '<p class="muted small">De lange duurloop wordt geleidelijk langer en kan ruim boven je ingestelde sessietijd uitkomen. Als je die tijd of afstand niet kunt vrijmaken, schuif je doel op in plaats van trainingen samen te persen.</p>'
    : '<p class="muted small">Houd de HYROX-trainingen binnen je gekozen tijd (' + Number(g.minutes || 45) + ' minuten) door minder rondes te doen; techniek en herstel gaan voor extra volume.</p>';
  return '<h2 class="sec">Jouw ' + (g.goal === 'marathon' ? '20-weekse marathonopbouw' : g.weeks.length + '-weekse HYROX-opbouw') + '</h2>' +
    '<div class="card"><p><b>' + esc(TRAIN_GOALS[g.goal]) + '</b> · ' + esc((TRAIN_LEVELS.find(x => x[0] === g.level) || ['', 'Beginner'])[1]) + '</p><p class="muted small">De weken combineren herstel, rustige duur, kracht/techniek en een geleidelijke specifieke prikkel. Gebruik de praat-test voor rustige inspanning; er staan bewust geen tempo’s of wedstrijdgewichten in, want die hangen af van jouw basis en HYROX-divisie.</p>' + timing + timeNote + '</div>' + cards +
    '<div class="card fb"><b>Praktische trainingsregels</b><ul><li>Plan zware dagen niet direct na elkaar; vervang een training door rust als je nog duidelijk vermoeid bent.</li><li>Verhoog afstand of intensiteit geleidelijk, niet allebei tegelijk.</li><li>Voor HYROX: oefen techniek en materiaal eerst licht; een volledige racesimulatie is niet nodig.</li><li>De vaste HYROX-stations zijn SkiErg, sled push, sled pull, burpee broad jumps, roeien, farmer carry, sandbag lunges en wall balls; tussen stations loop je telkens ongeveer 1 km. Controleer de actuele regels en gewichten voor jouw divisie.</li></ul></div>';
}
function renderFoundationProgram(g) {
  const sessions = (g.weeks || []).map(w => '<div class="card"><b>Week ' + w.number + ' · ' + esc(w.phase) + '</b><p>' + esc(w.focus) + '</p>' + w.sessions.map(s => '<p class="small"><b>' + esc(s.day) + ' · ' + esc(s.title) + ':</b> ' + esc(s.detail) + '</p>').join('') + '</div>').join('');
  return '<h2 class="sec">Eerst je loopbasis opbouwen</h2><div class="card note"><p>Op basis van je huidige loopkilometers en langste afstand maak ik nog geen marathonspecifiek programma. Deze 8 weken helpen je rustig regelmaat opbouwen; ze maken je niet automatisch klaar voor een marathon. Kies daarna opnieuw je wedstrijdplan wanneer je basis stabiel is.</p></div>' + sessions;
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
    ? (weeksLeft > duration ? 'Het specifieke blok begint over ' + (weeksLeft - duration) + ' weken. De eerste week valt rond ' + new Date(new Date(p.eventDate + 'T12:00:00').getTime() - duration * 7 * 86400000).toLocaleDateString('nl-BE') + '.' : 'Week 1 begint nu; pas de weekindeling aan als je agenda verandert.')
    : 'Zonder wedstrijddatum start week 1 vanaf nu. Zet de wedstrijddatum erbij om de opbouw hierop af te stemmen.';
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
  if (n === duration) return { number: n, phase, focus: 'Rustig aan de start en volg je afgesproken raceplan.', sessions: [{ day: p.eventDate ? new Date(p.eventDate + 'T12:00:00').toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'short' }) : 'Wedstrijddag', title: 'Marathon · 42,2 km', detail: 'Start beheerst. Gebruik alleen voeding en drinken die je eerder hebt getest; volg de actuele wedstrijdinformatie.' }] };
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
      : { day: i === days.length - 1 && p.eventDate ? new Date(p.eventDate + 'T12:00:00').toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'short' }) : d.label, title: i === days.length - 1 && p.eventDate ? 'HYROX-wedstrijd' : 'Rust of lichte techniek', detail: p.eventDate && i === days.length - 1 ? 'Volg de briefing en officiële stationvolgorde. Houd het tempo beheerst.' : 'Geen zware intervallen of vermoeiende racesimulatie in de taper.' };
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
  if (f === 'minutes' && (!Number.isFinite(value) || value < 15 || value > 180)) { el.value = p.minutes; toast('Kies een trainingsduur tussen 15 en 180 minuten.'); return; }
  if (f === 'comfortableRunKm' && (!Number.isFinite(value) || value < 0 || value > 100)) { el.value = p.comfortableRunKm; toast('Kies een afstand tussen 0 en 100 kilometer.'); return; }
  if (f === 'weeklyRunKm' && (!Number.isFinite(value) || value < 0 || value > 250)) { el.value = p.weeklyRunKm; toast('Kies een gemiddelde tussen 0 en 250 kilometer.'); return; }
  if (f === 'currentRunDays' && (!Number.isInteger(value) || value < 0 || value > 7)) { el.value = p.currentRunDays; toast('Kies een aantal dagen tussen 0 en 7.'); return; }
  if (f === 'category') { p.category = value; p.goal = Object.keys(goalsInCategory(value))[0]; p.days = p.days.slice(0, maxTrainingDays(p)); p.generated = null; save(); renderTrainingPlan(); return; }
  if (f === 'eventDate' && value) {
    const weeks = eventWeeksLeft(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || weeks === null || weeks < 0) { el.value = p.eventDate || ''; toast('Kies een geldige datum vanaf vandaag.'); return; }
  }
  if (f === 'weeklyActivityMinutes' && (!Number.isFinite(value) || value < 1 || value > 2000)) { el.value = p.weeklyActivityMinutes; toast('Kies een beweegdoel tussen 1 en 2.000 minuten per week.'); return; }
  if (f === 'goal' && !Object.hasOwn(goalsInCategory(p.category), value)) return;
  p[f] = value;
  if (f === 'goal' || f === 'level') {
    const maxDays = maxTrainingDays(p);
    if (p.days.length > maxDays) {
      p.days = p.days.slice(0, maxDays);
      toast('Ik heb de gekozen dagen aangepast aan het maximum voor dit doel en niveau.');
    }
  }
  p.generated = null; save(); renderTrainingPlan();
};
ACT.trainingDay = el => {
  const p = trainingData(), day = el.dataset.day;
  const days = new Set(p.days);
  if (el.checked) {
    if (days.size >= maxTrainingDays(p)) { el.checked = false; return toast('Kies maximaal ' + maxTrainingDays(p) + ' trainingsdagen voor dit doel en niveau.'); }
    days.add(day);
  } else days.delete(day);
  p.days = TRAIN_DAYS.map(([key]) => key).filter(key => days.has(key)); p.generated = null; save(); renderTrainingPlan();
};
ACT.generateTrainingPlan = () => {
  const p = trainingData();
  if (!p.days.length) return toast('Kies minstens één trainingsdag.');
  if (p.goal === 'rehab' && !p.rehabCleared) return toast('Vraag eerst toestemming en richtlijnen aan je arts of kinesitherapeut.');
  if (['marathon', 'hyrox'].includes(p.goal)) {
    if (p.days.length < 3) return toast('Kies minstens 3 trainingsdagen voor dit wedstrijdplan.');
    const plan = eventProgram(p);
    if (!plan) return toast('Er is te weinig tijd voor een veilige standaardopbouw. Kies een latere wedstrijddatum of overleg met een gekwalificeerde coach.');
    p.generated = Object.assign({ category: p.category, goal: p.goal, level: p.level, eventDate: p.eventDate, minutes: p.minutes }, plan);
    save(); renderTrainingPlan(); return;
  }
  if (['runStart', 'run5k'].includes(p.goal)) {
    const chosen = p.days.map(k => TRAIN_DAYS.findIndex(d => d[0] === k));
    if (chosen.some((day, i) => i > 0 && day - chosen[i - 1] < 2) || (chosen.length > 1 && chosen[0] === 0 && chosen[chosen.length - 1] === 6)) return toast('Plan minstens één volledige rustdag tussen looptrainingen, ook over de weekgrens.');
  }
  const progressive = progressiveProgram(p);
  if (p.goal === 'rehab') progressive.weeks = progressive.weeks.map(w => Object.assign(w, { phase: w.number === 1 ? 'Afspraken met behandelaar plannen' : 'Alleen verder volgens behandelaar' }));
  p.generated = Object.assign({ category: p.category, goal: p.goal, level: p.level, access: p.access, equipment: p.equipment, timeOfDay: p.timeOfDay, minutes: p.minutes, nutritionFocus: p.nutritionFocus, activityGoal: p.activityGoal, weeklyActivityMinutes: p.weeklyActivityMinutes, eventDate: p.eventDate, eventName: p.eventName, comfortableRunKm: p.comfortableRunKm }, progressive);
  save(); renderTrainingPlan();
};
