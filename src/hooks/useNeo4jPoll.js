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
} from '../lib/queries.js';

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
    callMacroNews(),
  ];
  if (includeScanner) {
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

  // Scanner scores (last entry — conditionally appended)
  if (includeScanner) {
    const scannerResult = settled[QUERY_SPECS.length + 1];
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

    // Mount-time fetch of the canonical monitored asset list. Used by every
    // subsequent poll to drive scanner_scores. Failure here is non-fatal —
    // the scanner panel will render BUILDING DATA placeholders.
    (async () => {
      try {
        const rows = await callProxy('monitored_assets');
        const list = rows?.[0]?.asset_list ?? [];
        if (Array.isArray(list) && list.length > 0) {
          monitoredAssetsRef.current = list;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[signaldelta] mount-time monitored_assets fetch failed:', e);
      }
    })();

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
    tick();
    timer = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      mounted.current = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  return { data, errors, hasAnyData, error, loading };
}

export async function fetchTradeOverlayEnrichment(requestId) {
  const rows = await callProxy('trade_overlay_enrichment', { request_id: requestId });
  return rows[0] ?? null;
}

export async function fetchMonitoredAssets() {
  const rows = await callProxy('monitored_assets');
  return rows[0]?.asset_list ?? [];
}
