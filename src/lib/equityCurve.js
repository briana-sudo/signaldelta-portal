// Equity curve SVG path builders.
//
// `buildEquityCurveSvgFromSeries` consumes the live D1 series (Cypher
// equity_curve_series) — array of { date, equity } points returned by
// dataAdapter.adaptEquityCurve. Falls back to null when fewer than 2
// points are available; the panel renders an "AWAITING LIVE EQUITY
// SERIES" message in that case.
//
// `buildEquityCurveSvg` is the placeholder-driven builder used pre-
// live-data wiring (Step C). Retained for the bootstrap path and as
// a reference for the canonical shape.
import { EQUITY_CURVE } from './placeholders.js';

export function buildEquityCurveSvg({ width = 600, height = 80, showBaselineLabel = true }) {
  const { start, end, peak, N } = EQUITY_CURVE;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const progress = i / (N - 1);
    const base = start + (end - start) * progress;
    const wave = Math.sin(progress * Math.PI * 2.5) * 180;
    const noise = (Math.random() - 0.5) * 120;
    let v = base + wave + noise;
    if (i === Math.floor(N * 0.82)) v = peak;
    if (i === Math.floor(N * 0.83)) v = peak - 50;
    if (i === Math.floor(N * 0.84)) v = peak - 130;
    pts.push(v);
  }
  pts[0] = start;
  pts[N - 1] = end;

  const minV = Math.min(...pts) * 0.995;
  const maxV = Math.max(...pts) * 1.005;
  const x = (i) => (i / (N - 1)) * width;
  const y = (v) => height - ((v - minV) / (maxV - minV)) * height;
  const baseY = y(start);

  let d = '';
  pts.forEach((v, i) => {
    d += (i === 0 ? 'M' : 'L') + x(i).toFixed(2) + ',' + y(v).toFixed(2) + ' ';
  });
  const fillD = d + `L${width},${baseY} L0,${baseY} Z`;
  const endX = x(N - 1);
  const endY = y(pts[N - 1]);
  const peakX = x(Math.floor(N * 0.82));
  const peakY = y(peak);

  return { d, fillD, baseY, endX, endY, peakX, peakY, width, height, showBaselineLabel };
}

export function buildEquityCurveSvgFromSeries(points, { width = 600, height = 80 } = {}) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const equities = points.map((p) => Number(p.equity) || 0);
  const start = equities[0];
  const minV = Math.min(...equities) * 0.995;
  const maxV = Math.max(...equities) * 1.005;
  const safeRange = Math.max(maxV - minV, 1);
  const N = equities.length;
  const x = (i) => (i / Math.max(N - 1, 1)) * width;
  const y = (v) => height - ((v - minV) / safeRange) * height;
  const baseY = y(start);

  let d = '';
  equities.forEach((v, i) => {
    d += (i === 0 ? 'M' : 'L') + x(i).toFixed(2) + ',' + y(v).toFixed(2) + ' ';
  });
  const fillD = d + `L${width},${baseY} L0,${baseY} Z`;
  const peakVal = Math.max(...equities);
  const peakIdx = equities.indexOf(peakVal);
  return {
    d,
    fillD,
    baseY,
    endX: x(N - 1),
    endY: y(equities[N - 1]),
    peakX: x(peakIdx),
    peakY: y(peakVal),
    width,
    height,
  };
}

// Portal Rev 35 (2026-06-04): daily-return strip geometry, sibling to the
// equity-curve builder. Derives per-period return from the SAME equity points
// the curve plots — r[i] = (equity[i]/equity[i-1] - 1) * 100 for i>=1 — so the
// strip matches the curve point-for-point by construction (weekend gaps and
// backfilled history included). NO engine write, no `percent_pnl_today` (which
// is unreliable and isn't even in the series). Pure geometry, no DOM.
//
// x-mapping is identical to buildEquityCurveSvgFromSeries (i/(N-1))*width, so
// each bar sits under its equity point. The first in-window point has no prior
// → no bar. Bars scale to the strip's OWN symmetric min/max (independent of the
// equity y-scale), zero baseline centered. `eliteThreshold` is the single-source
// Rev-33 ELITE %/day (PACE_TIERS) passed in by the caller — never hardcoded here.
//   → { bars:[{x,y,w,h,up,elite,r}], eliteMarkers:[{x,y}], zeroY, returns, width, height }
export function buildDailyReturnBars(points, { width = 600, height = 40, eliteThreshold = Infinity } = {}) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const equities = points.map((p) => Number(p.equity) || 0);
  const N = equities.length;
  const x = (i) => (i / Math.max(N - 1, 1)) * width;

  const returns = [];
  for (let i = 1; i < N; i++) {
    const prev = equities[i - 1];
    const r = (Number.isFinite(prev) && prev > 0 && Number.isFinite(equities[i]))
      ? (equities[i] / prev - 1) * 100
      : 0;
    returns.push({ date: points[i]?.date ?? null, r, elite: r >= eliteThreshold });
  }

  const zeroY = height / 2;
  const pad = 3;
  const half = Math.max(1, zeroY - pad);
  const maxAbs = Math.max(0.001, ...returns.map((d) => Math.abs(d.r)));
  const spacing = width / Math.max(N - 1, 1);
  const barW = Math.max(3, Math.min(spacing * 0.6, 26));

  const bars = [];
  const eliteMarkers = [];
  returns.forEach((d, k) => {
    const cx = x(k + 1);
    // Clamp the rect into [0, width-barW] so edge bars (first/last point) render
    // fully instead of half-clipping at the viewBox / panel edge.
    const rectX = Math.max(0, Math.min(cx - barW / 2, width - barW));
    const mag = (Math.abs(d.r) / maxAbs) * half;
    const up = d.r >= 0;
    const y = up ? zeroY - mag : zeroY;
    bars.push({ x: rectX, y, w: barW, h: Math.max(0.5, mag), up, elite: d.elite, r: d.r });
    if (d.elite) eliteMarkers.push({ x: cx, y: (zeroY - mag) - 3 });
  });

  return { bars, eliteMarkers, zeroY, returns, width, height };
}
