/* Offline basisplanner. Richtlijnen: WHO adults, https://www.who.int/europe/publications/i/item/9789240014886
   Beginner hardlopen met rustdagen: NHS Couch to 5K, https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/
   HYROX-format: https://hyrox.com/the-fitness-race/
   Dit is geen formeel trainingsprotocol; race-specifieke periodisering volgt later. */
'use strict';

const TRAIN_DAYS = [
  ['ma', 'Maandag'], ['di', 'Dinsdag'], ['wo', 'Woensdag'], ['do', 'Donderdag'],
  ['vr', 'Vrijdag'], ['za', 'Zaterdag'], ['zo', 'Zondag']
];
const TRAIN_CATEGORIES = {
  general: { label: 'Algemeen doel', goals: { weight: 'Afvallen / fitter worden', general: 'Algemene conditie' } },
  fitness: { label: 'Fitness', goals: { strength: 'Kracht opbouwen', interval: 'Conditie / interval' } },
  running: { label: 'Lopen', goals: { runStart: 'Lopen rustig opbouwen', run5k: 'Toewerken naar 5 km' } },
  events: { label: 'Wedstrijd of evenement', goals: { race5k: '5 km-wedstrijd', race10k: '10 km-wedstrijd', half: 'Halve marathon', marathon: 'Marathon', race: 'Andere hardloopwedstrijd', hyrox: 'HYROX' } }
};
const TRAIN_GOALS = Object.assign({}, ...Object.values(TRAIN_CATEGORIES).map(c => c.goals));
const TRAIN_LEVELS = [
  ['beginner', 'Beginner'], ['intermediate', 'Gemiddeld / medior'],
  ['advanced', 'Ervaren'], ['competitive', 'Zeer ervaren / wedstrijdgericht']
];
const TRAIN_MAX_DAYS = { beginner: 3, intermediate: 4, advanced: 5, competitive: 5 };
function goalsInCategory(category) { return TRAIN_CATEGORIES[category]?.goals || TRAIN_CATEGORIES.general.goals; }
function maxTrainingDays(p) {
  const levelMax = TRAIN_MAX_DAYS[p.level] || 3;
  if (p.goal === 'runStart') return Math.min(levelMax, 3);
  if (p.goal === 'strength') return Math.min(levelMax, p.level === 'beginner' ? 2 : p.level === 'intermediate' ? 3 : 4);
  if (['race5k', 'race10k', 'half', 'marathon', 'race'].includes(p.goal)) return Math.min(levelMax, p.level === 'beginner' ? 3 : 4);
  if (p.goal === 'hyrox') return Math.min(levelMax, p.level === 'beginner' ? 3 : p.level === 'intermediate' ? 4 : 5);
  return Math.min(levelMax, p.level === 'beginner' ? 3 : 4);
}
function eventWeeksLeft(value) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number), target = new Date(y, m - 1, d), today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / 604800000);
}
function trainingData() {
  const d = DB.training || (DB.training = { category: 'general', goal: 'weight', level: 'beginner', access: 'no', equipment: 'none', days: ['ma', 'wo', 'vr'], timeOfDay: 'any', minutes: 45, nutritionFocus: 'none', activityGoal: 'none', weeklyActivityMinutes: 150, eventDate: '', eventName: '', comfortableRunKm: 0, generated: null });
  if (!Object.hasOwn(TRAIN_CATEGORIES, d.category)) d.category = Object.keys(TRAIN_CATEGORIES).find(k => Object.hasOwn(TRAIN_CATEGORIES[k].goals, d.goal)) || 'general';
  if (!Object.hasOwn(TRAIN_GOALS, d.goal)) d.goal = 'general';
  if (!Object.hasOwn(goalsInCategory(d.category), d.goal)) d.category = Object.keys(TRAIN_CATEGORIES).find(k => Object.hasOwn(TRAIN_CATEGORIES[k].goals, d.goal)) || 'general';
  if (!TRAIN_LEVELS.some(([key]) => key === d.level)) d.level = 'beginner';
  if (!['yes', 'no'].includes(d.access)) d.access = 'no';
  if (!['none', 'home', 'gym'].includes(d.equipment)) d.equipment = 'none';
  if (!['none', 'regularity', 'protein', 'fiber'].includes(d.nutritionFocus)) d.nutritionFocus = 'none';
  if (!['none', 'guideline', 'custom'].includes(d.activityGoal)) d.activityGoal = 'none';
  d.weeklyActivityMinutes = Math.max(1, Math.min(2000, Number(d.weeklyActivityMinutes) || 150));
  if (typeof d.eventDate !== 'string') d.eventDate = '';
  if (typeof d.eventName !== 'string') d.eventName = '';
  d.comfortableRunKm = Math.max(0, Math.min(100, Number(d.comfortableRunKm) || 0));
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
  if (p.category === 'events') {
    if (p.goal !== 'hyrox') h += '<label class="fld"><span>Wat loop je nu comfortabel als langste afstand? (km)</span><input type="number" min="0" max="100" step="0.5" value="' + esc(p.comfortableRunKm) + '" data-chg="trainingField" data-f="comfortableRunKm"><small class="muted">Gebruik 0 als je nu nog niet loopt. Dit helpt de basisweek af te stemmen, maar voorspelt geen wedstrijdklaarheid.</small></label>';
    if (p.goal === 'race') h += '<label class="fld"><span>Welke hardloopwedstrijd wil je doen?</span><input type="text" maxlength="80" value="' + esc(p.eventName) + '" data-chg="trainingField" data-f="eventName" placeholder="Bijvoorbeeld trailrun of obstacle run"><small class="muted">Voor andere sporten dan hardlopen is dit basisplan niet geschikt.</small></label>';
    h += '<label class="fld"><span>Wedstrijddatum (optioneel)</span><input type="date" value="' + esc(p.eventDate) + '" data-chg="trainingField" data-f="eventDate"><small class="muted">De datum helpt de resterende tijd te tonen; deze planner maakt nog geen volledige periodisering of taper.</small></label>';
  }
  h += '<button class="btn big" data-act="generateTrainingPlan">Maak mijn weekindeling</button></div>';
  if (p.generated) h += renderGeneratedTraining(p.generated);
  if (p.category === 'events') {
    const weeks = eventWeeksLeft(p.eventDate);
    h += '<div class="card note"><b>Wedstrijdvoorbereiding: basisfase.</b><p class="small">Deze planner geeft een doelgerichte basisweek en houdt geen rekening met je actuele loopvolume, blessures of wedstrijdregels. Er is nog geen volledige periodisering, pacing of taper. HYROX combineert 8 × 1 km lopen met 8 workouts; de planner maakt geen volledige race-simulatie. Voor professionele voorbereiding of een naderende wedstrijd: werk met een gekwalificeerde coach.</p>' + (weeks !== null ? '<p class="small">Nog ' + (weeks < 0 ? '0' : weeks) + ' weken tot de gekozen datum. Dit zegt op zichzelf niets over wedstrijdklaarheid.</p>' : '') + '</div>';
  }
  view().innerHTML = h;
}
function renderGeneratedTraining(g) {
  const sessions = (g.sessions || []).map(s => '<div class="card"><h3>' + esc(s.day) + ' · ' + esc(s.title) + '</h3><p>' + esc(s.detail) + '</p><p class="muted small">' + g.minutes + ' min · ' + esc(s.effort) + '</p></div>').join('');
  const focus = { regularity: 'Kies een eetmoment dat vaak wegvalt en maak daar een haalbare routine van.', protein: 'Voeg bij een of meer maaltijden een eiwitbron toe die je graag eet.', fiber: 'Voeg geleidelijk een vezelrijke keuze toe, zoals fruit, groente, volkoren of peulvruchten.' }[g.nutritionFocus];
  const activityGoal = g.activityGoal === 'guideline' ? 'Voor volwassenen is een richtpunt 150–300 minuten matig intensieve beweging per week (of 75–150 minuten intensief), plus spierversterkende activiteit op minstens 2 dagen. Bouw hier rustig naartoe; wandelen en fietsen tellen ook mee.' : g.activityGoal === 'custom' ? 'Jouw gekozen beweegdoel: ' + g.weeklyActivityMinutes + ' minuten per week. Wandelen en fietsen tellen mee; pas het doel aan als herstel of omstandigheden daarom vragen.' : '';
  const levels = Object.fromEntries(TRAIN_LEVELS.map(([key, label]) => [key, label.toLowerCase()]));
  const place = g.access === 'yes' ? 'met toegang tot fitness' : 'zonder fitness';
  const timing = { any: 'geen tijdsvoorkeur', morning: 'bij voorkeur in de ochtend', afternoon: 'bij voorkeur in de middag', evening: 'bij voorkeur in de avond' }[g.timeOfDay] || 'geen tijdsvoorkeur';
  return '<h2 class="sec">Jouw weekindeling</h2><div class="card"><p><b>' + esc((g.goal === 'race' && g.eventName) ? g.eventName : TRAIN_GOALS[g.goal] || TRAIN_GOALS.general) + '</b> · ' + esc(levels[g.level] || 'beginner') + ' · ' + g.sessions.length + ' trainingen</p><p class="muted small">' + g.sessions.length * g.minutes + ' minuten gepland deze week · ' + place + ' · ' + timing + '. Herhaal deze basisweek en verhoog de belasting pas geleidelijk wanneer het goed voelt. Pas dagen aan als je agenda verandert.</p></div>' + sessions + (focus ? '<div class="card"><h3>Optionele voedingsfocus</h3><p>' + focus + '</p></div>' : '') + (activityGoal ? '<div class="card"><h3>Optioneel beweegdoel</h3><p>' + activityGoal + '</p></div>' : '');
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
  const value = ['minutes', 'weeklyActivityMinutes', 'comfortableRunKm'].includes(f) ? Number(el.value) : el.value;
  if (f === 'minutes' && (!Number.isFinite(value) || value < 15 || value > 180)) { el.value = p.minutes; toast('Kies een trainingsduur tussen 15 en 180 minuten.'); return; }
  if (f === 'comfortableRunKm' && (!Number.isFinite(value) || value < 0 || value > 100)) { el.value = p.comfortableRunKm; toast('Kies een afstand tussen 0 en 100 kilometer.'); return; }
  if (f === 'category') { p.category = value; p.goal = Object.keys(goalsInCategory(value))[0]; p.days = p.days.slice(0, maxTrainingDays(p)); p.generated = null; save(); renderTrainingPlan(); return; }
  if (f === 'eventDate' && value) {
    const weeks = eventWeeksLeft(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || weeks === null || weeks < 0) { el.value = p.eventDate || ''; toast('Kies een datum vanaf vandaag.'); return; }
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
  const labels = Object.fromEntries(TRAIN_DAYS);
  const sessions = p.days.map((key, i) => trainingSession(p, i, labels[key]));
  p.generated = { category: p.category, goal: p.goal, level: p.level, access: p.access, timeOfDay: p.timeOfDay, minutes: p.minutes, nutritionFocus: p.nutritionFocus, activityGoal: p.activityGoal, weeklyActivityMinutes: p.weeklyActivityMinutes, eventDate: p.eventDate, eventName: p.eventName, comfortableRunKm: p.comfortableRunKm, sessions };
  save(); renderTrainingPlan();
};
