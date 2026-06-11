// ─────────────────────────────────────────────────────────────
// Daily P&L dataset + calendar-grid builders for the Strand-4 heatmap /
// returns-calendar popups (2026-06-10). PURE — no fetch, no proxy touch.
//
// SOURCE: the SAME broker-true daily equity_total series that already feeds the
// EquityCurve panel's daily-return bars — adaptEquityCurve(data) → [{date:
// 'YYYY-MM-DD', equity}]. It arrives on the 60s poll via Q_EQUITY_CURVE
// (equity_curve_series), so the popups consume data the proxy ALREADY serves.
//
// Daily P&L is the consecutive-day equity delta; % is equity[i]/equity[i-1]-1.
// Because the series is broker equity (not a TradeNode.pnl_dollar aggregation),
// the §6.6 36-corrupt-close exclusion is intrinsic — those closes never enter a
// broker end-of-day equity mark. Days with NO EquitySnapshotNode are GREYED
// honestly (hasData:false / hasPnl:false), never rendered as a $0 day.
// ─────────────────────────────────────────────────────────────

// Parse 'YYYY-MM-DD' as a LOCAL date (new Date('YYYY-MM-DD') is UTC-midnight and
// shifts a day back in negative-offset timezones). Mirrors PCApp.ymdLocal.
export function ymd(d) {
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, dd || 1);
}
export function isoDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function addDays(dateObj, n) {
  const d = new Date(dateObj);
  d.setDate(d.getDate() + n);
  return d;
}

// Sorted per-day rows from the equity series. The first row has no prior to diff
// against (hasPnl:false) — it's the baseline, shown neutral/greyed, not as $0.
export function buildDailySeries(series) {
  if (!Array.isArray(series) || series.length === 0) return [];
  const sorted = [...series]
    .filter((p) => p && p.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    const date = String(sorted[i].date).slice(0, 10);
    const equity = Number(sorted[i].equity);
    const prev = i > 0 ? Number(sorted[i - 1].equity) : null;
    const hasPrior = i > 0 && Number.isFinite(prev) && prev > 0 && Number.isFinite(equity);
    out.push({
      date,
      equity: Number.isFinite(equity) ? equity : null,
      pnl: hasPrior ? equity - prev : null,
      pct: hasPrior ? (equity / prev - 1) * 100 : null,
      hasData: Number.isFinite(equity), // a snapshot exists for this day
      hasPnl: hasPrior,                 // has a prior day to measure a return
    });
  }
  return out;
}

export function dailyMap(daily) {
  const m = new Map();
  for (const d of daily) m.set(d.date, d);
  return m;
}

export function maxAbsPnl(daily) {
  let mx = 0;
  for (const d of daily) {
    if (d.hasPnl && Number.isFinite(d.pnl)) mx = Math.max(mx, Math.abs(d.pnl));
  }
  return mx;
}

// Sign+magnitude fill. Positive → --green, negative → --red, scaled by |pnl| vs
// the window max so a flat-ish day is faint and a big day is saturated. No-data
// days return 'transparent' (the cell's greyed border carries the empty state).
export function pnlColor(pnl, maxAbs) {
  if (pnl == null || !Number.isFinite(pnl) || maxAbs <= 0) return 'transparent';
  const intensity = Math.min(1, Math.abs(pnl) / maxAbs);
  const alpha = (0.18 + intensity * 0.77).toFixed(3); // 0.18 .. 0.95
  return pnl >= 0 ? `rgba(0,230,118,${alpha})` : `rgba(255,61,87,${alpha})`;
}

// GitHub-style contribution grid as explicit WEEK COLUMNS (X = weeks, Y = the 7
// weekdays Sun→Sat), Sunday-anchored, spanning the Sunday on/before the first day
// to the Saturday on/after the last. Each column carries a `monthStart` flag +
// short `monthLabel` for the month-label row, set when the column's week opens a
// new calendar month. Fixed-size cells render one column = one week; no flex-fill.
export function heatmapColumns(daily, map) {
  if (!daily.length) return { columns: [], weeks: 0 };
  const first = ymd(daily[0].date);
  const last = ymd(daily[daily.length - 1].date);
  const start = addDays(first, -first.getDay());     // back to Sunday
  const end = addDays(last, 6 - last.getDay());       // forward to Saturday
  const columns = [];
  let cursor = new Date(start);
  let prevMonth = null;
  while (cursor <= end) {
    const weekTop = new Date(cursor);
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const ds = isoDate(cursor);
      const cell = map.get(ds) || null;
      cells.push({
        date: ds,
        weekday: cursor.getDay(),
        inRange: cursor >= first && cursor <= last,
        hasData: !!cell && cell.hasData,
        hasPnl: !!cell && cell.hasPnl,
        pnl: cell ? cell.pnl : null,
        pct: cell ? cell.pct : null,
      });
      cursor = addDays(cursor, 1);
    }
    const month = weekTop.getMonth();
    const monthStart = month !== prevMonth;
    columns.push({
      key: isoDate(weekTop),
      monthStart,
      monthLabel: monthStart ? weekTop.toLocaleDateString('en-US', { month: 'short' }) : '',
      cells,
    });
    prevMonth = month;
  }
  return { columns, weeks: columns.length };
}

// Distinct 'YYYY-MM' buckets that contain at least one snapshot day (ascending).
export function monthsWithData(daily) {
  const set = new Set();
  for (const d of daily) if (d.hasData) set.add(d.date.slice(0, 7));
  return Array.from(set).sort();
}

// Sun→Sat week rows for a month grid; trailing all-out-of-month weeks trimmed.
export function monthMatrix(year, monthIdx, map) {
  const firstOfMonth = new Date(year, monthIdx, 1);
  const gridStart = addDays(firstOfMonth, -firstOfMonth.getDay());
  const weeks = [];
  let cursor = new Date(gridStart);
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let i = 0; i < 7; i++) {
      const ds = isoDate(cursor);
      const cell = map.get(ds) || null;
      row.push({
        date: ds,
        day: cursor.getDate(),
        inMonth: cursor.getMonth() === monthIdx,
        hasData: !!cell && cell.hasData,
        hasPnl: !!cell && cell.hasPnl,
        pnl: cell ? cell.pnl : null,
        pct: cell ? cell.pct : null,
      });
      cursor = addDays(cursor, 1);
    }
    weeks.push(row);
  }
  while (weeks.length && weeks[weeks.length - 1].every((c) => !c.inMonth)) weeks.pop();
  return weeks;
}

// Σ pnl + up/down day counts over the populated (hasPnl) days of one month grid.
export function monthTotals(weeks) {
  let pnl = 0;
  let up = 0;
  let down = 0;
  let days = 0;
  for (const row of weeks) {
    for (const c of row) {
      if (c.inMonth && c.hasPnl && Number.isFinite(c.pnl)) {
        pnl += c.pnl;
        days += 1;
        if (c.pnl > 0) up += 1;
        else if (c.pnl < 0) down += 1;
      }
    }
  }
  return { pnl, up, down, days };
}

export function fmtUsd(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return (v < 0 ? '-$' : '+$') + Math.abs(v).toFixed(2);
}
export function fmtPct(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}
export function monthLabel(ym) {
  if (!ym) return '—';
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
