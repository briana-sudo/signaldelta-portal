// Phase 3d-iii-b — coverage-map pure logic (sized-by-potential, colored-by-status).
// Extracted so the instrument's math is unit-tested independently of canvas.

// theme.css status language (the map's legend)
// cell states map 1:1 to the disposition taxonomy — no borrowed colors.
export const STATUS_COLOR = {
  whitespace: '#00C2FF',   // cyan — the uncrowded frontier (never tested)
  gated: '#F5B544',        // warning amber — needs data / build / broker
  'tested-inconclusive': '#B07CFF', // violet — tested, underpowered, re-tests pending
  retained: '#34D399',     // success green (B1 — glows)
  killed: 'rgba(248,113,113,0.55)', // danger dimmed
  occupied: '#5A6B82',     // --fg-4 dim
};

export function statusColor(status) {
  return STATUS_COLOR[status] || STATUS_COLOR.occupied;
}

// discovery-potential → glyph area. The uncrowded frontier (0.95) is visibly large;
// picked-over ground (0.15) is small. Area scales ~linearly in potential with a
// floor so the smallest cell is still legible.
export function sizeForPotential(dp, { min = 0.15, max = 1.0, minArea = 0.18, maxArea = 1.0 } = {}) {
  const t = Math.max(0, Math.min(1, (dp - min) / (max - min)));
  return minArea + t * (maxArea - minArea);   // relative area in [minArea, maxArea]
}

// a surface "glows" when it is a hot frontier (high potential AND not picked-over)
export function isHot(surface) {
  return surface.discovery_potential >= 0.5 && surface.status !== 'occupied';
}

// hover detail for a surface (mechanism/status/score) or a drilled cell (kill reason / B1 net shape)
export function tooltipForSurface(s) {
  return [
    s.name,
    `discovery potential ${s.discovery_potential.toFixed(2)}`,
    `status ${s.status}${s.note ? ' · ' + s.note : ''}`,
    `${s.cells.length} cells`,
  ];
}

export function tooltipForCell(surface, cell, i) {
  if (cell.status === 'retained') return [`${surface.name} · cell ${i + 1}`, 'retained partial (B1)', 'net shape ~1.4%/yr'];
  if (cell.status === 'killed') return [`${surface.name} · cell ${i + 1}`, 'killed', 'see kill reason'];
  if (cell.status === 'tested-inconclusive') return [`${surface.name} · cell ${i + 1}`, 'tested — inconclusive', 'underpowered; powered re-test pending'];
  return [`${surface.name} · cell ${i + 1}`, cell.status];
}

// legend rows (label + status key) — kept in sync with the taxonomy
export const LEGEND = [
  ['Whitespace', 'whitespace'], ['Gated', 'gated'], ['Tested · inconclusive', 'tested-inconclusive'],
  ['Retained', 'retained'], ['Killed', 'killed'], ['Occupied', 'occupied'],
];

// squarified-ish layout: order surfaces by potential (desc) and assign a column
// span proportional to sqrt(area) so bigger-potential surfaces get more room.
export function layoutSpans(surfaces, columns = 12) {
  const ordered = [...surfaces].sort((a, b) => b.discovery_potential - a.discovery_potential);
  return ordered.map((s) => {
    const area = sizeForPotential(s.discovery_potential);
    const span = Math.max(2, Math.min(6, Math.round(area * 6)));
    return { surface: s, span };
  });
}
