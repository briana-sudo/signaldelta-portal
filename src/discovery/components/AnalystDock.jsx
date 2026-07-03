// Phase 3d-iii-b — the analyst dock. Ask → the 3d-ii analyst via API → a grounded
// response. A routing outcome (gate item / deliberate-review / engine-change) is
// SURFACED, never enacted (the analyst can't rule; the frontend only shows what it
// routed). Offers the MD export for carrying a slice to another thread.
import { useState } from 'react';

const ROUTE_LABEL = {
  DECISION: 'routed → gate', 'RE-GRADE': 'routed → deliberate-review',
  'NEEDS-CAPABILITY': 'routed → engine-change (non-blocking)', ONBOARDING: 'onboarding assist',
  EXPLAIN: 'explanation', AMBIGUOUS: 'needs clarification',
};

export default function AnalystDock({ contract }) {
  const [ask, setAsk] = useState('');
  const [resp, setResp] = useState(null);
  const [busy, setBusy] = useState(false);

  async function send(e) {
    e?.preventDefault();
    if (!ask.trim()) return;
    setBusy(true);
    const r = await contract.analyst({ ask });        // SURFACE the response; never enact
    setBusy(false);
    setResp(r);
  }
  async function exportSlice() {
    const md = await contract.exportMd('board');
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'signaldelta-board.md'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="analyst">
      <div className="lead"><i />Analyst · grounded in state</div>
      {resp && (
        <div className="resp">
          {resp.explanation}
          {resp.routed_item_type || ROUTE_LABEL[resp.kind]
            ? <div><span className="route">{ROUTE_LABEL[resp.kind] || resp.kind}</span></div> : null}
          {resp.md_brief && <div className="exp">Engine-change handoff brief prepared (export to carry it).</div>}
          {resp.scaffold && <div className="exp">Onboarding slot scaffolded — paste the key in Data needs (server-side).</div>}
        </div>
      )}
      <form className="ask" onSubmit={send}>
        <input value={ask} onChange={(e) => setAsk(e.target.value)}
               placeholder="Ask about the board, the map, what to unlock…" aria-label="Ask the analyst" />
        <button type="submit" disabled={busy}>Ask</button>
      </form>
      <button className="b b-sec" style={{ marginTop: 9 }} onClick={exportSlice}>Export slice → MD</button>
    </div>
  );
}
