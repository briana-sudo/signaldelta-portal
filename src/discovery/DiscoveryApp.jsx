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
import AnalystPanel from './components/AnalystPanel.jsx';
import { downloadMd, renderMd } from './mdExport.js';
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
  const [costingQ, setCostingQ] = useState(null);    // a costing question handed to the assistant
  const [resolutions, setResolutions] = useState({}); // surface_id -> operator's recorded answer
  const restartingUntil = useRef(0);                 // ms deadline while a restart is in flight

  // (re)load the read-model slices — called on mount and again once the proxy
  // comes back after a restart, so the board reflects the now-live 7688 data.
  const reloadData = useCallback(async () => {
    const [g, ga, b, s] = await Promise.all([
      client.query('grid'), client.query('gated'), client.query('board'), client.query('state'),
    ]);
    setGrid(g || []); setGated(ga || []); setBoard(b || []); setState(s || { cells_mapped: 0 });
  }, [client]);

  useEffect(() => { let live = true; reloadData().catch(() => {}); return () => { live = false; }; }, [reloadData]);

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
        s = r.status; if (live) setProxyHelper(!!r.helper_backed);
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

  function onResolved(itemId, newStatus) {
    setBoard((prev) => prev.map((i) => (i.item_id === itemId ? { ...i, status: newStatus } : i)));
  }
  async function onStart() { const r = await client.engineStart(); setEngine(r.status); }
  async function onStop() { const r = await client.engineStop(); setEngine(r.status); }
  // Part C — the worker hands a judgment call to the assistant panel; the operator's
  // answer is recorded back to the card. No spend at any point.
  const askAssistant = (surface_id, surface, question) => setCostingQ({ surface_id, surface, question });
  const onCostingResolved = (surface_id, answer) => {
    setResolutions((r) => ({ ...r, [surface_id]: answer }));
    setCostingQ(null);
  };
  async function onProxyRestart() {
    restartingUntil.current = Date.now() + 60000;    // expect it back within ~60s
    setProxy('restarting');
    try { await client.proxyRestart(); } catch { /* fire-and-forget; the poll tracks recovery */ }
  }

  return (
    <div className="app">
      <Topbar tab={tab} setTab={setTab} cellsMapped={state.cells_mapped || 0}
              engineStatus={engine} onStart={onStart} onStop={onStop}
              proxyStatus={proxy} proxyHelperBacked={proxyHelper} onProxyRestart={onProxyRestart} />
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
                  <span><i className="i-ret" />Retained</span>
                  <span><i className="i-kill" />Killed</span>
                  <span><i className="i-occ" />Occupied</span>
                  <button className="exp-mini" title="Export the coverage map to MD"
                          onClick={() => downloadMd('coverage-map.md', 'SignalDelta — Coverage map', renderMd(grid))}>⤓ Export map</button>
                </div>
              </div>
              <CoverageMap grid={grid} />
            </>
          )}
          {tab === 'Board' && (
            <div className="stage-head"><div><h1>Board</h1>
              <div className="sub">Every pending gate, with the engine's recommendation and the priced fork. Approve / reject sends intent — the orchestrator resolves.</div></div></div>
          )}
          {tab === 'Timeline' && <TimelineView contract={client} />}
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
          <BoardQueue contract={client} items={board} onResolved={onResolved} />
        </div>
      </div>
      {/* FLOATING analyst — draggable/resizable/minimizable, at app root (not the rail) */}
      <AnalystPanel contract={client} costingQuestion={costingQ} onCostingResolved={onCostingResolved} />
      <div className="watermark">SIGNALDELTA DISCOVERY · {{ real: 'REAL STATE · generated read model', mock: 'MOCK · representative data', live: 'LIVE' }[client.mode] || client.mode} · read-only + gated-write</div>
    </div>
  );
}
