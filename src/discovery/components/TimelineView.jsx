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
  const [scans, setScans] = useState([]);
  const [gated, setGated] = useState([]);
  const [board, setBoard] = useState([]);

  useEffect(() => {
    let live = true;
    (async () => {
      const [w, s, g, b] = await Promise.all([
        contract.query('watches'), contract.query('scan_history'),
        contract.query('gated'), contract.query('board'),
      ]);
      if (!live) return;
      setWatches(w || []); setScans(s || []); setGated(g || []); setBoard(b || []);
    })();
    return () => { live = false; };
  }, [contract]);

  // B-AG / the seed's named watches to the top, then dated reviews, then event-driven
  const revival = [...(watches || [])].sort(
    (a, b) => (b.id === 'B-AG') - (a.id === 'B-AG') || String(a.id).localeCompare(String(b.id)));

  const seen = new Set();
  const dataPull = [];
  for (const g of gated || []) {
    const key = (g.surface || g.id || '').toLowerCase();
    if (seen.has(key)) continue; seen.add(key);
    dataPull.push({ id: g.id, what: g.surface || g.id, source: g.vendor || '—',
      blocker: g.price || '—', unlocks: g.unlocks || '—', status: 'awaiting decision' });
  }
  for (const b of board || []) {
    if (!['Needs data', 'Needs broker'].includes(b.kind)) continue;
    const key = (b.title || '').toLowerCase().slice(0, 18);
    if ([...seen].some((s) => key.includes(s) || s.includes(key.split(' ')[0]))) continue;
    dataPull.push({ id: b.item_id, what: b.title, source: (b.meta || [])[1] || '—',
      blocker: b.kind === 'Needs broker' ? 'needs-broker' : 'needs-data', unlocks: 'test',
      status: 'awaiting decision' });
  }

  const lastScan = scans[0];
  const exportTimeline = () => downloadMd('timeline.md', 'SignalDelta — Timeline / Watches',
    `## Revival watches\n${renderMd(revival)}\n\n## Data-pull queue\n${renderMd(dataPull)}`
    + `\n\n## Recheck history\n${renderMd(scans)}`);

  return (
    <div className="timeline">
      <div className="stage-head">
        <div><h1>Timeline · watches</h1>
          <div className="sub">The engine's revival + data-pull schedule and the recheck-scan history — what's watched, when it's rechecked, and whether a scan ran.</div></div>
        <button className="b b-sec exp-mini" onClick={exportTimeline}>⤓ Export timeline</button>
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
                <td className="mono">{w.recheck_due}</td>
                <td className="mono">{fmtTs(w.last_checked)}</td>
                <td><span className={`tl-pill st-${w.status}`}>{STATUS_LABEL[w.status] || w.status}</span></td>
              </tr>
            ))}
            {revival.length === 0 && <tr><td colSpan="6" style={{ color: 'var(--fg-3)' }}>No revival watches in the current state.</td></tr>}
          </tbody>
        </table>
      </div>

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
