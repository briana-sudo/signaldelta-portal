// Phase 3d-iii-b — data-needs view: gated surfaces with their priceable fields and
// TWO actions per surface:
//   • "Price it / Research" — calls the costing WORKER (/sm/research). It fills the
//     real fields (vendor, cost/yr, monthly, terms, tiers, what-you-get) or marks
//     "quote required". It NEVER buys or onboards. The worker's judgment-call
//     questions (tier / discount / setup) hand off to the assistant panel (Part C).
//   • "Approve & onboard" — acts once priced. The credential is read from an
//     UNCONTROLLED field and POSTed straight to the server-side onboarding endpoint;
//     it is NEVER held in React state and NEVER passed to the analyst.
import { useRef, useState } from 'react';

const UNP = 'unpriced — research needed';
const isUnpriced = (v) => v == null || v === '' || v === UNP || v === 'unpriced';

export default function DataNeeds({ contract, gated, onAskAssistant, resolutions = {} }) {
  const [onboarding, setOnboarding] = useState(null);   // source_id being onboarded (NOT the value)
  const [result, setResult] = useState(null);
  const [priced, setPriced] = useState({});             // surface_id -> { fields, questions, note }
  const [busy, setBusy] = useState(null);
  const credRef = useRef(null);                          // uncontrolled — value never enters state

  async function submit(g) {
    const credential = credRef.current?.value || '';     // read transiently
    const res = await contract.onboard({
      source_id: g.id, entitlement: `${g.id}_entitlement`, credential,
      watermark: new Date().toISOString().slice(0, 10), content_hash: 'pending-validate',
    });
    if (credRef.current) credRef.current.value = '';      // clear immediately — never persisted
    setResult({ id: g.id, configured: res.configured });
    setOnboarding(null);
  }

  // "Price it / Research" — the costing worker fills the fields. INTENT only: it
  // never buys, never onboards, spends nothing.
  async function priceIt(g) {
    setBusy(g.id);
    let r = null;
    try { r = await contract.research({ surface_id: g.id, kind: 'price-research', surface: g.surface }); }
    catch { r = null; }
    setBusy(null);
    if (r && (r.fields || r.researched)) {
      setPriced((m) => ({ ...m, [g.id]: { fields: r.fields || {}, questions: r.questions || [], note: r.note } }));
    } else {
      setPriced((m) => ({ ...m, [g.id]: { fields: {}, questions: [], note: 'Could not reach the costing worker — try again.' } }));
    }
  }

  // a field: prefer the researched value; else the seed value; else "unpriced".
  const shown = (g, key) => {
    const v = priced[g.id]?.fields?.[key] ?? g[key];
    return isUnpriced(v) ? UNP : v;
  };
  const field = (g, label, key) => {
    const v = shown(g, key);
    return (
      <div className="dn-field">
        <span className="dn-k">{label}</span>
        <span className={`dn-v${v === UNP ? ' unpriced' : ''}${priced[g.id]?.fields?.[key] && v !== UNP ? ' priced' : ''}`}>{v}</span>
      </div>
    );
  };

  return (
    <div className="datastrip">
      <h3>Data needs</h3>
      <div className="cap">Gated surfaces and what it takes to unlock them. "Price it / Research" runs the costing worker — it fills the real numbers (or "quote required"); it never buys.</div>
      <div className="dn-list">
        {gated.map((g) => (
          <div key={g.id} className="dn-card">
            <div className="dn-head">
              <span className="src">{g.surface}</span>
              {g.blocker && <span className="dn-blocker mono">{g.blocker}</span>}
              {priced[g.id] && <span className="dn-priced">priced ✓</span>}
              <span className="dn-unlocks mono" title="cells unlocked">{g.unlocks || '—'}</span>
            </div>
            <div className="dn-grid">
              {field(g, 'Cost / yr', 'cost_yr')}
              {field(g, 'Monthly option', 'monthly')}
              {field(g, 'Vendor', 'vendor')}
              {field(g, 'Contract terms', 'terms')}
              {field(g, 'What you get', 'what_you_get')}
              {field(g, 'Tiers', 'tiers')}
              {field(g, 'EV', 'ev')}
              {field(g, 'Likely death', 'likely_death')}
            </div>

            {/* worker's judgment calls → hand off to the assistant (Part C) */}
            {priced[g.id]?.questions?.length > 0 && (
              <div className="dn-questions">
                <div className="dn-qh">The worker needs your call on {priced[g.id].questions.length}:</div>
                {priced[g.id].questions.map((q, i) => (
                  <div key={i} className="dn-q">
                    <span className={`dn-qk mono ${q.kind}`}>{q.kind}</span>
                    <span className="dn-qt">{q.q}</span>
                    <button className="b b-sec" onClick={() => onAskAssistant && onAskAssistant(g.id, g.surface, q.q)}>Ask the assistant</button>
                  </div>
                ))}
              </div>
            )}
            {resolutions[g.id] && <div className="dn-note hint">Resolved with the assistant: “{resolutions[g.id]}”</div>}

            <div className="acts">
              <button className="b b-sec" disabled={busy === g.id} onClick={() => priceIt(g)}>
                {busy === g.id ? 'Researching…' : priced[g.id] ? 'Re-price' : 'Price it / Research'}</button>
              <button className="b b-pri" onClick={() => { setResult(null); setOnboarding(g.id); }}>Approve &amp; onboard</button>
            </div>
            {priced[g.id]?.note && <div className="dn-note hint">{priced[g.id].note}</div>}

            {onboarding === g.id && (
              <div className="onboard-row slidein">
                <span className="src">Onboard {g.surface}:</span>
                <input ref={credRef} type="password" placeholder="paste API key (goes to server-side field)"
                       aria-label={`API key for ${g.surface}`} autoComplete="off" />
                <button className="b b-pri" onClick={() => submit(g)}>Store server-side</button>
                <button className="b b-sec" onClick={() => setOnboarding(null)}>Cancel</button>
                <span className="hint">The key posts to the server-side secrets store — never held here, never sent to the analyst.</span>
              </div>
            )}
            {result && result.id === g.id && (
              <div className="dn-note hint">
                {result.configured ? `Configured — key stored server-side, validating…` : `No key supplied.`}
              </div>
            )}
          </div>
        ))}
        {gated.length === 0 && <div className="hint">No gated data needs queued.</div>}
      </div>
    </div>
  );
}
