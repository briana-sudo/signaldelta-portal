// THE RUN ROOM — every run (probe / component / re-terminus) opens here: header,
// live stage timeline, and the composed TERMINUS REPORT (the engine's voice). The
// operator reads the engine's conclusions here; Bank/Reject the lesson inline where
// the context is. Read + intent only — no graph write.
import { composeReport, reportToMd, versionDiff } from '../runs.js';
import { downloadMd } from '../mdExport.js';

const STATUS = (s) => (s || 'unknown').toUpperCase();

export default function RunRoom({ run, slices, onClose, onBank, onReject }) {
  if (!run) return null;
  const report = composeReport(run, slices || {});
  const steps = run.progress || [];
  const cur = run.stage;
  const triggered = run.kind === 'reterminus' ? 'Re-evaluate' : 'Approve';
  const res = report.result;
  const c = report.classification;

  return (
    <div className="rr-backdrop" onClick={onClose}>
      <div className="rr" onClick={(e) => e.stopPropagation()}>
        <div className="rr-head">
          <div>
            <div className="rr-title mono">{run.recipe_id || run.item_id}</div>
            <div className="rr-sub">
              {res.window} · {res.universe} names · triggered by {triggered}
            </div>
          </div>
          <span className={`rr-badge ${String(run.status).toLowerCase()}`}>{STATUS(run.status)}</span>
          <button className="rr-x" onClick={onClose} aria-label="close">✕</button>
        </div>

        <div className="rr-body">
          {/* STAGE TIMELINE (vertical, live) */}
          <div className="rr-stages">
            <h4>Stages</h4>
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

          {/* THE TERMINUS REPORT */}
          <div className="rr-report">
            <div className="rr-report-head">
              <h4>Terminus report</h4>
              <button className="exp-mini" onClick={() => downloadMd(`${(run.recipe_id || 'run')}-report.md`, 'Terminus report', reportToMd(run, report))}>⤓ MD</button>
            </div>

            {/* 1. Result */}
            <div className="rr-block">
              <div className="rr-blabel">1 · Result</div>
              <div className="rr-nums mono">
                <span>edge {res.edge}%/day</span><span>t {res.t}</span><span>n {res.n}</span>
                <span className={`rr-gate ${res.gate_pass ? 'pass' : 'fail'}`}>gate {res.gate_pass ? 'PASS' : 'FAIL'}</span>
              </div>
              <div className="rr-disp">{res.disposition}</div>
            </div>

            {/* 2. Classification (verbatim) */}
            <div className="rr-block">
              <div className="rr-blabel">2 · Classification
                <span className={`rr-prov ${c.by === 'llm' ? 'llm' : 'heur'}`}>
                  {c.by === 'llm' ? 'LLM via proxy' : c.provisional ? 'heuristic · provisional' : 'heuristic'}</span>
              </div>
              <div className="rr-class">{c.class}</div>
              <div className="rr-mech">{c.mechanism}</div>
              {c.revival && <div className="rr-revival"><b>revival:</b> {c.revival}</div>}
            </div>

            {/* 3. Lessons — Bank / Reject inline */}
            <div className="rr-block">
              <div className="rr-blabel">3 · Lessons proposed</div>
              {report.lessons.length === 0 && <div className="hint">none for this run</div>}
              {report.lessons.map((l) => (
                <div key={l.id} className={`rr-lesson ${String(l.status).toLowerCase()}`}>
                  <span className={`lesson-badge ${String(l.status).toLowerCase()}`}>{l.status}</span>
                  <span className="rr-ltext">{l.text}</span>
                  {l.status === 'PROPOSED' && (
                    <span className="rr-lacts">
                      <button className="b b-pri" onClick={() => onBank && onBank(l.id)}>Bank</button>
                      <button className="b b-sec" onClick={() => onReject && onReject(l.id)}>Reject</button>
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

            {/* 5. Combination */}
            <div className="rr-block">
              <div className="rr-blabel">5 · Combination</div>
              {report.combination
                ? (report.combination.legs
                    ? <div className="rr-combo">partner {JSON.stringify(report.combination.legs)} · ρ {report.combination.rho} · burns <b>{report.combination.oos_window}</b> (Approve = the spend)</div>
                    : <div className="rr-combo mono">{report.combination.partners.map((p) => `${p.from}↔${p.to} ρ${p.rho}`).join('  ')}</div>)
                : <div className="hint">no valid partner</div>}
            </div>

            {/* Version history + diff (re-terminus) */}
            {report.versions.length > 1 && (
              <div className="rr-block rr-versions">
                <div className="rr-blabel">Correction history</div>
                {report.versions.map((v, i) => (
                  <div key={i} className="rr-ver">
                    <span className="rr-vtag mono">v{v.version}</span>
                    <span className={`rr-prov ${v.classified_by === 'llm' ? 'llm' : 'heur'}`}>{v.classified_by}</span>
                    <span className="mono">{v.classification} · {v.disposition}</span>
                    {i > 0 && <span className="rr-diff">{versionDiff(report.versions[i - 1], v).join(' · ') || 'no change'}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
