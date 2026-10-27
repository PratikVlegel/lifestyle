/* Omtrekmetingen om de 2 weken: instelling bij gewicht, herinnering op Vandaag, invoer, geschiedenis,
   trendgrafieken in Inzicht en een sectie in het volledige rapport. Alles blijft lokaal in DB.girth. */
'use strict';

const GIRTH_LABELS = { waist: 'Taille', chest: 'Borst', thigh: 'Bovenbeen', arm: 'Bovenarm', hips: 'Heupen', neck: 'Nek' };
const GIRTH_HINTS = { waist: 'op navelhoogte', chest: 'over de tepels', thigh: 'dikste deel', arm: 'midden, ontspannen', hips: 'breedste punt', neck: 'onder de adamsappel' };
const GIRTH_MAIN = ['waist', 'chest', 'thigh', 'arm'];
const GIRTH_OPTIONAL = ['hips', 'neck'];
const GIRTH_INTERVAL = 14;
let GIRTH_EDIT = null;

function girthState() {
  if (!DB.girth || typeof DB.girth !== 'object') DB.girth = cleanGirth(null);
  return DB.girth;
}
function girthWeekdayName(wd) { return new Date(2021, 7, 1 + wd).toLocaleDateString(currentLocale(), { weekday: 'long' }); }
function girthSigned(v) { return (v > 0 ? '+' : v < 0 ? '−' : '±') + fmtNum(Math.abs(v), 1); }
/* Eerste gekozen weekdag op of na een datum. */
function girthOnOrAfter(k, wd) { const off = (wd - parseKey(k).getDay() + 7) % 7; return addDays(k, off); }
/* Volgende meetdatum: 14 dagen na de echte laatste meting, op de gekozen weekdag. Zonder meting: de eerste gekozen weekdag na het aanzetten. */
function girthDueDate() {
  const G = girthState();
  if (!G.enabled) return null;
  const base = G.lastDate ? addDays(G.lastDate, GIRTH_INTERVAL) : (G.since || todayKey());
  return girthOnOrAfter(base, G.weekday);
}
function girthIsDue() { const due = girthDueDate(); return !!due && todayKey() >= due; }
/* Vorige meting met een bekende waarde voor dit veld (oud → nieuw gesorteerd). */
function girthPrevValue(entries, idx, f) {
  for (let i = idx - 1; i >= 0; i--) if (isNum(entries[i][f])) return entries[i][f];
  return null;
}

/* ---------- Vandaag ---------- */
function girthHomeCard() {
  if (!girthIsDue()) return '';
  const due = girthDueDate();
  const late = due < todayKey();
  return '<a class="card fb wk girth-due" href="#/omtrek/nieuw"><b>' + tr('Tijd voor je omtrekmetingen') + '</b><p class="small">' +
    (late ? trf('Gepland op {date}. Meet wanneer het je lukt; de volgende meting rekent vanaf je echte meetdatum.', { date: fmtDay(due, true) }) : tr('Taille, borst, bovenbeen en bovenarm. Duurt een paar minuten met een meetlint.')) + '</p></a>';
}

/* ---------- gewichtsscherm: instelling en geschiedenis ---------- */
function girthWeightSection() {
  const G = girthState();
  let h = '<h2 class="sec">' + tr('Omtrekmetingen') + '</h2><div class="card girth-settings">';
  h += '<label class="toggle"><input type="checkbox" data-chg="girthEnabled" ' + (G.enabled ? 'checked' : '') + '> ' + tr('Omtrekmetingen om de 2 weken') + '</label>';
  if (G.enabled) {
    h += '<label class="fld"><span>' + tr('Meetdag') + '</span><select data-chg="girthWeekday">' + [1, 2, 3, 4, 5, 6, 0].map(wd => '<option value="' + wd + '"' + (wd === G.weekday ? ' selected' : '') + '>' + esc(girthWeekdayName(wd)) + '</option>').join('') + '</select></label>';
    const due = girthDueDate();
    h += '<p class="small muted">' + (G.lastDate ? trf('Laatste meting: {date}.', { date: fmtDay(G.lastDate, true) }) + ' ' : '') +
      (due <= todayKey() ? tr('Je meting staat klaar op Vandaag.') : trf('Volgende meting: {date}.', { date: fmtDay(due, true) })) + '</p>';
  } else {
    h += '<p class="small muted">' + tr('Krijg om de 2 weken op je gekozen dag een herinnering op Vandaag. Je kunt ook zonder herinnering een meting noteren.') + '</p>';
  }
  h += '<button class="btn ghost" data-act="girthNew">' + tr('+ Omtrekmeting') + '</button></div>';
  if (G.entries.length) h += girthHistoryHtml(G.entries);
  return h;
}
function girthHistoryHtml(entries) {
  const rows = entries.map((e, i) => {
    const val = (f, unit) => { const prev = girthPrevValue(entries, i, f); return fmtNum(e[f], 1) + (unit ? ' cm' : '') + (isNum(prev) ? ' (' + girthSigned(e[f] - prev) + ')' : ''); };
    const rest = GIRTH_FIELDS.filter(f => f !== 'waist' && isNum(e[f])).map(f => esc(tr(GIRTH_LABELS[f])) + ' ' + val(f));
    return '<a class="tr" href="#/omtrek/' + esc(e.id) + '"><span>' + fmtDay(e.date, true) + '</span><b>' + (isNum(e.waist) ? esc(tr('Taille')) + ' ' + val('waist', true) : '') + '</b>' + (rest.length ? '<span class="muted">' + rest.join(' · ') + '</span>' : '') + '</a>';
  }).reverse();
  return '<div class="card table girth-history">' + rows.join('') + '</div><p class="small muted">' + tr('Tussen haakjes: verschil in cm met de vorige meting van dezelfde omtrek.') + '</p>';
}
ACT.girthEnabled = el => {
  const G = girthState();
  G.enabled = el.checked;
  if (G.enabled && !G.since) G.since = todayKey();
  if (!save()) return;
  render();
};
ACT.girthWeekday = el => {
  const wd = Number(el.value);
  if (!Number.isInteger(wd) || wd < 0 || wd > 6) return;
  girthState().weekday = wd;
  if (!save()) return;
  render();
};
ACT.girthNew = () => go('#/omtrek/nieuw');

/* ---------- invoer ---------- */
function renderGirth(id) {
  const G = girthState();
  if (id === 'nieuw') {
    if (!GIRTH_EDIT || !GIRTH_EDIT.isNew) GIRTH_EDIT = { isNew: true, id: uid(), date: todayKey() };
  } else {
    const e = G.entries.find(x => x.id === id);
    if (!e) return go('#/kpi/weight');
    if (!GIRTH_EDIT || GIRTH_EDIT.id !== id) GIRTH_EDIT = Object.assign({}, e);
  }
  const E = GIRTH_EDIT;
  let h = header('Omtrekmetingen', E.isNew ? 'Nieuwe meting' : fmtDay(E.date, true), true);
  h += '<div class="card tip"><b>' + tr('Zo meet je vergelijkbaar') + '</b><p class="small">' + tr('Meet telkens op dezelfde plek, na de wc en vóór het ontbijt. Laat het lint aanliggen, maar trek het niet strak.') + '</p></div>';
  h += '<div class="card girth-form"><label class="fld"><span>' + tr('Datum') + '</span><input type="date" id="girth_date" value="' + esc(E.date) + '" max="' + todayKey() + '"></label>';
  const fld = f => '<label class="fld"><span>' + esc(tr(GIRTH_LABELS[f])) + ' <small class="muted">' + esc(tr(GIRTH_HINTS[f])) + '</small></span><div class="inrow"><input type="number" inputmode="decimal" step="0.1" min="' + GIRTH_RANGE[0] + '" max="' + GIRTH_RANGE[1] + '" id="girth_' + f + '" value="' + (isNum(E[f]) ? E[f] : '') + '"><em>cm</em></div></label>';
  h += '<div class="grid2">' + GIRTH_MAIN.map(fld).join('') + '</div>';
  h += '<h3>' + tr('Optioneel') + '</h3><div class="grid2">' + GIRTH_OPTIONAL.map(fld).join('') + '</div>';
  h += '<p class="small muted">' + tr('Alle velden zijn optioneel. Leeg laten = niet gemeten; dat telt nooit als 0.') + '</p>';
  h += '<div class="inrow wrap"><button class="btn" data-act="girthSave">' + tr('Opslaan') + '</button>' + (E.isNew ? '' : '<button class="btn ghost danger" data-act="girthDelete">' + tr('Verwijder') + '</button>') + '</div></div>';
  view().innerHTML = h;
}
/* Lees één veld: leeg → null, anders getal met 1 decimaal binnen het bereik. undefined = ongeldig. */
function girthReadField(f) {
  const el = document.getElementById('girth_' + f);
  if (el && el.validity && el.validity.badInput) return undefined;
  const raw = el ? String(el.value).trim().replace(',', '.') : '';
  if (raw === '') return null;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < GIRTH_RANGE[0] || v > GIRTH_RANGE[1]) return undefined;
  return Math.round(v * 10) / 10;
}
ACT.girthSave = () => {
  const G = girthState(), E = GIRTH_EDIT;
  if (!E) return go('#/kpi/weight');
  const date = $('#girth_date').value;
  if (!isDateKey(date) || date > todayKey()) return toast(tr('Kies een geldige datum (niet in de toekomst).'));
  const entry = { id: E.id, date };
  for (const f of GIRTH_FIELDS) {
    const v = girthReadField(f);
    if (v === undefined) return toast(trf('{field}: vul een waarde in tussen 10 en 300 cm, of laat het leeg.', { field: tr(GIRTH_LABELS[f]) }));
    entry[f] = v;
  }
  if (!GIRTH_FIELDS.some(f => entry[f] !== null)) return toast(tr('Vul minstens één omtrek in.'));
  const other = G.entries.find(x => x.date === date && x.id !== E.id);
  if (other && !confirm(trf('Er staat al een meting op {date}. Vervangen?', { date: fmtDay(date) }))) return;
  const before = JSON.stringify(G);
  G.entries = G.entries.filter(x => x.id !== E.id && x.date !== date);
  G.entries.push(entry);
  G.lastDate = '';
  DB.girth = cleanGirth(G);
  if (!save()) { DB.girth = JSON.parse(before); return; }
  GIRTH_EDIT = null;
  toast(tr('Omtrekmeting opgeslagen.'));
  go('#/kpi/weight');
};
ACT.girthDelete = () => {
  const G = girthState(), E = GIRTH_EDIT;
  if (!E || !confirm(trf('Meting van {date} verwijderen?', { date: fmtDay(E.date) }))) return;
  G.entries = G.entries.filter(x => x.id !== E.id);
  G.lastDate = '';
  DB.girth = cleanGirth(G);
  save();
  GIRTH_EDIT = null;
  go('#/kpi/weight');
};

/* ---------- Inzicht: kleine trendgrafiek per omtrek ---------- */
function girthInsightsHtml() {
  const entries = girthState().entries;
  if (!entries.length) return '';
  const charts = GIRTH_FIELDS.map(f => {
    const pts = entries.filter(e => isNum(e[f])).map(e => ({ k: e.date, v: e[f] }));
    if (!pts.length) return '';
    const first = pts[0], last = pts[pts.length - 1];
    const lo = Math.floor(Math.min(...pts.map(p => p.v)) - 1), hi = Math.ceil(Math.max(...pts.map(p => p.v)) + 1);
    return '<div class="girth-chart"><div class="girth-chart-h"><b>' + esc(tr(GIRTH_LABELS[f])) + '</b><span>' + fmtNum(last.v, 1) + ' cm' + (pts.length > 1 ? ' <small>(' + girthSigned(last.v - first.v) + ')</small>' : '') + '</span></div>' +
      (pts.length > 1 ? lineChart(pts, { dec: 1, unit: 'cm', label: tr(GIRTH_LABELS[f]), min: lo, max: hi }) : '<p class="small muted">' + tr('Na de volgende meting verschijnt hier een trend.') + '</p>') + '</div>';
  }).filter(Boolean);
  return '<h2 class="sec">' + tr('Omtrekmetingen') + '</h2><a class="card wk" href="#/kpi/weight"><div class="girth-charts">' + charts.join('') + '</div><p class="small muted">' + tr('Tussen haakjes: verschil sinds je eerste meting. Omtrek verandert traag; kijk naar meerdere metingen.') + '</p></a>';
}

/* ---------- rapport ---------- */
function reportGirth(periodKeys) {
  const all = girthState().entries;
  if (!all.length) return '';
  const from = periodKeys[0], to = periodKeys[periodKeys.length - 1];
  const inPeriod = all.filter(e => e.date >= from && e.date <= to);
  if (!inPeriod.length) return '<p>' + tr('Geen omtrekmetingen in deze periode.') + '</p>';
  const cell = v => isNum(v) ? esc(fmtNum(v, 1)) : '–';
  const rows = inPeriod.slice().reverse().map(e => '<tr><th scope="row">' + esc(reportDayLabel(e.date)) + '</th>' + GIRTH_FIELDS.map(f => '<td>' + cell(e[f]) + '</td>').join('') + '</tr>').join('');
  let diff = '';
  if (inPeriod.length > 1) {
    diff = '<tr class="report-dayrow"><th scope="row">' + esc(tr('Verschil eerste → laatste')) + '</th>' + GIRTH_FIELDS.map(f => {
      const v = inPeriod.filter(e => isNum(e[f]));
      return '<td>' + (v.length > 1 ? esc(girthSigned(v[v.length - 1][f] - v[0][f])) : '–') + '</td>';
    }).join('') + '</tr>';
  }
  return '<div class="report-scroll"><table class="report-grid"><thead><tr><th scope="col">' + tr('Dag') + '</th>' + GIRTH_FIELDS.map(f => '<th scope="col">' + esc(tr(GIRTH_LABELS[f])) + '</th>').join('') + '</tr></thead><tbody>' + rows + diff + '</tbody></table></div>' +
    '<p class="small muted">' + esc(tr('In cm. “–” = niet gemeten. Taille op navelhoogte; zelf gemeten met een meetlint.')) + '</p>';
}

/* ---------- vertalingen ---------- */
Object.assign(UI_EXTRA_TRANSLATIONS['en-GB'], {
  'Taille': 'Waist', 'Borst': 'Chest', 'Bovenbeen': 'Thigh', 'Bovenarm': 'Upper arm', 'Heupen': 'Hips', 'Nek': 'Neck',
  'op navelhoogte': 'at navel height', 'over de tepels': 'across the nipples', 'dikste deel': 'widest part', 'midden, ontspannen': 'midpoint, relaxed', 'breedste punt': 'widest point', 'onder de adamsappel': 'below the Adam’s apple',
  'Tijd voor je omtrekmetingen': 'Time for your body measurements', 'Gepland op {date}. Meet wanneer het je lukt; de volgende meting rekent vanaf je echte meetdatum.': 'Planned for {date}. Measure when you can; the next one counts from the date you actually measure.',
  'Taille, borst, bovenbeen en bovenarm. Duurt een paar minuten met een meetlint.': 'Waist, chest, thigh and upper arm. Takes a few minutes with a tape measure.',
  'Omtrekmetingen': 'Body measurements', 'Omtrekmetingen om de 2 weken': 'Body measurements every 2 weeks', 'Meetdag': 'Measuring day', 'Laatste meting: {date}.': 'Last measurement: {date}.',
  'Je meting staat klaar op Vandaag.': 'Your measurement is ready on Today.', 'Volgende meting: {date}.': 'Next measurement: {date}.',
  'Krijg om de 2 weken op je gekozen dag een herinnering op Vandaag. Je kunt ook zonder herinnering een meting noteren.': 'Get a reminder on Today every 2 weeks on your chosen day. You can also log a measurement without a reminder.',
  '+ Omtrekmeting': '+ Measurement', 'Tussen haakjes: verschil in cm met de vorige meting van dezelfde omtrek.': 'In brackets: difference in cm from the previous measurement of the same site.',
  'Nieuwe meting': 'New measurement', 'Zo meet je vergelijkbaar': 'How to measure consistently', 'Meet telkens op dezelfde plek, na de wc en vóór het ontbijt. Laat het lint aanliggen, maar trek het niet strak.': 'Measure at the same spot each time, after the toilet and before breakfast. Keep the tape snug, but not tight.',
  'Datum': 'Date', 'Optioneel': 'Optional', 'Alle velden zijn optioneel. Leeg laten = niet gemeten; dat telt nooit als 0.': 'All fields are optional. Left empty = not measured; it never counts as 0.',
  'Opslaan': 'Save', 'Kies een geldige datum (niet in de toekomst).': 'Choose a valid date (not in the future).', '{field}: vul een waarde in tussen 10 en 300 cm, of laat het leeg.': '{field}: enter a value between 10 and 300 cm, or leave it empty.',
  'Vul minstens één omtrek in.': 'Enter at least one measurement.', 'Er staat al een meting op {date}. Vervangen?': 'There is already a measurement on {date}. Replace it?', 'Omtrekmeting opgeslagen.': 'Measurement saved.', 'Meting van {date} verwijderen?': 'Delete the measurement from {date}?',
  'Na de volgende meting verschijnt hier een trend.': 'A trend appears here after your next measurement.', 'Tussen haakjes: verschil sinds je eerste meting. Omtrek verandert traag; kijk naar meerdere metingen.': 'In brackets: change since your first measurement. Measurements change slowly; look at several of them.',
  'Geen omtrekmetingen in deze periode.': 'No body measurements in this period.', 'Verschil eerste → laatste': 'Change first → last', 'In cm. “–” = niet gemeten. Taille op navelhoogte; zelf gemeten met een meetlint.': 'In cm. “–” = not measured. Waist at navel height; self-measured with a tape measure.',
  'Omtrekmetingen (cm)': 'Body measurements (cm)'
});
Object.assign(UI_EXTRA_TRANSLATIONS['fr-FR'], {
  'Taille': 'Taille', 'Borst': 'Poitrine', 'Bovenbeen': 'Cuisse', 'Bovenarm': 'Bras', 'Heupen': 'Hanches', 'Nek': 'Cou',
  'op navelhoogte': 'à hauteur du nombril', 'over de tepels': 'au niveau des mamelons', 'dikste deel': 'partie la plus large', 'midden, ontspannen': 'au milieu, relâché', 'breedste punt': 'point le plus large', 'onder de adamsappel': 'sous la pomme d’Adam',
  'Tijd voor je omtrekmetingen': 'C’est l’heure de vos mensurations', 'Gepland op {date}. Meet wanneer het je lukt; de volgende meting rekent vanaf je echte meetdatum.': 'Prévu le {date}. Mesurez quand vous pouvez ; la suivante se calcule à partir de la date réelle.',
  'Taille, borst, bovenbeen en bovenarm. Duurt een paar minuten met een meetlint.': 'Taille, poitrine, cuisse et bras. Quelques minutes avec un mètre ruban.',
  'Omtrekmetingen': 'Mensurations', 'Omtrekmetingen om de 2 weken': 'Mensurations toutes les 2 semaines', 'Meetdag': 'Jour de mesure', 'Laatste meting: {date}.': 'Dernière mesure : {date}.',
  'Je meting staat klaar op Vandaag.': 'Votre mesure vous attend sur Aujourd’hui.', 'Volgende meting: {date}.': 'Prochaine mesure : {date}.',
  'Krijg om de 2 weken op je gekozen dag een herinnering op Vandaag. Je kunt ook zonder herinnering een meting noteren.': 'Recevez un rappel sur Aujourd’hui toutes les 2 semaines le jour choisi. Vous pouvez aussi noter une mesure sans rappel.',
  '+ Omtrekmeting': '+ Mensuration', 'Tussen haakjes: verschil in cm met de vorige meting van dezelfde omtrek.': 'Entre parenthèses : différence en cm avec la mesure précédente du même endroit.',
  'Nieuwe meting': 'Nouvelle mesure', 'Zo meet je vergelijkbaar': 'Mesurer de façon comparable', 'Meet telkens op dezelfde plek, na de wc en vóór het ontbijt. Laat het lint aanliggen, maar trek het niet strak.': 'Mesurez toujours au même endroit, après être passé aux toilettes et avant le petit-déjeuner. Le ruban doit être ajusté, sans serrer.',
  'Datum': 'Date', 'Optioneel': 'Facultatif', 'Alle velden zijn optioneel. Leeg laten = niet gemeten; dat telt nooit als 0.': 'Tous les champs sont facultatifs. Vide = non mesuré ; cela ne compte jamais comme 0.',
  'Opslaan': 'Enregistrer', 'Kies een geldige datum (niet in de toekomst).': 'Choisissez une date valide (pas dans le futur).', '{field}: vul een waarde in tussen 10 en 300 cm, of laat het leeg.': '{field} : saisissez une valeur entre 10 et 300 cm, ou laissez vide.',
  'Vul minstens één omtrek in.': 'Saisissez au moins une mesure.', 'Er staat al een meting op {date}. Vervangen?': 'Une mesure existe déjà le {date}. La remplacer ?', 'Omtrekmeting opgeslagen.': 'Mensuration enregistrée.', 'Meting van {date} verwijderen?': 'Supprimer la mesure du {date} ?',
  'Na de volgende meting verschijnt hier een trend.': 'Une tendance apparaîtra après la prochaine mesure.', 'Tussen haakjes: verschil sinds je eerste meting. Omtrek verandert traag; kijk naar meerdere metingen.': 'Entre parenthèses : évolution depuis la première mesure. Les mensurations évoluent lentement ; regardez plusieurs mesures.',
  'Geen omtrekmetingen in deze periode.': 'Aucune mensuration sur cette période.', 'Verschil eerste → laatste': 'Écart première → dernière', 'In cm. “–” = niet gemeten. Taille op navelhoogte; zelf gemeten met een meetlint.': 'En cm. « – » = non mesuré. Taille à hauteur du nombril ; mesuré soi-même au mètre ruban.',
  'Omtrekmetingen (cm)': 'Mensurations (cm)'
});
Object.assign(UI_EXTRA_TRANSLATIONS['de-DE'], {
  'Taille': 'Taille', 'Borst': 'Brust', 'Bovenbeen': 'Oberschenkel', 'Bovenarm': 'Oberarm', 'Heupen': 'Hüfte', 'Nek': 'Hals',
  'op navelhoogte': 'auf Nabelhöhe', 'over de tepels': 'über den Brustwarzen', 'dikste deel': 'dickste Stelle', 'midden, ontspannen': 'Mitte, entspannt', 'breedste punt': 'breiteste Stelle', 'onder de adamsappel': 'unter dem Adamsapfel',
  'Tijd voor je omtrekmetingen': 'Zeit für deine Körpermaße', 'Gepland op {date}. Meet wanneer het je lukt; de volgende meting rekent vanaf je echte meetdatum.': 'Geplant für {date}. Miss, wann es dir passt; die nächste Messung zählt ab dem tatsächlichen Messdatum.',
  'Taille, borst, bovenbeen en bovenarm. Duurt een paar minuten met een meetlint.': 'Taille, Brust, Oberschenkel und Oberarm. Dauert ein paar Minuten mit einem Maßband.',
  'Omtrekmetingen': 'Körpermaße', 'Omtrekmetingen om de 2 weken': 'Körpermaße alle 2 Wochen', 'Meetdag': 'Messtag', 'Laatste meting: {date}.': 'Letzte Messung: {date}.',
  'Je meting staat klaar op Vandaag.': 'Deine Messung wartet auf Heute.', 'Volgende meting: {date}.': 'Nächste Messung: {date}.',
  'Krijg om de 2 weken op je gekozen dag een herinnering op Vandaag. Je kunt ook zonder herinnering een meting noteren.': 'Erhalte alle 2 Wochen an deinem gewählten Tag eine Erinnerung auf Heute. Du kannst auch ohne Erinnerung eine Messung eintragen.',
  '+ Omtrekmeting': '+ Messung', 'Tussen haakjes: verschil in cm met de vorige meting van dezelfde omtrek.': 'In Klammern: Unterschied in cm zur vorigen Messung derselben Stelle.',
  'Nieuwe meting': 'Neue Messung', 'Zo meet je vergelijkbaar': 'So misst du vergleichbar', 'Meet telkens op dezelfde plek, na de wc en vóór het ontbijt. Laat het lint aanliggen, maar trek het niet strak.': 'Miss immer an derselben Stelle, nach dem Toilettengang und vor dem Frühstück. Das Band soll anliegen, aber nicht einschnüren.',
  'Datum': 'Datum', 'Optioneel': 'Optional', 'Alle velden zijn optioneel. Leeg laten = niet gemeten; dat telt nooit als 0.': 'Alle Felder sind optional. Leer = nicht gemessen; das zählt nie als 0.',
  'Opslaan': 'Speichern', 'Kies een geldige datum (niet in de toekomst).': 'Wähle ein gültiges Datum (nicht in der Zukunft).', '{field}: vul een waarde in tussen 10 en 300 cm, of laat het leeg.': '{field}: Gib einen Wert zwischen 10 und 300 cm ein oder lass das Feld leer.',
  'Vul minstens één omtrek in.': 'Gib mindestens ein Maß ein.', 'Er staat al een meting op {date}. Vervangen?': 'Am {date} gibt es schon eine Messung. Ersetzen?', 'Omtrekmeting opgeslagen.': 'Messung gespeichert.', 'Meting van {date} verwijderen?': 'Messung vom {date} löschen?',
  'Na de volgende meting verschijnt hier een trend.': 'Nach der nächsten Messung erscheint hier ein Verlauf.', 'Tussen haakjes: verschil sinds je eerste meting. Omtrek verandert traag; kijk naar meerdere metingen.': 'In Klammern: Veränderung seit der ersten Messung. Körpermaße ändern sich langsam; achte auf mehrere Messungen.',
  'Geen omtrekmetingen in deze periode.': 'Keine Körpermaße in diesem Zeitraum.', 'Verschil eerste → laatste': 'Unterschied erste → letzte', 'In cm. “–” = niet gemeten. Taille op navelhoogte; zelf gemeten met een meetlint.': 'In cm. „–“ = nicht gemessen. Taille auf Nabelhöhe; selbst mit Maßband gemessen.',
  'Omtrekmetingen (cm)': 'Körpermaße (cm)'
});
