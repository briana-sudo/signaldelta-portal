// THE shared action-button lifecycle (portal-wide standard). One component, one rule:
//   idle → firing (disabled + spinner, IMMEDIATE on click) → the parent's next render
//   reflects the new state (the button is replaced/relabelled) → or error (re-enabled +
//   visible reason). A button NEVER returns silently to idle after a successful action,
//   and is NEVER idle-pressable while its action is in flight.
//
// The "reflected state" (Queued / Running… / Banked / Held / Priced ✓) is the PARENT's
// job — it re-renders with the new state, which replaces or greys this button. This
// component owns the two states the parent can't: the immediate firing lock (no
// double-fire, no dead-feeling press) and the error surface (re-enable + reason).
import { useState } from 'react';

export default function ActionButton({
  onAct, children, className = 'b b-pri',
  busyLabel = 'Working…', doneLabel, done = false,
  disabled = false, title, confirm,
}) {
  const [firing, setFiring] = useState(false);
  const [err, setErr] = useState(null);

  async function click() {
    if (firing || disabled || done) return;             // never re-fire while in flight / already done
    if (confirm && !window.confirm(confirm)) return;
    setErr(null);
    setFiring(true);                                    // IMMEDIATE lock — the press always registers
    try {
      await onAct();
    } catch (e) {
      setErr((e && e.message) ? e.message : 'action failed');   // error → re-enabled + reason
    } finally {
      setFiring(false);
    }
  }

  // reflected DONE state: greyed, relabelled, unclickable (parent may also just stop
  // rendering the button — either is compliant)
  if (done && doneLabel) {
    return <button type="button" className={`${className} is-done`} disabled title={title}>{doneLabel}</button>;
  }

  return (
    <span className="act-wrap">
      <button type="button" className={className} disabled={firing || disabled}
              aria-busy={firing} onClick={click} title={title}>
        {firing ? <><span className="btn-spin" aria-hidden="true" />{busyLabel}</> : children}
      </button>
      {err && <span className="act-err" role="alert" title={err}>⚠ {err}</span>}
    </span>
  );
}
