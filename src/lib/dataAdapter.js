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
// Portal v1.2 Change 1 (2026-05-26): synthetic running equity fallback.
//
// The `account_bar` Cypher selects the latest EquitySnapshotNode AFTER
// the post-cutoff date (2026-05-26). The nightly snapshot writer runs at
// 23:55 UTC, so for the first ~24h after engine launch there is no
// post-cutoff snapshot, and `current_value` arrives null. Without the
// fallback below, the panel locked to $10,000 / $0 / 0% even after closed
// trades had locked in realized P&L (operator-confirmed: 4 closed trades
// with non-zero pnl_dollar, Account Bar reading flat).
//
// Fallback definition (when ab.current_value is null AND tradeList is
// available): current_value = capital_base + Σ pnl_dollar over CLOSED
// trades in the cutoff-filtered trade list. Today's P&L (single-day
// Phase 1 horizon) = current_value − capital_base. Total return % is
// the same delta as a percent of capital_base. This is realized-only —
// unrealized P&L from OPEN positions is intentionally NOT included.
//
// Why no unrealized: computing it requires (current_price − entry_price)
// × position_size for each OPEN trade. Current price is not stored on
// TradeNode (would cause massive write volume) and is not exposed by any
// portal-reachable surface — Layer 1 buffers are in-process Python on the
// engine, the proxy whitelist returns Cypher only, and a CORS-direct
// fetch to Alpaca/Polygon from the static portal is out of scope. Once a
// current-price source exists (e.g., a /current_prices endpoint on the
// proxy reading from a new in-graph node) extend this fn to add the
// unrealized term. Until then realized-only is the honest fallback.
//
// `synthetic` flag is true when the fallback is active; consumers may
// surface a small indicator (deferred — no UI signal in this dispatch).
export function adaptAccountBar(data) {
  const ab = data?.accountBar;
  if (!ab) return null;
  const capitalBase = Number(ab.capital_base) || 0;
  const polledCurrent = ab.current_value != null ? Number(ab.current_value) : null;

  // Snapshot-backed branch: polled EquitySnapshotNode present.
  if (polledCurrent != null && Number.isFinite(polledCurrent)) {
    return {
      capitalBase,
      currentValue: polledCurrent,
      todayPnl: Number(ab.today_pnl) || 0,
      totalReturnPct: capitalBase
        ? ((polledCurrent - capitalBase) / capitalBase) * 100
        : 0,
      trades: Number(ab.trade_count) || 0,
      open: Number(ab.open_count) || 0,
      currentPhase: ab.current_phase || 'Paper',
      lastSync: ab.last_sync || null,
      synthetic: false,
    };
  }

  // Synthetic branch: derive from realized P&L in the trade list.
  const rows = Array.isArray(data?.tradeList) ? data.tradeList : [];
  let realizedSum = 0;
  let closedCount = 0;
  let openCount = 0;
  for (const r of rows) {
    if (r?.status === 'CLOSED') {
      const v = r.pnl_dollar ?? r.realized_pnl;
      const n = v != null ? Number(v) : 0;
      if (Number.isFinite(n)) realizedSum += n;
      closedCount += 1;
    } else if (r?.status === 'OPEN') {
      openCount += 1;
    }
  }
  const currentValue = capitalBase + realizedSum;
  return {
    capitalBase,
    currentValue,
    todayPnl: realizedSum,
    totalReturnPct: capitalBase ? (realizedSum / capitalBase) * 100 : 0,
    trades: Number(ab.trade_count) || (closedCount + openCount),
    open: Number(ab.open_count) || openCount,
    currentPhase: ab.current_phase || 'Paper',
    lastSync: ab.last_sync || null,
    synthetic: true,
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

// ── Trade list (Portal v1.1 Change 2) ────────────────────────────────
// Returns BOTH open and closed trades, server-side cutoff-filtered.
// Each row carries enough fields for the new panel's render logic:
//   - OPEN  rows: current price drifts via useDrift; pnl=0 initial
//   - CLOSED rows: pnl_dollar/pnl_percent are realized; win_loss drives
//     the WIN/LOSS final-outcome bar
export function adaptTradeList(data) {
  const rows = data?.tradeList;
  if (!Array.isArray(rows) || rows.length === 0) return null;
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
    return {
      asset: r.asset,
      track: t.cls,
      tl: t.label,
      conv: c.cls,
      cl: c.label,
      entry,
      cur: exit ?? entry,            // closed rows show exit_price in Current
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
