/* Uitgebreide analyses: goede tegenover moeilijke dagen, automatisch verbanden zoeken,
   eetritme, eiwitverdeling, weekend, reeksen, honger, notities, en een wisselende tip van de dag.
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

  /* 1. Goede tegenover moeilijke dagen */
  const moodDays = keys.filter(k => isNum(dv('mood', k)));
  if (moodDays.length >= 6) {
    const sorted = moodDays.slice().sort((a, b) => dv('mood', b) - dv('mood', a));
    const third = Math.max(2, Math.floor(sorted.length / 3));
    const good = sorted.slice(0, third), bad = sorted.slice(-third);
    const diffs = [];
    for (const name of Object.keys(DVARS)) {
      if (name === 'mood') continue;
      // de avond ervoor telt voor slaap al mee (slaap = nacht ervoor); voor de rest dezelfde dag
      const g = good.map(k => dv(name, k)).filter(isNum), b = bad.map(k => dv(name, k)).filter(isNum);
      if (g.length < 2 || b.length < 2) continue;
      const all = g.concat(b), s = sd(all) || 1;
      diffs.push({ name, g: avg(g), b: avg(b), z: (avg(g) - avg(b)) / s });
    }
    diffs.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
    const top = diffs.filter(x => Math.abs(x.z) >= 0.5).slice(0, 4);
    if (top.length) add('stemming', 'Wat is er anders op je betere dagen?',
      'Je ' + good.length + ' beste dagen (stemming ' + fmtNum(avg(good.map(k => dv('mood', k))), 1) + ') tegenover je ' + bad.length + ' moeilijkste (' + fmtNum(avg(bad.map(k => dv('mood', k))), 1) + '):\n' +
      top.map(x => '• ' + DVARS[x.name].l + ': ' + fmtV(x.name, x.g) + ' tegenover ' + fmtV(x.name, x.b)).join('\n') +
      '\nDit wijst op samenhang, niet op oorzaak. Wel een goede plek om te beginnen.', moodDays.length + ' dagen met stemming', 'tip');
  }

  /* 2. Verbanden automatisch zoeken (zelfde dag en dag erna) */
  const targets = ['mood', 'energy', 'hungerEve', 'eveKcal', 'sleepH'];
  const found = [];
  for (const y of targets) for (const x of Object.keys(DVARS)) {
    if (x === y || (x === 'eveKcal' && y === 'hungerEve')) continue;
    for (const lag of [0, 1]) {
      if (lag === 0 && x === 'sleepH' && y === 'sleepH') continue;
      const pts = [];
      for (const k of keys) { const a = dv(x, k), b = dv(y, lag ? addDays(k, 1) : k); if (isNum(a) && isNum(b)) pts.push({ x: a, y: b, k }); }
      const r = pearson(pts);
      if (r !== null && Math.abs(r) >= 0.45 && pts.length >= 6) found.push({ x, y, lag, r, n: pts.length });
    }
  }
  found.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  const seenPair = new Set();
  const lines = [];
  for (const f of found) {
    const key = [f.x, f.y].sort().join('|');
    if (seenPair.has(key)) continue; seenPair.add(key);
    lines.push('• Hoe ' + (f.r > 0 ? 'meer' : 'meer') + ' ' + DVARS[f.x].l + (f.lag ? ' op een dag' : '') + ', hoe ' + (f.r > 0 ? 'hoger' : 'lager') + ' je ' + DVARS[f.y].l + (f.lag ? ' de dag erna' : '') + ' (r = ' + f.r.toFixed(2) + ', ' + f.n + ' dagen)');
    if (lines.length >= 4) break;
  }
  if (lines.length) add('verbanden', 'Sterkste verbanden in je cijfers', lines.join('\n') + '\nr loopt van −1 tot 1; vanaf ±0,5 is een verband duidelijk. Met weinig dagen kan toeval meespelen.', 'automatische zoektocht', 'info');

  /* 3. Week tegenover weekend */
  const wk = keys.filter(k => [1, 2, 3, 4, 5].includes(parseKey(k).getDay())), we = keys.filter(k => [0, 6].includes(parseKey(k).getDay()));
  if (wk.length >= 4 && we.length >= 2) {
    const parts = [];
    for (const name of ['kcal', 'steps', 'sleepH', 'mood', 'alcohol']) {
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
    add('ritme', 'Je eetritme', 'Je eerste maaltijd valt gemiddeld om ' + pad(Math.floor(avg(firsts) / 60)) + ':' + pad(Math.round(avg(firsts) % 60)) + '. De langste pauze tussen twee eetmomenten is gemiddeld ' + fmtNum(g / 60, 1) + ' u' + (long ? '; op ' + long + ' dagen 6 u of langer' : '') + '. Lange pauzes overdag maken avondhonger waarschijnlijker; een klein, eiwitrijk tussendoortje overbrugt ze.', gaps.length + ' dagen met tijden', long ? 'tip' : 'info');
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
      (b < 15 ? 'Je ontbijt bevat weinig eiwit. 20–30 g bij het ontbijt (eieren, skyr, kwark, hüttenkäse) geeft vaak minder trek later op de dag.' : 'Mooi gespreid over de dag.'), per.ontbijt.length + ' ontbijten', b < 15 ? 'tip' : 'good');
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
    if (isNum(s1) && isNum(s0) && Math.abs(s1 - s0) > 800) add('stemming', 'De dag na het drinken', 'De dag na alcohol zette je gemiddeld ' + fmtNum(s1) + ' stappen, anders ' + fmtNum(s0) + '.', after.length + ' + ' + noAfter.length + ' dagen', 'info');
  }

  /* 8. Slaapregelmaat en korte nachten */
  const sl = keys.map(k => dv('sleepH', k)).filter(isNum);
  if (sl.length >= 5) {
    const short = sl.filter(x => x < 6).length, s = sd(sl);
    add('slaap', 'Slaapregelmaat', 'Je slaapduur schommelt met ±' + fmtNum(s, 1) + ' u (gemiddeld ' + fmtNum(avg(sl), 1) + ' u).' + (short ? ' ' + short + ' nacht' + (short > 1 ? 'en' : '') + ' korter dan 6 u.' : '') + (s > 1.2 ? ' Een vast slaap- en opstaanuur (ook in het weekend) helpt vaak meer dan langer slapen.' : ''), sl.length + ' nachten', s > 1.2 || short >= 2 ? 'tip' : 'good');
    const nextKcal = pairs(n, d => d.sleepH, d => DVARS.eveKcal.f(d)).filter(p => isNum(p.y));
    const sc = splitCompare(nextKcal, 6.5);
    if (sc && sc.lo > sc.hi * 1.2) add('slaap', 'Korte nacht, meer avondeten', 'Na nachten korter dan 6,5 u at je vanaf het avondeten gemiddeld ' + fmtNum(sc.lo) + ' kcal, na langere nachten ' + fmtNum(sc.hi) + '. Weinig slaap verhoogt hongerhormonen; dat is biologie, geen wilskracht.', sc.nlo + ' + ' + sc.nhi + ' dagen', 'info');
  }

  /* 9. Honger en trek */
  const he = keys.map(k => ({ k, h: dv('hungerEve', k), day: dv('dayKcal', k) })).filter(x => isNum(x.h));
  if (he.length >= 4) {
    const high = he.filter(x => x.h >= 4), low = he.filter(x => x.h <= 2);
    let t = 'Trek \'s avonds gemiddeld ' + fmtNum(avg(he.map(x => x.h)), 1) + '/5.';
    const hd = avg(high.map(x => x.day).filter(isNum)), ld = avg(low.map(x => x.day).filter(isNum));
    if (isNum(hd) && isNum(ld)) t += ' Op avonden met veel trek at je overdag ≈ ' + fmtNum(hd) + ' kcal, op rustige avonden ≈ ' + fmtNum(ld) + ' kcal.';
    add('honger', 'Je avondtrek', t, he.length + ' avonden', isNum(hd) && isNum(ld) && hd < ld ? 'tip' : 'info');
  }
  const hb = keys.map(k => dv('hungerDinner', k)).filter(isNum);
  if (hb.length >= 4 && avg(hb) >= 4) add('honger', 'Uitgehongerd aan tafel', 'Je komt gemiddeld met honger ' + fmtNum(avg(hb), 1) + '/5 aan het avondeten. Met veel honger eet je sneller en meer dan nodig. Een tussendoortje rond 16 u haalt de scherpste kant eraf.', hb.length + ' avonden', 'tip');

  /* 10. Woorden die terugkomen in je notities op moeilijke dagen */
  const low = recent.filter(x => isNum(x.d.mood) && x.d.mood <= 5);
  if (low.length >= 2) {
    const stop = new Set('de het een en op in met van te is was niet wel maar ook nog naar om er dat die dan als bij voor ik je mijn zijn heb had geen weer zo'.split(' '));
    const cnt = {};
    for (const x of low) new Set(String((x.d.moodNote || '') + ' ' + (x.d.notes || '')).toLowerCase().match(/[a-zà-ÿ]{3,}/g) || []).forEach(w => { if (!stop.has(w)) cnt[w] = (cnt[w] || 0) + 1; });
    const top = Object.entries(cnt).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (top.length) add('stemming', 'Wat steeds terugkomt', 'In je notities op moeilijkere dagen komt dit het vaakst terug: ' + top.map(([w, c]) => '"' + w + '" (' + c + '×)').join(', ') + '. Patronen als dit zijn goed om met je psycholoog te bespreken.', low.length + ' dagen', 'info');
  }

  /* 11. Vapen en stemming */
  const vp = pairs(n, d => DVARS.vape.f(d), d => d.mood);
  const rv = pearson(vp);
  if (rv !== null && rv < -0.4) add('stemming', 'Vapen en stemming', 'Op dagen dat je vaker vapete, was je stemming meestal lager (r = ' + rv.toFixed(2) + '). Mogelijk vape je meer op stressvolle dagen; het een hoeft het ander niet te veroorzaken.', vp.length + ' dagen', 'info');

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
  return list[seed % list.length].x;
}
