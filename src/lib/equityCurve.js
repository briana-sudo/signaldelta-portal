// Deterministic-ish equity curve generation matching the locked HTML baseline.
// Step D replaces this with a real EquitySnapshotNode time series (D1 Cypher).
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
