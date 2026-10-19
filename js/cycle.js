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
function cycleWarmAdvice(log) {
  const messages = [];
  if (log.pain >= 2) messages.push(tr('Pijn vraagt geen prestatie. Als bewegen prettig voelt, kies iets zachts; rust nemen is ook een goede keuze. Warmte kan voor sommige mensen comfortabel zijn.'));
  if (log.cravings >= 2) messages.push(tr('Meer honger of trek is geen gebrek aan discipline. Probeer jezelf een vullende maaltijd of snack te geven en laat schuldgevoel of compenseren achterwege.'));
  if (log.energy >= 2 || log.sleep >= 2) messages.push(tr('Als je energie laag voelt, mag je je planning kleiner maken, iets eenvoudigs eten en herstel voorrang geven. Je hoeft niets in te halen.'));
  if (log.mood >= 2) messages.push(tr('Wat je voelt verdient aandacht. Kies één steunende stap die haalbaar voelt, zoals iemand berichten, rust nemen of je dag lichter maken.'));
  if (log.bloating >= 2 || log.headache >= 2) messages.push(tr('Ongemak kan zwaar wegen. Kies wat voor jou prettig voelt, drink naar dorst en forceer geen eten, drinken of training.'));
  const support = ['Rustiger aan','Lichte beweging','Een voedzame snack of maaltijd','Warmte of comfort','Praten met iemand','Anders'];
  if (Number.isInteger(log.support)) messages.unshift(trf('Je koos voor: {choice}. Fijn dat je ruimte maakte voor wat je nodig had.', { choice: tr(support[log.support] || 'Anders') }));
  if (!messages.length) messages.push(tr('Je hoeft je dag niet aan een cyclusfase aan te passen. Merk op wat jij nodig hebt; als het goed voelt, mag je je gewone ritme volgen.'));
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
  h += '<h3>' + tr('Symptomen in je eigen woorden') + '</h3>';
  if (entries.length < 5) h += '<p class="muted">' + trf('Je hebt {count} dagen vastgelegd. Na vijf of meer dagen kan de app samenvatten wat jij vaker als matig of ernstig noteerde.', { count: entries.length }) + '</p>';
  else {
    const counts = CYCLE_SYMPTOMS.map(([key, label]) => [label, entries.filter(([, x]) => x[key] >= 2).length]).filter(x => x[1]).sort((a, b) => b[1] - a[1]);
    h += counts.length ? '<p>' + tr('Op de geregistreerde dagen noteerde je matige of ernstige ervaringen op:') + '</p><ul>' + counts.map(([label, count]) => '<li>' + tr(label) + ' · ' + count + ' ' + tr('van') + ' ' + entries.length + ' ' + tr('dagen') + '</li>').join('') + '</ul>' : '<p>' + tr('In je ingevulde dagen koos je geen matige of ernstige score. Dat zegt alleen iets over wat je hier hebt bijgehouden.') + '</p>';
    const moodRows = entries.map(([k, x]) => ({ x, mood: DB.days[k] && DB.days[k].mood })).filter(x => isNum(x.mood));
    const high = moodRows.filter(x => CYCLE_SYMPTOMS.some(([key]) => x.x[key] >= 2)).map(x => x.mood), low = moodRows.filter(x => CYCLE_SYMPTOMS.every(([key]) => isNum(x.x[key]) && x.x[key] < 2)).map(x => x.mood);
    if (high.length >= 5 && low.length >= 5) h += '<div class="cycle-mood"><b>' + tr('Stemming op dagen met geregistreerde klachten') + '</b><p>' + tr('Dagen met één of meer klachten als matig/ernstig:') + ' ' + fmtNum(moodMedian(high), 1) + '/10 (' + high.length + ' ' + tr('dagen') + '). ' + tr('Dagen zonder zo’n geregistreerde klacht:') + ' ' + fmtNum(moodMedian(low), 1) + '/10 (' + low.length + ' ' + tr('dagen') + ').</p><small class="muted">' + tr('Dit is alleen een beschrijving van jouw ingevulde dagen; het toont geen oorzaak en sluit andere factoren niet uit.') + '</small></div>';
    else h += '<p class="muted small">' + tr('Een vergelijking met je dagelijkse stemming verschijnt pas als er minstens vijf stemmingsdagen in beide groepen zijn. Ontbrekende scores tellen niet als nul.') + '</p>';
  }
  h += '</section><p class="muted small cycle-evidence">' + tr('Onderbouwing: klachten kunnen per persoon verschillen. Zorgbronnen adviseren een dagboek over meerdere cycli bij terugkerende klachten. Onderzoek ondersteunt geen vaste trainings- of voedingsvoorschriften per cyclusfase; jouw ervaring staat voorop.') + ' <a href="https://www.acog.org/womens-health/faqs/premenstrual-syndrome" target="_blank" rel="noopener">ACOG</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC12334928/" target="_blank" rel="noopener">IOC</a></p>';
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
