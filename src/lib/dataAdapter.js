// ─────────────────────────────────────────────────────────────
// Data adapter — converts raw useNeo4jPoll() output to panel-ready
// shapes that mirror placeholders.js. Each adapter returns null
// when the underlying query is missing/empty, signaling the panel
// to render its bootstrap state instead.
//
// Per Brian's first-poll-verification instruction: "gracefully fall
// back to bootstrap states when individual queries return empty
// arrays". Adapters do the empty-check; panels do the conditional
// render. Loading (data === null) is treated the same as empty.
// ─────────────────────────────────────────────────────────────

// ── Track and conviction mappings (raw enum → dense-UI tokens) ───────
const TRACK_MAP = {
  Conservative: { cls: 'con', label: 'CON' },
  Moderate:     { cls: 'mod', label: 'MOD' },
  Aggressive:   { cls: 'agg', label: 'AGG' },
};
const CONV_MAP = {
  Standard: { cls: 'std', label: 'STD' },
  High:     { cls: 'hi',  label: 'HIGH' },
  Maximum:  { cls: 'max', label: 'MAX' },
};

function trackInfo(track) {
  return TRACK_MAP[track] ?? { cls: 'mod', label: String(track ?? '—').toUpperCase().slice(0, 3) };
}
function convInfo(conv) {
  return CONV_MAP[conv] ?? { cls: 'std', label: String(conv ?? '—').toUpperCase().slice(0, 4) };
}

// ── Time helpers ─────────────────────────────────────────────────────
// Per reconciliation Section E.2: portal display layer is US Eastern Time
// (EDT/EST with auto-DST via IANA 'America/New_York'). Storage in Neo4j and
// query responses stay UTC; conversion happens here at the render boundary.
// Hold duration is a delta, not an instant — no timezone applies, so the
// computation stays in pure ms math.
const TZ = 'America/New_York';

function pad2(n) { return String(n).padStart(2, '0'); }

// ET HH:MM (24h) for the Event Feed time column. Keeps the dense-UI vibe.
const ET_HHMM_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour: '2-digit', minute: '2-digit', hour12: false,
});

function fmtHHMM(iso) {
  if (!iso) return '--:--';
  return ET_HHMM_FORMATTER.format(new Date(iso));
}

// Weekday abbrev in ET (e.g., 'MON', 'TUE'). Used for the Rules Added panel
// day badges. Per Section E.2 this matters at the day boundary — a rule
// written at Monday 02:00 UTC is Sunday 21:00 ET (winter) or 22:00 ET
// (summer), badge should read SUN.
const ET_WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  weekday: 'short',
});

function dayAbbrevET(iso) {
  if (!iso) return '---';
  return ET_WEEKDAY_FORMATTER.format(new Date(iso)).toUpperCase();
}

// Portal v1.13 (2026-05-29): closed-trade close-time sub-line.
// Used by PCApp TradeListRow + MobileApp MobileTradeCard CLOSED branches
// to render "Closed HH:MM ET" (same-day) or "Closed Mon HH:MM ET"
// (different ET day from now). Returns '' for null so the JSX can guard
// without rendering an empty "Closed " prefix.
const ET_YMD_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
});
function dayKeyET(d) { return ET_YMD_FORMATTER.format(d); }   // e.g. "2026-05-29"
const ET_WEEKDAY_SHORT_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  weekday: 'short',
});
function dayShortET(d) {
  // Title-cased "Sat", "Mon" (matches the dispatch's "Sat 13:53 ET" example).
  return ET_WEEKDAY_SHORT_FORMATTER.format(d);
}
export function fmtCloseET(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameDay = dayKeyET(d) === dayKeyET(new Date());
  const hhmm = ET_HHMM_FORMATTER.format(d);
  return sameDay ? `${hhmm} ET` : `${dayShortET(d)} ${hhmm} ET`;
}

function computeHold(entryIso) {
  if (!entryIso) return '—';
  const entry = new Date(entryIso).getTime();
  const now = Date.now();
  const mins = Math.max(0, Math.floor((now - entry) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${pad2(m)}m` : `${m}m`;
}

// ── Symbol normalization ─────────────────────────────────────────────
// Alpaca keys crypto positions as "BTCUSD"; the graph stores "BTC/USD".
// Normalize both to the slash-less broker form for cross-source matching.
function normSymbol(s) {
  return typeof s === 'string' ? s.replace('/', '').toUpperCase() : '';
}

// ── Broker positions (Session 40) ─────────────────────────────────────
// Build a lookup of normalized-symbol → current_price from the live
// /broker_account positions array, for the trade-list OPEN-row Current
// column and the reconciliation indicator.
export function adaptBrokerPositions(data) {
  const positions = Array.isArray(data?.brokerAccount?.positions)
    ? data.brokerAccount.positions
    : [];
  const priceBySymbol = new Map();
  const symbols = new Set();
  for (const p of positions) {
    const sym = normSymbol(p?.symbol);
    if (!sym) continue;
    symbols.add(sym);
    const cp = p?.current_price != null ? Number(p.current_price) : null;
    if (cp != null && Number.isFinite(cp)) priceBySymbol.set(sym, cp);
  }
  return { priceBySymbol, symbols, count: positions.length };
}

// ── Account bar (Session 40 rebuild 2026-05-29) ───────────────────────
// Live-state surfaces now read from Alpaca broker directly (via the
// proxy's /broker_account), NOT from a graph-derived synthetic equity.
// History/analytics surfaces stay on the graph.
//
// Source-of-truth map (Session 40 spec):
//   CAPITAL BASE  ← graph: TradingConfigNode.paper_starting_capital (account_bar.capital_base)
//   CURRENT VALUE ← broker: brokerAccount.account.equity (live, no drift)
//   TOTAL RETURN  ← graph: (latest snapshot equity_total − capital_base)/capital_base (unchanged path)
//   TODAY P&L     ← hybrid: broker equity − latest EquitySnapshotNode.equity_total
//   TRADES        ← graph: win_rate.total_closed (CLOSED count, forensic-excluded at proxy)
//   OPEN          ← broker: brokerAccount.positions.length
//
// The v1.2 synthetic-equity fallback is removed — Alpaca is now the
// source of truth for current value. `brokerOk=false` when the broker
// read failed (proxy 503); the component shows dashes for broker-sourced
// fields while keeping graph-sourced fields (capital base, total return).
export function adaptAccountBar(data) {
  const ab = data?.accountBar;
  const acct = data?.brokerAccount?.account ?? null;
  const brokerOk = acct != null && acct.equity != null && Number.isFinite(Number(acct.equity));

  // Need at least the graph config row to render anything meaningful.
  if (!ab && !brokerOk) return null;

  const capitalBase = Number(ab?.capital_base) || 0;

  // CURRENT VALUE — broker equity (live).
  const currentValue = brokerOk ? Number(acct.equity) : null;

  // OPEN count — v1.8 (2026-05-29): bound to account_bar.open_count (graph
  // OPEN TradeNode count, post-cutoff + forensic-excluded) so the banner
  // matches the trade-list panel's OPEN count. Was broker positions.length
  // (per-symbol, 3); now the graph-open count (also 3 once the orphan
  // TS-20260529-0001 is excluded). Mirrors the `ab?.x != null ? Number(...) : null`
  // null-safety pattern used by the other ab.* reads on this object.
  const open = ab?.open_count != null ? Number(ab.open_count) : null;

  // TODAY P&L — v1.6 fix (2026-05-29): broker equity minus broker
  // `last_equity` (Alpaca's prior trading-day close). This replaces the
  // stale-EquitySnapshotNode baseline that produced a phantom −$406 (the
  // latest snapshot was 2026-05-28's inflated 10414.91, >1 day old).
  // last_equity is always the broker's real prior-day close, fresh from the
  // same /broker_account read. Falls back to the snapshot baseline only if
  // last_equity is absent (older proxy not yet restarted).
  const lastEquity = acct?.last_equity != null ? Number(acct.last_equity) : null;
  const snapEquity = data?.equitySnapshotLatest?.equity_total != null
    ? Number(data.equitySnapshotLatest.equity_total)
    : null;
  const todayBaseline = (lastEquity != null && Number.isFinite(lastEquity) && lastEquity > 0)
    ? lastEquity
    : (snapEquity != null && Number.isFinite(snapEquity) ? snapEquity : null);
  const todayPnl = (brokerOk && todayBaseline != null)
    ? Number(acct.equity) - todayBaseline
    : null;

  // TOTAL RETURN — graph path, unchanged: latest snapshot equity vs capital
  // base. Uses the account_bar Cypher's current_value (cutoff-filtered
  // EquitySnapshotNode equity_total). Stays graph-sourced per Session 40.
  const graphEquity = ab?.current_value != null ? Number(ab.current_value) : null;
  const totalReturnPct = (graphEquity != null && Number.isFinite(graphEquity) && capitalBase)
    ? ((graphEquity - capitalBase) / capitalBase) * 100
    : null;

  // TRADES — v1.8 (2026-05-29): banner shows TOTAL (open+closed), current-era.
  // Bound to account_bar.trade_count (= count of ALL post-cutoff,
  // forensic-excluded TradeNodes — same cutoff+forensic scope as win_rate).
  // Dropped the prior winRate.total_closed (closed-only) binding entirely.
  const trades = ab?.trade_count != null ? Number(ab.trade_count) : 0;

  return {
    capitalBase,
    currentValue,
    todayPnl,
    totalReturnPct,
    trades,
    open,
    currentPhase: ab?.current_phase || 'Paper',
    lastSync: data?.brokerAccount?.fetched_at_ms ?? ab?.last_sync ?? null,
    brokerOk,
    cash: brokerOk && acct.cash != null ? Number(acct.cash) : null,
    buyingPower: brokerOk && acct.buying_power != null ? Number(acct.buying_power) : null,
  };
}

// ── Reconciliation indicator (Session 40 CHANGE 5) ────────────────────
// Compares broker open positions against graph OPEN TradeNodes (already
// forensic-excluded at the proxy via trade_list_recent). Returns
// { diff:boolean, brokerCount, graphCount, onlyBroker:[...], onlyGraph:[...] }.
// diff=true → the portal shows the amber "RECON DIFF" pill near EnginePill.
export function adaptReconciliation(data) {
  // Broker side
  const broker = adaptBrokerPositions(data);
  if (data?.brokerAccount?.account == null) {
    // Broker unavailable — can't reconcile; suppress the pill (don't false-alarm).
    return { diff: false, brokerCount: null, graphCount: null, unavailable: true };
  }
  // Graph side — OPEN trades from the cutoff+forensic-filtered trade list.
  const tradeRows = Array.isArray(data?.tradeList) ? data.tradeList : [];
  const graphOpen = new Set();
  let graphOpenCount = 0;          // raw OPEN trade count (per-trade)
  for (const t of tradeRows) {
    if (t?.status === 'OPEN' && t.asset) {
      graphOpen.add(normSymbol(t.asset));
      graphOpenCount += 1;
    }
  }
  // v1.6 Fix 3 (2026-05-29): count-aware reconciliation. The prior symbol-
  // set diff missed the 2-positions-vs-3-trades case (two SPY trades dedupe
  // to one symbol). Compare RAW COUNTS — broker positions.length vs graph
  // OPEN TradeNode count — as the primary trigger, AND keep the symbol-set
  // diff for cases where counts match but assets differ.
  const brokerPosCount = Array.isArray(data?.brokerAccount?.positions)
    ? data.brokerAccount.positions.length : broker.symbols.size;
  const onlyBroker = [...broker.symbols].filter((s) => !graphOpen.has(s));
  const onlyGraph = [...graphOpen].filter((s) => !broker.symbols.has(s));
  const countMismatch = brokerPosCount !== graphOpenCount;
  const symbolMismatch = onlyBroker.length > 0 || onlyGraph.length > 0;
  const diff = countMismatch || symbolMismatch;
  return {
    diff,
    brokerCount: brokerPosCount,   // raw broker positions
    graphCount: graphOpenCount,    // raw graph OPEN trades
    onlyBroker,
    onlyGraph,
    countMismatch,
    symbolMismatch,
    unavailable: false,
  };
}

// ── Weekly waterfall ─────────────────────────────────────────────────
export function adaptWeeklyWaterfall(data) {
  const rows = data?.weeklyWaterfall;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  // Query returns DESC by week_start_date; reverse to oldest-first for W1..Wn.
  const asc = [...rows].reverse();
  return asc.map((w, i) => ({
    w: `W${i + 1}`,
    // Portal v1.12 (2026-05-29): engine writes WeeklyContextNode.system_weekly_pnl_pct
    // as a decimal FRACTION (e.g. -0.00552 = -0.55%). Portal placeholder + render
    // expressions were authored in already-scaled percent units (e.g. 3.2 = 3.2%),
    // so concatenating raw with '%' produced "-0.0055242552789600404%". Multiply
    // by 100 here so `w.p` matches the placeholder convention; both render sites
    // (PCApp MiniWaterfall + MobileApp MobileWaterfall) and the bar-fill height
    // calc (Math.abs(w.p)/maxP * barH) all re-scale correctly from this one point.
    p: (Number(w.pnl_pct) || 0) * 100,
    pos: Number(w.pnl_pct) >= 0,
    cur: i === asc.length - 1,
  }));
}

// ── Trade list (Portal v1.1 Change 2; Session 40 CHANGE 3) ───────────
// Returns BOTH open and closed trades, server-side cutoff + forensic
// filtered. Each row carries enough fields for the panel's render logic:
//   - OPEN  rows: Current column = live broker current_price (Session 40),
//     matched by normalized symbol against /broker_account positions;
//     falls back to entry_price if the broker has no matching position.
//   - CLOSED rows: Current column = exit_price; pnl_dollar/pnl_percent are
//     realized; win_loss drives the WIN/LOSS final-outcome bar.
export function adaptTradeList(data) {
  const rows = data?.tradeList;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const { priceBySymbol } = adaptBrokerPositions(data);
  return rows.map((r) => {
    const t = trackInfo(r.track);
    const c = convInfo(r.conviction);
    const entry = Number(r.entry_price) || 0;
    const exit = r.exit_price != null ? Number(r.exit_price) : null;
    const stop = Number(r.stop_price) || 0;
    const target = Number(r.target_price) || 0;
    const status = r.status || 'OPEN';
    const realizedPnl = r.realized_pnl != null ? Number(r.realized_pnl)
                      : r.pnl_dollar != null ? Number(r.pnl_dollar)
                      : 0;
    // OPEN current price from the live broker position (Session 40 CHANGE 3),
    // matched on normalized symbol. Fall back to entry when no broker match.
    const brokerCur = priceBySymbol.get(normSymbol(r.asset));
    const openCur = (brokerCur != null && Number.isFinite(brokerCur)) ? brokerCur : entry;
    return {
      asset: r.asset,
      track: t.cls,
      tl: t.label,
      conv: c.cls,
      cl: c.label,
      entry,
      cur: status === 'CLOSED' ? (exit ?? entry) : openCur,
      brokerPriced: status !== 'CLOSED' && brokerCur != null && Number.isFinite(brokerCur),
      exit,
      stop,
      target,
      status,
      pnl: status === 'CLOSED' ? realizedPnl : 0,
      pnlPct: r.pnl_percent != null ? Number(r.pnl_percent) : 0,
      hold: status === 'CLOSED' && r.hold_duration_min != null
            ? formatHoldMinutes(Number(r.hold_duration_min))
            : computeHold(r.entry_timestamp),
      winLoss: r.win_loss || null,
      exitReason: r.exit_reason || null,
      requestId: r.request_id,
      direction: r.direction,
      entryTimestamp: r.entry_timestamp,
      exitTimestamp: r.exit_timestamp,
      // Portal v1.14 P1.2 (2026-05-30): trade_id exposed for the M4 monitor-
      // coverage badge (joined against AccountStateNode.monitor_coverage_
      // unmonitored_trade_ids). Was filtered on in the WHERE clause but
      // never SELECTed; bumping the proxy + threading through the adapter.
      tradeId: r.trade_id,
    };
  });
}

function formatHoldMinutes(mins) {
  if (!Number.isFinite(mins)) return '—';
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return h > 0 ? `${h}h ${pad2(m)}m` : `${m}m`;
}

// ── Event feed ───────────────────────────────────────────────────────
// Reconciliation §System Event Feed: maps §14 event_type → portal render class.
const EVENT_RENDER = {
  TRADE_OPENED:           { cls: 'open',       icon: '▶' },
  TRADE_CLOSED:           { cls: 'close-win',  icon: '✓' }, // win/loss split by event_subtype
  RULE_WRITTEN:           { cls: 'rule',       icon: '§' },
  THRESHOLD_HIT:          { cls: 'signal',     icon: '◈' },
  RSI_DIVERGENCE:         { cls: 'signal',     icon: '◈' },
  SHARPE_BAND_TRANSITION: { cls: 'loop',       icon: '⟳' },
  PHASE_GATE_PASSED:      { cls: 'gate',       icon: '◆' },
  MANUAL_OVERRIDE:        { cls: 'close-loss', icon: '✗' },
};

export function adaptEvents(data) {
  const rows = data?.events;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.map((e) => {
    const base = EVENT_RENDER[e.event_type] ?? { cls: 'sync', icon: '◉' };
    let cls = base.cls;
    let icon = base.icon;
    if (e.event_type === 'TRADE_CLOSED') {
      if (e.event_subtype === 'Stop hit' || e.event_subtype === 'Manual override') {
        cls = 'close-loss';
        icon = '✗';
      }
    }
    const text = e.summary || [e.event_type, e.asset].filter(Boolean).join(' · ');
    return {
      cls,
      icon,
      text,
      val: null,    // value column from §System Event Feed value-join is a follow-up
      valcls: '',
      t: fmtHHMM(e.event_timestamp),
      eventId: e.event_id,
    };
  });
}

// ── Win rate ─────────────────────────────────────────────────────────
export function adaptWinRate(data) {
  const w = data?.winRate;
  if (!w || !Number(w.total_closed)) return null;
  return {
    pct: Number(w.win_rate_pct) || 0,
    wins: Number(w.wins) || 0,
    total: Number(w.total_closed) || 0,
  };
}

// ── Sharpe ratio ─────────────────────────────────────────────────────
// v1.7 Fix 1 staleness cutoff (2026-05-29): hide the Sharpe card whenever the
// source WeeklyContextNode's week_start_date predates this date. The only WCN
// in the graph is the stale pre-rebuild 2026-05-18 node (sharpe −2.18); the
// v1.6 closed-count gate released the moment closed trades existed, letting
// the stale −2.18 reappear. This staleness gate hides it regardless of closed
// count. Cutoff is 2026-05-25 (Monday) NOT 2026-05-26: the current trading
// week starts Mon 2026-05-25, so a fresh current-week WCN (week_start_date
// 2026-05-25) must pass the gate once §10/§11 writes it — using 2026-05-26
// would wrongly hide that legitimate node too. When the engine writes the
// fresh WCN, this gate releases automatically.
const SHARPE_STALE_CUTOFF = '2026-05-25';

export function adaptSharpe(data) {
  const s = data?.sharpe;
  if (!s || s.sr == null) return null;

  // Staleness gate (v1.7): week_start_date is an ISO 'YYYY-MM-DD' string —
  // lexicographic compare is correct. Missing or pre-cutoff → AWAITING.
  const weekStart = s.as_of != null ? String(s.as_of) : null;
  if (!weekStart || weekStart < SHARPE_STALE_CUTOFF) return null;

  // Closed-count gate (v1.6): AWAITING until qualifying closed trades exist.
  const closed = data?.winRate?.total_closed != null
    ? Number(data.winRate.total_closed) : 0;
  if (!(closed > 0)) return null;

  return {
    sr: Number(s.sr) || 0,
    weekTrades: Number(s.week_trades) || 0,
    asOf: s.as_of || null,
  };
}

// ── Lane 2 Δ ─────────────────────────────────────────────────────────
// Phase 1.1 always renders OFFLINE per Section A. The query result is still
// adapted in case future panels want raw numbers, but the card stays amber-OFFLINE
// until lane2_enabled flips true and resolved_count >= 50.
export function adaptLane2(data) {
  const l = data?.lane2;
  if (!l) return null;
  return {
    closedCount: Number(l.closed_count) || 0,
    resolvedCount: Number(l.resolved_count) || 0,
    l1WinRatePct: Number(l.l1_win_rate_pct) || 0,
    l2ConfirmRatePct: Number(l.l2_confirm_rate_pct) || 0,
    deltaPct: Number(l.delta_pct) || 0,
    lane2Enabled: !!l.lane2_enabled,
  };
}

// ── Conviction tiers ─────────────────────────────────────────────────
export function adaptConviction(data) {
  const rows = data?.conviction;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const map = { Standard: 0, High: 0, Maximum: 0 };
  let total = 0;
  rows.forEach((r) => {
    if (r.tier in map) {
      map[r.tier] = Number(r.tier_pct) || 0;
      total += Number(r.tier_count) || 0;
    }
  });
  if (total === 0) return null;
  const ranked = [
    ['STD', map.Standard],
    ['HIGH', map.High],
    ['MAX', map.Maximum],
  ].sort((a, b) => b[1] - a[1]);
  return {
    std: map.Standard,
    high: map.High,
    max: map.Maximum,
    dominantLabel: ranked[0][0],
    dominantPct: ranked[0][1],
    total,
  };
}

// ── Equity curve (series + stats) ────────────────────────────────────
export function adaptEquityCurve(data) {
  const series = data?.equityCurve;
  if (!Array.isArray(series) || series.length < 2) return null;
  return series.map((p) => ({
    date: p.snapshot_date,
    equity: Number(p.equity) || 0,
  }));
}

export function adaptEquityHeader(data) {
  const h = data?.equityHeader;
  if (!h) return null;
  return {
    peak: Number(h.peak) || 0,
    drawdownPct: Number(h.drawdown_pct) || 0,
    twrPct: Number(h.twr_pct) || 0,
    asOf: h.as_of || null,
  };
}

// ── Rules added this week ────────────────────────────────────────────
// Day badge derived from created_timestamp converted to ET before extracting
// day-of-week, per Section E.2. The week BOUNDARY (Monday 00:00 UTC) is
// preserved on the engine side per Section D3 — only the badge label uses ET.
export function adaptRulesThisWeek(data) {
  const rows = data?.rulesThisWeek;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.map((r) => ({
    sec: r.section || 'A',
    day: dayAbbrevET(r.created),
    text: [r.summary || ''],
    ruleId: r.rule_id,
  }));
}

export function adaptRulesFoot(data) {
  const f = data?.rulesFoot;
  if (!f) return null;
  return {
    thisWeek: Number(f.this_week_count) || 0,
    cycle: Number(f.latest_cycle) || 0,
    total: Number(f.total) || 0,
  };
}

// ── Engine heartbeat (reconciliation Section K) ──────────────────────
// Returns { state, minutesAgo, lastWriteEt, lastWriteIso } or null.
// State thresholds:
//   LIVE     (green pulse)       — last engine write within 7 minutes
//   STALE    (amber slow pulse)  — 7 to 30 minutes since last write
//   STOPPED  (red, no pulse)     — 30+ minutes since last write OR no data
// 7-min LIVE threshold accommodates the 5-min stock REST polling cycle
// plus headroom; 30-min STOPPED threshold catches genuine engine death
// without flapping on normal idle gaps.
const ET_HEARTBEAT_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  year: 'numeric', month: 'short', day: '2-digit',
  hour: 'numeric', minute: '2-digit', hour12: true,
});

export function adaptHeartbeat(data) {
  const h = data?.heartbeat;
  if (!h || !h.last_engine_write) {
    return { state: 'stopped', minutesAgo: null, lastWriteEt: null, lastWriteIso: null };
  }
  const iso = h.last_engine_write;
  const lastMs = new Date(iso).getTime();
  if (!Number.isFinite(lastMs)) {
    return { state: 'stopped', minutesAgo: null, lastWriteEt: null, lastWriteIso: iso };
  }
  const minutesAgo = Math.max(0, Math.floor((Date.now() - lastMs) / 60_000));
  const state = minutesAgo <= 7 ? 'live'
              : minutesAgo <= 30 ? 'stale'
              : 'stopped';
  const lastWriteEt = ET_HEARTBEAT_FORMATTER.format(new Date(iso));
  return { state, minutesAgo, lastWriteEt, lastWriteIso: iso };
}

// ── News ticker (Portal v1.1 Change 3A) ──────────────────────────────
// Per-asset NewsContextNode feed (non-QUIET only). Each ticker item:
//   asset (string), impact_level (HIGH|MEDIUM|LOW|NONE), impact_class
//   ('high'|'med'|'low'), event_summary (string), source (string), time_ago
export function adaptNewsTicker(data) {
  const rows = data?.newsTicker;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.map((r) => ({
    asset: r.asset || '—',
    impact_level: r.impact_level || 'NONE',
    impact_class: impactClass(r.impact_level),
    event_summary: r.event_summary || '',
    source: r.source || '',
    time_ago: r.written_at ? minutesAgoLabel(r.written_at) : '',
    written_at: r.written_at,
    event_type: r.event_type,
  }));
}

function impactClass(label) {
  if (label === 'HIGH') return 'high';
  if (label === 'MEDIUM') return 'med';
  if (label === 'LOW') return 'low';
  return 'low';
}

function minutesAgoLabel(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const ms = Date.now() - t;
  if (ms < 60_000) return 'now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

// ── Macro news (Portal v1.1 Change 4) ────────────────────────────────
// Alpha Vantage NEWS_SENTIMENT feed via proxy GET /macro_news.
// Dedup by url, parse AV time_published "YYYYMMDDTHHMMSS", classify sentiment.
const AV_TIME_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/;

function parseAvTimePublished(ts) {
  if (!ts || typeof ts !== 'string') return null;
  const m = AV_TIME_RE.exec(ts);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
}

function sentimentClass(label) {
  if (!label) return 'neu';
  const l = String(label).toLowerCase();
  if (l.includes('bullish')) return 'pos';
  if (l.includes('bearish')) return 'neg';
  return 'neu';
}

export function adaptMacroNews(data) {
  const mn = data?.macroNews;
  if (!mn || !Array.isArray(mn.feed) || mn.feed.length === 0) return null;
  const seen = new Set();
  const items = [];
  for (const article of mn.feed) {
    const url = article?.url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const pubDate = parseAvTimePublished(article.time_published);
    items.push({
      url,
      title: article.title || '(untitled)',
      source: article.source || '?',
      time_ago: pubDate ? minutesAgoLabel(pubDate.toISOString()) : '',
      time_published: article.time_published,
      sentiment_class: sentimentClass(article.overall_sentiment_label),
      sentiment_label: article.overall_sentiment_label,
    });
    if (items.length >= 30) break;
  }
  return items.length > 0 ? items : null;
}

// ── Recent system events (Portal v1.1 status-strip 5-event cycle) ─────
// Maps up to N most recent SystemEventNodes to display-ready rows. The
// StatusStrip component cycles through this array, showing 3 at a time
// (top sharp, others dimmer). `relativeTimeAgo` formats per spec:
// "Xs ago" / "Xm ago" / "Xh ago" / "Xd ago".
const STATUS_EVENT_FRIENDLY = {
  TRADE_OPENED: 'Trade opened',
  TRADE_CLOSED: 'Trade closed',
  THRESHOLD_HIT: 'Threshold hit',
  SHARPE_BAND_TRANSITION: 'Sharpe band changed',
  LEARNING_LOOP_COMPLETE: 'Learning loop complete',
  RULE_WRITTEN: 'Rule written',
  PHASE_GATE_PASSED: 'Phase gate passed',
  MANUAL_OVERRIDE: 'Manual override',
};

function relativeTimeAgo(iso) {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t)) return '—';
  const ms = Date.now() - t;
  if (ms < 60_000) {
    const s = Math.max(1, Math.floor(ms / 1000));
    return `${s}s ago`;
  }
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function adaptRecentEvents(data, max = 5) {
  const rows = data?.events;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.slice(0, max).map((e) => {
    const sev = (e.severity || 'INFO').toUpperCase();
    return {
      eventType: e.event_type || '?',
      friendly: STATUS_EVENT_FRIENDLY[e.event_type] || e.event_type || '?',
      asset: e.asset || null,
      summary: e.summary || '',
      severity: sev,
      severityClass: sev === 'WARNING' ? 'warning' : sev === 'ERROR' ? 'error' : 'info',
      timestamp: e.event_timestamp,
      timeAgo: relativeTimeAgo(e.event_timestamp),
      eventId: e.event_id,
    };
  });
}

// Back-compat shim — any remaining caller of adaptLastEvent returns the
// single most recent event from adaptRecentEvents.
export function adaptLastEvent(data) {
  const arr = adaptRecentEvents(data, 1);
  return arr && arr[0] ? arr[0] : null;
}

// ── Signal Scanner (Portal v1.2 scanner-cycle dispatch 2026-05-26) ───
// Joins three live inputs to produce the full-asset-list row set the
// ScannerPanel renders. Inputs:
//   - data.monitoredAssets : string[] (mount-time read from TradingConfigNode)
//   - data.scannerScores   : [{asset, last_score, last_track, last_seen}] —
//                            per-asset most-recent TradeNode composite_score
//                            within the cutoff window; assets with no trade
//                            in-window simply don't appear (intentional)
//   - data.tradeList       : trade list rows, used to derive the OPEN-asset
//                            set so the row pulses while a position is live
//
// Per-asset output:
//   { sym, sub, score, hasScore, fired, lastSeen }
// `sub` derives the existing track sub-label from the most-recent trade
// (CON/MOD/AGG); when the asset has no recent trade we fall back to the
// asset-class lozenge (CRY / STK) so the row still has a sub-label slot.
// `hasScore=false` triggers the BUILDING DATA placeholder render in the
// component (no score number, no bar, no fired badge, still cycles).
const SUB_TRACK_MAP = { Conservative: 'CON', Moderate: 'MOD', Aggressive: 'AGG' };
function subFallback(sym) {
  return typeof sym === 'string' && sym.includes('/') ? 'CRY' : 'STK';
}
export function adaptScanner(data) {
  const assets = Array.isArray(data?.monitoredAssets) ? data.monitoredAssets : [];
  if (assets.length === 0) return null;
  const scoreRows = Array.isArray(data?.scannerScores) ? data.scannerScores : [];
  const scoreMap = new Map();
  for (const r of scoreRows) {
    if (r && r.asset) scoreMap.set(r.asset, r);
  }
  const tradeRows = Array.isArray(data?.tradeList) ? data.tradeList : [];
  const openSet = new Set();
  for (const t of tradeRows) {
    if (t && t.status === 'OPEN' && t.asset) openSet.add(t.asset);
  }
  return assets.map((sym) => {
    const sr = scoreMap.get(sym);
    const rawScore = sr ? sr.last_score : null;
    const score = rawScore != null ? Math.round(Number(rawScore)) : null;
    const sub = sr && sr.last_track && SUB_TRACK_MAP[sr.last_track]
      ? SUB_TRACK_MAP[sr.last_track]
      : subFallback(sym);
    return {
      sym,
      sub,
      score: score != null && Number.isFinite(score) ? score : 0,
      hasScore: score != null && Number.isFinite(score),
      fired: openSet.has(sym),
      lastSeen: sr?.last_seen || null,
    };
  });
}

// ── Kernel counts (for the overlays — not the scene itself) ──────────
// Phase 1.1: IndicatorNodes don't exist yet (Phase 4+). When they do, this
// returns the real node/edge counts. Until then, null → the Three.js scene
// renders the 5-cluster INITIALIZING placeholder and panels show those counts.
export function adaptKernelCounts(data) {
  const nodes = data?.kernelNodes;
  const edges = data?.kernelEdges;
  if (!Array.isArray(nodes) || nodes.length === 0) return null;
  return { nodes: nodes.length, edges: Array.isArray(edges) ? edges.length : 0 };
}

// ── First-poll telemetry summary (for console reporting / debug overlay) ─
export function summarizePoll(data) {
  if (!data) return { ready: false };
  return {
    ready: true,
    pollTimestamp: data.pollTimestamp,
    counts: {
      account_bar: data.accountBar ? 1 : 0,
      weekly_waterfall: data.weeklyWaterfall?.length ?? 0,
      open_positions: data.positions?.length ?? 0,
      recent_events: data.events?.length ?? 0,
      win_rate: data.winRate?.total_closed ?? 0,
      sharpe_ratio: data.sharpe?.sr != null ? 1 : 0,
      lane2_delta: data.lane2 ? 1 : 0,
      conviction_tiers: data.conviction?.length ?? 0,
      kernel_nodes: data.kernelNodes?.length ?? 0,
      kernel_edges: data.kernelEdges?.length ?? 0,
      equity_curve_series: data.equityCurve?.length ?? 0,
      equity_curve_stats: data.equityHeader ? 1 : 0,
      rules_this_week: data.rulesThisWeek?.length ?? 0,
      rules_footer: data.rulesFoot ? 1 : 0,
    },
  };
}

// ── Bottom price ticker (Portal v1.11, 2026-05-29) ────────────────────
// Adapts the proxy /price_ticker response to the shape the existing
// <Ticker /> JSX consumes (drop-in for the retired TICKER literal):
//   { s: symbol, p: priceString, c: changeString (signed, "+1.01%"),
//     d: 'u' | 'd' }
// Concatenates stocks + crypto in the order the proxy returned them
// (alpha-sorted per class). Stocks first, then crypto — operator-locked
// 32-asset universe sourced from monitored_assets server-side.
//
// Returns { items, fetchedAtMs, offline } so the Ticker can render:
//   - items: the array above (empty when offline)
//   - fetchedAtMs: server-side timestamp for the "as of Ns" freshness pill
//   - offline: true when proxy returned 503/error or both arrays empty
function formatTickerPrice(price) {
  if (!Number.isFinite(price)) return '—';
  // Match the placeholder convention: 2dp for prices < $1000, else thousands-
  // separated with the smallest decimal count that preserves precision.
  const abs = Math.abs(price);
  let decimals;
  if (abs >= 1000) decimals = price >= 10000 ? 0 : 2;
  else if (abs >= 100) decimals = 2;
  else if (abs >= 10) decimals = 2;
  else decimals = price >= 1 ? 2 : 4;
  return price.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatTickerChange(changePct) {
  if (!Number.isFinite(changePct)) return '—';
  const sign = changePct >= 0 ? '+' : '';
  return `${sign}${changePct.toFixed(2)}%`;
}

export function adaptPriceTicker(data) {
  const pt = data?.priceTicker;
  const stocks = Array.isArray(pt?.stocks) ? pt.stocks : [];
  const crypto = Array.isArray(pt?.crypto) ? pt.crypto : [];
  const fetchedAtMs = Number.isFinite(Number(pt?.fetched_at_ms))
    ? Number(pt.fetched_at_ms)
    : null;
  const errored = !!pt?.error;
  const empty = stocks.length === 0 && crypto.length === 0;
  const offline = errored || empty;
  const mapRow = (r) => ({
    s: r.symbol,
    p: formatTickerPrice(Number(r.price)),
    c: formatTickerChange(Number(r.change_pct)),
    d: r.direction === 'd' ? 'd' : 'u',
  });
  // Stocks first, then crypto. Within each class, server returns alpha-sorted.
  const items = [...stocks.map(mapRow), ...crypto.map(mapRow)];
  return { items, fetchedAtMs, offline };
}

// ── Account state (Portal v1.14 P1.3, M4 §6 health strip, 2026-05-30) ─
// Adapts the proxy /account_state rows (one per AccountStateNode, ALL §2
// props) to the shape the M4 health strip + detail view consume:
//   { accounts: [ { accountId, healthState, healthReasons[], … } ],
//     fetchedAtMs }
// Returns { accounts: [], fetchedAtMs } when no rows (empty/no node) —
// the strip JSX guards with `accounts.length === 0` → AWAITING ACCOUNT
// STATE. health_state values follow M4 §6.1 enum: 'GREEN'|'AMBER'|'RED'.
// health_reasons is a Neo4j list (array of strings); render them as-is,
// NEVER hardcode reason text — that's a dispatch constraint.
//
// Freshness: `updatedAt` ISO surfaced on each account; the strip's
// stale-check (now − updated_at > 90s) lives in the component layer.
const toNum  = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
const toBool = (v) => (v === true || v === 'true' ? true : (v === false || v === 'false' ? false : null));
const toList = (v) => (Array.isArray(v) ? v : []);
const toStr  = (v) => (typeof v === 'string' ? v : (v == null ? null : String(v)));

export function adaptAccountState(data) {
  const rows = Array.isArray(data?.accountState) ? data.accountState : [];
  const accounts = rows.map((r) => ({
    accountId: toStr(r.account_id),
    snapshotTimestamp: toStr(r.snapshot_timestamp),
    updatedAt: toStr(r.updated_at),
    portfolioValue: toNum(r.portfolio_value),
    cash: toNum(r.cash),
    buyingPower: toNum(r.buying_power),
    nonMarginableBuyingPower: toNum(r.non_marginable_buying_power),
    tradingBlocked: toBool(r.trading_blocked),
    patternDayTrader: toBool(r.pattern_day_trader),
    daytradeCount: toNum(r.daytrade_count),
    committedNotional: toNum(r.committed_notional),
    openPositionCount: toNum(r.open_position_count),
    headroomPct: toNum(r.headroom_pct),
    nonMarginableHeadroomPct: toNum(r.non_marginable_headroom_pct),
    monitorCoverageTotal: toNum(r.monitor_coverage_total),
    monitorCoverageMonitored: toNum(r.monitor_coverage_monitored),
    monitorCoverageUnmonitored: toNum(r.monitor_coverage_unmonitored),
    monitorCoverageUnmonitoredTradeIds: toList(r.monitor_coverage_unmonitored_trade_ids).map(String),
    monitorMismatchCountLastCycle: toNum(r.monitor_mismatch_count_last_cycle),
    healthState: toStr(r.health_state),
    healthReasons: toList(r.health_reasons).map(String),
  }));
  return { accounts, pollTimestamp: data?.pollTimestamp ?? null };
}

// ── Account health history (Portal v1.14 P1.4, M4 §6 detail view) ─────
// Parses Layer4AnomalyNode rows from /account_health_history. `details`
// is a JSON string on the node per project convention (per-anomaly blob
// carrying account_id and any structured deltas); we parse + filter by
// account_id at render time. Returns an array; component handles empty.
//
// Each entry: { anomalyType, severity, createdTimestamp, accountId, details }
// where `details` is the parsed object (or {} on parse failure).
function safeParseJson(s) {
  if (s == null) return {};
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch { return {}; }
}
export function adaptHealthHistory(data) {
  const rows = Array.isArray(data?.accountHealthHistory) ? data.accountHealthHistory : [];
  return rows.map((r) => {
    const details = safeParseJson(r.details);
    return {
      anomalyType: toStr(r.anomaly_type),
      severity: toStr(r.severity),
      createdTimestamp: toStr(r.created_timestamp),
      accountId: toStr(details?.account_id ?? null),
      details,
    };
  });
}
