// ─────────────────────────────────────────────────────────────
// HeatmapModal — Strand-4 calendar-grid P&L heatmap (2026-06-10). PC desktop.
//
// GitHub-style contribution grid of DAILY realized P&L over the live window.
// Source = the broker-true daily equity series already on the 60s poll
// (adaptEquityCurve → buildDailySeries). Each cell's fill is sign+magnitude
// (green gain / red loss, scaled by the window's max |daily P&L|); days with no
// EquitySnapshotNode are GREYED honestly — never a $0 cell. Opened by the
// HEATMAP trigger on the Equity Curve panel header, or the #heatmap deep-link.
// ─────────────────────────────────────────────────────────────
import { useMemo } from 'react';
import { adaptEquityCurve } from '../lib/dataAdapter.js';
import {
  buildDailySeries, dailyMap, maxAbsPnl, heatmapColumns, pnlColor, fmtUsd, fmtPct,
} from '../lib/dailyPnl.js';
import PopupModalShell from '../lib/PopupModalShell.jsx';

// Y axis = weekdays Sun→Sat; show M/W/F labels (blank rows between), GitHub-style.
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function HeatmapModal({ open, onClose, data }) {
  const series = adaptEquityCurve(data);

  const { daily, grid, mx } = useMemo(() => {
    const d = buildDailySeries(series || []);
    return { daily: d, grid: heatmapColumns(d, dailyMap(d)), mx: maxAbsPnl(d) };
  }, [series]);

  const populated = daily.filter((d) => d.hasPnl);
  const hasAny = populated.length > 0;
  const totalPnl = populated.reduce((a, d) => a + d.pnl, 0);
  const up = populated.filter((d) => d.pnl > 0).length;
  const down = populated.filter((d) => d.pnl < 0).length;

  return (
    <PopupModalShell
      open={open}
      onClose={onClose}
      labelledBy="sd-heatmap-title"
      cardClass="sd-pop-card sd-heatmap-card"
    >
      <div className="sd-pop-head">
        <span id="sd-heatmap-title" className="sd-pop-title">
          <span className="ptitle-bar" />P&amp;L HEATMAP
        </span>
        <span className="sd-pop-head-r">
          <span className="sd-pop-sub">daily realized · broker equity</span>
          <button type="button" className="sd-pop-close" onClick={onClose}>CLOSE ✕</button>
        </span>
      </div>

      <div className="sd-pop-body">
        {!hasAny ? (
          <div className="sd-pop-empty">— NO DAILY EQUITY HISTORY YET —</div>
        ) : (
          <>
            <div className="sd-hm-wrap">
              {/* month labels — one slot per week column; label overflows right
                  from the column that opens a new month (GitHub-style). */}
              <div className="sd-hm-months" aria-hidden="true">
                {grid.columns.map((col) => (
                  <span key={col.key} className="sd-hm-mcol">
                    {col.monthStart ? <span className="sd-hm-mlbl">{col.monthLabel}</span> : null}
                  </span>
                ))}
              </div>
              <div className="sd-hm-body">
                <div className="sd-hm-wdcol" aria-hidden="true">
                  {WEEKDAYS.map((w, i) => (
                    <span key={w} className="sd-hm-wd">{i % 2 === 1 ? w : ''}</span>
                  ))}
                </div>
                <div className="sd-hm-cols">
                  {grid.columns.map((col) => (
                    <div key={col.key} className="sd-hm-col">
                      {col.cells.map((c) => {
                        let cls = 'sd-hm-cell';
                        if (!c.inRange) cls += ' sd-hm-out';
                        else if (!c.hasPnl) cls += ' sd-hm-nodata';
                        return (
                          <div
                            key={c.date}
                            className={cls}
                            style={c.inRange && c.hasPnl ? { background: pnlColor(c.pnl, mx) } : undefined}
                            title={
                              c.inRange
                                ? `${c.date} · ${
                                    c.hasPnl
                                      ? `${fmtUsd(c.pnl)} · ${fmtPct(c.pct)}`
                                      : c.hasData ? 'baseline (no prior day)' : 'no snapshot'
                                  }`
                                : ''
                            }
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="sd-hm-foot">
              <span className="sd-hm-legend">
                <span className="sd-hm-lgd-lbl">Loss</span>
                <span className="sd-hm-sw" style={{ background: 'rgba(255,61,87,0.92)' }} />
                <span className="sd-hm-sw" style={{ background: 'rgba(255,61,87,0.45)' }} />
                <span className="sd-hm-sw sd-hm-nodata" />
                <span className="sd-hm-sw" style={{ background: 'rgba(0,230,118,0.45)' }} />
                <span className="sd-hm-sw" style={{ background: 'rgba(0,230,118,0.92)' }} />
                <span className="sd-hm-lgd-lbl">Gain</span>
              </span>
              <span className="sd-hm-tot">
                Σ <strong className={totalPnl >= 0 ? 'g' : 'r'}>{fmtUsd(totalPnl)}</strong>
                {' · '}{up}↑ / {down}↓ days
              </span>
            </div>
          </>
        )}
      </div>
    </PopupModalShell>
  );
}
