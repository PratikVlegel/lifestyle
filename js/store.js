/* Opslag, datamodel en berekeningen. Alles blijft op het toestel (localStorage). */
'use strict';

const STORE_KEY = 'vd-data-v1';
const SLOTS = {
  ontbijt: 'Ontbijt',
  tussen1: 'Voormiddag',
  lunch: 'Lunch',
  tussen2: 'Namiddag',
  avond: 'Avondeten',
  na: 'Na het avondeten'
};
const SLOT_ORDER = ['ontbijt', 'tussen1', 'lunch', 'tussen2', 'avond', 'na'];
const NUTR = ['kcal', 'protein', 'carbs', 'fat', 'fiber'];
const NUTR_LABEL = { kcal: 'kcal', protein: 'eiwit', carbs: 'koolh.', fat: 'vet', fiber: 'vezels' };

function defaultData() {
  return {
    v: 1,
    intakeDone: false,
    profile: { name: '', sex: 'm', age: null, heightCm: null, startWeight: null, activity: 'zittend', notes: '' },
    goals: { kcal: 2000, protein: 120, fiber: 30, waterMl: 2000, stepsMin: 4000, stepsMax: 5000, sleepH: 7.5, caffeineMax: 4 },
    reminders: [
      { id: 'r1', label: 'Ontbijt + weging', time: '09:00', kind: 'ontbijt', on: true },
      { id: 'r2', label: 'Lunch', time: '13:00', kind: 'lunch', on: true },
      { id: 'r3', label: 'Avondeten', time: '19:00', kind: 'avond', on: true },
      { id: 'r4', label: 'Dagopname', time: '21:00', kind: 'dag', on: true }
    ],
    settings: { apiKey: '', model: 'claude-sonnet-4-5', appUrl: '', notify: false, pushEnabled: false, glassMl: 250, theme: 'auto', moodInsights: false, communityName: '', language: 'nl-BE', homeFocus: 'balanced', palette: 'forest', textSize: 'normal' },
    training: { category: 'general', goal: 'weight', level: 'beginner', access: 'no', equipment: 'none', days: ['ma', 'wo', 'vr'], timeOfDay: 'any', minutes: 45, nutritionFocus: 'none', activityGoal: 'none', weeklyActivityMinutes: 150, eventDate: '', eventName: '', comfortableRunKm: 0, weeklyRunKm: 0, currentRunDays: 0, rehabCleared: false, generated: null, plans: [], activePlanId: null },
    days: {},
    preps: [],
    foods: [],
    ai: []
  };
}

let DB = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.warn('laden mislukt', e); }
  return defaultData();
}
function migrate(d) {
  const base = defaultData();
  const out = Object.assign(base, d);
  out.profile = Object.assign(defaultData().profile, d.profile || {});
  out.goals = Object.assign(defaultData().goals, d.goals || {});
  out.settings = Object.assign(defaultData().settings, d.settings || {});
  out.training = Object.assign(defaultData().training, d.training || {});
  out.training.days = Array.isArray(out.training.days) ? out.training.days : ['ma', 'wo', 'vr'];
  out.training.plans = Array.isArray(out.training.plans) ? out.training.plans.filter(p => p && typeof p === 'object' && typeof p.id === 'string' && Array.isArray(p.weeks) && p.weeks.length > 0 && p.weeks.every(w => w && Array.isArray(w.sessions))) : [];
  if (!out.training.plans.some(p => p.id === out.training.activePlanId && p.status === 'active')) out.training.activePlanId = null;
  out.days = d.days || {};
  out.preps = d.preps || [];
  out.foods = d.foods || [];
  out.ai = d.ai || [];
  out.reminders = (d.reminders && d.reminders.length) ? d.reminders : defaultData().reminders;
  return out;
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); return true; }
  catch (e) { alert('Opslaan mislukt: ' + e.message + '. Maak een back-up via Meer → Back-up.'); return false; }
}

/* ---------- datums ---------- */
function pad(n) { return String(n).padStart(2, '0'); }
function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function todayKey() { return keyOf(new Date()); }
function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(k, n) { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); }
function rangeKeys(endKey, n) { const out = []; for (let i = n - 1; i >= 0; i--) out.push(addDays(endKey, -i)); return out; }
const WD = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const MO = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
function fmtDay(k, long) {
  const d = parseKey(k);
  const options = long ? { weekday: 'long', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' };
  return d.toLocaleDateString(currentLocale(), options);
}
function nowTime() { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }

/* ---------- dagen ---------- */
function getDay(k, create) {
  if (!DB.days[k] && create) DB.days[k] = { meals: [], done: {} };
  const d = DB.days[k];
  if (d) { d.meals = d.meals || []; d.done = d.done || {}; }
  return d;
}
const isNum = v => typeof v === 'number' && isFinite(v);

/* Voedingssom van een dag. lb = ondergrens (een deel onbekend). */
function dayNutr(day, key) {
  if (!day) return null;
  if (key === 'kcal' && day.kcalOverride && isNum(day.kcalOverride.v)) {
    return { v: day.kcalOverride.v, lb: !!day.kcalOverride.lb, approx: true };
  }
  const meals = (day.meals || []).filter(m => !m.nothing);
  if (!meals.length) return null;
  let sum = 0, known = 0, unknown = 0;
  for (const m of meals) {
    if (isNum(m[key])) { sum += m[key]; known++; if (m.lb && m.lb.includes(key)) unknown++; } else unknown++;
  }
  if (!known) return null;
  return { v: Math.round(sum), lb: unknown > 0 };
}

/* Alle KPI-metrics op één plek. */
const METRICS = {
  kcal: { label: 'Kcal', unit: 'kcal', chart: 'bar', dec: 0, get: d => vOf(dayNutr(d, 'kcal')), lb: d => { const r = dayNutr(d, 'kcal'); return r && r.lb; }, goal: () => DB.goals.kcal, sum: true },
  protein: { label: 'Eiwit', unit: 'g', chart: 'bar', dec: 0, get: d => vOf(dayNutr(d, 'protein')), lb: d => { const r = dayNutr(d, 'protein'); return r && r.lb; }, goal: () => DB.goals.protein, sum: true },
  fiber: { label: 'Vezels', unit: 'g', chart: 'bar', dec: 0, get: d => vOf(dayNutr(d, 'fiber')), lb: d => { const r = dayNutr(d, 'fiber'); return r && r.lb; }, goal: () => DB.goals.fiber, sum: true },
  fat: { label: 'Vet', unit: 'g', chart: 'bar', dec: 0, get: d => vOf(dayNutr(d, 'fat')), lb: d => { const r = dayNutr(d, 'fat'); return r && r.lb; }, sum: true },
  water: { label: 'Water', unit: 'l', chart: 'bar', dec: 1, get: d => d && isNum(d.waterMl) ? d.waterMl / 1000 : null, goal: () => DB.goals.waterMl / 1000 },
  steps: { label: 'Stappen', unit: '', chart: 'bar', dec: 0, get: d => d && isNum(d.steps) ? d.steps : null, goal: () => DB.goals.stepsMin, goal2: () => DB.goals.stepsMax },
  sleep: { label: 'Slaap', unit: 'u', chart: 'bar', dec: 1, get: d => d && isNum(d.sleepH) ? d.sleepH : null, goal: () => DB.goals.sleepH },
  mood: { label: 'Stemming', unit: '/10', chart: 'line', dec: 1, get: d => d && isNum(d.mood) ? d.mood : null, min: 0, max: 10 },
  energy: { label: 'Energie', unit: '/10', chart: 'line', dec: 1, get: d => d && isNum(d.energy) ? d.energy : null, min: 0, max: 10 },
  weight: { label: 'Gewicht', unit: 'kg', chart: 'line', dec: 1, get: d => d && isNum(d.weight) ? d.weight : null, ma: true },
  caffeine: { label: 'Cafeïne', unit: 'shots', chart: 'bar', dec: 0, get: d => d && isNum(d.caffeine) ? d.caffeine : null, goal: () => DB.goals.caffeineMax, goalIsMax: true }
};
function vOf(r) { return r ? r.v : null; }
function metricSeries(key, endKey, n) {
  const M = METRICS[key];
  return rangeKeys(endKey, n).map(k => {
    const d = DB.days[k];
    return { k, v: M.get(d, k), lb: M.lb ? !!M.lb(d) : false };
  });
}
function avg(arr) { const a = arr.filter(isNum); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; }
function fmtNum(v, dec) {
  if (!isNum(v)) return '–';
  return v.toLocaleString(currentLocale(), { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
}

/* Laatste volledige dag: vandaag pas na de dagopname, anders gisteren. */
function completeKey() {
  const d = DB.days[todayKey()];
  const dagIds = DB.reminders.filter(r => r.kind === 'dag').map(r => r.id);
  return d && d.done && dagIds.some(id => d.done[id]) ? todayKey() : addDays(todayKey(), -1);
}
/* Waarden voor gemiddelden: bij voedingssommen enkel volledige dagen (geen ondergrens, geen lopende dag). */
function statVals(key, ser) {
  const M = METRICS[key];
  if (!M.sum && key !== 'water') return ser.map(x => x.v).filter(isNum);
  const ck = completeKey();
  return ser.filter(x => isNum(x.v) && !x.lb && x.k <= ck).map(x => x.v);
}

/* ---------- mealprep ---------- */
function ingTotals(ing) {
  const out = {};
  const g = isNum(ing.grams) ? ing.grams : 0;
  for (const n of NUTR) {
    const val = ing.per && isNum(ing.per[n]) ? ing.per[n] : null;
    if (val === null) { out[n] = null; continue; }
    out[n] = ing.mode === 'totaal' ? val : val * g / 100;
  }
  return out;
}
function prepTotals(prep) {
  const tot = {}, missing = {};
  for (const n of NUTR) { tot[n] = 0; missing[n] = 0; }
  for (const ing of prep.ingredients || []) {
    const t = ingTotals(ing);
    for (const n of NUTR) { if (t[n] === null) missing[n]++; else tot[n] += t[n]; }
  }
  const p = Math.max(1, Number(prep.portions) || 1);
  const per = {};
  for (const n of NUTR) per[n] = tot[n] / p;
  return { tot, per, missing };
}
function prepById(id) { return DB.preps.find(p => p.id === id); }

/* Een maaltijd-item met voeding uit een prep. */
function itemFromPrep(prep, portion) {
  const { per, missing } = prepTotals(prep);
  const it = { id: uid(), src: 'prep', prepId: prep.id, portion, desc: prep.name + ' (' + portionLabel(portion) + ')' };
  const lb = [];
  for (const n of NUTR) {
    const allMissing = missing[n] && missing[n] === (prep.ingredients || []).length;
    it[n] = allMissing ? null : Math.round(per[n] * portion * 10) / 10;
    if (missing[n] && !allMissing) lb.push(n);
  }
  if (lb.length) it.lb = lb;
  return it;
}
function itemFromFood(food, grams) {
  const it = { id: uid(), src: 'food', foodId: food.id, grams, desc: food.name + ' (' + grams + ' g)' };
  for (const n of NUTR) it[n] = food.per && isNum(food.per[n]) ? Math.round(food.per[n] * grams / 10) / 10 : null;
  return it;
}
function portionLabel(p) {
  const map = { 1: 'hele portie', 0.75: '¾ portie', 0.5: 'halve portie', 0.25: '¼ portie' };
  if (map[p]) return map[p];
  if (Math.abs(p - 2 / 3) < 0.01) return '⅔ portie';
  if (Math.abs(p - 1 / 3) < 0.01) return '⅓ portie';
  return Math.round(p * 100) + '% van een portie';
}
function usePortion(prepId, delta) {
  const p = prepById(prepId);
  if (!p || !isNum(p.left)) return;
  p.left = Math.max(0, Math.round((p.left - delta) * 100) / 100);
}

/* ---------- herinneringen ---------- */
function reminderStatus(k) {
  const day = getDay(k);
  const now = nowTime();
  return DB.reminders.filter(r => r.on).map(r => ({
    r, due: k < todayKey() || r.time <= now, done: !!(day && day.done && day.done[r.id])
  }));
}
function dueReminder() {
  const k = todayKey();
  const open = reminderStatus(k).filter(x => x.due && !x.done);
  return open.length ? open[open.length - 1].r : null;
}

/* ---------- import / export ---------- */
function exportJSON() { return JSON.stringify(Object.assign({}, DB, { settings: Object.assign({}, DB.settings, { apiKey: '', pushEnabled: false }) }), null, 1); }
function validateImportData(obj) {
  const record = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const fail = message => { throw new Error('Ongeldige back-up: ' + message); };
  if (!record(obj)) fail('verwacht een JSON-object.');
  for (const field of ['days', 'profile', 'goals', 'settings', 'training']) {
    if (obj[field] !== undefined && obj[field] !== null && !record(obj[field])) fail('het veld ' + field + ' heeft een ongeldig formaat.');
  }
  for (const field of ['preps', 'foods', 'ai', 'reminders', 'mealPatch']) {
    if (obj[field] !== undefined && obj[field] !== null && !Array.isArray(obj[field])) fail('het veld ' + field + ' moet een lijst zijn.');
    if (Array.isArray(obj[field]) && obj[field].length > 10000) fail('de lijst ' + field + ' is te groot.');
    if (Array.isArray(obj[field]) && field !== 'mealPatch' && obj[field].some(item => !record(item))) fail('de lijst ' + field + ' bevat een ongeldig item.');
  }
  const stack = [{ value: obj, depth: 0 }];
  while (stack.length) {
    const { value, depth } = stack.pop();
    if (depth > 40) fail('de structuur is te diep genest.');
    if (!value || typeof value !== 'object') continue;
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('de structuur bevat een onveilige sleutel.');
      if (child && typeof child === 'object') stack.push({ value: child, depth: depth + 1 });
    }
  }
  const days = obj.days || {};
  const dayKeys = Object.keys(days);
  if (dayKeys.length > 5000) fail('er staan meer dan 5.000 dagen in.');
  const numeric = (value, bounds, label) => {
    if (value === undefined || value === null) return;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < bounds[0] || value > bounds[1]) fail(label + ' bevat een waarde buiten het toegestane bereik.');
  };
  const profileRanges = { age: [0, 120], heightCm: [0, 300], startWeight: [0, 500] };
  const goalRanges = { kcal: [0, 15000], protein: [0, 1000], fiber: [0, 1000], waterMl: [0, 30000], stepsMin: [0, 200000], stepsMax: [0, 200000], sleepH: [0, 24], caffeineMax: [0, 100] };
  for (const [field, bounds] of Object.entries(profileRanges)) numeric(obj.profile && obj.profile[field], bounds, 'profiel · ' + field);
  for (const [field, bounds] of Object.entries(goalRanges)) numeric(obj.goals && obj.goals[field], bounds, 'doelen · ' + field);
  const integerFields = ['age', 'kcal', 'waterMl', 'stepsMin', 'stepsMax', 'caffeineMax'];
  for (const field of integerFields) {
    const value = field === 'age' ? obj.profile && obj.profile[field] : obj.goals && obj.goals[field];
    if (value !== undefined && value !== null && !Number.isInteger(value)) fail('profiel of doelen bevatten een waarde die geen geheel getal is.');
  }
  if (obj.goals && Number.isFinite(obj.goals.stepsMin) && Number.isFinite(obj.goals.stepsMax) && obj.goals.stepsMax < obj.goals.stepsMin) fail('het stappendoelmaximum is lager dan het minimum.');
  const ranges = { weight: [20, 500], sleepH: [0, 24], mood: [1, 10], energy: [1, 10], stress: [1, 10], steps: [0, 200000], waterMl: [0, 30000], caffeine: [0, 100], alcohol: [0, 50], softDrinkServings: [0, 100], sweetsServings: [0, 100] };
  for (const [key, day] of Object.entries(days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !record(day)) fail('een dag heeft een ongeldige datum of structuur.');
    const date = new Date(key + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== key) fail('een dag bevat een ongeldige datum.');
    if (day.meals !== undefined && !Array.isArray(day.meals)) fail('de maaltijden van ' + key + ' zijn geen lijst.');
    if ((day.meals || []).length > 100) fail('er staan meer dan 100 maaltijden op ' + key + '.');
    if (day.activities !== undefined && !Array.isArray(day.activities)) fail('de activiteiten van ' + key + ' zijn geen lijst.');
    if ((day.activities || []).length > 100) fail('er staan meer dan 100 activiteiten op ' + key + '.');
    for (const activity of day.activities || []) {
      if (!record(activity) || typeof activity.id !== 'string' || !activity.id || activity.id.length > 100 || !['wandelen', 'fietsen', 'lopen', 'zwemmen', 'kracht', 'cardio', 'padel', 'voetbal', 'dansen', 'yoga', 'huishouden', 'anders'].includes(activity.type) || !Number.isInteger(activity.min) || activity.min < 1 || activity.min > 1440 || !['licht', 'matig', 'zwaar'].includes(activity.int) || (activity.note !== undefined && (typeof activity.note !== 'string' || activity.note.length > 1000))) fail('een activiteit op ' + key + ' heeft een ongeldige structuur of waarde.');
    }
    if (day.done !== undefined && day.done !== null && !record(day.done)) fail('de herinneringen van ' + key + ' hebben een ongeldig formaat.');
    for (const [field, bounds] of Object.entries(ranges)) numeric(day[field], bounds, key + ' · ' + field);
    if (day.nicotineForms !== undefined && day.nicotineForms !== null && (!Array.isArray(day.nicotineForms) || day.nicotineForms.length > 7 || day.nicotineForms.some(v => !['cigarette', 'vape', 'nicotineGum', 'nicotinePouch', 'nicotinePatch', 'heatedTobacco', 'otherNicotine'].includes(v)) || new Set(day.nicotineForms).size !== day.nicotineForms.length)) fail(key + ' · nicotineForms bevat een ongeldige keuze.');
    if (day.weight !== undefined && day.weight !== null && day.weight !== '?' && (typeof day.weight !== 'number' || !Number.isFinite(day.weight) || day.weight < 20 || day.weight > 500)) fail(key + ' · gewicht bevat een ongeldige waarde.');
    if (day.kcalOverride !== undefined && day.kcalOverride !== null) {
      if (!record(day.kcalOverride)) fail(key + ' · kcal heeft een ongeldig formaat.');
      if (typeof day.kcalOverride.v !== 'number') fail(key + ' · kcal bevat een ongeldige waarde.');
      numeric(day.kcalOverride.v, [0, 20000], key + ' · kcal');
    }
    for (const meal of day.meals || []) {
      if (!record(meal)) fail('een maaltijd op ' + key + ' heeft een ongeldig formaat.');
      if (meal.slot !== undefined && !SLOT_ORDER.includes(meal.slot)) fail('een maaltijd op ' + key + ' heeft een onbekend eetmoment.');
      if (meal.time !== undefined && meal.time !== null && (typeof meal.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(meal.time))) fail('een maaltijd op ' + key + ' heeft een ongeldige tijd.');
      if (meal.desc !== undefined && (typeof meal.desc !== 'string' || meal.desc.length > 2000)) fail('een maaltijdtekst op ' + key + ' is ongeldig of te lang.');
      for (const field of ['kcal', 'protein', 'carbs', 'fat', 'fiber']) numeric(meal[field], field === 'kcal' ? [0, 20000] : [0, 1000], key + ' · ' + field);
    }
  }
  for (const prep of obj.preps || []) {
    if (typeof prep.id !== 'string' || !prep.id || typeof prep.name !== 'string' || prep.name.length > 200 || !Array.isArray(prep.ingredients) || prep.ingredients.length > 200) fail('een mealprep heeft een ongeldige structuur.');
    numeric(prep.portions, [0.01, 1000], 'mealprep · porties');
    numeric(prep.left, [0, 10000], 'mealprep · voorraad');
    for (const ing of prep.ingredients) {
      if (!record(ing) || (ing.name !== undefined && (typeof ing.name !== 'string' || ing.name.length > 200)) || (ing.mode !== undefined && !['per100', 'totaal'].includes(ing.mode)) || (ing.per !== undefined && !record(ing.per))) fail('een ingrediënt heeft een ongeldige structuur.');
      numeric(ing.grams, [0, 1000000], 'ingrediënt · hoeveelheid');
      for (const field of NUTR) numeric(ing.per && ing.per[field], [0, 100000], 'ingrediënt · ' + field);
    }
  }
  for (const food of obj.foods || []) {
    if (typeof food.id !== 'string' || !food.id || typeof food.name !== 'string' || food.name.length > 200 || (food.per !== undefined && !record(food.per))) fail('een product heeft een ongeldige structuur.');
    for (const field of NUTR) numeric(food.per && food.per[field], [0, 100000], 'product · ' + field);
    if (food.units !== undefined && (!Array.isArray(food.units) || food.units.length > 100 || food.units.some(unit => !record(unit) || typeof unit.n !== 'string' || unit.n.length > 100 || typeof unit.g !== 'number' || !Number.isFinite(unit.g) || unit.g <= 0 || unit.g > 100000))) fail('een producteenheid heeft een ongeldige structuur.');
  }
  for (const patch of obj.mealPatch || []) {
    if (!record(patch) || typeof patch.desc !== 'string' || patch.desc.length > 2000 || !record(patch.set)) fail('een maaltijdcorrectie heeft een ongeldige structuur.');
    for (const [field, value] of Object.entries(patch.set)) if (!NUTR.includes(field)) fail('een maaltijdcorrectie bevat een onbekend veld.'); else numeric(value, field === 'kcal' ? [0, 20000] : [0, 1000], 'maaltijdcorrectie · ' + field);
  }
  if (obj.reminders && obj.reminders.length > 100) fail('er staan meer dan 100 herinneringen in.');
  if (obj.reminders) {
    const ids = new Set();
    for (const r of obj.reminders) {
      if (typeof r.id !== 'string' || !r.id || r.id.length > 80 || ids.has(r.id) || typeof r.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) || typeof r.label !== 'string' || r.label.length > 120 || (r.on !== undefined && typeof r.on !== 'boolean') || (r.kind !== undefined && !['ontbijt', 'lunch', 'avond', 'dag', 'vrij'].includes(r.kind))) fail('een herinnering heeft een ongeldige naam of tijd.');
      ids.add(r.id);
    }
  }
  return obj;
}
function importJSON(obj, mode) {
  validateImportData(obj);
  if (!obj || typeof obj !== 'object' || !(obj.days || obj.preps || obj.foods)) throw new Error('Dit lijkt geen back-up van deze app.');
  obj.days = obj.days || {};
  if (mode === 'replace') {
    const key = DB.settings.apiKey;
    DB = migrate(obj);
    DB.settings.apiKey = key;
    DB.settings.pushEnabled = false;
  } else {
    for (const [k, d] of Object.entries(obj.days)) {
      if (!DB.days[k]) DB.days[k] = d;
      else {
        const cur = DB.days[k];
        for (const [f, v] of Object.entries(d)) if (f !== 'meals' && (cur[f] === undefined || cur[f] === null)) cur[f] = v;
        const ids = new Set((cur.meals || []).map(m => m.id));
        for (const m of d.meals || []) if (!ids.has(m.id)) cur.meals.push(m);
      }
    }
    const updated = new Set();
    for (const p of obj.preps || []) {
      const i = DB.preps.findIndex(x => x.id === p.id);
      if (i < 0) DB.preps.push(p);
      else if ((p.rev || 0) > (DB.preps[i].rev || 0)) {
        const left = DB.preps[i].left;            // je huidige voorraad blijft staan
        DB.preps[i] = Object.assign({}, p, { left: isNum(left) ? left : p.left });
        updated.add(p.id);
      }
    }
    // Maaltijden uit bijgewerkte preps: ontbrekende eiwit/koolhydraten/vet/vezels aanvullen (kcal blijft zoals genoteerd).
    if (obj.recalcMeals && updated.size) {
      for (const d of Object.values(DB.days)) for (const m of d.meals || []) {
        if (!m.prepId || !updated.has(m.prepId) || !isNum(m.portion)) continue;
        const it = itemFromPrep(prepById(m.prepId), m.portion);
        for (const n of ['protein', 'carbs', 'fat', 'fiber']) if (!isNum(m[n])) m[n] = it[n];
        if (!isNum(m.kcal)) m.kcal = it.kcal;
        delete m.lb;
      }
    }
    // Losse maaltijden aanvullen met standaardwaarden (alleen velden die nog leeg zijn).
    for (const pt of obj.mealPatch || []) {
      for (const d of Object.values(DB.days)) for (const m of d.meals || []) {
        if (!m.desc || !m.desc.startsWith(pt.desc)) continue;
        for (const [k, v] of Object.entries(pt.set)) if (!isNum(m[k])) m[k] = v;
      }
    }
    importJSON.lastUpdated = updated.size;
    const fids = new Set(DB.foods.map(f => f.id));
    for (const f of obj.foods || []) if (!fids.has(f.id)) DB.foods.push(f);
    if (obj.profile && !DB.intakeDone) DB.profile = Object.assign(DB.profile, obj.profile);
    if (obj.goals && !DB.intakeDone) DB.goals = Object.assign(DB.goals, obj.goals);
    if (obj.reminders && !DB.intakeDone) DB.reminders = obj.reminders;
  }
  DB.intakeDone = true;
  save();
}
