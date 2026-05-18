// Event feed hook — seeds with SEED_EVENTS, optionally generates random
// events on an interval per the locked baseline pattern, and exposes
// pushEvent() so the trade overlay demo (Step G) can prepend trade events.
import { useCallback, useEffect, useRef, useState } from 'react';
import { SEED_EVENTS } from './placeholders.js';

const ASSETS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'NVDA', 'AAPL', 'SPY', 'AVAX/USD'];
const SECTIONS = ['A', 'B', 'C'];

function nowHHMM() {
  const n = new Date();
  return [n.getHours(), n.getMinutes()].map((v) => String(v).padStart(2, '0')).join(':');
}

function randomEvent() {
  const r = Math.random();
  const a = ASSETS[Math.floor(Math.random() * ASSETS.length)];
  if (r < 0.25) {
    return { cls: 'signal', icon: '◈', text: `RSI DIVERGENCE · ${a} · composite ${Math.floor(Math.random() * 30) + 50}`, val: null, valcls: '', t: nowHHMM() };
  }
  if (r < 0.40) {
    return { cls: 'sync', icon: '◉', text: `DATA SYNC · ${247 + Math.floor(Math.random() * 3)} trades · graph reconciled`, val: null, valcls: '', t: nowHHMM() };
  }
  if (r < 0.50) {
    const v = (Math.random() * 4 + 0.5).toFixed(1);
    return { cls: 'close-win', icon: '✓', text: `TRADE CLOSED · ${a} · target hit`, val: `+${v}%`, valcls: 'g', t: nowHHMM() };
  }
  if (r < 0.58) {
    return { cls: 'signal', icon: '◈', text: `COMPOSITE THRESHOLD HIT · ${a} · ${Math.floor(Math.random() * 15) + 72}`, val: null, valcls: '', t: nowHHMM() };
  }
  if (r < 0.65) {
    const sec = SECTIONS[Math.floor(Math.random() * SECTIONS.length)];
    return { cls: 'rule', icon: '§', text: `RULE WRITTEN · Section ${sec} · cohort threshold update`, val: null, valcls: '', t: nowHHMM() };
  }
  return null;
}

export function useEventFeed({ randomIntervalMs = 8000, cap = 12, enabled = true } = {}) {
  const [events, setEvents] = useState(() => SEED_EVENTS.slice(0, cap));
  const capRef = useRef(cap);
  capRef.current = cap;

  const pushEvent = useCallback((ev) => {
    setEvents((cur) => {
      const next = [ev, ...cur];
      return next.slice(0, capRef.current);
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      const ev = randomEvent();
      if (ev) pushEvent(ev);
    }, randomIntervalMs);
    return () => clearInterval(id);
  }, [enabled, randomIntervalMs, pushEvent]);

  // poll-tick event (called by the parent on the 60s rollover)
  const pushSyncEvent = useCallback(() => {
    pushEvent({
      cls: 'sync', icon: '◉',
      text: `DATA SYNC · ${247 + Math.floor(Math.random() * 4)} trades · positions synced`,
      val: null, valcls: '', t: nowHHMM(),
    });
  }, [pushEvent]);

  return { events, pushEvent, pushSyncEvent };
}
