'use strict';

const COMMUNITY_KPI_METRICS = {
  steps: { label: 'Stappen', unit: 'stappen', get: d => isNum(d.steps) ? d.steps : null },
  activity_minutes: { label: 'Beweegminuten', unit: 'min', get: d => (d.activities || []).reduce((n, a) => n + (isNum(a.min) ? a.min : 0), 0) }
};
function communityKpiWindow(period) {
  const today = todayKey(), date = parseKey(today);
  if (period === 'daily') return { start: today, end: today, label: 'Vandaag' };
  if (period === 'monthly') return { start: today.slice(0, 7) + '-01', end: today, label: 'Deze maand' };
  const start = addDays(today, -((date.getDay() + 6) % 7));
  return { start, end: today, label: 'Deze week' };
}
function communityKpiValue(metric, period) {
  const w = communityKpiWindow(period), keys = Object.keys(DB.days || {}).filter(k => k >= w.start && k <= w.end);
  const entries = keys.map(k => COMMUNITY_KPI_METRICS[metric].get(DB.days[k])).filter(isNum);
  return entries.length ? { value: Math.round(entries.reduce((a, b) => a + b, 0)), days: entries.length } : null;
}
async function fetchCommunityKpiRows(metric, period, start) {
  const rows = await sb('/rest/v1/community_kpis?select=user_id,metric,value,days_count&period_type=eq.' + encodeURIComponent(period) + '&period_start=eq.' + encodeURIComponent(start) + '&metric=eq.' + encodeURIComponent(metric) + '&order=value.desc&limit=100', {});
  const names = await fetchCommunityProfiles(rows.map(x => x.user_id));
  return rows.map(x => ({ ...x, name: names[x.user_id] || tr('Communitylid') }));
}
function communityKpiColor(userId) {
  let hash = 0;
  for (const ch of String(userId || '')) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 62% 62%)`;
}
function renderCommunityKpis(period, focusMetric) {
  period = ['daily', 'weekly', 'monthly'].includes(period) ? period : 'weekly';
  focusMetric = Object.prototype.hasOwnProperty.call(COMMUNITY_KPI_METRICS, focusMetric) ? focusMetric : '';
  const w = communityKpiWindow(period), selected = Array.isArray(DB.settings.communityKpis) ? DB.settings.communityKpis : [];
  let h = header(focusMetric ? tr(COMMUNITY_KPI_METRICS[focusMetric].label) : 'Community-KPI’s', focusMetric ? tr('Vergelijk je cijfers met communityleden') : 'Vrijwillig gedeelde beweegcijfers', true);
  h += '<div class="card note"><b>' + tr('Jij kiest wat je deelt') + '</b><p class="small">' + tr('Alleen stappen en beweegminuten staan in deze rangschikking. Calorieën, macro’s, gewicht, slaap, stemming en dagboeknotities blijven privé. Deelname is opt-in; je kunt je cijfers weer verwijderen.') + '</p><p class="small">' + tr('Je communitynaam wordt getoond naast gedeelde cijfers. Stel die in of wijzig ze via Meer.') + ' <a href="#/community-profiel">' + tr('Communitynaam instellen ›') + '</a></p></div>';
  if (!cloudReady() || !DB.settings.member) { h += '<div class="card">' + tr('Meld je aan als communitylid om vrijwillig gedeelde cijfers te bekijken of te delen.') + '</div>'; view().innerHTML = h; return; }
  h += '<div class="inrow wrap">' + [['daily', 'Dag'], ['weekly', 'Week'], ['monthly', 'Maand']].map(([v, l]) => '<a class="btn ' + (period === v ? '' : 'ghost') + '" href="#/community-kpi/' + v + (focusMetric ? '/' + focusMetric : '') + '">' + tr(l) + '</a>').join('') + (focusMetric ? '<a class="btn ghost" href="#/community-kpi/weekly">' + tr('Alle communitycijfers') + '</a>' : '') + '</div>';
  h += '<div class="card"><h3>' + tr('Delen met de community') + '</h3><p class="muted small">' + trf('{period}: {start} tot {end}. Alleen de geselecteerde totaalcijfers en je communitynaam worden gedeeld.', { period: tr(w.label), start: fmtDay(w.start), end: fmtDay(w.end) }) + '</p>';
  for (const [key, def] of Object.entries(COMMUNITY_KPI_METRICS)) { const total = communityKpiValue(key, period); h += '<label class="toggle"><input type="checkbox" data-community-kpi="' + key + '"' + (selected.includes(key) ? ' checked' : '') + '> ' + tr(def.label) + ' · ' + (total ? fmtNum(total.value, 0) + ' ' + tr(def.unit) + ' · ' + trf('{count} geregistreerde dagen', { count: total.days }) : '–') + '</label>'; }
  h += '<button class="btn" data-act="shareCommunityKpis" data-period="' + period + '">' + tr('Geselecteerde cijfers delen') + '</button> <button class="btn ghost" data-act="stopCommunityKpiSharing">' + tr('Mijn gedeelde cijfers verwijderen') + '</button><p class="muted small">' + tr('Vergelijkingen kunnen motiveren, maar vertellen niet het hele verhaal. Dagcijfers schommelen; week en maand geven meer context. Rangschikking is optioneel en bevat geen voedings- of lichaamsgewichtscore.') + '</p></div>';
  h += '<div id="communityKpiBoards"><div class="card muted">' + tr('Rangschikkingen laden…') + '</div></div>';
  view().innerHTML = h;
  loadCommunityKpiBoards(period, w.start, focusMetric).catch(e => { const target = document.getElementById('communityKpiBoards'); if (target) target.innerHTML = '<div class="card note">' + esc(tr('Communitycijfers konden niet worden geladen.') + ' ' + e.message) + '</div>'; });
}
async function loadCommunityKpiBoards(period, start, focusMetric) {
  const target = document.getElementById('communityKpiBoards'); if (!target) return;
  let html = '';
  const metrics = Object.entries(COMMUNITY_KPI_METRICS).filter(([metric]) => !focusMetric || focusMetric === metric);
  for (const [metric, def] of metrics) {
    const rows = await fetchCommunityKpiRows(metric, period, start);
    const maxValue = Math.max(1, ...rows.map(row => Number(row.value) || 0));
    html += '<div class="card community-kpi-board"><h3>' + tr(def.label) + ' · ' + tr(period === 'daily' ? 'dag' : period === 'weekly' ? 'week' : 'maand') + '</h3>' + (rows.length ? '<div class="community-kpi-rows">' + rows.map((row, i) => {
      const color = communityKpiColor(row.user_id), width = Math.max(2, (Number(row.value) || 0) / maxValue * 100);
      return '<div class="community-kpi-row" style="--member-color:' + color + ';--score-width:' + width + '%"><div class="community-kpi-row-main"><span class="community-kpi-rank">' + (i + 1) + '</span><span class="community-kpi-name"><i aria-hidden="true"></i>' + esc(row.name) + '<small>' + trf('{count} geregistreerde dagen', { count: Number(row.days_count) || 0 }) + '</small></span><b>' + fmtNum(Number(row.value), 0) + ' ' + tr(def.unit) + '</b></div><div class="community-kpi-track"><span></span></div></div>';
    }).join('') + '</div>' : '<p class="muted small">' + tr('Nog geen cijfers gedeeld voor deze periode.') + '</p>') + '</div>';
  }
  target.innerHTML = html;
}
ACT.shareCommunityKpis = async el => {
  try {
    if (!DB.settings.communityName) { const name = prompt(tr('Kies eerst je communitynaam. Die wordt bij gedeelde cijfers getoond.')); if (!name) return; await saveCommunityProfile(name); }
    const uid = (cloudUser() || {}).id; if (!uid) throw new Error(tr('Communitylid niet gevonden. Meld je opnieuw aan.'));
    const checked = [...document.querySelectorAll('[data-community-kpi]:checked')].map(x => x.dataset.communityKpi);
    const previous = Array.isArray(DB.settings.communityKpis) ? DB.settings.communityKpis : [];
    for (const metric of previous.filter(x => !checked.includes(x))) await sb('/rest/v1/community_kpis?user_id=eq.' + encodeURIComponent(uid) + '&metric=eq.' + encodeURIComponent(metric), { method: 'DELETE' });
    const period = el.dataset.period, w = communityKpiWindow(period), rows = checked.map(metric => { const total = communityKpiValue(metric, period); return total ? { user_id: uid, metric, period_type: period, period_start: w.start, value: total.value, days_count: total.days } : null; }).filter(Boolean);
    if (rows.length) await sb('/rest/v1/community_kpis?on_conflict=user_id,metric,period_type,period_start', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: rows });
    DB.settings.communityKpis = checked; save(); toast(tr('Je geselecteerde cijfers zijn gedeeld.')); renderCommunityKpis(period);
  } catch (e) { toast(tr('Delen is niet gelukt:') + ' ' + e.message); }
};
ACT.openCommunityKpi = el => go('#/community-kpi/weekly/' + el.dataset.metric);
ACT.stopCommunityKpiSharing = async () => {
  if (!confirm(tr('Alle gedeelde communitycijfers verwijderen?'))) return;
  try { const uid = (cloudUser() || {}).id; if (!uid) throw new Error(tr('Communitylid niet gevonden.')); await sb('/rest/v1/community_kpis?user_id=eq.' + encodeURIComponent(uid), { method: 'DELETE' }); DB.settings.communityKpis = []; save(); toast(tr('Je gedeelde communitycijfers zijn verwijderd.')); renderCommunityKpis('weekly'); }
  catch (e) { toast(tr('Verwijderen is niet gelukt:') + ' ' + e.message); }
};
