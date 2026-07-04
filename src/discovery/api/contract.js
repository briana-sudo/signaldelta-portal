// Phase 3d-iii-b — the 3d-i API CONTRACT client (+ mock adapter).
//
// The frontend READS (query/export) and SENDS INTENT (resolve/onboard/analyst).
// It NEVER writes the graph directly: approve/reject is a `resolve` INTENT the
// orchestrator applies; an onboarding credential is POSTed straight to the
// server-side onboarding field and is never held in frontend state or sent to the
// analyst; there is no trading-engine reference here (search-master console
// only). Wiring to the live proxy (3d-iii-a `/sm/*`) is a config swap — set
// VITE_SM_PROXY_URL and MODE='live'; until then the MOCK adapter serves
// representative data matching the read-model slices.

// MODE: 'live' (default) reads the LIVE 7688 graph through the proxy /sm/*, and
// gracefully falls back to the published read_model.json (real seed state) if the
// proxy isn't reachable yet (e.g. before its restart) — so the console always shows
// real state. 'real' = file only; 'mock' = representative data.
const MODE = import.meta?.env?.VITE_SM_MODE || 'live';
// the proxy base: the search-master proxy URL, or the trading proxy tunnel (same
// FastAPI proxy serves /sm/*), or same-origin.
const PROXY = import.meta?.env?.VITE_SM_PROXY_URL || import.meta?.env?.VITE_PROXY_URL || '';
const TOKEN = import.meta?.env?.VITE_PROXY_API_TOKEN || '';

// --- representative mock read model (matches 3d-i's 7 slices) ----------------
// discovery_potential values mirror engine/discovery_grid.py SURFACES.
const MOCK = {
  state: { lane: 'equity', family: 'fundamental', program_state: 'searching',
           retained_partials: 1, window_budget: 'sealed', cells_mapped: 1134 },
  grid: [
    surface('crypto_onchain', 'Crypto · on-chain', 0.95, 'gated', 18, 'onchain', 'needs feed'),
    surface('crypto_funding', 'Funding', 0.88, 'gated', 8, 'funding', 'needs feed'),
    surface('relational_graph', 'Relational · graph', 0.82, 'whitespace', 10, 'graph', 'owned via EDGAR'),
    surface('crypto_microstructure', 'Crypto · microstructure', 0.80, 'gated', 6, 'microstructure', 'needs feed'),
    surface('options_skew', 'Options · skew', 0.72, 'gated', 6, 'options', ''),
    surface('llm_events', 'LLM · events', 0.65, 'whitespace', 6, 'events', 'owned via EDGAR'),
    surface('borrow_dynamics', 'Borrow · dynamics', 0.58, 'gated', 4, 'borrow', ''),
    surface('price', 'Price · trend', 0.20, 'occupied', 10, 'price_path', 'owned · exhausted', { b1: true }),
    surface('fundamental', 'Fundamental · cross-sectional', 0.15, 'occupied', 8, 'fundamental_cross_sectional', 'owned · exhausted'),
  ],
  board: [
    { item_id: 'gated-option:equity:crypto_onchain:c1', type: 'gated-option', status: 'PENDING',
      title: 'Unlock crypto on-chain surface', kind: 'Gated option', age: '2m ago',
      meta: ['Glassnode · $26.4k/yr', 'opens 18 cells'],
      recommendation: 'Highest discovery potential on the board (0.95). EV +0.71 net of cost. Most-likely death: crowding.',
      version: 1, options: ['approve', 'hold', 'reject'] },
    { item_id: 'revalidation-due:equity:KR:c1', type: 'revalidation-due', status: 'PENDING',
      title: 'Recheck — low-vol factor (recent-decay)', kind: 'Revalidation', age: '1h ago',
      meta: ['KR regime', '+2 quarters data'],
      recommendation: 'Recent-third edge returned to positive with power (t = 2.8). Regime may have reverted.',
      version: 1, options: ['approve', 'hold'] },
    { item_id: 'new-search-surface:equity:relational_graph:c1', type: 'new-search-surface', status: 'PENDING',
      title: 'Probe relational whitespace', kind: 'New search', age: '3h ago',
      meta: ['orthogonal to B1', '8 cells'],
      recommendation: 'Uncrowded, partly owned via EDGAR. Component-#2 candidate for the ledger.',
      version: 1, options: ['approve', 'hold'] },
  ],
  gated: [
    { id: 'crypto_onchain', surface: 'Crypto · on-chain', vendor: 'Glassnode API', price: '$26,400',
      unlocks: '18 cells', ev: '+0.71', likely_death: 'crowding' },
    { id: 'crypto_funding', surface: 'Funding', vendor: 'Amberdata API', price: '$14,900',
      unlocks: '8 cells', ev: '+0.63', likely_death: 'regime' },
    { id: 'relational_graph', surface: 'Relational · graph', vendor: 'FactSet Revere', price: '$—',
      unlocks: '8 cells', ev: '+0.55', likely_death: 'gated-data-cost' },
    { id: 'options_skew', surface: 'Options · skew', vendor: 'ORATS file feed', price: '$9,200',
      unlocks: '6 cells', ev: '+0.48', likely_death: 'capacity' },
  ],
  ledger: [
    { id: 'B1', mechanism: 'price-trend', orthogonality_basis: 'mkt', forward_confirmed: false, net_shape: '~1.4%/yr' },
  ],
  kills: [
    { id: 'KR', force_named: 'recent-decay', disposition: 'fast-scan', reason: 'recent-third edge non-positive' },
    { id: 'A35', force_named: 'short-constraint', disposition: 'setup-state', reason: 'short-leg behind borrow wall' },
  ],
  deployed: [],   // zero deployed signals today
};

function surface(id, name, dp, status, nCells, family, note, extra = {}) {
  const cells = [];
  for (let i = 0; i < nCells; i++) cells.push({ status: cellStatusFor(status, i, nCells, extra) });
  return { surface: id, name, discovery_potential: dp, status, family, note, cells, ...extra };
}
function cellStatusFor(status, i, n, extra) {
  if (extra.b1 && i === n - 1) return 'retained';
  if (status === 'occupied') return i % 3 === 1 ? 'killed' : 'occupied';
  if (status === 'whitespace') return i < n - 2 ? 'whitespace' : 'gated';
  return status;
}

// --- the client: read (query/export) + intent (resolve/onboard/analyst) ------
async function post(path, body) {
  const res = await fetch(`${PROXY}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

async function get(path) {
  const res = await fetch(`${PROXY}${path}`, { headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {} });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

export function makeContract(mode = MODE) {
  if (mode === 'mock') return mockContract();
  if (mode === 'live') return liveContract();
  return realContract();
}

function mockContract() {
  const board = MOCK.board.map((b) => ({ ...b }));
  // engine power-switch state machine (mock): starting → running, stopping → stopped
  const engine = { state: 'stopped', since: 0 };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
  return {
    mode: 'mock',
    // READ ONLY
    async query(slice) { return structuredClone(MOCK[slice] ?? null); },
    // ENGINE POWER SWITCH (controls the service, not research)
    async engineStatus() {
      if (engine.state === 'starting' && now() - engine.since > 1200) engine.state = 'running';
      if (engine.state === 'stopping' && now() - engine.since > 900) engine.state = 'stopped';
      return { status: engine.state };
    },
    async engineStart() { engine.state = 'starting'; engine.since = now(); return { action: 'start', status: engine.state }; },
    async engineStop() { engine.state = 'stopping'; engine.since = now(); return { action: 'stop', status: engine.state }; },
    async exportMd(slice) { return `# ${slice}\n\n(mock export — read-only, no secrets)\n`; },
    // INTENT — resolve is the §4.1 gated-write; the frontend NEVER writes the graph
    async resolve({ gate_item_id, decision, gate_item_version }) {
      const it = board.find((b) => b.item_id === gate_item_id);
      if (!it) return { rejected: true, reason: 'unknown gate item' };
      if (it.version !== gate_item_version) return { rejected: true, reason: 'stale version' };
      it.status = 'CLEARED'; it.version += 1;
      return { resolved: true, new_status: 'CLEARED', decision };
    },
    // INTENT — credential goes to the server-side field, never returned/echoed
    async onboard({ source_id, entitlement, credential, watermark, content_hash }) {
      const configured = credential != null && credential !== '';
      return { source_id, entitlement, configured, watermark, content_hash };  // NEVER the value
    },
    // INTENT — analyst surfaces + routes, never enacts
    async analyst({ ask }) { return mockAnalyst(ask); },
    _board: board,
  };
}

// REAL state, no infra: read the engine-generated read_model.json (published with
// the app) for the read slices; reuse the mock behaviors for intent/engine (the
// live proxy write-path is a later config swap). Falls back to mock data if the
// file isn't there (e.g. local dev before a cycle has run).
function realContract() {
  const base = mockContract();                     // resolve/onboard/analyst/engine reused
  let loadPromise = null;
  function load() {
    // memoize the PROMISE so concurrent query() calls all await the same fetch
    // (memoizing a flag/result would race — early callers get null → mock)
    if (!loadPromise) {
      loadPromise = (async () => {
        try {
          // resolve relative to the current page so it works under the Pages base
          // path (/signaldelta-portal/) without depending on import.meta.env
          const url = new URL('read_model.json', document.baseURI).href;
          const res = await fetch(url, { cache: 'no-store' });
          if (res.ok) return await res.json();
        } catch { /* fall back to mock slices */ }
        return null;
      })();
    }
    return loadPromise;
  }
  const rc = {
    ...base,
    mode: 'real',
    async query(slice) {
      const d = await load();
      return (d && d[slice] != null) ? structuredClone(d[slice]) : base.query(slice);
    },
    async exportMd(slice) { return `# ${slice}\n\n(real state export — read-only, no secrets)\n`; },
  };
  rc.analyst = ({ ask }) => groundedAnalyst(ask, rc.query);   // grounded in the real read model
  return rc;
}

// LIVE: reads come from the 7688 graph via the proxy /sm/readmodel; intent
// (resolve/onboard) + engine control go to /sm/*. If the proxy isn't reachable yet
// (e.g. before its restart), every read/engine call falls back to the file view
// (real seed) so the console still shows real state — it auto-upgrades to live the
// moment the proxy serves /sm/*. Same firewall: reads + intent only, no graph write.
function liveContract() {
  const file = realContract();                       // graceful fallback (file → mock)
  let rmPromise = null;
  function liveReadModel() {
    if (!rmPromise) rmPromise = get('/sm/readmodel').catch(() => null);
    return rmPromise;
  }
  const q = async (slice) => {
    const rm = await liveReadModel();
    return (rm && rm[slice] != null) ? rm[slice] : file.query(slice);
  };
  return {
    mode: 'live',
    async query(slice) { return q(slice); },
    async exportMd(slice) { return file.exportMd(slice); },
    async resolve(payload) { return post('/sm/resolve', payload).catch(() => ({ rejected: true, reason: 'proxy unreachable — start it to enable gated writes' })); },
    async onboard(payload) { return post('/sm/onboard', payload).catch(() => ({ source_id: payload.source_id, configured: false })); },
    // analyst runs client-side, grounded in the LIVE read model (deterministic; an
    // LLM analyst is a later server-side swap). "what's runnable now" -> V-015.
    async analyst({ ask }) { return groundedAnalyst(ask, q); },
    // ENGINE POWER SWITCH -> /sm/engine/* (falls back to the mock state machine)
    async engineStatus() { return get('/sm/engine/status').catch(() => file.engineStatus()); },
    async engineStart() { return post('/sm/engine/start', {}).catch(() => file.engineStart()); },
    async engineStop() { return post('/sm/engine/stop', {}).catch(() => file.engineStop()); },
  };
}

// analyst grounded in the current read model: answers "what's runnable now" with the
// runnable-now board item(s) (V-015), else the deterministic classify/route.
export async function groundedAnalyst(ask, queryFn) {
  const a = (ask || '').toLowerCase();
  const has = (...ks) => ks.some((k) => a.includes(k));
  if (has('runnable', 'run now', 'what can i run', 'what now', 'what next', 'first test', 'priorit', "what's next")) {
    let board = [];
    try { board = (await queryFn('board')) || []; } catch { board = []; }
    const runnable = board.filter((b) => /runnable/i.test(b.kind || ''));
    if (runnable.length) {
      return { kind: 'EXPLAIN',
               explanation: `Runnable now (no new data needed): ${runnable.map((b) => b.title).join('; ')}. That's the engine's first free test. This explains what the state says — it's not a decision; approving it is a gated call on the board.` };
    }
  }
  return mockAnalyst(ask);
}

// --- deterministic mock analyst (mirrors 3d-ii routing rules) ----------------
function mockAnalyst(ask) {
  const a = (ask || '').toLowerCase();
  const has = (...ks) => ks.some((k) => a.includes(k));
  if (has('onboard', 'api key', 'credential', 'paste'))
    return { kind: 'ONBOARDING', explanation: 'I can scaffold the config slot; paste the key into the server-side field — never here.',
             scaffold: { env_var: 'SOURCE_API_KEY' } };
  const action = [
    has('buy', 'unlock', 'purchase', 'pull') && 'DECISION',
    has('revive', 'kill is wrong', 're-grade', 'actually alive') && 'RE-GRADE',
    has('new math', 'new capability', "doesn't have", 'needs new') && 'NEEDS-CAPABILITY',
  ].filter(Boolean);
  if (action.length > 1)
    return { kind: 'AMBIGUOUS', explanation: 'Ambiguous — please clarify; not routing an action.' };
  if (action[0] === 'DECISION')
    return { kind: 'DECISION', explanation: 'EV case surfaced. Routed a PENDING gate item — you decide at the gate.',
             routed_item_type: 'decision' };
  if (action[0] === 'RE-GRADE')
    return { kind: 'RE-GRADE', explanation: 'Routed a deliberate-review item — I never assert a verdict or revive.',
             routed_item_type: 'deliberate-review' };
  if (action[0] === 'NEEDS-CAPABILITY')
    return { kind: 'NEEDS-CAPABILITY', explanation: 'Surfaced an engine-change-needed item + MD brief (non-blocking).',
             routed_item_type: 'engine-change-needed', md_brief: '# Engine-change-needed handoff\n' };
  return { kind: 'EXPLAIN', explanation: 'Grounded in state — this is what the board/map say; not a grade or a decision.' };
}
