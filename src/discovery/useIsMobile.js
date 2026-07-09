// Viewport-width mobile detection — one breakpoint, no separate URL. The SAME link
// renders the mobile showcase lane below MOBILE_MAX and the untouched desktop console
// above it. matchMedia so it flips live on rotate/resize without a reload.
import { useEffect, useState } from 'react';

export const MOBILE_MAX = 640;   // px — phones (incl. iPhone Pro Max landscape-narrow)

function query() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(`(max-width: ${MOBILE_MAX}px)`).matches;
}

export function useIsMobile() {
  const [mobile, setMobile] = useState(query);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
    const on = () => setMobile(mq.matches);
    on();
    // addEventListener('change') is the modern API; addListener the Safari<14 fallback
    if (mq.addEventListener) mq.addEventListener('change', on);
    else mq.addListener(on);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else mq.removeListener(on); };
  }, []);
  return mobile;
}

// READ-ONLY GUARD — on mobile the console is view-only (show-and-tell in company, on a
// touch screen). Every STATE-CHANGING method is neutralized to a no-op that fires ZERO
// network calls and reports 'actions are desktop-only'; reads (query/analyst/lessons/
// exports/status polls) pass straight through so the real console still demos live.
const BLOCKED = [
  'resolve', 'onboard', 'bankLesson', 'unbankLesson', 'rejectLesson', 'proposeLesson',
  'reevaluate', 'cancel', 'research', 'engineStart', 'engineStop', 'engineRestart',
  'proxyRestart', 'proxyUpdateRestart',
];

export function readOnlyContract(client, onBlocked) {
  const guarded = Object.create(client);   // inherit reads; override only the writes
  for (const name of BLOCKED) {
    if (typeof client[name] === 'function') {
      guarded[name] = async () => {
        if (onBlocked) onBlocked();
        return { rejected: true, desktop_only: true, reason: 'actions are desktop-only (view-only mode)' };
      };
    }
  }
  guarded.readOnly = true;
  return guarded;
}
