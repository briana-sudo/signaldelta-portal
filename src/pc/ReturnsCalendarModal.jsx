// ─────────────────────────────────────────────────────────────
// ReturnsCalendarModal — Strand-4 returns calendar popup (2026-06-10). PC.
//
// Month-grid view of DAILY returns over the live window. Same broker-true daily
// equity source as the heatmap (adaptEquityCurve → buildDailySeries); each day
// cell shows its return % (green/red) + $ P&L. Days with no EquitySnapshotNode
// and out-of-month cells are GREYED honestly — never a $0 day. Prev/next stays
// within the months that actually have data. Opened by the CALENDAR trigger on
// the Equity Curve panel header, or the #calendar deep-link.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { adaptEquityCurve } from '../lib/dataAdapter.js';
import {
  buildDailySeries, dailyMap, monthsWithData, monthMatrix, monthTotals,
  fmtUsd, fmtPct, monthLabel,
} from '../lib/dailyPnl.js';
import PopupModalShell from '../lib/PopupModalShell.jsx';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function ReturnsCalendarModal({ open, onClose, data }) {
  const series = adaptEquityCurve(data);

  const { map, months } = useMemo(() => {
    const d = buildDailySeries(series || []);
    return { map: dailyMap(d), months: monthsWithData(d) };
  }, [series]);

  // Default to the most recent month that has data; re-pin each time we open.
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (open && months.length) setIdx(months.length - 1);
  }, [open, months.length]);

  const safeIdx = Math.min(Math.max(idx, 0), Math.max(months.length - 1, 0));
  const ym = months[safeIdx] || null;
  const [y, m] = ym ? ym.split('-').map(Number) : [null, null];

  const weeks = useMemo(() => (ym ? monthMatrix(y, m - 1, map) : []), [ym, y, m, map]);
  const totals = useMemo(() => monthTotals(weeks), [weeks]);

  const hasAny = months.length > 0;
  const canPrev = safeIdx > 0;
  const canNext = safeIdx < months.length - 1;

  return (
    <PopupModalShell
      open={open}
      onClose={onClose}
      labelledBy="sd-calendar-title"
      cardClass="sd-pop-card sd-calendar-card"
    >
      <div className="sd-pop-head">
        <span id="sd-calendar-title" className="sd-pop-title">
          <span className="ptitle-bar" />RETURNS CALENDAR
        </span>
        <span className="sd-pop-head-r">
          <span className="sd-pop-sub">daily return · broker equity</span>
          <button type="button" className="sd-pop-close" onClick={onClose}>CLOSE ✕</button>
        </span>
      </div>

      <div className="sd-pop-body">
        {!hasAny ? (
          <div className="sd-pop-empty">— NO DAILY EQUITY HISTORY YET —</div>
        ) : (
          <>
            <div className="sd-cal-nav">
              <button
                type="button"
                className="sd-cal-navbtn"
                onClick={() => setIdx((i) => Math.max(0, i - 1))}
                disabled={!canPrev}
                title="Previous month"
              >‹</button>
              <span className="sd-cal-month">{monthLabel(ym)}</span>
              <button
                type="button"
                className="sd-cal-navbtn"
                onClick={() => setIdx((i) => Math.min(months.length - 1, i + 1))}
                disabled={!canNext}
                title="Next month"
              >›</button>
            </div>

            <div className="sd-cal-grid">
              {DOW.map((d, i) => (
                <span key={i} className="sd-cal-dow">{d}</span>
              ))}
              {weeks.flat().map((c) => {
                let cls = 'sd-cal-cell';
                if (!c.inMonth) cls += ' sd-cal-out';
                else if (!c.hasPnl) cls += ' sd-cal-nodata';
                else cls += c.pnl >= 0 ? ' sd-cal-pos' : ' sd-cal-neg';
                return (
                  <div key={c.date} className={cls} title={c.inMonth ? c.date : ''}>
                    <span className="sd-cal-day">{c.day}</span>
                    {c.inMonth && c.hasPnl && (
                      <>
                        <span className="sd-cal-pct">{fmtPct(c.pct)}</span>
                        <span className="sd-cal-usd">{fmtUsd(c.pnl)}</span>
                      </>
                    )}
                    {c.inMonth && !c.hasPnl && <span className="sd-cal-dash">·</span>}
                  </div>
                );
              })}
            </div>

            <div className="sd-cal-foot">
              <span>{totals.days} trading day{totals.days === 1 ? '' : 's'}</span>
              <span className="sd-cal-foot-tot">
                Σ <strong className={totals.pnl >= 0 ? 'g' : 'r'}>{fmtUsd(totals.pnl)}</strong>
                {' · '}{totals.up}↑ / {totals.down}↓
              </span>
            </div>
          </>
        )}
      </div>
    </PopupModalShell>
  );
}
