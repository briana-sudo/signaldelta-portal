// Portal 2026-06-08 — "RULES ADDED" informative empty-state.
//
// When the learning loop has written 0 rules this cycle, the box used to read a
// dead "AWAITING LIVE RULES". Instead, show how close the system is to its first
// rule: the largest single-dimension cohort vs the rule-action floor (e.g.
// "Large-cap stock — 96 / 100") with a progress bar. The 0 is accurate (no
// cohort has hit the floor yet); this makes the empty-state informative.
//
// `cohort` comes from adaptClosestCohort(data). When null (proxy not yet
// serving the closest_cohort query, empty corpus, or live-mode bootstrap) we
// fall back to the original bare message so nothing breaks pre-deploy.
export default function RulesEmptyState({ cohort }) {
  if (!cohort) {
    return <div className="rules-empty-bare">— AWAITING LIVE RULES —</div>;
  }
  const { value, count, floor, pct } = cohort;
  return (
    <div className="rules-empty">
      <div className="rules-empty-head">NO RULES YET · CLOSEST COHORT TO FIRST RULE</div>
      <div className="rules-cohort-row">
        <span className="rules-cohort-val" title={cohort.dimension || undefined}>{value}</span>
        <span className="rules-cohort-count">{count} / {floor}</span>
      </div>
      <div className="rules-cohort-bar" aria-label={`${value}: ${count} of ${floor} toward first rule`}>
        <div className="rules-cohort-fill" style={{ width: pct + '%' }} />
      </div>
    </div>
  );
}
