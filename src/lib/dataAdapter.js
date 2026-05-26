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

function computeHold(entryIso) {
  if (!entryIso) return '—';
  const entry = new Date(entryIso).getTime();
  const now = Date.now();
  const mins = Math.max(0, Math.floor((now - entry) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${pad2(m)}m` : `${m}m`;
}

// ── Account bar ──────────────────────────────────────────────────────
export function adaptAccountBar(data) {
  const ab = data?.accountBar;
  if (!ab) return null;
  return {
    capitalBase: Number(ab.capital_base) || 0,
    currentValue: Number(ab.current_value) || Number(ab.capital_base) || 0,
    todayPnl: Number(ab.today_pnl) || 0,
    totalReturnPct:
      ab.current_value && ab.capital_base
        ? ((Number(ab.current_value) - Number(ab.capital_base)) / Number(ab.capital_base)) * 100
        : 0,
    trades: Number(ab.trade_count) || 0,
    open: Number(ab.open_count) || 0,
    currentPhase: ab.current_phase || 'Paper',
    lastSync: ab.last_sync || null,
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
    p: Number(w.pnl_pct) || 0,
    pos: Number(w.pnl_pct) >= 0,
    cur: i === asc.length - 1,
  }));
}

// ── Open positions ───────────────────────────────────────────────────
export function adaptPositions(data) {
  const rows = data?.positions;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.map((r) => {
    const t = trackInfo(r.track);
    const c = convInfo(r.conviction);
    const entry = Number(r.entry_price) || 0;
    const stop = Number(r.stop_price) || 0;
    const target = Number(r.target_price) || 0;
    return {
      asset: r.asset,
      track: t.cls,
      tl: t.label,
      conv: c.cls,
      cl: c.label,
      entry,
      cur: entry, // Q1 default: cosmetic drift adds motion to entry baseline
      stop,
      target,
      pnl: 0,
      pnlPct: 0,
      prog: 0,
      hold: computeHold(r.entry_timestamp),
      requestId: r.request_id,
      direction: r.direction,
    };
  });
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
export function adaptSharpe(data) {
  const s = data?.sharpe;
  if (!s || s.sr == null) return null;
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
