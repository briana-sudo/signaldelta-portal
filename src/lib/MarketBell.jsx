// Portal 2026-06-08 — NYSE-style market open/close bell.
//
// Plays a short bell ONCE when the US equity market state flips open<->closed
// while the portal is open. Edge-triggered, never on load/refresh, never on a
// repeated same-state poll. Consumes the EXISTING lifted market-state (prop) —
// no second clock, no new poll, no independent open/closed logic.
//
// `marketState` is the raw useMarketStatus().state (OPEN/CLOSED/HOLIDAY/
// LOADING/FALLBACK), normalized here to OPEN | CLOSED | null(indeterminate).
// LOADING is indeterminate -> never an edge, never primes prev. Mute state is
// REACT STATE ONLY (no localStorage/sessionStorage).
import { useEffect, useRef, useState } from 'react';

function normalize(state) {
  if (state === 'OPEN') return 'OPEN';
  if (state === 'CLOSED' || state === 'HOLIDAY' || state === 'FALLBACK') return 'CLOSED';
  return null; // LOADING / unknown — indeterminate
}

export default function MarketBell({ marketState }) {
  const [muted, setMuted] = useState(false);
  const audioRef = useRef(null);
  const prevRef = useRef(null);     // previous definitive state (null until first observed)
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  // Lazy single Audio element (self-hosted clip; no external dependency).
  // BASE_URL respects the Pages sub-path ('/signaldelta-portal/' in prod, '/'
  // in dev/test) — a root-absolute '/sounds/...' would 404 under the sub-path.
  if (audioRef.current == null && typeof Audio !== 'undefined') {
    audioRef.current = new Audio(`${import.meta.env.BASE_URL}sounds/market-bell.mp3`);
  }

  const cur = normalize(marketState);

  useEffect(() => {
    if (cur == null) return;                 // indeterminate — don't prime or ring
    const prev = prevRef.current;
    // Edge only: prev seen AND changed. First observation primes prev (no bell).
    if (prev != null && prev !== cur && !mutedRef.current) {
      const a = audioRef.current;
      if (a) {
        try { a.currentTime = 0; } catch { /* not seekable in some mocks */ }
        // Autoplay guard: browsers may suppress before a user gesture. Swallow.
        Promise.resolve(a.play?.()).catch(() => {});
      }
    }
    prevRef.current = cur;
  }, [cur]);

  return (
    <button
      type="button"
      className={'market-bell-toggle' + (muted ? ' muted' : '')}
      onClick={() => setMuted((m) => !m)}
      title={muted ? 'Market bell muted — click to unmute' : 'Market bell on — click to mute'}
      aria-label={muted ? 'Unmute market bell' : 'Mute market bell'}
    >
      {muted ? '🔇' : '🔔'}
    </button>
  );
}
