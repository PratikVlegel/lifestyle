/* Advies en analyses. Offline regels + optionele AI-analyse via eigen API-sleutel.
   Regels: geen diagnose, geen oordeel, nooit aansporen tot eten overslaan of compenseren,
   gewicht nooit als reden om minder te eten. Verbanden zijn geen oorzaken. */
'use strict';

function daysWith(n, endKey) {
  return rangeKeys(endKey || todayKey(), n).map(k => ({ k, d: DB.days[k] })).filter(x => x.d);
}
function pairs(n, fx, fy, shiftY) {
  const out = [];
  for (const k of rangeKeys(todayKey(), n)) {
    const dx = DB.days[k], dy = DB.days[shiftY ? addDays(k, shiftY) : k];
    const x = dx ? fx(dx) : null, y = dy ? fy(dy) : null;
    if (isNum(x) && isNum(y)) out.push({ k, x, y });
  }
  return out;
}
function splitCompare(pts, threshold) {
  const lo = pts.filter(p => p.x < threshold).map(p => p.y), hi = pts.filter(p => p.x >= threshold).map(p => p.y);
  if (lo.length < 2 || hi.length < 2) return null;
  return { lo: avg(lo), hi: avg(hi), nlo: lo.length, nhi: hi.length };
}
function slotKcal(day, slots) {
  let s = 0, any = false;
  for (const m of day.meals || []) if (slots.includes(m.slot) && isNum(m.kcal)) { s += m.kcal; any = true; }
  return any ? s : 0;
}

function buildInsights(n) {
  n = n || 30;
  const out = [];
  const G = DB.goals;
  const recent = daysWith(n, completeKey());
  const add = (cat, title, text, evidence, tone) => out.push({ cat, title, text, evidence, tone: tone || 'info' });

  /* --- Voeding --- */
  const kc = recent.map(x => ({ k: x.k, r: dayNutr(x.d, 'kcal') })).filter(x => x.r);
  const kcFull = kc.filter(x => !x.r.lb);
  if (kcFull.length >= 3) {
    const a = avg(kcFull.map(x => x.r.v));
    const diff = a - G.kcal;
    if (diff < -250) add('voeding', 'Gemiddeld onder je richtpunt',
      'Op dagen die volledig geregistreerd zijn eet je gemiddeld ≈ ' + fmtNum(a) + ' kcal, zo\'n ' + fmtNum(-diff) + ' onder je richtpunt van ' + fmtNum(G.kcal) + '. Structureel ver onder je richtpunt kan later op de dag of \'s nachts sterke honger geven. Een eiwitrijk tussendoortje in de namiddag (bv. skyr, kwark, een handje noten) is een manier om het gat kleiner te maken.',
      kcFull.length + ' volledige dagen', 'tip');
    else if (diff > 300) add('voeding', 'Gemiddeld boven je richtpunt',
      'Op volledig geregistreerde dagen ≈ ' + fmtNum(a) + ' kcal gemiddeld, ' + fmtNum(diff) + ' boven je richtpunt. Kijk in de Kcal-grafiek op welk moment van de dag het meeste binnenkomt; daar zit meestal de makkelijkste aanpassing. Niet compenseren door de volgende dag minder te eten.',
      kcFull.length + ' volledige dagen', 'tip');
    else add('voeding', 'Rond je richtpunt',
      'Volledig geregistreerde dagen zitten gemiddeld op ≈ ' + fmtNum(a) + ' kcal, dicht bij je richtpunt van ' + fmtNum(G.kcal) + '.', kcFull.length + ' volledige dagen', 'good');
  }
  /* Verdeling over de dag: weinig overdag, veel 's avonds/'s nachts */
  const dist = recent.filter(x => (x.d.meals || []).some(m => isNum(m.kcal)) && !x.d.kcalOverride).map(x => {
    const day = slotKcal(x.d, ['ontbijt', 'tussen1', 'lunch', 'tussen2']);
    const eve = slotKcal(x.d, ['avond', 'na']);
    return { k: x.k, day, eve, tot: day + eve };
  }).filter(x => x.tot > 0);
  if (dist.length >= 4) {
    const share = avg(dist.map(x => x.eve / x.tot));
    if (share > 0.5) add('voeding', 'Het grootste deel komt \'s avonds',
      'Gemiddeld ' + Math.round(share * 100) + '% van je geregistreerde kcal komt bij of na het avondeten. Bij een rustig ontbijt en een kleine lunch is avondhonger een logisch gevolg. Een stevigere lunch of een vast tussendoortje rond 16 u spreidt het beter; zo hoeft het avondeten minder op te vangen.',
      dist.length + ' dagen', 'tip');
    const nightDays = recent.filter(x => (x.d.meals || []).some(m => m.slot === 'na' && !m.nothing));
    if (nightDays.length >= 2) {
      const lowDay = nightDays.filter(x => slotKcal(x.d, ['ontbijt', 'tussen1', 'lunch', 'tussen2']) < 800).length;
      add('voeding', 'Eten na het avondeten',
        'Op ' + nightDays.length + ' van de ' + recent.length + ' dagen at je nog iets na het avondeten. ' + (lowDay ? 'Op ' + lowDay + ' daarvan kwam er vóór 19 u minder dan 800 kcal binnen. ' : '') + 'Dit is een patroon om met je diëtist te bespreken, geen fout.',
        nightDays.length + ' dagen', 'info');
    }
  }
  const pr = recent.map(x => dayNutr(x.d, 'protein')).filter(r => r && !r.lb);
  if (pr.length >= 3) {
    const a = avg(pr.map(r => r.v));
    if (a < G.protein * 0.85) add('voeding', 'Eiwit onder je doel', 'Gemiddeld ≈ ' + fmtNum(a) + ' g eiwit per dag, je doel is ' + G.protein + ' g. Eiwit verzadigt goed; een eiwitbron bij het ontbijt (eieren, skyr, kwark) helpt het meest, want daar zit nu vaak weinig.', pr.length + ' dagen', 'tip');
    else add('voeding', 'Eiwit op niveau', 'Gemiddeld ≈ ' + fmtNum(a) + ' g eiwit per dag (doel ' + G.protein + ' g).', pr.length + ' dagen', 'good');
  }
  const fb = recent.map(x => dayNutr(x.d, 'fiber')).filter(r => r && !r.lb);
  if (fb.length >= 3) {
    const a = avg(fb.map(r => r.v));
    if (a < G.fiber * 0.8) add('voeding', 'Vezels', 'Gemiddeld ≈ ' + fmtNum(a) + ' g vezels (doel ' + G.fiber + ' g). Peulvruchten, volkoren en groenten in je mealprep zijn de makkelijkste bron.', fb.length + ' dagen', 'tip');
  }

  /* --- Drinken, cafeïne, alcohol --- */
  const wat = recent.map(x => x.d.waterMl).filter(isNum);
  if (wat.length >= 3) {
    const a = avg(wat);
    if (a < G.waterMl * 0.85) add('voeding', 'Water', 'Gemiddeld ≈ ' + fmtNum(a / 1000, 1) + ' l per dag (doel ' + fmtNum(G.waterMl / 1000, 1) + ' l). Een glas bij elke check-in is een simpele gewoonte.', wat.length + ' dagen', 'tip');
  }
  const cafSleep = pairs(n, d => d.caffeine, d => d.sleepH, 1);
  const cs = splitCompare(cafSleep, 3);
  if (cs && cs.hi < cs.lo - 0.4) add('slaap', 'Cafeïne en de nacht erna',
    'Na dagen met 3 of meer shots sliep je gemiddeld ' + fmtNum(cs.hi, 1) + ' u, na rustigere dagen ' + fmtNum(cs.lo, 1) + ' u. Cafeïne werkt 5–6 uur na; probeer de laatste koffie vóór 14 u.', cs.nhi + ' + ' + cs.nlo + ' dagen', 'tip');
  const alcNext = pairs(n, d => d.alcohol, d => d.energy, 1);
  const ae = splitCompare(alcNext, 1);
  if (ae && ae.hi < ae.lo - 0.5) add('stemming', 'Alcohol en de dag erna',
    'De dag na het drinken was je energie gemiddeld ' + fmtNum(ae.hi, 1) + '/10, tegenover ' + fmtNum(ae.lo, 1) + '/10 na dagen zonder.', ae.nhi + ' + ' + ae.nlo + ' dagen', 'info');

  /* --- Activiteit --- */
  const st = recent.map(x => ({ k: x.k, v: x.d.steps })).filter(x => isNum(x.v));
  if (st.length >= 3) {
    const last7 = st.filter(x => x.k > addDays(todayKey(), -7)).map(x => x.v);
    const prev7 = st.filter(x => x.k <= addDays(todayKey(), -7) && x.k > addDays(todayKey(), -14)).map(x => x.v);
    const a7 = avg(last7.length ? last7 : st.map(x => x.v));
    let t = tr('Laatste 7 dagen gemiddeld') + ' ' + fmtNum(a7) + ' ' + tr('stappen (doel') + ' ' + fmtNum(G.stepsMin) + '–' + fmtNum(G.stepsMax) + ').';
    if (prev7.length >= 3) t += ' ' + tr('De week ervoor:') + ' ' + fmtNum(avg(prev7)) + '.';
    let tone = 'good';
    if (a7 < G.stepsMin) { t += ' ' + tr('Een korte wandeling van 10 minuten na de lunch of het avondeten levert ≈ 1.000 stappen op en helpt ook je bloedsuiker na de maaltijd.'); tone = 'tip'; }
    else if (a7 > G.stepsMax) t += ' ' + tr('Boven je doel. Fijn, en geen reden om op andere dagen te compenseren.');
    else t += ' ' + tr('Mooi binnen je doel; geen extra compensatiestappen nodig.');
    add('activiteit', 'Stappen', t, st.length + ' dagen', tone);
    const wk = [0, 1, 2, 3, 4, 5, 6].map(w => avg(st.filter(x => parseKey(x.k).getDay() === w).map(x => x.v)));
    const valid = wk.map((v, i) => ({ v, i })).filter(x => isNum(x.v));
    if (valid.length >= 5) {
      const low = valid.reduce((a, b) => (b.v < a.v ? b : a));
      add('activiteit', 'Rustigste dag', 'Op ' + WD[low.i] + ' zet je gemiddeld het minst stappen (' + fmtNum(low.v) + '). Een vaste wandeling op die dag plannen is het makkelijkste winstpunt.', valid.length + ' weekdagen', 'info');
    }
  }
  if (DB.settings.moodInsights === true) {
    const stMood = pairs(n, d => d.steps, d => d.mood);
    const rs = pearson(stMood);
    if (rs !== null && rs > 0.35 && stMood.length >= 14) add('stemming', 'Bewegen en stemming', 'Op dagen met meer stappen lag je stemming-score gemiddeld samen hoger. Dit beschrijft je registraties en zegt niet wat oorzaak is.', stMood.length + ' dagen', 'info');
  }

  /* --- Slaap en stemming --- */
  const slEn = pairs(n, d => d.sleepH, d => d.energy);
  const se = splitCompare(slEn, G.sleepH - 0.5);
  if (se && Math.abs(se.hi - se.lo) >= 0.7) add('slaap', 'Slaap en energie',
    'Na nachten van ' + fmtNum(G.sleepH - 0.5, 1) + ' u of meer: energie ' + fmtNum(se.hi, 1) + '/10. Na kortere nachten: ' + fmtNum(se.lo, 1) + '/10.', se.nhi + ' + ' + se.nlo + ' dagen', se.hi > se.lo ? 'tip' : 'info');
  if (DB.settings.moodInsights === true) {
    const slMood = pairs(n, d => d.sleepH, d => d.mood);
    const sm = pearson(slMood);
    if (sm !== null && Math.abs(sm) > 0.3 && slMood.length >= 14) add('stemming', 'Slaap en stemming', 'Slaapduur en je stemming-score bewogen in deze registraties samen. Dit is een beschrijving, geen aanwijzing voor oorzaak.', slMood.length + ' dagen', 'info');
  }
  const cp = recent.filter(x => x.d.cpap && isNum(x.d.energy));
  const cpFull = cp.filter(x => /hele|ja/i.test(x.d.cpap) && !/deels|vanaf|nee/i.test(x.d.cpap)).map(x => x.d.energy);
  const cpNot = cp.filter(x => /nee|deels|vanaf/i.test(x.d.cpap)).map(x => x.d.energy);
  if (cpFull.length >= 2 && cpNot.length >= 2) add('slaap', 'CPAP', 'Met CPAP de hele nacht: energie gemiddeld ' + fmtNum(avg(cpFull), 1) + '/10. Zonder of maar een deel van de nacht: ' + fmtNum(avg(cpNot), 1) + '/10.', cpFull.length + ' + ' + cpNot.length + ' dagen', 'tip');

  /* --- Gewicht --- */
  const w = recent.map(x => ({ k: x.k, v: x.d.weight })).filter(x => isNum(x.v));
  if (w.length >= 2) {
    const a1 = avg(w.slice(-7).map(x => x.v));
    let t = 'Weekgemiddelde ≈ ' + fmtNum(a1, 1) + ' kg over ' + Math.min(7, w.length) + ' wegingen.';
    if (w.length >= 10) { const a0 = avg(w.slice(-14, -7).map(x => x.v)); if (isNum(a0)) t += ' De 7 wegingen daarvoor: ' + fmtNum(a0, 1) + ' kg.'; }
    t += ' Gewicht schommelt van dag tot dag 1–2 kg door vocht, zout, alcohol en restauranteten; kijk alleen naar het verloop over weken.';
    add('gewicht', 'Gewichtsverloop', t, w.length + ' wegingen', 'info');
  }

  /* --- Mealpreps: wat werkt voor jou --- */
  const fbs = DB.preps.filter(p => p.feedback);
  if (fbs.length) {
    const big = fbs.filter(p => p.feedback.portion === 'te groot' || p.feedback.eat === 'moeilijk');
    const hungry = fbs.filter(p => p.feedback.fullness === 'snel weer honger');
    const fav = fbs.filter(p => p.feedback.again === 'ja' && (p.feedback.taste || 0) >= 4);
    let t = '';
    if (fav.length) t += 'Favorieten om opnieuw te maken: ' + fav.map(p => p.name).join(', ') + '. ';
    if (big.length) t += 'Te groot of moeilijk op te eten: ' + big.map(p => p.name).join(', ') + '. Verdeel zo\'n prep over meer porties of minder volume (minder groenten of rijst per portie), eerder dan maaltijden over te slaan. ';
    if (hungry.length) t += 'Snel weer honger na: ' + hungry.map(p => p.name).join(', ') + '. Meer eiwit of vezels per portie helpt meestal om langer verzadigd te blijven.';
    if (t) add('voeding', 'Wat je van je mealpreps vond', t.trim(), fbs.length + ' beoordeelde mealprep' + (fbs.length > 1 ? 's' : ''), big.length || hungry.length ? 'tip' : 'good');
  }
  /* --- Beweging --- */
  const burns = recent.map(x => ({ k: x.k, v: dayBurn(x.d, x.k) })).filter(x => isNum(x.v));
  if (burns.length >= 3) {
    const acts = recent.reduce((n, x) => n + (x.d.activities || []).length, 0);
    add('activiteit', 'Beweging', 'Gemiddeld ≈ ' + fmtNum(avg(burns.map(x => x.v))) + ' kcal extra per dag door bewegen (stappen' + (acts ? ' en ' + acts + ' andere activiteit' + (acts > 1 ? 'en' : '') : '') + '). Dat is een ruwe schatting; zie het als een maat voor hoe actief je was, niet als iets om met eten te verrekenen.', burns.length + ' dagen', 'info');
  }

  /* --- Registratie --- */
  const missing = rangeKeys(completeKey(), 7).filter(k => !DB.days[k] || !(DB.days[k].meals || []).length).length;
  if (missing >= 3) add('registratie', 'Gaten in de registratie', missing + ' van de laatste 7 dagen hebben geen maaltijden. Hoe vollediger, hoe betrouwbaarder de analyses.', '7 dagen', 'info');

  if (typeof moreInsights === 'function') { try { moreInsights(n, recent, add); } catch (e) { console.warn('inzichten', e); } }
  return out;
}

/* ---------- AI (optioneel, eigen sleutel) ---------- */
function aiContext(n) {
  n = n || 21;
  const rows = rangeKeys(todayKey(), n).map(k => {
    const d = DB.days[k];
    if (!d) return null;
    const kc = dayNutr(d, 'kcal'), pr = dayNutr(d, 'protein');
    const meals = (d.meals || []).map(m => SLOTS[m.slot] + ': ' + (m.nothing ? 'niets' : m.desc) + (isNum(m.kcal) ? ' (≈' + Math.round(m.kcal) + ' kcal)' : ' (kcal onbekend)')).join('; ');
    const nicotine = Array.isArray(d.nicotineForms) ? (d.nicotineForms.length ? d.nicotineForms.join(',') : 'geen nicotine') : d.nicotineForms === null ? '?' : d.vape ?? '?';
    return [k, kc ? (kc.lb ? '≥' : '≈') + kc.v : '?', pr ? Math.round(pr.v) : '?', d.sleepH ?? '?', d.cpap ?? '?', d.energy ?? '?', d.mood ?? '?', d.steps ?? '?', isNum(d.waterMl) ? d.waterMl : '?', d.caffeine ?? '?', d.alcohol ?? '?', nicotine, d.softDrinkServings ?? '?', d.sweetsServings ?? '?', d.weight ?? '?', (d.moodNote || '') + ' ' + (d.notes || ''), meals].join(' | ');
  }).filter(Boolean);
  const P = DB.profile, G = DB.goals;
  return 'PROFIEL: ' + [P.name, P.sex === 'v' ? 'vrouw' : 'man', P.age ? P.age + ' jaar' : '', P.heightCm ? P.heightCm + ' cm' : '', P.activity].filter(Boolean).join(', ') +
    '\nCONTEXT: ' + (P.notes || '-') +
    '\nDOELEN: ' + G.kcal + ' kcal, ' + G.protein + ' g eiwit, ' + G.fiber + ' g vezels, ' + G.waterMl + ' ml water, ' + G.stepsMin + '–' + G.stepsMax + ' stappen, ' + G.sleepH + ' u slaap' +
    '\nDAGEN (datum | kcal | eiwit g | slaap u (nacht ervoor) | CPAP | energie/10 | stemming/10 | stappen | water ml | cafeïne shots | alcohol glazen | nicotinevormen | suikerhoudende frisdrank porties | snoep/zoetigheden porties | gewicht kg | notities | maaltijden):\n' + rows.join('\n');
}
const AI_SYSTEM = 'Je bent een ondersteunende leefstijlcoach voor de gebruiker van een voedingsdagboek-app. ' + ({ 'nl-BE': 'Schrijf in het Nederlands (Vlaams, informeel, je/jij), kort en concreet', 'en-GB': 'Write in English in a friendly, concise and practical tone', 'fr-FR': 'Répondez en français avec un ton chaleureux, concis et concret', 'de-DE': 'Antworte auf Deutsch in einem freundlichen, knappen und konkreten Ton' }[currentLocale()] || 'Schrijf in het Nederlands, kort en concreet') + '. ' +
  'Strikte regels: geen diagnose (ook niet over slaap, stemming of eetgedrag); geen oordeel of schuldgevoel; nooit aansporen tot maaltijden overslaan, compenseren of extra sporten als straf; gewicht nooit als reden om minder te eten, alleen het verloop over weken benoemen; calorieën zijn ruwe schattingen, zeg dat; verbanden zijn geen oorzaken, zeg hoe zeker je bent op basis van het aantal dagen; verzin geen gegevens, wat "?" is, is onbekend. ' +
  'Verwijs bij aanhoudende somberheid, slaap- of eetproblemen vriendelijk naar diëtist, huisarts of psycholoog. ' +
  'Opbouw: 1) wat valt op (max 4 punten, met cijfers uit de data), 2) mogelijke verklaringen voor hoe de gebruiker zich voelt, 3) max 3 kleine, haalbare acties voor de komende week (voeding, stappen/activiteit, slaap). Gebruik korte alinea\'s en opsommingen met "- ".';

async function askAI(question) {
  const S = DB.settings;
  if (!S.apiKey) throw new Error('Geen API-sleutel ingesteld (Meer → AI).');
  if (!navigator.onLine) throw new Error('Je bent offline. De offline adviezen hierboven werken wel.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': S.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({
      model: S.model || 'claude-sonnet-4-5', max_tokens: 1500, system: AI_SYSTEM,
      messages: [{ role: 'user', content: aiContext(21) + '\n\nVRAAG: ' + (question || 'Analyseer mijn laatste 3 weken en geef advies.') }]
    })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j.error && j.error.message) || ('Fout ' + res.status));
  return (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
}

/* AI leest een etiket-foto → voedingswaarden per 100 g. */
async function aiReadLabel(file) {
  const S = DB.settings;
  if (!S.apiKey) throw new Error('Geen API-sleutel ingesteld.');
  const b64 = await downscale(file);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': S.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({
      model: S.model || 'claude-sonnet-4-5', max_tokens: 400,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
        { type: 'text', text: 'Lees de voedingswaardetabel op dit etiket. Antwoord ALLEEN met JSON: {"name":"productnaam of null","kcal":per 100 g,"protein":g,"carbs":g,"fat":g,"fiber":g}. Gebruik null voor wat er niet staat. Als alleen per portie vermeld is, reken om naar 100 g als de portiegrootte vermeld is.' }
      ] }]
    })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j.error && j.error.message) || ('Fout ' + res.status));
  const txt = (j.content || []).map(c => c.text || '').join('');
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Kon het etiket niet lezen.');
  return JSON.parse(m[0]);
}

/* AI zet een markdown-dagboek om naar app-data. */
async function aiImportMarkdown(md) {
  const S = DB.settings;
  if (!S.apiKey) throw new Error('Geen API-sleutel ingesteld.');
  const schema = '{"profile":{"name":"","sex":"m|v","age":0,"heightCm":0,"notes":""},"goals":{"kcal":0,"stepsMin":0,"stepsMax":0},"days":{"YYYY-MM-DD":{"weight":null,"sleepH":null,"cpap":"","energy":null,"mood":null,"moodNote":"","steps":null,"waterMl":null,"caffeine":null,"alcohol":null,"nicotineForms":[],"softDrinkServings":null,"sweetsServings":null,"notes":"","kcalOverride":{"v":0,"lb":false},"meals":[{"id":"uniek","slot":"ontbijt|tussen1|lunch|tussen2|avond|na","time":"HH:MM","desc":"","kcal":null,"protein":null,"fiber":null}]}}}';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': S.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({
      model: S.model || 'claude-sonnet-4-5', max_tokens: 16000,
      messages: [{ role: 'user', content: 'Zet dit voedingsdagboek om naar JSON volgens dit schema: ' + schema + '\nRegels: verzin niets; onbekend = null; slaap bij een dag = de nacht ervoor; kcalOverride enkel als er een dagtotaal staat maar geen kcal per maaltijd. Antwoord ALLEEN met de JSON.\n\n' + md.slice(0, 150000) }]
    })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j.error && j.error.message) || ('Fout ' + res.status));
  const txt = (j.content || []).map(c => c.text || '').join('');
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Geen bruikbare JSON terug gekregen.');
  return JSON.parse(m[0]);
}

function downscale(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/* Tekstsamenvatting om te delen met diëtist of in een Claude-chat te plakken. */
function weekSummaryText(n) {
  n = n || 7;
  const lines = [trf('Samenvatting van de laatste {count} dagen ({start} – {end})', { count: n, start: fmtDay(addDays(todayKey(), -(n - 1))), end: fmtDay(todayKey()) }), ''];
  for (const k of rangeKeys(todayKey(), n)) {
    const d = DB.days[k]; if (!d) { lines.push(fmtDay(k, true) + ': ' + tr('Geen registratie')); continue; }
    const kc = dayNutr(d, 'kcal');
    lines.push(fmtDay(k, true) + ': ' + (kc ? (kc.lb ? '≥ ' : '≈ ') + fmtNum(kc.v) + ' kcal' : tr('Kcal onbekend')) +
      ' · ' + tr('Slaap') + ' ' + (d.sleepH ?? '?') + ' ' + tr('hours') + ' · ' + tr('Energie') + ' ' + (d.energy ?? '?') + ' · ' + tr('Stemming') + ' ' + (d.mood ?? '?') + ' · ' + (d.steps ?? '?') + ' ' + tr('Stappen').toLocaleLowerCase(currentLocale()) + ' · ' + tr('Water').toLocaleLowerCase(currentLocale()) + ' ' + (isNum(d.waterMl) ? fmtNum(d.waterMl / 1000, 1) + ' l' : '?') + (isNum(d.weight) ? ' · ' + d.weight + ' kg' : ''));
    for (const s of SLOT_ORDER) for (const m of (d.meals || []).filter(m => m.slot === s)) lines.push('   ' + tr(SLOTS[s]) + (m.time ? ' ' + m.time : '') + ': ' + (m.nothing ? tr('niets') : m.desc) + (isNum(m.kcal) ? ' (≈ ' + Math.round(m.kcal) + ' kcal)' : ''));
    if (d.notes || d.moodNote) lines.push('   ' + tr('Notitie:') + ' ' + [d.moodNote, d.notes].filter(Boolean).join(' · '));
  }
  lines.push('', tr('Kcal zijn ruwe schattingen. Slaap slaat op de nacht vóór die dag.'));
  return lines.join('\n');
}
