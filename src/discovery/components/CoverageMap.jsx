// Phase 3d-iii-b — THE HERO: the coverage map as a real CANVAS instrument.
// Surfaces sized by discovery-potential (uncrowded frontier large-and-glowing,
// picked-over ground small-and-dim) and colored by status. Hover → tooltip;
// click a surface → drill into its candidate cells. Not the static mockup SVG.
import { useEffect, useMemo, useRef, useState } from 'react';
import { statusColor, isHot, layoutSpans, tooltipForSurface, tooltipForCell } from '../coverage.js';
import { runsForSurface, deriveCellStatuses } from '../runs.js';

export default function CoverageMap({ grid, runs = [], onOpenRun, isMobile }) {
  const canvasRef = useRef(null);
  const [tip, setTip] = useState(null);           // {x,y,lines}
  const [drill, setDrill] = useState(null);       // a surface object (drilled)
  const hitRef = useRef([]);                       // [{x,y,w,h,surface,cell,i}]

  // MAP LIVENESS — cell status DERIVED from run results at render time, not the
  // stored (stale) SMGridCell.status. Correct on cold load; no repaint event needed.
  const dgrid = useMemo(() => deriveCellStatuses(grid, runs), [grid, runs]);

  // MOBILE: the packed canvas field-map is unreadable on a phone — render the same
  // surfaces as a stacked card list (name · discovery score · status · dot strip),
  // tap a card to open the surface's runs. Same DATA, compacted (not censored).
  if (isMobile) {
    const cards = [...(dgrid || [])].sort((a, b) => (b.discovery_potential || 0) - (a.discovery_potential || 0));
    return (
      <div className="map-mobile">
        {cards.map((s) => {
          const rs = runsForSurface(runs, s.surface);
          return (
            <div key={s.surface} className="mcard" onClick={() => rs[0] && onOpenRun && onOpenRun(rs[0].item_id)}>
              <div className="mcard-top">
                <span className="mcard-name">{s.name || s.surface}</span>
                <span className="mcard-score mono">{(s.discovery_potential || 0).toFixed(2)}</span>
              </div>
              <div className="mcard-dots">
                {(s.cells || []).map((c, i) => (
                  <i key={i} className="mdot" style={{ background: statusColor(c.status) }} title={c.status} />
                ))}
              </div>
              <div className="mcard-meta">
                <span className="mcard-status" style={{ color: statusColor(s.status) }}>{s.status}</span>
                {s.family && <span className="mcard-fam">{s.family}</span>}
                {rs.length > 0 && <span className="mcard-runs">{rs.length} run{rs.length !== 1 ? 's' : ''} ›</span>}
              </div>
            </div>
          );
        })}
        {cards.length === 0 && <div className="mcard-empty">No surfaces in the current state.</div>}
      </div>
    );
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let lastW = -1;
    const draw = () => paint(canvas, dgrid, drill, hitRef);
    draw();
    lastW = canvas.parentElement.clientWidth;
    // re-layout only on WIDTH change (the canvas height is derived from content,
    // so observing height too would feed back on itself)
    const ro = new ResizeObserver(() => {
      const w = canvas.parentElement.clientWidth;
      if (w !== lastW) { lastW = w; draw(); }
    });
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, [dgrid, drill]);

  function onMove(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const hit = hitRef.current.find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
    if (!hit) { setTip(null); return; }
    const lines = hit.cell ? tooltipForCell(hit.surface, hit.cell, hit.i) : tooltipForSurface(hit.surface);
    setTip({ x: x + 14, y: y + 12, lines });
  }
  function onClick(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const hit = hitRef.current.find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
    if (hit && !drill) setDrill(hit.surface);
  }

  return (
    <div className="map" onMouseMove={onMove} onMouseLeave={() => setTip(null)} onClick={onClick}>
      <canvas ref={canvasRef} role="img" aria-label="Coverage map — surfaces sized by discovery potential, colored by status" />
      {drill && (
        <div className="drill" onClick={(e) => e.stopPropagation()}>
          <button onClick={(e) => { e.stopPropagation(); setDrill(null); }}>← all surfaces</button>
          {(() => {
            const rs = runsForSurface(runs, drill.surface);
            if (!rs.length) return <span className="drill-empty">no runs behind this surface yet</span>;
            return (
              <div className="drill-runs">
                <span className="drill-runs-h">runs behind {drill.surface}:</span>
                {rs.map((r) => (
                  <button key={r.item_id} className="drill-run mono" title="open run report"
                          onClick={() => onOpenRun && onOpenRun(r.item_id)}>
                    {r.recipe_id} · {String(r.disposition || r.status || '').split(' ')[0]}
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
      )}
      {tip && (
        <div className="tip" style={{ left: tip.x, top: tip.y }}>
          {tip.lines.map((l, i) => <div key={i} className={i === 0 ? 't0' : 'tn'}>{l}</div>)}
        </div>
      )}
    </div>
  );
}

// --- canvas paint (pure-ish; records hit-boxes for hover/click) --------------
const ROW_H = 118;
const GAP = 10;

// pack surfaces into rows on a 12-col grid, bigger potential first
function packSurfaces(grid) {
  const spans = layoutSpans(grid, 12);
  const placed = [];
  let col = 0, row = 0;
  for (const { surface, span } of spans) {
    if (col + span > 12) { col = 0; row++; }
    placed.push({ surface, span, col, row });
    col += span;
  }
  return placed;
}

function paint(canvas, grid, drill, hitRef) {
  const parent = canvas.parentElement;
  const W = Math.max(320, parent.clientWidth - 16);
  const dpr = window.devicePixelRatio || 1;
  hitRef.current = [];

  // HEIGHT IS DERIVED FROM CONTENT so no row is ever clipped — the canvas grows
  // to fit every surface (or every drilled cell) and the stage scrolls if needed.
  let placed = null;
  let H;
  if (drill) {
    H = drillHeight(W, drill);
  } else {
    placed = packSurfaces(grid);
    const rows = placed.length ? Math.max(...placed.map((p) => p.row)) + 1 : 1;
    H = rows * (ROW_H + GAP) + GAP;
  }
  H = Math.max(H, 300);

  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  if (drill) { paintDrill(ctx, W, H, drill, hitRef); return; }

  const colW = W / 12;
  for (const { surface, span, col, row } of placed) {
    const x = col * colW + GAP / 2, y = row * (ROW_H + GAP) + GAP / 2;
    const w = span * colW - GAP, h = ROW_H - GAP;
    paintSurface(ctx, x, y, w, h, surface, hitRef);
  }
}

function drillHeight(W, s) {
  const cs = 26, cg = 8, x0 = 14, y0 = 66;
  const perRow = Math.max(1, Math.floor((W - x0 + cg) / (cs + cg)));
  const rows = Math.ceil(s.cells.length / perRow);
  return y0 + rows * (cs + cg) + 16;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function paintSurface(ctx, x, y, w, h, s, hitRef) {
  const hot = isHot(s);
  // panel
  ctx.save();
  if (hot) { ctx.shadowColor = 'rgba(0,194,255,0.25)'; ctx.shadowBlur = 18; }
  ctx.fillStyle = '#1A3A5C';
  roundRect(ctx, x, y, w, h, 6); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = hot ? 'rgba(0,194,255,0.4)' : 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1; roundRect(ctx, x, y, w, h, 6); ctx.stroke();

  // name + discovery potential
  ctx.fillStyle = s.status === 'occupied' ? '#8A9BB0' : '#FFFFFF';
  ctx.font = '600 12px Inter, sans-serif';
  ctx.fillText(clip(ctx, s.name, w - 52), x + 11, y + 20);
  ctx.fillStyle = '#8A9BB0';
  ctx.font = '500 11px "JetBrains Mono", monospace';
  ctx.fillText(s.discovery_potential.toFixed(2), x + w - 34, y + 20);

  // status tag
  const tag = { whitespace: 'WHITESPACE', gated: 'GATED', 'tested-inconclusive': 'TESTED · INCONCLUSIVE', occupied: s.note?.includes('exhausted') ? 'OWNED · EXHAUSTED' : 'MAPPED' }[s.status] || s.status.toUpperCase();
  ctx.fillStyle = tagColor(s.status); ctx.font = '500 9px Inter, sans-serif';
  ctx.fillText(tag, x + 11, y + 36);

  // cells (colored by status; retained glows)
  const cs = 11, cg = 3;
  let cx = x + 11, cy = y + h - 11 - cs;
  const perRow = Math.max(1, Math.floor((w - 22 + cg) / (cs + cg)));
  s.cells.forEach((cell, i) => {
    const gx = cx + (i % perRow) * (cs + cg);
    const gy = cy - Math.floor(i / perRow) * (cs + cg);
    ctx.save();
    if (cell.status === 'retained') { ctx.shadowColor = 'rgba(52,211,153,0.6)'; ctx.shadowBlur = 8; }
    ctx.fillStyle = statusColor(cell.status);
    roundRect(ctx, gx, gy, cs, cs, 2); ctx.fill();
    ctx.restore();
    hitRef.current.push({ x: gx, y: gy, w: cs, h: cs, surface: s, cell, i });
  });
  hitRef.current.push({ x, y, w, h, surface: s });  // surface-level hit (behind cells)
}

function paintDrill(ctx, W, H, s, hitRef) {
  ctx.fillStyle = '#FFFFFF'; ctx.font = '600 15px Inter, sans-serif';
  ctx.fillText(`${s.name} — candidate cells`, 14, 28);
  ctx.fillStyle = '#8A9BB0'; ctx.font = '400 12px Inter, sans-serif';
  ctx.fillText(`${s.cells.length} cells · potential ${s.discovery_potential.toFixed(2)}`, 14, 48);
  const cs = 26, cg = 8, x0 = 14, y0 = 66;
  const perRow = Math.max(1, Math.floor((W - x0 + cg) / (cs + cg)));
  s.cells.forEach((cell, i) => {
    const gx = x0 + (i % perRow) * (cs + cg), gy = y0 + Math.floor(i / perRow) * (cs + cg);
    ctx.save();
    if (cell.status === 'retained') { ctx.shadowColor = 'rgba(52,211,153,0.6)'; ctx.shadowBlur = 10; }
    ctx.fillStyle = statusColor(cell.status);
    roundRect(ctx, gx, gy, cs, cs, 4); ctx.fill();
    ctx.restore();
    hitRef.current.push({ x: gx, y: gy, w: cs, h: cs, surface: s, cell, i });
  });
}

function tagColor(status) {
  return { whitespace: '#00C2FF', gated: '#F5B544', occupied: '#8A9BB0' }[status] || '#8A9BB0';
}
function clip(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 4 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
