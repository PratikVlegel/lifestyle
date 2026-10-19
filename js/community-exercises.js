/* Community exercise library. Shared exercise descriptions are member content; the app does not verify technique or safety. */
'use strict';

let COMMUNITY_EXERCISES = [];
let COMMUNITY_EXERCISE_CACHE = {};
let communityExerciseSearchTimer = null;
let communityExerciseSearchRevision = 0;
let communityExerciseOffset = 0;
let communityExerciseHasMore = false;

const EXERCISE_FILTERS = {
  movement: [['all','Alle soorten'],['strength','Kracht'],['cardio','Cardio'],['mobility','Mobiliteit'],['core','Core']],
  area: [['all','Alle spiergroepen'],['full_body','Hele lichaam'],['legs','Benen'],['glutes','Billen'],['chest','Borst'],['back','Rug'],['shoulders','Schouders'],['arms','Armen'],['core','Core'],['cardio','Conditie']],
  equipment: [['all','Alle materialen'],['none','Geen materiaal'],['dumbbell','Dumbbell'],['barbell','Halterstang'],['band','Weerstandsband'],['machine','Toestel'],['kettlebell','Kettlebell'],['other','Anders']],
  level: [['all','Alle niveaus'],['beginner','Beginner'],['intermediate','Gemiddeld / medior'],['advanced','Ervaren']]
};
const exerciseFilterLabels = { movement: 'Soort oefening', area: 'Spiergroep of focus', equipment: 'Materiaal', level: 'Niveau' };
function exerciseSelect(key) {
  const [label, options] = [exerciseFilterLabels[key], EXERCISE_FILTERS[key]];
  return '<label class="fld"><span>' + tr(label) + '</span><select data-community-filter="exercises" data-filter-key="' + key + '">' + options.map(([v, text]) => '<option value="' + v + '">' + tr(text) + '</option>').join('') + '</select></label>';
}
function exerciseCanUseCommunity() { return cloudReady() && DB.settings.member && navigator.onLine; }
function exerciseReviewsSummary(reviews) {
  if (!reviews.length) return tr('Nog geen beoordelingen');
  const average = reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / reviews.length;
  return '★ ' + fmtNum(average, 1) + '/5 · ' + reviews.length + ' ' + tr(reviews.length === 1 ? 'beoordeling' : 'beoordelingen');
}
function renderExerciseCommunity() {
  const h = header('Oefenbibliotheek van de community', 'Zoek oefeningen, bekijk beoordelingen en voeg ze aan je eigen schema toe', true);
  view().innerHTML = h + '<div class="card community-guide"><b>' + tr('Gedeelde oefeningen en schema’s') + '</b><p class="small">' + tr('Leden delen oefeningen met uitleg en trainingsinstellingen. Beoordelingen zijn ervaringen van leden en geen controle van techniek of veiligheid. Een volledige gedeelde opbouw kun je bekijken en als schema bewaren.') + '</p><a class="link" href="#/train-community">' + tr('Volledige communityschema’s bekijken ›') + '</a></div>' +
    '<div class="card"><label class="fld"><span>' + tr('Zoek op oefening, uitleg of communitynaam') + '</span><input id="communityExerciseSearch" type="search" data-community-filter="exercises" data-filter-key="query" placeholder="' + tr('Bijvoorbeeld roeien, core of naam') + '"></label><div class="grid2">' + ['movement','area','equipment','level'].map(exerciseSelect).join('') + '</div><a class="btn ghost" href="#/train-custom">' + tr('Deel een oefening vanuit mijn schema') + '</a></div><div id="communityExerciseResults"><p class="muted">' + tr('Oefeningen laden…') + '</p></div>';
  if (!exerciseCanUseCommunity()) {
    document.getElementById('communityExerciseResults').innerHTML = '<div class="card note">' + tr('Meld je online aan als communitylid om oefeningen te bekijken en te delen.') + '</div>';
    return;
  }
  loadCommunityExercises();
}
async function loadCommunityExercises(append) {
  const target = document.getElementById('communityExerciseResults'); if (!target) return;
  if (!append) communityExerciseOffset = 0;
  const offset = communityExerciseOffset;
  const revision = ++communityExerciseSearchRevision;
  const query = (document.getElementById('communityExerciseSearch') || {}).value || '';
  const filters = Object.fromEntries(['movement','area','equipment','level'].map(k => [k, document.querySelector('[data-filter-key="' + k + '"]')?.value || 'all']));
  if (!append) target.innerHTML = '<p class="muted">' + tr('Oefeningen laden…') + '</p>';
  try {
    await ensureSession();
    const rows = await sb('/rest/v1/rpc/search_shared_exercises', { method: 'POST', body: { p_query: query.trim() || null, p_movement_type: filters.movement === 'all' ? null : filters.movement, p_target_area: filters.area === 'all' ? null : filters.area, p_equipment: filters.equipment === 'all' ? null : filters.equipment, p_level: filters.level === 'all' ? null : filters.level, p_limit: 100, p_offset: offset } });
    if (revision !== communityExerciseSearchRevision || !document.getElementById('communityExerciseResults')) return;
    const reviews = rows.length ? await sb('/rest/v1/shared_exercise_reviews?select=exercise_id,rating,created_by&exercise_id=in.(' + rows.map(r => r.id).join(',') + ')&limit=2000', {}) : [];
    let names = {}; try { names = await fetchCommunityProfiles(rows.map(r => r.created_by)); } catch (_) { }
    const loaded = rows.map(r => Object.assign({}, r, { authorName: names[r.created_by] || tr('Communitylid'), reviews: reviews.filter(x => x.exercise_id === r.id) }));
    COMMUNITY_EXERCISES = append ? COMMUNITY_EXERCISES.concat(loaded) : loaded;
    communityExerciseOffset = offset + rows.length; communityExerciseHasMore = rows.length === 100;
    COMMUNITY_EXERCISES.forEach(r => { COMMUNITY_EXERCISE_CACHE[r.id] = r; });
    renderCommunityExerciseList();
  } catch (error) {
    console.error('Community-oefeningen laden mislukt', error);
    if (document.getElementById('communityExerciseResults')) target.innerHTML = '<div class="card note">' + tr('De oefenbibliotheek is nog niet beschikbaar. De communitytabellen op Supabase moeten eerst worden bijgewerkt.') + '</div>';
  }
}
function scheduleCommunityExerciseSearch() {
  clearTimeout(communityExerciseSearchTimer);
  communityExerciseSearchTimer = setTimeout(loadCommunityExercises, 250);
}
ACT.loadCommunityExerciseMore = () => loadCommunityExercises(true);
function renderCommunityExerciseList() {
  const target = document.getElementById('communityExerciseResults'); if (!target) return;
  const needle = ((document.getElementById('communityExerciseSearch') || {}).value || '').toLocaleLowerCase().trim();
  const rows = COMMUNITY_EXERCISES.filter(x => !needle || (x.name + ' ' + x.focus + ' ' + x.description + ' ' + x.authorName).toLocaleLowerCase().includes(needle));
  target.innerHTML = rows.map(x => '<a class="card plan-community" href="#/exercise-community/' + encodeURIComponent(x.id) + '"><div class="plan-head"><b>' + esc(x.name) + '</b><span class="pill">' + tr(x.level) + '</span></div><p class="muted small">' + esc(x.authorName) + ' · ' + tr(x.movement_type) + ' · ' + tr(x.target_area) + ' · ' + tr(x.equipment) + '</p><p class="small">' + esc(x.focus || '') + '</p><p class="small">' + exerciseReviewsSummary(x.reviews) + '</p><span class="plan-go">' + tr('Oefening bekijken ›') + '</span></a>').join('') || '<div class="card muted">' + tr('Geen oefeningen gevonden. Pas je filters aan of deel de eerste oefening.') + '</div>';
  if (communityExerciseHasMore) target.insertAdjacentHTML('beforeend', '<button class="btn ghost" data-act="loadCommunityExerciseMore">' + tr('Meer oefeningen laden') + '</button>');
}
async function renderSharedExercise(id) {
  let h = header('Communityoefening', 'Gedeelde oefening en beoordelingen', true);
  view().innerHTML = h + '<p class="muted">' + tr('Oefening laden…') + '</p>';
  if (!exerciseCanUseCommunity()) { view().innerHTML = h + '<div class="card note">' + tr('Bekijk gedeelde oefeningen als communitylid met internetverbinding.') + '</div>'; return; }
  try {
    await ensureSession();
    let x = COMMUNITY_EXERCISE_CACHE[id];
    if (!x) { const rows = await sb('/rest/v1/shared_exercises?select=*&id=eq.' + encodeURIComponent(id) + '&limit=1', {}); x = rows[0]; }
    if (!x) { view().innerHTML = h + '<div class="card note">' + tr('Deze oefening is niet gevonden.') + '</div>'; return; }
    const reviews = await sb('/rest/v1/shared_exercise_reviews?select=*&exercise_id=eq.' + encodeURIComponent(id) + '&order=created_at.desc&limit=100', {});
    let names = {}; try { names = await fetchCommunityProfiles([x.created_by].concat(reviews.map(r => r.created_by))); } catch (_) { }
    const current = (cloudUser() || {}).id, ownReview = reviews.find(r => r.created_by === current), isAuthor = x.created_by === current;
    x = Object.assign({}, x, { authorName: names[x.created_by] || tr('Communitylid'), reviews: reviews.map(r => Object.assign({}, r, { authorName: names[r.created_by] || tr('Communitylid'), mine: r.created_by === current })) }); COMMUNITY_EXERCISE_CACHE[id] = x;
    const dayOptions = customTrainingDraft().days.map(k => '<option value="' + k + '">' + tr(Object.fromEntries(TRAIN_DAYS)[k]) + '</option>').join('');
    const useForm = dayOptions ? '<div class="card"><h3>' + tr('Zet in mijn schema') + '</h3><div class="inrow wrap"><label class="fld"><span>' + tr('Trainingsdag') + '</span><select id="communityExerciseDay">' + dayOptions + '</select></label><button class="btn" data-act="addCommunityExercise" data-id="' + esc(id) + '">' + tr('Toevoegen aan mijn schema') + '</button></div><p class="muted small">' + tr('De oefening wordt toegevoegd aan je eigen weeksjabloon. Je kunt sets, herhalingen of duur, rust en uitleg nog aanpassen.') + '</p></div>' : '<div class="card note">' + tr('Kies eerst minstens één trainingsdag in je eigen schema voordat je een communityoefening toevoegt.') + ' <a class="link" href="#/train-custom">' + tr('Eigen schema maken ›') + '</a></div>';
    const reviewForm = isAuthor ? '<p class="muted small">' + tr('Dit is jouw gedeelde oefening. Andere communityleden kunnen haar beoordelen.') + '</p>' : '<h3>' + tr('Beoordeel deze oefening') + '</h3><p class="muted small">' + tr('Deel je ervaring met andere leden. Je beoordeling verschijnt onder je communitynaam.') + '</p><label class="fld"><span>' + tr('Beoordeling') + '</span><select id="exerciseRating"><option value="">' + tr('Kies sterren') + '</option>' + [1,2,3,4,5].map(n => '<option value="' + n + '"' + (ownReview?.rating === n ? ' selected' : '') + '>' + '★'.repeat(n) + ' · ' + n + '/5</option>').join('') + '</select></label><label class="fld"><span>' + tr('Reactie (optioneel)') + '</span><textarea id="exerciseComment" maxlength="600" rows="3">' + esc(ownReview?.comment || '') + '</textarea></label><button class="btn" data-act="saveExerciseReview" data-id="' + esc(id) + '">' + tr('Beoordeling plaatsen') + '</button>';
    const reviewsHtml = reviews.length ? x.reviews.map(r => '<p class="community-review"><b>' + esc(r.authorName) + '</b> · ' + '★'.repeat(r.rating) + ' ' + r.rating + '/5' + (r.comment ? '<br>' + esc(r.comment) : '') + '</p>').join('') : '<p class="muted small">' + tr('Nog geen beoordelingen.') + '</p>';
    h += '<div class="card"><div class="plan-head"><h2>' + esc(x.name) + '</h2><span class="pill">' + tr(x.level) + '</span></div><p class="muted small">' + tr('Gedeeld door') + ' ' + esc(x.authorName) + ' · ' + tr(x.movement_type) + ' · ' + tr(x.target_area) + ' · ' + tr(x.equipment) + '</p><p>' + esc(x.description || x.focus || '') + '</p><p class="small"><b>' + x.sets + ' ' + tr('sets') + ' × ' + esc(x.target) + ' · ' + x.rest_seconds + ' ' + tr('sec rust') + '</b></p><p class="muted small">' + tr('Beoordeling') + ': ' + exerciseReviewsSummary(reviews) + '</p>' + (isAuthor ? '<button class="link danger" data-act="deleteCommunityExercise" data-id="' + esc(id) + '">' + tr('Verwijder mijn gedeelde oefening') + '</button>' : '') + '</div>' + useForm + '<div class="card">' + reviewForm + '<h3>' + tr('Beoordelingen') + '</h3>' + reviewsHtml + '</div>';
    view().innerHTML = h;
  } catch (error) { console.error('Community-oefening openen mislukt', error); view().innerHTML = h + '<div class="card note">' + tr('Oefening of beoordelingen laden mislukt. Controleer of de Supabase-migratie is toegepast.') + '</div>'; }
}
function renderShareExercise(day, index) {
  const draft = customTrainingDraft(), exercise = draft.sessions[day]?.exercises[Number(index)];
  if (!exercise) { view().innerHTML = header('Oefening delen', '', true) + '<div class="card note">' + tr('Deze oefening kon niet worden gevonden.') + '</div>'; return; }
  let h = header('Oefening delen met community', 'Alleen de gekozen oefening wordt openbaar gedeeld', true);
  h += '<div class="card note"><b>' + tr('Controleer de inhoud voor je deelt') + '</b><p class="small">' + tr('Je trainingsgeschiedenis, schema en voortgang worden niet gedeeld. De oefeningsnaam, uitleg, materiaal, niveau en voorgestelde sets, herhalingen of duur worden zichtbaar voor communityleden.') + '</p></div><div class="card"><label class="fld"><span>' + tr('Naam oefening') + '</span><input id="shareExerciseName" maxlength="80" value="' + esc(exercise.name) + '"></label><label class="fld"><span>' + tr('Uitleg of focus') + '</span><textarea id="shareExerciseDescription" maxlength="1200" rows="3">' + esc(exercise.focus || '') + '</textarea></label><div class="grid2"><label class="fld"><span>' + tr('Soort oefening') + '</span><select id="shareExerciseMovement">' + EXERCISE_FILTERS.movement.slice(1).map(([v,t]) => '<option value="' + v + '">' + tr(t) + '</option>').join('') + '</select></label><label class="fld"><span>' + tr('Spiergroep of focus') + '</span><select id="shareExerciseArea">' + EXERCISE_FILTERS.area.slice(1).map(([v,t]) => '<option value="' + v + '">' + tr(t) + '</option>').join('') + '</select></label><label class="fld"><span>' + tr('Materiaal') + '</span><select id="shareExerciseEquipment">' + EXERCISE_FILTERS.equipment.slice(1).map(([v,t]) => '<option value="' + v + '">' + tr(t) + '</option>').join('') + '</select></label><label class="fld"><span>' + tr('Niveau') + '</span><select id="shareExerciseLevel">' + EXERCISE_FILTERS.level.slice(1).map(([v,t]) => '<option value="' + v + '"' + (v === draft.level ? ' selected' : '') + '>' + tr(t) + '</option>').join('') + '</select></label></div><p class="muted small">' + tr('Instellingen uit je oefening') + ': ' + esc(exercise.sets) + ' × ' + esc(exercise.reps) + ' · ' + esc(exercise.rest) + ' ' + tr('sec rust') + '</p><button class="btn big" data-act="publishCommunityExercise" data-day="' + day + '" data-i="' + Number(index) + '">' + tr('Oefening delen') + '</button></div>';
  view().innerHTML = h;
}
ACT.shareExerciseStart = () => {
  const draft = customTrainingDraft(), day = draft.days[0], index = 0;
  if (!day || !draft.sessions[day]?.exercises?.length) { go('#/train-custom'); return toast(tr('Maak eerst een oefening in je eigen schema.')); }
  if (!draft.sessions[day].exercises[index].name.trim()) return toast(tr('Vul eerst de naam van de oefening in.'));
  go('#/exercise-share/' + day + '/' + index);
};
ACT.shareExercise = el => {
  const d = customTrainingDraft(), x = d.sessions[el.dataset.day]?.exercises[Number(el.dataset.i)];
  if (!x?.name?.trim()) return toast(tr('Vul eerst de naam van de oefening in.'));
  go('#/exercise-share/' + el.dataset.day + '/' + Number(el.dataset.i));
};
ACT.publishCommunityExercise = async el => {
  const d = customTrainingDraft(), x = d.sessions[el.dataset.day]?.exercises[Number(el.dataset.i)]; if (!x) return;
  const name = $('#shareExerciseName')?.value.trim(), description = $('#shareExerciseDescription')?.value.trim() || '';
  if (!name) return toast(tr('Vul een naam in voor de oefening.'));
  if (!exerciseCanUseCommunity()) return toast(tr('Je moet online en communitylid zijn om oefeningen te delen.'));
  try {
    if (!DB.settings.communityName) { const nickname = prompt(tr('Kies eerst een communitynaam. Andere leden zien die bij jouw oefening.')); if (!nickname) return; await saveCommunityProfile(nickname); }
    if (!confirm(tr('Deze oefening wordt zichtbaar voor communityleden. Deel geen persoonlijke gegevens of privénotities.'))) return;
    await ensureSession();
    const body = { name: name.slice(0,80), focus: String(x.focus || '').slice(0,160), description: description.slice(0,1200), movement_type: $('#shareExerciseMovement').value, target_area: $('#shareExerciseArea').value, equipment: $('#shareExerciseEquipment').value, level: $('#shareExerciseLevel').value, sets: Math.max(1, Math.min(10, Number(x.sets) || 3)), target: String(x.reps || '').slice(0,16), rest_seconds: Math.max(0, Math.min(600, Number(x.rest) || 0)) };
    const rows = await sb('/rest/v1/shared_exercises', { method:'POST', headers:{ Prefer:'return=representation' }, body });
    x.communityExerciseId = rows[0].id; save(); toast(tr('Oefening gedeeld met de community.')); go('#/exercise-community/' + encodeURIComponent(rows[0].id));
  } catch (error) { console.error('Oefening delen mislukt', error); toast(tr('Oefening delen mislukt. Controleer je communitylidmaatschap en probeer opnieuw.')); }
};
ACT.addCommunityExercise = el => {
  const x = COMMUNITY_EXERCISE_CACHE[el.dataset.id]; if (!x) return toast(tr('Oefening niet gevonden. Open de bibliotheek opnieuw.'));
  const d = customTrainingDraft(), day = $('#communityExerciseDay')?.value;
  if (!day || !d.days.includes(day)) return toast(tr('Kies eerst een trainingsdag in je eigen schema.'));
  const list = d.sessions[day].exercises; if (list.length >= 20) return toast(tr('Maximaal 20 oefeningen per training.'));
  list.push({ name:x.name, focus:x.description || x.focus || '', sets:x.sets, reps:x.target, rest:x.rest_seconds, communityExerciseId:x.id }); save(); toast(tr('Communityoefening aan je schema toegevoegd.')); go('#/train-custom');
};
ACT.saveExerciseReview = async el => {
  const rating = Number($('#exerciseRating')?.value), comment = ($('#exerciseComment')?.value || '').trim().slice(0,600);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return toast(tr('Kies eerst een beoordeling van 1 tot 5 sterren.'));
  try {
    if (!DB.settings.communityName) { const nickname = prompt(tr('Kies een communitynaam. Die verschijnt bij je beoordeling.')); if (!nickname) return; await saveCommunityProfile(nickname); }
    await ensureSession();
    await sb('/rest/v1/shared_exercise_reviews?on_conflict=exercise_id,created_by', { method:'POST', headers:{ Prefer:'resolution=merge-duplicates' }, body:{ exercise_id:el.dataset.id, rating, comment:comment || null, updated_at:new Date().toISOString() } });
    delete COMMUNITY_EXERCISE_CACHE[el.dataset.id]; toast(tr('Je beoordeling is opgeslagen.')); await renderSharedExercise(el.dataset.id);
  } catch (error) { console.error('Oefeningsbeoordeling opslaan mislukt', error); toast(tr('Je beoordeling opslaan is mislukt. Probeer opnieuw.')); }
};
ACT.deleteCommunityExercise = async el => {
  if (!confirm(tr('Je gedeelde oefening verwijderen? De bijbehorende beoordelingen verdwijnen ook.'))) return;
  try { await sb('/rest/v1/shared_exercises?id=eq.' + encodeURIComponent(el.dataset.id), { method:'DELETE' }); delete COMMUNITY_EXERCISE_CACHE[el.dataset.id]; toast(tr('Gedeelde oefening verwijderd.')); go('#/train-community-exercises'); }
  catch (error) { console.error('Oefening verwijderen mislukt', error); toast(tr('Oefening verwijderen mislukt.')); }
};
