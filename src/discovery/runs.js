// Run Room composition — turn the read-model `runs` slice (every SMRunRequest) plus
// the live probe state into run objects, and compose the TERMINUS REPORT (the six
// blocks the operator reads) from the other slices. Pure; unit-tested off-canvas.

export function surfaceOf(parentOrId) {
  const p = String(parentOrId || '');
  return p.includes(':') ? p.split('#')[0].split(':').pop() : p.split('#')[0];
}

// merge stored runs (7688) with the LIVE probe (fresher stages for the running one)
export function mergeRuns(runsSlice, probe) {
  const live = [
    ...(probe?.running ? [probe.running] : []),
    ...(probe?.queue || []),
    ...(probe?.done || []),
  ];
  const byId = new Map();
  for (const r of runsSlice || []) byId.set(r.item_id, { ...r });
  for (const r of live) {
    const prev = byId.get(r.item_id) || {};
    // the live probe carries the freshest stage/steps/status for an active run
    byId.set(r.item_id, { ...prev, ...r, progress: r.steps || prev.progress || r.progress });
  }
  return [...byId.values()];
}

export function findRun(runs, id) {
  return (runs || []).find((r) => r.item_id === id) || null;
}

// runs behind a coverage surface (for the map drill)
export function runsForSurface(runs, surface) {
  return (runs || []).filter((r) => r.kind !== 'reterminus' && surfaceOf(r.parent || r.item_id) === surface);
}

const num = (v) => (v == null || v === '' ? '—' : v);

// the latest disposition record + the version history
export function reportVersions(run) {
  const reps = Array.isArray(run?.reports) ? run.reports : [];
  return reps.map((r, i) => ({ ...r, version: r.version || i + 1 }));
}

// what changed between two report versions (the correction diff)
export function versionDiff(a, b) {
  if (!a || !b) return [];
  const d = [];
  if (a.disposition !== b.disposition) d.push(`disposition: ${a.disposition || '—'} → ${b.disposition || '—'}`);
  if (a.classification !== b.classification) d.push(`classification: ${a.classification || '—'} → ${b.classification || '—'}`);
  if (a.classified_by !== b.classified_by) d.push(`judged by: ${a.classified_by || '—'} → ${b.classified_by || '—'}`);
  if (!!a.provisional !== !!b.provisional) d.push(`provisional: ${!!a.provisional} → ${!!b.provisional}`);
  return d;
}

// THE TERMINUS REPORT — six composed blocks
export function composeReport(run, { lessons = [], board = [], correlations = [] } = {}) {
  const res = run?.result || {};
  const rid = run?.recipe_id;
  const versions = reportVersions(run);
  const latest = versions[versions.length - 1] || {};
  // one lesson per component (the current PROPOSED/BANKED); superseded history lives
  // in the version diff + the In-progress audit list, not stacked here.
  const relatedLessons = (lessons || []).filter((l) =>
    (l.component === rid || String(l.source || '').includes(rid)) && l.status !== 'SUPERSEDED');
  const derivations = (board || []).filter((b) => b.provenance === 'derived' && b.derived_from === rid);
  const combos = (board || []).filter((b) => b.provenance === 'combination'
    && JSON.stringify(b.legs || []).includes(rid));
  const rels = (correlations || []).filter((c) => c.from === rid || c.to === rid);

  return {
    result: {
      edge: num(res.edge_pct_per_day), t: num(res.t), n: num(res.n),
      window: res.window ? `${res.window[0]} … ${res.window[1]}` : '—',
      universe: num(res.universe), gate: res.gate, gate_pass: res.gate_pass,
      gate_reason: res.gate_reason, disposition: run?.disposition || res.disposition || '—',
    },
    classification: {
      class: run?.classification || latest.classification || '—',
      mechanism: run?.mechanism || latest.mechanism || '',
      revival: run?.revival_condition || latest.revival_condition || '',
      by: run?.classified_by || latest.classified_by || 'heuristic',
      provisional: run?.provisional ?? latest.provisional ?? false,
    },
    lessons: relatedLessons,
    derivations,
    combination: combos.length
      ? { legs: combos[0].legs, rho: combos[0].rho, oos_window: combos[0].oos_window, item_id: combos[0].item_id }
      : (rels.length ? { partners: rels } : null),
    versions,
  };
}

export function reportToMd(run, report) {
  const r = report.result;
  const c = report.classification;
  const L = [];
  L.push(`# Terminus report — ${run.recipe_id || run.item_id}`);
  L.push('');
  L.push(`- status: ${run.status || '—'} · triggered: ${run.kind === 'reterminus' ? 'Re-evaluate' : 'Approve'}`);
  L.push('');
  L.push('## 1. Result');
  L.push(`edge ${r.edge}%/day · t ${r.t} · n ${r.n} · window ${r.window} · universe ${r.universe}`);
  L.push(`gate ${r.gate_pass ? 'PASS' : 'FAIL'} — ${r.gate_reason || ''}`);
  L.push(`disposition: **${r.disposition}**`);
  L.push('');
  L.push('## 2. Classification');
  L.push(`**${c.class}** (${c.by}${c.provisional ? ' · provisional' : ''})`);
  L.push(c.mechanism);
  L.push(`revival: ${c.revival}`);
  L.push('');
  L.push('## 3. Lessons proposed');
  report.lessons.forEach((l) => L.push(`- [${l.status}] ${l.text}`));
  L.push('');
  L.push('## 4. Derivations');
  report.derivations.forEach((d) => L.push(`- ${d.title} · EV ${d.ev} · ${d.blocker}`));
  L.push('');
  L.push('## 5. Combination');
  L.push(report.combination
    ? (report.combination.legs ? `partner: ${JSON.stringify(report.combination.legs)} · ρ ${report.combination.rho} · burns ${report.combination.oos_window}` : 'correlations only')
    : 'no valid partner');
  if (report.versions.length > 1) {
    L.push('');
    L.push('## Version history');
    report.versions.forEach((v) => L.push(`- v${v.version} (${v.classified_by}): ${v.classification} · ${v.disposition}`));
  }
  return L.join('\n');
}
