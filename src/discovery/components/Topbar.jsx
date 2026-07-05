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
const DOTS = [['#B4462E', 'killed'], ['#B07CFF', 'inconclusive — needs a powered re-test'], ['#5EEAD4', 'candidate (survivor, in the S1–S6 pipeline)'], ['#34D399', 'retained (confirmed)'], ['#00C2FF', 'untested']];

// RECIPE STANDARDS — the methodology floor the runner ENFORCES. Every recipe is rejected
// at validation if it violates one; this is what the machine refuses and why.
const RECIPE_STANDARDS = [
  ['survivorship-free universe', 'long-history studies use a point-in-time universe; a fixed list projected >2y back is rejected'],
  ['independence / clustering', 'panel tests use day-clustered inference; per-observation t on correlated name-days is rejected'],
  ['gate completeness', 'the gate pre-registers metric, min-t, min-n, AND direction — a partial gate is rejected'],
  ['power floor', 'a stated expected-n below min-n is rejected (don’t burn a run to discover it’s underpowered)'],
  ['cost model', 'a recipe that can retain must name a cost model; gross-only concludes gross-real/killed, never retained'],
  ['borrow cost', 'a short-leg recipe names borrow assumptions or is capped gross-only'],
  ['corporate actions', 'returns use split/dividend-adjusted prices; a source without them is rejected'],
  ['look-ahead bias', 'a fundamentals join keys on the filing/report date, never the period date'],
  ['window law', 'an OOS-window-consuming stage requires the operator token; no auto-OOS'],
  ['scope of conclusion', 'a disposition is scoped to the tested universe/window; no “surface killed” from one construction'],
];

function Glossary({ onClose }) {
  return (
    <div className="glossary-pop" onClick={(e) => e.stopPropagation()}>
      <div className="glossary-head">What the buttons do<button className="rr-x" onClick={onClose}>✕</button></div>
      {GLOSSARY.map(([k, v]) => (<div key={k} className="glossary-row"><b>{k}</b><span>{v}</span></div>))}
      <div className="glossary-dots-h">Map dot colors</div>
      <div className="glossary-dots">
        {DOTS.map(([c, label]) => (<span key={label}><i style={{ background: c }} />{label}</span>))}
      </div>
      <div className="glossary-dots-h">Recipe standards — what the runner refuses (deny-by-construction)</div>
      {RECIPE_STANDARDS.map(([k, v]) => (<div key={k} className="glossary-row"><b>{k}</b><span>{v}</span></div>))}
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
                                proxyStatus, proxyHelperBacked, onProxyRestart, proxyCommit, onProxyUpdateRestart, proxyErr, bundle }) {
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
      {/* PROXY COMMIT chip — the running commit, same "proxy <hash>" format as the ui
          chip. If the process hasn't reported its commit yet (hasn't cycled since the
          fix), say so explicitly — never show nothing. */}
      <span className={`commit-chip${proxyCommit?.running_commit ? (stale ? ' stale' : '') : ' unknown'}`}
            title={proxyCommit?.running_commit
              ? (stale
                  ? `Proxy running ${proxyCommit.running_commit}; disk has ${proxyCommit.tree_commit} — Update & restart to go live`
                  : `Proxy running the latest commit (${proxyCommit.running_commit})`)
              : 'The proxy has not reported its running commit yet — Update & restart to populate it'}>
        <span className="dot" />
        {proxyCommit?.running_commit
          ? (stale ? `proxy ${proxyCommit.running_commit} · update ⚠` : `proxy ${proxyCommit.running_commit}`)
          : 'proxy commit unknown — update & restart to populate'}
      </span>
      {/* ENGINE COMMIT chip — the discovery service's running commit (stamped at start).
          "Is the engine current" is a chip, never pid-vs-commit-time archaeology. */}
      {proxyCommit?.engine_commit !== undefined && (
        <span className={`commit-chip${proxyCommit?.engine_commit ? (proxyCommit.engine_stale ? ' stale' : '') : ' unknown'}`}
              title={proxyCommit?.engine_commit
                ? (proxyCommit.engine_stale
                    ? `Discovery engine running ${proxyCommit.engine_commit}; disk has ${proxyCommit.engine_tree_commit} — reload the engine`
                    : `Discovery engine running the latest commit (${proxyCommit.engine_commit})`)
                : 'The engine has not reported its commit yet — reload it to populate'}>
          <span className="dot" />
          {proxyCommit?.engine_commit
            ? (proxyCommit.engine_stale ? `engine ${proxyCommit.engine_commit} · reload ⚠` : `engine ${proxyCommit.engine_commit}`)
            : 'engine commit unknown'}
        </span>
      )}
      {/* PROXY STATUS pill — an INDICATOR ONLY (green/amber/grey); not the action */}
      <span className={`proxy-status st-${pClass}`} title={PLABEL[ps] || PLABEL.unknown}>
        <span className={`pulse st-${pClass}`} />{PLABEL[ps] || PLABEL.unknown}
      </span>
      {/* ACTION — a visually DISTINCT button, separate from the status pill */}
      <button type="button" className={`proxy-update${stale ? ' stale' : ''}`} onClick={proxyToggle}
              disabled={ps !== 'running'}
              aria-label="Update and restart the proxy"
              title="Update & restart the proxy (fast-forwards to the deploy branch, then restarts — restart alone would not update the code)">
        ⟳ Update &amp; restart{stale ? ' ⚠' : ''}
      </button>
      {proxyErr && (
        <span className="proxy-update-err" role="alert"
              title={proxyErr}>⚠ update failed — {proxyErr}</span>
      )}
      <button type="button" className={`engine-switch st-${st}`} onClick={toggle}
              disabled={!clickable} aria-label={`${LABEL[st]} — ${st === 'running' ? 'click to stop' : st === 'stopped' ? 'click to start' : ''}`}
              title={st === 'running' ? 'Click to stop' : st === 'stopped' ? 'Click to start' : LABEL[st]}>
        <span className={`pulse st-${st}`} />{LABEL[st]}
        {st === 'running' && <> · <span className="mono" style={{ color: 'var(--fg-1)' }}>{cellsMapped.toLocaleString()}</span>&nbsp;cells mapped</>}
      </button>
    </div>
  );
}
