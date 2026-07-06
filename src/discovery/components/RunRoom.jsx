// THE RUN ROOM — every run (probe / component / re-terminus) opens here: header,
// live stage timeline, and the composed TERMINUS REPORT (the engine's voice). The
// operator reads the engine's conclusions here; Bank/Reject the lesson inline where
// the context is. Read + intent only — no graph write.
import { useState, useEffect } from 'react';
import { composeReport, reportToMd, versionDiff, heartbeatAge, subProgress, isStalled, displayName, startedBy, originKey, debriefSuggestions } from '../runs.js';
import { downloadMd } from '../mdExport.js';
import ActionButton from './ActionButton.jsx';

const STATUS = (s) => (s || 'unknown').toUpperCase();
const VOICES = [['reporter', 'Reporter — what happened'], ['strategist', 'Strategist — where this goes'],
                ['skeptic', 'Skeptic — what’s suspicious'], ['prospector', 'Prospector — what’s glinting']];
// the SPARKS:/GLINTS: block renders as distinct buttons — strip it from the body so it
// is not shown twice.
const stripBlock = (text, marker) => {
  const i = (text || '').search(new RegExp(`\\*{0,2}${marker}`, 'i'));
  return i < 0 ? (text || '') : text.slice(0, i).trim();
};

export default function RunRoom({ run, slices, onClose, onBank, onUnbank, onReject, onReevaluate, onCancel, runBusy, contract, onExplore }) {
  // DEF-020: the debrief now AUTO-ATTACHES at terminus — initialize from the run node so
  // the four voices show without a click; the button remains as a manual refresh.
  const [db, setDb] = useState(run.debrief || null);
  const [dbBusy, setDbBusy] = useState(false);
  // DEF-024: a debrief must quote the run it's attached to. The parent keys RunRoom by
  // run.item_id (remount per run); this effect is the belt-and-suspenders — if the same
  // instance is ever reused for a different run, the debrief resets to THAT run's, never
  // showing a prior run's voices.
  useEffect(() => { setDb(run.debrief || null); }, [run.item_id]);
  const [spawned, setSpawned] = useState({});        // ask key -> {item_id, tier} (card this debrief spawned)
  const [sgBusy, setSgBusy] = useState(null);
  if (!run) return null;
  const isRunning = String(run.status).toLowerCase() === 'running';
  const report = composeReport(run, slices || {});
  const steps = run.progress || [];
  const cur = run.stage;
  const res = report.result;
  const c = report.classification;
  const errored = res.errored;   // the run threw (e.g. FeedUnavailable) — no gate, no class
  // a re-judge (RETERMINUS) is not a probe — different title, subtitle, and report body
  const rres = run.result || {};
  const isRJ = run.recipe_id === 'RETERMINUS' || run.kind === 'reterminus';
  const rjTarget = String(rres.target || '').split(':').pop() || String(run.title || '').replace(/^Re-?evaluate\s*/i, '');
  // §1: the run report title is the SAME canonical name as the card that was approved.
  const canonical = displayName(run, (slices && slices.board) || []);
  const title = isRJ ? `Re-judge · ${rjTarget}` : canonical;
  const subtitle = isRJ ? 'Re-judge stored results — no data fetched'
    : `${res.window} · ${res.universe} names · triggered by Approve`;
  const concluded = String(run.status).toLowerCase() === 'done' && !isRunning;
  // §2: the lineage chain — card → approved → run → disposition → lesson — so one glance
  // answers "is this the thing I clicked?". Read-only (composed from the run + slices).
  const lineageLesson = (report.lessons && report.lessons[0]) || null;
  const lineage = [
    `card: ${canonical}`,
    `approved → ran as ${run.recipe_id || run.item_id}`,
    concluded ? `→ ${res.errored ? 'errored' : (res.disposition || '—')}` : '→ in progress',
    lineageLesson ? `→ lesson [${lineageLesson.status}]` : null,
  ].filter(Boolean).join('  ');

  async function genDebrief() {
    if (!contract?.debrief) return;
    setDbBusy(true);
    try { setDb(await contract.debrief(run.item_id || run.recipe_id)); }
    catch { setDb({ unavailable: [{ voice: '*', reason: 'debrief request failed' }] }); }
    finally { setDbBusy(false); }
  }

  return (
    <div className="rr-backdrop" onClick={onClose}>
      <div className="rr" onClick={(e) => e.stopPropagation()}>
        <div className="rr-head">
          <div>
            <div className="rr-title mono">{title}</div>
            <div className="rr-sub">
              <span className={`origin-chip origin-${originKey(run)}`} title="who pressed go — a recorded fact (DEF-019)">Started by: {startedBy(run)}</span>
              {' · '}{subtitle}
            </div>
            {!isRJ && <div className="rr-lineage mono" title="card → approved → run → disposition → lesson">{lineage}</div>}
          </div>
          <span className={`rr-badge ${errored ? 'error' : isStalled(run) ? 'stalled' : String(run.status).toLowerCase()}`}>{errored ? 'ERROR' : isStalled(run) ? 'STALLED' : STATUS(run.status)}</span>
          {isRunning && onCancel && (
            <ActionButton className="b b-sec" busyLabel="Cancelling…"
                          confirm="Cancel this running probe? It will be errored (cancelled by operator), the lock released, and the item re-approvable."
                          onAct={() => onCancel(run.item_id)}>Cancel run</ActionButton>
          )}
          {run.parent && onReevaluate && String(run.status).toLowerCase() === 'done' && !isRJ && !errored && (
            <button className="b b-ghost" disabled={runBusy}
                    title={runBusy ? 'a run is active — one at a time' : 'Re-judge stored results — no data fetched'}
                    onClick={() => onReevaluate(run.parent)}>↻ Re-judge stored results</button>
          )}
          <button className="rr-x" onClick={onClose} aria-label="close">✕</button>
        </div>

        <div className="rr-body">
          {/* STAGE TIMELINE (vertical, live) */}
          <div className="rr-stages">
            <h4>Stages</h4>
            {isRunning && (heartbeatAge(run) != null || subProgress(run)) && (
              <div className={`rr-heartbeat mono${isStalled(run) ? ' stalled' : ''}`}>
                {subProgress(run) && <span>{subProgress(run)}</span>}
                {heartbeatAge(run) != null && <span> · {heartbeatAge(run)}s since last heartbeat</span>}
                {isStalled(run) && <span className="rr-stall"> · STALLED</span>}
              </div>
            )}
            <ol>
              {steps.length === 0 && <li className="hint">No stages recorded yet.</li>}
              {steps.map((s, i) => (
                <li key={i} className={`rr-stage ${s.stage === cur ? 'active' : 'done'}`}>
                  <span className="rr-dot" />
                  <span className="rr-sname">{s.stage}</span>
                  <span className="rr-sdetail mono">{s.detail}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* THE RUN REPORT */}
          <div className="rr-report">
            <div className="rr-report-head">
              <h4>Run report</h4>
              <button className="exp-mini" onClick={() => downloadMd(`${(run.recipe_id || 'run')}-report.md`, 'Run report', reportToMd(run, report, canonical))}>⤓ MD</button>
            </div>

            {/* RE-JUDGE report (no gate, no edge/t/n — it re-judged stored numbers) */}
            {isRJ && (
              <div className="rr-rejudge">
                <div className="rr-block">
                  <div className="rr-blabel">What was re-judged</div>
                  <div className="rr-disp">{rjTarget} · {rres.reevaluated || 0} component{(rres.reevaluated || 0) !== 1 ? 's' : ''} re-applied to the stored numbers — no data fetched.</div>
                </div>
                <div className="rr-block">
                  <div className="rr-blabel">Flips (before → after)</div>
                  {(rres.flips || []).length === 0
                    ? <div className="hint">No dispositions changed this pass.</div>
                    : (rres.flips || []).map((f, i) => (
                        <div key={i} className="rr-deriv"><span className="rr-dtitle mono">{f.recipe_id}</span>
                          <span className="mono">{f.from} → <b>{f.to}</b></span></div>))}
                </div>
                {rres.kills_retracted != null && (
                  <div className="rr-block"><div className="rr-blabel">Kills retracted</div>
                    <div className="rr-disp mono">{rres.kills_retracted}</div></div>
                )}
                <div className="rr-block"><div className="rr-blabel">Result</div>
                  <div className="rr-disp">{rres.note || 'reevaluated'}</div></div>
              </div>
            )}

            {!isRJ && (<>
            {/* 1. Result — or, if the run ERRORED, the verbatim error (no gate reached) */}
            <div className="rr-block">
              <div className="rr-blabel">1 · Result</div>
              {errored ? (
                <div className="rr-errbox">
                  <div className="rr-errmsg mono">{res.error || 'run errored'}</div>
                  <div className="rr-disp">errored — no gate was evaluated</div>
                </div>
              ) : (<>
                <div className="rr-nums mono">
                  <span>edge {res.edge}%/day</span><span>t {res.t}</span><span>n {res.n}</span>
                  <span className={`rr-gate ${res.gate_pass ? 'pass' : 'belowgate'}`}>gate {res.gate_pass ? 'PASS' : 'below gate'}</span>
                </div>
                <div className="rr-disp">{res.disposition}</div>
              </>)}
            </div>

            {/* 2. Classification (verbatim) — or "not classified" when the run errored */}
            {errored ? (
              <div className="rr-block">
                <div className="rr-blabel">2 · Classification</div>
                <div className="rr-class">not classified — run errored</div>
                <div className="rr-mech">no result was produced, so nothing was classified.</div>
              </div>
            ) : (
            <div className="rr-block">
              <div className="rr-blabel">2 · Classification
                <span className={`rr-prov ${c.by === 'llm' ? 'llm' : 'heur'}`}>
                  {c.by === 'llm' ? 'LLM via proxy' : c.provisional ? 'heuristic · provisional' : 'heuristic'}</span>
              </div>
              <div className="rr-class">{c.class}</div>
              <div className="rr-mech">{c.mechanism}</div>
              {c.revival && <div className="rr-revival"><b>revival:</b> {c.revival}</div>}
            </div>
            )}

            {/* 3. Lessons — Bank / Reject inline */}
            <div className="rr-block">
              <div className="rr-blabel">3 · Lessons proposed</div>
              {report.lessons.length === 0 && <div className="hint">none for this run</div>}
              {report.lessons.map((l) => (
                <div key={l.id} className={`rr-lesson ${String(l.status).toLowerCase()}`}>
                  <span className={`lesson-badge ${String(l.status).toLowerCase()}`}>{l.status}</span>
                  {l.provisional && <span className="lesson-badge prov" title="Heuristic draft — Re-evaluate with the LLM to make it bankable">PROVISIONAL</span>}
                  <span className="rr-ltext">{l.text}</span>
                  {l.status === 'PROPOSED' && (
                    <span className="rr-lacts">
                      {/* provisional → NO Bank button; only LLM-drafted lessons are bankable */}
                      {!l.provisional
                        ? <ActionButton className="b b-pri" busyLabel="Banking…" onAct={() => onBank && onBank(l.id)}>Bank</ActionButton>
                        : <span className="lesson-note">Re-evaluate to enable Bank</span>}
                      <ActionButton className="b b-sec" busyLabel="Rejecting…" onAct={() => onReject && onReject(l.id)}>Reject</ActionButton>
                    </span>
                  )}
                  {l.status === 'BANKED' && (
                    <span className="rr-lacts">
                      <ActionButton className="b b-sec" busyLabel="Unbanking…" title="Retract from the grounding pack (history kept)"
                                    onAct={() => onUnbank && onUnbank(l.id)}>Unbank</ActionButton>
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* 4. Derivations */}
            <div className="rr-block">
              <div className="rr-blabel">4 · Derivations</div>
              {report.derivations.length === 0 && <div className="hint">none</div>}
              {report.derivations.map((d) => (
                <div key={d.item_id} className="rr-deriv">
                  <span className="rr-dtitle">{d.title}</span>
                  <span className="ev-chip mono">EV {typeof d.ev === 'number' ? d.ev.toFixed(2) : d.ev}</span>
                  <span className="rr-dblock mono">{d.blocker}</span>
                </div>
              ))}
            </div>

            {/* CANDIDATE PIPELINE — the survivor lifecycle (S1 validity … S6 OOS) */}
            {(() => {
              const cand = (slices?.candidates || []).find((c) => c.run_id === run.item_id);
              if (!cand) return null;
              return (
                <div className="rr-block rr-pipeline">
                  <div className="rr-blabel">Candidate pipeline <span className="rr-pipe-prog mono">{cand.progress}</span></div>
                  {(cand.stages || []).map((s) => (
                    <div key={s.id} className={`rr-stage-row pl-${s.status}`}>
                      <span className="pl-id mono">{s.id}</span>
                      <span className="pl-name">{s.name}</span>
                      <span className={`pl-status ${s.status}`}>{s.status}</span>
                      <span className="pl-note">{(s.output && (s.output.note || (s.output.flags || []).join('; ') || s.output.verdict)) || ''}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* 5. Combination */}
            <div className="rr-block">
              <div className="rr-blabel">5 · Combination</div>
              {report.combination
                ? (report.combination.legs
                    ? <div className="rr-combo">partner {JSON.stringify(report.combination.legs)} · ρ {report.combination.rho} · burns <b>{report.combination.oos_window}</b> (Approve = the spend)</div>
                    : <div className="rr-combo mono">{report.combination.partners.map((p) => `${p.from}↔${p.to} ρ${p.rho}`).join('  ')}</div>)
                : <div className="hint">no valid partner</div>}
            </div>

            {/* Version history + diff (correction history) — plain-English tags */}
            {report.versions.length > 1 && (
              <div className="rr-block rr-versions">
                <div className="rr-blabel">Correction history</div>
                {report.versions.map((v, i) => (
                  <div key={i} className="rr-ver">
                    <span className="rr-vtag">draft {v.version}</span>
                    <span className={`rr-prov ${v.classified_by === 'llm' ? 'llm' : 'heur'}`}>written by the {v.classified_by === 'llm' ? 'LLM' : 'heuristic'}</span>
                    <span className="mono">{v.classification} · {v.disposition}</span>
                    {i > 0 && <span className="rr-diff">{versionDiff(report.versions[i - 1], v).join(' · ') || 'no change'}</span>}
                  </div>
                ))}
              </div>
            )}
            </>)}

            {/* OPERATOR DEBRIEF — four plain-English voices; sparks/glints pre-fill the analyst */}
            {concluded && (
              <div className="rr-block rr-debrief">
                <div className="rr-report-head">
                  <div className="rr-blabel">Debrief — the engine explains itself</div>
                  {!db && <button className="b b-sec" disabled={dbBusy || !contract?.debrief}
                                  onClick={genDebrief}>{dbBusy ? 'Composing…' : '🗣 Debrief this'}</button>}
                </div>
                {db && (db.unavailable && db.unavailable.some((u) => u.voice === '*')
                  ? <div className="hint">debrief unavailable — {db.unavailable[0].reason}</div>
                  : <div className="rr-voices">
                      {VOICES.map(([k, label]) => (
                        <div key={k} className={`rr-voice v-${k}`}>
                          <div className="rr-vhead">{label}</div>
                          <div className="rr-vtext">{(k === 'skeptic' ? stripBlock(db[k], 'SPARKS:')
                            : k === 'prospector' ? stripBlock(db[k], 'GLINTS:') : db[k]) || '(missing)'}</div>
                          {k === 'skeptic' && (db.sparks || []).map((s, i) => (
                            <button key={i} className="rr-spark" title="Explore this in the analyst"
                                    onClick={() => onExplore?.(run.item_id, run.recipe_id || 'run', s)}>✦ {s}</button>
                          ))}
                          {k === 'prospector' && (db.glints || []).map((g, i) => (
                            <button key={i} className="rr-glint" title="Explore this in the analyst"
                                    onClick={() => onExplore?.(run.item_id, run.recipe_id || 'run', g)}>⛏ {g}</button>
                          ))}
                        </div>
                      ))}
                      {db.cost && <div className="rr-dbcost mono">{db.cost.passes} passes · ~{db.cost.approx_input_tokens + db.cost.approx_output_tokens} tokens</div>}
                      {/* DEBRIEF-TO-CARD: each actionable claim → a PROPOSAL card via the constructor.
                          Converging asks share ONE button (no twins); Strategist's ask leads;
                          buttons NEVER enqueue — a proposal the operator gates. */}
                      {(() => {
                        const sugg = debriefSuggestions(db, { run, board: slices?.board || [] });
                        if (!sugg.length) return null;
                        return (
                          <div className="rr-suggest">
                            <div className="rr-vhead">Turn a claim into a card <span className="hint">— proposal only, never runs</span></div>
                            {sugg.map((sg) => {
                              const st = spawned[sg.key];
                              const done = st || (sg.spawnedItemId ? { item_id: sg.spawnedItemId } : null);
                              const voices = [...new Set(sg.asks.map((a) => a.voice))].join('+');
                              return (
                                <div key={sg.key} className={`rr-sg${sg.lead ? ' lead' : ''}`}>
                                  <span className="rr-sg-voices mono">{voices}{sg.lead ? ' · lead' : ''}</span>
                                  <span className="rr-sg-text">{sg.title}</span>
                                  {done
                                    ? <span className="rr-sg-done">✓ card {String(done.item_id).replace(/^D:/, '')}{st?.tier ? ` · ${st.tier}` : ''}</span>
                                    : <button className="b b-sec rr-sg-btn" disabled={sgBusy === sg.key}
                                              onClick={async () => {
                                                setSgBusy(sg.key);
                                                const r = await contract.createCard?.({ run_id: run.item_id, target_key: sg.key,
                                                  title: sg.title, asks: sg.asks, tier_hint: sg.tier_hint, recipe_ref: sg.recipe_ref });
                                                setSgBusy(null);
                                                if (r && (r.created || r.duplicate)) setSpawned((s) => ({ ...s, [sg.key]: { item_id: r.item_id, tier: r.tier } }));
                                              }}>{sgBusy === sg.key ? 'Creating…' : '＋ Create card'}</button>}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
