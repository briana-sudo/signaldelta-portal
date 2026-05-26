// ─────────────────────────────────────────────────────────────
// Cosmetic drift hooks — re-anchored on every poll cycle.
//
// Bug history (fixed in this revision per Brian's Change 1 dispatch):
//   The previous version reset its offset only when `initialValue` changed.
//   When the engine was quiet, `initialValue` stayed constant across polls,
//   the reset useEffect never fired, and drift accumulated indefinitely.
//   Over a 7-hour stretch with no engine activity the displayed equity drifted
//   from $9,994 to $13,240 — pure cosmetic accumulation.
//
// Fix: tie the reset to `pollTimestamp` (set fresh by useNeo4jPoll on every
// successful poll, even when query results are byte-identical). Within a 60s
// poll window the offset accumulates via the ±$6 random walk; on each poll
// the offset snaps back to 0 and the displayed value re-anchors to the
// freshly-polled true value.
//
// Returned values:
//   av = initialValue + offset.av    (drifts within the poll window)
//   ap = initialPnl   + offset.ap    (same)
// offset gets reset to {0, 0} on every pollTimestamp change.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';

export function useAccountDrift({ initialValue, initialPnl, pollTimestamp, enabled = true }) {
  const [offset, setOffset] = useState({ av: 0, ap: 0 });

  // RE-ANCHOR: reset offset on every successful poll. pollTimestamp is fresh
  // per cycle (ISO string from useNeo4jPoll.pollOnce) even when the polled
  // value itself is unchanged — so this fires regardless of engine activity.
  useEffect(() => {
    setOffset({ av: 0, ap: 0 });
  }, [pollTimestamp]);

  // Drift tick — accumulates within the current poll window only.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      const d = (Math.random() - 0.45) * 6;
      setOffset((o) => ({ av: o.av + d, ap: o.ap + d }));
    }, 2500);
    return () => clearInterval(id);
  }, [enabled]);

  return {
    av: (initialValue ?? 0) + offset.av,
    ap: (initialPnl ?? 0) + offset.ap,
  };
}

export function usePositionDrift(positions, { pollTimestamp, enabled = true } = {}) {
  const [offsets, setOffsets] = useState(() => positions.map(() => 0));

  // RE-ANCHOR on poll tick OR on position-count change (engine opened/closed
  // a position mid-session and the array shape changed).
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

// Ticker price wobble — unchanged. This hook samples a fresh tick counter
// and the consumer computes a bounded ±0.1% wobble per item; no accumulation.
export function useTickerWobble(items, { enabled = true } = {}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), 3500);
    return () => clearInterval(id);
  }, [enabled]);
  return tick;
}
