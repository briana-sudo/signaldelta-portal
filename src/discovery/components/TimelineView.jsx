// TIMELINE / WATCHES view — the engine's revival + data-pull schedule and the
// recheck-scan history. Reads the LIVE monitor state persisted to 7688: the
// `watches` slice (recheck_due / last_checked / status per watch, written by the
// 3b/2d monitors) + the `scan_history` slice (per-scan records). Firewall: reads +
// reasons, never acts; the only action is a read-only MD export.
import { useEffect, useState } from 'react';
import { downloadMd, renderMd } from '../mdExport.js';

const STATUS_LABEL = { waiting: 'waiting', 'ran-no-change': 'ran · no change', REVIVED: 'REVIVED' };
const fmtTs = (ts) => (ts ? String(ts).replace('T', ' ').replace(/(\+00:00|Z)$/, ' UTC') : '—');

export default function TimelineView({ contract }) {
  const [watches, setWatches] = useState([]);
  const [monitors, setMonitors] = useState([]);  // class monitors (one row per revival class)
  const [proposals, setProposals] = useState([]);  // durable SMProposal records (badge count DERIVES from these)
  const [scans, setScans] = useState([]);
  const [gated, setGated] = useState([]);
  const [board, setBoard] = useState([]);
  const [refiled, setRefiled] = useState([]);   // ruling a/b: kills refiled as raw material

  useEffect(() => {
    let live = true;
    (async () => {
      const [w, s, g, b, rf, mon, pr] = await Promise.all([
        contract.query('watches'), contract.query('scan_history'),
        contract.query('gated'), contract.query('board'), contract.query('refiled'),
        contract.query('monitors'), contract.query('proposals'),
      ]);
      if (!live) return;
      setWatches(w || []); setScans(s || []); setGated(g || []); setBoard(b || []); setRefiled(rf || []);
      setMonitors(mon || []); setProposals(pr || []);
    })();
    return () => { live = false; };
  }, [contract]);

  // PENDING proposal count per class — DERIVED from the SMProposal records, never a stored
  // field on the monitor row (that stored count was the badge-vs-reality bug).
  const pendingByClass = {};
  for (const p of proposals || []) {
    if ((p.status || 'PENDING') === 'PENDING') pendingByClass[p.revival_class] = (pendingByClass[p.revival_class] || 0) + 1;
  }

  // B-AG / the seed's named watches to the top, then dated reviews, then event-driven
  const revival = [...(watches || [])].sort(
    (a, b) => (b.id === 'B-AG') - (a.id === 'B-AG') || String(a.id).localeCompare(String(b.id)));

  const seen = new Set();
  const dataPull = [];
  for (const g of gated || []) {
    if (!(g.surface || g.id)) continue;              // no identity → skip the ghost all-dash row
    const key = (g.surface || g.id || '').toLowerCase();
    if (seen.has(key)) continue; seen.add(key);
    dataPull.push({ id: g.id, what: g.surface || g.id, source: g.vendor || '—',
      blocker: g.price || '—', unlocks: g.unlocks || '—', status: 'awaiting decision' });
  }
  for (const b of board || []) {
    if (!['Needs data', 'Needs broker'].includes(b.kind) || !b.title) continue;
    const key = (b.title || '').toLowerCase().slice(0, 18);
    if ([...seen].some((s) => key.includes(s) || s.includes(key.split(' ')[0]))) continue;
    dataPull.push({ id: b.item_id, what: b.title, source: (b.meta || [])[1] || '—',
      blocker: b.kind === 'Needs broker' ? 'needs-broker' : 'needs-data', unlocks: 'test',
      status: 'awaiting decision' });
  }

  const lastScan = scans[0];
  const exportTimeline = () => downloadMd('timeline.md', 'SignalDelta — Timeline / Watches',
    `## Class monitors\n${renderMd(monitors)}\n\n## Revival watches\n${renderMd(revival)}`
    + `\n\n## Data-pull queue\n${renderMd(dataPull)}\n\n## Recheck history\n${renderMd(scans)}`);

  return (
    <div className="timeline">
      <div className="stage-head">
        <div><h1>Timeline · watches</h1>
          <div className="sub">The engine's revival + data-pull schedule and the recheck-scan history — what's watched, when it's rechecked, and whether a scan ran.</div></div>
        <button className="b b-sec exp-mini" onClick={exportTimeline}>⤓ Export timeline</button>
      </div>

      {/* CLASS MONITORS — one watcher per revival class (the ruling-sheet axis).
          Honesty law: an unwired feed renders 'no live feed' (never a faked reading);
          every row shows last-checked. */}
      <div className="datastrip">
        <h3>Class monitors <span className="count mono">{monitors.length}</span></h3>
        <div className="cap">One watcher per revival class. The sweep + monitors PROPOSE rechecks — nothing revives without your Approve. A reading the feed can't supply shows <i>no live feed</i>, honestly.</div>
        <table className="dtable">
          <thead><tr><th>Class</th><th>Metric</th><th>Cadence</th><th>Kills</th><th>Current reading</th><th>Last checked</th></tr></thead>
          <tbody>
            {monitors.map((m) => (
              <tr key={m.revival_class}>
                <td className="src">{m.revival_class}</td>
                <td style={{ color: 'var(--fg-3)' }}>{m.metric}</td>
                <td className="mono">{m.cadence}</td>
                <td className="mono">{m.kills_count ?? (m.kills_covered || []).length}{pendingByClass[m.revival_class] > 0 ? <span className="tl-pill st-REVIVED" style={{ marginLeft: 6 }}>{pendingByClass[m.revival_class]} proposed</span> : null}</td>
                <td className={m.reading_live ? '' : 'tl-nofeed'} style={m.reading_live ? {} : { color: 'var(--fg-3)', fontStyle: 'italic' }}>
                  {m.reading_live ? m.reading : <><span className="tl-pill st-waiting">no live feed</span> {m.reading}</>}
                </td>
                <td className="mono">{fmtTs(m.last_checked)}</td>
              </tr>
            ))}
            {monitors.length === 0 && <tr><td colSpan="6" style={{ color: 'var(--fg-3)' }}>No class monitors yet — start the engine to run a monitor cycle.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* REVIVAL WATCHES */}
      <div className="datastrip">
        <h3>Revival watches <span className="count mono">{revival.length}</span></h3>
        <div className="cap">Killed cells the engine watches for revival — regime-scoped, not permanently dead. Recheck date, last-checked timestamp, and run status are live from the monitors.</div>
        <table className="dtable">
          <thead><tr><th>Watch</th><th>Disposition</th><th>Trigger</th><th>Recheck due</th><th>Last checked</th><th>Status</th></tr></thead>
          <tbody>
            {revival.map((w) => (
              <tr key={w.id}>
                <td className="src">{w.id}</td>
                <td>{w.disposition}</td>
                <td>{w.trigger}</td>
                <td className="mono">{w.recheck_due || '≈ never'}</td>
                <td className="mono">{fmtTs(w.last_checked)}</td>
                <td><span className={`tl-pill st-${w.status}`}>{STATUS_LABEL[w.status] || w.status}</span></td>
              </tr>
            ))}
            {revival.length === 0 && <tr><td colSpan="6" style={{ color: 'var(--fg-3)' }}>No revival watches in the current state.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* REFILED — kills corrected to raw material by the audit ruling (a/b) */}
      {refiled.length > 0 && (
        <div className="datastrip">
          <h3>Refiled as raw material <span className="count mono">{refiled.length}</span></h3>
          <div className="cap">Kills the audit ruling corrected: a real brick or an active watch that was over-subtracted. Combiner-visible; no longer a kill.</div>
          <table className="dtable">
            <thead><tr><th>Item</th><th>New status</th><th>Revival class</th><th>Why</th></tr></thead>
            <tbody>
              {refiled.map((k) => (
                <tr key={k.id}>
                  <td className="src">{k.id}</td>
                  <td><span className={`tl-pill st-${k.status}`}>{String(k.status || '').toUpperCase()}</span></td>
                  <td className="mono">{k.revival_class || '—'}</td>
                  <td>{k.revival_justification || k.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* DATA-PULL QUEUE */}
      <div className="datastrip">
        <h3>Data-pull queue <span className="count mono">{dataPull.length}</span></h3>
        <div className="cap">Gated surfaces + queued data needs, in priority order — what to pull, what it unlocks, the blocker, and where it stands.</div>
        <table className="dtable">
          <thead><tr><th>Surface / need</th><th>Source</th><th>Blocker</th><th>Unlocks</th><th>Status</th></tr></thead>
          <tbody>
            {dataPull.map((d) => (
              <tr key={d.id}>
                <td className="src">{d.what}</td>
                <td>{d.source}</td>
                <td><span className="tl-pill st-block">{d.blocker}</span></td>
                <td className="mono">{d.unlocks}</td>
                <td><span className="tl-pill st-waiting">{d.status}</span></td>
              </tr>
            ))}
            {dataPull.length === 0 && <tr><td colSpan="5" style={{ color: 'var(--fg-3)' }}>No gated data needs queued.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* RECHECK HISTORY */}
      <div className="datastrip">
        <h3>Recheck history <span className="count mono">{scans.length}</span></h3>
        <div className="cap">When the engine last ran a revival / data-availability scan, and what it produced — live from the monitors.</div>
        {lastScan && (
          <div className="tl-last">Last scan <b className="mono">{fmtTs(lastScan.at)}</b> · evaluated <b>{lastScan.evaluated}</b> watches · <b>{lastScan.revived || 0}</b> revived · <b>{(lastScan.resurfaced || []).length}</b> re-surfaced from the killed set.</div>
        )}
        <table className="dtable">
          <thead><tr><th>When</th><th>Scan</th><th>Evaluated</th><th>Revived</th><th>Result</th></tr></thead>
          <tbody>
            {scans.map((s) => (
              <tr key={s.scan_id}>
                <td className="mono">{fmtTs(s.at)}</td>
                <td>{s.kind}</td>
                <td className="mono">{s.evaluated}</td>
                <td className="mono">{s.revived || 0}</td>
                <td style={{ color: 'var(--fg-3)' }}>{s.note}</td>
              </tr>
            ))}
            {scans.length === 0 && <tr><td colSpan="5" style={{ color: 'var(--fg-3)' }}>No scan has run yet — start the engine to run a revival cycle.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
