// ─────────────────────────────────────────────────────────────
// etDay — Portal Rev 42 (2026-06-04). Shared ET (America/New_York)
// calendar-day boundary helper. Single source for the DAY W/L (ET) banner
// stat (Feature 1) and the ALL TRADES modal day buckets (Feature 2).
//
// NOTE: this ET-calendar boundary is deliberately NOT the TODAY P&L window
// (which keys off Alpaca's broker session close). The day stat/buckets are
// labelled "(ET)" to make that distinction explicit.
//
// No tz library: derive the ET offset for a given instant via Intl
// formatToParts, then construct the UTC instant of ET-midnight. DST shifts
// at 02:00, never at midnight, so midnight construction is unambiguous.
// ─────────────────────────────────────────────────────────────

const TZ = 'America/New_York';

const _dtf = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function _parts(date) {
  const p = {};
  for (const part of _dtf.formatToParts(date)) p[part.type] = part.value;
  return p; // {year,month,day,hour,minute,second}
}

// Offset (ms) such that: ET-wall-clock-as-if-UTC = utcInstant + offset.
function _etOffsetMs(date) {
  const p = _parts(date);
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - date.getTime();
}

// 'YYYY-MM-DD' ET calendar date for an instant.
function _etDateStr(date) {
  const p = _parts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

// UTC instant (ms) of ET-midnight for an ET calendar date 'YYYY-MM-DD'.
function _etMidnightMs(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, 0, 0);          // midnight treated as UTC
  const off = _etOffsetMs(new Date(wall));               // ET offset near that instant
  return wall - off;                                      // true UTC instant of ET-midnight
}

/**
 * For offset N (0 = today, 1 = yesterday … 5 = five ET-days ago) return the
 * { day_start, day_end } ISO-8601 UTC instants bounding that single ET day
 * [ET-midnight(dayN), ET-midnight(dayN+1)).
 */
export function etDayRange(offsetDays) {
  const todayStr = _etDateStr(new Date());
  // Anchor at noon-ET of today (DST-safe), step back N whole days, re-derive the
  // ET calendar date — avoids the ≤1h DST drift a raw 24h*N subtraction risks.
  const noonToday = _etMidnightMs(todayStr) + 12 * 3600 * 1000;
  const targetStr = _etDateStr(new Date(noonToday - offsetDays * 86400000));
  const startMs = _etMidnightMs(targetStr);
  // +26h always lands inside the next ET day (even on 25h fall-back days) → its date.
  const nextStr = _etDateStr(new Date(startMs + 26 * 3600 * 1000));
  const endMs = _etMidnightMs(nextStr);
  return {
    day_start: new Date(startMs).toISOString(),
    day_end: new Date(endMs).toISOString(),
  };
}
