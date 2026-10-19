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
  if (a.length < 5 || b.length < 5) return '';
  const delta = moodMedian(a) - moodMedian(b);
  const direction = Math.abs(delta) < 0.5 ? 'De middelste stemming-score was in beide groepen vergelijkbaar.' : delta > 0 ? 'De middelste stemming-score was hoger in de eerste groep.' : 'De middelste stemming-score was lager in de eerste groep.';
  return '<article class="card mood-factor"><div class="mood-factor-head"><h3>' + esc(title) + '</h3><span class="pill">' + rows.length + ' dagen</span></div>' +
    '<div class="mood-groups"><div><span>' + esc(groupA.label) + '</span><b>' + fmtNum(moodMedian(a), 1) + '<small>/10</small></b><small>' + a.length + ' dagen</small></div><div><span>' + esc(groupB.label) + '</span><b>' + fmtNum(moodMedian(b), 1) + '<small>/10</small></b><small>' + b.length + ' dagen</small></div></div>' +
    '<p>' + direction + '</p><p class="muted small">' + esc(note) + ' Dit is een persoonlijke beschrijving, geen bewijs van oorzaak of een medische beoordeling.</p></article>';
}
function renderMoodModule() {
  const enabled = DB.settings.moodInsights === true;
  let h = header('Stemming en gewoontes', 'Een rustige terugblik op je eigen registraties', true);
  h += '<div class="card mood-intro"><h2>Wat valt samen met hoe je je voelt?</h2><p>Deze optionele module vergelijkt je stemming met slaap, alcohol, vapen, beweging en geregistreerde vezels. Ze zoekt geen diagnose en gebruikt je vrije notities niet.</p><label class="toggle"><input type="checkbox" data-chg="setMoodInsights"' + (enabled ? ' checked' : '') + '><span>Persoonlijke vergelijkingen inschakelen</span></label><p class="muted small">Alles wordt op dit toestel berekend. Alleen dagen waarop beide waarden zijn ingevuld tellen mee. Uitgeschakelde of niet ingevulde waarden worden niet als nul gezien.</p></div>';
  if (!enabled) {
    h += '<div class="card muted">Je stemming wordt niet met andere gewoontes vergeleken. Schakel de optie hierboven in als je dat zelf wilt.</div>';
    view().innerHTML = h; return;
  }
  const keys = rangeKeys(todayKey(), 60), records = keys.map(k => ({ k, d: DB.days[k] })).filter(x => x.d && isNum(x.d.mood) && x.d.mood >= 0 && x.d.mood <= 10);
  h += '<div class="card"><b>Laatste 60 dagen</b><p class="muted small">' + records.length + ' dagen met een stemmingsscore. Een score zegt alleen hoe jij die dag je stemming hebt ingeschat.</p></div>';
  if (records.length < 14) {
    h += '<div class="card note"><b>Nog te weinig registraties voor een zinvolle vergelijking</b><p class="small">Er zijn minstens 14 stemmingsdagen nodig, en minstens 5 dagen per kant van elke vergelijking. Je hoeft niet elke dag in te vullen.</p></div>';
  } else {
    let cards = '';
    const sleepRows = records.filter(x => isNum(x.d.sleepH)).map(x => ({ x: x.d.sleepH, y: x.d.mood }));
    const underSleep = v => v < Number(DB.goals.sleepH || 7.5), enoughSleep = v => !underSleep(v);
    underSleep.label = 'Onder je slaaprichtpunt'; enoughSleep.label = 'Op/boven je slaaprichtpunt';
    cards += moodComparison('Slaap', 'Slaap is de nacht vóór de stemmingsscore. Een persoonlijk slaaprichtpunt is geen klinische grens.', sleepRows, underSleep, enoughSleep);
    const alcRows = records.filter(x => isNum(x.d.alcohol) && x.d.alcohol >= 0).map(x => ({ x: x.d.alcohol, y: x.d.mood }));
    const drank = v => v > 0, geenDrank = v => v === 0; drank.label = 'Alcohol geregistreerd'; geenDrank.label = 'Geen alcohol geregistreerd';
    cards += moodComparison('Alcohol', 'Alleen expliciet geregistreerde nul of een positieve waarde telt mee; een ontbrekende registratie is onbekend.', alcRows, drank, geenDrank);
    const vapeRows = records.filter(x => Object.hasOwn(MOOD_VAPE, x.d.vape)).map(x => ({ x: MOOD_VAPE[x.d.vape], y: x.d.mood }));
    const nicotine = v => v > 0, noNicotine = v => v === 0; nicotine.label = 'Nicotinegebruik gemeld'; noNicotine.label = '“Niet” geregistreerd';
    cards += moodComparison('Vapen', 'De registratie gaat over vapen, niet over alle mogelijke nicotinebronnen. De frequentie is een grove zelfrapportage en zegt niets over oorzaak of hoeveelheid nicotine.', vapeRows, nicotine, noNicotine);
    const stepRows = records.filter(x => isNum(x.d.steps)).map(x => ({ x: x.d.steps, y: x.d.mood }));
    const belowSteps = v => v < Number(DB.goals.stepsMin || 0), meetsSteps = v => v >= Number(DB.goals.stepsMin || 0); belowSteps.label = 'Onder je stappendoel'; meetsSteps.label = 'Op/boven je stappendoel';
    cards += moodComparison('Beweging', 'Stappen zijn slechts een deel van beweging; geregistreerde dagen kunnen verschillen van ontbrekende dagen.', stepRows, meetsSteps, belowSteps);
    const fiberRows = records.map(x => ({ x: dayNutr(x.d, 'fiber'), y: x.d.mood })).filter(x => x.x && !x.x.lb && isNum(x.x.v)).map(x => ({ x: x.x.v, y: x.y }));
    const belowFiber = v => v < Number(DB.goals.fiber || 30), meetsFiber = v => v >= Number(DB.goals.fiber || 30); belowFiber.label = 'Onder je vezelrichtpunt'; meetsFiber.label = 'Op/boven je vezelrichtpunt';
    cards += moodComparison('Geregistreerde vezels', 'Dit gaat over voedingsmiddelen met ingevulde voedingswaarden in je dagboek, niet over je volledige voedingskwaliteit.', fiberRows, meetsFiber, belowFiber);
    h += cards || '<div class="card note"><b>Per factor nog te weinig gegevens</b><p class="small">Een vergelijking verschijnt pas bij minstens vijf dagen per groep. Ontbrekende waarden blijven buiten de berekening.</p></div>';
  }
  h += '<div class="card mood-care"><h3>Als je stemming je zorgen baart</h3><p>Een dagboek kan helpen om je eigen ervaringen te bespreken, maar vervangt geen gesprek met een huisarts of andere zorgverlener. Neem contact op als een sombere stemming langer aanhoudt of je dagelijks leven beïnvloedt.</p><a href="https://www.nhs.uk/mental-health/feelings-symptoms-behaviours/feelings-and-symptoms/low-mood-sadness-depression/" target="_blank" rel="noopener">NHS: omgaan met een lage stemming</a></div>';
  view().innerHTML = h;
}
ACT.setMoodInsights = el => { DB.settings.moodInsights = !!el.checked; save(); renderMoodModule(); };

function renderEvidenceAdvice() {
  const items = [
    ['Beweging', 'Werk op naar 150–300 minuten matig intensieve beweging per week, of 75–150 minuten intensieve beweging, en doe minstens 2 dagen spierversterkende activiteit. Begin lager als je nu weinig beweegt; elke haalbare stap telt.', 'WHO · beweegrichtlijnen', 'https://www.who.int/news-room/fact-sheets/detail/physical-activity'],
    ['Slaapritme', 'Een vaste bed- en opstaantijd kan helpen een regelmatige routine te houden. Alcohol kan slaap verstoren; nicotine is stimulerend. Kijk wat je zelf merkt en verander één gewoonte tegelijk.', 'NIH · Healthy Sleep', 'https://health.nih.gov/health-topics/healthy-sleep'],
    ['Voeding', 'Richt maaltijden op variatie, voldoende voedingsstoffen en een haalbare balans. Groente, fruit, peulvruchten en volkorenproducten zijn praktische bronnen van vezels; verhoog vezels geleidelijk en drink naar behoefte.', 'WHO · gezonde voeding', 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet'],
    ['Alcohol en welzijn', 'Alcoholgebruik kan samengaan met veranderingen in slaap en mentaal welzijn. Een dagboek laat alleen persoonlijke patronen zien en kan niet bepalen wat bij jou de oorzaak is.', 'Trimbos · alcohol en mentale gezondheid', 'https://www.trimbos.nl/kennis/alcohol/alcohol-en-mentale-gezondheid/'],
    ['Lage stemming', 'Kleine, regelmatige activiteiten, contact met iemand die je vertrouwt en routine kunnen steun geven. Als een lage stemming langer aanhoudt of je dagelijks leven raakt, bespreek dit met je huisarts.', 'NHS · low mood', 'https://www.nhs.uk/mental-health/feelings-symptoms-behaviours/feelings-and-symptoms/low-mood-sadness-depression/']
  ];
  return '<div class="evidence-grid">' + items.map(([title, body, source, url]) => '<article class="card evidence-card"><span class="pill">' + title + '</span><p>' + body + '</p><a href="' + url + '" target="_blank" rel="noopener">' + source + ' ↗</a></article>').join('') + '</div>';
}
