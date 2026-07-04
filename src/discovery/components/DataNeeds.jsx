// Phase 3d-iii-b — data-needs view: gated surfaces with their priceable fields and
// TWO actions per surface:
//   • "Price it / Research" — surfaces a GATED research request (find real cost/yr,
//     monthly option, vendor, terms). It NEVER buys or onboards; it only queues a
//     costing task whose results later fill the fields.
//   • "Approve & onboard" — acts once priced. The credential is read from an
//     UNCONTROLLED field and POSTed straight to the server-side onboarding endpoint;
//     it is NEVER held in React state and NEVER passed to the analyst.
import { useRef, useState } from 'react';

const UNP = 'unpriced — research needed';
const val = (v) => (v == null || v === '' ? UNP : v);
const isUnpriced = (v) => val(v) === UNP;

export default function DataNeeds({ contract, gated }) {
  const [onboarding, setOnboarding] = useState(null);   // source_id being onboarded (NOT the value)
  const [result, setResult] = useState(null);
  const [researched, setResearched] = useState({});     // surface_id -> queued note
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

  // "Price it / Research" — surfaces a costing request. INTENT only: never buys,
  // never onboards, spends nothing. Results later fill the fields below.
  async function priceIt(g) {
    let r = { queued: true };
    try { r = await contract.research({ surface_id: g.id, kind: 'price-research', surface: g.surface }); }
    catch { r = { queued: false }; }
    setResearched((m) => ({ ...m, [g.id]: r.queued !== false
      ? 'Research queued — costing task surfaced (no purchase). Results will fill these fields.'
      : 'Could not surface the research request — try again.' }));
  }

  const field = (label, v) => (
    <div className="dn-field">
      <span className="dn-k">{label}</span>
      <span className={`dn-v${isUnpriced(v) ? ' unpriced' : ''}`}>{val(v)}</span>
    </div>
  );

  return (
    <div className="datastrip">
      <h3>Data needs</h3>
      <div className="cap">Gated surfaces and what it takes to unlock them. Unpriced fields need costing — "Price it / Research" surfaces that request (it never buys).</div>
      <div className="dn-list">
        {gated.map((g) => (
          <div key={g.id} className="dn-card">
            <div className="dn-head">
              <span className="src">{g.surface}</span>
              {g.blocker && <span className="dn-blocker mono">{g.blocker}</span>}
              <span className="dn-unlocks mono" title="cells unlocked">{val(g.unlocks)}</span>
            </div>
            <div className="dn-grid">
              {field('Cost / yr', g.cost_yr ?? g.price)}
              {field('Monthly option', g.monthly)}
              {field('Vendor', g.vendor)}
              {field('Contract terms', g.terms)}
              {field('What you get', g.what_you_get)}
              {field('Tiers', g.tiers)}
              {field('EV', g.ev)}
              {field('Likely death', g.likely_death)}
            </div>
            <div className="acts">
              <button className="b b-sec" onClick={() => priceIt(g)}>Price it / Research</button>
              <button className="b b-pri" onClick={() => { setResult(null); setOnboarding(g.id); }}>Approve &amp; onboard</button>
            </div>
            {researched[g.id] && <div className="dn-note hint">{researched[g.id]}</div>}
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
