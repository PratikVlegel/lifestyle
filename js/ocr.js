/* Gratis tekstherkenning van een voedingswaardetabel, volledig op het toestel (Tesseract.js).
   De eerste keer worden ±7 MB herkenningsbestanden geladen; daarna werkt het offline.

   Werkwijze:
   1. Foto verkleinen/vergroten en omzetten naar grijs.
   2. Eerste leesronde op de hele foto (adaptief zwart-wit gemaakt) om de tabel te vinden:
      we zoeken woorden als energie, vet, eiwit… en hun positie.
   3. Alleen dat stuk uitsnijden, recht zetten, vergroten tot leesbare letterhoogte en opnieuw lezen.
   4. Van elke leesronde de waarden uitlezen en de beste kiezen (meeste waarden, klopt met de energie). */
'use strict';

let OCR_WORKER = null;
let OCR_PROGRESS = null;   // voortgang van de huidige leesopdracht
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector('script[src="' + src + '"]')) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Kon ' + src + ' niet laden. Ben je offline en is de tekstherkenning nog nooit gebruikt?'));
    document.head.appendChild(s);
  });
}
async function getOcrWorker(onProgress) {
  OCR_PROGRESS = onProgress;
  if (OCR_WORKER) return OCR_WORKER;
  await loadScript('ocr/tesseract.min.js');
  OCR_WORKER = await Tesseract.createWorker('nld', 1, {
    workerPath: new URL('ocr/worker.min.js', location.href).href,
    corePath: new URL('ocr/core/', location.href).href,
    langPath: new URL('ocr/lang', location.href).href,
    gzip: true,
    workerBlobURL: false,
    logger: m => OCR_PROGRESS && OCR_PROGRESS(m)
  });
  await OCR_WORKER.setParameters({ preserve_interword_spaces: '1', user_defined_dpi: '300' });
  return OCR_WORKER;
}

/* ---------- beeldbewerking ---------- */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Kon de foto niet openen.')); };
    img.src = url;
  });
}
/* Grijswaarden van (een stuk van) een afbeelding, geschaald en eventueel gedraaid. */
function grayFrom(src, sx, sy, sw, sh, scale, angleDeg) {
  const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  if (angleDeg) { ctx.translate(w / 2, h / 2); ctx.rotate(-angleDeg * Math.PI / 180); ctx.translate(-w / 2, -h / 2); }
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
  const p = ctx.getImageData(0, 0, w, h).data;
  const g = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
  return { g, w, h };
}
/* Lichte tekst op een donkere achtergrond? Dan omkeren, zodat de tekst donker is. */
function maybeInvert(G) {
  let sum = 0, n = 0;
  for (let j = 0; j < G.g.length; j += 7) { sum += G.g[j]; n++; }
  if (sum / n >= 115) return G;
  const g = new Uint8ClampedArray(G.g.length);
  for (let j = 0; j < g.length; j++) g[j] = 255 - G.g[j];
  return { g, w: G.w, h: G.h };
}
/* Adaptieve drempel (Bradley): elk pixel vergelijken met het gemiddelde van zijn omgeving.
   Zo blijven schaduw, glans en een gekleurde achtergrond geen probleem. */
function binarize(G, win, t) {
  const { g, w, h } = G;
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
  }
  const mean = (x, y, r) => {
    const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    return (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
  };
  const r = Math.max(4, Math.round(win / 2)), R = r * 4, out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = g[y * w + x], m = mean(x, y, r);
      // in een donker vlak (bv. witte letters op blauw) is de inkt juist lichter dan de omgeving
      const dark = mean(x, y, R) < 105;
      out[y * w + x] = (dark ? v > m * (1 + t) + 6 : v < m * (1 - t)) ? 0 : 255;
    }
  }
  return { g: out, w, h };
}
function toCanvas(G) {
  const c = document.createElement('canvas'); c.width = G.w; c.height = G.h;
  const ctx = c.getContext('2d'); const d = ctx.createImageData(G.w, G.h);
  for (let i = 0, j = 0; j < G.g.length; i += 4, j++) { d.data[i] = d.data[i + 1] = d.data[i + 2] = G.g[j]; d.data[i + 3] = 255; }
  ctx.putImageData(d, 0, 0);
  return c;
}

/* ---------- tabel zoeken ---------- */
const KEY_RE = /(energ|kcal|kj\b|vet|fett?\b|fat|gras|lipid|koolh|kohlenh|carbo|gluci|suiker|sucre|sugar|zucker|vezel|fibre|fiber|ballast|eiwit|eiwei|prot[eé]|zout|\bsel\b|salt|salz|voedingsw|nutri|n[aä]hrw|100\s*g)/i;
async function recognize(w, canvas, psm) {
  await w.setParameters({ tessedit_pageseg_mode: String(psm) });
  const { data } = await w.recognize(canvas);
  return data;
}
/* Kader rond de regels die op een voedingstabel lijken, plus de helling van de tekst. */
function findTable(data) {
  const lines = (data.lines || []).filter(l => l.text && l.bbox);
  const hits = lines.filter(l => KEY_RE.test(l.text) && /\d/.test(l.text) || /voedingsw|nutri|n[aä]hrw|valeurs/i.test(l.text));
  const words = (data.words || []).filter(wd => wd.bbox && KEY_RE.test(wd.text));
  const boxes = hits.map(l => l.bbox).concat(words.map(wd => wd.bbox));
  if (boxes.length < 2) return null;
  // mediaan om uitschieters (ingrediëntenlijst, losse woorden) weg te laten
  const ys = boxes.map(b => (b.y0 + b.y1) / 2).sort((a, b) => a - b);
  const hs = (data.words || []).filter(wd => wd.bbox && /^[a-zà-ÿ]{3,}$/i.test(wd.text)).map(wd => wd.bbox.y1 - wd.bbox.y0).sort((a, b) => a - b);
  const lh = hs.length ? hs[Math.floor(hs.length / 2)] : 20;
  const mid = ys[Math.floor(ys.length / 2)];
  const keep = boxes.filter(b => Math.abs((b.y0 + b.y1) / 2 - mid) < lh * 18);
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const b of keep) { box.x0 = Math.min(box.x0, b.x0); box.y0 = Math.min(box.y0, b.y0); box.x1 = Math.max(box.x1, b.x1); box.y1 = Math.max(box.y1, b.y1); }
  // helling uit de basislijnen van de gevonden regels
  const angles = hits.map(l => l.baseline).filter(b => b && b.x1 - b.x0 > lh * 4).map(b => Math.atan2(b.y1 - b.y0, b.x1 - b.x0) * 180 / Math.PI).sort((a, b) => a - b);
  const angle = angles.length ? angles[Math.floor(angles.length / 2)] : 0;
  return { box, lh, angle: Math.abs(angle) > 0.4 && Math.abs(angle) < 20 ? angle : 0 };
}

/* ---------- hoofdfunctie ---------- */
async function ocrLabel(file, onProgress) {
  const img = await loadImage(file);
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const w = await getOcrWorker(onProgress);
  const s0 = Math.min(3, 1800 / Math.max(W, H));
  const full = maybeInvert(grayFrom(img, 0, 0, W, H, s0, 0));
  const texts = [], passes = [];
  let score = 0;
  let bestText = '', bestScore = -1;
  const consider = (data, label) => {
    texts.push(data.text || ''); passes.push(label);
    const sc = valueScore(parseNutrition([data.text || '']));
    if (sc > bestScore) { bestScore = sc; bestText = data.text || ''; }
    return valueScore(parseNutrition(texts));
  };

  // 1. hele foto: eerst automatische opmaak, lukt dat niet dan als één tekstblok
  let t = null;
  for (const [psm, bin] of [[3, true], [6, false]]) {
    const G = bin ? binarize(full, Math.round(Math.max(full.w, full.h) / 40), 0.15) : full;
    const d = await recognize(w, toCanvas(G), psm);
    score = consider(d, 'full' + psm);
    t = findTable(d);
    if (t) break;
  }

  // 2. uitsnede rond de tabel, recht gezet en vergroot tot ±40 px letterhoogte
  if (t) {
    const bw = t.box.x1 - t.box.x0, tilt = Math.abs(Math.tan(t.angle * Math.PI / 180)) * bw;
    // ruim marge: de eerste leesronde ziet vaak maar een deel van de tabel
    const bh = t.box.y1 - t.box.y0;
    const padX = Math.max(t.lh * 4, bw * 0.3), padY = Math.max(t.lh * 5, bh * 0.6) + tilt / 2;
    const bx0 = Math.max(0, t.box.x0 - padX), by0 = Math.max(0, t.box.y0 - padY);
    const bx1 = Math.min(full.w, t.box.x1 + padX), by1 = Math.min(full.h, t.box.y1 + padY);
    const k = Math.max(0.6, Math.min(4, 40 / t.lh, 2600 / Math.max(bx1 - bx0, by1 - by0)));
    const crop = maybeInvert(grayFrom(img, bx0 / s0, by0 / s0, (bx1 - bx0) / s0, (by1 - by0) / s0, s0 * k, t.angle));
    const lineH = t.lh * k;
    for (const [psm, bin] of [[6, true], [6, false], [4, true]]) {
      if (score >= 7 && texts.length >= 3) break;
      const G = bin ? binarize(crop, Math.round(lineH * 2.2), 0.12) : crop;
      score = consider(await recognize(w, toCanvas(G), psm), 'crop' + psm + (bin ? 'b' : 'g'));
    }
  }
  // 3. nog te weinig: hele foto als één blok, zwart-wit
  if (score < 7) score = consider(await recognize(w, toCanvas(binarize(full, Math.round(Math.max(full.w, full.h) / 40), 0.15)), 6), 'full6b');
  const values = parseNutrition(texts);
  return { text: bestText, values, pass: passes.join(',') };
}
/* Hoe betrouwbaar is een uitlezing? Gevonden waarden tellen, plus 2 als de energie klopt. */
function valueScore(v) {
  let s = ['kcal', 'protein', 'carbs', 'fat', 'fiber'].filter(k => isNum(v[k])).length;
  if ([v.kcal, v.protein, v.carbs, v.fat].every(isNum) && v.kcal > 0) {
    const calc = 4 * v.protein + 4 * v.carbs + 9 * v.fat + 2 * (v.fiber || 0);
    if (Math.abs(calc - v.kcal) / Math.max(v.kcal, 50) < 0.08) s += 2;
  }
  return s;
}

/* ---------- waarden uitlezen ---------- */
/* Haalt kcal, eiwit, koolhydraten, vet en vezels per 100 g uit een of meer herkende teksten.
   Werkt voor NL/FR/EN/DE-etiketten; de eerste waarde na het trefwoord is meestal "per 100 g".
   Tekstherkenning mist vaak komma's ("2,1 g" -> "21 g") of leest "g" als "9" ("4,4 g" -> "449").
   Daarom maken we per waarde enkele kandidaten. We kiezen de combinatie die
   - in de meeste leesrondes terugkomt,
   - het best klopt met de energie (4 kcal/g eiwit en koolhydraten, 9 kcal/g vet, 2 kcal/g vezels),
   - en past bij "waarvan verzadigd ≤ vet" en "waarvan suikers ≤ koolhydraten". */
const NUT_RULES = [
  ['sat', /(verzadig|satur|ges[aä]tt|gesatt|gesätt)/],
  ['sugar', /(suiker|sucre|sugar|zucker)/],
  ['fat', /(\bvet\b|\bvetten\b|\bvet[\/ ]|\bfe[il1]?tt?\b|\bfat\b|\bfats\b|mati[eè]res? gras|lipides|graisses)/],
  ['carbs', /(koolhydra|kooihydra|koo[il1]h|carbohydrat|glucides|kohlenhydra|kahlenhydra|kohlenh)/],
  ['fiber', /(vezel|fibre|fiber|ballaststoff)/],
  ['protein', /(eiwit|e[il1]w[il1]t|eiwei|eiwe[il1]|prote[iïí]n|prot[eé]ine)/]
];
const NUT_SKIP = /waarvan|dont|of which|davon|polyol|zetmeel|amidon|starch|st[aä]rke|enkelvoudig|meervoudig|onverzadig|insatur|unsatur/;
function normOcrLine(s) {
  return s.toLowerCase()
    .replace(/[|]/g, ' ')
    .replace(/(^|[\s:])[so](?=[\d.,]*\d\s*[g9])/g, (m, a) => a + (m.trim() === 's' ? '5' : '0'))   // "s1g" -> "51g", "o,2g" -> "0,2g"
    .replace(/(\d)\s*[,·]\s*(\d)/g, '$1.$2')
    .replace(/(\d)\s+\.\s*(\d)/g, '$1.$2')
    .replace(/(\d)[oO](?=\s|g|$)/g, '$10')
    .replace(/(\d)[lI](?=\d)/g, '$11');
}
function extractNutrition(raw) {
  const lines = String(raw || '').replace(/\r/g, '').split('\n').map(normOcrLine).filter(l => l.trim());
  const all = lines.join(' \n ');
  const ex = { kcal: [], kj: [], tok: {} };
  ex.kcal = [...all.matchAll(/(\d{1,4}(?:\.\d+)?)\s*[\/]?\s*k\s*c\s*[ao]\s*[l1ij|]/g)].map(m => Number(m[1])).filter(v => v <= 950);
  ex.kj = [...all.matchAll(/(\d{2,4}(?:\.\d+)?)\s*k\s*[jJ)\]}]/g)].map(m => Number(m[1])).filter(v => v <= 4000);
  let m;
  if (!ex.kcal.length && (m = all.match(/kcal\)?\s*[:\-]?\s*(\d{1,4}(?:\.\d+)?)/)) && Number(m[1]) <= 950) ex.kcal.push(Number(m[1]));
  // verhouding portie / 100 g uit twee energiewaarden op dezelfde regel
  ex.ratio = [];
  for (const line of lines) {
    for (const re of [/(\d{1,4}(?:\.\d+)?)\s*k\s*c\s*[ao]\s*[l1ij|]/g, /(\d{2,4}(?:\.\d+)?)\s*k\s*[jJ)\]}]/g]) {
      const v = [...line.matchAll(re)].map(x => Number(x[1]));
      if (v.length >= 2 && v[0] > 0 && v[1] / v[0] > 0.04 && v[1] / v[0] < 1.6) ex.ratio.push(v[1] / v[0]);
    }
  }
  let n9 = 0, ng = 0;
  for (const line of lines) {
    for (const [key, re] of NUT_RULES) {
      if (ex.tok[key] !== undefined) continue;
      const hit = line.match(re);
      if (!hit) continue;
      if ((key === 'fat' || key === 'carbs') && (NUT_SKIP.test(line) || /verzadig|satur|ges[aä]tt|suiker|sucre|sugar|zucker/.test(line))) continue;
      if ((key === 'sat' || key === 'sugar') && !NUT_SKIP.test(line) && !/verzadig|satur|ges[aä]tt|suiker|sucre|sugar|zucker/.test(line)) continue;
      const t = firstToken(line.slice(hit.index + hit[0].length));
      if (!t) continue;
      const rest = line.slice(hit.index + hit[0].length);
      const t2 = firstToken(rest.slice(t.end));
      if (t2) t.next = t2;                 // tweede kolom (per portie)
      ex.tok[key] = t;
      if (t.unit.startsWith('g')) ng++; else if (/[9]$/.test(t.num) || t.unit === '9') n9++;
    }
  }
  ex.g9 = n9 >= 2 && n9 >= ng;          // dit etiket leest "g" stelselmatig als "9"
  return ex;
}
function firstToken(s) {
  const m = s.match(/<?\s*(\d{1,4}(?:\.\d{1,2})?)\s*(gr?|9|8|q)?(?![\d])/);
  return m ? { num: m[1], unit: m[2] || '', end: m.index + m[0].length } : null;
}
/* Mogelijke lezingen van een getal, de waarschijnlijkste eerst. */
function candidates(t, g9) {
  const s = t.num, out = [];
  const push = v => { v = Number(v); if (isFinite(v) && v <= 100 && !out.includes(v)) out.push(v); };
  const strip = !t.unit.startsWith('g') && (/9$/.test(s) || (/8$/.test(s) && s.length >= 3));
  const lit = () => { push(s); if (!s.includes('.') && s.length >= 2) push(s.slice(0, -1) + '.' + s.slice(-1)); };
  const stripped = () => {
    const b = s.slice(0, -1).replace(/\.$/, '');
    if (!b) return;
    push(b); if (!b.includes('.') && b.length >= 2) push(b.slice(0, -1) + '.' + b.slice(-1));
  };
  if (strip && g9) { stripped(); lit(); }
  else if (strip) { lit(); stripped(); }
  else lit();
  if (!s.includes('.') && s.length >= 3) push(s.slice(0, -2) + '.' + s.slice(-2));
  // "68,49" is bijna altijd "68,4 g" (g als 9) en "1,75" vaak "17,5" (komma verschoven)
  if (/\.\d\d$/.test(s) && Number(s) >= 1) { push(s.slice(0, -1)); push(s.replace(/(\d*)\.(\d)(\d)$/, '$1$2.$3')); }
  return out;
}
function parseNutrition(raws) {
  const exs = (Array.isArray(raws) ? raws : [raws]).map(extractNutrition);
  const out = { kcal: null, protein: null, carbs: null, fat: null, fiber: null };
  // energie: alle gelezen kcal-waarden zijn kandidaten; kcal die klopt met kJ, vaker gelezen
  // of eerst op de regel (kolom per 100 g) is waarschijnlijker
  const kc = new Map();
  const addK = (v, c) => kc.set(v, (kc.has(v) ? kc.get(v) : 40) + c - 40);
  for (const e of exs) {
    e.kcal.forEach((c, i) => addK(c, i * 8 - (e.kj.some(j => Math.abs(j / 4.184 - c) <= Math.max(2, c * 0.03)) ? 30 : 0) - 10));
    if (!e.kcal.length) e.kj.forEach((j, i) => addK(Math.round(j / 4.184), 10 + i * 8));
  }
  const kcand = kc.size ? [...kc.entries()].map(([v, c]) => ({ v, c: c + 40 })).sort((a, b) => a.c - b.c).slice(0, 5) : [{ v: null, c: 0 }];
  // kandidaten per veld, met kosten (lager = waarschijnlijker)
  const KEYS = ['protein', 'carbs', 'fat', 'fiber', 'sat', 'sugar'];
  const cand = {}, found = {};
  const ratios = exs.flatMap(e => e.ratio).sort((a, b) => a - b);
  const ratio = ratios.length ? ratios[Math.floor(ratios.length / 2)] : null;
  for (const k of KEYS) {
    const cost = new Map(); let n = 0;
    for (const e of exs) {
      if (!e.tok[k]) continue;
      n++;
      const second = ratio && e.tok[k].next ? candidates(e.tok[k].next, e.g9) : [];
      candidates(e.tok[k], e.g9).forEach((v, i) => {
        // klopt de waarde per portie (tweede kolom) met deze lezing? dan is ze waarschijnlijker
        const fits = second.some(x => Math.abs(x - v * ratio) <= Math.max(0.15, v * ratio * 0.06));
        cost.set(v, (cost.has(v) ? cost.get(v) : 0) + i * 10 - 25 - (fits ? 22 : 0));
      });
    }
    found[k] = n;
    const list = [...cost.entries()].map(([v, c]) => ({ v, c: c + 25 * n + (v >= 1 && Math.abs(Math.round(v * 10) - v * 10) > 1e-6 ? 60 : 0) })).sort((a, b) => a.c - b.c).slice(0, 6);
    cand[k] = list.length ? list : [{ v: null, c: 0 }];
  }
  let best = null;
  const opt = (k) => cand[k];
  for (const K of kcand) for (const p of opt('protein')) for (const c of opt('carbs')) for (const f of opt('fat')) for (const fb of opt('fiber')) {
    let cost = K.c + p.c + c.c + f.c + fb.c;
    if (K.v !== null && [p.v, c.v, f.v].every(v => v !== null)) {
      const calc = 4 * p.v + 4 * c.v + 9 * f.v + 2 * (fb.v || 0);
      const mis = Math.abs(calc - K.v) / Math.max(K.v, 50) * 100;
      cost += Math.max(0, mis - 5) * 3;
    }
    if ((p.v || 0) + (c.v || 0) + (f.v || 0) + (fb.v || 0) > 101) cost += 1000;
    if (fb.v !== null && c.v !== null && fb.v > c.v * 0.6 + 3) cost += 20;
    if (fb.v !== null && fb.v > 12) cost += (fb.v - 12) * 4;          // meer dan 12 g vezels per 100 g is zeldzaam
    // waarvan verzadigd ≤ vet, waarvan suikers ≤ koolhydraten
    if (f.v !== null && found.sat && !cand.sat.some(x => x.v !== null && x.v <= f.v + 0.05)) cost += 25;
    if (c.v !== null && found.sugar && !cand.sugar.some(x => x.v !== null && x.v <= c.v + 0.05)) cost += 25;
    if (!best || cost < best.cost) best = { cost, vals: { kcal: K.v, protein: p.v, carbs: c.v, fat: f.v, fiber: fb.v } };
  }
  Object.assign(out, best.vals);
  // twijfel: velden waarvan de leesrondes het niet eens waren of die we moesten corrigeren
  out.uncertain = ['protein', 'carbs', 'fat', 'fiber'].filter(k => {
    if (out[k] === null) return false;
    const lits = exs.filter(e => e.tok[k]).map(e => Number(e.tok[k].num));
    return !lits.length || !lits.includes(out[k]) && lits.length < 2;
  });
  return out;
}
