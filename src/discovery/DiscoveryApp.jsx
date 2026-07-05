// Phase 3d-iii-b — the Discovery console shell. Three views (Coverage / Board /
// Data needs) + the analyst dock at the rail's foot. Reads slices via the 3d-i
// query API (mock adapter until the live proxy is wired — a config swap). It only
// READS and SENDS INTENT; it never writes the graph, holds a credential, or
// references the trading engine.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { makeContract } from './api/contract.js';
import Topbar from './components/Topbar.jsx';
import CoverageMap from './components/CoverageMap.jsx';
import BoardQueue from './components/BoardQueue.jsx';
import DataNeeds from './components/DataNeeds.jsx';
import TimelineView from './components/TimelineView.jsx';
import InProgress from './components/InProgress.jsx';
import AnalystPanel from './components/AnalystPanel.jsx';
import RunRoom from './components/RunRoom.jsx';
import { mergeRuns, findRun, computeAttention } from './runs.js';
import { BUILD_ID } from '../buildInfo.js';
import { downloadMd, downloadText, renderMd } from './mdExport.js';
import './discovery.css';

export default function DiscoveryApp({ contract }) {
  const client = useMemo(() => contract || makeContract(), [contract]);
  const [tab, setTab] = useState('Coverage');
  const [grid, setGrid] = useState([]);
  const [gated, setGated] = useState([]);
  const [board, setBoard] = useState([]);
  const [state, setState] = useState({ cells_mapped: 0 });
  const [engine, setEngine] = useState('unknown');   // running | starting | stopping | stopped | not-installed
  const [proxy, setProxy] = useState('unknown');     // running | restarting | stopped | unreachable | unknown
  const [proxyHelper, setProxyHelper] = useState(false);  // SM_ProxyHelper up → restarts always work
  const [proxyCommit, setProxyCommit] = useState({});     // {running_commit, tree_commit, stale}
  const [proxyErr, setProxyErr] = useState(null);         // loud update-step failure (never silent)
  const [bundle, setBundle] = useState({ id: BUILD_ID, stale: false });  // served vs latest Pages deploy
  const [costingQ, setCostingQ] = useState(null);    // a costing question handed to the assistant
  const [resolutions, setResolutions] = useState({}); // surface_id -> operator's recorded answer
  const [probe, setProbe] = useState({ running: null, queue: [], done: [] });  // live probe-run state
  const [lessons, setLessons] = useState([]);        // gated learning (SMLesson)
  const [runs, setRuns] = useState([]);              // every SMRunRequest (Run Room source)
  const [correlations, setCorrelations] = useState([]);  // CORRELATES_WITH edges
  const [candidates, setCandidates] = useState([]);      // survivor S1–S6 pipelines (SMCandidate)
  const [openRun, setOpenRun] = useState(null);      // run item_id whose Run Room is open
  const restartingUntil = useRef(0);                 // ms deadline while a restart is in flight
  const prevDone = useRef(0);                         // probe/re-terminus completions seen (→ map reload)

  // (re)load the read-model slices — called on mount and again once the proxy
  // comes back after a restart, so the board reflects the now-live 7688 data.
  const reloadData = useCallback(async () => {
    const [g, ga, b, s, rn, co, cand] = await Promise.all([
      client.query('grid'), client.query('gated'), client.query('board'), client.query('state'),
      client.query('runs'), client.query('correlations'), client.query('candidates'),
    ]);
    setGrid(g || []); setGated(ga || []); setBoard(b || []); setState(s || { cells_mapped: 0 });
    setRuns(rn || []); setCorrelations(co || []); setCandidates(cand || []);
  }, [client]);

  useEffect(() => { let live = true; reloadData().catch(() => {}); return () => { live = false; }; }, [reloadData]);

  // FRONTEND BUNDLE VERSION — compare this (baked) build to version.json (always the
  // latest Pages deploy, fetched no-cache). Differ → the browser is serving a stale
  // bundle (a newer deploy exists). Kills "hard-refresh and hope".
  useEffect(() => {
    let live = true;
    const check = () => fetch(new URL('version.json', document.baseURI).href, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => { if (live && v && v.build) setBundle({ id: BUILD_ID, latest: v.build, stale: v.build !== BUILD_ID }); })
      .catch(() => {});
    check();
    const id = setInterval(check, 60000);
    return () => { live = false; clearInterval(id); };
  }, []);

  // poll the engine power-switch status so the topbar button reflects the true
  // service state (running/starting/stopping/stopped/not-installed).
  useEffect(() => {
    let live = true;
    const tick = async () => {
      try { const r = await client.engineStatus(); if (live) setEngine(r.status); } catch { if (live) setEngine('unknown'); }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => { live = false; clearInterval(id); };
  }, [client]);

  // poll the PROXY status. During a restart the whole surface (incl. this poll) is
  // briefly down → show 'restarting' until it answers 'running' again, then reload.
  useEffect(() => {
    let live = true;
    const tick = async () => {
      let s = 'unknown';
      try {
        const r = await client.proxyStatus();
        s = r.status;
        if (live) { setProxyHelper(!!r.helper_backed); setProxyCommit({ running_commit: r.running_commit, tree_commit: r.tree_commit, stale: r.stale }); }
      } catch { s = 'unreachable'; }
      if (!live) return;
      if (Date.now() < restartingUntil.current) {
        if (s === 'running') { restartingUntil.current = 0; setProxy('running'); reloadData().catch(() => {}); }
        else setProxy('restarting');
      } else {
        setProxy(s === 'unreachable' ? 'unknown' : s);
      }
    };
    tick();
    const id = setInterval(tick, 2500);
    return () => { live = false; clearInterval(id); };
  }, [client, reloadData]);

  // poll the live probe-run state so cards + the In-progress tab reflect the engine
  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const p = await client.probeStatus();
        if (live) {
          setProbe(p || { running: null, queue: [], done: [] });
          // a run OR a re-terminus just concluded → reload grid+board so the map
          // repaints from the new dispositions (map liveness) and the board reflects
          // corrected dispositions / new derived items.
          const dc = (p?.done || []).length;
          if (dc > prevDone.current) { prevDone.current = dc; reloadData().catch(() => {}); }
        }
      } catch { /* keep last */ }
      try { const ls = await client.lessons?.(); if (live && ls) setLessons(ls); }
      catch { /* keep last */ }
    };
    tick();
    const id = setInterval(tick, 2500);
    return () => { live = false; clearInterval(id); };
  }, [client, reloadData]);

  const onBankLesson = async (id) => { await client.bankLesson?.(id); setLessons(await client.lessons?.() || []); };
  const onUnbankLesson = async (id) => { await client.unbankLesson?.(id); setLessons(await client.lessons?.() || []); };
  const onRejectLesson = async (id) => { await client.rejectLesson?.(id); setLessons(await client.lessons?.() || []); };

  // every run (stored 7688 + live probe), and the open Run Room's run object
  const allRuns = useMemo(() => mergeRuns(runs, probe), [runs, probe]);
  const onOpenRun = useCallback((id) => setOpenRun(id), []);
  const onCancelRun = useCallback((id) => client.cancel?.(id), [client]);
  const openRunObj = openRun ? findRun(allRuns, openRun) : null;

  // NEEDS YOUR ATTENTION — recommended actions with reasons, from live state
  const attention = useMemo(() => computeAttention({ runs: allRuns, board, lessons, probe, candidates }), [allRuns, board, lessons, probe, candidates]);
  const onAttentionAction = useCallback(async (a) => {
    if (a.kind === 'reevaluate') await client.reevaluate?.(a.target);
    else if (a.kind === 'approve') await client.resolve?.({ gate_item_id: a.target, decision: 'approve', gate_item_version: a.version || 0 });
  }, [client]);

  function onResolved(itemId, newStatus) {
    setBoard((prev) => prev.map((i) => (i.item_id === itemId ? { ...i, status: newStatus } : i)));
  }
  async function onStart() { const r = await client.engineStart(); setEngine(r.status); }
  async function onStop() { const r = await client.engineStop(); setEngine(r.status); }
  // Part C — the worker hands a judgment call to the assistant panel; the operator's
  // answer is recorded back to the card. No spend at any point.
  const askAssistant = (surface_id, surface, question) => setCostingQ({ surface_id, surface, question });
  // LEAD HANDOFF PACK — compose BOOT_CONTEXT.md from live state and download it (read-only).
  const onHandoff = useCallback(async () => {
    const res = await client.handoff?.();
    const md = res?.markdown || '# BOOT_CONTEXT.md\n\n(handoff unavailable — proxy unreachable)\n';
    downloadText('BOOT_CONTEXT.md', md);
  }, [client]);
  // OPERATOR RULING SHEET — download the audit's decision doc (read-only; proposals only).
  const onRulingSheet = useCallback(async () => {
    const res = await client.rulingSheet?.();
    downloadText('OPERATOR_RULING_SHEET.md', res?.markdown || '# Operator Ruling Sheet\n\n(unavailable — proxy unreachable)\n');
  }, [client]);
  const onCostingResolved = (surface_id, answer) => {
    setResolutions((r) => ({ ...r, [surface_id]: answer }));
    setCostingQ(null);
  };
  async function onProxyRestart() {
    restartingUntil.current = Date.now() + 60000;    // expect it back within ~60s
    setProxy('restarting');
    try { await client.proxyRestart(); } catch { /* fire-and-forget; the poll tracks recovery */ }
  }
  async function onProxyUpdateRestart() {
    restartingUntil.current = Date.now() + 90000;    // ff + restart — a bit longer
    setProxy('restarting');
    setProxyErr(null);
    try {
      const res = await client.proxyUpdateRestart();
      // LOUD: a silent no-op update is forbidden — if the ff/update step failed, show why.
      if (res?.update && res.update.ok === false) {
        setProxyErr(res.update.detail || `update failed${res.update.exit_code != null ? ` (exit ${res.update.exit_code})` : ''}`);
      }
    } catch { /* the poll tracks restart recovery; update errors surface above */ }
  }

  return (
    <div className="app">
      <Topbar tab={tab} setTab={setTab} cellsMapped={state.cells_mapped || 0}
              engineStatus={engine} onStart={onStart} onStop={onStop}
              proxyStatus={proxy} proxyHelperBacked={proxyHelper} onProxyRestart={onProxyRestart}
              proxyCommit={proxyCommit} onProxyUpdateRestart={onProxyUpdateRestart} proxyErr={proxyErr} bundle={bundle} />
      <div className="main">
        <div className="stage">
          {tab === 'Coverage' && (
            <>
              <div className="stage-head">
                <div>
                  <h1>Coverage map</h1>
                  <div className="sub">Field map by surface — sized by discovery potential, coloured by status. The uncrowded frontier glows; picked-over ground sits dim.</div>
                </div>
                <div className="legend">
                  <span><i className="i-white" />Whitespace</span>
                  <span><i className="i-gate" />Gated</span>
                  <span><i className="i-tested" />Tested · inconclusive</span>
                  <span><i className="i-ret" />Retained</span>
                  <span><i className="i-kill" />Killed</span>
                  <span><i className="i-occ" />Occupied</span>
                  <button className="exp-mini" title="Export the coverage map to MD"
                          onClick={() => downloadMd('coverage-map.md', 'SignalDelta — Coverage map', renderMd(grid))}>⤓ Export map</button>
                  <button className="exp-mini" title="Generate the lead handoff pack (BOOT_CONTEXT.md) from live state"
                          onClick={onHandoff}>⤓ Lead handoff pack</button>
                  <button className="exp-mini" title="Export the kill-board audit operator ruling sheet (proposals only)"
                          onClick={onRulingSheet}>⤓ Ruling sheet</button>
                </div>
              </div>
              <CoverageMap grid={grid} runs={allRuns} onOpenRun={onOpenRun} />
            </>
          )}
          {tab === 'Board' && (
            <div className="stage-head"><div><h1>Board</h1>
              <div className="sub">Every pending gate, with the engine's recommendation and the priced fork. Approve / reject sends intent — the orchestrator resolves.</div></div></div>
          )}
          {tab === 'In progress' && <InProgress probe={probe} lessons={lessons} onBank={onBankLesson} onUnbank={onUnbankLesson} onReject={onRejectLesson} onOpenRun={onOpenRun} onCancel={onCancelRun} attention={attention} onAttentionAction={onAttentionAction} />}
          {tab === 'Timeline' && <TimelineView contract={client} onOpenRun={onOpenRun} />}
          {(tab === 'Coverage' || tab === 'Data needs') && <DataNeeds contract={client} gated={gated} onAskAssistant={askAssistant} resolutions={resolutions} />}
          {tab === 'Board' && (
            <div className="datastrip"><div className="queue">
              {board.filter((i) => i.status === 'PENDING').map((it) => (
                <div key={it.item_id} className="item">
                  <div className="ttl">{it.title}</div>
                  <div className="rec">{it.recommendation}</div>
                </div>
              ))}
            </div></div>
          )}
        </div>

        <div className="rail">
          <BoardQueue contract={client} items={board} onResolved={onResolved} probe={probe} onOpenRun={onOpenRun} runs={allRuns} lessons={lessons} />
        </div>
      </div>
      {/* THE RUN ROOM — opens for any run from In-progress / board chips / map drill / timeline */}
      {openRunObj && (
        <RunRoom run={openRunObj} slices={{ lessons, board, correlations, candidates }} contract={client}
                 onExplore={(sid, surface, q) => { askAssistant(sid, surface, q); setOpenRun(null); }}
                 onClose={() => setOpenRun(null)} onBank={onBankLesson} onUnbank={onUnbankLesson} onReject={onRejectLesson}
                 onReevaluate={(pid) => client.reevaluate?.(pid)} onCancel={onCancelRun} runBusy={!!probe.running} />
      )}
      {/* FLOATING analyst — draggable/resizable/minimizable, at app root (not the rail) */}
      <AnalystPanel contract={client} costingQuestion={costingQ} onCostingResolved={onCostingResolved} />
      <div className="watermark">SIGNALDELTA DISCOVERY · {{ real: 'REAL STATE · generated read model', mock: 'MOCK · representative data', live: 'LIVE' }[client.mode] || client.mode} · read-only + gated-write</div>
    </div>
  );
}
