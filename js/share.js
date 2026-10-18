/* Mealpreps delen als recept, en een korte enquête als een mealprep op is of blijft liggen. */
'use strict';

const APP_LINK = 'https://pratikvlegel.github.io/lifestyle/';

/* ---------- delen ---------- */
function prepToShared(p) {
  const { per } = prepTotals(p);
  const r = {};
  for (const n of NUTR) r[n] = prepKnows(p, n) ? Math.round(per[n] * 10) / 10 : null;
  return {
    name: String(p.name).slice(0, 200), portions: Number(p.portions) || 1, note: (p.recipeNote || '').slice(0, 2000) || null,
    ingredients: (p.ingredients || []).map(g => ({ name: g.name, grams: g.grams, mode: g.mode, per: g.per })), per: r
  };
}
async function sharePrepOnline(p) {
  if (!cloudReady() || !navigator.onLine) throw new Error('Delen kan alleen met internet.');
  await ensureSession();
  const body = prepToShared(p);
  if (p.photo && (!p.photoUrl || p.photoDirty)) {
    try { p.photoUrl = await uploadPrepPhoto(p); delete p.photoDirty; save(); } catch (e) { console.warn('foto', e); }
  }
  if (p.photoUrl) body.photo_url = p.photoUrl;
  if (p.sharedId && p.sharedOwn) {
    await sb('/rest/v1/shared_preps?id=eq.' + p.sharedId, { method: 'PATCH', body });
  } else if (!p.sharedId) {
    const r = await sb('/rest/v1/shared_preps', { method: 'POST', body, headers: { Prefer: 'return=representation' } });
    p.sharedId = r[0].id; p.sharedOwn = true; save();
  }
  return APP_LINK + '#/recept/' + p.sharedId;
}
ACT.sharePrep = async () => {
  const p = prepById(PREP.id) || PREP;
  let link = null;
  try { toast('Recept delen…'); link = await sharePrepOnline(p); } catch (e) { toast(e.message); }
  const { per } = prepTotals(p);
  const txt = p.name + ' (' + p.portions + ' porties)\n' +
    p.ingredients.map(g => '- ' + g.name + (isNum(g.grams) ? ': ' + g.grams + ' g' : '')).join('\n') +
    '\nPer portie ≈ ' + fmtNum(per.kcal) + ' kcal, ' + fmtNum(per.protein) + ' g eiwit (ruwe schatting).' + (link ? '\n\nOpen in de app: ' + link : '');
  shareText(txt, p.name);
};

/* ---------- foto's ---------- */
function compressPhoto(file, max, q) {
  max = max || 720; q = q || 0.7;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => reject(new Error('Kon de foto niet openen.'));
    img.src = URL.createObjectURL(file);
  });
}
async function uploadPrepPhoto(p) {
  const c = cloudCfg(); const token = await ensureSession(); const a = getAuth();
  const blob = await (await fetch(p.photo)).blob();
  const path = a.user.id + '/' + p.id + '.jpg';
  const r = await fetch(c.url + '/storage/v1/object/prep-photos/' + path, { method: 'POST', headers: { apikey: c.key, Authorization: 'Bearer ' + token, 'content-type': 'image/jpeg', 'x-upsert': 'true' }, body: blob });
  if (!r.ok) throw new Error('Foto uploaden mislukt (' + r.status + ')');
  return c.url + '/storage/v1/object/public/prep-photos/' + path + '?v=' + Date.now();
}
function prepPhotoSrc(p) { return p.photo || p.photoUrl || ''; }
ACT.prepPhoto = async el => {
  const f = el.files[0]; el.value = ''; if (!f) return;
  try { PREP.photo = await compressPhoto(f); PREP.photoDirty = true; const y = scrollY; renderPrep(PREP.isNew ? 'nieuw' : PREP.id); scrollTo(0, y); }
  catch (e) { toast(e.message); }
};
ACT.prepPhotoDel = () => { delete PREP.photo; delete PREP.photoUrl; PREP.photoDirty = true; const y = scrollY; renderPrep(PREP.isNew ? 'nieuw' : PREP.id); scrollTo(0, y); };
function prepExtrasHtml(P) {
  const src = prepPhotoSrc(P);
  return '<div class="card"><h3>Foto en bereiding</h3>' +
    (src ? '<img class="prepimg" src="' + esc(src) + '" alt="Foto van ' + esc(P.name) + '"><div class="inrow"><label class="btn ghost">Andere foto<input type="file" accept="image/*" capture="environment" hidden data-chg="prepPhoto"></label><button class="link danger" data-act="prepPhotoDel">Foto verwijderen</button></div>'
      : '<label class="btn ghost">+ Foto toevoegen<input type="file" accept="image/*" capture="environment" hidden data-chg="prepPhoto"></label>') +
    '<label class="fld"><span>Bereiding (optioneel)</span><textarea rows="5" data-pp="recipeNote" placeholder="1. Kip marineren…&#10;2. Groenten roosteren op 200 °C…">' + esc(P.recipeNote || '') + '</textarea></label>' +
    (P.feedback ? '<p class="small"><b>Jouw beoordeling:</b> ' + esc(feedbackSummary(P.feedback)) + (P.feedback.note ? ' · "' + esc(P.feedback.note) + '"' : '') + ' <button class="link" data-act="openFeedback" data-id="' + P.id + '">Aanpassen</button></p>' : '') + '</div>';
}

/* ---------- gedeelde recepten bekijken ---------- */
let RECIPE_CACHE = {};
async function fetchRecipes() {
  const [rows, revs] = await Promise.all([
    sb('/rest/v1/shared_preps?select=*&order=created_at.desc&limit=100', {}),
    sb('/rest/v1/prep_reviews?select=shared_id,taste,ease,portion,fullness,eat,again', {})
  ]);
  const stats = {};
  for (const r of revs) {
    const s = stats[r.shared_id] = stats[r.shared_id] || { n: 0, taste: 0, ease: 0, again: 0, big: 0 };
    s.n++; s.taste += r.taste || 0; s.ease += r.ease || 0; if (r.again === 'ja') s.again++; if (r.portion === 'te groot' || r.eat === 'moeilijk') s.big++;
  }
  for (const r of rows) { r.stats = stats[r.id] || null; RECIPE_CACHE[r.id] = r; }
  return rows;
}
function starLine(s) {
  if (!s || !s.n) return 'nog geen beoordelingen';
  return '★ ' + fmtNum(s.taste / s.n, 1) + ' smaak · ' + fmtNum(s.ease / s.n, 1) + ' gemak · ' + s.n + ' beoordeling' + (s.n > 1 ? 'en' : '') + (s.again ? ' · ' + Math.round(s.again / s.n * 100) + '% maakt opnieuw' : '');
}
async function renderRecipes() {
  let h = header('Gedeelde recepten', 'Mealpreps van andere gebruikers', true);
  view().innerHTML = h + '<p class="muted">Laden…</p>';
  if (!navigator.onLine) { view().innerHTML = h + '<p class="note">Je bent offline. Gedeelde recepten laden kan alleen met internet.</p>'; return; }
  try {
    const rows = await fetchRecipes();
    h += rows.length ? rows.map(r => '<a class="card prepc" href="#/recept/' + r.id + '">' + (r.photo_url ? '<img class="prepthumb" src="' + esc(r.photo_url) + '" alt="" loading="lazy">' : '') + '<div class="pc-h"><b>' + esc(r.name) + '</b><span class="pill">' + r.portions + ' porties</span></div>' +
      '<div class="macro">' + NUTR.map(n => '<span><b>' + (isNum(r.per && r.per[n]) ? fmtNum(r.per[n]) : '–') + '</b>' + (n === 'kcal' ? 'kcal' : 'g ' + NUTR_LABEL[n]) + '</span>').join('') + '</div>' +
      '<small class="muted">per portie · ' + starLine(r.stats) + '</small></a>').join('') : '<p class="card muted">Nog geen gedeelde recepten. Deel er zelf een via een mealprep → Deel.</p>';
  } catch (e) { h += '<p class="note">Laden mislukt: ' + esc(e.message) + '</p>'; }
  view().innerHTML = h;
}
async function renderRecipe(id) {
  let h = header('Recept', 'Gedeeld via de app', true);
  view().innerHTML = h + '<p class="muted">Laden…</p>';
  let r = RECIPE_CACHE[id];
  try { if (!r || !r.stats) { await fetchRecipes(); r = RECIPE_CACHE[id]; } } catch (e) { }
  if (!r) { view().innerHTML = h + '<p class="note">Dit recept is niet gevonden' + (navigator.onLine ? '' : ' (je bent offline)') + '.</p>'; return; }
  const mine = DB.preps.find(p => p.sharedId === id);
  h += '<div class="card">' + (r.photo_url ? '<img class="prepimg" src="' + esc(r.photo_url) + '" alt="Foto van ' + esc(r.name) + '">' : '') + '<h2>' + esc(r.name) + '</h2><p class="muted small">' + r.portions + ' porties · ' + starLine(r.stats) + '</p>' +
    '<div class="macro big">' + NUTR.map(n => '<span><b>' + (isNum(r.per && r.per[n]) ? fmtNum(r.per[n]) : '–') + '</b>' + (n === 'kcal' ? 'kcal' : 'g ' + NUTR_LABEL[n]) + '</span>').join('') + '</div><small class="muted">per portie, ruwe schatting</small>' +
    (r.stats && r.stats.big ? '<p class="note small">' + r.stats.big + ' van de ' + r.stats.n + ' vond de portie te groot of moeilijk op te eten.</p>' : '') +
    '<h3>Ingrediënten (hele prep)</h3><ul>' + (r.ingredients || []).map(g => '<li>' + esc(g.name) + (isNum(g.grams) ? ' · ' + fmtNum(g.grams) + ' g' : '') + '</li>').join('') + '</ul>' +
    (r.note ? '<h3>Bereiding</h3><p>' + esc(r.note).replace(/\n/g, '<br>') + '</p>' : '') + '</div>';
  h += mine ? '<a class="btn" href="#/prep/' + mine.id + '">Staat al bij je mealpreps</a>' : '<button class="btn big" data-act="addRecipe" data-id="' + id + '">Toevoegen aan mijn mealpreps</button>';
  view().innerHTML = h;
}
ACT.addRecipe = el => {
  const r = RECIPE_CACHE[el.dataset.id]; if (!r) return;
  const p = { id: uid(), name: r.name, date: todayKey(), portions: r.portions, left: r.portions, plan: '', cooked: null, recipeNote: r.note || '', photoUrl: r.photo_url || undefined, sharedId: r.id, sharedOwn: false,
    ingredients: (r.ingredients || []).map(g => ({ id: uid(), name: g.name, grams: g.grams, mode: g.mode || 'per100', per: Object.assign({ kcal: null, protein: null, carbs: null, fat: null, fiber: null }, g.per) })) };
  PREP = Object.assign(p, { isNew: true });
  toast('Pas de hoeveelheden aan als je anders kookt, en bewaar.');
  go('#/prep/nieuw');
};

/* ---------- enquête na een mealprep ---------- */
function prepLastUsed(p) {
  let last = null;
  for (const [k, d] of Object.entries(DB.days)) if ((d.meals || []).some(m => m.prepId === p.id) && (!last || k > last)) last = k;
  return last;
}
function prepsNeedingFeedback() {
  const today = todayKey(), weekAgo = addDays(today, -7), monthAgo = addDays(today, -30);
  return DB.preps.filter(p => {
    if (p.feedback || p.feedbackSkip) return false;
    if (p.snoozeUntil && p.snoozeUntil > today) return false;
    const last = prepLastUsed(p);
    if (!last || last < monthAgo) return false;           // nooit gegeten of te lang geleden
    if (isNum(p.left) && p.left <= 0) return true;          // op
    return last <= weekAgo;                                  // al een week niet meer aangeraakt
  }).sort((a, b) => (prepLastUsed(b) || '').localeCompare(prepLastUsed(a) || ''));
}
function feedbackCard() {
  const list = prepsNeedingFeedback();
  if (!list.length) return '';
  const p = list[0];
  const why = isNum(p.left) && p.left <= 0 ? 'is op' : 'heb je al een week niet meer gegeten (' + fmtNum(p.left, p.left % 1 ? 2 : 0) + ' over)';
  return '<div class="card fb"><b>Hoe was je mealprep?</b><p class="small">' + esc(p.name) + ' ' + why + '. Een paar korte vragen, zo leer je wat voor jou werkt' + (p.sharedId ? ' en help je andere gebruikers' : '') + '.</p>' +
    '<div class="inrow wrap"><button class="btn" data-act="openFeedback" data-id="' + p.id + '">Beantwoorden</button><button class="link" data-act="snoozeFeedback" data-id="' + p.id + '">Later</button><button class="link" data-act="skipFeedback" data-id="' + p.id + '">Niet vragen</button></div>' +
    (list.length > 1 ? '<small class="muted">Nog ' + (list.length - 1) + ' andere mealprep' + (list.length > 2 ? 's' : '') + ' wacht' + (list.length > 2 ? 'en' : '') + ' op je mening.</small>' : '') + '</div>';
}
ACT.snoozeFeedback = el => { const p = prepById(el.dataset.id); p.snoozeUntil = addDays(todayKey(), 2); save(); render(); };
ACT.skipFeedback = el => { const p = prepById(el.dataset.id); p.feedbackSkip = true; save(); render(); };

let FB = null;
const FB_Q = [
  ['taste', 'Hoe lekker was het?', [1, 2, 3, 4, 5]],
  ['ease', 'Hoe makkelijk was het om te maken?', [1, 2, 3, 4, 5]],
  ['portion', 'De portie was…', ['te klein', 'goed', 'te groot']],
  ['eat', 'Opeten ging…', ['makkelijk', 'ging wel', 'moeilijk']],
  ['fullness', 'Na het eten…', ['snel weer honger', 'goed verzadigd', 'te vol']],
  ['keep', 'Bleef het goed in de koelkast?', ['ja', 'twijfel', 'nee']],
  ['again', 'Zou je hem opnieuw maken?', ['ja', 'misschien', 'nee']]
];
ACT.openFeedback = el => openFeedback(el.dataset.id);
function openFeedback(id) {
  const p = prepById(id);
  FB = Object.assign({ id }, p.feedback || {});
  renderFeedback();
  $('#sheet').hidden = false; document.body.classList.add('noscroll');
}
function renderFeedback() {
  const p = prepById(FB.id);
  let h = '<div class="sheet-h"><h2>' + esc(p.name) + '</h2><button class="iconbtn" data-act="closeSheet" aria-label="Sluiten">✕</button></div>';
  for (const [k, q, opts] of FB_Q) {
    h += '<div class="fld" data-fq="' + k + '"><span>' + q + '</span>' + (typeof opts[0] === 'number'
      ? '<div class="stars">' + opts.map(v => '<button class="' + (FB[k] >= v ? 'on' : '') + '" data-act="fbSet" data-k="' + k + '" data-v="' + v + '" aria-label="' + v + ' van 5">★</button>').join('') + '</div>'
      : '<div class="chips">' + opts.map(v => '<button class="chip ' + (FB[k] === v ? 'on' : '') + '" data-act="fbSet" data-k="' + k + '" data-v="' + v + '">' + v + '</button>').join('') + '</div>') + '</div>';
  }
  h += '<label class="fld"><span>Nog iets? (optioneel)</span><textarea id="fbnote" rows="2" placeholder="bv. minder groenten, meer saus">' + esc(FB.note || '') + '</textarea></label>';
  h += '<button class="btn big" data-act="fbSave">Bewaren</button>';
  $('#sheet .sheet-in').innerHTML = h;
}
ACT.fbSet = el => { const k = el.dataset.k; FB[k] = /^\d$/.test(el.dataset.v) ? Number(el.dataset.v) : el.dataset.v; const n = $('#fbnote'); if (n) FB.note = n.value; const y = $('#sheet .sheet-in').scrollTop; renderFeedback(); $('#sheet .sheet-in').scrollTop = y; };
ACT.fbSave = async () => {
  FB.note = ($('#fbnote') || {}).value || '';
  const miss = FB_Q.filter(([k]) => FB[k] === undefined);
  if (miss.length > 3) return toast('Beantwoord minstens de meeste vragen.');
  const p = prepById(FB.id);
  p.feedback = Object.assign({}, FB, { date: todayKey() }); delete p.feedback.id;
  delete p.snoozeUntil; save(); closeSheet(); toast('Bedankt! Je vindt dit terug bij de mealprep.');
  if (p.sharedId && cloudReady() && navigator.onLine) {
    try {
      await ensureSession();
      const f = p.feedback;
      await sb('/rest/v1/prep_reviews?on_conflict=shared_id,created_by', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
        body: { shared_id: p.sharedId, taste: f.taste || null, ease: f.ease || null, portion: f.portion || null, eat: f.eat || null, fullness: f.fullness || null, keep: f.keep || null, again: f.again || null, note: f.note ? f.note.slice(0, 1000) : null } });
    } catch (e) { console.warn('review', e); }
  }
  render();
};
function feedbackSummary(f) {
  if (!f) return '';
  return [f.taste ? '★ ' + f.taste + ' smaak' : '', f.ease ? f.ease + '/5 gemak' : '', f.portion ? 'portie ' + f.portion : '', f.eat ? 'opeten ' + f.eat : '', f.again ? 'opnieuw: ' + f.again : ''].filter(Boolean).join(' · ');
}
