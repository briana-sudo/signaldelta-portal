// Real since-entry P&L for an OPEN trade leg — 2026-06-08 (Item 93).
//
// The engine writes pnl_dollar/pnl_percent = null on OPEN TradeNodes, so the
// portal MUST compute the live unrealized P&L itself, PER LEG (Alpaca nets
// multi-leg symbols into one blended avg_entry, so position-level plpc is wrong
// per leg). This replaces the prior cosmetic random-walk "drift" whose value AND
// green/red sign were noise.
//
//   pnl% = (currentPx − entryPx) / entryPx × 100 × dir
//   pnl$ = (currentPx − entryPx) × size × dir
//   dir  = +1 long / −1 short
//
// No drift, no time/random term — same inputs → same output (stable between
// polls when the price hasn't moved). Sign comes from this real P&L.
export function computeOpenLegPnl({ currentPx, entryPx, size, direction, target }) {
  const isShort =
    direction === 'Short' ||
    (target != null && entryPx != null && target < entryPx);
  const sign = isShort ? -1 : 1;
  const hasPnl =
    currentPx != null && Number.isFinite(currentPx) && entryPx > 0;
  const pp = hasPnl ? ((currentPx - entryPx) / entryPx) * 100 * sign : 0;
  const pv = hasPnl ? (currentPx - entryPx) * (size ?? 0) * sign : 0;
  return { pp, pv, pos: pp >= 0, hasPnl, isShort, sign };
}

// Open-row PROGRESS bar/label — 2026-06-08. Winning side fills toward TARGET;
// losing side fills toward the LIVE stop (`current_stop`, breakeven/trailing-
// adjusted) with fallback to the entry `stop_loss_price`. Direction-correct
// (sign +1 long / −1 short). Returns one of four modes:
//   'nolive' — no broker price (grey "NO LIVE PRICE", no fill)
//   'target' — winning, "% TO TARGET"
//   'be'     — losing but the live stop has ratcheted to/past entry (no downside
//              to stop left): "BE" locked badge, neutral color, NO number, no
//              divide (guards the stopDist<=0 NaN/Infinity).
//   'stop'   — losing, "% TO STOP" measured against the live stop.
export function computeOpenProgress({ cur, entry, target, currentStop, stop, direction, livePriced }) {
  const isShort = direction === 'Short' || (target != null && entry != null && target < entry);
  const sign = isShort ? -1 : 1;
  if (!livePriced || cur == null || entry == null) {
    return { mode: 'nolive', progPct: 0, label: 'NO LIVE PRICE', winning: false };
  }
  const signedMove = (cur - entry) * sign;        // >0 toward target, <0 toward stop
  const winning = signedMove >= 0;
  if (winning) {
    const targetRange = Math.abs((target ?? 0) - (entry ?? 0));
    const progPct = targetRange ? Math.min(100, (signedMove / targetRange) * 100) : 0;
    return { mode: 'target', progPct, label: `${progPct.toFixed(0)}% TO TARGET`, winning: true };
  }
  const liveStop = currentStop ?? stop;           // live stop, fallback entry stop
  const stopDist = (entry - liveStop) * sign;     // long: entry−stop; short: stop−entry; normally >0
  if (!(stopDist > 0)) {
    return { mode: 'be', progPct: 0, label: 'BE', winning: false };
  }
  const progPct = Math.min(100, (-signedMove / stopDist) * 100);
  return { mode: 'stop', progPct, label: `${progPct.toFixed(0)}% TO STOP`, winning: false };
}
