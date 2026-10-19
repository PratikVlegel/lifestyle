/* Kleine, afhankelijkheidsvrije SVG-grafieken (werken offline). */
'use strict';

function svgEl(w, h, inner, label) {
  return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(label || '') + '" preserveAspectRatio="none">' + inner + '</svg>';
}
function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return step * p;
}
function xLabelEvery(n) { return n <= 8 ? 1 : n <= 16 ? 2 : n <= 35 ? 7 : 14; }

/* Staafgrafiek. data: [{k, v, lb}] ; opts: {goal, goal2, goalIsMax, dec, unit} */
function barChart(data, opts) {
  opts = opts || {};
  const W = 340, H = 190, L = 34, R = 8, T = 10, B = 24;
  const vals = data.map(d => d.v).filter(isNum);
  const maxV = niceMax(Math.max(opts.goal2 || 0, opts.goal || 0, ...vals, 0) * 1.05);
  const iw = W - L - R, ih = H - T - B;
  const bw = iw / data.length;
  const y = v => T + ih - (v / maxV) * ih;
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const v = maxV * i / 4, yy = y(v);
    g += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '"/>';
    g += '<text class="ax" x="' + (L - 4) + '" y="' + (yy + 3) + '" text-anchor="end">' + shortNum(v) + '</text>';
  }
  if (opts.goal && opts.goal2) {
    g += '<rect class="band" x="' + L + '" width="' + iw + '" y="' + y(opts.goal2) + '" height="' + (y(opts.goal) - y(opts.goal2)) + '"/>';
  }
  const every = xLabelEvery(data.length);
  data.forEach((d, i) => {
    const x = L + i * bw;
    if (isNum(d.v)) {
      const over = opts.goal && (opts.goalIsMax ? d.v > opts.goal : false);
      const cls = 'bar' + (d.lb ? ' lb' : '') + (over ? ' warn' : '');
      const hh = Math.max(1, T + ih - y(d.v));
      g += '<rect class="' + cls + '" x="' + (x + bw * 0.15) + '" y="' + y(d.v) + '" width="' + (bw * 0.7) + '" height="' + hh + '" rx="2"><title>' + fmtDay(d.k) + ': ' + (d.lb ? '≥ ' : '') + fmtNum(d.v, opts.dec) + ' ' + (opts.unit || '') + '</title></rect>';
    } else {
      g += '<rect class="nodata" x="' + (x + bw * 0.35) + '" y="' + (T + ih - 2) + '" width="' + (bw * 0.3) + '" height="2"/>';
    }
    if (i % every === 0 || i === data.length - 1 && data.length <= 8) {
      g += '<text class="ax" x="' + (x + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + xLab(d.k, data.length) + '</text>';
    }
  });
  if (opts.goal) g += '<line class="goal" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(opts.goal) + '" y2="' + y(opts.goal) + '"/>';
  if (opts.goal2) g += '<line class="goal" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(opts.goal2) + '" y2="' + y(opts.goal2) + '"/>';
  return svgEl(W, H, g, opts.label);
}

/* Lijngrafiek met optioneel 7-daags gemiddelde. */
function lineChart(data, opts) {
  opts = opts || {};
  const W = 340, H = 190, L = 34, R = 8, T = 10, B = 24;
  const vals = data.map(d => d.v).filter(isNum);
  if (!vals.length) return '<p class="muted small">' + tr('Nog geen gegevens in deze periode.') + '</p>';
  let lo = isNum(opts.min) ? opts.min : Math.floor(Math.min(...vals) - 1);
  let hi = isNum(opts.max) ? opts.max : Math.ceil(Math.max(...vals) + 1);
  if (hi === lo) hi = lo + 1;
  const iw = W - L - R, ih = H - T - B;
  const step = data.length > 1 ? iw / (data.length - 1) : 0;
  const x = i => L + i * step;
  const y = v => T + ih - ((v - lo) / (hi - lo)) * ih;
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const v = lo + (hi - lo) * i / 4, yy = y(v);
    g += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '"/>';
    g += '<text class="ax" x="' + (L - 4) + '" y="' + (yy + 3) + '" text-anchor="end">' + fmtNum(v, hi - lo < 5 ? 1 : 0) + '</text>';
  }
  const every = xLabelEvery(data.length);
  data.forEach((d, i) => {
    if (i % every === 0) g += '<text class="ax" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + xLab(d.k, data.length) + '</text>';
  });
  if (opts.ma) {
    const ma = data.map((d, i) => avg(data.slice(Math.max(0, i - 6), i + 1).map(z => z.v)));
    g += pathOf(ma.map((v, i) => [i, v]), x, y, 'ma');
  }
  g += pathOf(data.map((d, i) => [i, d.v]), x, y, 'line');
  data.forEach((d, i) => {
    if (isNum(d.v)) g += '<circle class="dot" cx="' + x(i) + '" cy="' + y(d.v) + '" r="' + (data.length > 40 ? 2 : 3.2) + '"><title>' + fmtDay(d.k) + ': ' + fmtNum(d.v, opts.dec) + ' ' + (opts.unit || '') + '</title></circle>';
  });
  return svgEl(W, H, g, opts.label);
}
function pathOf(pts, x, y, cls) {
  let d = '', pen = false;
  for (const [i, v] of pts) {
    if (!isNum(v)) { pen = false; continue; }
    d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' ';
    pen = true;
  }
  return d ? '<path class="' + cls + '" d="' + d + '"/>' : '';
}

/* Gestapelde staaf: kcal per maaltijdmoment. rows: [{k, parts:{slot:kcal}}] */
function stackChart(rows, opts) {
  const W = 340, H = 200, L = 34, R = 8, T = 10, B = 24;
  const totals = rows.map(r => Object.values(r.parts).reduce((s, v) => s + v, 0));
  const maxV = niceMax(Math.max(opts.goal || 0, ...totals, 1) * 1.05);
  const iw = W - L - R, ih = H - T - B, bw = iw / rows.length;
  const y = v => T + ih - (v / maxV) * ih;
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const v = maxV * i / 4, yy = y(v);
    g += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '"/>';
    g += '<text class="ax" x="' + (L - 4) + '" y="' + (yy + 3) + '" text-anchor="end">' + shortNum(v) + '</text>';
  }
  const every = xLabelEvery(rows.length);
  rows.forEach((r, i) => {
    let acc = 0;
    const x = L + i * bw;
    SLOT_ORDER.forEach((s, si) => {
      const v = r.parts[s] || 0;
      if (!v) return;
      const y1 = y(acc + v), hh = y(acc) - y1;
      g += '<rect class="s' + si + '" x="' + (x + bw * 0.15) + '" y="' + y1 + '" width="' + (bw * 0.7) + '" height="' + Math.max(0.5, hh - 0.6) + '"><title>' + fmtDay(r.k) + ' · ' + tr(SLOTS[s]) + ': ' + fmtNum(v) + ' kcal</title></rect>';
      acc += v;
    });
    if (i % every === 0) g += '<text class="ax" x="' + (x + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + xLab(r.k, rows.length) + '</text>';
  });
  if (opts.goal) g += '<line class="goal" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(opts.goal) + '" y2="' + y(opts.goal) + '"/>';
  const legend = '<div class="legend">' + SLOT_ORDER.map((s, si) => '<span><i class="sw s' + si + '"></i>' + tr(SLOTS[s]) + '</span>').join('') + '</div>';
  return svgEl(W, H, g, opts.label) + legend;
}

/* Spreidingsdiagram: pts [{x, y, k}] */
function scatterChart(pts, opts) {
  if (pts.length < 3) return '<p class="muted small">' + tr('Te weinig dagen met beide waarden (minstens 3 nodig).') + '</p>';
  const W = 340, H = 200, L = 34, R = 10, T = 10, B = 30;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x0 = isNum(opts.xmin) ? opts.xmin : Math.floor(Math.min(...xs)), x1 = isNum(opts.xmax) ? opts.xmax : Math.ceil(Math.max(...xs));
  const y0 = isNum(opts.ymin) ? opts.ymin : Math.floor(Math.min(...ys)), y1 = isNum(opts.ymax) ? opts.ymax : Math.ceil(Math.max(...ys));
  const iw = W - L - R, ih = H - T - B;
  const X = v => L + ((v - x0) / ((x1 - x0) || 1)) * iw;
  const Y = v => T + ih - ((v - y0) / ((y1 - y0) || 1)) * ih;
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const v = y0 + (y1 - y0) * i / 4;
    g += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text class="ax" x="' + (L - 4) + '" y="' + (Y(v) + 3) + '" text-anchor="end">' + fmtNum(v, (y1 - y0) < 5 ? 1 : 0) + '</text>';
    const xv = x0 + (x1 - x0) * i / 4;
    g += '<text class="ax" x="' + X(xv) + '" y="' + (H - 16) + '" text-anchor="middle">' + fmtNum(xv, (x1 - x0) < 5 ? 1 : 0) + '</text>';
  }
  g += '<text class="ax" x="' + (L + iw / 2) + '" y="' + (H - 3) + '" text-anchor="middle">' + esc(opts.xLabel) + '</text>';
  const fit = linFit(pts);
  if (fit) g += '<line class="trend" x1="' + X(x0) + '" y1="' + Y(fit.a + fit.b * x0) + '" x2="' + X(x1) + '" y2="' + Y(fit.a + fit.b * x1) + '"/>';
  pts.forEach(p => { g += '<circle class="dot" cx="' + X(p.x) + '" cy="' + Y(p.y) + '" r="4"><title>' + fmtDay(p.k) + ': ' + p.x + ' → ' + p.y + '</title></circle>'; });
  return svgEl(W, H, g, opts.label) + '<p class="muted small">' + trf('Verticaal: {label}. Elke stip is een dag.', { label: opts.yLabel }) + '</p>';
}
function linFit(pts) {
  const n = pts.length; if (n < 3) return null;
  const mx = avg(pts.map(p => p.x)), my = avg(pts.map(p => p.y));
  let sxy = 0, sxx = 0;
  for (const p of pts) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; }
  if (!sxx) return null;
  const b = sxy / sxx; return { a: my - b * mx, b };
}
function pearson(pts) {
  const n = pts.length; if (n < 5) return null;
  const mx = avg(pts.map(p => p.x)), my = avg(pts.map(p => p.y));
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of pts) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; }
  if (!sxx || !syy) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/* Mini-sparkline voor KPI-tegels. */
function sparkline(data, kind) {
  const W = 120, H = 30;
  const vals = data.map(d => d.v);
  const nums = vals.filter(isNum);
  if (!nums.length) return '<svg class="spark" viewBox="0 0 120 30"></svg>';
  if (kind === 'bar') {
    const mx = Math.max(...nums, 1), bw = W / data.length;
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' + vals.map((v, i) => isNum(v) ? '<rect x="' + (i * bw + bw * 0.15) + '" y="' + (H - (v / mx) * (H - 2)) + '" width="' + (bw * 0.7) + '" height="' + Math.max(1, (v / mx) * (H - 2)) + '" rx="1"/>' : '').join('') + '</svg>';
  }
  const lo = Math.min(...nums), hi = Math.max(...nums), rng = (hi - lo) || 1;
  const step = W / Math.max(1, data.length - 1);
  return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' + pathOf(vals.map((v, i) => [i, v]), i => i * step, v => H - 3 - ((v - lo) / rng) * (H - 6), 'sl') + '</svg>';
}

function shortNum(v) { return v >= 1000 ? (Math.round(v / 100) / 10).toLocaleString(currentLocale()) + 'k' : fmtNum(v, v < 10 && v % 1 ? 1 : 0); }
function xLab(k, n) { const d = parseKey(k); return n <= 8 ? d.toLocaleDateString(currentLocale(), { weekday: 'short' }) + ' ' + d.getDate() : d.getDate() + '/' + (d.getMonth() + 1); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
