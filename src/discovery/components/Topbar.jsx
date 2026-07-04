// Phase 3d-iii-b — topbar: logo mark + SIGNAL/DELTA wordmark + view tabs + two
// power switches:
//   ENGINE  (/sm/engine/*)  — green running (click→confirm→stop), grey stopped
//                             (click→start), amber in transition.
//   PROXY   (/sm/proxy/*)   — green proxy live (click→confirm→RESTART), amber
//                             restarting, grey stopped/unknown. Restart is what's
//                             needed after a deploy so /sm/readmodel serves live
//                             7688 data — clickable, no terminal.
// Both control the SERVICE only; the research firewall is unchanged.
import logoMark from '../assets/logo-mark.svg';

const TABS = ['Coverage', 'Board', 'Timeline', 'Data needs'];

const LABEL = {
  running: 'Engine running', stopped: 'Engine stopped',
  starting: 'Starting…', stopping: 'Stopping…', 'not-installed': 'Engine — run setup once',
  unknown: 'Engine — unknown',
};

const PLABEL = {
  running: 'Proxy live', restarting: 'Restarting…', starting: 'Restarting…', stopping: 'Restarting…',
  stopped: 'Proxy stopped', 'not-installed': 'Proxy — not installed',
  unreachable: 'Proxy — unreachable', unknown: 'Proxy — unknown',
};

export default function Topbar({ tab, setTab, cellsMapped, engineStatus, onStart, onStop,
                                proxyStatus, onProxyRestart }) {
  const st = engineStatus || 'unknown';
  const clickable = st === 'running' || st === 'stopped';

  function toggle() {
    if (st === 'stopped') onStart();
    else if (st === 'running') { if (window.confirm('Stop the engine? Research pauses until you start it again.')) onStop(); }
  }

  const ps = proxyStatus || 'unknown';
  const pRestarting = ps === 'restarting' || ps === 'starting' || ps === 'stopping';
  const pClass = pRestarting ? 'restarting' : ps;      // amber while cycling

  function proxyToggle() {
    if (ps === 'running'
        && window.confirm('Restart the proxy? The console disconnects for a few seconds while the service cycles, then reconnects with live 7688 data.')) {
      onProxyRestart();
    }
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
      <button type="button" className={`proxy-switch st-${pClass}`} onClick={proxyToggle}
              disabled={ps !== 'running'}
              aria-label={`${PLABEL[ps] || PLABEL.unknown}${ps === 'running' ? ' — click to restart' : ''}`}
              title={ps === 'running' ? 'Click to restart the proxy' : PLABEL[ps] || PLABEL.unknown}>
        <span className={`pulse st-${pClass}`} />{PLABEL[ps] || PLABEL.unknown}
        {ps === 'running' && <span className="sw-act"> · restart</span>}
      </button>
      <button type="button" className={`engine-switch st-${st}`} onClick={toggle}
              disabled={!clickable} aria-label={`${LABEL[st]} — ${st === 'running' ? 'click to stop' : st === 'stopped' ? 'click to start' : ''}`}
              title={st === 'running' ? 'Click to stop' : st === 'stopped' ? 'Click to start' : LABEL[st]}>
        <span className={`pulse st-${st}`} />{LABEL[st]}
        {st === 'running' && <> · <span className="mono" style={{ color: 'var(--fg-1)' }}>{cellsMapped.toLocaleString()}</span>&nbsp;cells mapped</>}
      </button>
    </div>
  );
}
