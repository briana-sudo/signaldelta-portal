// In-progress view — the currently-running probe with its stage-by-stage progress,
// the queue in order, and recent finished runs. Reads the live run state (from 7688
// via /sm/probe/status), so a refresh survives. Read-only.
const STAGES = ['queued', 'validating recipe', 'fetching data', 'building signal', 'computing', 'power-gate', 'result'];

const isReterminus = (run) => run && (run.kind === 'reterminus' || run.recipe_id === 'RETERMINUS'
  || /re-evaluate/i.test(run.title || ''));

// lesson provenance as plain English ("draft 3 · written by the LLM"), not "v3 · llm"
function lessonProvenance(l) {
  const by = l.classified_by === 'llm' ? 'the LLM' : l.classified_by === 'heuristic' ? 'the heuristic' : null;
  if (l.version && by) return `draft ${l.version} · written by ${by}`;
  const m = String(l.source || '').match(/v(\d+)\s*·\s*(llm|heuristic)/i);
  if (m) return `draft ${m[1]} · written by the ${m[2].toLowerCase() === 'llm' ? 'LLM' : 'heuristic'}`;
  return l.source || '';
}

// one-line verdict for a re-judge (no gate, no edge/t/n) from its stored result
function rejudgeSummary(r) {
  const flips = (r.flips || []).length;
  const parts = [`${flips} flip${flips !== 1 ? 's' : ''}`];
  if (r.kills_retracted != null) parts.push(`${r.kills_retracted} kill${r.kills_retracted !== 1 ? 's' : ''} retracted`);
  if (r.derived != null) parts.push(`${r.derived} derived`);
  parts.push(`${r.reevaluated || 0} component${(r.reevaluated || 0) !== 1 ? 's' : ''} re-judged`);
  return parts.join(' · ');
}

// RE-TERMINUS (and any non-probe job) streams its OWN stages — render them straight
// from the run's steps, in order, with the current stage active.
function GenericStages({ run }) {
  const steps = run.steps || [];
  const cur = run.stage;
  const seen = steps.map((s) => s.stage);
  const list = seen.includes(cur) ? seen : [...seen, cur];
  return (
    <ol className="ip-stages">
      {list.filter(Boolean).map((st, i) => {
        const detail = steps.find((s) => s.stage === st)?.detail || '';
        const state = st === cur ? 'active' : i < list.indexOf(cur) || cur === 'result' ? 'done' : 'todo';
        return (
          <li key={`${st}-${i}`} className={`ip-stage ${state}`}>
            <span className="ip-dot" />
            <span className="ip-sname">{st}</span>
            <span className="ip-sdetail mono">{detail}</span>
          </li>
        );
      })}
    </ol>
  );
}

function StageList({ run }) {
  if (isReterminus(run)) return <GenericStages run={run} />;
  const done = new Set((run.steps || []).map((s) => s.stage));
  const detailOf = (st) => (run.steps || []).find((s) => s.stage === st)?.detail || '';
  const curIdx = STAGES.indexOf(run.stage);
  return (
    <ol className="ip-stages">
      {STAGES.map((st, i) => {
        const state = done.has(st) || i < curIdx ? 'done' : st === run.stage ? 'active' : 'todo';
        return (
          <li key={st} className={`ip-stage ${state}`}>
            <span className="ip-dot" />
            <span className="ip-sname">{st}</span>
            <span className="ip-sdetail mono">{detailOf(st)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function InProgress({ probe, lessons = [], onBank, onUnbank, onReject, onOpenRun, attention = [], onAttentionAction }) {
  const running = probe?.running || null;
  const queue = probe?.queue || [];
  const done = probe?.done || [];
  const open = (id) => onOpenRun && onOpenRun(id);
  const proposed = lessons.filter((l) => l.status === 'PROPOSED');
  const banked = lessons.filter((l) => l.status === 'BANKED');
  const superseded = lessons.filter((l) => l.status === 'SUPERSEDED');
  const retracted = lessons.filter((l) => l.status === 'RETRACTED');
  // only LLM-drafted (non-provisional) lessons are bankable; heuristic drafts are
  // provisional and Bank is disabled until a Re-evaluate re-drafts them with the LLM.
  const bankable = (l) => !l.provisional;

  return (
    <>
      <div className="stage-head">
        <div><h1>In progress</h1>
          <div className="sub">Approved probes run here, one at a time — live stages, the queue, and finished results.</div></div>
      </div>

      {/* NEEDS YOUR ATTENTION — every recommended action WITH its reason from live state */}
      <div className="datastrip attention">
        <h3>Needs your attention <span className="count mono">{attention.filter((a) => a.action).length}</span></h3>
        {attention.length === 0 && <div className="attn-empty">Nothing needs you.</div>}
        {attention.map((a, i) => (
          <div key={i} className={`attn attn-${a.kind}`}>
            <div className="attn-main">
              <span className="attn-title">{a.title}</span>
              <span className="attn-reason">{a.reason}</span>
            </div>
            {a.action && <button className="b b-pri" onClick={() => onAttentionAction && onAttentionAction(a)}>{a.action}</button>}
          </div>
        ))}
      </div>

      <div className="datastrip">
        <h3>Running now</h3>
        {running ? (
          <div className="ip-run">
            <div className="ip-head">
              <span className="src">{running.title || running.recipe_id}</span>
              <span className="ip-badge running">RUNNING</span>
              <span className="mono ip-stagenow">{running.stage}</span>
              <button className="exp-mini" style={{ marginLeft: 'auto' }} onClick={() => open(running.item_id)}>Open run report →</button>
            </div>
            <StageList run={running} />
          </div>
        ) : <div className="hint">Nothing running. Approve a runnable-now probe on the Board to start one.</div>}
      </div>

      <div className="datastrip">
        <h3>Queue <span className="count mono">{queue.length}</span></h3>
        <div className="cap">Approved and waiting — starts when the current run finishes (one at a time).</div>
        {queue.length ? (
          <ol className="ip-queue">
            {queue.map((q, i) => (
              <li key={q.item_id}><span className="ip-qn mono">{i + 1}</span>
                <button className="ip-link" onClick={() => open(q.item_id)}>{q.title || q.recipe_id}</button>
                <span className="ip-badge queued">QUEUED</span></li>
            ))}
          </ol>
        ) : <div className="hint">Queue empty.</div>}
      </div>

      <div className="datastrip">
        <h3>Recent — what the engine did <span className="count mono">{done.length}</span></h3>
        <div className="cap">Concluded runs, one-line verdicts. Click any to open its run report.</div>
        {done.length ? (
          <table className="dtable">
            <thead><tr><th>Run</th><th>Edge/day</th><th>t</th><th>n</th><th>Gate</th><th>Disposition</th></tr></thead>
            <tbody>
              {done.map((d) => {
                const r = d.result || {};
                // a re-judge has NO gate — no edge/t/n, no FAIL badge (that badge would lie)
                if (d.recipe_id === 'RETERMINUS' || d.kind === 'reterminus') {
                  const surface = String(r.target || '').split(':').pop() || String(d.title || '').replace(/^Re-?evaluate\s*/i, '');
                  return (
                    <tr key={d.item_id} className="rj-row">
                      <td className="src"><button className="ip-link" onClick={() => open(d.item_id)}>Re-judge · {surface}</button></td>
                      <td className="hint" colSpan={4}>{rejudgeSummary(r)}</td>
                      <td><span className="ip-badge rejudge">re-judged</span></td>
                    </tr>
                  );
                }
                return (
                  <tr key={d.item_id}>
                    <td className="src"><button className="ip-link" onClick={() => open(d.item_id)}>{d.title || d.recipe_id}</button></td>
                    <td className="mono">{r.edge_pct_per_day != null ? `${r.edge_pct_per_day}%` : '—'}</td>
                    <td className="mono">{r.t ?? '—'}</td>
                    <td className="mono">{r.n ?? '—'}</td>
                    <td><span className={`ip-badge ${r.gate_pass ? 'pass' : 'fail'}`}>{r.error ? 'ERR' : r.gate_pass ? 'PASS' : 'FAIL'}</span></td>
                    <td>{r.error ? <span className="hint">{r.error}</span> : (d.disposition || r.disposition || '—')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <div className="hint">No finished runs yet.</div>}
      </div>

      {/* GATED LEARNING — lessons proposed on run conclusion; only your Bank banks them */}
      <div className="datastrip">
        <h3>Lessons <span className="count mono">{proposed.length} proposed · {banked.length} banked</span></h3>
        <div className="cap">The analyst proposes a lesson; only your <b>Bank</b> writes it (loads into every future ask). Reject discards it.</div>
        {proposed.length === 0 && banked.length === 0 && <div className="hint">No lessons yet.</div>}
        {proposed.map((l) => (
          <div key={l.id} className="lesson proposed">
            <div className="lesson-head"><span className="lesson-badge proposed">PROPOSED</span>
              {l.provisional && <span className="lesson-badge prov" title="Heuristic draft — Re-evaluate with the LLM to make it bankable">PROVISIONAL</span>}
              {l.source && <span className="lesson-src">{lessonProvenance(l)}</span>}</div>
            <div className="lesson-text">{l.text}</div>
            <div className="acts">
              {/* provisional (heuristic) → NO Bank button at all; only LLM-drafted lessons are bankable */}
              {bankable(l)
                ? <button className="b b-pri" onClick={() => onBank && onBank(l.id)}>Bank</button>
                : <span className="lesson-note">heuristic draft — Re-evaluate to enable Bank</span>}
              <button className="b b-sec" onClick={() => onReject && onReject(l.id)}>Reject</button>
            </div>
          </div>
        ))}
        {banked.map((l) => (
          <div key={l.id} className="lesson banked">
            <div className="lesson-head"><span className="lesson-badge banked">BANKED</span>
              {l.source && <span className="lesson-src">{lessonProvenance(l)}</span>}</div>
            <div className="lesson-text">{l.text}</div>
            <div className="acts">
              <button className="b b-sec" title="Retract from the grounding pack (history kept)"
                      onClick={() => onUnbank && onUnbank(l.id)}>Unbank</button>
            </div>
          </div>
        ))}
        {superseded.map((l) => (
          <div key={l.id} className="lesson superseded">
            <div className="lesson-head"><span className="lesson-badge superseded">SUPERSEDED</span>
              {l.source && <span className="lesson-src">{lessonProvenance(l)}</span>}</div>
            <div className="lesson-text">{l.text}</div>
          </div>
        ))}
        {retracted.map((l) => (
          <div key={l.id} className="lesson superseded">
            <div className="lesson-head"><span className="lesson-badge superseded">RETRACTED</span>
              {l.source && <span className="lesson-src">{lessonProvenance(l)}</span>}</div>
            <div className="lesson-text">{l.text}</div>
          </div>
        ))}
      </div>
    </>
  );
}
