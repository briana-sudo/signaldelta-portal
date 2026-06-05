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
// → no bar. Rev 37: bars use a FIXED ±RETURN_SCALE_PCT full-scale (not the old
// data-driven max|r|), zero baseline CENTERED at the strip's own middle
// (positive grows UP from center, negative grows DOWN — rects straddle zeroY).
//
// Rev 36 (2026-06-04): each bar carries a `tier` keyed off the SINGLE-SOURCE
// Rev-33 PACE_TIERS thresholds (passed in, never hardcoded):
//   down   r < 0
//   pos    0 <= r < strongThreshold        (standard positive — green)
//   strong strongThreshold <= r < eliteThreshold
//   elite  r >= eliteThreshold
// The Rev-35 gold elite PIP markers are removed — tier is now the BAR COLOR.
//   → { bars:[{x,y,w,h,up,tier,r,frac}], zeroY, returns, width, height }

// Rev 37/39 (2026-06-04): fixed full-scale for the daily-return strip. A day at
// or beyond ±RETURN_SCALE_PCT clamps to the rail (full half-band). Constant
// day-to-day so bar heights are comparable across the series and don't silently
// rescale under the operator. Rev 39: 3.0 → 1.5 (bars ~2× taller; no layout cost
// — every frac doubles within the unchanged 48px strip / centered geometry).
export const RETURN_SCALE_PCT = 1.5;

export function buildDailyReturnBars(
  points,
  { width = 600, height = 40, strongThreshold = Infinity, eliteThreshold = Infinity } = {},
) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const equities = points.map((p) => Number(p.equity) || 0);
  const N = equities.length;
  const x = (i) => (i / Math.max(N - 1, 1)) * width;

  const tierOf = (r) => {
    if (r < 0) return 'down';
    if (r >= eliteThreshold) return 'elite';
    if (r >= strongThreshold) return 'strong';
    return 'pos';
  };

  const returns = [];
  for (let i = 1; i < N; i++) {
    const prev = equities[i - 1];
    const r = (Number.isFinite(prev) && prev > 0 && Number.isFinite(equities[i]))
      ? (equities[i] / prev - 1) * 100
      : 0;
    returns.push({ date: points[i]?.date ?? null, r, tier: tierOf(r) });
  }

  // Zero-centered at the strip's OWN middle; fixed ±RETURN_SCALE_PCT full-scale.
  const zeroY = height / 2;
  const pad = 2;
  const half = Math.max(1, zeroY - pad); // usable half-height per direction
  const spacing = width / Math.max(N - 1, 1);
  const barW = Math.max(3, Math.min(spacing * 0.6, 26));

  const bars = returns.map((d, k) => {
    const cx = x(k + 1);
    // Clamp the rect into [0, width-barW] so edge bars (first/last point) render
    // fully instead of half-clipping at the viewBox / panel edge.
    const rectX = Math.max(0, Math.min(cx - barW / 2, width - barW));
    const frac = Math.min(Math.abs(d.r) / RETURN_SCALE_PCT, 1); // clamp >±3% to the rail
    const mag = frac * half;
    const up = d.r >= 0;
    // up → rect from (zeroY - mag) up to zeroY; down → from zeroY down by mag.
    return { x: rectX, y: up ? zeroY - mag : zeroY, w: barW, h: Math.max(0.5, mag), up, tier: d.tier, r: d.r, frac };
  });

  return { bars, zeroY, returns, width, height };
}
