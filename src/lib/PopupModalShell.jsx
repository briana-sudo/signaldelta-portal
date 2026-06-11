// ─────────────────────────────────────────────────────────────
// PopupModalShell — shared overlay shell for the Strand-4 heatmap /
// returns-calendar popups (2026-06-10). PC desktop.
//
// Renders through a document.body portal inside a `.pc-shell` wrapper so the
// PC-scoped `.overlay` / `.ov-card` skin applies AND the fixed overlay escapes
// any ancestor stacking context to sit cleanly above the dashboard. (The
// existing ModalPortal.jsx wraps in `.mobile-shell`, the wrong CSS scope for a
// PC modal — hence this PC-scoped sibling.)
//
// Provides the modal basics the dispatch asked for: scrim-click + Esc dismiss,
// initial focus into the card, a basic focus-trap (Tab/Shift-Tab cycles within
// the card), and role="dialog" / aria-modal. Inner clicks stopPropagation so a
// click inside the card never dismisses it.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = 'button, [href], select, input, [tabindex]:not([tabindex="-1"])';

export default function PopupModalShell({ open, onClose, labelledBy, cardClass = '', children }) {
  const cardRef = useRef(null);
  const restoreFocus = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    restoreFocus.current = document.activeElement;
    const card = cardRef.current;
    const list = () => (card ? Array.from(card.querySelectorAll(FOCUSABLE)) : []);
    // Initial focus → first focusable control (or the card itself).
    (list()[0] || card)?.focus?.();

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab' || !card) return;
      const f = list();
      if (f.length === 0) { e.preventDefault(); card.focus(); return; }
      const idx = f.indexOf(document.activeElement);
      if (e.shiftKey && idx <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && idx === f.length - 1) { e.preventDefault(); f[0].focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      restoreFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="pc-shell sd-popup-portal">
      <div className="overlay show" onClick={onClose}>
        <div
          ref={cardRef}
          className={'ov-card ' + cardClass}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
