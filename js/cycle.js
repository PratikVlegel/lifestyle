/* Optioneel, privé cyclus- en symptoomdagboek. Geen fase- of ovulatievoorspellingen. */
'use strict';

const CYCLE_SYMPTOMS = [
  ['pain', 'Pijn of krampen'], ['mood', 'Stemming of prikkelbaarheid'], ['energy', 'Vermoeidheid of energie'],
  ['cravings', 'Honger of cravings'], ['sleep', 'Slaap'], ['bloating', 'Opgeblazen gevoel'], ['headache', 'Hoofdpijn']
];
const CYCLE_LEVELS = ['Niet ingevuld', 'Geen', 'Licht', 'Matig', 'Ernstig'];
const CYCLE_BLEEDING = ['Niet ingevuld', 'Geen bloeding', 'Licht', 'Matig', 'Hevig'];
function cycleDateValid(k) { return typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && !Number.isNaN(parseKey(k).getTime()) && keyOf(parseKey(k)) === k; }
function cycleSafeState() {
  if (!DB.cycleTracking || typeof DB.cycleTracking !== 'object') DB.cycleTracking = { enabled: false, selectedDate: '', periodStarts: [], logs: {} };
  const c = DB.cycleTracking;
  if (!Array.isArray(c.periodStarts)) c.periodStarts = [];
  if (!c.logs || typeof c.logs !== 'object' || Array.isArray(c.logs)) c.logs = {};
  return c;
}
function cycleSelect(name, values, selected) {
  return '<label class="fld"><span>' + tr(name) + '</span><select data-cycle-field="' + esc(name) + '">' + values.map((label, i) => '<option value="' + (i === 0 ? '' : i - 1) + '" ' + (selected === (i === 0 ? null : i - 1) ? 'selected' : '') + '>' + esc(tr(label)) + '</option>').join('') + '</select></label>';
}
function renderCycleModule() {
  if (DB.profile.sex !== 'v') {
    view().innerHTML = header('Cyclus en menstruatie', '', true) + '<section class="card"><p>' + tr('Deze persoonlijke cyclusmodule is beschikbaar wanneer je profiel op vrouw is ingesteld.') + '</p></section>';
    return;
  }
  const c = cycleSafeState();
  let h = header('Cyclus en menstruatie', 'Alleen als jij dit wilt bijhouden', true);
  h += '<section class="card cycle-intro"><h2>' + tr('Jouw ervaring verdient ruimte') + '</h2><p>' + tr('Menstruatie en klachten verschillen per persoon en per maand. Je kunt bijhouden wat jij merkt, zonder dat de app voor jou invult hoe je cyclus hoort te verlopen.') + '</p><p class="muted small">' + tr('Optioneel en alleen op dit toestel. Deze gegevens worden niet gedeeld met de community en niet meegestuurd bij AI-analyses. Ze zitten wel in een back-up die jij zelf maakt. De app voorspelt geen menstruatie, ovulatie of vruchtbare dagen.') + '</p><label class="toggle"><input type="checkbox" data-chg="cycleEnabled"' + (c.enabled ? ' checked' : '') + '><span>' + tr('Cyclusdagboek inschakelen') + '</span></label></section>';
  if (!c.enabled) {
    h += '<section class="card"><p>' + tr('Je gegevens blijven buiten beeld zolang je deze functie niet inschakelt.') + ' ' + tr('Uitschakelen verbergt bestaande gegevens, maar verwijdert ze niet.') + '</p>' + (c.periodStarts.length || Object.keys(c.logs).length ? '<button class="link danger" data-act="cycleClear">' + tr('Alle cyclusgegevens wissen') + '</button>' : '') + '</section>';
    view().innerHTML = h; return;
  }
  const selectedDate = cycleDateValid(c.selectedDate) ? c.selectedDate : todayKey();
  const log = c.logs[selectedDate] || {};
  h += '<h2 class="sec">' + tr('Een dag vastleggen') + '</h2><section class="card cycle-entry"><label class="fld"><span>' + tr('Datum') + '</span><input type="date" data-chg="cycleDate" value="' + selectedDate + '"></label>';
  h += cycleSelect('Bloeding', CYCLE_BLEEDING, Number.isInteger(log.bleeding) ? log.bleeding : null);
  h += '<p class="muted small">' + tr('Kies alleen wat voor jou klopt. Niet ingevuld is iets anders dan geen klachten.') + '</p>';
  CYCLE_SYMPTOMS.forEach(([key, label]) => { h += cycleSelect(label, CYCLE_LEVELS, Number.isInteger(log[key]) ? log[key] : null); });
  h += '<label class="fld"><span>' + tr('Wat zou je vandaag helpen? (optioneel)') + '</span><select data-cycle-field="support"><option value="">' + tr('Niet ingevuld') + '</option>' + ['Rustiger aan','Lichte beweging','Een voedzame snack of maaltijd','Warmte of comfort','Praten met iemand','Anders'].map((x, i) => '<option value="' + i + '" ' + (String(log.support) === String(i) ? 'selected' : '') + '>' + tr(x) + '</option>').join('') + '</select></label>';
  h += '<div class="inrow wrap"><button class="btn" data-act="cycleSave">' + tr('Dag bewaren') + '</button><button class="btn ghost" data-act="cyclePeriodStart">' + tr('Noteer menstruatie-start') + '</button></div></section>';
  h += cycleWarmAdvice(log);
  h += cyclePatterns(c);
  h += '<section class="card cycle-care"><h2>' + tr('Wanneer extra steun zoeken') + '</h2><p>' + tr('Als klachten je dagelijks leven verstoren, pijn nieuw of erg heftig is, of je bloedverlies je zorgen baart, bespreek het met je huisarts of zorgverlener. Je eigen registraties kunnen helpen om uit te leggen wat je ervaart; de app stelt geen diagnose.') + '</p><a href="https://www.nhs.uk/conditions/periods/period-problems/" target="_blank" rel="noopener">' + tr('NHS: menstruatieproblemen en wanneer hulp vragen') + ' ↗</a></section>';
  h += '<section class="card"><h3>' + tr('Jouw cyclusgegevens beheren') + '</h3><p class="muted small">' + tr('Je kunt deze functie uitschakelen of alle cyclusgegevens van dit toestel verwijderen.') + '</p><button class="link danger" data-act="cycleClear">' + tr('Alle cyclusgegevens wissen') + '</button></section>';
  view().innerHTML = h;
}
function cycleMessageIndex(date, group, length) {
  let hash = 0; const text = String(group);
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  const dateText = String(date || todayKey());
  const day = Date.parse(dateText + 'T00:00:00Z');
  const dayNumber = Number.isFinite(day) ? Math.floor(day / 86400000) : 0;
  return (dayNumber + hash) % length;
}
function cycleWarmAdvice(log) {
  const options = [];
  if (log.pain >= 2) options.push(['pain', log.pain, [
    'Als warmte voor jou prettig is, kan je dat proberen; bewegen hoeft vandaag geen doel te zijn.',
    'Je hoeft pijn niet weg te trainen. Rust, warmte of rustige beweging mag je kiezen op basis van wat goed voelt.',
    'Pijn is genoeg reden om je planning aan te passen. Kies comfort dat voor jou werkt en forceer geen training.'
  ]]);
  if (log.cravings >= 2) options.push(['cravings', log.cravings, [
    'Meer trek is geen gebrek aan discipline. Een vullende maaltijd of snack kan een vriendelijker antwoord zijn dan jezelf beperken.',
    'Je hoeft cravings niet te compenseren. Kies iets dat je verzadigt en waar je je goed bij voelt.',
    'Als je trek sterker is dan anders, mag je daar praktisch op inspelen met eten dat energie geeft en bij je past.'
  ]]);
  if (log.energy >= 2 || log.sleep >= 2) options.push(['energy', Math.max(log.energy || 0, log.sleep || 0), [
    'Als je energie lager is, maak je planning lichter waar dat kan. Rust nemen is geen achterstand die je moet inhalen.',
    'Een eenvoudige maaltijd en minder druk op je planning kunnen vandaag genoeg zijn; je hoeft niets te compenseren.',
    'Kies wat haalbaar is en stel niet-noodzakelijke taken uit als dat kan. Je hoeft je energie niet eerst te bewijzen.'
  ]]);
  if (log.mood >= 2) options.push(['mood', log.mood, [
    'Een zwaardere stemming is niet iets dat je met wilskracht hoeft weg te duwen. Wil je met iemand praten, of liever eerst ruimte nemen?',
    'Je hoeft niet te verklaren waarom je je zo voelt om steun te verdienen. Een vertrouwd persoon benaderen kan een kleine eerste stap zijn.',
    'Als dit zwaar voelt, kies één steunmoment dat bij jou past: iemand contacteren, je agenda aanpassen of rust nemen.'
  ]]);
  if (log.bloating >= 2 || log.headache >= 2) options.push(['discomfort', Math.max(log.bloating || 0, log.headache || 0), [
    'Ongemak kan veel ruimte innemen. Kijk of rust, warmte of je gewone medische plan helpend is, zonder jezelf te forceren.',
    'Je hoeft ongemak niet te compenseren met eten of beweging. Kies comfort dat bij jou past en vraag hulp als klachten je zorgen geven.',
    'Probeer alleen wat voor jou prettig voelt. Je mag je dag aanpassen zonder het ongemak te moeten wegredeneren.'
  ]]);
  let message;
  if (options.length) {
    const highest = Math.max(...options.map(x => x[1]));
    const main = options.filter(x => x[1] === highest);
    const [key, , lines] = main[cycleMessageIndex(cycleSafeState().selectedDate, 'main:' + main.map(x => x[0]).join(','), main.length)];
    message = lines[cycleMessageIndex(cycleSafeState().selectedDate, key, lines.length)];
  } else {
    const lines = [
      'Je hoeft je dag niet aan een cyclusfase aan te passen. Je ervaring van vandaag mag bepalen wat prettig voelt.',
      'Als je vandaag weinig klachten merkt, hoef je niets speciaal aan te passen. Volg het ritme dat voor jou werkt.',
      'Er is geen vast schema dat je lichaam vandaag moet volgen. Je kan je gewone planning aanhouden of bijsturen als jij dat wilt.'
    ];
    message = lines[cycleMessageIndex(cycleSafeState().selectedDate, 'no-symptoms', lines.length)];
  }
  const messages = [tr(message)];
  const support = ['Rustiger aan','Lichte beweging','Een voedzame snack of maaltijd','Warmte of comfort','Praten met iemand','Anders'];
  if (Number.isInteger(log.support)) {
    const followUps = [
      'Je koos iets dat vandaag kan helpen. Laat dat een passend startpunt zijn.',
      'Je noteerde wat je nodig hebt. Als dat later verandert, mag je ook iets anders kiezen.',
      'Dat is een concreet vertrekpunt; je hoeft er niets mee te bewijzen.'
    ];
    messages.push(trf('Je koos voor: {choice}. {followUp}', { choice: tr(support[log.support] || 'Anders'), followUp: tr(followUps[cycleMessageIndex(cycleSafeState().selectedDate, 'support', followUps.length)]) }));
  }
  return '<section class="card cycle-warm"><h2>' + tr('Een zachte gedachte bij je registratie') + '</h2>' + messages.map(m => '<p>' + esc(m) + '</p>').join('') + '<small class="muted">' + tr('Geen persoonlijk medisch advies. Jij kent je lichaam en grenzen het best.') + '</small></section>';
}
function cyclePatterns(c) {
  const starts = c.periodStarts.filter(cycleDateValid).sort();
  let h = '<h2 class="sec">' + tr('Wat jij hebt geregistreerd') + '</h2><section class="card cycle-patterns"><h3>' + tr('Menstruatie-starts') + '</h3>';
  h += starts.length ? '<p>' + trf('Je hebt {count} startdatums genoteerd.', { count: starts.length }) + '</p>' : '<p class="muted">' + tr('Nog geen startdatums. Als je wilt, kun je een datum hierboven als start markeren.') + '</p>';
  if (starts.length) h += '<ul class="cycle-start-list">' + starts.slice(-10).reverse().map(k => '<li><span>' + esc(fmtDay(k, true)) + '</span><button class="link danger" data-act="cycleDeleteStart" data-date="' + k + '" aria-label="' + esc(tr('Verwijder startdatum')) + '">×</button></li>').join('') + '</ul>';
  if (starts.length >= 3) {
    const intervals = starts.slice(1).map((x, i) => Math.round((parseKey(x) - parseKey(starts[i])) / 86400000));
    h += '<p>' + tr('Tijd tussen opeenvolgende datums die jij als start noteerde:') + ' ' + intervals.map(x => x + ' ' + tr('dagen')).join(' · ') + '.</p><p class="muted small">' + tr('Dit beschrijft alleen je ingevoerde datums. Het voorspelt niets en zegt niet of een cyclus medisch normaal is.') + '</p>';
  } else h += '<p class="muted small">' + tr('Na minstens drie startdatums kan de app alleen de eerder geregistreerde tussenpozen tonen.') + '</p>';
  const entries = Object.entries(c.logs).filter(([k, v]) => cycleDateValid(k) && v && typeof v === 'object').sort(([a], [b]) => a.localeCompare(b));
  h += cycleSupplementPatterns(entries);
  h += '<h3>' + tr('Symptomen in je eigen woorden') + '</h3>';
  const symptomEntries = entries.filter(([, x]) => CYCLE_SYMPTOMS.some(([key]) => Number.isInteger(x[key]) && x[key] >= 0 && x[key] <= 3));
  if (symptomEntries.length < 5) h += '<p class="muted">' + trf('Je hebt {count} cyclusdagen vastgelegd; op {rated} daarvan heb je minstens één symptoom beoordeeld. Na vijf beoordeelde dagen kan de app samenvatten wat jij vaker als matig of ernstig noteerde.', { count: entries.length, rated: symptomEntries.length }) + '</p>';
  else {
    const counts = CYCLE_SYMPTOMS.map(([key, label]) => {
      const scored = entries.filter(([, x]) => Number.isInteger(x[key]) && x[key] >= 0 && x[key] <= 3);
      return { label, count: scored.filter(([, x]) => x[key] >= 2).length, total: scored.length };
    }).filter(x => x.total > 0).sort((a, b) => (b.count / b.total) - (a.count / a.total));
    h += counts.some(x => x.count > 0) ? '<p>' + tr('Op dagen waarop je een symptoom beoordeelde, noteerde je soms matige of ernstige klachten:') + '</p><ul>' + counts.filter(x => x.count > 0).map(({ label, count, total }) => '<li>' + trf('{symptom}: matig of ernstig op {count} van {total} dagen waarop je dit beoordeelde.', { symptom: tr(label), count, total }) + '</li>').join('') + '</ul>' : '<p>' + tr('Op de beoordeelde symptomen noteerde je geen matige of ernstige score. Dit zegt alleen iets over de scores die je hebt ingevuld.') + '</p>';
    const moodRows = entries.map(([k, x]) => ({ x, mood: DB.days[k] && DB.days[k].mood })).filter(x => isNum(x.mood));
    const high = moodRows.filter(x => CYCLE_SYMPTOMS.some(([key]) => x.x[key] >= 2)).map(x => x.mood), low = moodRows.filter(x => CYCLE_SYMPTOMS.every(([key]) => isNum(x.x[key]) && x.x[key] < 2)).map(x => x.mood);
    if (high.length >= 5 && low.length >= 5) h += '<div class="cycle-mood"><b>' + tr('Stemming op dagen met geregistreerde klachten') + '</b><p>' + tr('Dagen met één of meer klachten als matig/ernstig:') + ' ' + fmtNum(moodMedian(high), 1) + '/10 (' + high.length + ' ' + tr('dagen') + '). ' + tr('Dagen zonder zo’n geregistreerde klacht:') + ' ' + fmtNum(moodMedian(low), 1) + '/10 (' + low.length + ' ' + tr('dagen') + ').</p><small class="muted">' + tr('Dit is alleen een beschrijving van jouw ingevulde dagen; het toont geen oorzaak en sluit andere factoren niet uit.') + '</small></div>';
    else h += '<p class="muted small">' + tr('Een vergelijking met je dagelijkse stemming verschijnt pas als er minstens vijf stemmingsdagen in beide groepen zijn. Ontbrekende scores tellen niet als nul.') + '</p>';
  }
  h += '</section><p class="muted small cycle-evidence">' + tr('Onderbouwing: klachten kunnen per persoon verschillen. Zorgbronnen adviseren een dagboek over meerdere cycli bij terugkerende klachten. Onderzoek ondersteunt geen vaste trainings- of voedingsvoorschriften per cyclusfase; jouw ervaring staat voorop.') + ' <a href="https://www.acog.org/womens-health/faqs/premenstrual-syndrome" target="_blank" rel="noopener">ACOG</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC12334928/" target="_blank" rel="noopener">IOC</a></p>';
  return h;
}
function cycleSupplementPatterns(entries) {
  const known = entries.filter(([k]) => DB.days[k] && DB.days[k].supplementsLogged === true);
  if (!known.length) return '<h3>' + tr('Supplementen naast je cyclusklachten') + '</h3><p class="muted small">' + tr('Registreer je supplementen via Dagboek → een dag bekijken. Alleen dagen waarop je supplementen of expliciet geen gebruik vastlegt kunnen worden vergeleken.') + '</p>';
  const names = new Map();
  known.forEach(([k]) => (DB.days[k].supplements || []).forEach(s => { const id = s.name.trim().toLocaleLowerCase('nl-BE'); if (id) names.set(id, s.name.trim()); }));
  let h = '<h3>' + tr('Supplementen naast je cyclusklachten') + '</h3><p class="muted small">' + tr('Dit kijkt naar de symptomen die jij op dezelfde dagen registreerde. De app raadt geen supplementen aan en leidt geen cyclusfase of oorzaak af.') + '</p>';
  let shown = 0;
  for (const [id, name] of [...names.entries()].slice(0, 6)) {
    const yes = known.filter(([k]) => (DB.days[k].supplements || []).some(s => s.name.trim().toLocaleLowerCase('nl-BE') === id));
    const no = known.filter(([k]) => !(DB.days[k].supplements || []).some(s => s.name.trim().toLocaleLowerCase('nl-BE') === id));
    const metrics = CYCLE_SYMPTOMS.filter(([key]) => ['mood', 'energy', 'pain', 'cravings', 'sleep', 'bloating', 'headache'].includes(key));
    const comparable = metrics.map(([key, label]) => ({ key, label,
      a: yes.filter(([, x]) => Number.isInteger(x[key])).map(([, x]) => x[key]),
      b: no.filter(([, x]) => Number.isInteger(x[key])).map(([, x]) => x[key])
    })).filter(x => x.a.length >= 5 && x.b.length >= 5);
    h += '<article class="card mood-factor"><div class="mood-factor-head"><h4>' + esc(name) + '</h4><span class="pill">' + tr('Cycluslog') + '</span></div>';
    if (!comparable.length) h += '<p class="muted small">' + trf('Nog onvoldoende gegevens: {withCount} dagen met dit supplement en {withoutCount} dagen waarop dit supplement niet is geregistreerd, met een geregistreerd symptoom.', { withCount: yes.length, withoutCount: no.length }) + '</p>';
    else {
      for (const x of comparable) {
        const a = moodMedian(x.a), b = moodMedian(x.b), delta = a - b;
        h += '<div class="cycle-mood"><b>' + tr(x.label) + '</b><p>' + tr('Met dit supplement') + ': ' + fmtNum(a, 1) + '/3 (' + x.a.length + ' ' + tr('dagen') + '); ' + tr('Zonder dit supplement') + ': ' + fmtNum(b, 1) + '/3 (' + x.b.length + ' ' + tr('dagen') + ').</p>';
        if (Math.abs(delta) >= 1) h += '<p><b>' + tr('Mogelijke vervolgstap') + '</b><br>' + tr('Je eigen registratie toont een verschil van minstens één symptoomniveau. Dat kan samenhangen met de reden waarom je het supplement nam, andere gewoontes of toeval. Verander niets op basis hiervan. Als klachten terugkeren of je supplement voor klachten gebruikt, bespreek je log en het etiket met je huisarts, gynaecoloog of apotheker.') + '</p>';
        h += '</div>';
      }
    }
    const evidence = supplementEvidence(name, true);
    h += '<details class="supplement-evidence"><summary>' + tr('Waarom zie ik dit? Onderzoek en uitleg') + '</summary><p>' + tr(evidence.text) + '</p><p class="muted small">' + tr('PMS-beoordeling steunt op terugkerende klachten over meerdere maanden. Een klein persoonlijk logboek stelt geen diagnose en test geen behandeling. De grens van 1 symptoomniveau is alleen een weergavedrempel, geen klinische grens. Andere supplementen kunnen op vergelijkingsdagen ook voorkomen; de invloed van één ingrediënt is niet apart gemeten.') + '</p><a href="' + evidence.url + '" target="_blank" rel="noopener">' + tr('Bekijk de bron') + ' ↗</a> · <a href="https://www.acog.org/womens-health/faqs/premenstrual-syndrome" target="_blank" rel="noopener">ACOG: symptoomdagboek en PMS ↗</a></details></article>';
    shown++;
  }
  if (!shown) h += '<p class="muted small">' + tr('Nog geen supplementen in je cycluslog geregistreerd.') + '</p>';
  return h;
}
ACT.cycleEnabled = el => { cycleSafeState().enabled = !!el.checked; save(); renderCycleModule(); };
ACT.cycleDate = el => { if (cycleDateValid(el.value)) { cycleSafeState().selectedDate = el.value; save(); renderCycleModule(); } };
ACT.cycleSave = () => {
  const c = cycleSafeState(), date = c.selectedDate || todayKey(), data = {};
  document.querySelectorAll('[data-cycle-field]').forEach(el => { const key = el.dataset.cycleField, raw = el.value; if (key === 'support') { if (raw !== '') data.support = Number(raw); } else if (raw !== '' && Number.isFinite(Number(raw))) data[key === 'Bloeding' ? 'bleeding' : CYCLE_SYMPTOMS.find(([, label]) => label === key)?.[0]] = Number(raw); });
  c.logs[date] = data; save(); renderCycleModule(); toast(tr('Dag bewaard. Zorg goed voor jezelf.'));
};
ACT.cyclePeriodStart = () => { const c = cycleSafeState(), date = c.selectedDate || todayKey(); if (!c.periodStarts.includes(date)) c.periodStarts.push(date); c.periodStarts.sort(); c.periodStarts = c.periodStarts.slice(-120); save(); renderCycleModule(); toast(tr('Startdatum bewaard.')) };
ACT.cycleDeleteStart = el => { const c = cycleSafeState(); c.periodStarts = c.periodStarts.filter(k => k !== el.dataset.date); save(); renderCycleModule(); };
ACT.cycleClear = () => { if (!confirm(tr('Alle cyclusdatums en symptoomregistraties van dit toestel wissen?'))) return; DB.cycleTracking = { enabled: false, selectedDate: '', periodStarts: [], logs: {} }; save(); renderCycleModule(); };
