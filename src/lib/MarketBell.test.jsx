// MarketBell — edge-triggered open/close bell. Mounts the real component and
// mocks window.HTMLMediaElement.prototype.play (the Audio play path), asserting
// the bell rings ONCE per market-state edge and never on load / same-state poll.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import MarketBell from './MarketBell.jsx';

let playSpy;
beforeEach(() => {
  playSpy = vi
    .spyOn(window.HTMLMediaElement.prototype, 'play')
    .mockImplementation(() => Promise.resolve());
  // currentTime setter is a no-op in jsdom; guard not needed but harmless.
});
afterEach(() => { cleanup(); playSpy.mockRestore(); });

describe('MarketBell — edge-triggered bell', () => {
  it('rings only on open<->closed edges, never on load or same-state', () => {
    // 1. Mount with a fixed state -> NO bell on load (prev primes silently).
    const { rerender } = render(<MarketBell marketState="OPEN" />);
    expect(playSpy).toHaveBeenCalledTimes(0);

    // 2. Re-render SAME state -> NO bell (same-state poll).
    rerender(<MarketBell marketState="OPEN" />);
    expect(playSpy).toHaveBeenCalledTimes(0);

    // 3. Flip OPEN -> CLOSED -> bell exactly ONCE.
    rerender(<MarketBell marketState="CLOSED" />);
    expect(playSpy).toHaveBeenCalledTimes(1);

    // 4. Flip back CLOSED -> OPEN -> bell once more (total 2).
    rerender(<MarketBell marketState="OPEN" />);
    expect(playSpy).toHaveBeenCalledTimes(2);
  });

  it('does not ring on LOADING->definitive (indeterminate never primes an edge)', () => {
    const { rerender } = render(<MarketBell marketState="LOADING" />);
    expect(playSpy).toHaveBeenCalledTimes(0);
    // LOADING -> CLOSED is the FIRST definitive observation -> primes, no bell.
    rerender(<MarketBell marketState="CLOSED" />);
    expect(playSpy).toHaveBeenCalledTimes(0);
    // CLOSED -> OPEN is now a real edge -> ring once.
    rerender(<MarketBell marketState="OPEN" />);
    expect(playSpy).toHaveBeenCalledTimes(1);
  });
});
