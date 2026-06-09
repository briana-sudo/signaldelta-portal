// Mobile modal portal — 2026-06-08. Renders children at document.body so a
// fixed full-viewport overlay escapes any ancestor stacking context and sits
// ABOVE the sticky mobile header (z-index 10000). The `mobile-shell` wrapper
// preserves the `.mobile-shell …` CSS scope for the portal'd modal content; the
// `modal-portal` class is `display:contents` (no box, no layout, no click-trap),
// so the wrapper itself is inert and only the children's fixed overlays render.
//
// MOBILE-ONLY: PC modals do NOT use this (their render path is byte-unchanged).
import { createPortal } from 'react-dom';

export default function ModalPortal({ children }) {
  if (typeof document === 'undefined' || !children) return null;
  return createPortal(
    <div className="mobile-shell modal-portal">{children}</div>,
    document.body,
  );
}
