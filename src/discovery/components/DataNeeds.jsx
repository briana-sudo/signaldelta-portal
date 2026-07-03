// Phase 3d-iii-b — data-needs view: gated surfaces priced, ranked by EV. "Approve
// & onboard" starts onboarding — the credential is read from an UNCONTROLLED field
// and POSTed straight to the server-side onboarding endpoint (3d-i). It is NEVER
// held in React state and NEVER passed to the analyst.
import { useRef, useState } from 'react';

export default function DataNeeds({ contract, gated }) {
  const [onboarding, setOnboarding] = useState(null);   // source_id being onboarded (NOT the value)
  const [result, setResult] = useState(null);
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

  return (
    <div className="datastrip">
      <h3>Data needs</h3>
      <div className="cap">Gated surfaces, priced — ranked by expected value. Buying unlocks the cells it reaches.</div>
      <table className="dtable">
        <thead><tr><th>Surface</th><th>Source</th><th>Cost / yr</th><th>Unlocks</th><th>EV</th><th>Likely death</th><th /></tr></thead>
        <tbody>
          {gated.map((g) => (
            <tr key={g.id}>
              <td className="src">{g.surface}</td>
              <td>{g.vendor}</td>
              <td className="mono">{g.price}</td>
              <td className="mono">{g.unlocks}</td>
              <td className="mono ev">{g.ev}</td>
              <td>{g.likely_death}</td>
              <td><button className="b b-sec" onClick={() => { setResult(null); setOnboarding(g.id); }}>Approve &amp; onboard</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {onboarding && (() => {
        const g = gated.find((x) => x.id === onboarding);
        return (
          <div className="onboard-row slidein">
            <span className="src">Onboard {g.surface}:</span>
            <input ref={credRef} type="password" placeholder="paste API key (goes to server-side field)"
                   aria-label={`API key for ${g.surface}`} autoComplete="off" />
            <button className="b b-pri" onClick={() => submit(g)}>Store server-side</button>
            <button className="b b-sec" onClick={() => setOnboarding(null)}>Cancel</button>
            <span className="hint">The key posts to the server-side secrets store — never held here, never sent to the analyst.</span>
          </div>
        );
      })()}
      {result && (
        <div className="onboard-row"><span className="hint">
          {result.configured ? `Configured — ${result.id} key stored server-side, validating…` : `${result.id}: no key supplied.`}
        </span></div>
      )}
    </div>
  );
}
