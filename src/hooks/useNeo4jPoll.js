// ─────────────────────────────────────────────────────────────
// 60-second Neo4j poll hook — DEFERRED Step D module.
//
// Runs all per-poll Cypher queries via Promise.all against a
// shared Bolt session and returns a typed shape that matches the
// placeholders module so App.jsx can swap one source for the other.
//
// NOT imported in Steps E–H. Components consume the static
// placeholders.js until Aura migration completes. To activate:
//   - import this hook in App.jsx
//   - pass returned `data` to PCApp / MobileApp instead of placeholders
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { getDriver } from '../lib/neo4j.js';
import {
  Q_ACCOUNT_BAR, Q_WEEKLY_WATERFALL, Q_OPEN_POSITIONS, Q_RECENT_EVENTS,
  Q_WIN_RATE, Q_SHARPE, Q_LANE2_DELTA, Q_CONVICTION,
  Q_KERNEL_NODES, Q_KERNEL_EDGES,
  Q_EQUITY_CURVE, Q_EQUITY_HEADER,
  Q_RULES_THIS_WEEK, Q_RULES_FOOT,
} from '../lib/queries.js';

const POLL_INTERVAL_MS = 60_000;

async function runOne(session, cypher) {
  const r = await session.run(cypher);
  return r.records.map((rec) => rec.toObject());
}

async function pollOnce() {
  const session = getDriver().session({ defaultAccessMode: 'READ' });
  try {
    const [
      accountBar, weeklyWaterfall, positions, events,
      winRate, sharpe, lane2, conviction,
      kernelNodes, kernelEdges,
      equityCurve, equityHeader,
      rulesThisWeek, rulesFoot,
    ] = await Promise.all([
      runOne(session, Q_ACCOUNT_BAR),
      runOne(session, Q_WEEKLY_WATERFALL),
      runOne(session, Q_OPEN_POSITIONS),
      runOne(session, Q_RECENT_EVENTS),
      runOne(session, Q_WIN_RATE),
      runOne(session, Q_SHARPE),
      runOne(session, Q_LANE2_DELTA),
      runOne(session, Q_CONVICTION),
      runOne(session, Q_KERNEL_NODES),
      runOne(session, Q_KERNEL_EDGES),
      runOne(session, Q_EQUITY_CURVE),
      runOne(session, Q_EQUITY_HEADER),
      runOne(session, Q_RULES_THIS_WEEK),
      runOne(session, Q_RULES_FOOT),
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
  } finally {
    await session.close();
  }
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
