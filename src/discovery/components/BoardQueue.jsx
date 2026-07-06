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
import { rejudgeReason, surfaceOf, needsApproval, indexRunsByRecipe, runErrored, erroredReason, isWaiting, waitInfo, displayName, groupFamilies } from '../runs.js';

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

// OPEN = partially tested, awaiting re-tests/decisions; CONCLUDED = fully disposed only
const OPEN_STATES = ['OPEN'];
const CONCLUDED_STATES = ['CLEARED', 'RETAINED'];
const STATUS_CLASS = { CLEARED: 'st-cleared', RETAINED: 'st-retained', OPEN: 'st-open' };
const STATUS_WORD = { CLEARED: 'killed — all flows null', RETAINED: 'retained — a flow survived', OPEN: 'open — partially tested' };

export default function BoardQueue({ contract, items, onResolved, probe, onOpenRun, runs = [], lessons = [], watches = [] }) {
  const [busy, setBusy] = useState(null);
  const openRun = (id) => onOpenRun && onOpenRun(id);
  const [held, setHeld] = useState({});             // item_id -> true (Hold visible feedback)
  const [reevaluating, setReevaluating] = useState({});  // item_id -> true (Re-evaluate queued)
  const [outcome, setOutcome] = useState({});       // item_id -> {kind, text} — EVERY click's visible result
  const [approved, setApproved] = useState({});     // item_id -> canonical name (just-approved trace; never vanish)
  const [openFam, setOpenFam] = useState({});       // family key -> true (folded ranked list expanded)
  const runsByRecipe = indexRunsByRecipe(runs);
  const waits = (i) => isWaiting(i, watches, runsByRecipe);   // DEF-018: data-bound → waiting, no Approve
  // FAMILY GROUPING: derived siblings collapse under one family card; only the top 1–2
  // render, the rest fold. Everything else ('loose') renders in the normal buckets.
  const { families, loose } = groupFamilies(items);
  const waiting = loose.filter(waits);
  // APPROVABLE = PENDING, OR a runnable re-test the operator still owes a decision on
  // (no successful run yet). An errored run flips the item's status to OPEN, but it
  // must stay in the approve queue — errors never satisfy a recommendation. A data-bound
  // (waiting) item is excluded — its Approve cannot succeed.
  const open = loose.filter((i) => !waits(i) && (i.status === 'PENDING' || needsApproval(i, runsByRecipe, watches)));
  const openItems = loose.filter((i) => OPEN_STATES.includes(i.status) && !waits(i) && !needsApproval(i, runsByRecipe, watches));
  const concluded = loose.filter((i) => CONCLUDED_STATES.includes(i.status) && !waits(i));  // fully disposed
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

  // EVERY click produces a visible outcome within one render — enqueued (→running),
  // held, a NAMED gate (needs-build/data/broker with its reason), or a named error.
  // There is no path that leaves the card silent: a lying/dead button is a defect even
  // if the happy path works.
  async function decide(item, decision) {
    setBusy(item.item_id);
    let res;
    try {
      res = await contract.resolve({ gate_item_id: item.item_id, decision, gate_item_version: item.version });
    } catch (e) {
      setBusy(null);
      setOutcome((o) => ({ ...o, [item.item_id]: { kind: 'error', text: `resolve failed at the proxy hop — ${e.message}` } }));
      return;
    }
    setBusy(null);
    if (res.held) { setHeld((h) => ({ ...h, [item.item_id]: true })); return; }
    if (res.rejected) { setOutcome((o) => ({ ...o, [item.item_id]: { kind: 'error', text: res.reason || 'resolve rejected' } })); return; }
    if (res.enqueued) {                              // a real run was enqueued → running/queued
      // NOTHING VANISHES (§2): the card visibly transitions in place to a one-line trace
      // ("Approved → running as <name> — see In progress") and stays put; the poll then
      // shows it RUNNING via its components. We DELIBERATELY do not change status here
      // (which would drop it from every bucket and make it disappear).
      const nm = displayName(item, items);
      setApproved((a) => ({ ...a, [item.item_id]: nm }));
      setOutcome((o) => ({ ...o, [item.item_id]: { kind: 'queued', text: `Approved → running as “${nm}” — see In progress` } }));
      return;
    }
    if (res.runnable === false || res.blocker) {     // NOT runnable → a NAMED gate; keep the card VISIBLE (never vanish)
      setOutcome((o) => ({ ...o, [item.item_id]: { kind: res.blocker || 'gated', text: res.reason || res.note || 'routed — no runnable recipe' } }));
      return;
    }
    if (res.resolved) { onResolved(item.item_id, res.new_status); return; }   // a real disposition transition (CLEARED/AT-GATE/…)
    setOutcome((o) => ({ ...o, [item.item_id]: { kind: 'error', text: 'no outcome from resolve' } }));
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
    const anyErr = comps.some(runErrored);           // a component threw — the card is NOT "done"
    const active = anyRunning || anyQueued;          // IN FLIGHT → no re-approve; done (incl. errored) stays re-runnable
    const erroredResurface = needsApproval(it, runsByRecipe) && (runsByRecipe[it.recipe_id] || []).some(runErrored);
    const isHeld = held[it.item_id];
    // DEF-017: a card whose tier is not runnable-now carries approve_enabled === false and
    // a named disabled_reason. Its Approve is disabled but ALWAYS says WHY inline — never a
    // bare, reasonless disable. runnable-now cards are unaffected (approve_enabled !== false).
    const notRunnable = it.approve_enabled === false;
    const gateReason = it.disabled_reason;
    const gateLabel = { 'needs-data': 'Needs data', 'needs-build': 'Needs build',
      'needs-broker': 'Needs broker' }[it.tier || it.blocker] || 'Not runnable';
    const oc = outcome[it.item_id];
    const justApproved = approved[it.item_id] && !active && !allDone;   // §2: transitioned, poll not caught up yet
    const name = displayName(it, items);
    return (
      <div key={it.item_id} className={`item slidein${anyRunning ? ' running' : ''}`}>
        <div className="row1">
          <span className={`kind ${KIND_CLASS[it.type] || 'k-reval'}`}>{it.kind}</span>
          {it.provenance === 'derived' && <span className="prov-badge prov-derived" title={`derived from ${it.derived_from || 'a concluded run'}`}>⌥ derived</span>}
          {it.provenance === 'combination' && <span className="prov-badge prov-combo" title={`combination · burns ${it.oos_window || 'a sealed OOS window'} (operator token required)`}>⋈ combine</span>}
          {typeof it.ev === 'number' && <span className="ev-chip mono" title="claim strength / EV">EV {it.ev.toFixed(2)}</span>}
          {anyRunning && <span className="run-badge running">RUNNING</span>}
          {!anyRunning && anyQueued && <span className="run-badge queued">QUEUED</span>}
          {allDone && (anyErr
            ? <span className="run-badge errored" title="a component run errored — not a completed result">ERRORED</span>
            : <span className="run-badge done">DONE</span>)}
          {isHeld && !active && <span className="run-badge held">HELD</span>}
          {justApproved && <span className="run-badge queued">QUEUED</span>}
          <span className="mono" style={{ color: 'var(--fg-3)', fontSize: 11, marginLeft: 'auto' }}>{it.age}</span>
          <button className="exp-mini" title="Export this item to MD"
                  onClick={() => downloadMd(`${it.item_id.replace(/[^a-z0-9]+/gi, '-')}.md`, name, renderMd(it))}>⤓ MD</button>
        </div>
        <div className="ttl">{name}</div>

        {comps.length > 0 ? (
          <div className="comp-states">
            {comps.map((c) => (
              <div key={c.recipe_id} className={`comp comp-${c.state}`} title={`${c.disposition || c.stage || c.state} — open run report`}
                   role="button" onClick={() => openRun(`${it.item_id}#${c.recipe_id}`)} style={{ cursor: 'pointer' }}>
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

        {erroredResurface && (
          <div className="approve-reason hint">{erroredReason(runsByRecipe[it.recipe_id])}</div>
        )}
        {/* WHY a disabled Approve is disabled — always inline, never silent (DEF-017) */}
        {notRunnable && gateReason && !active && (
          <div className="approve-reason gate-reason">⛔ {gateLabel} — {gateReason}</div>
        )}
        {/* the outcome of the last click on THIS card — a visible state change every time */}
        {oc && <div className={`approve-reason outcome-${oc.kind}`}>{oc.text}</div>}
        <div className="acts">
          <button className="b b-pri" disabled={busy === it.item_id || active || isHeld || notRunnable || justApproved}
                  title={notRunnable ? gateReason : undefined}
                  onClick={() => decide(it, 'approve')}>
            {busy === it.item_id ? 'Working…' : anyRunning ? 'Running…' : anyQueued || justApproved ? 'Queued'
              : notRunnable ? gateLabel : erroredResurface ? 'Approve' : allDone ? 'Re-run' : (PRIMARY_LABEL[it.type] || 'Approve')}</button>
          {(it.options || []).includes('hold') && !active
            && <button className="b b-sec" disabled={isHeld} onClick={() => decide(it, 'reject')}>{isHeld ? 'Held' : 'Hold'}</button>}
        </div>
      </div>
    );
  };

  // OPEN / CONCLUDED card — component chips (→ Run Room) + a de-emphasized (ghost)
  // Re-evaluate with its reason line (the recommended/primary Re-evaluate lives in the
  // attention section). Re-evaluate = re-judge stored results — no data fetched.
  const disposedCard = (it) => (
    <div key={it.item_id} className="item concluded-item">
      <div className="row1">
        <span className={`kind ${STATUS_CLASS[it.status] || ''}`}>{STATUS_WORD[it.status] || it.status}</span>
        <span className="mono" style={{ color: 'var(--fg-3)', fontSize: 11, marginLeft: 'auto' }}>{it.age}</span>
      </div>
      <div className="ttl">{it.title}</div>
      {it.components && typeof it.components === 'object' && (
        <div className="comp-states">
          {Object.entries(it.components).map(([rid, disp]) => (
            <div key={rid} className="comp comp-done" title={`${disp} — open Run report`}
                 role="button" onClick={() => openRun(`${it.item_id}#${rid}`)} style={{ cursor: 'pointer' }}>
              <span className="comp-name">{shortName(rid)}</span>
              <span className="comp-state">{String(disp).split(' ')[0]}</span>
            </div>
          ))}
        </div>
      )}
      <div className="rec">{it.disposition || '—'}</div>
      {(() => {
        // the Re-judge button renders ONLY when a re-judge could change something;
        // otherwise it's absent (not ghosted). Tooltip states the engine-known reason.
        const reason = rejudgeReason(surfaceOf(it.item_id), runs, lessons);
        if (!reason) return null;
        return (
          <>
            <div className="attn-reason">Re-judge stored results — no data fetched. {reason}.</div>
            <div className="acts">
              <button className="b b-ghost" disabled={busy === it.item_id || reevaluating[it.item_id]}
                      title={`Re-judge stored results (no data fetched) — ${reason}.`}
                      onClick={() => reevaluate(it)}>
                {reevaluating[it.item_id] ? 'Re-judging…' : '↻ Re-judge stored results'}</button>
            </div>
          </>
        );
      })()}
    </div>
  );

  // WAITING FOR DATA (DEF-018): a derived re-test whose paired data-accumulation watch
  // proves approving is futile — it renders the shortfall + revisit date, NEVER a live
  // Approve. Revives to approvable only when the watch's trigger fires.
  const waitCard = (it) => {
    const { until, reason } = waitInfo(it, watches, runsByRecipe);
    const when = until ? `revisit ${String(until).slice(0, 10)}` : 'revisit ≈ never on owned data';
    return (
      <div key={it.item_id} className="item wait-item">
        <div className="row1">
          <span className="kind k-wait">⏳ Waiting for data</span>
          {typeof it.ev === 'number' && <span className="ev-chip mono" title="claim strength / EV">EV {it.ev.toFixed(2)}</span>}
          <span className="mono" style={{ color: 'var(--fg-3)', fontSize: 11, marginLeft: 'auto' }}>{it.age}</span>
        </div>
        <div className="ttl">{it.title}</div>
        <div className="approve-reason gate-reason">⏳ {reason} — {when}</div>
        {it.subsumed_by && <div className="attn-reason">Subsumed by a wider-window run — see its report ({String(it.subsumed_by).replace(/^D:|#.*$/g, '')}).</div>}
        <div className="acts">
          <button className="b b-pri" disabled title={reason}>Waiting for data</button>
        </div>
      </div>
    );
  };

  // dispatch a single item to the right renderer by its live state
  const renderOne = (it) => (waits(it) ? waitCard(it)
    : (OPEN_STATES.includes(it.status) || CONCLUDED_STATES.includes(it.status)) && !needsApproval(it, runsByRecipe, watches)
      ? disposedCard(it) : card(it));

  // FAMILY CARD: derived siblings under one header — the top 1–2 render in full, the rest
  // fold as a ranked list (name · ev · state). Declutters a wall of near-duplicate probes.
  const famStateWord = (m) => (waits(m) ? '⏳ waiting'
    : CONCLUDED_STATES.includes(m.status) || m.disposition ? 'concluded'
      : m.approve_enabled ? 'runnable' : (m.tier || 'surfaced'));
  const familyCard = (fam) => (
    <div key={`fam-${fam.key}`} className="tier-group family-group">
      <div className="tier-band tb-family">
        <span className="tb-label">⛓ {fam.from} DERIVATIONS</span>
        <span className="tb-note">derived siblings — top {fam.top.length} shown, {fam.rest.length} folded</span>
        <span className="tb-count mono">{fam.members.length}</span>
      </div>
      {fam.top.map(renderOne)}
      {fam.rest.length > 0 && (
        <div className="fam-rest">
          <button className="b b-ghost fam-toggle" onClick={() => setOpenFam((o) => ({ ...o, [fam.key]: !o[fam.key] }))}>
            {openFam[fam.key] ? '▾ hide' : `▸ ${fam.rest.length} more (ranked)`}</button>
          {openFam[fam.key]
            ? fam.rest.map(renderOne)
            : <ol className="fam-ranked">{fam.rest.map((m) => (
                <li key={m.item_id}><button className="ip-link" onClick={() => openRun(m.item_id)}>{displayName(m, items)}</button>
                  <span className="ev-chip mono">EV {typeof m.ev === 'number' ? m.ev.toFixed(2) : '—'}</span>
                  <span className="fam-state">{famStateWord(m)}</span></li>))}</ol>}
        </div>
      )}
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
        {families.map(familyCard)}
        {waiting.length > 0 && (
          <div className="tier-group">
            <div className="tier-band tb-wait">
              <span className="tb-label">WAITING FOR DATA</span>
              <span className="tb-note">data-bound — approving can't help until more data accrues</span>
              <span className="tb-count mono">{waiting.length}</span>
            </div>
            {waiting.map(waitCard)}
          </div>
        )}
        {openItems.length > 0 && (
          <div className="tier-group">
            <div className="tier-band tb-open">
              <span className="tb-label">OPEN</span>
              <span className="tb-note">partially tested — awaiting re-tests / decisions</span>
              <span className="tb-count mono">{openItems.length}</span>
            </div>
            {openItems.map(disposedCard)}
          </div>
        )}
        <div className="tier-group">
          <div className="tier-band tb-concluded">
            <span className="tb-label">CONCLUDED</span>
            <span className="tb-note">fully disposed</span>
            <span className="tb-count mono">{concluded.length}</span>
          </div>
          {concluded.length === 0
            ? <div className="item" style={{ color: 'var(--fg-3)', fontSize: 12 }}>None fully disposed yet.</div>
            : concluded.map(disposedCard)}
        </div>
      </div>
    </>
  );
}
