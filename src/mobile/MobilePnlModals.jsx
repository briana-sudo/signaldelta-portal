// ─────────────────────────────────────────────────────────────
// Mobile P&L popups — heatmap + returns calendar (Strand 4 mobile parity,
// 2026-06-11). MOBILE ONLY. Full-screen bottom sheets via ModalPortal (the
// mobile modal idiom), consuming the SAME broker-true daily-equity series the
// PC popups use (adaptEquityCurve → dailyPnl helpers). No proxy touch; the
// §6.6 36-corrupt-close exclusion is intrinsic to broker equity.
//
// Pure helpers (heatmapColumns / monthMatrix / pnlColor / fmt*) are shared with
// the PC popups in lib/dailyPnl.js — no duplication. Mobile-scoped styles
// (.m-hm-* / .m-cal-* / .m-pnl-*) keep desktop untouched. Tap a heatmap cell for
// its detail (mobile has no hover); cells also carry a title for long-press.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { adaptEquityCurve } from '../lib/dataAdapter.js';
import {
  buildDailySeries, dailyMap, maxAbsPnl, heatmapColumns, monthsWithData,
  monthMatrix, monthTotals, pnlColor, fmtUsd, fmtPct, monthLabel,
} from '../lib/dailyPnl.js';
import ModalPortal from '../lib/ModalPortal.jsx';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function Sheet({ title, sub, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <ModalPortal>
      <div className="m-pnl-sheet" onClick={onClose}>
        <div className="m-pnl-card" onClick={(e) => e.stopPropagation()}>
          <div className="m-pnl-head">
            <span className="m-pnl-title"><span className="ptitle-bar" />{title}</span>
            <span className="m-pnl-head-r">
              {sub && <span className="m-pnl-sub">{sub}</span>}
              <button type="button" className="m-pnl-close" onClick={onClose}>✕</button>
            </span>
          </div>
          <div className="m-pnl-body">{children}</div>
        </div>
      </div>
    </ModalPortal>
  );
}

export function MobileHeatmapModal({ open, onClose, data }) {
  const series = adaptEquityCurve(data);
  const { daily, grid, mx } = useMemo(() => {
    const d = buildDailySeries(series || []);
    return { daily: d, grid: heatmapColumns(d, dailyMap(d)), mx: maxAbsPnl(d) };
  }, [series]);
  const [sel, setSel] = useState(null);
  if (!open) return null;

  const populated = daily.filter((d) => d.hasPnl);
  const hasAny = populated.length > 0;
  const totalPnl = populated.reduce((a, d) => a + d.pnl, 0);
  const up = populated.filter((d) => d.pnl > 0).length;
  const down = populated.filter((d) => d.pnl < 0).length;

  return (
    <Sheet title="P&L HEATMAP" sub="daily · broker equity" onClose={onClose}>
      {!hasAny ? (
        <div className="m-pnl-empty">— NO DAILY EQUITY HISTORY YET —</div>
      ) : (
        <>
          <div className="m-hm-detail">
            {sel
              ? `${sel.date} · ${sel.hasPnl ? `${fmtUsd(sel.pnl)} · ${fmtPct(sel.pct)}` : (sel.hasData ? 'baseline (no prior day)' : 'no snapshot')}`
              : 'tap a day for detail'}
          </div>
          <div className="m-hm-wrap">
            <div className="m-hm-months" aria-hidden="true">
              {grid.columns.map((col) => (
                <span key={col.key} className="m-hm-mcol">
                  {col.monthStart ? <span className="m-hm-mlbl">{col.monthLabel}</span> : null}
                </span>
              ))}
            </div>
            <div className="m-hm-body">
              <div className="m-hm-wdcol" aria-hidden="true">
                {WEEKDAYS.map((w, i) => (
                  <span key={w} className="m-hm-wd">{i % 2 === 1 ? w[0] : ''}</span>
                ))}
              </div>
              <div className="m-hm-cols">
                {grid.columns.map((col) => (
                  <div key={col.key} className="m-hm-col">
                    {col.cells.map((c) => {
                      let cls = 'm-hm-cell';
                      if (!c.inRange) cls += ' m-hm-out';
                      else if (!c.hasPnl) cls += ' m-hm-nodata';
                      return (
                        <div
                          key={c.date}
                          className={cls}
                          style={c.inRange && c.hasPnl ? { background: pnlColor(c.pnl, mx) } : undefined}
                          title={c.inRange ? `${c.date} · ${c.hasPnl ? `${fmtUsd(c.pnl)} · ${fmtPct(c.pct)}` : (c.hasData ? 'baseline (no prior day)' : 'no snapshot')}` : ''}
                          onClick={c.inRange ? () => setSel(c) : undefined}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="m-hm-foot">
            <span className="m-hm-legend">
              <span className="m-hm-lgd">Loss</span>
              <span className="m-hm-sw" style={{ background: 'rgba(255,61,87,0.92)' }} />
              <span className="m-hm-sw m-hm-nodata" />
              <span className="m-hm-sw" style={{ background: 'rgba(0,230,118,0.92)' }} />
              <span className="m-hm-lgd">Gain</span>
            </span>
            <span className="m-hm-tot">
              Σ <strong className={totalPnl >= 0 ? 'g' : 'r'}>{fmtUsd(totalPnl)}</strong> · {up}↑/{down}↓
            </span>
          </div>
        </>
      )}
    </Sheet>
  );
}

export function MobileCalendarModal({ open, onClose, data }) {
  const series = adaptEquityCurve(data);
  const { map, months } = useMemo(() => {
    const d = buildDailySeries(series || []);
    return { map: dailyMap(d), months: monthsWithData(d) };
  }, [series]);
  const [idx, setIdx] = useState(0);
  useEffect(() => { if (open && months.length) setIdx(months.length - 1); }, [open, months.length]);
  if (!open) return null;

  const safeIdx = Math.min(Math.max(idx, 0), Math.max(months.length - 1, 0));
  const ym = months[safeIdx] || null;
  const [y, m] = ym ? ym.split('-').map(Number) : [null, null];
  const weeks = ym ? monthMatrix(y, m - 1, map) : [];
  const totals = monthTotals(weeks);
  const hasAny = months.length > 0;

  return (
    <Sheet title="RETURNS CALENDAR" sub="daily return" onClose={onClose}>
      {!hasAny ? (
        <div className="m-pnl-empty">— NO DAILY EQUITY HISTORY YET —</div>
      ) : (
        <>
          <div className="m-cal-nav">
            <button type="button" className="m-cal-navbtn" disabled={safeIdx <= 0}
              onClick={() => setIdx((i) => Math.max(0, i - 1))}>‹</button>
            <span className="m-cal-month">{monthLabel(ym)}</span>
            <button type="button" className="m-cal-navbtn" disabled={safeIdx >= months.length - 1}
              onClick={() => setIdx((i) => Math.min(months.length - 1, i + 1))}>›</button>
          </div>
          <div className="m-cal-grid">
            {DOW.map((d, i) => <span key={i} className="m-cal-dow">{d}</span>)}
            {weeks.flat().map((c) => {
              let cls = 'm-cal-cell';
              if (!c.inMonth) cls += ' m-cal-out';
              else if (!c.hasPnl) cls += ' m-cal-nodata';
              else cls += c.pnl >= 0 ? ' m-cal-pos' : ' m-cal-neg';
              return (
                <div key={c.date} className={cls} title={c.inMonth ? c.date : ''}>
                  <span className="m-cal-day">{c.day}</span>
                  {c.inMonth && c.hasPnl && (
                    <>
                      <span className="m-cal-pct">{fmtPct(c.pct)}</span>
                      <span className="m-cal-usd">{fmtUsd(c.pnl)}</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="m-cal-foot">
            <span>{totals.days} day{totals.days === 1 ? '' : 's'}</span>
            <span>Σ <strong className={totals.pnl >= 0 ? 'g' : 'r'}>{fmtUsd(totals.pnl)}</strong> · {totals.up}↑/{totals.down}↓</span>
          </div>
        </>
      )}
    </Sheet>
  );
}
