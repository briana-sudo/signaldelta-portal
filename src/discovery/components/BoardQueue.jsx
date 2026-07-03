// Phase 3d-iii-b — the board / decision queue. approve / reject / choose calls the
// RESOLVE API (the §4.1 gated-write INTENT) — the frontend NEVER writes the graph;
// it sends intent and the orchestrator resolves. Shows the priced fork + the
// engine's recommendation per item.
import { useState } from 'react';

const KIND_CLASS = { 'gated-option': 'k-gate', 'revalidation-due': 'k-reval', 'new-search-surface': 'k-new' };
const PRIMARY_LABEL = {
  'gated-option': 'Approve & onboard', 'revalidation-due': 'Send to gauntlet', 'new-search-surface': 'Approve scope',
};

export default function BoardQueue({ contract, items, onResolved }) {
  const [busy, setBusy] = useState(null);
  const open = items.filter((i) => i.status === 'PENDING');

  async function decide(item, decision) {
    setBusy(item.item_id);
    // INTENT only: send {gate_item_id, decision, gate_item_version} to resolve.
    const res = await contract.resolve({
      gate_item_id: item.item_id, decision, gate_item_version: item.version,
    });
    setBusy(null);
    if (res.resolved) onResolved(item.item_id, res.new_status);
  }

  return (
    <>
      <div className="rail-sec">
        <h2>Decision queue <span className="count mono">{open.length}</span></h2>
        <div className="cap">Pending gates awaiting your call.</div>
      </div>
      <div className="queue">
        {open.map((it) => (
          <div key={it.item_id} className="item slidein">
            <div className="row1">
              <span className={`kind ${KIND_CLASS[it.type] || 'k-reval'}`}>{it.kind}</span>
              <span className="mono" style={{ color: 'var(--fg-3)', fontSize: 11 }}>{it.age}</span>
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
        ))}
        {open.length === 0 && <div className="item" style={{ color: 'var(--fg-3)' }}>Queue clear — nothing awaiting a decision.</div>}
      </div>
    </>
  );
}
