// Cosmetic drift hooks per Portal Spec Layer 2 / reconciliation Q1 default.
// Step E live behavior: account bar ticks ±$6 every 2,500ms; open position
// P&L ticks ±$4 every 3,000ms. Both freeze when mode === 'live' (bootstrap).
import { useEffect, useState } from 'react';

export function useAccountDrift({ initialValue, initialPnl, enabled = true }) {
  const [av, setAv] = useState(initialValue);
  const [ap, setAp] = useState(initialPnl);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      const d = (Math.random() - 0.45) * 6;
      setAv((v) => v + d);
      setAp((p) => p + d);
    }, 2500);
    return () => clearInterval(id);
  }, [enabled]);
  return { av, ap };
}

export function usePositionDrift(positions, { enabled = true } = {}) {
  const [offsets, setOffsets] = useState(() => positions.map(() => 0));
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      setOffsets((cur) => cur.map((o) => o + (Math.random() - 0.45) * 4));
    }, 3000);
    return () => clearInterval(id);
  }, [enabled, positions.length]);
  return offsets;
}

// Ticker price wobble ±0.1% every 3,500ms (cosmetic per Portal Spec).
export function useTickerWobble(items, { enabled = true } = {}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), 3500);
    return () => clearInterval(id);
  }, [enabled]);
  return tick; // consumer derives wobble from the tick count + item index
}
