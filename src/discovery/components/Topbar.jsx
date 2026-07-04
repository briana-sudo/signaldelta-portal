// Phase 3d-iii-b — topbar: logo mark + SIGNAL/DELTA wordmark + view tabs + two
// power switches:
//   ENGINE  (/sm/engine/*)  — green running (click→confirm→stop), grey stopped
//                             (click→start), amber in transition.
//   PROXY   (/sm/proxy/*)   — green proxy live (click→confirm→RESTART), amber
//                             restarting, grey stopped/unknown. Restart is what's
//                             needed after a deploy so /sm/readmodel serves live
//                             7688 data — clickable, no terminal.
// Both control the SERVICE only; the research firewall is unchanged.
import { useState } from 'react';
import logoMark from '../assets/logo-mark.svg';

const TABS = ['Coverage', 'Board', 'In progress', 'Timeline', 'Data needs'];

// plain-English glossary — the operator should never need the chat thread to decode
// his own console.
const GLOSSARY = [
  ['Approve', 'runs a test (fetches data, spends compute) — the only button that executes'],
  ['Re-judge stored results', 're-applies the fixed rules + LLM to numbers already on file — no data fetched'],
  ['Bank', 'the engine remembers this lesson permanently (loads into every future answer)'],
  ['Unbank', 'forget a banked lesson (removed from memory; history kept)'],
];
const DOTS = [['#B4462E', 'killed'], ['#B07CFF', 'inconclusive — needs a powered re-test'], ['#34D399', 'retained'], ['#00C2FF', 'untested']];

function Glossary({ onClose }) {
  return (
    <div className="glossary-pop" onClick={(e) => e.stopPropagation()}>
      <div className="glossary-head">What the buttons do<button className="rr-x" onClick={onClose}>✕</button></div>
      {GLOSSARY.map(([k, v]) => (<div key={k} className="glossary-row"><b>{k}</b><span>{v}</span></div>))}
      <div className="glossary-dots-h">Map dot colors</div>
      <div className="glossary-dots">
        {DOTS.map(([c, label]) => (<span key={label}><i style={{ background: c }} />{label}</span>))}
      </div>
    </div>
  );
}

const LABEL = {
  running: 'Discovery engine running', stopped: 'Discovery engine stopped',
  starting: 'Starting…', stopping: 'Stopping…', 'not-installed': 'Discovery engine — run setup once',
  unknown: 'Discovery engine — unknown',
};

const PLABEL = {
  running: 'Proxy live', restarting: 'Restarting…', starting: 'Restarting…', stopping: 'Restarting…',
  stopped: 'Proxy stopped', 'not-installed': 'Proxy — not installed',
  unreachable: 'Proxy — unreachable', unknown: 'Proxy — unknown',
};

export default function Topbar({ tab, setTab, cellsMapped, engineStatus, onStart, onStop,
                                proxyStatus, proxyHelperBacked, onProxyRestart, proxyCommit, onProxyUpdateRestart, bundle }) {
  const st = engineStatus || 'unknown';
  const clickable = st === 'running' || st === 'stopped';
  const [glossary, setGlossary] = useState(false);

  function toggle() {
    if (st === 'stopped') onStart();
    else if (st === 'running') { if (window.confirm('Stop the DISCOVERY engine? Research pauses until you start it again. (This does not touch live trading.)')) onStop(); }
  }

  const ps = proxyStatus || 'unknown';
  const pRestarting = ps === 'restarting' || ps === 'starting' || ps === 'stopping';
  const pClass = pRestarting ? 'restarting' : ps;      // amber while cycling

  const stale = !!proxyCommit?.stale;
  function proxyToggle() {
    if (ps !== 'running') return;
    // Update & restart: fast-forwards the service tree to the deploy branch FIRST,
    // then restarts — so the running code actually updates (restart != deploy fix).
    if (window.confirm('Update & restart the proxy? It fast-forwards the service to the latest deploy branch, then cycles (a few seconds), and comes back on the new commit.')) {
      (onProxyUpdateRestart || onProxyRestart)();
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
      <button className="glossary-btn" title="What does everything mean?" onClick={() => setGlossary((v) => !v)}>?</button>
      {glossary && <Glossary onClose={() => setGlossary(false)} />}
      {bundle?.id && (
        <span className={`commit-chip${bundle.stale ? ' stale' : ''}`}
              title={bundle.stale ? `Serving bundle ${bundle.id}; latest deploy is ${bundle.latest} — hard-refresh to update` : `Frontend bundle ${bundle.id} (latest)`}>
          <span className="dot" />ui {bundle.id}{bundle.stale ? ' · update ⚠' : ''}
        </span>
      )}
      {proxyCommit?.running_commit && (
        <span className={`commit-chip${stale ? ' stale' : ''}`}
              title={stale
                ? `Running ${proxyCommit.running_commit}, disk has ${proxyCommit.tree_commit} — click Update & restart to go live`
                : `Proxy running the latest commit (${proxyCommit.running_commit})`}>
          <span className="dot" />{stale ? `stale · ${proxyCommit.running_commit}→${proxyCommit.tree_commit}` : proxyCommit.running_commit}
        </span>
      )}
      <button type="button" className={`proxy-switch st-${pClass}`} onClick={proxyToggle}
              disabled={ps !== 'running'}
              aria-label={`${PLABEL[ps] || PLABEL.unknown}${ps === 'running' ? ' — click to update & restart' : ''}`}
              title={ps === 'running'
                ? 'Update & restart the proxy (fast-forwards to the deploy branch, then restarts — restart alone would not update the code)'
                : PLABEL[ps] || PLABEL.unknown}>
        <span className={`pulse st-${pClass}`} />{PLABEL[ps] || PLABEL.unknown}
        {ps === 'running' && <span className="sw-act">{stale ? ' · update & restart ⚠' : ' · update & restart'}</span>}
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
