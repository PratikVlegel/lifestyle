/* Productenbibliotheek: overzicht, producteditor, eenheden, barcode en etiketfoto. */
'use strict';

let LIBQ = '';
let PED = null;        // product in bewerking
let PED_CB = null;     // wat er na bewaren gebeurt

/* ---------- bibliotheekscherm ---------- */
function renderLibrary() {
  const list = libSearch(LIBQ, 300);
  const shared = cloudReady() && DB.settings.share !== false;
  let h = header('Bibliotheek', DB.foods.length + ' producten · waarden per 100 g', true);
  h += '<div class="inrow wrap"><button class="btn" data-act="newFood">+ Nieuw product</button><button class="btn ghost" data-act="libScan">Scan barcode</button><label class="btn ghost">Foto etiket<input type="file" accept="image/*" capture="environment" hidden data-chg="libPhoto"></label></div>';
  h += '<input type="search" id="bibq" placeholder="Zoek op naam, merk of barcode" value="' + esc(LIBQ) + '">';
  h += '<p class="muted small">' + (shared ? 'Gedeelde bibliotheek staat aan: producten die je toevoegt, kan iedereen met de app gebruiken. ' + (DB.settings.libSyncAt ? 'Laatst bijgewerkt ' + new Date(DB.settings.libSyncAt).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' }) + '.' : '') + ' <button class="link" data-act="syncNow">Nu bijwerken</button>' : 'Producten staan alleen op dit toestel.') + '</p>';
  h += '<div class="card table" id="biblist">' + libRows(list) + '</div>';
  view().innerHTML = h;
}
function libRows(list) {
  if (!list.length) return '<p class="muted">Niets gevonden.</p>';
  return list.map(f => '<a class="tr" href="#" data-act="editFood" data-id="' + f.id + '"><span>' + esc(f.name) + (f.brand ? ' <span class="muted">· ' + esc(f.brand) + '</span>' : '') + '</span><b>' + fmtNum(f.per.kcal) + ' kcal</b><small>' +
    [isNum(f.per.protein) ? fmtNum(f.per.protein, 1) + ' g eiwit' : '', (f.units || []).map(u => '1 ' + u.n + ' = ' + fmtNum(u.g, 1) + ' g').join(', '), f.rid ? (f.own ? 'gedeeld door jou' : 'gedeeld') : 'alleen op dit toestel', f.barcode ? '▮' + f.barcode : ''].filter(Boolean).join(' · ') + '</small></a>').join('');
}
function libSearch(q, max) {
  q = (q || '').toLowerCase().trim();
  const words = q.split(/\s+/).filter(Boolean);
  return DB.foods.filter(f => {
    if (!words.length) return true;
    const hay = (f.name + ' ' + (f.brand || '') + ' ' + (f.barcode || '')).toLowerCase();
    return words.every(w => hay.includes(w));
  }).sort((a, b) => (b.used || 0) - (a.used || 0) || a.name.localeCompare(b.name, 'nl')).slice(0, max || 50);
}
document.addEventListener('input', e => {
  if (e.target.id === 'bibq') { LIBQ = e.target.value; const l = $('#biblist'); if (l) l.innerHTML = libRows(libSearch(LIBQ, 300)); }
});
ACT.syncNow = () => { toast('Bijwerken…'); cloudSync(false); };
ACT.newFood = () => openFoodEditor(null, () => render());
ACT.editFood = el => openFoodEditor(DB.foods.find(f => f.id === el.dataset.id), () => render());
ACT.libScan = () => findByBarcode(food => { if (food.id && DB.foods.includes(food)) { toast(food.name + ' staat al in je bibliotheek'); openFoodEditor(food, () => render()); } else openFoodEditor(food, () => render()); });
ACT.libPhoto = el => { const f = el.files[0]; el.value = ''; if (f) openFoodEditor(null, () => render(), f); };

/* ---------- producteditor (sheet) ---------- */
function openFoodEditor(food, cb, photo) {
  PED = food ? JSON.parse(JSON.stringify(food)) : { id: uid(), name: '', brand: '', barcode: '', per: { kcal: null, protein: null, carbs: null, fat: null, fiber: null }, units: [], source: 'eigen', isNew: true };
  if (food && !DB.foods.some(f => f.id === food.id)) PED.isNew = true;
  PED.units = PED.units || [];
  PED_CB = cb;
  renderFoodEditor();
  $('#sheet').hidden = false; document.body.classList.add('noscroll');
  if (photo) runOcr(photo);
}
function renderFoodEditor(note) {
  const P = PED;
  const locked = P.rid && !P.own;
  let h = '<div class="sheet-h"><h2>' + (P.isNew ? 'Nieuw product' : 'Product') + '</h2><button class="iconbtn" data-act="closeSheet" aria-label="Sluiten">✕</button></div>';
  if (note) h += '<p class="note">' + note + '</p>';
  if (locked) h += '<p class="muted small">Dit product komt uit de gedeelde bibliotheek. Je wijzigingen blijven op dit toestel.</p>';
  h += '<div class="chips"><button class="chip" data-act="pedScan">Scan barcode</button><label class="chip">Foto etiket<input type="file" accept="image/*" capture="environment" hidden data-chg="pedPhoto"></label></div><div id="ocrstat"></div>';
  h += '<label class="fld"><span>Naam</span><input data-pf="name" value="' + esc(P.name) + '" placeholder="bv. Kipfilet"></label>';
  h += '<div class="grid2"><label class="fld"><span>Merk (optioneel)</span><input data-pf="brand" value="' + esc(P.brand || '') + '"></label><label class="fld"><span>Barcode</span><input data-pf="barcode" inputmode="numeric" value="' + esc(P.barcode || '') + '"></label></div>';
  h += '<p class="muted small">Waarden per 100 g (of 100 ml), zoals op het etiket.</p><div class="grid5">' + NUTR.map(n => '<label class="fld"><span>' + NUTR_LABEL[n] + '</span><input type="number" inputmode="decimal" data-pf="per.' + n + '" value="' + (isNum(P.per[n]) ? P.per[n] : '') + '"' + (P.uncertain && P.uncertain.includes(n) ? ' class="check"' : '') + '></label>').join('') + '</div>';
  if (P.uncertain && P.uncertain.length) h += '<p class="muted small">Oranje velden: de tekstherkenning twijfelde. Kijk ze na op het etiket.</p>';
  const chk = energyCheck(P.per);
  if (chk) h += '<p class="muted small">' + chk + '</p>';
  h += '<h3>Eenheden</h3><p class="muted small">Handig voor dingen die je per stuk of per lepel gebruikt, bv. 1 wafel = 12,5 g of 1 el = 15 g.</p><div id="units">' + P.units.map((u, i) => '<div class="inrow"><span>1</span><input data-pu="' + i + '.n" value="' + esc(u.n) + '" placeholder="stuk"><span>=</span><input type="number" inputmode="decimal" data-pu="' + i + '.g" value="' + (isNum(u.g) ? u.g : '') + '" style="max-width:90px"><em>g</em><button class="iconbtn sm" data-act="pedDelUnit" data-i="' + i + '">✕</button></div>').join('') + '</div>' +
    '<div class="chips"><button class="chip add" data-act="pedAddUnit">+ eenheid</button>' + ['stuk', 'portie', 'el', 'tl', 'snee', 'kopje'].filter(n => !P.units.some(u => u.n === n)).map(n => '<button class="chip sm" data-act="pedAddUnit" data-n="' + n + '">' + n + '</button>').join('') + '</div>';
  h += '<button class="btn big" data-act="pedSave">Bewaren</button>';
  if (!P.isNew) h += '<button class="link danger" data-act="pedDelete">Product verwijderen</button>';
  $('#sheet .sheet-in').innerHTML = h;
}
function energyCheck(per) {
  if (![per.kcal, per.protein, per.carbs, per.fat].every(isNum) || !per.kcal) return '';
  const calc = 4 * per.protein + 4 * per.carbs + 9 * per.fat + 2 * (per.fiber || 0);
  const d = Math.abs(calc - per.kcal) / per.kcal;
  return d > 0.15 ? '⚠ Controle: eiwit, koolhydraten en vet geven samen ≈ ' + fmtNum(calc) + ' kcal, het etiket zegt ' + fmtNum(per.kcal) + '. Klopt er een getal niet?' : '✓ De waarden kloppen met de energie (≈ ' + fmtNum(calc) + ' kcal).';
}
document.addEventListener('input', e => {
  const el = e.target;
  if (!PED) return;
  if (el.dataset.pf) {
    const p = el.dataset.pf.split('.');
    let v = el.value;
    if (el.type === 'number') v = v === '' ? null : Number(v.replace(',', '.'));
    if (p[0] === 'per') { PED.per[p[1]] = v; if (PED.uncertain) PED.uncertain = PED.uncertain.filter(x => x !== p[1]); el.classList.remove('check'); }
    else PED[p[0]] = v;
  }
  if (el.dataset.pu) {
    const [i, k] = el.dataset.pu.split('.');
    PED.units[i][k] = k === 'g' ? (el.value === '' ? null : Number(el.value.replace(',', '.'))) : el.value;
  }
});
ACT.pedAddUnit = el => { PED.units.push({ n: el.dataset.n || '', g: el.dataset.n === 'el' ? 15 : el.dataset.n === 'tl' ? 5 : null }); renderFoodEditor(); };
ACT.pedDelUnit = el => { PED.units.splice(Number(el.dataset.i), 1); renderFoodEditor(); };
ACT.pedScan = () => {
  const keep = PED, cb = PED_CB;
  findByBarcode(food => {
    PED = keep; PED_CB = cb;
    PED.barcode = food.barcode || PED.barcode;
    if (!PED.name) PED.name = food.name;
    if (!PED.brand && food.brand) PED.brand = food.brand;
    for (const n of NUTR) if (isNum(food.per[n])) PED.per[n] = food.per[n];
    if (food.rid) { PED.rid = food.rid; PED.own = food.own; }
    renderFoodEditor(food.per && isNum(food.per.kcal) ? 'Gevonden: ' + esc(food.name) + '. Kijk de waarden even na.' : 'Barcode ingevuld. Dit product is nog nergens bekend: neem een foto van het etiket of vul de waarden zelf in.');
  }, code => { PED = keep; PED_CB = cb; PED.barcode = code; renderFoodEditor('Barcode ' + esc(code) + ' is nog nergens bekend. Neem een foto van het etiket of vul de waarden zelf in.'); });
};
ACT.pedPhoto = el => { const f = el.files[0]; el.value = ''; if (f) runOcr(f); };
async function runOcr(file) {
  const st = $('#ocrstat');
  const show = t => { const s = $('#ocrstat'); if (s) s.innerHTML = '<p class="note">' + t + '</p>'; };
  show('Etiket lezen… De eerste keer laadt de app de tekstherkenning (±7 MB), daarna werkt het offline.');
  try {
    const r = await ocrLabel(file, m => { if (m.status && m.progress !== undefined) show(ocrStatus(m)); });
    const found = NUTR.filter(n => isNum(r.values[n]));
    for (const n of found) PED.per[n] = r.values[n];
    PED.uncertain = r.values.uncertain || [];
    if (!PED.source || PED.source === 'eigen') PED.source = 'etiket';
    renderFoodEditor(found.length ? found.length + ' van de 5 waarden gelezen' + (found.length < 5 ? ' (' + NUTR.filter(n => !found.includes(n)).map(n => NUTR_LABEL[n]).join(', ') + ' niet gevonden)' : '') + '. Controleer ze even met het etiket.' : 'Ik kon geen voedingswaarden lezen. Neem de foto van dichterbij, recht van voor en zonder schittering, of vul ze zelf in.');
  } catch (e) { show(esc(e.message)); }
}
function ocrStatus(m) {
  const map = { 'loading tesseract core': 'Tekstherkenning laden', 'loading language traineddata': 'Taalbestand laden', 'initializing api': 'Opstarten', 'recognizing text': 'Tekst lezen' };
  return (map[m.status] || m.status) + '… ' + Math.round((m.progress || 0) * 100) + '%';
}
ACT.pedSave = () => {
  const P = PED;
  if (!String(P.name || '').trim()) return toast('Geef het product een naam.');
  if (!isNum(P.per.kcal)) return toast('Vul minstens de kcal per 100 g in.');
  if (P.barcode && !/^[0-9]{6,14}$/.test(P.barcode)) return toast('De barcode bestaat alleen uit cijfers.');
  P.units = (P.units || []).filter(u => u.n && isNum(u.g) && u.g > 0);
  const isNew = P.isNew; delete P.isNew; delete P.uncertain;
  P.name = P.name.trim();
  P.dirty = true;
  if (P.rid && !P.own) { P.localEdit = true; P.dirty = false; }
  const i = DB.foods.findIndex(f => f.id === P.id);
  if (i >= 0) DB.foods[i] = P; else DB.foods.push(P);
  save();
  const saved = P, cb = PED_CB;
  PED = null; closeSheet();
  toast(isNew ? 'Product bewaard' : 'Bijgewerkt');
  if (navigator.onLine && cloudReady() && saved.dirty) pushFood(saved).catch(e => console.warn(e));
  cb && cb(saved);
};
ACT.pedDelete = async () => {
  const P = PED;
  if (!confirm('"' + P.name + '" verwijderen uit je bibliotheek?' + (P.rid && P.own ? ' Het verdwijnt ook uit de gedeelde bibliotheek.' : ''))) return;
  if (P.rid && P.own) { try { await deleteRemote(P); } catch (e) { toast('Kon niet uit de gedeelde bibliotheek verwijderen: ' + e.message); return; } }
  DB.foods = DB.foods.filter(f => f.id !== P.id);
  if (P.rid && !P.own) { DB.settings.hidden = (DB.settings.hidden || []).concat(P.rid); }
  save(); PED = null; closeSheet(); render();
};

/* ---------- barcode: eigen bibliotheek → gedeelde bibliotheek → Open Food Facts ---------- */
function findByBarcode(onFood, onUnknown) {
  scanBarcode(async code => {
    const m = $('#scanmsg'); if (m) m.innerHTML = '<p class="muted">Zoeken…</p>';
    const local = DB.foods.find(f => f.barcode === code);
    if (local) return onFood(local);
    const shared = await cloudBarcode(code);
    if (shared) { DB.foods.push(shared); save(); return onFood(shared); }
    if (!navigator.onLine) { if (onUnknown) return onUnknown(code); if (m) m.innerHTML = '<p class="note">Offline: opzoeken kan niet.</p>'; return; }
    try {
      const r = await fetch('https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(code) + '.json?fields=product_name,product_name_nl,product_name_fr,brands,nutriments,serving_quantity');
      const j = await r.json();
      const n = (j.product && j.product.nutriments) || {};
      const nv = x => (x === undefined || x === '' || !isFinite(Number(x))) ? null : Math.round(Number(x) * 10) / 10;
      if (!j.product || nv(n['energy-kcal_100g']) === null && nv(n['energy_100g']) === null) throw new Error('unknown');
      const kcal = nv(n['energy-kcal_100g']) ?? Math.round(nv(n['energy_100g']) / 4.184);
      const food = { id: uid(), barcode: code, name: j.product.product_name_nl || j.product.product_name || j.product.product_name_fr || code, brand: (j.product.brands || '').split(',')[0].trim(), source: 'openfoodfacts',
        per: { kcal, protein: nv(n.proteins_100g), carbs: nv(n.carbohydrates_100g), fat: nv(n.fat_100g), fiber: nv(n.fiber_100g) }, units: [] };
      const sq = nv(j.product.serving_quantity); if (sq) food.units.push({ n: 'portie', g: sq });
      onFood(food);
    } catch (e) {
      if (onUnknown) onUnknown(code);
      else openFoodEditor({ id: uid(), name: '', brand: '', barcode: code, per: { kcal: null, protein: null, carbs: null, fat: null, fiber: null }, units: [], source: 'etiket' }, () => render());
    }
  });
}
/* Bewaar een gevonden product (uit OFF) in de bibliotheek en deel het. */
function keepFood(food) {
  if (!DB.foods.some(f => f.id === food.id)) { food.dirty = true; DB.foods.push(food); save(); if (navigator.onLine && cloudReady()) pushFood(food).catch(() => { }); }
  return food;
}

/* ---------- hoeveelheid kiezen: gram of eenheid ---------- */
function amountRow(f, prefix) {
  const units = f.units || [];
  return '<div class="inrow"><input type="number" inputmode="decimal" placeholder="aantal" id="' + prefix + 'q_' + f.id + '" value="' + (units.length ? 1 : (f.unitG || '')) + '"><select id="' + prefix + 'u_' + f.id + '">' +
    units.map(u => '<option value="' + u.g + '">' + esc(u.n) + ' (' + fmtNum(u.g, 1) + ' g)</option>').join('') + '<option value="1"' + (units.length ? '' : ' selected') + '>gram</option></select></div>';
}
function readAmount(f, prefix) {
  const q = Number((($('#' + prefix + 'q_' + f.id) || {}).value || '').replace(',', '.'));
  const u = Number(($('#' + prefix + 'u_' + f.id) || {}).value || 1);
  const sel = $('#' + prefix + 'u_' + f.id);
  const label = sel && sel.selectedOptions[0] && u !== 1 ? q + ' × ' + sel.selectedOptions[0].text.replace(/ \(.*/, '') : null;
  return q > 0 ? { g: Math.round(q * u * 10) / 10, label } : null;
}
