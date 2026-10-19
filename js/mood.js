/* Optionele stemmingsreflectie. Alleen lokale, gestructureerde waarden; geen vrije notities. */
'use strict';

const MOOD_VAPE = { 'niet': 0, 'paar keer': 1, 'om de 3 u': 2, 'om de 2 u': 3, 'elk uur': 4 };
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
    ? { text: 'Voor PMS is mogelijk voordeel van vitamine B6 onderzocht, maar onderzoekers zijn niet zeker. Te veel B6 kan zenuwschade geven; laat een arts of apotheker je product en dosis beoordelen.', url: 'https://ods.od.nih.gov/factsheets/vitaminb6-consumer/' }
    : { text: 'Voor stemming in het algemeen is extra B-vitamine geen standaardadvies. Een tekort is iets anders dan extra innemen; B6 kan bij langdurig hoge inname zenuwschade veroorzaken.', url: 'https://ods.od.nih.gov/factsheets/vitaminb6-consumer/' };
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
    const no = known.filter(x => !(x.d.supplements || []).some(s => s.name.trim().toLocaleLowerCase('nl-BE') === id));
    const evidence = supplementEvidence(name, false);
    let body = '<div class="card mood-factor"><div class="mood-factor-head"><h3>' + esc(name) + '</h3><span class="pill">' + tr('Vergelijking') + '</span></div>';
    if (yes.length < 5 || no.length < 5) body += '<p class="muted small">' + trf('Nog onvoldoende gegevens: {withCount} dagen met dit supplement en {withoutCount} dagen waarop dit supplement niet is geregistreerd, allebei met een stemmingsscore.', { withCount: yes.length, withoutCount: no.length }) + '</p>';
    else {
      for (const [key, label] of [['mood', 'Stemming'], ['energy', 'Energie']]) {
        const a = yes.filter(x => isNum(x.d[key])).map(x => x.d[key]), b = no.filter(x => isNum(x.d[key])).map(x => x.d[key]);
        if (a.length < 5 || b.length < 5) continue;
        const delta = moodMedian(a) - moodMedian(b);
        body += '<div class="cycle-mood"><b>' + tr(label) + '</b><p>' + tr('Met dit supplement') + ': ' + fmtNum(moodMedian(a), 1) + '/10 (' + a.length + ' ' + tr('dagen') + '); ' + tr('Zonder dit supplement') + ': ' + fmtNum(moodMedian(b), 1) + '/10 (' + b.length + ' ' + tr('dagen') + ').</p>';
        if (Math.abs(delta) >= 1) body += '<p><b>' + tr('Mogelijke vervolgstap') + '</b><br>' + tr('Je ziet hier een verschil van minstens 1 punt in de middelste score. Houd rekening met slaap, stress, reden van gebruik en andere verschillen tussen dagen. Verander niets aan je supplement op basis van deze vergelijking; bespreek het etiket en je ervaring met arts of apotheker als je het voor stemming gebruikt.') + '</p>';
        body += '</div>';
      }
      if (!body.includes('class="cycle-mood"')) body += '<p class="muted small">' + tr('Nog onvoldoende stemming- of energiescores per groep.') + '</p>';
    }
    body += '<details class="supplement-evidence"><summary>' + tr('Waarom zie ik dit? Onderzoek en uitleg') + '</summary><p>' + tr(evidence.text) + '</p><p class="muted small">' + tr('De app vergelijkt alleen jouw eigen ingevulde dagen. Dit is geen behandeladvies; hoeveelheid, tekort, andere gewoontes en medicatie zijn niet beoordeeld. De grens van 1 punt is alleen een weergavedrempel, geen klinische grens. Andere supplementen kunnen op vergelijkingsdagen ook voorkomen; de invloed van één ingrediënt is niet apart gemeten.') + '</p><a href="' + evidence.url + '" target="_blank" rel="noopener">' + tr('Bekijk de bron') + ' ↗</a></details></div>';
    h += body; shown++;
  }
  if (!shown) h += '<div class="card muted">' + tr('Nog geen supplementen geregistreerd in deze periode.') + '</div>';
  return h;
}
function renderMoodModule() {
  const enabled = DB.settings.moodInsights === true;
  let h = header('Stemming en gewoontes', 'Een rustige terugblik op je eigen registraties', true);
  h += '<div class="card mood-intro"><h2>' + tr('Wat valt samen met hoe je je voelt?') + '</h2><p>' + tr('Deze optionele module vergelijkt je stemming met slaap, cafeïne, alcohol, nicotinevormen, frisdrank, snoep, beweging, geregistreerde vezels en supplementen die je bijhoudt. Ze zoekt geen diagnose en gebruikt je vrije notities niet.') + '</p><label class="toggle"><input type="checkbox" data-chg="setMoodInsights"' + (enabled ? ' checked' : '') + '><span>' + tr('Persoonlijke vergelijkingen inschakelen') + '</span></label><p class="muted small">' + tr('Alles wordt op dit toestel berekend. Alleen dagen waarop beide waarden zijn ingevuld tellen mee. Uitgeschakelde of niet ingevulde waarden worden niet als nul gezien.') + '</p></div>';
  if (DB.profile.sex === 'v') h += '<a class="card fb cycle-link" href="#/cycle"><b>' + tr('Cyclus en menstruatie') + '</b><p class="small">' + tr('Houd optioneel je eigen ervaringen bij en krijg steun die aansluit op wat jij registreert.') + '</p></a>';
  if (!enabled) {
    h += '<div class="card muted">' + tr('Je stemming wordt niet met andere gewoontes vergeleken. Schakel de optie hierboven in als je dat zelf wilt.') + '</div>';
    view().innerHTML = h; return;
  }
  const keys = rangeKeys(todayKey(), 60), records = keys.map(k => ({ k, d: DB.days[k] })).filter(x => x.d && isNum(x.d.mood) && x.d.mood >= 0 && x.d.mood <= 10);
  h += '<div class="card"><b>' + tr('Laatste 60 dagen') + '</b><p class="muted small">' + records.length + ' ' + tr('dagen met een stemmingsscore. Een score zegt alleen hoe jij die dag je stemming hebt ingeschat.') + '</p></div>';
  if (records.length < 14) {
    h += '<div class="card note"><b>' + tr('Nog te weinig registraties voor een zinvolle vergelijking') + '</b><p class="small">' + tr('Er zijn minstens 14 stemmingsdagen nodig, en minstens 5 dagen per kant van elke vergelijking. Je hoeft niet elke dag in te vullen.') + '</p></div>';
  } else {
    let cards = '';
    const sleepRows = records.filter(x => isNum(x.d.sleepH)).map(x => ({ x: x.d.sleepH, y: x.d.mood }));
    const underSleep = v => v < Number(DB.goals.sleepH || 7.5), enoughSleep = v => !underSleep(v);
    underSleep.label = 'Onder je slaaprichtpunt'; enoughSleep.label = 'Op/boven je slaaprichtpunt';
    cards += moodComparison('Slaap', 'Slaap is de nacht vóór de stemmingsscore. Een persoonlijk slaaprichtpunt is geen klinische grens.', sleepRows, underSleep, enoughSleep);
    const stressRows = records.filter(x => isNum(x.d.stress) && x.d.stress >= 1 && x.d.stress <= 10).map(x => ({ x: x.d.stress, y: x.d.mood }));
    const moreStress = v => v >= 6, lessStress = v => v < 6; moreStress.label = 'Meer spanning (6–10)'; lessStress.label = 'Minder spanning (1–5)';
    cards += moodComparison('Stress en spanning', 'Je eigen score van 1–10 is een korte dagreflectie, geen gevalideerde psychologische test. De vergelijking laat alleen zien wat in jouw ingevulde dagen samen voorkwam.', stressRows, moreStress, lessStress);
    const alcRows = records.filter(x => isNum(x.d.alcohol) && x.d.alcohol >= 0).map(x => ({ x: x.d.alcohol, y: x.d.mood }));
    const drank = v => v > 0, geenDrank = v => v === 0; drank.label = 'Alcohol geregistreerd'; geenDrank.label = 'Geen alcohol geregistreerd';
    cards += moodComparison('Alcohol', 'Alleen expliciet geregistreerde nul of een positieve waarde telt mee; een ontbrekende registratie is onbekend.', alcRows, drank, geenDrank);
    const nicotineRows = records.map(x => {
      if (Object.hasOwn(x.d, 'nicotineForms')) return Array.isArray(x.d.nicotineForms) ? { x: x.d.nicotineForms.length ? 1 : 0, y: x.d.mood } : null;
      if (Object.hasOwn(MOOD_VAPE, x.d.vape)) return { x: MOOD_VAPE[x.d.vape] > 0 ? 1 : 0, y: x.d.mood };
      return null;
    }).filter(Boolean);
    const nicotine = v => v > 0, noNicotine = v => v === 0; nicotine.label = 'Nicotinegebruik geregistreerd'; noNicotine.label = 'Geen nicotine geregistreerd';
    cards += moodComparison('Nicotinevormen', 'Je kunt meerdere vormen registreren, zoals sigaretten, vapes, nicotinekauwgom en nicotinezakjes. Dit is alleen een vergelijking van je eigen registraties; gebruiksvorm, hoeveelheid en ontbrekende dagen kunnen verschillen.', nicotineRows, nicotine, noNicotine);
    const caffeineRows = records.filter(x => isNum(x.d.caffeine) && x.d.caffeine >= 0).map(x => ({ x: x.d.caffeine, y: x.d.mood }));
    const caffeineLimit = Number.isFinite(DB.goals.caffeineMax) ? DB.goals.caffeineMax : 4;
    const aboveCaffeine = v => v > caffeineLimit, withinCaffeine = v => v <= caffeineLimit;
    aboveCaffeine.label = 'Boven je ingestelde cafeïnegrens'; withinCaffeine.label = 'Binnen je ingestelde cafeïnegrens';
    cards += moodComparison('Cafeïne', 'Porties zijn zelf geregistreerd en meten geen cafeïnedosis of tijdstip. Deze vergelijking beschrijft alleen samen voorkomen en geen effect.', caffeineRows, aboveCaffeine, withinCaffeine);
    const softRows = records.filter(x => isNum(x.d.softDrinkServings) && x.d.softDrinkServings >= 0).map(x => ({ x: x.d.softDrinkServings, y: x.d.mood }));
    const softAny = v => v > 0, softNone = v => v === 0; softAny.label = 'Frisdrank genoteerd'; softNone.label = 'Geen frisdrank genoteerd';
    cards += moodComparison('Frisdrank', 'Porties zijn zelf ingeschat; drankjes die je niet hebt geregistreerd blijven onbekend. Deze vergelijking beschrijft samen voorkomen en geen effect.', softRows, softAny, softNone);
    const sweetRows = records.filter(x => isNum(x.d.sweetsServings) && x.d.sweetsServings >= 0).map(x => ({ x: x.d.sweetsServings, y: x.d.mood }));
    const sweetsAny = v => v > 0, sweetsNone = v => v === 0; sweetsAny.label = 'Snoep of zoetigheid genoteerd'; sweetsNone.label = 'Geen snoep of zoetigheid genoteerd';
    cards += moodComparison('Snoep en zoetigheden', 'Porties zijn zelf ingeschat; niet ingevulde dagen tellen niet mee als nul. De vergelijking kan geen oorzaak of gezondheidseffect aantonen.', sweetRows, sweetsAny, sweetsNone);
    const stepRows = records.filter(x => isNum(x.d.steps)).map(x => ({ x: x.d.steps, y: x.d.mood }));
    const belowSteps = v => v < Number(DB.goals.stepsMin || 0), meetsSteps = v => v >= Number(DB.goals.stepsMin || 0); belowSteps.label = 'Onder je stappendoel'; meetsSteps.label = 'Op/boven je stappendoel';
    cards += moodComparison('Beweging', 'Stappen zijn slechts een deel van beweging; geregistreerde dagen kunnen verschillen van ontbrekende dagen.', stepRows, meetsSteps, belowSteps);
    const fiberRows = records.map(x => ({ x: dayNutr(x.d, 'fiber'), y: x.d.mood })).filter(x => x.x && !x.x.lb && isNum(x.x.v)).map(x => ({ x: x.x.v, y: x.y }));
    const belowFiber = v => v < Number(DB.goals.fiber || 30), meetsFiber = v => v >= Number(DB.goals.fiber || 30); belowFiber.label = 'Onder je vezelrichtpunt'; meetsFiber.label = 'Op/boven je vezelrichtpunt';
    cards += moodComparison('Geregistreerde vezels', 'Dit gaat over voedingsmiddelen met ingevulde voedingswaarden in je dagboek, niet over je volledige voedingskwaliteit.', fiberRows, meetsFiber, belowFiber);
    h += cards || '<div class="card note"><b>' + tr('Per factor nog te weinig gegevens') + '</b><p class="small">' + tr('Een vergelijking verschijnt pas bij minstens vijf dagen per groep. Ontbrekende waarden blijven buiten de berekening.') + '</p></div>';
  }
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
