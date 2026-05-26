// ─────────────────────────────────────────────────────────────
// Drift hooks.
//
// `useAccountDrift` was removed in the 2026-05-26 drift-scope-fix dispatch.
// Reason: wobbling aggregate equity by ±$6 per tick was overshadowing real
// realized P&L on small-total-return days, flipping Current Value / Total
// Return / Today P&L between green and red even when the underlying engine
// state was unchanged. Aggregate equity isn't a "live market feel" surface —
// it's a derived from-graph value. Static between polls is honest.
//
// `usePositionDrift` is RETAINED, scoped to OPEN trades only (filtered by
// caller via `openTrades = trades.filter(t => t.status === 'OPEN')` before
// being passed to this hook). The Current price column on an OPEN row IS a
// genuine real-time fluctuation between polls — the underlying asset price
// moves second-to-second — so a cosmetic ±$4 wobble is honest representation.
// CLOSED rows show exit_price (locked) and realized P&L — no drift.
//
// Per-poll re-anchor:
// - offset state resets to zero on each `pollTimestamp` change (fresh ISO
//   per cycle from useNeo4jPoll.pollOnce, even when polled values are
//   byte-identical), so drift wobbles bounded within a single 60s window
//   and snaps back to the polled-baseline current price on each tick.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';

export function usePositionDrift(positions, { pollTimestamp, enabled = true } = {}) {
  const [offsets, setOffsets] = useState(() => positions.map(() => 0));

  // RE-ANCHOR on poll tick OR on position-count change.
  useEffect(() => {
    setOffsets(positions.map(() => 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollTimestamp, positions.length]);

  useEffect(() => {
    if (!enabled || positions.length === 0) return;
    const id = setInterval(() => {
      setOffsets((cur) => cur.map((o) => o + (Math.random() - 0.45) * 4));
    }, 3000);
    return () => clearInterval(id);
  }, [enabled, positions.length]);

  return offsets;
}

// Ticker price wobble — sampled tick counter; consumer derives a bounded
// ±0.1% wobble per item; no accumulation.
export function useTickerWobble(items, { enabled = true } = {}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), 3500);
    return () => clearInterval(id);
  }, [enabled]);
  return tick;
}
