// Open-leg since-entry P&L — real compute from current/entry/size/dir, no drift.
import { describe, it, expect } from 'vitest';
import { computeOpenLegPnl } from './openPnl.js';

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
