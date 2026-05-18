// ─────────────────────────────────────────────────────────────
// 60-second proxy poll hook.
//
// Path B architecture: this hook fetches every panel's data from the
// FastAPI proxy (signaldelta-portal-proxy) over a TryCloudflare HTTPS
// tunnel. The proxy holds the Cypher whitelist; the portal POSTs a
// query NAME plus params dict and a bearer token. The portal can
// never inject arbitrary Cypher.
//
// Env vars (Vite — must be set as GitHub Secrets and injected by the
// deploy workflow):
//   VITE_PROXY_URL        — TryCloudflare tunnel URL, e.g.
//                           https://something-something.trycloudflare.com
//                           (no trailing slash). Regenerated every time
//                           the tunnel restarts — update Secret + redeploy.
//   VITE_PROXY_API_TOKEN  — 32-char bearer token shared with the proxy's
//                           PROXY_API_TOKEN env var.
//
// NOT imported by any component yet. Components consume the static
// placeholders.js until the operator wires the proxy live. To activate:
//   - in App.jsx:  const { data, loading, error } = useNeo4jPoll();
//   - pass `data` down to PCApp / MobileApp instead of placeholders.
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
  const [
    accountBar, weeklyWaterfall, positions, events,
    winRate, sharpe, lane2, conviction,
    kernelNodes, kernelEdges,
    equityCurve, equityHeader,
    rulesThisWeek, rulesFoot,
  ] = await Promise.all([
    callProxy(Q_ACCOUNT_BAR),
    callProxy(Q_WEEKLY_WATERFALL),
    callProxy(Q_OPEN_POSITIONS),
    callProxy(Q_RECENT_EVENTS),
    callProxy(Q_WIN_RATE),
    callProxy(Q_SHARPE),
    callProxy(Q_LANE2_DELTA),
    callProxy(Q_CONVICTION),
    callProxy(Q_KERNEL_NODES),
    callProxy(Q_KERNEL_EDGES),
    callProxy(Q_EQUITY_CURVE),
    callProxy(Q_EQUITY_HEADER),
    callProxy(Q_RULES_THIS_WEEK),
    callProxy(Q_RULES_FOOT),
  ]);
  return {
    accountBar: accountBar[0] ?? null,
    weeklyWaterfall,
    positions,
    events,
    winRate: winRate[0] ?? null,
    sharpe: sharpe[0] ?? null,
    lane2: lane2[0] ?? null,
    conviction,
    kernelNodes,
    kernelEdges,
    equityCurve,
    equityHeader: equityHeader[0] ?? null,
    rulesThisWeek,
    rulesFoot: rulesFoot[0] ?? null,
    pollTimestamp: new Date().toISOString(),
  };
}

export function useNeo4jPoll() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let timer = null;
    async function tick() {
      try {
        const next = await pollOnce();
        if (mounted.current) {
          setData(next);
          setError(null);
          setLoading(false);
        }
      } catch (e) {
        if (mounted.current) {
          setError(e);
          setLoading(false);
        }
      }
    }
    tick();
    timer = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      mounted.current = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  return { data, error, loading };
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
