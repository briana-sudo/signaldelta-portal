// Open-leg since-entry P&L — real compute from current/entry/size/dir, no drift.
import { describe, it, expect } from 'vitest';
import { computeOpenLegPnl, computeOpenProgress } from './openPnl.js';

describe('computeOpenLegPnl — real since-entry, per leg, no drift', () => {
  it('long down from entry → negative pnl, RED sign (Item 93 sign fix)', () => {
    // META leg: entry 594.125, live 588.21, size 8.282871008, long.
    const r = computeOpenLegPnl({ currentPx: 588.21, entryPx: 594.125, size: 8.282871008, direction: 'Long', target: 604.84 });
    expect(r.pp).toBeCloseTo(((588.21 - 594.125) / 594.125) * 100, 6); // ≈ -0.996%
    expect(r.pv).toBeCloseTo((588.21 - 594.125) * 8.282871008, 6);     // ≈ -$48.99
    expect(r.pp).toBeLessThan(0);
    expect(r.pos).toBe(false);   // → RED, not green-from-noise
  });

  it('long up from entry → positive pnl, green', () => {
    const r = computeOpenLegPnl({ currentPx: 210, entryPx: 200, size: 5, direction: 'Long', target: 220 });
    expect(r.pp).toBeCloseTo(5, 6);    // +5%
    expect(r.pv).toBeCloseTo(50, 6);   // +$50
    expect(r.pos).toBe(true);
  });

  it('short down from entry → positive pnl (dir flips sign)', () => {
    const r = computeOpenLegPnl({ currentPx: 90, entryPx: 100, size: 10, direction: 'Short', target: 80 });
    expect(r.pp).toBeCloseTo(10, 6);   // (90-100)/100*100*-1 = +10%
    expect(r.pv).toBeCloseTo(100, 6);  // (90-100)*10*-1 = +$100
    expect(r.pos).toBe(true);
  });

  it('stable: same inputs twice → identical (no random walk)', () => {
    const args = { currentPx: 588.21, entryPx: 594.125, size: 8.28, direction: 'Long', target: 604.84 };
    const a = computeOpenLegPnl(args);
    const b = computeOpenLegPnl(args);
    expect(a.pp).toBe(b.pp);
    expect(a.pv).toBe(b.pv);
  });

  it('no live price / bad entry → zeroed, not NaN', () => {
    expect(computeOpenLegPnl({ currentPx: null, entryPx: 100, size: 5, direction: 'Long' }))
      .toMatchObject({ pp: 0, pv: 0, hasPnl: false });
    expect(computeOpenLegPnl({ currentPx: 100, entryPx: 0, size: 5, direction: 'Long' }))
      .toMatchObject({ pp: 0, pv: 0, hasPnl: false });
  });
});

describe('computeOpenProgress — % to stop uses live current_stop + BE guard', () => {
  const base = { entry: 100, target: 110, livePriced: true, direction: 'Long' };

  it('no live price → grey NO LIVE PRICE, no number', () => {
    const r = computeOpenProgress({ ...base, cur: 98, livePriced: false });
    expect(r.mode).toBe('nolive');
    expect(r.label).toBe('NO LIVE PRICE');
  });

  it('winning long → % TO TARGET (target branch, stop irrelevant)', () => {
    const r = computeOpenProgress({ ...base, cur: 105, currentStop: 99, stop: 95 });
    expect(r.mode).toBe('target');
    expect(r.progPct).toBeCloseTo(50, 6);   // (105-100)/(110-100)
    expect(r.label).toBe('50% TO TARGET');
  });

  it('regression: current_stop == stop_loss_price → unchanged % TO STOP', () => {
    // META-like: cur 586.98, entry 594.125, both stops 586.8949 → ~99%.
    const r = computeOpenProgress({ entry: 594.125, target: 604.84, livePriced: true, direction: 'Long', cur: 586.98, currentStop: 586.8949, stop: 586.8949 });
    expect(r.mode).toBe('stop');
    expect(Math.round(r.progPct)).toBe(99);
  });

  it('live-stop path: tracks current_stop, not the entry stop_loss_price', () => {
    const withLive = computeOpenProgress({ ...base, cur: 98, currentStop: 97, stop: 95 });
    const withEntryStopOnly = computeOpenProgress({ ...base, cur: 98, currentStop: null, stop: 95 });
    expect(withEntryStopOnly.progPct).toBeCloseTo((100 - 98) / (100 - 95) * 100, 6); // 40% (entry stop)
    expect(withLive.progPct).toBeCloseTo((100 - 98) / (100 - 97) * 100, 6);          // 66.7% (live stop)
    expect(withLive.progPct).toBeGreaterThan(withEntryStopOnly.progPct);             // tightened → higher
  });

  it('BE guard (long): current_stop >= entry in losing branch → BE badge, no number, no NaN', () => {
    const r = computeOpenProgress({ ...base, cur: 98, currentStop: 100, stop: 95 });
    expect(r.mode).toBe('be');
    expect(r.label).toBe('BE');
    expect(Number.isFinite(r.progPct)).toBe(true);
    expect(r.progPct).toBe(0);
    // past entry too
    expect(computeOpenProgress({ ...base, cur: 98, currentStop: 101, stop: 95 }).mode).toBe('be');
  });

  it('BE guard (short mirror): current_stop <= entry in losing branch → BE', () => {
    // short losing = price up; live stop normally above entry. Stop ratcheted to entry.
    const r = computeOpenProgress({ entry: 100, target: 90, livePriced: true, direction: 'Short', cur: 102, currentStop: 100, stop: 105 });
    expect(r.mode).toBe('be');
  });

  it('short losing, valid live stop → % TO STOP (sign-correct)', () => {
    const r = computeOpenProgress({ entry: 100, target: 90, livePriced: true, direction: 'Short', cur: 103, currentStop: 106, stop: 108 });
    expect(r.mode).toBe('stop');
    expect(r.progPct).toBeCloseTo((103 - 100) / (106 - 100) * 100, 6); // 50%
  });
});
