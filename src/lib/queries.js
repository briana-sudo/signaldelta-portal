// ─────────────────────────────────────────────────────────────
// Query NAME strings for the SignalDelta portal proxy.
//
// Previously this file exported raw Cypher strings used by a direct
// neo4j-driver session. Per Path B (FastAPI proxy on XPS 15 +
// TryCloudflare HTTPS tunnel), the portal now POSTs a query NAME +
// params dict to https://<proxy>/query with Authorization: Bearer.
// The proxy maintains the actual Cypher whitelist in its queries.py.
//
// The portal can never inject arbitrary Cypher — only the 20 names
// below are callable, and each is server-side hardcoded.
//
// Param shape per query (validated server-side):
//   Q_RETURNS_MATRIX_CELL          : { asset_class, track }
//   Q_RETURNS_MATRIX_SIGMA_ROW     : { track }
//   Q_RETURNS_MATRIX_SIGMA_COL     : { asset_class }
//   Q_TRADE_OVERLAY_ENRICHMENT     : { request_id }
//   everything else                : {} (no params)
//
// Reconciliation v1.2 sourcing: original 10 + Section D additions
// (D1 equity curve, D2 returns matrix, D3 rules) + mount-time +
// per-event. Twenty names total.
// ─────────────────────────────────────────────────────────────

// ── Original 10: panel-by-panel set ──
export const Q_ACCOUNT_BAR = 'account_bar';
export const Q_WEEKLY_WATERFALL = 'weekly_waterfall';
export const Q_OPEN_POSITIONS = 'open_positions';
export const Q_RECENT_EVENTS = 'recent_events';
export const Q_WIN_RATE = 'win_rate';
export const Q_SHARPE = 'sharpe_ratio';
export const Q_LANE2_DELTA = 'lane2_delta';
export const Q_CONVICTION = 'conviction_tiers';
export const Q_KERNEL_NODES = 'kernel_nodes';
export const Q_KERNEL_EDGES = 'kernel_edges';

// ── Section D1: Equity Curve ──
export const Q_EQUITY_CURVE = 'equity_curve_series';
export const Q_EQUITY_HEADER = 'equity_curve_stats';

// ── Section D2: Returns by Domain matrix ──
export const Q_RETURNS_CELL = 'returns_matrix_cell';
export const Q_RETURNS_SIGMA_ROW = 'returns_matrix_sigma_row';
export const Q_RETURNS_SIGMA_COL = 'returns_matrix_sigma_col';
export const Q_RETURNS_SIGMA_CORNER = 'returns_matrix_sigma_corner';

// ── Section D3: Rules Added This Week ──
export const Q_RULES_THIS_WEEK = 'rules_this_week';
export const Q_RULES_FOOT = 'rules_footer';
// 2026-06-08: closest single-dimension cohort to the rule-action floor — powers
// the "RULES ADDED" empty-state progress bar toward the first rule.
export const Q_CLOSEST_COHORT = 'closest_cohort';

// ── Mount-time + per-event ──
export const Q_MONITORED_ASSETS = 'monitored_assets';
export const Q_TRADE_OVERLAY_ENRICHMENT = 'trade_overlay_enrichment';

// ── Engine heartbeat (reconciliation Section K) ──
// Returns single row {last_engine_write: ISO timestamp} — max across the 6
// engine-written node types. Drives the LIVE/STALE/STOPPED EnginePill.
export const Q_ENGINE_HEARTBEAT = 'engine_heartbeat';

// ── Portal v1.1 Change 2: trade list (replaces open_positions panel) ──
// Both OPEN and CLOSED TradeNodes, cutoff-filtered server-side, ordered
// DESC by entry_timestamp, LIMIT 12.
export const Q_TRADE_LIST = 'trade_list_recent';

// ── Portal v1.1 Change 3A: news ticker (per-asset NewsContextNode feed) ──
// Non-QUIET only, ordered DESC by written_at, LIMIT 50.
export const Q_NEWS_TICKER = 'news_ticker_recent';

// ── Portal v1.2 scanner-cycle dispatch (2026-05-26): per-asset most-recent
// composite_score for the Signal Scanner panel. Caller must supply
// { asset_list: string[] } (from a mount-time monitored_assets read).
// Cutoff is auto-injected by the proxy. Rows missing for any asset → that
// asset renders as "BUILDING DATA" (no recent trade).
// SUPERSEDED by Q_SCANNER_LIVE_STATE (Tier 2, 2026-06-09) — kept for reference.
export const Q_SCANNER_SCORES = 'scanner_scores';

// ── Scanner Tier 2 (2026-06-09): LIVE per-bar gate state from
// ScannerLiveStateNode. No params. The proxy enriches each row with the
// server-side GO decision (G1∧G2∧G3∧tradable∧fresh) + composite + direction.
// Rows missing for a monitored asset → "BUILDING DATA".
export const Q_SCANNER_LIVE_STATE = 'scanner_live_state';

// ── Session 40 portal rebuild (2026-05-29): latest EquitySnapshotNode.
// Provides the equity_total denominator for the broker-sourced Today P&L
// (Today P&L = broker equity − latest snapshot equity_total). No cutoff.
export const Q_EQUITY_SNAPSHOT_LATEST = 'equity_snapshot_latest';

// ── Portal v1.14 P1.3/P1.4 (2026-05-30): M4 §6 health strip + detail view.
// account_state: one row per AccountStateNode (M4 §2 schema). Empty until
// engine M4 Task 6 ships → strip renders AWAITING ACCOUNT STATE.
// account_health_history: last-24h Layer4AnomalyNode (ACCOUNT_HEALTH_*
// types) for the detail-view history block; `details` is JSON, portal
// filters by account_id at render time.
export const Q_ACCOUNT_STATE = 'account_state';
export const Q_ACCOUNT_HEALTH_HISTORY = 'account_health_history';

// Mode toggle helper — Phase 4 will append phase filter server-side once
// §14 amendments land the `phase` field on TradeNode + WeeklyContextNode
// + EquitySnapshotNode. Phase 1.1 returns null (no filter) since the
// engine isn't writing `phase` yet. Kept here so the portal can pass
// `mode` through to the proxy without each consumer rebuilding the map.
export function phaseFilterParams(mode) {
  if (mode === 'live') return { allowed_phases: ['Live Crypto', 'Live Stocks'] };
  if (mode === 'training') return { allowed_phases: ['Paper'] };
  return null; // combined — caller omits the AND clause
}
