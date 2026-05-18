// ─────────────────────────────────────────────────────────────
// 60-second proxy poll hook with Promise.allSettled resilience.
//
// Each whitelisted query is dispatched independently. A failure in
// one query no longer aborts the whole cycle — the others' results
// still land in `data`, the failure is logged with its query name,
// and the corresponding panel falls back to bootstrap state via its
// adapter returning null.
//
// Return shape:
//   data         — { accountBar, weeklyWaterfall, positions, events,
//                    winRate, sharpe, lane2, conviction, kernelNodes,
//                    kernelEdges, equityCurve, equityHeader,
//                    rulesThisWeek, rulesFoot, pollTimestamp }
//                  each slice is null/[] when its query failed or
//                  returned empty.
//   errors       — { <query_name>: errorMessage } for any rejected
//                  query in the most recent cycle. {} when all green.
//   hasAnyData   — true when at least one slice contains data.
//                  Drives the PROXY ERROR (no data) vs PARTIAL DATA
//                  (some failed) banner state in App.
//   loading      — true until the first cycle settles.
//   error        — set only when getProxyConfig() throws (missing
//                  env vars). Never set for in-flight query failures.
//
// Env vars (Vite — injected by .github/workflows/deploy.yml from GH Secrets):
//   VITE_PROXY_URL        — TryCloudflare tunnel URL (no trailing slash)
//   VITE_PROXY_API_TOKEN  — 32-char bearer token shared with proxy .env
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import {
  Q_ACCOUNT_BAR, Q_WEEKLY_WATERFALL, Q_OPEN_POSITIONS, Q_RECENT_EVENTS,
  Q_WIN_RATE, Q_SHARPE, Q_LANE2_DELTA, Q_CONVICTION,
  Q_KERNEL_NODES, Q_KERNEL_EDGES,
  Q_EQUITY_CURVE, Q_EQUITY_HEADER,
  Q_RULES_THIS_WEEK, Q_RULES_FOOT,
} from '../lib/queries.js';

const POLL_INTERVAL_MS = 60_000;

// Per-poll query specs. `key` is the data slice name; `singleton: true`
// extracts rows[0] (queries that always return ≤1 aggregation row).
const QUERY_SPECS = [
  { key: 'accountBar',       name: Q_ACCOUNT_BAR,      singleton: true  },
  { key: 'weeklyWaterfall',  name: Q_WEEKLY_WATERFALL, singleton: false },
  { key: 'positions',        name: Q_OPEN_POSITIONS,   singleton: false },
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
    } catch {
      // ignore JSON parse errors on error responses
    }
    throw new Error(`Proxy '${name}' failed: ${detail}`);
  }
  const payload = await res.json();
  return payload.rows ?? [];
}

async function pollOnce() {
  const settled = await Promise.allSettled(
    QUERY_SPECS.map((spec) => callProxy(spec.name)),
  );
  const data = { pollTimestamp: new Date().toISOString() };
  const errors = {};
  let anyData = false;

  settled.forEach((result, i) => {
    const spec = QUERY_SPECS[i];
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
  });

  return { data, errors, hasAnyData: anyData };
}

export function useNeo4jPoll() {
  const [data, setData] = useState(null);
  const [errors, setErrors] = useState({});
  const [hasAnyData, setHasAnyData] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let timer = null;
    async function tick() {
      try {
        const next = await pollOnce();
        if (!mounted.current) return;
        setData(next.data);
        setErrors(next.errors);
        setHasAnyData(next.hasAnyData);
        setError(null);
        setLoading(false);
      } catch (e) {
        // Reached only when getProxyConfig() throws (missing env vars). With
        // allSettled, individual query failures don't bubble here — they land
        // in `errors`.
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

// Per-event helper — call from the trade overlay when a new TRADE_OPENED /
// TRADE_CLOSED event surfaces in the feed. Bypasses the 60s cadence.
export async function fetchTradeOverlayEnrichment(requestId) {
  const rows = await callProxy('trade_overlay_enrichment', { request_id: requestId });
  return rows[0] ?? null;
}

// Mount-time helper — call once at portal load for the Scanner asset list.
export async function fetchMonitoredAssets() {
  const rows = await callProxy('monitored_assets');
  return rows[0]?.asset_list ?? [];
}
