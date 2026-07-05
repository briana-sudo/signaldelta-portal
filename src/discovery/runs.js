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
    (l.component === rid || String(l.source || '').includes(rid))
    && l.status !== 'SUPERSEDED' && l.status !== 'RETRACTED');
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
      // a run that ERRORED carries a verbatim message and reached NO gate — the UI
      // must show the error, not a lying "gate FAIL". error wins over gate/class.
      error: res.error || null,
      errored: !!res.error || res.disposition === 'error' || run?.disposition === 'error',
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

// ── MAP LIVENESS: cell status DERIVED from run results (not stored) ──────────
// A compact port of engine/taxonomy so the map reads a surface's TRUE state at
// render time from the runs slice — no stale stored cell, correct on cold load.
const POWERED_N = 100, NULL_T = 1.0;

function dispositionCat({ gate_pass, t, n, edge, gate }) {
  if (gate_pass) return 'retained';
  const g = gate || {};
  const dir = g.direction || 'positive';
  const at = Math.abs(Number(t) || 0);
  const nn = Number(n) || 0;
  const e = Number(edge) || 0;
  const minT = Number(g.min_abs_t) || 2.0;
  const signOk = dir === 'positive' ? e > 0 : dir === 'negative' ? e < 0 : true;
  const powered = nn >= POWERED_N;
  const significant = at >= minT;
  if (!signOk) return (powered && (significant || at < NULL_T)) ? 'killed' : 'inconclusive';
  return (powered && at < NULL_T) ? 'killed' : 'inconclusive';
}

function parentStatus(cats) {
  if (cats.length && cats.every((c) => c === 'killed')) return 'CLEARED';
  if (cats.some((c) => c === 'retained')) return 'RETAINED';
  return 'OPEN';
}

const CELL_FOR = { CLEARED: 'killed', RETAINED: 'occupied', OPEN: 'tested-inconclusive' };
// per-component disposition → dot color (the strip legend: red/violet/green/blue)
const DOT_FOR = { killed: 'killed', inconclusive: 'tested-inconclusive', retained: 'retained' };

// derive BOTH the header status AND the dot strip from the runs — nothing on the map
// reads stored cell state. Each concluded component paints one dot; the rest stay blue.
export function deriveCellStatuses(grid, runs) {
  const bySurface = {};
  for (const r of runs || []) {
    if (r.kind === 'reterminus') continue;
    const res = r.result;
    if (!res || res.t == null) continue;
    const surf = surfaceOf(r.parent || r.item_id);
    (bySurface[surf] || (bySurface[surf] = [])).push({
      rid: r.recipe_id || r.item_id,
      cat: dispositionCat({ gate_pass: res.gate_pass, t: res.t, n: res.n, edge: res.edge_pct_per_day, gate: res.gate }),
    });
  }
  return (grid || []).map((cell) => {
    const comps = bySurface[cell.surface];
    if (!comps) return cell;                                  // untested surface → generator status/dots
    const cats = comps.map((c) => c.cat);
    const ordered = [...comps].sort((a, b) => String(a.rid).localeCompare(String(b.rid)));  // stable strip order
    const n = Math.max((cell.cells && cell.cells.length) || 0, ordered.length);
    const cells = [];
    for (let i = 0; i < n; i++) cells.push({ status: i < ordered.length ? (DOT_FOR[ordered[i].cat] || 'whitespace') : 'whitespace' });
    return { ...cell, status: CELL_FOR[parentStatus(cats)], cells };   // header + dots, both derived
  });
}

// A run ERRORED = it threw (FeedUnavailable, etc.) and produced NO result — it can
// NEVER satisfy a recommendation. A run SUCCEEDED = it reached a real gated result.
export const runErrored = (r) => !!(r && ((r.result && (r.result.error || r.result.errored))
  || String(r.disposition || '').toLowerCase().startsWith('error')));
export const runSucceeded = (r) => !!(r && r.result && r.result.t != null && !runErrored(r));

// A runnable re-test the operator still owes a decision on: runnable-now + derived (or
// flagged runnable), NOT held, and with NO successful run yet (an errored run does not
// count — it re-surfaces). This is the single rule the Board and the attention list share.
export function needsApproval(item, runsByRecipe) {
  const runnable = item.blocker === 'runnable-now' && (item.provenance === 'derived' || item.runnable);
  if (!runnable) return false;
  if (item.held || item.status === 'HELD') return false;
  const rs = (runsByRecipe && runsByRecipe[item.recipe_id]) || [];
  return !rs.some(runSucceeded);
}
export function indexRunsByRecipe(runs = []) {
  const m = {};
  for (const r of runs) { if (r && r.recipe_id) (m[r.recipe_id] || (m[r.recipe_id] = [])).push(r); }
  return m;
}

// ── NEEDS YOUR ATTENTION: every recommended action WITH its reason, from live state ──
function catOf(disp) {
  const d = String(disp || '').toLowerCase();
  if (d.startsWith('retained')) return 'retained';
  if (d.startsWith('inconclusive')) return 'inconclusive';
  if (d.startsWith('killed')) return 'killed';
  return '';
}

export function computeAttention({ runs = [], board = [], lessons = [] } = {}) {
  const items = [];
  // 1. RE-EVALUATE recommended — a concluded surface whose stored disposition the
  //    fixed taxonomy has SUPERSEDED, or that was judged by a provisional heuristic.
  const bySurface = {};
  for (const r of runs) {
    if (r.kind === 'reterminus' || !r.result || r.result.t == null) continue;
    (bySurface[surfaceOf(r.parent || r.item_id)] || (bySurface[surfaceOf(r.parent || r.item_id)] = [])).push(r);
  }
  for (const [surface, sruns] of Object.entries(bySurface)) {
    const staleTax = sruns.some((r) => {
      const rd = dispositionCat({ gate_pass: r.result.gate_pass, t: r.result.t, n: r.result.n, edge: r.result.edge_pct_per_day, gate: r.result.gate });
      const stored = catOf(r.disposition);
      return stored && rd && stored !== rd;
    });
    const prov = sruns.some((r) => r.provisional || r.classified_by === 'heuristic' || r.classified_by == null);
    if (staleTax || prov) {
      const reason = `judged by ${prov ? 'provisional heuristic' : 'a prior run'}${staleTax ? ' under superseded taxonomy' : ''} — Re-evaluate recommended`;
      items.push({ kind: 'reevaluate', title: surface, target: sruns[0].parent, action: 'Re-evaluate', reason });
    }
  }
  // 2. APPROVE recommended — a runnable re-test with NO SUCCESSFUL run yet surfaces
  //    until the operator Approves or Holds it. An errored last run RE-SURFACES it
  //    (errors never satisfy), with the reason updated. NOT gated on status==='PENDING'
  //    — an errored run flips the item to OPEN, and it must still surface here.
  const runsByRecipe = indexRunsByRecipe(runs);
  for (const b of board) {
    if (!needsApproval(b, runsByRecipe)) continue;
    const rs = runsByRecipe[b.recipe_id] || [];
    const reason = rs.some(runErrored)
      ? 'last attempt errored — feed bug fixed, re-staged on point-in-time universe — awaiting your Approve'
      : 'derived powered re-test, runnable on owned data — awaiting your Approve';
    items.push({ kind: 'approve', title: b.recipe_id || b.title, target: b.item_id, version: b.version,
      action: 'Approve', reason });
  }
  // 3. Provisional-lesson notice — heuristic drafts that a Re-evaluate will replace.
  const provL = lessons.filter((l) => l.status === 'PROPOSED' && l.provisional);
  if (provL.length) {
    items.push({ kind: 'note', title: `${provL.length} provisional lesson${provL.length > 1 ? 's' : ''}`,
      reason: 'heuristic-drafted — will supersede with LLM drafts on Re-evaluate' });
  }
  return items;
}

// Would a re-judge CHANGE anything for this surface? Mirrors the backend guard
// (run_queue.rejudge_reason). Returns the reason (for the button tooltip) or null —
// null ⇒ classifications current ⇒ the Re-judge button is ABSENT (not ghosted).
export const TAX_VERSION = 2;
export function rejudgeReason(surface, runs, lessons) {
  const comps = (runs || []).filter((r) => r.kind !== 'reterminus'
    && surfaceOf(r.parent || r.item_id) === surface && r.result && r.result.t != null);
  if (!comps.length) return null;
  if (comps.some((r) => r.provisional || (r.classified_by && r.classified_by !== 'llm')))
    return 'a component is a provisional/heuristic draft — the LLM can improve it';
  if (comps.some((r) => r.classified_tax_version != null && r.classified_tax_version < TAX_VERSION))
    return 'the taxonomy was updated since this was judged';
  const last = comps.reduce((m, r) => (r.classified_at && r.classified_at > m ? r.classified_at : m), '');
  if ((lessons || []).some((l) => l.status === 'BANKED' && l.banked_at && l.banked_at > last))
    return 'lessons were banked since the last judgment';
  return null;
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
  if (r.errored) {
    L.push(`**ERROR** — ${r.error || 'run errored'}`);
    L.push('errored — no gate was evaluated');
  } else {
    L.push(`edge ${r.edge}%/day · t ${r.t} · n ${r.n} · window ${r.window} · universe ${r.universe}`);
    L.push(`gate ${r.gate_pass ? 'PASS' : 'FAIL'} — ${r.gate_reason || ''}`);
    L.push(`disposition: **${r.disposition}**`);
  }
  L.push('');
  L.push('## 2. Classification');
  if (r.errored) {
    L.push('not classified — run errored');
  } else {
    L.push(`**${c.class}** (${c.by}${c.provisional ? ' · provisional' : ''})`);
    L.push(c.mechanism);
  }
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
