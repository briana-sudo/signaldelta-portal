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
