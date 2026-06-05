// ─────────────────────────────────────────────────────────────
// 60-second proxy poll hook with Promise.allSettled resilience.
//
// Per Portal v1.1 dispatch 2026-05-26, the poll now also fetches macro
// news (GET /macro_news, separate from /query). Both run in the same
// allSettled batch so a /macro_news upstream failure doesn't block the
// Cypher queries (and vice-versa).
//
// Return shape:
//   data         — { accountBar, weeklyWaterfall, tradeList, events,
//                    winRate, sharpe, lane2, conviction, kernelNodes,
//                    kernelEdges, equityCurve, equityHeader,
//                    rulesThisWeek, rulesFoot, heartbeat,
//                    newsTicker, macroNews, pollTimestamp }
//   errors       — { <query_name>: errorMessage } for any rejected
//                  query/endpoint this cycle. {} when all green.
//   hasAnyData   — true when at least one slice contains data.
//   loading      — true until the first cycle settles.
//   error        — set only when getProxyConfig() throws (missing env).
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import {
  Q_ACCOUNT_BAR, Q_WEEKLY_WATERFALL, Q_RECENT_EVENTS,
  Q_WIN_RATE, Q_SHARPE, Q_LANE2_DELTA, Q_CONVICTION,
  Q_KERNEL_NODES, Q_KERNEL_EDGES,
  Q_EQUITY_CURVE, Q_EQUITY_HEADER,
  Q_RULES_THIS_WEEK, Q_RULES_FOOT,
  Q_ENGINE_HEARTBEAT,
  Q_TRADE_LIST, Q_NEWS_TICKER,
  Q_SCANNER_SCORES,
  Q_EQUITY_SNAPSHOT_LATEST,
  Q_ACCOUNT_STATE, Q_ACCOUNT_HEALTH_HISTORY,
} from '../lib/queries.js';
import { etDayRange } from '../lib/etDay.js';

const POLL_INTERVAL_MS = 60_000;

const QUERY_SPECS = [
  { key: 'accountBar',       name: Q_ACCOUNT_BAR,      singleton: true  },
  { key: 'weeklyWaterfall',  name: Q_WEEKLY_WATERFALL, singleton: false },
  { key: 'tradeList',        name: Q_TRADE_LIST,       singleton: false },
  { key: 'events',           name: Q_RECENT_EVENTS,    singleton: false },
  { key: 'winRate',          name: Q_WIN_RATE,         singleton: true  },
  { key: 'sharpe',           name: Q_SHARPE,           singleton: true  },
  { key: 'lane2',            name: Q_LANE2_DELTA,      singleton: true  },
  { key: 'conviction',       name: Q_CONVICTION,       singleton: false },
  { key: 'kernelNodes',      name: Q_KERNEL_NODES,     singleton: false },
  { key: 'kernelEdges',      name: Q_KERNEL_EDGES,     singleton: false },
  { key: 'equityCurve',      name: Q_EQUITY_CURVE,     singleton: false },
  { key: 'equityHeader',     name: Q_EQUITY_HEADER,    singleton: true  },
  { key: 'rulesThisWeek',    name: Q_RULES_THIS_WEEK,  singleton: false },
  { key: 'rulesFoot',        name: Q_RULES_FOOT,       singleton: true  },
  { key: 'heartbeat',        name: Q_ENGINE_HEARTBEAT, singleton: true  },
  { key: 'newsTicker',       name: Q_NEWS_TICKER,      singleton: false },
  { key: 'equitySnapshotLatest', name: Q_EQUITY_SNAPSHOT_LATEST, singleton: true },
  // Portal v1.14 P1.3/P1.4 (2026-05-30): M4 §6 health strip + detail view.
  // Both are non-singleton: account_state returns one row per account_id
  // (multi-account future-proofing); account_health_history returns up to
  // 200 anomaly events from the last 24h, portal filters by account_id.
  { key: 'accountState',         name: Q_ACCOUNT_STATE,           singleton: false },
  { key: 'accountHealthHistory', name: Q_ACCOUNT_HEALTH_HISTORY,  singleton: false },
];

function getProxyConfig() {
  const url = import.meta.env.VITE_PROXY_URL;
  const token = import.meta.env.VITE_PROXY_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      'Proxy credentials missing. Set VITE_PROXY_URL and VITE_PROXY_API_TOKEN ' +
      'as GitHub Secrets and confirm injection in .github/workflows/deploy.yml.',
    );
  }
  return { url: url.replace(/\/$/, ''), token };
}

async function callProxy(name, params = {}) {
  const { url, token } = getProxyConfig();
  const res = await fetch(`${url}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, params }),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body && body.detail) detail = body.detail;
    } catch { /* ignore */ }
    throw new Error(`Proxy '${name}' failed: ${detail}`);
  }
  const payload = await res.json();
  return payload.rows ?? [];
}

async function callMacroNews() {
  const { url, token } = getProxyConfig();
  const res = await fetch(`${url}/macro_news`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body && body.detail) detail = body.detail;
    } catch { /* ignore */ }
    throw new Error(`Proxy '/macro_news' failed: ${detail}`);
  }
  return await res.json(); // { feed, cache, age_seconds, ... }
}

// Session 40: live Alpaca account + positions via GET /broker_account.
// No proxy cache — each 60s poll hits the broker fresh. On 503/failure the
// proxy returns {error, account:null, positions:[]}; we surface that shape
// so the Account Bar degrades to dashes rather than crashing.
async function callBrokerAccount() {
  const { url, token } = getProxyConfig();
  const res = await fetch(`${url}/broker_account`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  // 503 returns a JSON body {error, account:null, positions:[]} — read it
  // rather than throwing, so a broker outage degrades gracefully.
  let payload = null;
  try { payload = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    return payload ?? { error: `HTTP ${res.status}`, account: null, positions: [] };
  }
  return payload; // { account, positions, fetched_at_ms }
}

// Portal v1.17 (2026-05-30): RETURNS BY DOMAIN — 16 parallel calls per poll.
// Fans out the 4 returns_matrix_* whitelisted queries (proxy already has
// them at queries.py:353-399; both CUTOFF_QUERIES + FORENSIC_QUERIES
// auto-inject). Returns a structured { cells, sigmaPerTrack,
// sigmaPerAssetClass, corner } object keyed by the canonical enums
// (asset_class = "Crypto"/"Large-cap stock"/"Growth stock" per engine
// threshold_evaluation.py:92; track = "Conservative"/"Moderate"/"Aggressive").
//
// PROXY AGGREGATION → VISUAL RIM MAPPING:
//   returns_matrix_sigma_row (param: track)         → bottom rim per-track
//   returns_matrix_sigma_col (param: asset_class)   → right  rim per-asset-class
//   returns_matrix_sigma_corner (no params)         → bottom-right grand total
// (Proxy naming uses "row/col" from the trade-aggregation viewpoint, not the
//  visual grid orientation — kept as-is here since the queries are already
//  shipped and whitelisted; portal adapter abstracts the rim labels.)
const RM_ASSET_CLASSES = ['Crypto', 'Large-cap stock', 'Growth stock'];
const RM_TRACKS = ['Conservative', 'Moderate', 'Aggressive'];
async function callReturnsMatrix() {
  const cellPromises = [];
  for (const ac of RM_ASSET_CLASSES) {
    for (const tr of RM_TRACKS) {
      cellPromises.push(
        callProxy('returns_matrix_cell', { asset_class: ac, track: tr })
          .then((rows) => ({ ac, tr, row: rows?.[0] ?? null }))
          .catch((e) => ({ ac, tr, row: null, error: e?.message ?? String(e) }))
      );
    }
  }
  const sigmaRowPromises = RM_TRACKS.map((tr) =>
    callProxy('returns_matrix_sigma_row', { track: tr })
      .then((rows) => ({ tr, row: rows?.[0] ?? null }))
      .catch((e) => ({ tr, row: null, error: e?.message ?? String(e) }))
  );
  const sigmaColPromises = RM_ASSET_CLASSES.map((ac) =>
    callProxy('returns_matrix_sigma_col', { asset_class: ac })
      .then((rows) => ({ ac, row: rows?.[0] ?? null }))
      .catch((e) => ({ ac, row: null, error: e?.message ?? String(e) }))
  );
  const cornerPromise = callProxy('returns_matrix_sigma_corner')
    .then((rows) => rows?.[0] ?? null)
    .catch((e) => ({ error: e?.message ?? String(e), total: 0, wins: 0, returns: [] }));

  const [cellResults, sigmaRowResults, sigmaColResults, cornerResult] = await Promise.all([
    Promise.all(cellPromises),
    Promise.all(sigmaRowPromises),
    Promise.all(sigmaColPromises),
    cornerPromise,
  ]);
  const cells = {};
  for (const { ac, tr, row, error } of cellResults) {
    cells[`${ac}:${tr}`] = row || { total: 0, wins: 0, returns: [], error: error ?? null };
  }
  const sigmaPerTrack = {};
  for (const { tr, row, error } of sigmaRowResults) {
    sigmaPerTrack[tr] = row || { total: 0, wins: 0, returns: [], error: error ?? null };
  }
  const sigmaPerAssetClass = {};
  for (const { ac, row, error } of sigmaColResults) {
    sigmaPerAssetClass[ac] = row || { total: 0, wins: 0, returns: [], error: error ?? null };
  }
  return {
    cells,
    sigmaPerTrack,
    sigmaPerAssetClass,
    corner: cornerResult || { total: 0, wins: 0, returns: [] },
    assetClasses: RM_ASSET_CLASSES,
    tracks: RM_TRACKS,
  };
}

// Portal v1.11 (2026-05-29): live bottom price ticker via GET /price_ticker.
// Replaces the hardcoded TICKER literal + cosmetic wobble. Proxy fans out to
// two batched Alpaca snapshot calls (stocks SIP + crypto) keyed off the
// graph's monitored_assets. 503 returns {error, stocks:[], crypto:[]} —
// surfaced so the Ticker shows "PRICE FEED OFFLINE" instead of stale list.
async function callPriceTicker() {
  const { url, token } = getProxyConfig();
  const res = await fetch(`${url}/price_ticker`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  let payload = null;
  try { payload = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    return payload ?? { error: `HTTP ${res.status}`, stocks: [], crypto: [] };
  }
  return payload; // { fetched_at_ms, stocks: [...], crypto: [...] }
}

async function pollOnce(monitoredAssets) {
  // Portal v1.2 scanner-cycle dispatch (2026-05-26):
  // scanner_scores joins the batch when `monitoredAssets` is populated by
  // the mount-time fetch. Until then it's skipped (the first tick may run
  // before mount-fetch completes; the second tick onward picks it up).
  // The mount-time list is reused every poll — assets are stable for the
  // session and don't need to be re-fetched on the 60s cadence.
  const includeScanner = Array.isArray(monitoredAssets) && monitoredAssets.length > 0;

  const calls = [
    ...QUERY_SPECS.map((spec) => callProxy(spec.name)),
    callMacroNews(),       // index = QUERY_SPECS.length
    callBrokerAccount(),   // index = QUERY_SPECS.length + 1
    callPriceTicker(),     // index = QUERY_SPECS.length + 2 (v1.11)
    callReturnsMatrix(),   // index = QUERY_SPECS.length + 3 (v1.17)
    callTradesClosedDay(etDayRange(0)), // index = QUERY_SPECS.length + 4 (Rev 42 — today's ET-day closed feed for DAY W/L)
  ];
  if (includeScanner) {
    // index = QUERY_SPECS.length + 5 (after macro + broker + price ticker + returns matrix + closed-day)
    calls.push(callProxy('scanner_scores', { asset_list: monitoredAssets }));
  }
  const settled = await Promise.allSettled(calls);

  const data = { pollTimestamp: new Date().toISOString(), monitoredAssets: monitoredAssets || [] };
  const errors = {};
  let anyData = false;

  // Process Cypher query results
  for (let i = 0; i < QUERY_SPECS.length; i++) {
    const spec = QUERY_SPECS[i];
    const result = settled[i];
    if (result.status === 'fulfilled') {
      const rows = result.value;
      const value = spec.singleton ? (rows[0] ?? null) : rows;
      data[spec.key] = value;
      const present = spec.singleton
        ? value !== null
        : Array.isArray(value) && value.length > 0;
      if (present) anyData = true;
    } else {
      // eslint-disable-next-line no-console
      console.error(`[signaldelta] poll '${spec.name}' failed:`, result.reason);
      errors[spec.name] = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
      data[spec.key] = spec.singleton ? null : [];
    }
  }

  // Macro news result (next entry)
  const macroResult = settled[QUERY_SPECS.length];
  if (macroResult.status === 'fulfilled') {
    data.macroNews = macroResult.value;
    if (Array.isArray(data.macroNews?.feed) && data.macroNews.feed.length > 0) {
      anyData = true;
    }
  } else {
    // eslint-disable-next-line no-console
    console.error(`[signaldelta] poll '/macro_news' failed:`, macroResult.reason);
    errors.macro_news = macroResult.reason instanceof Error
      ? macroResult.reason.message
      : String(macroResult.reason);
    data.macroNews = null;
  }

  // Broker account (Session 40) — index = QUERY_SPECS.length + 1
  const brokerResult = settled[QUERY_SPECS.length + 1];
  if (brokerResult.status === 'fulfilled') {
    data.brokerAccount = brokerResult.value; // {account, positions, fetched_at_ms} or {error,...}
    if (data.brokerAccount?.account != null) {
      anyData = true;
    } else if (data.brokerAccount?.error) {
      errors.broker_account = data.brokerAccount.error;
    }
  } else {
    // eslint-disable-next-line no-console
    console.error(`[signaldelta] poll '/broker_account' failed:`, brokerResult.reason);
    errors.broker_account = brokerResult.reason instanceof Error
      ? brokerResult.reason.message
      : String(brokerResult.reason);
    data.brokerAccount = { error: 'fetch_failed', account: null, positions: [] };
  }

  // Price ticker (v1.11) — index = QUERY_SPECS.length + 2
  const tickerResult = settled[QUERY_SPECS.length + 2];
  if (tickerResult.status === 'fulfilled') {
    data.priceTicker = tickerResult.value; // {fetched_at_ms, stocks, crypto} or {error,...}
    const okStocks = Array.isArray(data.priceTicker?.stocks) && data.priceTicker.stocks.length > 0;
    const okCrypto = Array.isArray(data.priceTicker?.crypto) && data.priceTicker.crypto.length > 0;
    if (okStocks || okCrypto) {
      anyData = true;
    } else if (data.priceTicker?.error) {
      errors.price_ticker = data.priceTicker.error;
    }
  } else {
    // eslint-disable-next-line no-console
    console.error(`[signaldelta] poll '/price_ticker' failed:`, tickerResult.reason);
    errors.price_ticker = tickerResult.reason instanceof Error
      ? tickerResult.reason.message
      : String(tickerResult.reason);
    data.priceTicker = { error: 'fetch_failed', stocks: [], crypto: [] };
  }

  // Returns matrix (v1.17) — index = QUERY_SPECS.length + 3
  const rmResult = settled[QUERY_SPECS.length + 3];
  if (rmResult.status === 'fulfilled') {
    data.returnsMatrix = rmResult.value; // {cells, sigmaPerTrack, sigmaPerAssetClass, corner, assetClasses, tracks}
    if (data.returnsMatrix?.corner?.total > 0) anyData = true;
  } else {
    // eslint-disable-next-line no-console
    console.error(`[signaldelta] poll returns_matrix_* failed:`, rmResult.reason);
    errors.returns_matrix = rmResult.reason instanceof Error
      ? rmResult.reason.message
      : String(rmResult.reason);
    data.returnsMatrix = null;
  }

  // Trades closed today (ET) — Rev 42 — index = QUERY_SPECS.length + 4.
  // Powers the DAY W/L (ET) banner stat. Raw rows (win_loss per row). On the
  // proxy 400 (trades_closed_day not yet whitelisted / NSSM not restarted) we
  // store null so the banner shows a dash rather than a misleading 0/0.
  const closedDayResult = settled[QUERY_SPECS.length + 4];
  if (closedDayResult.status === 'fulfilled') {
    data.tradesClosedToday = Array.isArray(closedDayResult.value) ? closedDayResult.value : [];
    if (data.tradesClosedToday.length > 0) anyData = true;
  } else {
    // eslint-disable-next-line no-console
    console.error(`[signaldelta] poll 'trades_closed_day' failed:`, closedDayResult.reason);
    errors.trades_closed_day = closedDayResult.reason instanceof Error
      ? closedDayResult.reason.message
      : String(closedDayResult.reason);
    data.tradesClosedToday = null;
  }

  // Scanner scores (last entry — conditionally appended); Rev 42: index shifted +4 → +5
  if (includeScanner) {
    const scannerResult = settled[QUERY_SPECS.length + 5];
    if (scannerResult.status === 'fulfilled') {
      data.scannerScores = scannerResult.value;
      if (Array.isArray(scannerResult.value) && scannerResult.value.length > 0) anyData = true;
    } else {
      // eslint-disable-next-line no-console
      console.error(`[signaldelta] poll 'scanner_scores' failed:`, scannerResult.reason);
      errors.scanner_scores = scannerResult.reason instanceof Error
        ? scannerResult.reason.message
        : String(scannerResult.reason);
      data.scannerScores = [];
    }
  } else {
    data.scannerScores = [];
  }

  return { data, errors, hasAnyData: anyData };
}

export function useNeo4jPoll() {
  const [data, setData] = useState(null);
  const [errors, setErrors] = useState({});
  const [hasAnyData, setHasAnyData] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  const monitoredAssetsRef = useRef(null);

  useEffect(() => {
    mounted.current = true;
    let timer = null;
    let assetsTimer = null;

    // Canonical monitored asset list. Drives scanner_scores' asset_list param
    // and the scanner column's row set. v1.7 Fix 2 (2026-05-29): refresh on a
    // 5-min cadence instead of caching once at mount — Session 40 confirmed
    // TradingConfigNode.monitored_assets is edited mid-session, and the prior
    // mount-only read left the scanner showing a stale list until page reload.
    // The next 60s poll picks up the updated ref automatically (pollOnce reads
    // monitoredAssetsRef.current each tick). Failure is non-fatal.
    async function refreshMonitoredAssets() {
      try {
        const rows = await callProxy('monitored_assets');
        const list = rows?.[0]?.asset_list ?? [];
        if (Array.isArray(list) && list.length > 0) {
          monitoredAssetsRef.current = list;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[signaldelta] monitored_assets refresh failed:', e);
      }
    }
    async function tick() {
      try {
        const next = await pollOnce(monitoredAssetsRef.current);
        if (!mounted.current) return;
        setData(next.data);
        setErrors(next.errors);
        setHasAnyData(next.hasAnyData);
        setError(null);
        setLoading(false);
      } catch (e) {
        if (!mounted.current) return;
        setError(e);
        setLoading(false);
      }
    }

    // v1.8 P1 (2026-05-29): cold-open fetch-on-mount. The prior pattern
    // fired `tick()` SYNCHRONOUSLY right after kicking off the mount-time
    // monitored_assets fetch, so tick #1 ran with ref=null → includeScanner
    // false → scanner_scores skipped → whole scanner showed BUILDING DATA
    // until tick #2 at +60s. Now: await the mount fetch first so the ref is
    // populated, THEN fire tick (scanner_scores enters the first batch),
    // THEN start the 60s poll interval + the 5-min monitored_assets refresh.
    // Net: scores populate at t<2s instead of t≈60s.
    async function bootstrap() {
      await refreshMonitoredAssets();              // sets monitoredAssetsRef.current
      if (!mounted.current) return;
      await tick();                                // first poll with scanner_scores
      if (!mounted.current) return;
      timer = setInterval(tick, POLL_INTERVAL_MS);
      assetsTimer = setInterval(refreshMonitoredAssets, 300_000);  // every 5 min
    }
    bootstrap();
    return () => {
      mounted.current = false;
      if (timer) clearInterval(timer);
      if (assetsTimer) clearInterval(assetsTimer);
    };
  }, []);

  return { data, errors, hasAnyData, error, loading };
}

export async function fetchTradeOverlayEnrichment(requestId) {
  const rows = await callProxy('trade_overlay_enrichment', { request_id: requestId });
  return rows[0] ?? null;
}

// Portal Rev 32 (2026-06-05): on-demand windowed trade fetch for the EXPAND
// modal. NOT part of the 60s pollOnce batch — the modal calls this on open and
// on window-preset change. `windowStartIso` is ISO-8601 UTC; the proxy reuses
// the same $cutoff + $forensic_ids auto-injection trade_list_recent uses, so
// modal scope == panel scope. Returns the raw row array (same shape as
// trade_list_recent) for adaptTradeList() to map unchanged.
export async function callTradesWindow(windowStartIso) {
  return callProxy('trade_list_window', { window_start: windowStartIso });
}

// Portal Rev 42 (2026-06-04): single-ET-day CLOSED feed (exit_timestamp in
// [day_start, day_end)). Powers the DAY W/L (ET) banner stat (today bucket,
// fetched in the poll cycle) and the ALL TRADES modal day buckets. Returns the
// raw row array (same shape as trade_list_recent) for adaptTradeList / counts.
export async function callTradesClosedDay({ day_start, day_end }) {
  return callProxy('trades_closed_day', { day_start, day_end });
}

export async function fetchMonitoredAssets() {
  const rows = await callProxy('monitored_assets');
  return rows[0]?.asset_list ?? [];
}
