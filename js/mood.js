/* Optionele stemmingsreflectie. Alleen lokale, gestructureerde waarden; geen vrije notities. */
'use strict';

const MOOD_VAPE = { 'niet': 0, 'paar keer': 1, 'om de 3 u': 2, 'om de 2 u': 3, 'elk uur': 4 };
function moodDiaryReadiness() {
  const count = rangeKeys(todayKey(), 60).filter(k => {
    const value = DB.days[k] && DB.days[k].mood;
    return isValidDailyRating(value);
  }).length;
  return { count, ready: count >= 14 };
}
function moodMedian(values) {
  const a = values.filter(isNum).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function moodComparison(title, note, rows, groupA, groupB) {
  const a = rows.filter(x => groupA(x.x)).map(x => x.y), b = rows.filter(x => groupB(x.x)).map(x => x.y);
  if (a.length < 5 || b.length < 5) return '<article class="card mood-factor mood-factor-limited"><div class="mood-factor-head"><h3>' + esc(tr(title)) + '</h3><span class="pill">' + tr('Nog onvoldoende gegevens') + '</span></div><p class="muted small">' + tr('Voor deze vergelijking zijn minstens vijf dagen met een stemming per groep nodig. Geregistreerde dagen:') + ' ' + a.length + ' · ' + b.length + '.</p><p class="muted small">' + esc(tr(note)) + ' ' + tr('Ontbrekende waarden tellen niet als nul.') + '</p></article>';
  const delta = moodMedian(a) - moodMedian(b);
  const direction = Math.abs(delta) < 0.5 ? tr('De middelste stemmingsscore was in beide groepen vergelijkbaar.') : delta > 0 ? tr('De middelste stemmingsscore was hoger in de eerste groep.') : tr('De middelste stemmingsscore was lager in de eerste groep.');
  return '<article class="card mood-factor"><div class="mood-factor-head"><h3>' + esc(tr(title)) + '</h3><span class="pill">' + rows.length + ' ' + tr('dagen') + '</span></div>' +
    '<div class="mood-groups"><div><span>' + esc(tr(groupA.label)) + '</span><b>' + fmtNum(moodMedian(a), 1) + '<small>/10</small></b><small>' + a.length + ' ' + tr('dagen') + '</small></div><div><span>' + esc(tr(groupB.label)) + '</span><b>' + fmtNum(moodMedian(b), 1) + '<small>/10</small></b><small>' + b.length + ' ' + tr('dagen') + '</small></div></div>' +
    '<p>' + direction + '</p><p class="muted small">' + esc(tr(note)) + ' ' + tr('Dit is een persoonlijke beschrijving, geen bewijs van oorzaak of een medische beoordeling.') + '</p></article>';
}
function supplementEvidence(name, cycle) {
  const n = name.toLocaleLowerCase('nl-BE');
  if (/\bb6\b|vitamine b6|vitamin b6|b-complex|b complex/.test(n)) return cycle
    ? { text: 'Bij PMS is vitamine B6 onderzocht, maar het bewijs is beperkt en ondersteunt geen algemeen supplementadvies. EFSA stelt voor volwassenen een bovengrens van 12 mg per dag uit alle bronnen vast, omdat overmatige inname samenhangt met perifere zenuwschade. Dit is een veiligheidsgrens, geen streefwaarde. Bespreek starten of aanpassen met je arts of apotheker.', sources: [
      { label: 'EFSA · vitamine B6 (veiligheidsgrens)', url: 'https://efsa.onlinelibrary.wiley.com/doi/10.2903/j.efsa.2023.8006' },
      { label: 'NHS · PMS en supplementen', url: 'https://www.nhs.uk/conditions/pre-menstrual-syndrome/' }
    ] }
    : { text: 'Je stemmingslog kan geen B6-tekort vaststellen of aantonen dat B6 helpt. EFSA stelt voor volwassenen een bovengrens van 12 mg per dag uit alle bronnen vast, omdat overmatige inname samenhangt met perifere zenuwschade. Dit is een veiligheidsgrens, geen streefwaarde. Laat je totale inname controleren door je arts of apotheker voordat je iets verandert.', sources: [
      { label: 'EFSA · vitamine B6 (veiligheidsgrens)', url: 'https://efsa.onlinelibrary.wiley.com/doi/10.2903/j.efsa.2023.8006' }
    ] };
  if (/\bb12\b|vitamine b12|vitamin b12/.test(n)) return cycle
    ? { text: 'Vitamine B12 is nodig voor het zenuwstelsel en de bloedaanmaak. Een tekort kan klachten geven, maar je dagboek kan geen tekort vaststellen en een supplement is geen algemene PMS-aanbeveling.', url: 'https://ods.od.nih.gov/factsheets/VitaminB12-Consumer/' }
    : { text: 'Een B12-tekort kan klachten geven, maar een stemmingsoverzicht kan geen tekort vaststellen. Extra B12 is geen algemene behandeling voor stemming als er geen tekort is vastgesteld.', url: 'https://ods.od.nih.gov/factsheets/VitaminB12-Consumer/' };
  if (/vitamine d|vitamin d|d3/.test(n)) return { text: 'Vitamine D is belangrijk voor andere lichaamsfuncties, maar klinische studies laten niet zien dat supplementen depressie voorkomen of verlichten. Een mogelijk tekort vraagt een aparte beoordeling.', url: 'https://ods.od.nih.gov/factsheets/VITAMIND-Consumer/' };
  if (/magnesium|magnes/.test(n)) return cycle
    ? { text: 'Er zijn aanwijzingen en richtlijnvermeldingen rond sommige PMS-klachten, maar het bewijs is beperkt. Supplementen kunnen bijwerkingen en wisselwerkingen hebben; bespreek gebruik met arts of apotheker.', url: 'https://www.nhs.uk/conditions/premenstrual-syndrome/' }
    : { text: 'Een verschil in je eigen log toont geen effect aan en is geen reden om magnesium te starten of te verhogen. Supplementen kunnen bijwerkingen en wisselwerkingen hebben.', url: 'https://ods.od.nih.gov/factsheets/Magnesium-Consumer/' };
  if (/zink|zinc/.test(n)) return { text: 'Voor stemming of cyclusklachten is dit geen automatische aanbeveling. Te veel zink kan schadelijk zijn en kan met medicijnen wisselwerken; bespreek dosis en combinatie met een zorgverlener.', url: 'https://ods.od.nih.gov/factsheets/zinc-consumer/' };
  if (/calcium|kalk/.test(n)) return { text: 'Calcium is onderzocht bij PMS, maar je persoonlijke registratie bewijst niet dat het voor jou werkt. Houd rekening met voeding, andere producten en medicatie; vraag advies vóór je iets verandert.', url: 'https://www.acog.org/womens-health/faqs/premenstrual-syndrome' };
  if (/omega|visolie|fish oil/.test(n)) return { text: 'Onderzoek naar supplementen en stemming geeft geen eenvoudige persoonlijke aanbeveling. Dit patroon kan geen effect aantonen; bespreek gebruik en mogelijke wisselwerkingen met een zorgverlener.', url: 'https://ods.od.nih.gov/factsheets/Omega3FattyAcids-Consumer/' };
  return { text: 'Onderzoek naar supplementen hangt af van het specifieke ingrediënt, de dosis en de reden van gebruik. Dit logboek bepaalt niet of je er baat bij hebt. Bespreek het etiket en de dosis met je arts of apotheker.', url: 'https://ods.od.nih.gov/HealthInformation/ODS_Frequently_Asked_Questions.aspx' };
}
function supplementMoodPatterns(records) {
  const known = records.filter(x => x.d.supplementsLogged === true);
  const names = new Map();
  known.forEach(x => (x.d.supplements || []).forEach(s => { const id = s.name.trim().toLocaleLowerCase('nl-BE'); if (id) names.set(id, s.name.trim()); }));
  if (!known.length) return '<section class="card"><h3>' + tr('Supplementen en stemming') + '</h3><p class="muted small">' + tr('Je hebt nog geen dagen met supplementen of expliciet geen gebruik vastgelegd. Een niet ingevulde dag telt niet als geen gebruik.') + '</p></section>';
  let h = '<h3 class="sec">' + tr('Supplementen naast stemming en energie') + '</h3><p class="muted small">' + tr('Alleen daglogs die je expliciet hebt ingevuld tellen mee. Een verschil toont geen oorzaak of werking aan.') + '</p>';
  let shown = 0;
  for (const [id, name] of [...names.entries()].sort((a, b) => b[0].length - a[0].length).slice(0, 6)) {
    const yes = known.filter(x => (x.d.supplements || []).some(s => s.name.trim().toLocaleLowerCase('nl-BE') === id));
    // Use only explicitly logged supplement-free days as the comparison group.
    // Days with another supplement are not a clean "without this supplement" comparison.
    const no = known.filter(x => Array.isArray(x.d.supplements) && x.d.supplements.length === 0);
    const evidence = supplementEvidence(name, false);
    let body = '<div class="card mood-factor"><div class="mood-factor-head"><h3>' + esc(name) + '</h3><span class="pill">' + tr('Vergelijking') + '</span></div>';
    for (const [key, label] of [['mood', 'Stemming'], ['energy', 'Energie']]) {
      const a = yes.filter(x => isValidDailyRating(x.d[key])).map(x => x.d[key]), b = no.filter(x => isValidDailyRating(x.d[key])).map(x => x.d[key]);
      if (a.length < 5 || b.length < 5) {
        body += '<p class="muted small">' + trf('{metric}: {withCount} dagen met dit supplement en score, {withoutCount} dagen zonder supplementen en score; minstens vijf per groep nodig.', { metric: tr(label), withCount: a.length, withoutCount: b.length }) + '</p>';
        continue;
      }
      const delta = moodMedian(a) - moodMedian(b);
      body += '<div class="cycle-mood"><b>' + tr(label) + '</b><p>' + tr('Met dit supplement') + ': ' + fmtNum(moodMedian(a), 1) + '/10 (' + a.length + ' ' + tr('dagen') + '); ' + tr('Zonder supplementen geregistreerd') + ': ' + fmtNum(moodMedian(b), 1) + '/10 (' + b.length + ' ' + tr('dagen') + ').</p>';
      if (Math.abs(delta) >= 1) body += '<p><b>' + tr('Mogelijke vervolgstap') + '</b><br>' + tr('Je ziet hier een verschil van minstens 1 punt in de middelste score. Houd rekening met slaap, stress, reden van gebruik en andere verschillen tussen dagen. Verander niets aan je supplement op basis van deze vergelijking; bespreek het etiket en je ervaring met arts of apotheker als je het voor stemming gebruikt.') + '</p>';
      body += '</div>';
    }
    const sources = evidence.sources || [{ label: 'Bekijk de bron', url: evidence.url }];
    body += '<details class="supplement-evidence"><summary>' + tr('Waarom zie ik dit? Onderzoek en uitleg') + '</summary><p>' + tr(evidence.text) + '</p><p class="muted small">' + tr('De app vergelijkt alleen jouw eigen ingevulde dagen. Dit is geen behandeladvies; hoeveelheid, tekort, andere gewoontes en medicatie zijn niet beoordeeld. De grens van 1 punt is alleen een weergavedrempel, geen klinische grens. De groep zonder supplementen bevat alleen expliciet als supplementvrij geregistreerde dagen. Op dagen met dit supplement kunnen andere supplementen voorkomen; deze vergelijking kan de bijdrage van één ingrediënt dus niet afzonderlijk vaststellen.') + '</p><p>' + sources.map(source => '<a href="' + source.url + '" target="_blank" rel="noopener">' + esc(tr(source.label)) + ' ↗</a>').join(' · ') + '</p></details></div>';
    h += body; shown++;
  }
  if (!shown) h += '<div class="card muted">' + tr('Nog geen supplementen geregistreerd in deze periode.') + '</div>';
  return h;
}
function renderMoodModule() {
  const enabled = DB.settings.moodInsights === true;
  let h = header('Stemming en gewoontes', 'Een rustige terugblik op je eigen registraties', true);
  h += '<div class="card mood-intro"><h2>' + tr('Wat valt samen met hoe je je voelt?') + '</h2><p>' + tr('Deze optionele module vergelijkt je stemming met slaap, cafeïne, alcohol, nicotinevormen, frisdrank, snoep, beweging, geregistreerde vezels en supplementen die je bijhoudt. Ze zoekt geen diagnose en gebruikt je vrije notities niet.') + '</p><label class="toggle"><input type="checkbox" data-chg="setMoodInsights"' + (enabled ? ' checked' : '') + '><span>' + tr('Persoonlijke vergelijkingen inschakelen') + '</span></label><p class="muted small">' + tr('Alles wordt op dit toestel berekend. Alleen dagen waarop beide waarden zijn ingevuld tellen mee. Uitgeschakelde of niet ingevulde waarden worden niet als nul gezien.') + '</p><p class="muted small">' + tr('Deze vergelijkingen zijn verkennend. Je bekijkt meerdere factoren en kleine groepen; verschillen kunnen toevallig zijn. De app test geen statistische zekerheid.') + '</p></div>';
  if (DB.profile.sex === 'v') h += '<a class="card fb cycle-link" href="#/cycle"><b>' + tr('Cyclus en menstruatie') + '</b><p class="small">' + tr('Houd optioneel je eigen ervaringen bij en krijg steun die aansluit op wat jij registreert.') + '</p></a>';
  if (!enabled) {
    h += '<div class="card muted">' + tr('Je stemming wordt niet met andere gewoontes vergeleken. Schakel de optie hierboven in als je dat zelf wilt.') + '</div>';
    view().innerHTML = h; return;
  }
  const keys = rangeKeys(todayKey(), 60), records = keys.map(k => ({ k, d: DB.days[k] })).filter(x => x.d && isValidDailyRating(x.d.mood));
    h += moodInsightsHtml(records);
  h += supplementMoodPatterns(records);
  h += '<div class="card mood-care"><h3>' + tr('Als je stemming je zorgen baart') + '</h3><p>' + tr('Een dagboek kan helpen om je eigen ervaringen te bespreken, maar vervangt geen gesprek met een huisarts of andere zorgverlener. Neem contact op als een sombere stemming langer aanhoudt of je dagelijks leven beïnvloedt.') + '</p><a href="https://www.nhs.uk/mental-health/feelings-symptoms-behaviours/feelings-and-symptoms/low-mood-sadness-depression/" target="_blank" rel="noopener">' + tr('NHS: omgaan met een lage stemming') + '</a></div>';
  view().innerHTML = h;
}
ACT.setMoodInsights = el => { DB.settings.moodInsights = !!el.checked; save(); renderMoodModule(); };

function renderEvidenceAdvice() {
  const items = [
    ['Beweging: richtlijn en start', 'Voor volwassenen: 150–300 minuten matig intensief of 75–150 minuten intensief per week, plus minstens 2 dagen spierversterking. Dit is een richtpunt, geen toegangsdrempel: als je weinig beweegt, start met korte wandelingen en bouw duur of frequentie rustig uit.', 'WHO · richtlijnen', 'https://www.who.int/initiatives/behealthy/physical-activity/'],
    ['Kracht: simpele opbouw', 'Train grote spiergroepen minstens 2 dagen per week. Kies een squat-/heup-, duw-, trek- en rompoefening die je beheerst. Begin met een haalbaar aantal sets; verhoog eerst één ding tegelijk. Tot spierfalen trainen of ingewikkelde periodisering is voor de gemiddelde gezonde volwassene niet noodzakelijk.', 'ACSM · positieverklaring 2026', 'https://acsm.org/resistance-training-guidelines-update-2026/'],
    ['Spiermassa: volume telt, herstel ook', 'Voor spiergroei kan geleidelijk meer weekvolume helpen. De ACSM-review noemt ongeveer 10 sets per spiergroep per week als bruikbare richtwaarde voor hypertrofie, niet als startverplichting. Begin lager als je nieuw bent en verhoog alleen als techniek en herstel goed blijven.', 'ACSM · samenvatting positieverklaring 2026', 'https://www.acsm.org/wp-content/uploads/2026/03/Resistance-Training-Position-Stand-infographic.pdf'],
    ['Voeding: maak één haalbare wissel', 'Een gezond voedingspatroon draait om het geheel en om herhaalbare keuzes. Kies deze week bijvoorbeeld één lunch waarin je wit brood vervangt door volkoren, of vlees door linzen of bonen. Je hoeft niet je hele eetpatroon in één keer om te gooien.', 'Gezondheidsraad · richtlijnen eiwitbronnen 2025', 'https://www.gezondheidsraad.nl/adviesonderwerpen/voedingsrichtlijnen/richtlijnen-goede-voeding-eiwitbronnen-en-voedingspatronen-2025'],
    ['Vezels: bouw variatie op', 'Peulvruchten, volkoren granen, groente, fruit en noten leveren vezels. De richtlijn hangt samen met je energiebehoefte (3–3,5 g/MJ); een generiek getal is dus niet voor iedereen hetzelfde. Voeg bronnen geleidelijk toe en kijk hoe je buik reageert.', 'Voedingscentrum · vezels', 'https://www.voedingscentrum.nl/encyclopedie/vezels.aspx'],
    ['Afvallen: kies gedrag dat je kunt herhalen', 'Gewicht verandert door meerdere factoren. Voor gewichtsverlies is op termijn een lagere energie-inname dan verbruik nodig, maar een streng dieet is niet automatisch gezond of vol te houden. Kies één kleine wissel die bij je dagelijkse routine past; beweging ondersteunt gezondheid en conditie maar garandeert geen gewichtsverlies.', 'Voedingscentrum · kleine stappen bij afvallen', 'https://www.voedingscentrum.nl/nl/afvallen/zo-maak-je-goede-voornemens-om-af-te-vallen.aspx'],
    ['Slaapritme', 'Een vaste bed- en opstaantijd kan helpen een regelmatige routine te houden. Alcohol kan slaap verstoren; nicotine is stimulerend. Kijk wat je zelf merkt en verander één gewoonte tegelijk.', 'NIH · Healthy Sleep', 'https://health.nih.gov/health-topics/healthy-sleep'],
    ['Alcohol en welzijn', 'Alcoholgebruik kan samengaan met veranderingen in slaap en mentaal welzijn. Een dagboek laat alleen persoonlijke patronen zien en kan niet bepalen wat bij jou de oorzaak is.', 'Trimbos · alcohol en mentale gezondheid', 'https://www.trimbos.nl/kennis/alcohol/alcohol-en-mentale-gezondheid/'],
    ['Lage stemming', 'Kleine, regelmatige activiteiten, contact met iemand die je vertrouwt en routine kunnen steun geven. Als een lage stemming langer aanhoudt of je dagelijks leven raakt, bespreek dit met je huisarts.', 'NHS · low mood', 'https://www.nhs.uk/mental-health/feelings-symptoms-behaviours/feelings-and-symptoms/low-mood-sadness-depression/']
  ];
  return '<div class="evidence-grid">' + items.map(([title, body, source, url]) => '<article class="card evidence-card"><span class="pill">' + esc(tr(title)) + '</span><p>' + esc(tr(body)) + '</p><a href="' + url + '" target="_blank" rel="noopener">' + esc(tr(source)) + ' ↗</a></article>').join('') + '</div>';
}

/* ---------- persoonlijke verbanden (v1.15) ----------
   Elke factor wordt vergeleken met stemming en energie via:
   - een rangcorrelatie (Spearman): werkt met elke verdeling en is robuust voor uitschieters;
   - een gesplitste vergelijking: dagen met meer vs minder van de factor (rond je eigen mediaan),
     of 0 tegenover > 0 als de factor vaak nul is (bv. alcohol).
   Zo blijft er iets zinnigs over, ook als je bijna nooit alcohol drinkt. */
const MOOD_MIN_DAYS = 6;
function moodPrevDay(k) { return DB.days[addDays(k, -1)]; }
function moodActMin(d) { const a = Array.isArray(d.activities) ? d.activities.filter(x => isNum(x.min)) : null; return a && a.length ? a.reduce((t, x) => t + x.min, 0) : null; }
function moodNicotine(d) {
  if (Object.hasOwn(d, 'nicotineForms')) return Array.isArray(d.nicotineForms) ? (d.nicotineForms.length ? 1 : 0) : null;
  if (Object.hasOwn(MOOD_VAPE, d.vape)) return MOOD_VAPE[d.vape] > 0 ? 1 : 0;
  return null;
}
function moodComplete(d, n) { const r = dayNutr(d, n); return r && !r.lb && isNum(r.v) ? r.v : null; }
const MOOD_FACTORS = [
  { id: 'sleep', label: 'Slaap', more: 'een langere nacht', less: 'een kortere nacht', unit: 'u', dec: 1, get: d => isNum(d.sleepH) ? d.sleepH : null },
  { id: 'stress', label: 'Stress', more: 'meer stress', less: 'minder stress', unit: '/10', dec: 0, get: d => isValidDailyRating(d.stress) ? d.stress : null },
  { id: 'steps', label: 'Stappen', more: 'meer stappen', less: 'minder stappen', unit: '', dec: 0, get: d => isNum(d.steps) ? d.steps : null },
  { id: 'act', label: 'Sport/activiteit', more: 'meer beweging', less: 'minder beweging', unit: 'min', dec: 0, get: moodActMin },
  { id: 'caffeine', label: 'Cafeïne', more: 'meer cafeïne', less: 'minder cafeïne', zero: 'geen cafeïne', any: 'cafeïne', unit: 'porties', dec: 0, get: d => isNum(d.caffeine) ? d.caffeine : null },
  { id: 'alcoholPrev', label: 'Alcohol de dag ervoor', more: 'meer alcohol de dag ervoor', less: 'minder alcohol de dag ervoor', zero: 'geen alcohol de dag ervoor', any: 'alcohol de dag ervoor', unit: 'glazen', dec: 0, get: (d, k) => { const p = moodPrevDay(k); return p && isNum(p.alcohol) ? p.alcohol : null; } },
  { id: 'alcohol', label: 'Alcohol', more: 'meer alcohol', less: 'minder alcohol', zero: 'geen alcohol', any: 'alcohol', unit: 'glazen', dec: 0, get: d => isNum(d.alcohol) ? d.alcohol : null },
  { id: 'nicotine', label: 'Nicotine', zero: 'geen nicotine', any: 'nicotine', unit: '', dec: 0, binary: true, get: moodNicotine },
  { id: 'soft', label: 'Frisdrank', more: 'meer frisdrank', less: 'minder frisdrank', zero: 'geen frisdrank', any: 'frisdrank', unit: 'porties', dec: 1, get: d => isNum(d.softDrinkServings) ? d.softDrinkServings : null },
  { id: 'sweets', label: 'Snoep', more: 'meer snoep', less: 'minder snoep', zero: 'geen snoep', any: 'snoep', unit: 'porties', dec: 1, get: d => isNum(d.sweetsServings) ? d.sweetsServings : null },
  { id: 'water', label: 'Water', more: 'meer water', less: 'minder water', unit: 'l', dec: 1, get: d => isNum(dayWaterMl(d)) ? dayWaterMl(d) / 1000 : null },
  { id: 'kcal', label: 'Kcal', more: 'meer kcal', less: 'minder kcal', unit: 'kcal', dec: 0, get: d => moodComplete(d, 'kcal') },
  { id: 'protein', label: 'Eiwit', more: 'meer eiwit', less: 'minder eiwit', unit: 'g', dec: 0, get: d => moodComplete(d, 'protein') },
  { id: 'fiber', label: 'Vezels', more: 'meer vezels', less: 'minder vezels', unit: 'g', dec: 0, get: d => moodComplete(d, 'fiber') }
];
const MOOD_OUTCOMES = [['mood', 'stemming'], ['energy', 'energie']];
function moodRanks(v) {
  const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]), r = new Array(v.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let t = i; t <= j; t++) r[idx[t][1]] = (i + j) / 2 + 1; i = j + 1; }
  return r;
}
function moodSpearman(pts) {
  if (pts.length < 5) return null;
  const rx = moodRanks(pts.map(p => p.x)), ry = moodRanks(pts.map(p => p.y));
  return pearson(rx.map((x, i) => ({ x, y: ry[i] })));
}
function moodStrength(r) { const a = Math.abs(r); return a >= 0.6 ? 'sterk' : a >= 0.4 ? 'duidelijk' : a >= 0.25 ? 'zwak' : 'geen'; }
/* Analyseer één factor tegen één uitkomst. */
function moodAnalyse(f, outKey, records) {
  const pts = records.map(x => ({ k: x.k, x: f.get(x.d, x.k), y: x.d[outKey] })).filter(p => isNum(p.x) && isValidDailyRating(p.y));
  const res = { f, outKey, n: pts.length, pts };
  if (pts.length < MOOD_MIN_DAYS) { res.need = MOOD_MIN_DAYS - pts.length; return res; }
  const zeros = pts.filter(p => p.x === 0).length;
  let hi, lo, mode;
  if (f.binary || zeros >= pts.length * 0.35) { hi = pts.filter(p => p.x > 0); lo = pts.filter(p => p.x === 0); mode = 'zero'; }
  else {
    const xs = pts.map(p => p.x).sort((a, b) => a - b), med = moodMedian(xs);
    hi = pts.filter(p => p.x > med); lo = pts.filter(p => p.x < med);
    const eq = pts.filter(p => p.x === med);
    if (hi.length <= lo.length) hi = hi.concat(eq); else lo = lo.concat(eq);
    mode = 'median'; res.med = med;
  }
  res.hi = hi; res.lo = lo; res.mode = mode;
  if (hi.length < 3 || lo.length < 3) { res.skewed = true; return res; }
  res.hiAvg = avg(hi.map(p => p.y)); res.loAvg = avg(lo.map(p => p.y)); res.diff = res.hiAvg - res.loAvg;
  res.r = f.binary ? null : moodSpearman(pts);
  const rr = isNum(res.r) ? res.r : Math.max(-1, Math.min(1, res.diff / 3));
  res.strength = moodStrength(rr);
  // Bij weinig dagen is een groot verband snel toeval: eis dan een sterkere samenhang (≈ p < 0,10).
  const crit = 1.645 / Math.sqrt(Math.max(1, pts.length - 1));
  if (Math.abs(rr) < crit && res.strength !== 'geen') res.strength = 'zwak';
  if (Math.abs(res.diff) < 0.4) res.strength = 'geen';
  res.score = Math.abs(rr) * Math.min(1, pts.length / 14) + Math.abs(res.diff) / 10;
  return res;
}
function moodSentence(a) {
  const out = tr(a.outKey === 'mood' ? 'stemming' : 'energie');
  const fmt = v => fmtNum(v, a.f.dec) + (a.f.unit ? (a.f.unit[0] === '/' ? '' : ' ') + tr(a.f.unit) : '');
  const hiLbl = a.mode === 'zero' ? tr(a.f.any) : tr(a.f.more) + (isNum(a.med) ? ' (≥ ' + fmt(a.med) + ')' : '');
  const loLbl = a.mode === 'zero' ? tr(a.f.zero) : tr(a.f.less);
  return trf('Bij {hi}: {out} gemiddeld {hiAvg}. Bij {lo}: {loAvg}.', { hi: hiLbl, out, hiAvg: fmtNum(a.hiAvg, 1), lo: loLbl, loAvg: fmtNum(a.loAvg, 1) });
}
function moodPill(a) {
  const cls = { sterk: 'strong', duidelijk: 'clear', zwak: 'weak', geen: 'none' }[a.strength];
  const txt = a.strength === 'geen' ? tr('geen duidelijk verschil') : tr(a.strength + ' verband');
  return '<span class="pill mood-' + cls + '">' + txt + '</span>';
}
function moodTrendCard(records) {
  const first = records.length ? records.map(x => x.k).sort()[0] : todayKey();
  const keys = rangeKeys(todayKey(), 60).filter(k => k >= first);
  const series = keys.map(k => ({ k, v: DB.days[k] && isValidDailyRating(DB.days[k].mood) ? DB.days[k].mood : null }));
  const en = records.filter(x => isValidDailyRating(x.d.energy));
  const last14 = records.filter(x => x.k > addDays(todayKey(), -14)), prev14 = records.filter(x => x.k <= addDays(todayKey(), -14) && x.k > addDays(todayKey(), -28));
  const wk = records.filter(x => { const g = parseKey(x.k).getDay(); return g > 0 && g < 6; }), we = records.filter(x => { const g = parseKey(x.k).getDay(); return g === 0 || g === 6; });
  const m = arr => avg(arr.map(x => x.d.mood));
  let h = '<section class="card"><h3>' + tr('Je stemming de laatste 60 dagen') + '</h3>' + lineChart(series, { min: 1, max: 10, dec: 0, unit: '/10', label: tr('Stemming'), ma: records.length >= 7, connect: true });
  h += '<div class="mood-groups mood-stats">' +
    '<div><span>' + tr('Gemiddelde stemming') + '</span><b>' + fmtNum(m(records), 1) + '<small>/10</small></b><small>' + records.length + ' ' + tr('dagen') + '</small></div>' +
    (en.length ? '<div><span>' + tr('Gemiddelde energie') + '</span><b>' + fmtNum(avg(en.map(x => x.d.energy)), 1) + '<small>/10</small></b><small>' + en.length + ' ' + tr('dagen') + '</small></div>' : '') +
    (last14.length >= 4 && prev14.length >= 4 ? '<div><span>' + tr('Laatste 2 weken') + '</span><b>' + fmtNum(m(last14), 1) + '</b><small>' + trf('daarvoor {v}', { v: fmtNum(m(prev14), 1) }) + '</small></div>' : '') +
    (wk.length >= 3 && we.length >= 2 ? '<div><span>' + tr('Weekdag / weekend') + '</span><b>' + fmtNum(m(wk), 1) + ' / ' + fmtNum(m(we), 1) + '</b><small>' + wk.length + ' / ' + we.length + ' ' + tr('dagen') + '</small></div>' : '') +
    '</div></section>';
  return h;
}
function moodInsightsHtml(records) {
  if (records.length < MOOD_MIN_DAYS) return '<div class="card note"><b>' + tr('Nog even verder invullen') + '</b><p class="small">' + trf('Vanaf {min} dagen met een stemmingsscore zie je hier de eerste verbanden. Je hebt er nu {n}.', { min: MOOD_MIN_DAYS, n: records.length }) + '</p></div>';
  const all = [];
  for (const f of MOOD_FACTORS) for (const [o] of MOOD_OUTCOMES) all.push(moodAnalyse(f, o, records));
  const ok = all.filter(a => isNum(a.diff));
  const signals = ok.filter(a => a.strength !== 'geen').sort((a, b) => b.score - a.score);
  const shownIds = new Set(); const top = [];
  for (const a of signals) { if (shownIds.has(a.f.id)) continue; shownIds.add(a.f.id); top.push(a); if (top.length >= 4) break; }
  let h = '<section class="card mood-top"><h3>' + tr('Wat valt op') + '</h3>';
  if (top.length) {
    h += top.map((a, i) => '<div class="mood-signal"><div class="mood-factor-head"><b>' + esc(tr(a.f.label)) + ' → ' + esc(tr(a.outKey === 'mood' ? 'stemming' : 'energie')) + '</b>' + moodPill(a) + '</div><p>' + esc(moodSentence(a)) + '</p><p class="muted small">' + a.n + ' ' + tr('dagen') + (a.n < 14 ? ' · ' + tr('voorlopig, wordt betrouwbaarder met meer dagen') : '') + '</p>' +
      (i === 0 && !a.f.binary ? '<details><summary>' + tr('Toon als grafiek') + '</summary>' + scatterChart(a.pts, { xLabel: tr(a.f.label) + (a.f.unit ? ' (' + tr(a.f.unit) + ')' : ''), yLabel: tr(a.outKey === 'mood' ? 'stemming' : 'energie') + ' /10', ymin: 1, ymax: 10, label: tr(a.f.label) }) + '</details>' : '') + '</div>').join('');
  } else {
    h += '<p>' + tr('Nog geen duidelijke verbanden. Je stemming en energie lopen tot nu toe niet merkbaar samen met één van je gewoontes.') + '</p>';
  }
  const quiet = [...new Set(ok.filter(a => !shownIds.has(a.f.id) && a.strength === 'geen').map(a => a.f.id))].filter(id => !ok.some(a => a.f.id === id && a.strength !== 'geen'));
  if (quiet.length) h += '<p class="muted small">' + tr('Bekeken, maar zonder duidelijk verschil:') + ' ' + quiet.map(id => esc(tr(MOOD_FACTORS.find(f => f.id === id).label).toLocaleLowerCase(currentLocale()))).join(', ') + '.</p>';
  h += '<p class="muted small">' + tr('Dit toont wat bij jou samen voorkomt, niet wat de oorzaak is. Een verband is pas "duidelijk" als het verschil groot genoeg is en over meerdere dagen terugkomt.') + '</p></section>';
  h += moodTrendCard(records);
  // Overzichtstabel van alle factoren
  const rows = MOOD_FACTORS.map(f => {
    const cells = MOOD_OUTCOMES.map(([o]) => {
      const a = all.find(x => x.f === f && x.outKey === o);
      if (!a || !isNum(a.diff)) return '<td class="muted">–</td>';
      const arrow = Math.abs(a.diff) < 0.4 ? '≈' : a.diff > 0 ? '▲' : '▼';
      return '<td class="mood-cell mood-' + ({ sterk: 'strong', duidelijk: 'clear', zwak: 'weak', geen: 'none' }[a.strength]) + '">' + arrow + ' ' + (a.diff > 0 ? '+' : '') + fmtNum(a.diff, 1) + '</td>';
    }).join('');
    const n = Math.max(...MOOD_OUTCOMES.map(([o]) => (all.find(x => x.f === f && x.outKey === o) || {}).n || 0));
    return { f, cells, n, has: MOOD_OUTCOMES.some(([o]) => { const a = all.find(x => x.f === f && x.outKey === o); return a && isNum(a.diff); }) };
  });
  const withData = rows.filter(r => r.has);
  if (withData.length) h += '<section class="card"><h3>' + tr('Alle factoren') + '</h3><p class="muted small">' + tr('Verschil in punten (op 10) tussen dagen met meer en dagen met minder (of geen) van die factor. ▲ = hoger bij meer.') + '</p><div class="report-scroll"><table class="mood-table"><thead><tr><th>' + tr('Factor') + '</th><th>' + tr('Stemming') + '</th><th>' + tr('Energie') + '</th><th>' + tr('Dagen') + '</th></tr></thead><tbody>' +
    withData.map(r => '<tr><th scope="row">' + esc(tr(r.f.label)) + '</th>' + r.cells + '<td>' + r.n + '</td></tr>').join('') + '</tbody></table></div></section>';
  // Wat nog ontbreekt
  const missing = MOOD_FACTORS.map(f => {
    const a = all.find(x => x.f === f && x.outKey === 'mood');
    if (rows.find(r => r.f === f).has) return null;
    if (a.need) return esc(tr(f.label)) + ' <small>(' + trf('nog {n} dagen', { n: a.need }) + ')</small>';
    if (a.skewed) return esc(tr(f.label)) + ' <small>(' + trf('bijna altijd hetzelfde: {a} · {b}', { a: a.hi.length, b: a.lo.length }) + ')</small>';
    return null;
  }).filter(Boolean);
  if (missing.length) h += '<details class="card mood-missing"><summary>' + trf('Nog te weinig gegevens voor {n} factoren', { n: missing.length }) + '</summary><p class="small">' + missing.join(' · ') + '</p><p class="muted small">' + tr('Een factor verschijnt zodra je hem minstens 6 dagen samen met je stemming hebt ingevuld en hij niet elke dag hetzelfde is. Vul ook expliciet 0 in (bv. geen alcohol), anders blijft de dag onbekend.') + '</p></details>';
  return h;
}
