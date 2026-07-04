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

const CONCLUDED = ['CLEARED', 'RETAINED', 'OPEN'];
const STATUS_CLASS = { CLEARED: 'st-cleared', RETAINED: 'st-retained', OPEN: 'st-open' };

export default function BoardQueue({ contract, items, onResolved, probe }) {
  const [busy, setBusy] = useState(null);
  const [held, setHeld] = useState({});             // item_id -> true (Hold visible feedback)
  const [reevaluating, setReevaluating] = useState({});  // item_id -> true (Re-evaluate queued)
  const open = items.filter((i) => i.status === 'PENDING');
  const concluded = items.filter((i) => CONCLUDED.includes(i.status));
  const sorted = [...open].sort((a, b) =>
    (RANK[a.kind] ?? 9) - (RANK[b.kind] ?? 9) || evOf(b) - evOf(a));
  const other = sorted.filter((i) => RANK[i.kind] === undefined);

  // all component runs (from /sm/probe/status), tagged by state
  const allRuns = [
    ...(probe?.running ? [{ ...probe.running, _s: 'running' }] : []),
    ...(probe?.queue || []).map((q) => ({ ...q, _s: 'queued' })),
    ...(probe?.done || []).map((x) => ({ ...x, _s: 'done' })),
  ];
  // the component runs belonging to a board item (parent#recipe). A board item is
  // "running" if ANY component runs; it concludes only when ALL components are done.
  const componentsOf = (it) =>
    allRuns.filter((r) => r.parent === it.item_id || (r.item_id || '').startsWith(`${it.item_id}#`))
      .map((r) => ({ recipe_id: r.recipe_id, state: r._s, stage: r.stage, result: r.result || {}, disposition: r.disposition }));
  const shortName = (rid) => (rid || '').replace(/^V-\d+-/, '');

  async function decide(item, decision) {
    setBusy(item.item_id);
    const res = await contract.resolve({
      gate_item_id: item.item_id, decision, gate_item_version: item.version,
    });
    setBusy(null);
    if (res.held) { setHeld((h) => ({ ...h, [item.item_id]: true })); return; }
    if (res.resolved) onResolved(item.item_id, res.new_status);
  }

  // Re-evaluate = the deliberate-review path: the ENGINE re-runs terminus on the
  // stored results with the fixed taxonomy + LLM (corrects dispositions, retracts its
  // own wrong kills, re-derives). Intent only — it streams to the In-progress tab.
  async function reevaluate(item) {
    setBusy(item.item_id);
    await contract.reevaluate?.(item.item_id);
    setBusy(null);
    setReevaluating((r) => ({ ...r, [item.item_id]: true }));
  }

  const card = (it) => {
    const comps = componentsOf(it);
    const anyRunning = comps.some((c) => c.state === 'running');
    const anyQueued = comps.some((c) => c.state === 'queued');
    const allDone = comps.length > 0 && comps.every((c) => c.state === 'done');
    const active = comps.length > 0;                 // components in flight → no re-approve
    const isHeld = held[it.item_id];
    return (
      <div key={it.item_id} className={`item slidein${anyRunning ? ' running' : ''}`}>
        <div className="row1">
          <span className={`kind ${KIND_CLASS[it.type] || 'k-reval'}`}>{it.kind}</span>
          {it.provenance === 'derived' && <span className="prov-badge prov-derived" title={`derived from ${it.derived_from || 'a concluded run'}`}>⌥ derived</span>}
          {it.provenance === 'combination' && <span className="prov-badge prov-combo" title={`combination · burns ${it.oos_window || 'a sealed OOS window'} (operator token required)`}>⋈ combine</span>}
          {typeof it.ev === 'number' && <span className="ev-chip mono" title="claim strength / EV">EV {it.ev.toFixed(2)}</span>}
          {anyRunning && <span className="run-badge running">RUNNING</span>}
          {!anyRunning && anyQueued && <span className="run-badge queued">QUEUED</span>}
          {allDone && <span className="run-badge done">DONE</span>}
          {isHeld && !active && <span className="run-badge held">HELD</span>}
          <span className="mono" style={{ color: 'var(--fg-3)', fontSize: 11, marginLeft: 'auto' }}>{it.age}</span>
          <button className="exp-mini" title="Export this item to MD"
                  onClick={() => downloadMd(`${it.item_id.replace(/[^a-z0-9]+/gi, '-')}.md`, it.title, renderMd(it))}>⤓ MD</button>
        </div>
        <div className="ttl">{it.title}</div>

        {comps.length > 0 ? (
          <div className="comp-states">
            {comps.map((c) => (
              <div key={c.recipe_id} className={`comp comp-${c.state}`} title={c.disposition || c.stage || c.state}>
                <span className="comp-name">{shortName(c.recipe_id)}</span>
                <span className="comp-state">
                  {c.state === 'running' ? `▸ ${c.stage || 'running'}`
                    : c.state === 'queued' ? 'queued'
                      : c.result?.error ? 'error'
                        : c.disposition?.startsWith('killed') ? `killed · t=${c.result?.t ?? '—'}`
                          : c.disposition?.startsWith('retained') ? `retained · t=${c.result?.t ?? '—'}`
                            : (c.disposition || 'done')}
                </span>
              </div>
            ))}
            {allDone && <div className="comp-summary">{comps.every((c) => (c.disposition || '').startsWith('killed'))
              ? 'all flows null — surface concluded (killed as tested)'
              : comps.some((c) => (c.disposition || '').startsWith('retained'))
                ? 'a flow survived — surface stays a candidate'
                : 'components concluded (mixed / errors — re-approvable)'}</div>}
          </div>
        ) : (<>
          <div className="meta">{(it.meta || []).map((m, i) => <span key={i} className={/\$|\d/.test(m) ? 'mono' : ''}>{m}</span>)}</div>
          <div className="rec">{it.recommendation}</div>
        </>)}

        <div className="acts">
          <button className="b b-pri" disabled={busy === it.item_id || active || isHeld}
                  onClick={() => decide(it, 'approve')}>
            {anyRunning ? 'Running…' : anyQueued ? 'Queued' : allDone ? 'Re-run' : (PRIMARY_LABEL[it.type] || 'Approve')}</button>
          {(it.options || []).includes('hold') && !active
            && <button className="b b-sec" disabled={isHeld} onClick={() => decide(it, 'reject')}>{isHeld ? 'Held' : 'Hold'}</button>}
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
        {concluded.length > 0 && (
          <div className="tier-group">
            <div className="tier-band tb-concluded">
              <span className="tb-label">CONCLUDED</span>
              <span className="tb-note">the engine re-judges its own work</span>
              <span className="tb-count mono">{concluded.length}</span>
            </div>
            {concluded.map((it) => (
              <div key={it.item_id} className="item concluded-item">
                <div className="row1">
                  <span className={`kind ${STATUS_CLASS[it.status] || ''}`}>{it.status}</span>
                  <span className="mono" style={{ color: 'var(--fg-3)', fontSize: 11, marginLeft: 'auto' }}>{it.age}</span>
                </div>
                <div className="ttl">{it.title}</div>
                <div className="rec">{it.disposition || '—'}</div>
                <div className="acts">
                  <button className="b b-sec" disabled={busy === it.item_id || reevaluating[it.item_id]}
                          title="The engine re-runs terminus on the stored results with the fixed taxonomy + LLM — corrects its own dispositions, retracts wrong kills, re-derives, re-proposes lessons."
                          onClick={() => reevaluate(it)}>
                    {reevaluating[it.item_id] ? 'Re-evaluating…' : '↻ Re-evaluate'}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
