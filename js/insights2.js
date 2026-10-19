/* Uitgebreide analyses: eetritme, eiwitverdeling, weekend, reeksen, honger,
   en een wisselende tip van de dag.
   Alles offline en op basis van je eigen gegevens. Verbanden zijn geen oorzaken. */
'use strict';

const VAPE_NUM = { 'niet': 0, 'paar keer': 1, 'om de 3 u': 2, 'om de 2 u': 3, 'elk uur': 4 };
/* Afgeleide dagwaarden die in analyses gebruikt worden. */
const DVARS = {
  sleepH: { l: 'slaap', u: 'u', d: 1, f: d => isNum(d.sleepH) ? d.sleepH : null },
  steps: { l: 'stappen', u: '', d: 0, f: d => isNum(d.steps) ? d.steps : null },
  burn: { l: 'beweging', u: 'kcal', d: 0, f: (d, k) => dayBurn(d, k) },
  kcal: { l: 'kcal', u: 'kcal', d: 0, f: d => { const r = dayNutr(d, 'kcal'); return r && !r.lb ? r.v : null; } },
  protein: { l: 'eiwit', u: 'g', d: 0, f: d => { const r = dayNutr(d, 'protein'); return r && !r.lb ? r.v : null; } },
  fiber: { l: 'vezels', u: 'g', d: 0, f: d => { const r = dayNutr(d, 'fiber'); return r && !r.lb ? r.v : null; } },
  water: { l: 'water', u: 'l', d: 1, f: d => isNum(d.waterMl) ? d.waterMl / 1000 : null },
  caffeine: { l: 'cafeïne', u: 'shots', d: 1, f: d => isNum(d.caffeine) ? d.caffeine : null },
  alcohol: { l: 'alcohol', u: 'glazen', d: 1, f: d => isNum(d.alcohol) ? d.alcohol : null },
  vape: { l: 'vapen', u: '', d: 1, f: d => d.vape in VAPE_NUM ? VAPE_NUM[d.vape] : null },
  dayKcal: { l: 'kcal vóór het avondeten', u: 'kcal', d: 0, f: d => hasMeals(d) ? slotKcal(d, ['ontbijt', 'tussen1', 'lunch', 'tussen2']) : null },
  eveKcal: { l: 'kcal vanaf het avondeten', u: 'kcal', d: 0, f: d => hasMeals(d) ? slotKcal(d, ['avond', 'na']) : null },
  hungerEve: { l: 'trek \'s avonds', u: '/5', d: 1, f: d => d.hunger && isNum(d.hunger.na) ? d.hunger.na : null },
  hungerDinner: { l: 'honger vóór het avondeten', u: '/5', d: 1, f: d => d.hunger && isNum(d.hunger.avond) ? d.hunger.avond : null },
  energy: { l: 'energie', u: '/10', d: 1, f: d => isNum(d.energy) ? d.energy : null },
  mood: { l: 'stemming', u: '/10', d: 1, f: d => isNum(d.mood) ? d.mood : null }
};
function hasMeals(d) { return (d.meals || []).some(m => isNum(m.kcal)) && !d.kcalOverride; }
function dv(name, k) { const d = DB.days[k]; return d ? DVARS[name].f(d, k) : null; }
function sd(a) { const m = avg(a); return a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) : 0; }
function fmtV(name, v) { const D = DVARS[name]; return fmtNum(v, D.d) + (D.u ? ' ' + D.u : ''); }
function minutesOf(t) { if (!t || !/^\d\d:\d\d$/.test(t)) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; }

function moreInsights(n, recent, add) {
  const keys = recent.map(x => x.k);
  const moodEnabled = DB.settings.moodInsights === true;

  /* Week tegenover weekend */
  const wk = keys.filter(k => [1, 2, 3, 4, 5].includes(parseKey(k).getDay())), we = keys.filter(k => [0, 6].includes(parseKey(k).getDay()));
  if (wk.length >= 4 && we.length >= 2) {
    const parts = [];
    for (const name of ['kcal', 'steps', 'sleepH', ...(moodEnabled ? ['mood'] : []), 'alcohol']) {
      const a = avg(wk.map(k => dv(name, k)).filter(isNum)), b = avg(we.map(k => dv(name, k)).filter(isNum));
      if (isNum(a) && isNum(b) && Math.abs(a - b) / (Math.max(Math.abs(a), Math.abs(b)) || 1) > 0.12) parts.push(DVARS[name].l + ' ' + fmtV(name, a) + ' in de week, ' + fmtV(name, b) + ' in het weekend');
    }
    if (parts.length) add('ritme', 'Week tegenover weekend', parts.join('; ') + '.', wk.length + ' + ' + we.length + ' dagen', 'info');
  }

  /* 4. Eetritme: eerste maaltijd, langste pauze, overgeslagen lunch */
  const gaps = [], firsts = [];
  let skipped = 0, skippedEve = [], normalEve = [];
  for (const x of recent) {
    const ms = (x.d.meals || []).filter(m => !m.nothing && minutesOf(m.time) !== null).map(m => minutesOf(m.time)).sort((a, b) => a - b);
    if (ms.length >= 2) { firsts.push(ms[0]); let g = 0; for (let i = 1; i < ms.length; i++) g = Math.max(g, ms[i] - ms[i - 1]); gaps.push(g); }
    const lunchNothing = (x.d.meals || []).some(m => m.slot === 'lunch' && m.nothing) || ((x.d.meals || []).length >= 2 && !(x.d.meals || []).some(m => m.slot === 'lunch'));
    const ev = dv('eveKcal', x.k);
    if (lunchNothing) { skipped++; if (isNum(ev)) skippedEve.push(ev); } else if (isNum(ev)) normalEve.push(ev);
  }
  if (gaps.length >= 4) {
    const g = avg(gaps), long = gaps.filter(x => x >= 360).length;
    add('ritme', 'Je eetritme', 'Je eerste maaltijd valt gemiddeld om ' + pad(Math.floor(avg(firsts) / 60)) + ':' + pad(Math.round(avg(firsts) % 60)) + '. De langste pauze tussen twee eetmomenten is gemiddeld ' + fmtNum(g / 60, 1) + ' u' + (long ? '; op ' + long + ' dagen 6 u of langer' : '') + '. Wil je weten of dit voor jou uitmaakt? Noteer een week lang ook je honger en test één gepland eetmoment op dagen met een lange pauze. Dit patroon toont samenhang, geen oorzaak.', gaps.length + ' dagen met tijden', long ? 'tip' : 'info');
  }
  if (skipped >= 2 && skippedEve.length >= 1 && normalEve.length >= 2) {
    add('ritme', 'Als de lunch wegvalt', 'Op ' + skipped + ' dagen viel de lunch weg. Op die dagen at je vanaf het avondeten gemiddeld ' + fmtNum(avg(skippedEve)) + ' kcal, tegenover ' + fmtNum(avg(normalEve)) + ' kcal op dagen mét lunch.', skipped + ' dagen', avg(skippedEve) > avg(normalEve) * 1.15 ? 'tip' : 'info');
  }

  /* 5. Eiwit per maaltijd */
  const per = { ontbijt: [], lunch: [], avond: [] };
  for (const x of recent) for (const s of Object.keys(per)) {
    const ms = (x.d.meals || []).filter(m => m.slot === s && !m.nothing);
    if (ms.length && ms.every(m => isNum(m.protein))) per[s].push(ms.reduce((t, m) => t + m.protein, 0));
  }
  if (per.ontbijt.length >= 3) {
    const b = avg(per.ontbijt), l = avg(per.lunch), a = avg(per.avond);
    add('voeding', 'Eiwit per maaltijd', 'Ontbijt ≈ ' + fmtNum(b) + ' g' + (isNum(l) ? ', lunch ≈ ' + fmtNum(l) + ' g' : '') + (isNum(a) ? ', avondeten ≈ ' + fmtNum(a) + ' g' : '') + '. ' +
      (b < 15 ? 'In deze geregistreerde ontbijten staat weinig eiwit. Als je dat wilt veranderen, voeg een bron toe die je graag eet (bijvoorbeeld ei, yoghurt, tofu of bonen) en kijk of dit voor jou een prettigere maaltijd oplevert. Dit is geen individueel eiwitvoorschrift.' : 'Je geregistreerde ontbijt bevat gemiddeld een eiwitbron. Een goede registratie zegt nog niet alles over je totale voedingskwaliteit.'), per.ontbijt.length + ' ontbijten', b < 15 ? 'tip' : 'good');
  }

  /* 6. Mealprep-porties: lukt het om ze op te eten? */
  const portions = [];
  for (const x of recent) for (const m of x.d.meals || []) if (m.prepId && isNum(m.portion)) portions.push(m.portion);
  if (portions.length >= 4) {
    const partial = portions.filter(p => p < 0.95).length;
    if (partial / portions.length >= 0.3) add('voeding', 'Mealprep-porties', 'Bij ' + partial + ' van de ' + portions.length + ' mealprep-maaltijden at je niet de hele portie. Overweeg dezelfde hoeveelheid over één portie meer te verdelen, zodat elke portie haalbaar is en de energie gelijkmatiger binnenkomt.', portions.length + ' maaltijden', 'tip');
  }

  /* 7. Alcohol: de dag erna */
  const after = [], noAfter = [];
  for (const k of keys) { const a = dv('alcohol', k), nk = addDays(k, 1); const kc = dv('kcal', nk), st = dv('steps', nk); if (!isNum(a)) continue; (a > 0 ? after : noAfter).push({ kc, st }); }
  if (after.length >= 2 && noAfter.length >= 3) {
    const s1 = avg(after.map(x => x.st).filter(isNum)), s0 = avg(noAfter.map(x => x.st).filter(isNum));
    if (isNum(s1) && isNum(s0) && Math.abs(s1 - s0) > 800) add('activiteit', 'Stappen na alcoholregistratie', 'De dag na een dag met alcoholregistratie zette je gemiddeld ' + fmtNum(s1) + ' stappen; na een dag met expliciet nul alcohol was dit ' + fmtNum(s0) + '.', after.length + ' + ' + noAfter.length + ' dagen', 'info');
  }

  /* 8. Slaapregelmaat en korte nachten */
  const sl = keys.map(k => dv('sleepH', k)).filter(isNum);
  if (sl.length >= 5) {
    const short = sl.filter(x => x < 6).length, s = sd(sl);
    add('slaap', 'Slaapregelmaat', 'Je slaapduur schommelt met ±' + fmtNum(s, 1) + ' u (gemiddeld ' + fmtNum(avg(sl), 1) + ' u).' + (short ? ' ' + short + ' nacht' + (short > 1 ? 'en' : '') + ' korter dan 6 u.' : '') + (s > 1.2 ? ' Als je meer regelmaat wilt, probeer een week een haalbare vaste opstaantijd en kijk hoe je je voelt.' : ''), sl.length + ' nachten', s > 1.2 || short >= 2 ? 'tip' : 'good');
    const nextKcal = pairs(n, d => d.sleepH, d => DVARS.eveKcal.f(d)).filter(p => isNum(p.y));
    const sc = splitCompare(nextKcal, 6.5);
    if (sc && sc.lo > sc.hi * 1.2) add('slaap', 'Korte nacht en avondinname', 'In je registratie volgde na nachten korter dan 6,5 u gemiddeld ' + fmtNum(sc.lo) + ' kcal vanaf het avondeten, tegenover ' + fmtNum(sc.hi) + ' kcal na langere nachten. Dit kan toeval of een verschil in dagcontext zijn; het dagboek kan geen oorzaak aantonen. Kijk of een vaste maaltijdplanning op korte nachten voor jou helpt.', sc.nlo + ' + ' + sc.nhi + ' dagen', 'info');
  }

  /* 9. Honger en trek */
  const he = keys.map(k => ({ k, h: dv('hungerEve', k), day: dv('dayKcal', k) })).filter(x => isNum(x.h));
  if (he.length >= 4) {
    const high = he.filter(x => x.h >= 4), low = he.filter(x => x.h <= 2);
    let t = 'Trek \'s avonds gemiddeld ' + fmtNum(avg(he.map(x => x.h)), 1) + '/5.';
    const hd = avg(high.map(x => x.day).filter(isNum)), ld = avg(low.map(x => x.day).filter(isNum));
    if (isNum(hd) && isNum(ld)) t += ' Op avonden met veel trek registreerde je overdag ≈ ' + fmtNum(hd) + ' kcal, op rustige avonden ≈ ' + fmtNum(ld) + ' kcal. Dat kan een aanleiding zijn om je maaltijdritme te bekijken, maar bewijst geen oorzaak.';
    add('honger', 'Je avondtrek', t, he.length + ' avonden', isNum(hd) && isNum(ld) && hd < ld ? 'tip' : 'info');
  }
  const hb = keys.map(k => dv('hungerDinner', k)).filter(isNum);
  if (hb.length >= 4 && avg(hb) >= 4) add('honger', 'Veel honger voor het avondeten', 'Je noteerde gemiddeld ' + fmtNum(avg(hb), 1) + '/5 honger voor het avondeten. Als dat onprettig voelt, test dan op een paar dagen een geplande snack of iets meer bij de lunch. Kies wat past; een tussendoortje is geen verplichting.', hb.length + ' avonden', 'tip');

  /* 12. Reeksen en records */
  let streak = 0;
  for (let k = completeKey(); DB.days[k] && dayComplete(DB.days[k]); k = addDays(k, -1)) streak++;
  if (streak >= 3) add('registratie', 'Volle reeks', streak + ' dagen op rij volledig ingevuld. Hoe langer de reeks, hoe scherper de analyses.', streak + ' dagen', 'good');
  const st = keys.map(k => ({ k, v: dv('steps', k) })).filter(x => isNum(x.v));
  if (st.length >= 7) { const best = st.reduce((a, b) => b.v > a.v ? b : a); add('activiteit', 'Je record', 'Meeste stappen in deze periode: ' + fmtNum(best.v) + ' op ' + fmtDay(best.k, true) + '.', st.length + ' dagen', 'good'); }

  /* 13. Activiteiten */
  const actDays = recent.filter(x => (x.d.activities || []).length);
  if (actDays.length) {
    const types = {};
    actDays.forEach(x => x.d.activities.forEach(a => { types[a.type] = (types[a.type] || 0) + a.min; }));
    const e1 = avg(actDays.map(x => x.d.energy).filter(isNum)), e0 = avg(recent.filter(x => !(x.d.activities || []).length).map(x => x.d.energy).filter(isNum));
    add('activiteit', 'Sporten en bewegen', 'Op ' + actDays.length + ' dagen deed je iets extra: ' + Object.entries(types).map(([t, m]) => (ACTIVITIES[t] || ACTIVITIES.anders).label.toLowerCase() + ' ' + m + ' min').join(', ') + '.' + (isNum(e1) && isNum(e0) ? ' Energie op die dagen ' + fmtNum(e1, 1) + '/10, anders ' + fmtNum(e0, 1) + '/10.' : ''), actDays.length + ' dagen', 'good');
  }
}
function dayComplete(d) {
  const slots = new Set((d.meals || []).map(m => m.slot));
  return ['ontbijt', 'lunch', 'avond'].every(s => slots.has(s)) && isNum(d.mood) && isNum(d.sleepH);
}

/* Tip van de dag: wisselt dagelijks, en kiest bij voorkeur iets dat bij je cijfers past. */
/* Beweegrichtlijn voor volwassenen: https://www.cdc.gov/physical-activity-basics/guidelines/adults.html */
const TIPS = [
  { t: 'eiwit', x: 'Als je ontbijt eet, kan een eiwitbron (bv. ei, yoghurt of bonen) helpen om de maaltijd vullender te maken. Kijk wat voor jou werkt.' },
  { t: 'eiwit', x: 'Skyr, kwark en hüttenkäse kunnen eiwitrijke tussendoortjes zijn. De hoeveelheid verschilt per merk: kijk even op het etiket.' },
  { t: 'vezels', x: 'Peulvruchten (bonen, linzen, kikkererwten) leveren vezels én eiwit; een blik in je mealprep is genoeg.' },
  { t: 'vezels', x: 'Laat de schil aan aardappelen en krieltjes: dat scheelt gemakkelijk een paar gram vezels.' },
  { t: 'water', x: 'Zet bij een check-in een glas water klaar als geheugensteun. Hoeveel je nodig hebt verschilt per persoon, dag en omstandigheden.' },
  { t: 'water', x: 'Twijfel je of je dorst hebt? Neem gerust wat water. Heb je daarna nog honger, eet dan gewoon iets.' },
  { t: 'slaap', x: 'Cafeïne kan nog uren invloed hebben op je slaap, en dat verschilt per persoon. Merk je effect, probeer dan je laatste koffie wat vroeger te nemen.' },
  { t: 'slaap', x: 'Een regelmatig slaap- én opstaantijdstip kan helpen om een vaste routine op te bouwen. Kies tijden die bij je leven passen.' },
  { t: 'slaap', x: 'Een korte nacht kan bij sommige mensen de eetlust of voedselkeuzes beïnvloeden. Eet de volgende dag gewoon regelmatig; compenseren hoeft niet.' },
  { t: 'cpap', x: 'Gebruik CPAP zoals afgesproken met je zorgverlener. Het masker en de slang vooraf klaarleggen kan de avondroutine makkelijker maken.' },
  { t: 'stappen', x: 'Een wandeling na een maaltijd telt mee als beweging. Tien minuten is al een haalbaar begin; je hoeft niet meteen een lange wandeling te doen.' },
  { t: 'stappen', x: 'Bellen? Doe het rechtstaand of al wandelend. Kleine stukjes tellen op.' },
  { t: 'avond', x: 'Avondtrek bouwt zich op overdag. Kijk eerder naar je ontbijt en lunch dan naar wilskracht om 22 u.' },
  { t: 'avond', x: 'Zin in iets na het avondeten? Kies vooraf wat het mag zijn (bv. skyr met fruit), zodat het geen impuls wordt.' },
  { t: 'avond', x: 'Een vast "keuken dicht"-moment, bv. tanden poetsen na het avondeten, helpt bij late trek.' },
  { t: 'mealprep', x: 'Zijn je porties moeilijk op te eten? Verdeel dezelfde pot over één portie meer; zo blijft elke maaltijd haalbaar.' },
  { t: 'mealprep', x: 'Bewaar saus apart van rijst of pasta; zo blijft je mealprep lekkerder tot dag 4.' },
  { t: 'mealprep', x: 'Wissel elke week minstens één prep. Variatie maakt het makkelijker om vol te houden.' },
  { t: 'alcohol', x: 'Water tussendoor kan helpen om je vocht aan te vullen, maar voorkomt geen kater. Minder alcohol drinken verlaagt de blootstelling.' },
  { t: 'alcohol', x: 'Ga niet op een lege maag drinken. Een maaltijd vooraf kan helpen om niet tegelijk met alcohol ook met flinke honger te starten.' },
  { t: 'stemming', x: 'Op zware werkdagen helpt een vaste pauze buiten (5 minuten) meer dan je denkt.' },
  { t: 'stemming', x: 'Noteer bij je dagopname kort waarom je je zo voelt. Na een paar weken zie je zelf de patronen.' },
  { t: 'registratie', x: 'Weet je iets niet meer? Kies gerust "onbekend". Eerlijk onbekend is beter dan een gok.' },
  { t: 'registratie', x: 'Foto van je bord in je galerij? Dat helpt om later een maaltijd juist in te vullen.' },
  { t: 'gewicht', x: 'Gewicht schommelt 1–2 kg per dag door vocht en zout. Kijk naar het weekgemiddelde, niet naar één ochtend.' },
  { t: 'beweging', x: 'Voor volwassenen is een richtpunt 150 minuten matig intensieve beweging per week (of 75 minuten intensief), plus spierversterkende activiteit op minstens 2 dagen. Bouw daar rustig naartoe.' },
  { t: 'beweging', x: 'Korte beweegmomenten tellen op. Verdeel je beweging gerust over de week en begin met iets dat in je agenda past.' },
  { t: 'beweging', x: 'Begin je met krachttraining? Start licht en verhoog het gewicht, de herhalingen of de moeilijkheid pas geleidelijk als de oefening goed blijft voelen.' },
  { t: 'beweging', x: 'Een haalbaar schema bevat ook ruimte voor herstel. Je hoeft een gemiste training niet in te halen door de volgende sessie extra zwaar te maken.' },
  { t: 'beweging', x: 'Bij een rustige duurloop moet je nog in korte zinnen kunnen praten. Wordt dat lastig, vertraag dan of neem een wandelpauze.' },
  { t: 'beweging', x: 'Verhoog je loopafstand, snelheid of aantal loopdagen stap voor stap. Verander liever één trainingsprikkel tegelijk en kijk hoe je herstelt.' },
  { t: 'beweging', x: 'Bij HYROX wisselt 1 km lopen steeds af met een workoutstation; oefen de bewegingen technisch en controleer de actuele gewichten voor jouw divisie.' },
  { t: 'beweging', x: 'Je hoeft een HYROX-training niet telkens als volledige wedstrijd te doen. Rustige loopblokken, techniek en herstel horen ook bij de voorbereiding.' },
  { t: 'beweging', x: 'Meer bewegen hoeft niet meteen sporten te betekenen: wandelen, fietsen en actief tuinieren tellen ook mee.' },
  { t: 'stemming', x: 'Maak een gewoonte concreet: kies vooraf wanneer en waar je een korte wandeling of training doet. Een kleine afspraak is makkelijker te herhalen.' },
  { t: 'gewicht', x: 'Een losse weging zegt weinig over de trend. Als wegen voor jou passend is, vergelijk dan metingen onder gelijkaardige omstandigheden en kijk naar meerdere weken.' },
  { t: 'registratie', x: 'Een onvolledige dag is nog altijd bruikbare informatie. Vul in wat je weet en laat de rest onbekend.' },
  { t: 'vapen', x: 'Merk je dat je meer vapet op drukke dagen? Noteer kort wat eraan voorafging; zo ontdek je welke momenten of situaties je triggeren.' }
];
/* Parallel to TIPS: localized copy keeps the selected, data-relevant tip in the chosen app language. */
const TIP_TRANSLATIONS = {
  'en-GB': [
    'If you eat breakfast, adding a protein source such as eggs, yoghurt or beans may make the meal more filling. See what works for you.',
    'Skyr, quark and cottage cheese can be protein-rich snacks. Amounts vary by brand, so check the label.',
    'Pulses such as beans, lentils and chickpeas provide fibre and protein; adding a tin to a meal prep is an easy option.',
    'Leave the skin on potatoes and new potatoes for a little extra fibre.',
    'Keep a glass of water ready at check-in as a reminder. How much you need varies by person, day and circumstances.',
    'Not sure whether you are thirsty? It is fine to have some water. If you are still hungry afterwards, eat something as usual.',
    'Caffeine can affect sleep for hours, and this varies between people. If you notice an effect, try having your last coffee earlier.',
    'A regular bedtime and wake-up time can help build a routine. Choose times that fit your life.',
    'A short night may affect appetite or food choices for some people. Eat regularly the next day; there is no need to compensate.',
    'Use CPAP as agreed with your health professional. Setting out the mask and tubing beforehand may make your evening routine easier.',
    'A walk after a meal counts as activity. Ten minutes is a manageable start; you do not need to take a long walk straight away.',
    'Taking a call? Stand up or walk while you talk. Short bouts add up.',
    'Evening hunger can build during the day. Look at breakfast and lunch before blaming willpower at 10 pm.',
    'Want something after dinner? Decide in advance what you would enjoy, such as skyr with fruit, so it is a planned choice.',
    'A regular kitchen-closing cue, such as brushing your teeth after dinner, may help with late-evening cravings.',
    'Finding portions hard to finish? Split the same batch into one extra portion so each meal feels manageable.',
    'Keep sauce separate from rice or pasta to help your meal prep taste better through day four.',
    'Change at least one meal prep each week. Variety can make the routine easier to maintain.',
    'Water between alcoholic drinks may help replace fluids, but it does not prevent a hangover. Drinking less reduces alcohol exposure.',
    'Try not to start drinking on an empty stomach. Eating beforehand may help you avoid starting out both hungry and drinking.',
    'On demanding workdays, a regular five-minute break outside may help more than you expect.',
    'At your daily check-in, briefly note why you feel the way you do. After a few weeks, you may spot your own patterns.',
    'Cannot remember something? Choose “unknown”. An honest unknown is better than a guess.',
    'Have a photo of your meal in your gallery? It can help you log it accurately later.',
    'Weight can fluctuate by 1–2 kg from day to day because of fluid and salt. Look at the weekly average, not one morning.',
    'For adults, a weekly guide is 150 minutes of moderate activity (or 75 minutes vigorous activity), plus muscle-strengthening activity on at least 2 days. Build up gradually.',
    'Short activity breaks add up. Spread movement across the week and start with something that fits your schedule.',
    'New to strength training? Start light. Increase the load, repetitions or difficulty gradually only while the exercise still feels controlled.',
    'A manageable plan leaves room for recovery. You do not need to make up a missed workout by making the next one extra hard.',
    'On an easy run, you should still be able to speak in short sentences. If that becomes difficult, slow down or take a walking break.',
    'Increase running distance, speed or days gradually. Change one training factor at a time and see how you recover.',
    'HYROX alternates 1 km runs with workout stations. Practise the movements with good technique and check the current weights for your division.',
    'A HYROX training session does not need to be a full race every time. Easy running, technique and recovery are also part of preparation.',
    'Being more active does not have to mean playing a sport: walking, cycling and active gardening count too.',
    'Make a habit specific: decide in advance when and where you will take a short walk or train. A small commitment is easier to repeat.',
    'One weigh-in says little about a trend. If weighing feels right for you, compare measurements taken in similar conditions over several weeks.',
    'An incomplete day is still useful information. Log what you know and leave the rest unknown.',
    'Notice that you vape more on busy days? Briefly note what happened beforehand to spot the moments or situations that may trigger it.'
  ],
  'fr-FR': [
    'Si vous prenez un petit-déjeuner, une source de protéines comme les œufs, le yaourt ou les haricots peut le rendre plus rassasiant. Voyez ce qui vous convient.',
    'Le skyr, le fromage blanc et le cottage cheese peuvent constituer des collations riches en protéines. La quantité varie selon les marques : vérifiez l’étiquette.',
    'Les légumineuses comme les haricots, les lentilles et les pois chiches apportent des fibres et des protéines ; une boîte dans un plat préparé est une option simple.',
    'Gardez la peau des pommes de terre pour apporter un peu plus de fibres.',
    'Préparez un verre d’eau au moment du suivi pour y penser. Vos besoins varient selon les personnes, les jours et les circonstances.',
    'Vous ne savez pas si vous avez soif ? Vous pouvez boire un peu d’eau. Si vous avez encore faim ensuite, mangez normalement.',
    'La caféine peut influencer le sommeil pendant plusieurs heures, avec des effets différents selon les personnes. Si vous le remarquez, essayez de prendre votre dernier café plus tôt.',
    'Des heures régulières de coucher et de lever peuvent aider à créer une routine. Choisissez des horaires adaptés à votre vie.',
    'Chez certaines personnes, une courte nuit peut influencer l’appétit ou les choix alimentaires. Mangez régulièrement le lendemain ; inutile de compenser.',
    'Utilisez la CPAP selon les consignes de votre professionnel de santé. Préparer le masque et le tuyau à l’avance peut faciliter la routine du soir.',
    'Une marche après un repas compte comme activité physique. Dix minutes constituent déjà un début accessible ; pas besoin de faire une longue marche tout de suite.',
    'Vous téléphonez ? Levez-vous ou marchez pendant l’appel. Les petits moments s’additionnent.',
    'La faim du soir peut s’accumuler au fil de la journée. Regardez plutôt le petit-déjeuner et le déjeuner que votre volonté à 22 h.',
    'Envie de manger après le dîner ? Choisissez à l’avance ce qui vous ferait plaisir, par exemple du skyr avec des fruits, pour en faire un choix prévu.',
    'Un repère régulier pour terminer la soirée en cuisine, comme se brosser les dents après le dîner, peut aider en cas d’envie tardive.',
    'Les portions sont difficiles à finir ? Répartissez la même préparation en une portion supplémentaire pour rendre chaque repas plus facile.',
    'Gardez la sauce séparée du riz ou des pâtes pour que votre préparation reste meilleure jusqu’au quatrième jour.',
    'Changez au moins une préparation chaque semaine. La variété peut aider à garder cette habitude.',
    'Boire de l’eau entre deux boissons alcoolisées peut aider à remplacer les liquides, mais ne prévient pas la gueule de bois. Boire moins réduit l’exposition à l’alcool.',
    'Évitez de commencer à boire le ventre vide. Manger avant peut éviter de commencer à la fois en ayant faim et en buvant de l’alcool.',
    'Lors des journées de travail difficiles, une pause régulière de cinq minutes dehors peut aider davantage que vous ne le pensez.',
    'Au moment du suivi quotidien, notez brièvement pourquoi vous vous sentez ainsi. Après quelques semaines, vous pourrez repérer vos propres tendances.',
    'Vous ne vous souvenez plus ? Choisissez « inconnu ». Une réponse honnêtement inconnue vaut mieux qu’une supposition.',
    'Vous avez une photo de votre assiette dans votre galerie ? Elle peut vous aider à noter le repas correctement plus tard.',
    'Le poids peut varier de 1 à 2 kg d’un jour à l’autre en raison de l’eau et du sel. Regardez la moyenne hebdomadaire, pas une seule pesée du matin.',
    'Pour les adultes, le repère hebdomadaire est de 150 minutes d’activité modérée (ou 75 minutes soutenue), plus du renforcement musculaire au moins 2 jours. Augmentez progressivement.',
    'Les petits moments d’activité s’additionnent. Répartissez-les dans la semaine et commencez par quelque chose qui entre dans votre emploi du temps.',
    'Vous débutez le renforcement musculaire ? Commencez léger. Augmentez progressivement la charge, les répétitions ou la difficulté seulement si le mouvement reste maîtrisé.',
    'Un programme réaliste prévoit aussi du temps pour récupérer. Inutile de compenser une séance manquée en rendant la suivante beaucoup plus difficile.',
    'Lors d’un footing facile, vous devriez encore pouvoir parler en phrases courtes. Si cela devient difficile, ralentissez ou faites une pause en marchant.',
    'Augmentez progressivement la distance, la vitesse ou le nombre de sorties. Ne changez qu’un facteur d’entraînement à la fois et observez votre récupération.',
    'En HYROX, des courses de 1 km alternent avec des ateliers. Travaillez la technique des mouvements et vérifiez les charges actuelles de votre catégorie.',
    'Une séance HYROX ne doit pas toujours reproduire une compétition complète. La course facile, la technique et la récupération font aussi partie de la préparation.',
    'Bouger davantage ne signifie pas forcément faire du sport : marcher, faire du vélo et jardiner activement comptent aussi.',
    'Rendez une habitude concrète : décidez à l’avance quand et où vous ferez une courte marche ou une séance. Un petit engagement est plus facile à répéter.',
    'Une seule pesée renseigne peu sur la tendance. Si la pesée vous convient, comparez des mesures prises dans des conditions similaires sur plusieurs semaines.',
    'Une journée incomplète reste utile. Notez ce que vous savez et laissez le reste inconnu.',
    'Vous remarquez que vous vapotez davantage les jours chargés ? Notez brièvement ce qui s’est passé avant pour repérer les moments ou situations déclencheurs.'
  ],
  'de-DE': [
    'Wenn du frühstückst, kann eine Eiweißquelle wie Ei, Joghurt oder Bohnen die Mahlzeit sättigender machen. Finde heraus, was für dich passt.',
    'Skyr, Quark und Hüttenkäse können eiweißreiche Snacks sein. Die Menge unterscheidet sich je nach Marke; schau auf das Etikett.',
    'Hülsenfrüchte wie Bohnen, Linsen und Kichererbsen liefern Ballaststoffe und Eiweiß. Eine Dose im Mealprep ist eine einfache Möglichkeit.',
    'Lass die Schale an Kartoffeln und kleinen Kartoffeln für ein paar zusätzliche Gramm Ballaststoffe.',
    'Stell zum Check-in ein Glas Wasser als Erinnerung bereit. Wie viel du brauchst, hängt von Person, Tag und Umständen ab.',
    'Unsicher, ob du Durst hast? Trink ruhig etwas Wasser. Wenn du danach noch hungrig bist, iss ganz normal etwas.',
    'Koffein kann den Schlaf noch Stunden beeinflussen; das ist individuell verschieden. Wenn du eine Wirkung bemerkst, trink deinen letzten Kaffee früher.',
    'Regelmäßige Schlafens- und Aufstehzeiten können beim Aufbau einer Routine helfen. Wähle Zeiten, die zu deinem Alltag passen.',
    'Eine kurze Nacht kann bei manchen Menschen Appetit oder Essensentscheidungen beeinflussen. Iss am nächsten Tag regelmäßig; Ausgleich ist nicht nötig.',
    'Nutze CPAP wie mit deiner behandelnden Fachkraft vereinbart. Wenn Maske und Schlauch bereitliegen, kann das die Abendroutine erleichtern.',
    'Ein Spaziergang nach dem Essen zählt als Bewegung. Zehn Minuten sind ein machbarer Anfang; du musst nicht gleich lange gehen.',
    'Telefonierst du? Steh dabei auf oder geh ein Stück. Auch kurze Abschnitte summieren sich.',
    'Abendlicher Hunger kann sich über den Tag aufbauen. Schau eher auf Frühstück und Mittagessen als auf Willenskraft um 22 Uhr.',
    'Lust auf etwas nach dem Abendessen? Entscheide vorher, worauf du Lust hast, etwa Skyr mit Obst. So ist es eine bewusste Wahl.',
    'Ein festes Ende für die Küche, zum Beispiel Zähneputzen nach dem Abendessen, kann bei spätem Appetit helfen.',
    'Sind deine Portionen schwer aufzuessen? Teile die gleiche Menge auf eine zusätzliche Portion auf, damit jede Mahlzeit machbar bleibt.',
    'Bewahre Soße getrennt von Reis oder Nudeln auf; so schmeckt dein Mealprep bis zum vierten Tag besser.',
    'Tausche jede Woche mindestens ein Mealprep aus. Abwechslung kann helfen, langfristig dranzubleiben.',
    'Wasser zwischen alkoholischen Getränken kann Flüssigkeit ersetzen, verhindert aber keinen Kater. Weniger Alkohol bedeutet weniger Belastung.',
    'Trink möglichst nicht auf nüchternen Magen. Eine Mahlzeit vorher kann verhindern, dass du gleichzeitig hungrig und mit Alkohol startest.',
    'An anstrengenden Arbeitstagen kann eine regelmäßige fünfminütige Pause draußen mehr helfen, als du denkst.',
    'Notiere beim täglichen Eintrag kurz, warum du dich so fühlst. Nach einigen Wochen erkennst du vielleicht eigene Muster.',
    'Weißt du etwas nicht mehr? Wähle ruhig „unbekannt“. Ehrlich unbekannt ist besser als geraten.',
    'Hast du ein Foto deines Essens in der Galerie? Es kann dir später helfen, die Mahlzeit genauer einzutragen.',
    'Das Gewicht kann wegen Wasser und Salz täglich um 1–2 kg schwanken. Schau auf den Wochendurchschnitt statt auf einen Morgen.',
    'Für Erwachsene gilt als Orientierung pro Woche: 150 Minuten moderate (oder 75 Minuten intensive) Bewegung sowie Muskelkräftigung an mindestens 2 Tagen. Steigere dich langsam.',
    'Kurze Bewegungsphasen summieren sich. Verteile Bewegung über die Woche und beginne mit etwas, das in deinen Zeitplan passt.',
    'Neu beim Krafttraining? Beginne leicht. Steigere Gewicht, Wiederholungen oder Schwierigkeit nur allmählich, solange die Übung kontrolliert bleibt.',
    'Ein machbarer Plan lässt auch Zeit zur Erholung. Ein verpasstes Training musst du nicht durch eine besonders harte nächste Einheit ausgleichen.',
    'Bei einem lockeren Dauerlauf solltest du noch in kurzen Sätzen sprechen können. Wenn das schwerfällt, werde langsamer oder geh ein Stück.',
    'Steigere Laufstrecke, Tempo oder Lauftage Schritt für Schritt. Ändere jeweils nur einen Trainingsreiz und achte darauf, wie du dich erholst.',
    'Bei HYROX wechseln sich 1-km-Läufe und Trainingsstationen ab. Übe die Bewegungen technisch sauber und prüfe die aktuellen Gewichte deiner Division.',
    'Ein HYROX-Training muss nicht jedes Mal ein vollständiger Wettkampf sein. Lockeres Laufen, Technik und Erholung gehören ebenfalls zur Vorbereitung.',
    'Mehr Bewegung muss nicht gleich Sport bedeuten: Gehen, Radfahren und aktives Gärtnern zählen auch.',
    'Mach eine Gewohnheit konkret: Entscheide vorher, wann und wo du kurz spazieren gehst oder trainierst. Eine kleine Verabredung ist leichter zu wiederholen.',
    'Eine einzelne Wägung sagt wenig über den Trend. Wenn Wiegen für dich passt, vergleiche Messungen unter ähnlichen Bedingungen über mehrere Wochen.',
    'Auch ein unvollständiger Tag liefert nützliche Informationen. Trag ein, was du weißt, und lass den Rest unbekannt.',
    'Vapest du an stressigen Tagen mehr? Notiere kurz, was davor passiert ist, um mögliche Auslöser und Situationen zu erkennen.'
  ]
};
function tipOfDay() {
  const recent = daysWith(14, completeKey());
  const need = new Set();
  const G = DB.goals;
  const a = f => avg(recent.map(x => f(x.d, x.k)).filter(isNum));
  if (a(d => DVARS.protein.f(d)) < G.protein * 0.85) need.add('eiwit');
  if (a(d => DVARS.fiber.f(d)) < G.fiber * 0.8) need.add('vezels');
  if (a(d => DVARS.water.f(d)) < G.waterMl / 1000 * 0.85) need.add('water');
  if (a(d => d.sleepH) < G.sleepH - 0.5) need.add('slaap');
  if (a(d => d.steps) < G.stepsMin) need.add('stappen');
  if (recent.some(x => (x.d.meals || []).some(m => m.slot === 'na' && !m.nothing))) need.add('avond');
  if (recent.some(x => x.d.alcohol > 0)) need.add('alcohol');
  if (recent.some(x => /deel|nee/.test(x.d.cpap || ''))) need.add('cpap');
  if (recent.some(x => x.d.vape in VAPE_NUM && VAPE_NUM[x.d.vape] >= 3)) need.add('vapen');
  const pool = TIPS.filter(t => need.has(t.t));
  const list = pool.length >= 3 ? pool : TIPS;
  const seed = Math.floor(parseKey(todayKey()).getTime() / 864e5);
  const tip = list[seed % list.length];
  const translated = TIP_TRANSLATIONS[currentLocale()];
  return translated && translated[TIPS.indexOf(tip)] || tip.x;
}
