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

export default function BoardQueue({ contract, items, onResolved }) {
  const [busy, setBusy] = useState(null);
  const open = items.filter((i) => i.status === 'PENDING');
  // sort by readiness tier, then EV within tier
  const sorted = [...open].sort((a, b) =>
    (RANK[a.kind] ?? 9) - (RANK[b.kind] ?? 9) || evOf(b) - evOf(a));
  const other = sorted.filter((i) => RANK[i.kind] === undefined);

  async function decide(item, decision) {
    setBusy(item.item_id);
    // INTENT only: send {gate_item_id, decision, gate_item_version} to resolve.
    const res = await contract.resolve({
      gate_item_id: item.item_id, decision, gate_item_version: item.version,
    });
    setBusy(null);
    if (res.resolved) onResolved(item.item_id, res.new_status);
  }

  const card = (it) => (
    <div key={it.item_id} className="item slidein">
      <div className="row1">
        <span className={`kind ${KIND_CLASS[it.type] || 'k-reval'}`}>{it.kind}</span>
        {typeof it.ev === 'number' && <span className="ev-chip mono" title="claim strength / EV">EV {it.ev.toFixed(2)}</span>}
        <span className="mono" style={{ color: 'var(--fg-3)', fontSize: 11, marginLeft: 'auto' }}>{it.age}</span>
        <button className="exp-mini" title="Export this item to MD"
                onClick={() => downloadMd(`${it.item_id.replace(/[^a-z0-9]+/gi, '-')}.md`, it.title, renderMd(it))}>⤓ MD</button>
      </div>
      <div className="ttl">{it.title}</div>
      <div className="meta">{it.meta.map((m, i) => <span key={i} className={/\$|\d/.test(m) ? 'mono' : ''}>{m}</span>)}</div>
      <div className="rec">{it.recommendation}</div>
      <div className="acts">
        <button className="b b-pri" disabled={busy === it.item_id}
                onClick={() => decide(it, 'approve')}>{PRIMARY_LABEL[it.type] || 'Approve'}</button>
        {it.options.includes('hold') && <button className="b b-sec" onClick={() => decide(it, 'reject')}>Hold</button>}
        {it.options.includes('reject') && <button className="b b-sec" onClick={() => decide(it, 'reject')}>Reject</button>}
      </div>
    </div>
  );

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
