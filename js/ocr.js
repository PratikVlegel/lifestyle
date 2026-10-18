/* Gratis tekstherkenning van een voedingswaardetabel, volledig op het toestel (Tesseract.js).
   De eerste keer worden ±7 MB herkenningsbestanden geladen; daarna werkt het offline. */
'use strict';

let OCR_WORKER = null;
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector('script[src="' + src + '"]')) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Kon ' + src + ' niet laden. Ben je offline en is de tekstherkenning nog nooit gebruikt?'));
    document.head.appendChild(s);
  });
}
async function getOcrWorker(onProgress) {
  if (OCR_WORKER) return OCR_WORKER;
  await loadScript('ocr/tesseract.min.js');
  OCR_WORKER = await Tesseract.createWorker('nld', 1, {
    workerPath: new URL('ocr/worker.min.js', location.href).href,
    corePath: new URL('ocr/core/', location.href).href,
    langPath: new URL('ocr/lang', location.href).href,
    gzip: true,
    workerBlobURL: false,
    logger: m => onProgress && onProgress(m)
  });
  await OCR_WORKER.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '6' });
  return OCR_WORKER;
}

/* Beeld voorbereiden: groter, grijs, meer contrast. */
function prepImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const target = 2000;
      const s = Math.min(2.5, target / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const d = ctx.getImageData(0, 0, c.width, c.height), p = d.data;
      let lo = 255, hi = 0;
      const g = new Uint8ClampedArray(p.length / 4);
      for (let i = 0, j = 0; i < p.length; i += 4, j++) {
        const v = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
        g[j] = v; if (v < lo) lo = v; if (v > hi) hi = v;
      }
      // Lichte tekst op donkere achtergrond? Dan omkeren.
      let sum = 0; for (let j = 0; j < g.length; j += 16) sum += g[j];
      const invert = sum / (g.length / 16) < 110;
      const rng = Math.max(1, hi - lo);
      for (let i = 0, j = 0; i < p.length; i += 4, j++) {
        let v = (g[j] - lo) * 255 / rng;
        if (invert) v = 255 - v;
        p[i] = p[i + 1] = p[i + 2] = v;
      }
      ctx.putImageData(d, 0, 0);
      resolve(c);
    };
    img.onerror = () => reject(new Error('Kon de foto niet openen.'));
    img.src = URL.createObjectURL(file);
  });
}

async function ocrLabel(file, onProgress) {
  const canvas = await prepImage(file);
  const w = await getOcrWorker(onProgress);
  const { data } = await w.recognize(canvas);
  return { text: data.text, values: parseNutrition(data.text), confidence: data.confidence };
}

/* Haalt kcal, eiwit, koolhydraten, vet en vezels per 100 g uit de herkende tekst.
   Werkt voor NL/FR/EN/DE-etiketten; de eerste waarde op een regel is meestal "per 100 g".
   Tekstherkenning mist vaak kommas ("2,1 g" -> "21 g") of leest "g" als "9" ("78 g" -> "789").
   Daarom maken we per waarde enkele kandidaten en kiezen de combinatie die het best klopt
   met de energie (4 kcal/g eiwit en koolhydraten, 9 kcal/g vet, 2 kcal/g vezels). */
function parseNutrition(raw) {
  const norm = s => s.toLowerCase()
    .replace(/(\d)\s*[,·]\s*(\d)/g, '$1.$2')
    .replace(/(\d)\s+\.\s*(\d)/g, '$1.$2')
    .replace(/[|]/g, ' ')
    .replace(/(\d)\s*[oO]\b/g, '$10');
  const lines = raw.replace(/\r/g, '').split('\n').map(norm).filter(l => l.trim());
  const all = lines.join(' \n ');
  const out = { kcal: null, protein: null, carbs: null, fat: null, fiber: null };

  let m = all.match(/(\d{1,4}(?:\.\d+)?)\s*k\s*c\s*a\s*[l1i]/);
  if (m) out.kcal = Number(m[1]);
  else if ((m = all.match(/(\d{2,4}(?:\.\d+)?)\s*k\s*j/))) out.kcal = Math.round(Number(m[1]) / 4.184);
  if (out.kcal === null && (m = all.match(/kcal\)?\s*[:\-]?\s*(\d{1,4}(?:\.\d+)?)/))) out.kcal = Number(m[1]);
  if (out.kcal !== null && out.kcal > 950) out.kcal = null;

  const SKIP = /waarvan|dont|of which|davon|verzadigd|satur|suiker|sucre|sugar|zucker|polyol|zetmeel|amidon|starch|enkelvoudig|meervoudig|onverzadigd/;
  const RULES = [
    ['fat', /\b(vet|vetten|fat|fats|matieres grasses|matières grasses|lipides|graisses|fett)\b/],
    ['carbs', /(koolhydraten|koolhydraat|carbohydrate|glucides|kohlenhydrate)/],
    ['fiber', /(vezels|voedingsvezel|fibre|fiber|fibres|ballaststoffe)/],
    ['protein', /(eiwit|eiwitten|protein|proteine|protéine|protéines|eiweiß|eiweiss)/]
  ];
  const tok = {};
  for (const line of lines) {
    for (const [key, re] of RULES) {
      if (tok[key] !== undefined) continue;
      const hit = line.match(re);
      if (!hit) continue;
      if (SKIP.test(line) && (key === 'fat' || key === 'carbs')) continue;
      const t = firstToken(line.slice(hit.index + hit[0].length));
      if (t) tok[key] = t;
    }
  }
  const cand = {};
  for (const k of ['protein', 'carbs', 'fat', 'fiber']) cand[k] = tok[k] ? candidates(tok[k]) : [null];
  let best = null;
  for (const p of cand.protein) for (const c of cand.carbs) for (const f of cand.fat) for (const fb of cand.fiber) {
    const vals = { protein: p, carbs: c, fat: f, fiber: fb };
    let cost = 0;
    // voorkeur voor de letterlijke lezing
    for (const k in vals) if (vals[k] !== null) cost += cand[k].indexOf(vals[k]) * 15;
    if (out.kcal !== null && [p, c, f].every(v => v !== null)) {
      const calc = 4 * p + 4 * c + 9 * f + 2 * (fb || 0);
      const mis = Math.abs(calc - out.kcal) / Math.max(out.kcal, 50) * 100;
      cost += Math.max(0, mis - 12) * 2;
    }
    if ((p || 0) + (c || 0) + (f || 0) + (fb || 0) > 101) cost += 1000;
    if (fb !== null && c !== null && fb > c * 0.6 + 3) cost += 20;
    if (!best || cost < best.cost) best = { cost, vals };
  }
  Object.assign(out, best.vals);
  out.uncertain = Object.keys(tok).filter(k => out[k] !== null && String(out[k]) !== String(Number(tok[k].num)));
  return out;
}
function firstToken(s) {
  const m = s.match(/<?\s*(\d{1,4}(?:\.\d{1,2})?)\s*(gr?|9)?(?![\d])/);
  return m ? { num: m[1], unit: m[2] || '' } : null;
}
function candidates(t) {
  const s = t.num, out = [];
  const push = v => { v = Number(v); if (isFinite(v) && v <= 100 && !out.includes(v)) out.push(v); };
  const gMiss = s.endsWith('9') && !t.unit;
  if (!s.includes('.')) {
    if (gMiss && s.length >= 2) {                                     // "g" gelezen als 9
      const b = s.slice(0, -1);
      push(b); if (b.length >= 2) push(b.slice(0, -1) + '.' + b.slice(-1));
    }
    push(s);
    if (s.length >= 2) push(s.slice(0, -1) + '.' + s.slice(-1));     // komma gemist
  } else {
    if (gMiss && s.split('.')[1].length === 2) push(s.slice(0, -1));
    push(s);
  }
  return out.length ? out : [null];
}
