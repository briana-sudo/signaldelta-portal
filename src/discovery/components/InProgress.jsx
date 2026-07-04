// In-progress view — the currently-running probe with its stage-by-stage progress,
// the queue in order, and recent finished runs. Reads the live run state (from 7688
// via /sm/probe/status), so a refresh survives. Read-only.
const STAGES = ['queued', 'validating recipe', 'fetching data', 'building signal', 'computing', 'power-gate', 'result'];

function StageList({ run }) {
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

export default function InProgress({ probe }) {
  const running = probe?.running || null;
  const queue = probe?.queue || [];
  const done = probe?.done || [];

  return (
    <>
      <div className="stage-head">
        <div><h1>In progress</h1>
          <div className="sub">Approved probes run here, one at a time — live stages, the queue, and finished results.</div></div>
      </div>

      <div className="datastrip">
        <h3>Running now</h3>
        {running ? (
          <div className="ip-run">
            <div className="ip-head">
              <span className="src">{running.title || running.recipe_id}</span>
              <span className="ip-badge running">RUNNING</span>
              <span className="mono ip-stagenow">{running.stage}</span>
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
              <li key={q.item_id}><span className="ip-qn mono">{i + 1}</span>{q.title || q.recipe_id}<span className="ip-badge queued">QUEUED</span></li>
            ))}
          </ol>
        ) : <div className="hint">Queue empty.</div>}
      </div>

      <div className="datastrip">
        <h3>Recent results <span className="count mono">{done.length}</span></h3>
        {done.length ? (
          <table className="dtable">
            <thead><tr><th>Probe</th><th>Edge/day</th><th>t</th><th>n</th><th>Gate</th><th>Disposition</th></tr></thead>
            <tbody>
              {done.map((d) => {
                const r = d.result || {};
                return (
                  <tr key={d.item_id}>
                    <td className="src">{d.title || d.recipe_id}</td>
                    <td className="mono">{r.edge_pct_per_day != null ? `${r.edge_pct_per_day}%` : '—'}</td>
                    <td className="mono">{r.t ?? '—'}</td>
                    <td className="mono">{r.n ?? '—'}</td>
                    <td><span className={`ip-badge ${r.gate_pass ? 'pass' : 'fail'}`}>{r.gate_pass ? 'PASS' : 'FAIL'}</span></td>
                    <td>{d.disposition || r.disposition || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <div className="hint">No finished runs yet.</div>}
      </div>
    </>
  );
}
