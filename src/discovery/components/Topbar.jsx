// Phase 3d-iii-b — topbar: logo mark + SIGNAL/DELTA wordmark + view tabs + the
// ENGINE POWER SWITCH (the old "Engine running ●" pulse is now a real control).
//   green pulse = running (click → confirm → stop)
//   grey dot    = stopped (click → start)
//   amber       = starting / stopping (in transition, not clickable)
//   grey "run setup" = not-installed (run Setup Discovery.bat once)
// Wired to /sm/engine/* — the button controls the SERVICE, not research; the
// engine's gates still gate.
import logoMark from '../assets/logo-mark.svg';

const TABS = ['Coverage', 'Board', 'Data needs'];

const LABEL = {
  running: 'Engine running', stopped: 'Engine stopped',
  starting: 'Starting…', stopping: 'Stopping…', 'not-installed': 'Engine — run setup once',
  unknown: 'Engine — unknown',
};

export default function Topbar({ tab, setTab, cellsMapped, engineStatus, onStart, onStop }) {
  const st = engineStatus || 'unknown';
  const clickable = st === 'running' || st === 'stopped';

  function toggle() {
    if (st === 'stopped') onStart();
    else if (st === 'running') { if (window.confirm('Stop the engine? Research pauses until you start it again.')) onStop(); }
  }

  return (
    <div className="topbar">
      <div className="brand">
        <img src={logoMark} alt="SignalDelta" />
        <div className="wordmark"><span className="s">SIGNAL</span><span className="d">DELTA</span><span className="sub">Discovery</span></div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t}
                  className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <div className="spacer" />
      <button type="button" className={`engine-switch st-${st}`} onClick={toggle}
              disabled={!clickable} aria-label={`${LABEL[st]} — ${st === 'running' ? 'click to stop' : st === 'stopped' ? 'click to start' : ''}`}
              title={st === 'running' ? 'Click to stop' : st === 'stopped' ? 'Click to start' : LABEL[st]}>
        <span className={`pulse st-${st}`} />{LABEL[st]}
        {st === 'running' && <> · <span className="mono" style={{ color: 'var(--fg-1)' }}>{cellsMapped.toLocaleString()}</span>&nbsp;cells mapped</>}
      </button>
    </div>
  );
}
