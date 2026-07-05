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

// the seed cards use id/surface; the terminus-created ones use surface_id/title —
// normalize so an engine-created card (e.g. B1-return-stream) is never nameless.
const cardId = (g) => g.id || g.surface_id || '';
const cardName = (g) => g.surface || g.title || g.surface_id || g.id || '(unnamed data need)';
// a RETURN-STREAM / build need has no vendor to price — Price-it doesn't apply.
const isPriceable = (g) => g.kind !== 'combination-infra' && !/return[ -]?stream/i.test(g.title || g.surface || '');

export default function DataNeeds({ contract, gated, onAskAssistant, resolutions = {} }) {
  const [onboarding, setOnboarding] = useState(null);   // source_id being onboarded (NOT the value)
  const [result, setResult] = useState(null);
  const [priced, setPriced] = useState({});             // surface_id -> { fields, questions, note }
  const [busy, setBusy] = useState(null);
  const credRef = useRef(null);                          // uncontrolled — value never enters state

  async function submit(g) {
    const id = cardId(g);
    const credential = credRef.current?.value || '';     // read transiently
    const res = await contract.onboard({
      source_id: id, entitlement: `${id}_entitlement`, credential,
      watermark: new Date().toISOString().slice(0, 10), content_hash: 'pending-validate',
    });
    if (credRef.current) credRef.current.value = '';      // clear immediately — never persisted
    setResult({ id, configured: res.configured });
    setOnboarding(null);
  }

  // "Price it / Research" — the costing worker fills the fields. INTENT only: it
  // never buys, never onboards, spends nothing.
  async function priceIt(g) {
    const id = cardId(g);
    setBusy(id);
    let r = null;
    try { r = await contract.research({ surface_id: id, kind: 'price-research', surface: cardName(g) }); }
    catch { r = null; }
    setBusy(null);
    if (r && (r.fields || r.researched)) {
      setPriced((m) => ({ ...m, [id]: { fields: r.fields || {}, questions: r.questions || [], note: r.note } }));
    } else {
      // distinguish the real cause (the message must say WHICH)
      const note = isPriceable(g)
        ? 'Can’t reach the costing worker — the proxy may need Update & restart (topbar).'
        : 'No vendor entry for this item — it’s a build/return-stream need, not a purchasable data source.';
      setPriced((m) => ({ ...m, [id]: { fields: {}, questions: [], note } }));
    }
  }

  // a field: prefer the just-researched value; else the PERSISTED node value; else "unpriced".
  const shown = (g, key) => {
    const v = priced[cardId(g)]?.fields?.[key] ?? g[key];
    return isUnpriced(v) ? UNP : v;
  };
  const field = (g, label, key) => {
    const v = shown(g, key);
    return (
      <div className="dn-field">
        <span className="dn-k">{label}</span>
        <span className={`dn-v${v === UNP ? ' unpriced' : ''}${(priced[cardId(g)]?.fields?.[key] || g[key]) && v !== UNP ? ' priced' : ''}`}>{v}</span>
      </div>
    );
  };

  return (
    <div className="datastrip">
      <h3>Data needs</h3>
      <div className="cap">Gated surfaces and what it takes to unlock them. "Price it / Research" runs the costing worker — it fills the real numbers (or "quote required"); it never buys.</div>
      <div className="dn-list">
        {gated.map((g) => {
          const id = cardId(g);
          const priceable = isPriceable(g);
          const isPriced = !!priced[id] || g.priced;
          return (
          <div key={id || cardName(g)} className="dn-card">
            <div className="dn-head">
              <span className="src">{cardName(g)}</span>
              {g.blocker && <span className="dn-blocker mono">{g.blocker}</span>}
              {priceable && isPriced && <span className="dn-priced">priced ✓</span>}
              {!priceable && <span className="dn-blocker mono">engine data-need</span>}
              <span className="dn-unlocks mono" title="what it unlocks">{g.unlocks || '—'}</span>
            </div>
            {/* engine-created needs (e.g. a return stream) have no vendor to price —
                show WHY it's needed + WHAT it unlocks, not a pricing grid */}
            {!priceable ? (
              <div className="dn-need">
                <div className="dn-need-why"><b>Why it’s needed:</b> {g.note || 'required by the engine to proceed.'}</div>
                {g.unlocks && <div className="dn-need-unlocks mono">unlocks: {g.unlocks}</div>}
              </div>
            ) : (
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
            )}

            {/* worker's judgment calls → hand off to the assistant (Part C) */}
            {priced[id]?.questions?.length > 0 && (
              <div className="dn-questions">
                <div className="dn-qh">The worker needs your call on {priced[id].questions.length}:</div>
                {priced[id].questions.map((q, i) => (
                  <div key={i} className="dn-q">
                    <span className={`dn-qk mono ${q.kind}`}>{q.kind}</span>
                    <span className="dn-qt">{q.q}</span>
                    <button className="b b-sec" onClick={() => onAskAssistant && onAskAssistant(id, cardName(g), q.q)}>Ask the assistant</button>
                  </div>
                ))}
              </div>
            )}
            {resolutions[id] && <div className="dn-note hint">Resolved with the assistant: “{resolutions[id]}”</div>}

            <div className="acts">
              {priceable && (
                <button className="b b-sec" disabled={busy === id} onClick={() => priceIt(g)}>
                  {busy === id ? 'Researching…' : isPriced ? 'Re-price' : 'Price it / Research'}</button>
              )}
              <button className="b b-pri" onClick={() => { setResult(null); setOnboarding(id); }}>Approve &amp; onboard</button>
            </div>
            {priced[id]?.note && <div className="dn-note hint">{priced[id].note}</div>}

            {onboarding === id && (
              <div className="onboard-row slidein">
                <span className="src">Onboard {cardName(g)}:</span>
                <input ref={credRef} type="password" placeholder="paste API key (goes to server-side field)"
                       aria-label={`API key for ${cardName(g)}`} autoComplete="off" />
                <button className="b b-pri" onClick={() => submit(g)}>Store server-side</button>
                <button className="b b-sec" onClick={() => setOnboarding(null)}>Cancel</button>
                <span className="hint">The key posts to the server-side secrets store — never held here, never sent to the analyst.</span>
              </div>
            )}
            {result && result.id === id && (
              <div className="dn-note hint">
                {result.configured ? `Configured — key stored server-side, validating…` : `No key supplied.`}
              </div>
            )}
          </div>
          );
        })}
        {gated.length === 0 && <div className="hint">No gated data needs queued.</div>}
      </div>
    </div>
  );
}
