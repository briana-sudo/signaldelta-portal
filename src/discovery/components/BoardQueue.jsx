// Phase 3d-iii-b — the board / decision queue. approve / reject / choose calls the
// RESOLVE API (the §4.1 gated-write INTENT) — the frontend NEVER writes the graph;
// it sends intent and the orchestrator resolves. Shows the priced fork + the
// engine's recommendation per item.
//
// The queue is sorted by READINESS (time-to-a-real-test), not chronology:
// RUNNABLE-NOW → NEEDS-DATA → NEEDS-BUILD → NEEDS-BROKER, and within each tier by
// EV / claim strength. Tier bands make the readiness at a glance.
import { useState } from 'react';
import { downloadMd, renderMd } from '../mdExport.js';

const KIND_CLASS = { 'gated-option': 'k-gate', 'revalidation-due': 'k-reval', 'new-search-surface': 'k-new' };
const PRIMARY_LABEL = {
  'gated-option': 'Approve & onboard', 'revalidation-due': 'Send to gauntlet', 'new-search-surface': 'Approve scope',
};

// readiness tiers, top → bottom (locked order)
const TIERS = [
  { kind: 'Runnable now', label: 'RUNNABLE NOW', note: 'owned data — testable now' },
  { kind: 'Needs data', label: 'NEEDS DATA', note: 'gated on a data pull' },
  { kind: 'Needs build', label: 'NEEDS BUILD', note: 'needs an engine change' },
  { kind: 'Needs broker', label: 'NEEDS BROKER', note: 'gated on a broker/facility' },
];
const RANK = { 'Runnable now': 0, 'Needs data': 1, 'Needs build': 2, 'Needs broker': 3 };
const evOf = (i) => (typeof i.ev === 'number' ? i.ev : 0);

export default function BoardQueue({ contract, items, onResolved, probe }) {
  const [busy, setBusy] = useState(null);
  const [held, setHeld] = useState({});             // item_id -> true (Hold visible feedback)
  const open = items.filter((i) => i.status === 'PENDING');
  const sorted = [...open].sort((a, b) =>
    (RANK[a.kind] ?? 9) - (RANK[b.kind] ?? 9) || evOf(b) - evOf(a));
  const other = sorted.filter((i) => RANK[i.kind] === undefined);

  // overlay the LIVE run state (from /sm/probe/status) onto each card
  const runStateOf = (it) => {
    if (probe?.running?.item_id === it.item_id) return { s: 'running', stage: probe.running.stage };
    if ((probe?.queue || []).some((q) => q.item_id === it.item_id)) return { s: 'queued' };
    const d = (probe?.done || []).find((x) => x.item_id === it.item_id);
    if (d) return { s: 'done', result: d.result || {}, disposition: d.disposition };
    if (held[it.item_id]) return { s: 'held' };
    return { s: 'idle' };
  };

  async function decide(item, decision) {
    setBusy(item.item_id);
    const res = await contract.resolve({
      gate_item_id: item.item_id, decision, gate_item_version: item.version,
    });
    setBusy(null);
    if (res.held) { setHeld((h) => ({ ...h, [item.item_id]: true })); return; }
    if (res.resolved) onResolved(item.item_id, res.new_status);
  }

  const card = (it) => {
    const rs = runStateOf(it);
    const active = rs.s === 'running' || rs.s === 'queued' || rs.s === 'done';
    return (
      <div key={it.item_id} className={`item slidein${rs.s === 'running' ? ' running' : ''}`}>
        <div className="row1">
          <span className={`kind ${KIND_CLASS[it.type] || 'k-reval'}`}>{it.kind}</span>
          {typeof it.ev === 'number' && <span className="ev-chip mono" title="claim strength / EV">EV {it.ev.toFixed(2)}</span>}
          {rs.s === 'running' && <span className="run-badge running">RUNNING</span>}
          {rs.s === 'queued' && <span className="run-badge queued">QUEUED</span>}
          {rs.s === 'done' && <span className={`run-badge ${rs.result?.gate_pass ? 'pass' : 'done'}`}>DONE</span>}
          {rs.s === 'held' && <span className="run-badge held">HELD</span>}
          <span className="mono" style={{ color: 'var(--fg-3)', fontSize: 11, marginLeft: 'auto' }}>{it.age}</span>
          <button className="exp-mini" title="Export this item to MD"
                  onClick={() => downloadMd(`${it.item_id.replace(/[^a-z0-9]+/gi, '-')}.md`, it.title, renderMd(it))}>⤓ MD</button>
        </div>
        <div className="ttl">{it.title}</div>
        {rs.s === 'running' && <div className="run-line mono">▸ {rs.stage}…</div>}
        {rs.s === 'done' && <div className="run-line done">{rs.disposition} · t={rs.result?.t ?? '—'} n={rs.result?.n ?? '—'}</div>}
        {rs.s !== 'running' && rs.s !== 'done' && <>
          <div className="meta">{it.meta.map((m, i) => <span key={i} className={/\$|\d/.test(m) ? 'mono' : ''}>{m}</span>)}</div>
          <div className="rec">{it.recommendation}</div>
        </>}
        <div className="acts">
          <button className="b b-pri" disabled={busy === it.item_id || active || rs.s === 'held'}
                  onClick={() => decide(it, 'approve')}>
            {rs.s === 'running' ? 'Running…' : rs.s === 'queued' ? 'Queued' : rs.s === 'done' ? 'Done' : (PRIMARY_LABEL[it.type] || 'Approve')}</button>
          {it.options.includes('hold') && rs.s !== 'running' && rs.s !== 'queued'
            && <button className="b b-sec" disabled={rs.s === 'held'} onClick={() => decide(it, 'reject')}>{rs.s === 'held' ? 'Held' : 'Hold'}</button>}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="rail-sec">
        <h2>Decision queue <span className="count mono">{open.length}</span></h2>
        <div className="cap">Pending gates, sorted by readiness — soonest-testable first.</div>
      </div>
      <div className="queue">
        {open.length === 0 && <div className="item" style={{ color: 'var(--fg-3)' }}>Queue clear — nothing awaiting a decision.</div>}
        {TIERS.map((t) => {
          const group = sorted.filter((i) => i.kind === t.kind);
          if (!group.length) return null;
          return (
            <div key={t.kind} className="tier-group">
              <div className={`tier-band tb-${RANK[t.kind]}`}>
                <span className="tb-label">{t.label}</span>
                <span className="tb-note">{t.note}</span>
                <span className="tb-count mono">{group.length}</span>
              </div>
              {group.map(card)}
            </div>
          );
        })}
        {other.length > 0 && (
          <div className="tier-group">
            <div className="tier-band tb-x"><span className="tb-label">OTHER</span><span className="tb-count mono">{other.length}</span></div>
            {other.map(card)}
          </div>
        )}
      </div>
    </>
  );
}
