// Portal v1.17 (2026-05-30) — RETURNS BY DOMAIN: 3×3 cell grid + sigma rim.
//
// Shared between PC (`.col-extra` slot, layout='pc') and mobile DATA tab
// (layout='mobile'). Same pattern as v1.14 HealthStrip.jsx.
//
// Data shape from adaptReturnsMatrix(data):
//   {
//     assetClassOrder: ['Crypto', 'Large-cap stock', 'Growth stock'],
//     trackOrder:      ['Conservative', 'Moderate', 'Aggressive'],
//     cell:   { 'Crypto:Conservative': { count, wins, winRatePct, meanReturnPct, hasData }, … },
//     colSigma: { 'Crypto': {…}, 'Large-cap stock': {…}, 'Growth stock': {…} },  // right rim
//     rowSigma: { 'Conservative': {…}, 'Moderate': {…}, 'Aggressive': {…} },     // bottom rim
//     cornerSigma: {…},   // bottom-right grand total
//     hasData: boolean,   // true when cornerSigma.count > 0
//   }
//
// Cell render contract:
//   - Primary: meanReturnPct.toFixed(1) + '%', colored green (>0) / red (<0) / dim (==0).
//   - Secondary sub-label: `n={count}` (small, dim).
//   - Empty (count == 0): "—" dim/muted, no color tint.
// Color paired with text (per accessibility constraint) + aria-label per cell.
//
// Header track labels abbreviated (CONS / MOD / AGG, matches portal's
// STD/HIGH/MAX taste); full canonical names in aria-label / title.

import { adaptReturnsMatrix } from './dataAdapter.js';

const TRACK_ABBR = {
  Conservative: 'CONS',
  Moderate: 'MOD',
  Aggressive: 'AGG',
};

function fmtReturnPct(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const sign = v > 0 ? '+' : (v < 0 ? '' : ''); // toFixed carries the minus
  return `${sign}${v.toFixed(1)}%`;
}

function returnClass(meanReturnPct, hasData) {
  if (!hasData || meanReturnPct == null) return 'rm-empty';
  if (meanReturnPct > 0) return 'rm-pos';
  if (meanReturnPct < 0) return 'rm-neg';
  return 'rm-flat';
}

function CellContents({ metric, ariaLabel, title }) {
  const cls = returnClass(metric.meanReturnPct, metric.hasData);
  return (
    <div className={'rm-cell ' + cls} aria-label={ariaLabel} title={title}>
      <div className="rm-cell-pct">{fmtReturnPct(metric.meanReturnPct)}</div>
      <div className="rm-cell-n">n={metric.count}</div>
    </div>
  );
}

export default function ReturnsMatrixPanel({ data, layout = 'pc' }) {
  const matrix = adaptReturnsMatrix(data);
  if (!matrix) {
    return (
      <div className={'panel p-returns p-returns-' + layout}>
        <div className="ptitle">
          <span><span className="ptitle-bar" />RETURNS BY DOMAIN</span>
          <span className="ptitle-r">3×3</span>
        </div>
        <div className="rm-bootstrap">— AWAITING LIVE RETURNS MATRIX —</div>
      </div>
    );
  }

  const { assetClassOrder, trackOrder, cell, colSigma, rowSigma, cornerSigma } = matrix;

  return (
    <div className={'panel p-returns p-returns-' + layout}>
      <div className="ptitle">
        <span><span className="ptitle-bar" />RETURNS BY DOMAIN</span>
        <span className="ptitle-r">{cornerSigma.count} CLOSED</span>
      </div>
      <div className="rm-grid">
        {/* Header row: blank corner + track column headers + Σ */}
        <div className="rm-h rm-corner-h" aria-hidden="true" />
        {trackOrder.map((tr) => (
          <div key={tr} className="rm-h rm-col-h" title={tr}>
            {TRACK_ABBR[tr] ?? tr}
          </div>
        ))}
        <div className="rm-h rm-col-h rm-sigma-h" title="Per-asset-class totals">Σ</div>

        {/* Body rows: asset-class label + 3 cells + col-sigma rim */}
        {assetClassOrder.map((ac) => (
          <RmRow key={ac}
            assetClass={ac}
            trackOrder={trackOrder}
            cell={cell}
            colSigma={colSigma[ac]} />
        ))}

        {/* Bottom rim: Σ label + 3 row-sigmas + corner */}
        <div className="rm-h rm-row-h rm-sigma-h" title="Per-track totals">Σ</div>
        {trackOrder.map((tr) => (
          <CellContents
            key={'rsig-' + tr}
            metric={rowSigma[tr]}
            ariaLabel={`All asset classes · ${tr}: ${fmtReturnPct(rowSigma[tr].meanReturnPct)} over ${rowSigma[tr].count} trades`}
            title={`All asset classes · ${tr}`}
          />
        ))}
        <CellContents
          metric={cornerSigma}
          ariaLabel={`Grand total: ${fmtReturnPct(cornerSigma.meanReturnPct)} over ${cornerSigma.count} trades`}
          title="Grand total"
        />
      </div>
    </div>
  );
}

function RmRow({ assetClass, trackOrder, cell, colSigma }) {
  return (
    <>
      <div className="rm-h rm-row-h" title={assetClass}>{assetClass}</div>
      {trackOrder.map((tr) => {
        const m = cell[`${assetClass}:${tr}`];
        return (
          <CellContents
            key={tr}
            metric={m}
            ariaLabel={`${assetClass} · ${tr}: ${fmtReturnPct(m.meanReturnPct)} over ${m.count} trades`}
            title={`${assetClass} · ${tr}`}
          />
        );
      })}
      <CellContents
        metric={colSigma}
        ariaLabel={`${assetClass} · all tracks: ${fmtReturnPct(colSigma.meanReturnPct)} over ${colSigma.count} trades`}
        title={`${assetClass} · all tracks`}
      />
    </>
  );
}
