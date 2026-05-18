// ─────────────────────────────────────────────────────────────
// Cypher query set for the 60-second poll plus per-event and
// mount-time queries. DEFERRED Step D module — not imported by
// components in Steps E–H. Sources:
//   - Original reconciliation §Panel-by-Panel + §Consolidated Poll
//   - Reconciliation v1.1 Section D (D1 Equity Curve, D2 Returns
//     Matrix, D3 Rules Added) and Section E (mode toggle filter)
//
// Section H punchlist fields (`TradeNode.asset_class`,
// `TradeNode.phase`, EquitySnapshotNode TWR/PEAK/DD) are written
// against documented field names; queries return empty until the
// §14 / §17 amendments land. The portal's bootstrap-state pattern
// covers the gap automatically on the next poll.
// ─────────────────────────────────────────────────────────────

// ── Account bar composite (capital base, equity, today P&L, counts) ──
export const Q_ACCOUNT_BAR = `
  MATCH (c:TradingConfigNode)
  WITH c.paper_starting_capital AS capital_base
  OPTIONAL MATCH (e:EquitySnapshotNode)
  WITH capital_base, e ORDER BY e.snapshot_date DESC LIMIT 1
  OPTIONAL MATCH (t_all:TradeNode)
  WITH capital_base, e, count(t_all) AS trade_count
  OPTIONAL MATCH (t_open:TradeNode {status: 'OPEN'})
  RETURN capital_base,
         e.equity_total AS current_value,
         e.dollar_pnl_today AS today_pnl,
         e.percent_pnl_today AS today_pnl_pct,
         e.sync_timestamp AS last_sync,
         trade_count,
         count(t_open) AS open_count
`;

// ── Weekly waterfall (last 6 WeeklyContextNodes) ──
export const Q_WEEKLY_WATERFALL = `
  MATCH (w:WeeklyContextNode)
  RETURN w.week_start_date AS week_start,
         w.system_weekly_pnl_pct AS pnl_pct
  ORDER BY w.week_start_date DESC
  LIMIT 6
`;

// ── Open positions (≤3 OPEN TradeNodes; current_price cosmetic per Q1) ──
export const Q_OPEN_POSITIONS = `
  MATCH (t:TradeNode {status: 'OPEN'})
  RETURN t.request_id AS request_id,
         t.asset AS asset,
         t.track AS track,
         t.conviction_tier AS conviction,
         t.entry_price AS entry_price,
         t.stop_loss_price AS stop_price,
         t.target_price AS target_price,
         t.direction AS direction,
         t.entry_timestamp AS entry_timestamp
  ORDER BY t.entry_timestamp DESC
  LIMIT 3
`;

// ── Recent system events (last 30 minutes, ≤12) ──
export const Q_RECENT_EVENTS = `
  MATCH (e:SystemEventNode)
  WHERE e.timestamp >= datetime() - duration('PT30M')
  RETURN e.event_id AS event_id,
         e.event_type AS event_type,
         e.event_subtype AS event_subtype,
         e.asset AS asset,
         e.timestamp AS event_timestamp,
         e.summary AS summary,
         e.severity AS severity
  ORDER BY e.timestamp DESC
  LIMIT 12
`;

// ── Win rate (CLOSED TradeNodes aggregate) ──
export const Q_WIN_RATE = `
  MATCH (t:TradeNode {status: 'CLOSED'})
  RETURN count(t) AS total_closed,
         sum(CASE WHEN t.win_loss = 'Win' THEN 1 ELSE 0 END) AS wins,
         avg(CASE WHEN t.win_loss = 'Win' THEN 1.0 ELSE 0.0 END) * 100 AS win_rate_pct
`;

// ── Sharpe Ratio (latest WeeklyContextNode) ──
export const Q_SHARPE = `
  MATCH (w:WeeklyContextNode)
  RETURN w.sharpe_ratio_combined AS sr,
         w.sharpe_ratio_crypto AS sr_crypto,
         w.sharpe_ratio_stocks AS sr_stocks,
         w.total_trades_week AS week_trades,
         w.week_start_date AS as_of
  ORDER BY w.week_start_date DESC
  LIMIT 1
`;

// ── Lane 2 Δ delta (L1 win rate, L2 confirmation rate, lane2_enabled) ──
export const Q_LANE2_DELTA = `
  MATCH (t:TradeNode {status: 'CLOSED'})
  WITH count(t) AS closed_count,
       avg(CASE WHEN t.win_loss = 'Win' THEN 1.0 ELSE 0.0 END) AS l1_rate
  OPTIONAL MATCH (p:PredictionNode)
  WHERE p.status IN ['CONFIRMED', 'INVALIDATED']
  WITH closed_count, l1_rate,
       count(p) AS resolved_count,
       avg(CASE WHEN p.status = 'CONFIRMED' THEN 1.0 ELSE 0.0 END) AS l2_rate
  MATCH (c:TradingConfigNode)
  RETURN closed_count,
         l1_rate * 100 AS l1_win_rate_pct,
         resolved_count,
         l2_rate * 100 AS l2_confirm_rate_pct,
         (l2_rate - l1_rate) * 100 AS delta_pct,
         c.lane2_enabled AS lane2_enabled
`;

// ── Conviction tier distribution ──
export const Q_CONVICTION = `
  MATCH (t:TradeNode)
  WITH count(t) AS total
  MATCH (t:TradeNode)
  RETURN t.conviction_tier AS tier,
         count(t) AS tier_count,
         (count(t) * 1.0 / total) * 100 AS tier_pct
`;

// ── Kernel map: IndicatorNodes (returns empty in Phase 1) ──
export const Q_KERNEL_NODES = `
  MATCH (i:IndicatorNode)
  RETURN i.node_id AS node_id,
         i.cluster AS cluster,
         i.confirmation_rate AS confirmation_rate,
         i.prediction_count AS prediction_count,
         i.weight AS weight,
         i.last_active AS last_active,
         i.status AS status,
         i.added_cycle AS added_cycle
`;

// ── Kernel map: CO_OCCURS_WITH edges (returns empty in Phase 1) ──
export const Q_KERNEL_EDGES = `
  MATCH (i1:IndicatorNode)-[r:CO_OCCURS_WITH]->(i2:IndicatorNode)
  RETURN i1.node_id AS source_id,
         i2.node_id AS target_id,
         r.strength AS edge_opacity_source,
         r.count AS edge_count
`;

// ── Equity Curve series (Section D1 — 60 calendar days rolling) ──
export const Q_EQUITY_CURVE = `
  MATCH (e:EquitySnapshotNode)
  WHERE e.snapshot_date >= date() - duration({days: 60})
  RETURN e.snapshot_date AS snapshot_date,
         e.equity_total AS equity
  ORDER BY e.snapshot_date ASC
`;

// ── Equity Curve header stats (Section D1 — PEAK / DD / TWR) ──
export const Q_EQUITY_HEADER = `
  MATCH (e:EquitySnapshotNode)
  RETURN e.peak_equity_to_date AS peak,
         e.max_drawdown_to_date_percent AS drawdown_pct,
         e.twr_to_date_percent AS twr_pct,
         e.snapshot_date AS as_of
  ORDER BY e.snapshot_date DESC
  LIMIT 1
`;

// ── Returns by Domain matrix (Section D2 — per cell aggregation) ──
// Application layer computes win_rate / sharpe_ratio / total_return from rows.
// Mode toggle filter appends: AND t.phase IN $allowed_phases
//   LIVE → ['Live Crypto', 'Live Stocks']
//   TRAINING → ['Paper']
//   COMBINED → no extra filter (omit clause)
export const Q_RETURNS_CELL = `
  MATCH (t:TradeNode {status: 'CLOSED'})
  WHERE t.asset_class = $asset_class
    AND t.track = $track
  WITH count(t) AS total,
       sum(CASE WHEN t.win_loss = 'Win' THEN 1 ELSE 0 END) AS wins,
       collect(t.pnl_percent) AS returns
  RETURN total, wins, returns
`;

// ── Rules Added This Week (Section D3 — Mon 00:00 UTC – Sun 23:59 UTC) ──
export const Q_RULES_THIS_WEEK = `
  MATCH (r:TradingRuleNode)
  WHERE r.created_timestamp >= date.truncate('week', date())
  RETURN r.rule_id AS rule_id,
         r.section AS section,
         r.created_timestamp AS created,
         r.cycle_number AS cycle,
         r.summary AS summary
  ORDER BY r.created_timestamp DESC
  LIMIT 5
`;

// ── Rules footer composite (X RULES · CYCLE Y · TOTAL Z) ──
export const Q_RULES_FOOT = `
  MATCH (r:TradingRuleNode)
  WITH count(r) AS total,
       max(r.cycle_number) AS latest_cycle
  OPTIONAL MATCH (r2:TradingRuleNode)
  WHERE r2.created_timestamp >= date.truncate('week', date())
  RETURN total, latest_cycle, count(r2) AS this_week_count
`;

// ── Per-event: trade overlay enrichment (TradeNode + PredictionNode join) ──
export const Q_TRADE_OVERLAY_ENRICHMENT = `
  MATCH (t:TradeNode {request_id: $request_id})
  OPTIONAL MATCH (t)-[:HAS_PREDICTION]->(p:PredictionNode)
  RETURN t.asset AS asset,
         t.track AS track,
         t.conviction_tier AS conviction,
         t.entry_price AS entry_price,
         t.exit_price AS exit_price,
         t.stop_loss_price AS stop_price,
         t.target_price AS target_price,
         t.composite_score AS composite_score,
         t.lane2_score AS lane2_score,
         t.rsi_at_entry AS rsi,
         t.ema_signal AS ema_signal,
         t.vwap_position AS vwap_position,
         t.macd_signal AS macd_signal,
         t.pnl_dollar AS pnl_dollar,
         t.pnl_percent AS pnl_percent,
         t.exit_reason AS exit_reason,
         t.win_loss AS win_loss,
         t.hold_duration_min AS hold_duration_min,
         t.status AS status,
         p.lane2_confidence AS lane2_confidence,
         p.status AS prediction_status
`;

// ── Mount-time: monitored asset list (Scanner + Ticker symbol source) ──
export const Q_MONITORED_ASSETS = `
  MATCH (c:TradingConfigNode)
  RETURN c.monitored_assets AS asset_list
`;

// Mode toggle helper — appends phase filter to a base WHERE clause.
// Per Section E: LIVE filters to live trades; TRAINING to paper; COMBINED no filter.
export function phaseFilterParams(mode) {
  if (mode === 'live') return { allowed_phases: ['Live Crypto', 'Live Stocks'] };
  if (mode === 'training') return { allowed_phases: ['Paper'] };
  return null; // combined — caller omits the AND clause
}
