// ─────────────────────────────────────────────────────────────
// useRowFitCap — Portal Rev 32 (2026-06-05).
// Runtime-computed panel row cap. Measures the REAL rendered row/card height
// against the available area and returns how many fit with no overflow and no
// dead space (replaces the hard-coded cap guess). Falls back to `fallback`
// until a row exists to measure (first paint / zero-trade state) so the panel
// never over-renders before the measurement resolves.
//
//   cap = Math.max(1, Math.floor((available − head) / rowHeight))
//
//   basis 'element'  — PC fixed-height panel: `available` = the measured
//                      container's clientHeight (the flex:1 table), minus the
//                      sticky <thead> height.
//   basis 'viewport' — mobile free-scroll column (no fixed clip): `available`
//                      = visual viewport height − `reserve` (header + tab bar +
//                      panel title chrome), i.e. cards that fit one screen.
//
// Re-measures on mount (after paint), on a 150ms-debounced resize, via a
// ResizeObserver on the container, and whenever `signal` changes (pass the
// row count so it re-measures the instant rows first render).
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from 'react';

export function useRowFitCap({
  fallback,
  basis = 'element',
  rowSelector,
  headSelector = null,
  reserve = 0,
  signal = 0,
}) {
  const ref = useRef(null);
  const [cap, setCap] = useState(fallback);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const row = el.querySelector(rowSelector);
    if (!row) return; // nothing to measure yet → keep the fallback
    const rowH = row.offsetHeight;
    if (!rowH) return;
    let avail;
    if (basis === 'viewport') {
      const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight || 0;
      avail = vh - reserve;
    } else {
      const headH = headSelector
        ? ((el.querySelector(headSelector) && el.querySelector(headSelector).offsetHeight) || 0)
        : 0;
      avail = el.clientHeight - headH;
    }
    const next = Math.max(1, Math.floor(avail / rowH));
    setCap((prev) => (prev === next ? prev : next));
  }, [basis, rowSelector, headSelector, reserve]);

  useEffect(() => {
    measure();
    let t = null;
    const debounced = () => { clearTimeout(t); t = setTimeout(measure, 150); };
    window.addEventListener('resize', debounced);
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && ref.current) {
      ro = new ResizeObserver(debounced);
      ro.observe(ref.current);
    }
    return () => {
      window.removeEventListener('resize', debounced);
      if (ro) ro.disconnect();
      clearTimeout(t);
    };
  }, [measure, signal]);

  return [ref, cap];
}
