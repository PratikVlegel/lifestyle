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
  if (!cloudReady() || !navigator.onLine) throw new Error(tr('Delen kan alleen met internet.'));
  if (String(p.name || '').length > 200) throw new Error(tr('De naam mag maximaal 200 tekens bevatten.'));
  if (String(p.recipeNote || '').length > 2000) throw new Error(tr('De bereidingsnotitie mag maximaal 2000 tekens bevatten.'));
  if ((p.ingredients || []).length > 50) throw new Error(tr('Een mealprep kan maximaal 50 ingrediënten bevatten.'));
  if ((p.ingredients || []).some(g => String(g.name || '').length > 200)) throw new Error(tr('Een ingrediëntnaam mag maximaal 200 tekens bevatten.'));
  await ensureSession();
  if (DB.settings.member) {
    let communityName = DB.settings.communityName;
    if (!communityName) { communityName = prompt(tr('Welke communitynaam mogen andere leden bij je recepten en beoordelingen zien?')); if (!communityName) throw new Error(tr('Stel een communitynaam in om te delen.')); }
    await saveCommunityProfile(communityName);
  }
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
  try { toast(tr('Recept delen…')); link = await sharePrepOnline(p); } catch (e) { toast(trOr(e.message, 'Recept delen is mislukt. Controleer je verbinding en probeer opnieuw.')); }
  const { per } = prepTotals(p);
  const txt = p.name + ' (' + p.portions + ' ' + tr('porties') + ')\n' +
    p.ingredients.map(g => '- ' + g.name + (isNum(g.grams) ? ': ' + g.grams + ' g' : '')).join('\n') +
    '\n' + tr('Per portie') + ' ≈ ' + fmtNum(per.kcal) + ' kcal, ' + fmtNum(per.protein) + ' g ' + tr('eiwit') + ' (' + tr('ruwe schatting') + ').' + (link ? '\n\n' + tr('Open in de app:') + ' ' + link : '');
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
function sharedRecipePhotoUrl(value) {
  try {
    const project = new URL(String((window.VD_CONFIG || {}).supabaseUrl || ''));
    const photo = new URL(String(value || ''));
    if (project.protocol !== 'https:' || photo.protocol !== 'https:' || photo.origin !== project.origin || photo.username || photo.password) return '';
    if (!photo.pathname.startsWith('/storage/v1/object/public/prep-photos/')) return '';
    return photo.href;
  } catch (_) { return ''; }
}
function prepPhotoSrc(p) { return p.photo || p.photoUrl || ''; }
ACT.prepPhoto = async el => {
  const f = el.files[0]; el.value = ''; if (!f) return;
  try { PREP.photo = await compressPhoto(f); PREP.photoDirty = true; const y = scrollY; renderPrep(PREP.isNew ? 'nieuw' : PREP.id); scrollTo(0, y); }
  catch (e) { toast(trOr(e.message, 'De foto kan niet worden geopend. Kies een andere foto.')); }
};
ACT.prepPhotoDel = () => { delete PREP.photo; delete PREP.photoUrl; PREP.photoDirty = true; const y = scrollY; renderPrep(PREP.isNew ? 'nieuw' : PREP.id); scrollTo(0, y); };
function prepExtrasHtml(P) {
  const src = prepPhotoSrc(P);
  return '<div class="card"><h3>' + tr('Foto en bereiding') + '</h3>' +
    (src ? '<img class="prepimg" src="' + esc(src) + '" alt="' + tr('Foto van') + ' ' + esc(P.name) + '"><div class="inrow"><label class="btn ghost">' + tr('Andere foto') + '<input type="file" accept="image/*" capture="environment" hidden data-chg="prepPhoto"></label><button class="link danger" data-act="prepPhotoDel">' + tr('Foto verwijderen') + '</button></div>'
      : '<label class="btn ghost">+ ' + tr('Foto toevoegen') + '<input type="file" accept="image/*" capture="environment" hidden data-chg="prepPhoto"></label>') +
    '<label class="fld"><span>' + tr('Bereiding (optioneel)') + '</span><textarea rows="5" maxlength="2000" data-pp="recipeNote" placeholder="' + tr('1. Kip marineren… 2. Groenten roosteren op 200 °C…') + '">' + esc(P.recipeNote || '') + '</textarea></label>' +
    (P.feedback ? '<p class="small"><b>' + tr('Jouw beoordeling:') + '</b> ' + esc(feedbackSummary(P.feedback)) + (P.feedback.note ? ' · "' + esc(P.feedback.note) + '"' : '') + ' <button class="link" data-act="openFeedback" data-id="' + P.id + '">' + tr('Aanpassen') + '</button></p>' : '') + '</div>';
}

/* ---------- gedeelde recepten bekijken ---------- */
let RECIPE_CACHE = {};
let RECIPE_ROWS = [];
async function fetchRecipes() {
  const rows = await sb('/rest/v1/shared_preps?select=*&order=created_at.desc&limit=100', {});
  let revs = [];
  try { revs = await sb('/rest/v1/prep_reviews?select=shared_id,taste,ease,portion,fullness,eat,again,created_by,rating,community_comment,created_at', {}); }
  catch (e) { revs = await sb('/rest/v1/prep_reviews?select=shared_id,taste,ease,portion,fullness,eat,again', {}); }
  let names = {};
  try { names = await fetchCommunityProfiles(revs.map(x => x.created_by).concat(rows.map(x => x.created_by))); } catch (e) { }
  const stats = {};
  for (const r of revs) {
    const s = stats[r.shared_id] = stats[r.shared_id] || { n: 0, tasteN: 0, taste: 0, easeN: 0, ease: 0, again: 0, big: 0, ratingN: 0, rating: 0, reviews: [] };
    if (isNum(r.taste) || isNum(r.ease) || r.again || r.portion || r.eat) s.n++;
    if (isNum(r.taste)) { s.taste += r.taste; s.tasteN++; }
    if (isNum(r.ease)) { s.ease += r.ease; s.easeN++; }
    if (r.again === 'ja') s.again++; if (r.portion === 'te groot' || r.eat === 'moeilijk') s.big++;
    if (isNum(r.rating)) { s.rating += r.rating; s.ratingN++; }
    if (isNum(r.rating) || r.community_comment) s.reviews.push({ userId: r.created_by, rating: r.rating, comment: r.community_comment || '', author: names[r.created_by] || 'Communitylid', date: r.created_at || '' });
  }
  for (const r of rows) { r.stats = stats[r.id] || null; r.authorName = names[r.created_by] || 'Communitylid'; RECIPE_CACHE[r.id] = r; }
  return rows;
}
function starLine(s) {
  if (!s || (!s.n && !s.ratingN)) return tr('nog geen beoordelingen');
  const parts = [];
  if (s.tasteN) parts.push('★ ' + fmtNum(s.taste / s.tasteN, 1) + ' ' + tr('smaak'));
  if (s.easeN) parts.push(fmtNum(s.ease / s.easeN, 1) + '/5 ' + tr('gemak'));
  if (s.n) parts.push(s.n + ' ' + tr(s.n === 1 ? 'gebruikservaring' : 'gebruikservaringen'));
  if (s.again) parts.push(trf('{percent}% maakt opnieuw', { percent: Math.round(s.again / s.n * 100) }));
  if (s.ratingN) parts.push(tr('community') + ' ★ ' + fmtNum(s.rating / s.ratingN, 1) + '/5 · ' + s.ratingN);
  return parts.join(' · ');
}
function recipeCommunityReviews(r) {
  const mine = (r.stats && r.stats.reviews || []).find(x => x.userId && x.userId === (cloudUser() || {}).id);
  const list = (r.stats && r.stats.reviews || []).filter(x => x.comment || isNum(x.rating)).slice().reverse();
  const isAuthor = r.created_by && r.created_by === (cloudUser() || {}).id;
  const form = isAuthor ? '<p class="muted small">' + tr('Dit is jouw recept. Andere communityleden kunnen het beoordelen.') + '</p>' : '<h3>' + tr('Jouw beoordeling') + '</h3><p class="muted small">' + tr('Geef sterren voor je indruk of ervaring. Een reactie is optioneel en wordt zichtbaar voor andere leden.') + '</p><label class="fld"><span>' + tr('Beoordeling') + '</span><select id="recipeRating"><option value="">' + tr('Kies sterren') + '</option>' + [1, 2, 3, 4, 5].map(n => '<option value="' + n + '"' + (mine && mine.rating === n ? ' selected' : '') + '>' + '★'.repeat(n) + ' · ' + n + '/5</option>').join('') + '</select></label><label class="fld"><span>' + tr('Openbare reactie (optioneel)') + '</span><textarea id="recipeCommunityComment" maxlength="600" rows="3" placeholder="' + tr('Wat vond je van dit recept?') + '">' + esc(mine && mine.comment || '') + '</textarea></label><button class="btn" data-act="saveRecipeCommunityReview" data-id="' + esc(r.id) + '">' + tr('Beoordeling plaatsen') + '</button>';
  return '<div class="card">' + form + (list.length ? '<h3>' + tr('Reacties van leden') + '</h3>' + list.slice(0, 12).map(x => '<p class="community-review"><b>' + esc(x.author) + '</b>' + (isNum(x.rating) ? ' · ' + '★'.repeat(x.rating) + ' ' + x.rating + '/5' : '') + (x.comment ? '<br>' + esc(x.comment) : '') + '</p>').join('') : '<p class="muted small">' + tr('Nog geen openbare beoordelingen.') + '</p>') + '</div>';
}
ACT.saveCommunityName = async () => {
  try { const name = await saveCommunityProfile($('#communityName').value); $('#communityName').value = name; toast(tr('Communitynaam opgeslagen.')); if (location.hash.startsWith('#/community-profiel')) renderCommunityProfile(); }
  catch (e) { toast(trOr(e.message, 'Communitynaam opslaan is mislukt. Probeer opnieuw.')); }
};
ACT.saveRecipeCommunityReview = async el => {
  const rating = Number($('#recipeRating').value), comment = $('#recipeCommunityComment').value.trim().slice(0, 600);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return toast(tr('Kies eerst een beoordeling van 1 tot 5 sterren.'));
  try {
    if (!DB.settings.communityName) { const name = prompt(tr('Kies een communitynaam. Die is zichtbaar bij je beoordeling, niet je echte accountgegevens.')); if (!name) return; await saveCommunityProfile(name); }
    await ensureSession();
    await sb('/rest/v1/prep_reviews?on_conflict=shared_id,created_by', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: { shared_id: el.dataset.id, rating, community_comment: comment || null, updated_at: new Date().toISOString() } });
    delete RECIPE_CACHE[el.dataset.id]; toast(tr('Je beoordeling staat bij het recept.')); await renderRecipe(el.dataset.id);
  } catch (e) { toast(trOr(e.message, 'Beoordeling opslaan is mislukt. Probeer het opnieuw.')); }
};
async function renderRecipes() {
  let h = header('Gedeelde recepten', 'Mealpreps van andere gebruikers', true);
  view().innerHTML = h + '<p class="muted">' + tr('Laden…') + '</p>';
  if (!navigator.onLine) { view().innerHTML = h + '<p class="note">' + tr('Je bent offline. Gedeelde recepten laden kan alleen met internet.') + '</p>'; return; }
  try {
    RECIPE_ROWS = await fetchRecipes();
    h += '<div class="card community-guide"><b>' + tr('Zo werkt recepten delen') + '</b><p class="small">' + tr('Gedeelde recepten tonen ingrediënten en voedingswaarden per portie. Andere leden kunnen sterren en een openbare reactie achterlaten. Je eigen dagboek blijft privé. Je communitynaam verschijnt bij wat je deelt.') + '</p><a class="link" href="#/community-profiel">' + tr('Communitynaam instellen ›') + '</a></div>' +
      '<div class="card"><label class="fld"><span>' + tr('Zoek op recept, ingrediënt of communitynaam') + '</span><input type="search" id="communityRecipeSearch" data-community-filter="recipes" placeholder="' + tr('Zoek in gedeelde recepten') + '"></label>' +
      '<div class="community-filter-grid">' +
      communityFilterSelect('communityRecipeKcal', 'Energie per portie', [['all','Alle waarden'],['low','Minder dan 400 kcal'],['mid','400–700 kcal'],['high','Meer dan 700 kcal']]) +
      communityFilterSelect('communityRecipeDiet', 'Vlees of vis in de ingrediënten', [['all','Maakt niet uit'],['yes','Vlees of vis herkend'],['no','Geen vlees of vis herkend']]) +
      communityFilterSelect('communityRecipeProtein', 'Eiwit per portie', [['all','Maakt niet uit'],['high','Veel: minstens 25 g'],['low','Weinig: maximaal 10 g']]) +
      communityFilterSelect('communityRecipeFiber', 'Vezels per portie', [['all','Maakt niet uit'],['high','Veel: minstens 8 g'],['low','Weinig: maximaal 3 g']]) +
      communityFilterSelect('communityRecipeCarbs', 'Koolhydraten per portie', [['all','Maakt niet uit'],['high','Veel: minstens 45 g'],['low','Weinig: maximaal 20 g']]) + '</div>' +
      '<small class="muted">' + tr('Alle gekozen filters worden gecombineerd. Voedingswaarden gelden per portie; “veel” en “weinig” zijn zoekfilters, geen gezondheidsnorm. Vlees/vis wordt herkend in de zichtbare ingrediëntenlijst; controleer altijd zelf de ingrediënten.') + ' ' + tr('De zoekopdracht doorzoekt de nieuwste 100 gedeelde recepten.') + '</small></div><div id="communityRecipeResults"></div>';
  } catch (e) { h += '<p class="note">' + trOr(e.message, 'Laden mislukt. Controleer je verbinding en probeer opnieuw.') + '</p>'; }
  view().innerHTML = h;
  if (RECIPE_ROWS.length) renderCommunityRecipes();
}
function communityFilterSelect(id, label, options) {
  return '<label class="fld"><span>' + tr(label) + '</span><select id="' + id + '" data-community-filter="recipes">' + options.map(([value, text]) => '<option value="' + value + '">' + tr(text) + '</option>').join('') + '</select></label>';
}
function recipeHasMeatOrFish(r) {
  const text = (r.ingredients || []).map(x => x && x.name || '').join(' ').toLocaleLowerCase();
  return /\b(kip(?:filet|pen)?|rund|gehakt|varkens?|ham|spek|bacon|worst|kalf|lam|eend|kalkoen|vlees|chicken|beef|pork|sausage|lamb|duck|turkey|veal|meat|fish|vis|zalm|tonijn|makreel|kabeljauw|garnalen|scampi|mossel|oester|sardine|salmon|tuna|cod|shrimp|prawn|mussel|oyster|poulet|boeuf|porc|jambon|lardons|agneau|canard|dinde|viande|poisson|saumon|thon|crevettes|moules|huhn|rind|schwein|speck|wurst|pute|ente|truthahn|fleisch|fisch|lachs|thunfisch|garnele|muschel)\b/i.test(text);
}
function recipeMacroPass(r, filter, field, high, low) {
  if (filter === 'all') return true;
  const value = r.per && r.per[field];
  if (!isNum(value)) return false;
  return filter === 'high' ? value >= high : value <= low;
}
function renderCommunityRecipes() {
  const target = document.getElementById('communityRecipeResults'); if (!target) return;
  const needle = ((document.getElementById('communityRecipeSearch') || {}).value || '').toLocaleLowerCase().trim();
  const kcalFilter = (document.getElementById('communityRecipeKcal') || {}).value || 'all';
  const dietFilter = (document.getElementById('communityRecipeDiet') || {}).value || 'all';
  const proteinFilter = (document.getElementById('communityRecipeProtein') || {}).value || 'all';
  const fiberFilter = (document.getElementById('communityRecipeFiber') || {}).value || 'all';
  const carbsFilter = (document.getElementById('communityRecipeCarbs') || {}).value || 'all';
  const rows = RECIPE_ROWS.filter(r => {
    const searchable = [r.name, r.authorName, r.note, ...(r.ingredients || []).map(x => x.name)].join(' ').toLocaleLowerCase();
    if (needle && !searchable.includes(needle)) return false;
    const rawKcal = r.per && r.per.kcal, kcal = Number(rawKcal);
    if (kcalFilter !== 'all' && !isNum(rawKcal)) return false;
    if (kcalFilter === 'low' && kcal >= 400) return false;
    if (kcalFilter === 'mid' && (kcal < 400 || kcal > 700)) return false;
    if (kcalFilter === 'high' && kcal <= 700) return false;
    const meat = recipeHasMeatOrFish(r);
    if (dietFilter === 'yes' && !meat || dietFilter === 'no' && meat) return false;
    if (!recipeMacroPass(r, proteinFilter, 'protein', 25, 10)) return false;
    if (!recipeMacroPass(r, fiberFilter, 'fiber', 8, 3)) return false;
    if (!recipeMacroPass(r, carbsFilter, 'carbs', 45, 20)) return false;
    return true;
  });
  target.innerHTML = rows.length ? rows.map(r => { const photo = sharedRecipePhotoUrl(r.photo_url); return '<a class="card prepc" href="#/recept/' + r.id + '">' + (photo ? '<img class="prepthumb" src="' + esc(photo) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') + '<div class="pc-h"><b>' + esc(r.name) + '</b><span class="pill">' + r.portions + ' ' + tr('porties') + '</span></div><small class="muted">' + tr('Gedeeld door') + ' ' + esc(r.authorName) + '</small>' +
    '<div class="macro">' + NUTR.map(n => '<span><b>' + (isNum(r.per && r.per[n]) ? fmtNum(r.per[n]) : '–') + '</b>' + (n === 'kcal' ? 'kcal' : 'g ' + tr(NUTR_LABEL[n])) + '</span>').join('') + '</div>' +
    '<small class="muted">' + tr('per portie') + ' · ' + starLine(r.stats) + '</small></a>'; }).join('') : '<p class="card muted">' + (RECIPE_ROWS.length ? tr('Geen recepten gevonden met deze filters.') : tr('Nog geen gedeelde recepten. Deel er zelf een via een mealprep → Deel.')) + '</p>';
}
async function renderRecipe(id) {
  let h = header('Recept', 'Gedeeld via de app', true);
  view().innerHTML = h + '<p class="muted">' + tr('Laden…') + '</p>';
  let r = RECIPE_CACHE[id];
  try { if (!r || !r.stats) { await fetchRecipes(); r = RECIPE_CACHE[id]; } } catch (e) { }
  if (!r) { view().innerHTML = h + '<p class="note">' + tr('Dit recept is niet gevonden') + (navigator.onLine ? '' : ' (' + tr('je bent offline') + ')') + '.</p>'; return; }
  const photo = sharedRecipePhotoUrl(r.photo_url);
  const mine = DB.preps.find(p => p.sharedId === id);
  h += '<div class="card">' + (photo ? '<img class="prepimg" src="' + esc(photo) + '" alt="' + tr('Foto van') + ' ' + esc(r.name) + '" referrerpolicy="no-referrer">' : '') + '<h2>' + esc(r.name) + '</h2><p class="muted small">' + tr('Gedeeld door') + ' ' + esc(r.authorName || 'Communitylid') + ' · ' + r.portions + ' ' + tr('porties') + ' · ' + starLine(r.stats) + '</p>' +
    '<div class="macro big">' + NUTR.map(n => '<span><b>' + (isNum(r.per && r.per[n]) ? fmtNum(r.per[n]) : '–') + '</b>' + (n === 'kcal' ? 'kcal' : 'g ' + NUTR_LABEL[n]) + '</span>').join('') + '</div><small class="muted">' + tr('per portie, ruwe schatting') + '</small>' +
    (r.stats && r.stats.big ? '<p class="note small">' + trf('{count} van de {total} vonden de portie te groot of moeilijk op te eten.', { count: r.stats.big, total: r.stats.n }) + '</p>' : '') +
    '<h3>' + tr('Ingrediënten (hele prep)') + '</h3><ul>' + (r.ingredients || []).map(g => '<li>' + esc(g.name) + (isNum(g.grams) ? ' · ' + fmtNum(g.grams) + ' g' : '') + '</li>').join('') + '</ul>' +
    (r.note ? '<h3>' + tr('Bereiding') + '</h3><p>' + esc(r.note).replace(/\n/g, '<br>') + '</p>' : '') + '</div>' + recipeCommunityReviews(r);
  h += mine ? '<a class="btn" href="#/prep/' + mine.id + '">' + tr('Staat al bij je mealpreps') + '</a>' : '<button class="btn big" data-act="addRecipe" data-id="' + id + '">' + tr('Toevoegen aan mijn mealpreps') + '</button>';
  view().innerHTML = h;
}
ACT.addRecipe = el => {
  const r = RECIPE_CACHE[el.dataset.id]; if (!r) return;
  const p = { id: uid(), name: r.name, date: todayKey(), portions: r.portions, left: r.portions, plan: '', cooked: null, recipeNote: r.note || '', photoUrl: sharedRecipePhotoUrl(r.photo_url) || undefined, sharedId: r.id, sharedOwn: false,
    ingredients: (r.ingredients || []).map(g => ({ id: uid(), name: g.name, grams: g.grams, mode: g.mode || 'per100', per: Object.assign({ kcal: null, protein: null, carbs: null, fat: null, fiber: null }, g.per) })) };
  PREP = Object.assign(p, { isNew: true });
  toast(tr('Pas de hoeveelheden aan als je anders kookt, en bewaar.'));
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
  const why = isNum(p.left) && p.left <= 0 ? tr('is op') : trf('heb je al een week niet meer gegeten ({count} over)', { count: fmtNum(p.left, p.left % 1 ? 2 : 0) });
  return '<div class="card fb"><b>' + tr('Hoe was je mealprep?') + '</b><p class="small">' + esc(p.name) + ' ' + why + '. ' + tr('Een paar korte vragen, zo leer je wat voor jou werkt') + (p.sharedId ? ' ' + tr('en help je andere gebruikers') : '') + '.</p>' +
    '<div class="inrow wrap"><button class="btn" data-act="openFeedback" data-id="' + p.id + '">' + tr('Beantwoorden') + '</button><button class="link" data-act="snoozeFeedback" data-id="' + p.id + '">' + tr('Later') + '</button><button class="link" data-act="skipFeedback" data-id="' + p.id + '">' + tr('Niet vragen') + '</button></div>' +
    (list.length > 1 ? '<small class="muted">' + trf('Nog {count} andere mealpreps wachten op je mening.', { count: list.length - 1 }) + '</small>' : '') + '</div>';
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
  let h = '<div class="sheet-h"><h2>' + esc(p.name) + '</h2><button class="iconbtn" data-act="closeSheet" aria-label="' + esc(tr('Sluiten')) + '">✕</button></div>';
  for (const [k, q, opts] of FB_Q) {
    h += '<div class="fld" data-fq="' + k + '"><span>' + tr(q) + '</span>' + (typeof opts[0] === 'number'
      ? '<div class="stars">' + opts.map(v => '<button class="' + (FB[k] >= v ? 'on' : '') + '" data-act="fbSet" data-k="' + k + '" data-v="' + v + '" aria-label="' + v + ' ' + tr('van 5') + '">★</button>').join('') + '</div>'
      : '<div class="chips">' + opts.map(v => '<button class="chip ' + (FB[k] === v ? 'on' : '') + '" data-act="fbSet" data-k="' + k + '" data-v="' + v + '">' + tr(v) + '</button>').join('') + '</div>') + '</div>';
  }
  h += '<label class="fld"><span>' + tr('Nog iets? (optioneel)') + '</span><textarea id="fbnote" rows="2" placeholder="' + tr('bv. minder groenten, meer saus') + '">' + esc(FB.note || '') + '</textarea></label>';
  h += '<button class="btn big" data-act="fbSave">' + tr('Bewaren') + '</button>';
  $('#sheet .sheet-in').innerHTML = h;
}
ACT.fbSet = el => { const k = el.dataset.k; FB[k] = /^\d$/.test(el.dataset.v) ? Number(el.dataset.v) : el.dataset.v; const n = $('#fbnote'); if (n) FB.note = n.value; const y = $('#sheet .sheet-in').scrollTop; renderFeedback(); $('#sheet .sheet-in').scrollTop = y; };
ACT.fbSave = async () => {
  FB.note = ($('#fbnote') || {}).value || '';
  const miss = FB_Q.filter(([k]) => FB[k] === undefined);
  if (miss.length > 3) return toast(tr('Beantwoord minstens de meeste vragen.'));
  const p = prepById(FB.id);
  p.feedback = Object.assign({}, FB, { date: todayKey() }); delete p.feedback.id;
  delete p.snoozeUntil; save(); closeSheet(); toast(tr('Bedankt! Je vindt dit terug bij de mealprep.'));
  if (p.sharedId && cloudReady() && navigator.onLine) {
    try {
      await ensureSession();
      const f = p.feedback;
      await sb('/rest/v1/prep_reviews?on_conflict=shared_id,created_by', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
        body: { shared_id: p.sharedId, taste: f.taste || null, ease: f.ease || null, portion: f.portion || null, eat: f.eat || null, fullness: f.fullness || null, keep: f.keep || null, again: f.again || null } });
    } catch (e) { console.warn('review', e); }
  }
  render();
};
function feedbackSummary(f) {
  if (!f) return '';
  return [f.taste ? '★ ' + f.taste + ' ' + tr('smaak') : '', f.ease ? f.ease + '/5 ' + tr('gemak') : '', f.portion ? tr('portie') + ' ' + tr(f.portion) : '', f.eat ? tr('opeten') + ' ' + tr(f.eat) : '', f.again ? tr('opnieuw:') + ' ' + tr(f.again) : ''].filter(Boolean).join(' · ');
}
