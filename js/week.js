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
  if (isNum(cur.weight)) notes.push(tr('Gewicht: weekgemiddelde') + ' ' + fmtNum(cur.weight, 1) + ' kg · ' + cur.weighings + ' ' + tr('metingen') + (isNum(prev.weight) ? ' (' + tr('vorige week') + ' ' + fmtNum(prev.weight, 1) + ' kg)' : '') + '.');
  notes.push(tr('Registratie:') + ' ' + cur.complete + ' ' + tr('van de 7 dagen volledig') + (cur.complete >= 6 ? ', ' + tr('sterk!') : '.'));
  if (cur.acts) notes.push(cur.acts + ' ' + tr(cur.acts > 1 ? 'extra activiteiten gelogd.' : 'extra activiteit gelogd.'));
  if (cur.alcoholTotal) notes.push(cur.alcoholTotal + ' ' + tr('glazen alcohol deze week.') );
  if (cur.best) notes.push(tr('Beste dag:') + ' ' + fmtDay(cur.best.k, true) + ' (' + tr('stemming') + ' ' + cur.best.v + '/10).');
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
  return '<a class="card fb wk" href="#/week"><b>' + tr('Je weekrapport staat klaar') + '</b><p class="small">' + tr('Hoe was je week tegenover de vorige? Kcal, eiwit, slaap, stemming, beweging en wat opvalt.') + '</p></a>';
}

/* ---------- experimenten ---------- */
const EXPERIMENT_FOCI = [
  ['weight', 'Afvallen / gezondere gewoontes'], ['strength', 'Kracht / spiermassa'],
  ['endurance', 'Lopen / conditie / wedstrijd'], ['wellbeing', 'Stemming / slaap'], ['habits', 'Gewoontes / nicotine']
];
const EXPERIMENTS = [
  { id: 'eiwitontbijt', title: 'Eiwitbron bij het ontbijt', do: 'Voeg een eiwitbron toe die je graag eet, zoals ei, yoghurt of bonen.', q: 'Had je bij het ontbijt een eiwitbron?', m: ['hungerEve', 'eveKcal', 'energy'], groups: ['weight', 'strength', 'endurance', 'habits'] },
  { id: 'snack16', title: 'Gepland tussendoortje', do: 'Kies vooraf een tussendoortje dat bij je honger en dagplanning past.', q: 'Had je het geplande tussendoortje?', m: ['hungerEve', 'hungerDinner', 'eveKcal'], groups: ['weight', 'strength', 'endurance', 'wellbeing'] },
  { id: 'lunch', title: 'Een haalbare lunchpauze', do: 'Plan een lunchpauze die ook op drukke dagen haalbaar is; maak de maaltijd passend voor jou.', q: 'Heb je vandaag een lunchpauze genomen?', m: ['hungerEve', 'eveKcal', 'mood'], groups: ['weight', 'strength', 'endurance', 'wellbeing', 'habits'] },
  { id: 'koffie14', title: 'Cafeïne vroeger op de dag', do: 'Als cafeïne je slaap lijkt te beïnvloeden, probeer dan je laatste koffie of energiedrank wat vroeger te nemen.', q: 'Heb je cafeïne alleen op het tijdstip gebruikt dat je had gekozen?', m: ['sleepH', 'energy', 'mood'], groups: ['weight', 'strength', 'endurance', 'wellbeing', 'habits'], lagSleep: true },
  { id: 'wandel', title: 'Korte wandeling na een maaltijd', do: 'Wandel na één maaltijd kort op een tempo dat voor jou prettig voelt.', q: 'Ben je na die maaltijd kort gaan wandelen?', m: ['steps', 'hungerEve', 'mood'], groups: ['weight', 'endurance', 'wellbeing', 'habits'] },
  { id: 'water', title: 'Water bij de lunch', do: 'Zet water klaar bij je lunch. Je hoeft geen vast aantal liters te halen.', q: 'Had je water bij de lunch klaargezet?', m: ['energy', 'hungerEve', 'mood'], groups: ['weight', 'strength', 'endurance', 'wellbeing', 'habits'] },
  { id: 'cpap', title: 'CPAP volgens afspraak gebruiken', do: 'Volg het gebruik zoals je met je slaapteam hebt afgesproken; pas instellingen niet zelf aan.', q: 'Heb je CPAP gebruikt zoals afgesproken?', m: ['energy', 'mood', 'steps'], groups: ['wellbeing'], requiresCpap: true },
  { id: 'scherm', title: 'Rustige schermvrije afsluiting', do: 'Probeer het laatste halfuur voor bed zonder telefoon of laptop af te sluiten, als dat voor jou haalbaar is.', q: 'Was het laatste halfuur voor bed schermvrij?', m: ['sleepH', 'energy'], groups: ['strength', 'endurance', 'wellbeing', 'habits'], lagSleep: true },
  { id: 'keuken', title: 'Bewuste avondkeuze', do: 'Als je na het avondeten nog honger hebt, kies dan bewust iets dat bij je past. Je hoeft eten niet te verbieden.', q: 'Heb je na het avondeten gekozen op basis van je honger?', m: ['hungerEve', 'eveKcal', 'sleepH'], groups: ['weight', 'strength', 'wellbeing', 'habits'] },
  { id: 'groenteLunch', title: 'Groente of fruit bij de lunch', do: 'Voeg bij de lunch groente of fruit toe dat je lekker vindt; vers, diepvries of uit blik kan ook.', q: 'Had je vandaag groente of fruit bij de lunch?', m: ['fiber', 'energy', 'mood'], groups: ['weight', 'strength', 'endurance', 'habits'] },
  { id: 'frisdrank', title: 'Eén zoete drank vervangen', do: 'Als je normaal frisdrank met suiker drinkt, vervang dan één portie door water of ongezoete thee.', q: 'Heb je één zoete drank vervangen door water of ongezoete thee?', m: ['eveKcal', 'energy', 'mood'], groups: ['weight', 'wellbeing', 'habits'], requiresSoftDrink: true },
  { id: 'snackOpBord', title: 'Tussendoortje bewust klaarzetten', do: 'Leg je gekozen tussendoortje op een bordje of in een kommetje en eet zittend als dat lukt.', q: 'Heb je je tussendoortje vooraf klaargezet?', m: ['hungerEve', 'eveKcal'], groups: ['weight', 'wellbeing', 'habits'] },
  { id: 'nicotineTrigger', title: 'Nicotine-moment herkennen', do: 'Noteer voor jezelf wat er gebeurde vlak vóór een nicotine-moment. Als je wilt stoppen of minderen, kan je huisarts of apotheker je helpen met passende steun.', q: 'Heb je vandaag één situatie vóór nicotinegebruik opgemerkt?', m: ['mood', 'stress', 'sleepH'], groups: ['wellbeing', 'habits'], requiresNicotine: true },
  { id: 'pauzeBuiten', title: 'Korte pauze buiten', do: 'Neem op een druk moment een paar minuten buitenlucht, als dat praktisch en prettig is.', q: 'Heb je vandaag een korte pauze buiten genomen?', m: ['mood', 'stress', 'steps'], groups: ['wellbeing', 'habits'] },
  { id: 'herstel', title: 'Herstel na training plannen', do: 'Plan na een stevige training ruimte voor herstel; schuif een sessie door als je nog duidelijk vermoeid bent.', q: 'Heb je vandaag je geplande herstelmoment genomen?', m: ['energy', 'sleepH', 'mood'], groups: ['strength', 'endurance'] },
  { id: 'trainingKlaar', title: 'Trainingsmateriaal vooraf klaarleggen', do: 'Leg je schoenen, kleding of materiaal klaar op het moment dat jou het beste uitkomt.', q: 'Had je je materiaal vooraf klaargelegd?', m: ['steps', 'energy', 'mood'], groups: ['strength', 'endurance', 'habits'] },
  { id: 'maaltijdritme', title: 'Een passend maaltijdritme', do: 'Kies voor drukke dagen één of twee eetmomenten die je vooraf eenvoudig kunt plannen. Sla geen maaltijd over als je daardoor later juist meer honger krijgt.', q: 'Heb je je geplande eetmomenten kunnen volgen?', m: ['hungerEve', 'eveKcal', 'energy'], groups: ['weight', 'wellbeing', 'habits'] },
  { id: 'zoeteDrank', title: 'Zoete drank bewust kiezen', do: 'Kies op één vast moment bewust tussen je gebruikelijke zoete drank en een alternatief dat je lekker vindt. Geen verbod; kijk wat haalbaar is.', q: 'Heb je op dat moment bewust gekozen?', m: ['mood', 'energy', 'hungerEve'], groups: ['weight', 'habits'], requiresSoftDrink: true },
  { id: 'snoepMoment', title: 'Zoetigheid zonder autopiloot', do: 'Als je zoetigheid neemt, schep dan een portie in een kommetje en eet die met aandacht. Je hoeft niets te compenseren.', q: 'Heb je je portie bewust klaargezet?', m: ['mood', 'hungerEve', 'eveKcal'], groups: ['weight', 'wellbeing', 'habits'], requiresSweets: true },
  { id: 'nicotineAlternatief', title: 'Een nicotine-trigger anders opvangen', do: 'Kies één terugkerend moment en bedenk vooraf een alternatief dat voor jou werkt, zoals even naar buiten gaan of iemand berichten. Je bepaalt zelf of minderen je doel is.', q: 'Heb je je gekozen alternatief geprobeerd?', m: ['mood', 'stress', 'sleepH'], groups: ['wellbeing', 'habits'], requiresNicotine: true },
  { id: 'krachtTechniek', title: 'Eén krachtoefening technisch oefenen', do: 'Kies één oefening uit je huidige schema. Oefen met een comfortabele belasting en let op een beheerste, pijnvrije uitvoering; voeg deze week geen extra gewicht toe.', q: 'Heb je de oefening beheerst uitgevoerd?', m: ['energy', 'mood'], groups: ['strength'] },
  { id: 'krachtLog', title: 'Je trainingsherhalingen noteren', do: 'Noteer na één geplande krachttraining de oefening, sets en herhalingen. Verhoog pas later iets als techniek en herstel goed blijven.', q: 'Heb je je sets en herhalingen genoteerd?', m: ['energy', 'mood'], groups: ['strength'] },
  { id: 'praattempo', title: 'Een rustige loop op praattempo', do: 'Houd één rustige looptraining zo makkelijk dat je nog in korte zinnen kunt praten. Vertraag of wandel als dat niet lukt.', q: 'Bleef je looptraining grotendeels op praattempo?', m: ['energy', 'sleepH', 'mood'], groups: ['endurance'] },
  { id: 'stemmingContext', title: 'Stemming naast je dagcontext bekijken', do: 'Noteer bij je stemming één neutraal contextpunt, bijvoorbeeld slaap, werkdruk of beweging. Zoek naar patronen over meerdere dagen; één dag bewijst geen oorzaak.', q: 'Heb je een contextpunt bij je stemming genoteerd?', m: ['mood', 'stress', 'sleepH'], groups: ['wellbeing'] },
  { id: 'stapmoment', title: 'Een vast beweegmoment kiezen', do: 'Koppel een korte wandeling aan iets dat al in je dag zit, zoals na de lunch of tijdens een telefoontje. Kies een duur die haalbaar voelt.', q: 'Heb je je gekozen beweegmoment gedaan?', m: ['steps', 'mood', 'energy'], groups: ['weight', 'endurance', 'habits'] }
];
function defaultExperimentFocus() {
  const explicit = DB.settings.experimentFocus;
  if (EXPERIMENT_FOCI.some(([key]) => key === explicit)) return explicit;
  const goal = (DB.training || {}).goal || 'weight';
  if (goal === 'weight') return 'weight';
  if (['strength', 'muscle'].includes(goal)) return 'strength';
  if (['runStart', 'run5k', 'race5k', 'race10k', 'half', 'marathon', 'race', 'hyrox', 'interval'].includes(goal)) return 'endurance';
  if (DB.settings.homeFocus === 'wellbeing' || DB.settings.moodInsights) return 'wellbeing';
  return 'habits';
}
function experimentFits(E) {
  if (!E.groups.includes(defaultExperimentFocus())) return false;
  const days = Object.values(DB.days || {});
  if (E.requiresCpap && !days.some(d => d && d.cpap)) return false;
  if (E.requiresSoftDrink && !days.some(d => d && isNum(d.softDrinkServings) && d.softDrinkServings > 0)) return false;
  if (E.requiresSweets && !days.some(d => d && isNum(d.sweetsServings) && d.sweetsServings > 0)) return false;
  if (E.requiresNicotine && !days.some(d => d && (Array.isArray(d.nicotineForms) ? d.nicotineForms.some(f => ['cigarette', 'vape', 'nicotinePouch', 'heatedTobacco', 'otherNicotine'].includes(f)) : ['paar keer', 'om de 3 u', 'om de 2 u', 'elk uur'].includes(d.vape)))) return false;
  return true;
}
ACT.setExperimentFocus = el => { DB.settings.experimentFocus = el.value; save(); renderExperiments(); };
function renderExperiments() {
  DB.experiments = DB.experiments || [];
  const act = DB.experiments.find(e => !e.closed);
  let h = header('Experimenten', 'Probeer één ding een week en zie wat het doet', true);
  if (act) {
    const E = EXPERIMENTS.find(x => x.id === act.id);
    const endK = addDays(act.start, act.days - 1);
    const doneDays = Object.values(act.log || {}).filter(v => v === true).length;
    h += '<div class="card fb"><b>' + tr('Bezig:') + ' ' + esc(tr(E.title)) + '</b><p class="small">' + esc(tr(E.do)) + '</p><p class="small muted">' + fmtDay(act.start) + ' – ' + fmtDay(endK) + ' · ' + trf('{done} van de {total} dagen gelukt. Je antwoordt elke avond bij de dagopname.', { done: doneDays, total: act.days }) + '</p>' +
      (todayKey() > endK ? '<button class="btn" data-act="expClose">' + tr('Bekijk resultaat') + '</button>' : '<button class="link danger" data-act="expStop">' + tr('Stoppen') + '</button>') + '</div>';
  }
  const done = DB.experiments.filter(e => e.closed);
  if (done.length) h += '<h2 class="sec">' + tr('Resultaten') + '</h2>' + done.slice().reverse().map(e => '<div class="card"><b>' + esc(tr((EXPERIMENTS.find(x => x.id === e.id) || {}).title || e.id)) + '</b><small class="muted"> · ' + fmtDay(e.start) + '</small>' + expResultHtml(e) + '</div>').join('');
  if (!act) {
    h += '<div class="card"><label class="fld"><span>' + tr('Welke focus past nu bij je?') + '</span><select data-chg="setExperimentFocus">' + EXPERIMENT_FOCI.map(([key, label]) => '<option value="' + key + '"' + (defaultExperimentFocus() === key ? ' selected' : '') + '>' + tr(label) + '</option>').join('') + '</select></label><p class="muted small">' + tr('De suggesties volgen je focus en recente registraties. Je kan de focus op elk moment wijzigen.') + '</p></div>';
    h += '<h2 class="sec">' + tr('Kies een experiment') + '</h2><p class="muted small">' + tr('De app vergelijkt de dagen waarop het lukte met je twee weken ervoor. Eén experiment tegelijk, zo blijft het meetbaar.') + '</p>';
    const choices = EXPERIMENTS.filter(experimentFits);
    h += choices.length ? choices.map(E => '<div class="card"><b>' + esc(tr(E.title)) + '</b><p class="small">' + esc(tr(E.do)) + '</p><small class="muted">' + tr('Meet:') + ' ' + E.m.map(x => tr(DVARS[x].l)).join(', ') + '</small><div><button class="btn ghost" data-act="expStart" data-id="' + E.id + '">' + tr('Start 7 dagen') + '</button></div></div>').join('') : '<div class="card note"><b>' + tr('Nog geen passende experimenten') + '</b><p class="small">' + tr('Er zijn nog geen bijpassende gewoonteregistraties om hier een persoonlijk experiment voor te tonen.') + '</p></div>';
  }
  view().innerHTML = h;
}
ACT.expStart = el => { DB.experiments = DB.experiments || []; DB.experiments.push({ id: el.dataset.id, start: todayKey(), days: 7, log: {} }); save(); toast(tr('Gestart. Elke avond vraagt de dagopname of het gelukt is.')); render(); };
ACT.expStop = () => { const a = DB.experiments.find(e => !e.closed); if (!confirm(tr('Experiment stoppen?'))) return; a.closed = true; a.stopped = true; save(); render(); };
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
  if (e.stopped) return '<p class="small muted">' + tr('Vroegtijdig gestopt.') + '</p>';
  const r = expResult(e);
  if (!r[0].n) return '<p class="small muted">' + tr('Geen dagen als gelukt aangeduid.') + '</p>';
  return '<div class="table small">' + r.map(x => '<div class="tr"><span>' + tr(DVARS[x.name].l) + '</span><b>' + (isNum(x.a) ? fmtV(x.name, x.a) : '–') + '</b><small class="muted" style="width:auto">' + tr('ervoor') + ' ' + (isNum(x.b) ? fmtV(x.name, x.b) : '–') + '</small></div>').join('') + '</div><p class="small muted">' + trf('Op {count} geslaagde dagen. Met zo weinig dagen is dit een eerste aanwijzing, geen bewijs.', { count: r[0].n }) + '</p>';
}
/* Vraag in de dagopname */
function expQuestionHtml() {
  const a = (DB.experiments || []).find(e => !e.closed);
  if (!a || CI.k < a.start || CI.k > addDays(a.start, a.days - 1)) return '';
  const E = EXPERIMENTS.find(x => x.id === a.id), v = (a.log || {})[CI.k];
  return '<div class="card fb"><h3>' + tr('Experiment:') + ' ' + esc(tr(E.title)) + '</h3><div class="fld"><span>' + esc(tr(E.q)) + '</span><div class="chips"><button class="chip ' + (v === true ? 'on' : '') + '" data-act="expLog" data-v="1">' + tr('ja') + '</button><button class="chip ' + (v === false ? 'on' : '') + '" data-act="expLog" data-v="0">' + tr('nee') + '</button></div></div></div>';
}
ACT.expLog = el => { const a = DB.experiments.find(e => !e.closed); a.log = a.log || {}; a.log[CI.k] = el.dataset.v === '1'; save(); rerenderCI(); };
