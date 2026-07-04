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
    { id: 'crypto_onchain', surface: 'Crypto · on-chain', vendor: 'Glassnode API', blocker: 'needs-data',
      cost_yr: '$26,400', monthly: 'yes · $2,500/mo', terms: 'annual, API, 30-day out',
      what_you_get: 'on-chain flows, SOPR, exchange balances (BTC/ETH + top-50)', tiers: 'Advanced / Institutional',
      unlocks: '18 cells', ev: '+0.71', likely_death: 'crowding' },
    { id: 'crypto_funding', surface: 'Funding', vendor: 'Amberdata API', blocker: 'needs-data',
      cost_yr: '$14,900', monthly: 'yes · $1,490/mo', terms: 'annual, API',
      what_you_get: 'perp funding + basis across venues', tiers: 'Pro',
      unlocks: '8 cells', ev: '+0.63', likely_death: 'regime' },
    { id: 'relational_graph', surface: 'Relational · graph', vendor: 'unpriced — research needed', blocker: 'needs-data',
      cost_yr: 'unpriced — research needed', monthly: 'unpriced — research needed', terms: 'unpriced — research needed',
      what_you_get: 'supplier/customer + ownership linkages', tiers: 'unpriced — research needed',
      unlocks: '8 cells', ev: 'unpriced — research needed', likely_death: 'gated-data-cost' },
    { id: 'options_skew', surface: 'Options · skew', vendor: 'ORATS file feed', blocker: 'needs-data',
      cost_yr: '$9,200', monthly: 'yes · $920/mo', terms: 'annual, flat file, T+1',
      what_you_get: 'IV surface + skew history, US equities/ETFs', tiers: 'Data / Backtest',
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
  // structured revival watches — the monitor state the 3b/2d monitors persist
  watches: [
    { id: 'B-AG', force_named: 'recent-decay', disposition: 'fast-scan', trigger: 'data-advance',
      recheck_due: '2026-12', last_checked: '2026-07-04T12:00:00+00:00', status: 'ran-no-change',
      reason: 'gross-brick, orthogonal, but recently-decayed S3' },
    { id: 'B-INS', force_named: 'band-skew', disposition: 'setup-state', trigger: 'setup-state change',
      recheck_due: 'on setup-state change', last_checked: '2026-07-04T12:00:00+00:00', status: 'waiting',
      reason: 'behind the trade band' },
    { id: 'B-LP', force_named: 'factor-in-costume', disposition: 'deliberate-review', trigger: 'review cadence',
      recheck_due: '2027-01-04', last_checked: '2026-07-04T12:00:00+00:00', status: 'waiting',
      reason: 'char-neutral null — revisit on cadence' },
  ],
  scan_history: [
    { scan_id: 'scan-2026-07-04T12:00:00+00:00', at: '2026-07-04T12:00:00+00:00',
      kind: 'revival + data-availability', evaluated: 3, rechecked: 1, revived: 0, resurfaced: [],
      note: 'evaluated 3 revival watches (1 data/regime re-scanned, 2 awaiting their trigger); 0 revived — no source-watermark advance or setup-state change since the seed; nothing from the killed set re-surfaced' },
  ],
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
  const proxy = { state: 'running', since: 0 };   // proxy power-switch (restart-after-deploy)
  const probe = { running: null, queue: [], done: [] };   // mock probe-run simulator
  const mlessons = [{ id: 'lesson-v015-tom-seed', status: 'PROPOSED', source: 'V-015-TOM (direct measurement)',
    text: 'V-015-TOM turn-of-month: edge +0.0018%/day, t=0.03, n=1704 (well-powered), 18-mo window ending 2026-07-04, 24-name universe. Mechanism read = structural (T+1 settlement); revival ~ settlement reversal (expect never). DFC prior lowered; TDF prior intact.' }];
  const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
  const P_STAGES = ['queued', 'validating recipe', 'fetching data', 'building signal', 'computing', 'power-gate', 'result'];
  const pDetail = (s) => ({ 'fetching data': '24 names from sharadar_sep', computing: '1704 turn-of-month vs 7224 rest', 'power-gate': 't=0.03 vs gate 2.0' }[s] || '');
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
    // PROXY POWER SWITCH (controls the SignalDeltaProxy service; restart-after-deploy)
    async proxyStatus() {
      if (proxy.state === 'restarting' && now() - proxy.since > 1500) proxy.state = 'running';
      return { status: proxy.state, helper_backed: true };
    },
    async proxyRestart() { proxy.state = 'restarting'; proxy.since = now(); return { action: 'restart', status: proxy.state }; },
    async exportMd(slice) { return `# ${slice}\n\n(mock export — read-only, no secrets)\n`; },
    // INTENT — resolve is the §4.1 gated-write; the frontend NEVER writes the graph
    async resolve({ gate_item_id, decision, gate_item_version }) {
      const it = board.find((b) => b.item_id === gate_item_id);
      if (!it) return { rejected: true, reason: 'unknown gate item' };
      if (it.version !== gate_item_version) return { rejected: true, reason: 'stale version' };
      it.version += 1;
      if (decision === 'reject') { it.status = 'HELD'; return { resolved: true, new_status: 'HELD', held: true }; }
      const parentId = (gate_item_id.match(/V-0\d\d/) || [])[0];   // parent candidate → enqueue its component flows
      if (parentId) {
        it.status = 'QUEUED';
        const comps = ['TOM', 'DFC', 'TDF'];
        comps.forEach((c) => {
          const rid = `${parentId}-${c}`;
          const runId = `${gate_item_id}#${rid}`;
          const job = { item_id: runId, parent: gate_item_id, recipe_id: rid, title: `${parentId} · ${c}`, stage: 'queued', steps: [], since: now() };
          if (probe.running || probe.queue.length) { if (!probe.queue.some((q) => q.item_id === runId)) probe.queue.push(job); }
          else probe.running = job;
        });
        return { resolved: true, new_status: 'QUEUED', enqueued: true, components: comps.map((c) => `${parentId}-${c}`) };
      }
      it.status = 'CLEARED';
      return { resolved: true, new_status: 'CLEARED', decision };
    },
    // live probe run state (mock: advance the running job through the stages)
    async probeStatus() {
      const r = probe.running;
      if (r && r.kind === 'reterminus') {                 // re-terminus streams its own stages
        const S = r.rt_steps;
        const idx = Math.min(S.length - 1, Math.floor((now() - r.since) / 700));
        r.stage = S[idx];
        r.steps = S.slice(0, idx + 1).map((s) => ({ stage: s, detail: '' }));
        if (idx >= S.length - 1 && now() - r.since > S.length * 700 + 400) {
          probe.done.unshift({ ...r, status: 'done', disposition: 'reevaluated',
            result: { recipe_id: 'RETERMINUS', disposition: 'reevaluated', note: `${r.title} — flows re-judged` } });
          probe.done = probe.done.slice(0, 8);
          probe.running = probe.queue.shift() || null;
          if (probe.running) probe.running.since = now();
        }
        return structuredClone({ running: probe.running, queue: probe.queue, done: probe.done });
      }
      if (r) {
        const idx = Math.min(P_STAGES.length - 1, Math.floor((now() - r.since) / 700));
        r.stage = P_STAGES[idx];
        r.steps = P_STAGES.slice(1, idx + 1).map((s) => ({ stage: s, detail: pDetail(s) }));
        if (idx >= P_STAGES.length - 1 && now() - r.since > P_STAGES.length * 700 + 400) {
          const survived = String(r.recipe_id).endsWith('DFC');   // demo: one flow survives, others null
          const result = survived
            ? { recipe_id: r.recipe_id, t: 3.4, n: 40, edge_pct_per_day: 0.21, gate_pass: true, disposition: 'retained-candidate' }
            : { recipe_id: r.recipe_id, t: 0.03, n: 1704, edge_pct_per_day: 0.0018, gate_pass: false, disposition: 'killed (no-edge, as tested)' };
          probe.done.unshift({ ...r, status: 'done', result, disposition: result.disposition });
          probe.done = probe.done.slice(0, 8);
          probe.running = probe.queue.shift() || null;
          if (probe.running) probe.running.since = now();
        }
      }
      return structuredClone({ running: probe.running, queue: probe.queue, done: probe.done });
    },
    // RE-EVALUATE (mock): stream a re-terminus job through the In-progress tab, then
    // flip the item's disposition + repaint (demo of the engine correcting itself).
    async reevaluate(item_id) {
      const it = board.find((b) => b.item_id === item_id);
      const surface = String(item_id).split(':').pop();
      probe.queue.push({ item_id: `RETERMINUS#${item_id}`, recipe_id: 'RETERMINUS', kind: 'reterminus',
        title: `Re-evaluate ${surface}`, stage: 'queued', steps: [],
        rt_steps: ['loading stored results', `re-judging ${surface} flows`, 'retracting stale kills',
          're-deriving (powered re-tests)', 'repainting map', 'result'] });
      if (!probe.running) { probe.running = probe.queue.shift(); probe.running.since = now(); }
      if (it) it.status = 'OPEN';   // engine reopens: an underpowered flow needs a powered re-test
      return { state: 'queued', item_id: `RETERMINUS#${item_id}` };
    },
    // INTENT — credential goes to the server-side field, never returned/echoed
    async onboard({ source_id, entitlement, credential, watermark, content_hash }) {
      const configured = credential != null && credential !== '';
      return { source_id, entitlement, configured, watermark, content_hash };  // NEVER the value
    },
    // INTENT — "Price it / Research" runs the costing worker; it NEVER buys or
    // onboards (no credential, no spend) — it fills fields + surfaces questions.
    async research({ surface_id, surface }) {
      const blob = `${surface_id} ${surface || ''}`.toLowerCase();
      const opt = /option|skew|implied|vol/.test(blob);
      const fields = opt
        ? { vendor: 'ORATS (representative)', cost_yr: '$1,188–$3,588/yr + $2,000 one-time',
            monthly: 'yes · $99–$299/mo', terms: 'monthly API or annual', tiers: 'DataShop / API / Intraday',
            what_you_get: 'IV surface, skew history + greeks (US equities/ETFs)' }
        : { vendor: 'quote required', cost_yr: 'quote required', monthly: 'quote required',
            terms: 'quote required', tiers: 'quote required', what_you_get: surface || surface_id };
      return { queued: true, researched: true, surface_id, fields,
               questions: opt ? [{ kind: 'tier', q: 'Which ORATS tier fits — API (~$199/mo) or add 1-min intraday?' }]
                              : [{ kind: 'setup', q: 'This surface is quote-only — scaffold the vendor-contact request?' }],
               note: 'researched cost — no purchase, no onboarding' };
    },
    // INTENT — analyst surfaces + routes, never enacts
    async analyst({ ask, attachment }) { return groundedAnalyst(ask, this.query?.bind(this), { attachment }); },
    // gated learning (mock): propose ≠ bank; Bank/Reject mutate the local store
    async lessons() { return structuredClone(mlessons); },
    async bankLesson(id) { const l = mlessons.find((x) => x.id === id); if (l) l.status = 'BANKED'; return { id, status: l?.status }; },
    async rejectLesson(id) { const l = mlessons.find((x) => x.id === id); if (l) l.status = 'REJECTED'; return { id, status: l?.status }; },
    async proposeLesson(text, source) { const id = `lesson-${mlessons.length}`; mlessons.unshift({ id, text, source, status: 'PROPOSED' }); return { id, status: 'PROPOSED' }; },
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
  rc.analyst = ({ ask, attachment }) => groundedAnalyst(ask, rc.query, { attachment });  // grounded + attachment
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
    // RE-EVALUATE (deliberate review): the ENGINE re-judges its own concluded work
    // with the fixed taxonomy + LLM, streaming to In-progress. Intent only — a run-request.
    async reevaluate(item_id) { return post('/sm/reevaluate', { item_id }).catch(() => ({ error: 'proxy unreachable — start it to re-evaluate' })); },
    async onboard(payload) { return post('/sm/onboard', payload).catch(() => ({ source_id: payload.source_id, configured: false })); },
    // INTENT — surfaces a costing/research request (never buys); local ack if the
    // proxy has no /sm/research worker yet (results fill the fields when it runs).
    async research(payload) { return post('/sm/research', payload).catch(() => ({ queued: true, surface_id: payload.surface_id, note: 'surfaced locally — costing worker applies results when it runs' })); },
    // live probe-run state (the engine writes it to 7688; the proxy reads it back)
    async probeStatus() { return get('/sm/probe/status').catch(() => ({ running: null, queue: [], done: [] })); },
    // analyst runs client-side, grounded in the LIVE read model (deterministic; an
    // LLM analyst is a later server-side swap). "what's runnable now" -> V-015.
    // REAL LLM analyst, grounded server-side in live state + corpus + banked lessons.
    // A chat attachment stays client-side (discussion-only). Honest fallback to the
    // rule-matcher on API/key error — never an empty shell.
    async analyst({ ask, attachment, history }) {
      if (attachment) return groundedAnalyst(ask, q, { attachment });
      return post('/sm/analyst/ask', { ask, history: (history || []).map((m) => ({ role: m.role, text: m.text })) })
        .catch(() => groundedAnalyst(ask, q));
    },
    // GATED LEARNING — read lessons; Bank/Reject are the operator's gate
    async lessons() { return get('/sm/lessons').then((r) => r.lessons || []).catch(() => []); },
    async bankLesson(id) { return post('/sm/lesson/bank', { lesson_id: id }).catch(() => ({ status: 'error' })); },
    async rejectLesson(id) { return post('/sm/lesson/reject', { lesson_id: id }).catch(() => ({ status: 'error' })); },
    async proposeLesson(text, source) { return post('/sm/lesson/propose', { text, source }).catch(() => ({ status: 'error' })); },
    // ENGINE POWER SWITCH -> /sm/engine/* (falls back to the mock state machine)
    async engineStatus() { return get('/sm/engine/status').catch(() => file.engineStatus()); },
    async engineStart() { return post('/sm/engine/start', {}).catch(() => file.engineStart()); },
    async engineStop() { return post('/sm/engine/stop', {}).catch(() => file.engineStop()); },
    // PROXY POWER SWITCH — /sm/proxy/*. During a restart the surface is briefly down,
    // so an unreachable status reads as 'restarting' (the app polls until 'running').
    async proxyStatus() { return get('/sm/proxy/status').catch(() => ({ status: 'unreachable' })); },
    async proxyRestart() { return post('/sm/proxy/restart', {}).catch(() => ({ action: 'restart', status: 'restarting' })); },
  };
}

// analyst grounded in the current read model: answers "what's runnable now" with the
// runnable-now board item(s) (V-015), else the deterministic classify/route.
export async function groundedAnalyst(ask, queryFn, opts = {}) {
  const a = (ask || '').toLowerCase();
  const has = (...ks) => ks.some((k) => a.includes(k));
  // a chat attachment is DISCUSSION ONLY — reasoned over here, never engine state
  const att = opts.attachment;
  if (att) {
    const head = (att.text || '').split('\n').find((l) => l.trim()) || '';
    const kind = /[,;]\s*\S+[,;]/.test(head) ? 'a delimited dataset'
      : /^[#*\-]/.test(head) ? 'a markdown/notes document' : 'a text document';
    const q = ask.trim() ? ` On your question — ${ask.trim()} — I'll reason from what the file says together with the live state.` : '';
    return { kind: 'EXPLAIN',
      explanation: `I've read "${att.name}" (${att.size} bytes) — looks like ${kind}. First line: “${head.slice(0, 80)}”.${q} `
        + `This stays a discussion attachment: I reason over it here, but it never becomes engine state or seeds the graph.` };
  }
  // recheck / revival / watch questions — grounded in the LIVE watches + scan_history
  if (has('recheck', 'revive', 'revival', 'watch', 'scan', 'due', 'last checked', 'ran')) {
    let watches = [], scans = [];
    try { watches = (await queryFn('watches')) || []; } catch { watches = []; }
    try { scans = (await queryFn('scan_history')) || []; } catch { scans = []; }
    // a named watch (e.g. "did the B-AG recheck run")
    const named = watches.find((w) => a.includes(String(w.id).toLowerCase()));
    if (named) {
      return { kind: 'EXPLAIN',
        explanation: `${named.id}: ${named.disposition} watch, trigger = ${named.trigger}. Recheck due ${named.recheck_due}; `
          + `last checked ${named.last_checked || 'never'} → status ${named.status}. `
          + (named.status === 'REVIVED' ? 'It revived — it is now a candidate on the board (a gated call).'
            : named.status === 'ran-no-change' ? 'The monitor re-scanned it and it stayed dead (no regime/data reversion).'
              : 'It has not fired yet — waiting for its trigger.')
          + ' This reads the live monitor state; a re-probe is a gated search decision.' };
    }
    if (watches.length) {
      const last = scans[0];
      const due = watches.filter((w) => w.status === 'waiting').map((w) => `${w.id} (${w.recheck_due})`);
      return { kind: 'EXPLAIN',
        explanation: `${watches.length} revival watches are live. `
          + (last ? `Last scan ${last.at}: evaluated ${last.evaluated}, ${last.revived || 0} revived. ` : '')
          + (due.length ? `Awaiting their trigger: ${due.slice(0, 6).join('; ')}.` : 'All were re-scanned this cycle.')
          + ' Read-only over the monitor state — reviving a kill is a gated call.' };
    }
  }
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
