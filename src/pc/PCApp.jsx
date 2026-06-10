import { useEffect, useMemo, useRef, useState } from 'react';
import { useClock, usePollCountdown } from '../lib/useClock.js';
import { shouldRenderBootstrap } from '../lib/usePhaseFilter.js';
import {
  SCANNER_ASSETS, WEEKLY_WATERFALL, KERNEL_COUNTS, LOGO_SVG, CURRENT_PHASE,
} from '../lib/placeholders.js';
import {
  adaptAccountBar, adaptWeeklyWaterfall, adaptEvents,
  adaptWinRate, adaptSharpe, adaptLane2, adaptConviction,
  adaptEquityCurve, adaptEquityHeader,
  adaptRulesThisWeek, adaptRulesFoot, adaptClosestCohort,
  adaptHeartbeat,
  adaptTradeList, selectVisibleTrades, adaptNewsTicker, adaptMacroNews, adaptRecentEvents,
  adaptScanner, adaptReconciliation, adaptPriceTicker,
  adaptAccountState,
  adaptPanelProfitFactor, adaptPanelExpectancy,
  adaptPanelReturnsByDomain, adaptPanelSharpe,
  fmtCloseET,
  assetClassTag,
} from '../lib/dataAdapter.js';
import { initKernelScene } from '../lib/kernelScene.js';
import { computeBadge } from '../lib/performanceBadge.js';
import { computeAnnualized, deriveTodayPct } from '../lib/annualizedReturn.js';
// Portal charts (2026-06-10): equity + daily-return migrated from hand-rolled
// inline SVG to Recharts (axes / hover tooltip / time-range toggle). The old
// buildEquityCurveSvgFromSeries / buildDailyReturnBars + PACE_TIERS tier
// thresholds + RETURN_STRIP_H are no longer used by this PC panel.
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid,
} from 'recharts';
import EnginePill from '../lib/EnginePill.jsx';
import PollIndicator from '../lib/PollIndicator.jsx';
import MarketStatusPill from '../lib/MarketStatusPill.jsx';
import MarketBell from '../lib/MarketBell.jsx';
import { computeOpenLegPnl, computeOpenProgress, openPnlTone } from '../lib/openPnl.js';
import { useMarketStatus } from '../lib/useMarketStatus.js';
import NewsTicker from '../lib/NewsTicker.jsx';
import MacroNewsStrip from '../lib/MacroNewsStrip.jsx';
import StatusStrip from '../lib/StatusStrip.jsx';
import HealthStrip from '../lib/HealthStrip.jsx';
import RulesEmptyState from '../lib/RulesEmptyState.jsx';
import TradeOverlay from './TradeOverlay.jsx';
import TradesExpandModal from './TradesExpandModal.jsx';

const MODES = ['live', 'training', 'combined'];
const DEFAULT_MODE = 'training';

// Tier 2 (2026-06-09): ONE band function colors BOTH the bar fill and the
// score number so they can never diverge. Magnitude only — amber here means
// the score band, never staleness.
const scoreColor = (s) => {
  if (s >= 65) return 'var(--green)';
  if (s >= 40) return 'var(--cyan)';
  if (s >= 20) return 'var(--amber)';
  return 'var(--w3)';
};

export default function PCApp({ data, errors = {}, hasAnyData = false, error, loading }) {
  const clock = useClock();
  const { secs: pollSecs, pulse: pollPulse } = usePollCountdown();
  const [mode, setMode] = useState(DEFAULT_MODE);
  // Trade overlay trigger slot reserved for the future real-event watcher
  // (will compare consecutive poll results and fire on new TRADE_OPENED /
  // TRADE_CLOSED entries — Section G real wiring, separate task).
  const [overlayTrigger] = useState(null);

  // Live phase comes from data.accountBar.current_phase when available;
  // falls back to the hardcoded constant until the first poll lands.
  const liveAccountBar = adaptAccountBar(data);
  const currentPhase = liveAccountBar?.currentPhase || CURRENT_PHASE;
  const heartbeat = adaptHeartbeat(data);
  const recon = adaptReconciliation(data);
  const pollTimestamp = data?.pollTimestamp;
  // 2026-06-08: ONE market-status instance for the shell — shared by the pill
  // and the open/close bell (no second clock/poll).
  const marketStatus = useMarketStatus();

  return (
    <div className="pc-shell">
      <StatusBanner error={error} errors={errors} hasAnyData={hasAnyData} />
      <Header
        clock={clock}
        mode={mode}
        setMode={setMode}
        currentPhase={currentPhase}
        heartbeat={heartbeat}
        recon={recon}
        pollSecs={pollSecs}
        pollPulse={pollPulse}
        marketStatus={marketStatus}
      />
      <AccountBar
        mode={mode}
        liveAccountBar={liveAccountBar}
        liveWeeklyWaterfall={adaptWeeklyWaterfall(data)}
        data={data}
      />
      <Main mode={mode} data={data} />
      <Ticker data={data} />
      <TradeOverlay trigger={overlayTrigger} />
      {/* loading hint: visible while first poll is in flight */}
      {loading && !data && !error && <LoadingBadge />}
    </div>
  );
}

function StatusBanner({ error, errors, hasAnyData }) {
  // Three states per Brian's spec:
  //   PROXY ERROR (red)   — getProxyConfig fatal, OR all queries failed and no data anywhere
  //   PARTIAL DATA (amber) — some queries failed but at least one slice has data
  //   (no banner)         — every query succeeded this cycle
  const failed = Object.keys(errors || {});
  const fatalConfig = !!error;
  const allDown = !fatalConfig && failed.length > 0 && !hasAnyData;
  const partial = !fatalConfig && failed.length > 0 && hasAnyData;

  if (!fatalConfig && !allDown && !partial) return null;

  if (fatalConfig || allDown) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000,
        background: 'rgba(255,61,87,0.92)', color: '#fff',
        fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px',
        padding: '6px 12px', borderBottom: '1px solid var(--red)',
      }}>
        PROXY ERROR · {fatalConfig
          ? (error.message || String(error))
          : `all ${failed.length} queries failed — proxy or tunnel may be down`}
      </div>
    );
  }
  // partial
  return (
    <div
      title={`Failed queries: ${failed.join(', ')}`}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000,
        background: 'rgba(255,171,0,0.92)', color: '#1a1500',
        fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px',
        padding: '6px 12px', borderBottom: '1px solid var(--amber)',
      }}>
      PARTIAL DATA · {failed.length} of {failed.length + (hasAnyData ? 1 : 0)}+ queries failed: {failed.join(', ')}
    </div>
  );
}

function LoadingBadge() {
  return (
    <div style={{
      position: 'fixed', bottom: 32, right: 12, zIndex: 999,
      background: 'var(--navy3)', border: '1px solid var(--border)',
      color: 'var(--cyan)', fontFamily: 'var(--mono)', fontSize: '9px',
      letterSpacing: '2px', padding: '4px 10px',
    }}>
      CONNECTING TO ENGINE…
    </div>
  );
}

function ReconPill({ recon }) {
  // Session 40 CHANGE 5: amber pill when broker open positions disagree with
  // graph OPEN TradeNodes. Suppressed when broker unavailable (can't compare)
  // or when they agree. This is the §11 broker/graph drift signal.
  if (!recon || recon.unavailable || !recon.diff) return null;
  const detail = [
    recon.onlyBroker?.length ? `broker-only: ${recon.onlyBroker.join(', ')}` : '',
    recon.onlyGraph?.length ? `graph-only: ${recon.onlyGraph.join(', ')}` : '',
  ].filter(Boolean).join(' · ');
  return (
    <div className="recon-pill" title={detail}>
      <span className="recon-dot" />
      RECON DIFF: {recon.brokerCount} broker vs {recon.graphCount} graph
    </div>
  );
}

function Header({ clock, mode, setMode, currentPhase, heartbeat, recon, pollSecs, pollPulse, marketStatus }) {
  return (
    <div className="hdr">
      <div className="logo">
        <div className="logo-mark" dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />
        <div className="logo-text">
          <span className="ls">SIGNAL</span>
          <span className="ld">DELTA</span>
          <span className="ltag">AI TRADING SYSTEM v1.0</span>
        </div>
      </div>
      <div className="hdr-mid">
        <EnginePill heartbeat={heartbeat} variant="pc" />
        <ReconPill recon={recon} />
        <div className="pill"><div className="dot dot-cyan" />{currentPhase === 'Paper' ? 'PAPER TRADING' : currentPhase.toUpperCase()}</div>
        <PerformanceBadge mode={mode} currentPhase={currentPhase} />
        <div className="mode-toggle">
          {MODES.map((m) => (
            <div
              key={m}
              className={'mode-pill' + (mode === m ? ' active' : '')}
              onClick={() => setMode(m)}
            >{m.toUpperCase()}</div>
          ))}
        </div>
        {/* Market status clock (2026-05-26 dispatch) — placed to the left
            of PollIndicator (SYNC) per dispatch's "plenty of empty space"
            placement. Two pills: stocks (OPEN/CLOSED/HOLIDAY with countdown)
            + crypto (static 24/7). */}
        <MarketStatusPill variant="pc" status={marketStatus} />
        <MarketBell marketState={marketStatus?.state} />
        <PollIndicator secs={pollSecs} pulse={pollPulse} variant="pc" />
      </div>
      <div className="clock">
        <span className="clock-et">{clock.et} ET</span>
        <span className="clock-sep">·</span>
        <span className="clock-utc">{clock.utc} UTC</span>
      </div>
    </div>
  );
}

function PerformanceBadge({ mode, currentPhase }) {
  const { text, tone } = useMemo(() => computeBadge(currentPhase, mode), [mode, currentPhase]);
  return <div className={'sim-tag t-' + tone}>{text}</div>;
}

// ───────────────────────────────────────────────────────────────────────
// Portal KPI tiles + daily-P&L tier system (2026-06-10).
//
// The old Rev-33 PaceBadge is removed; the per-day pace state now lives as a
// tier badge on the Today's-P&L KPI tile.
//
// §15.5 (anti-fraud): the tier is a per-DAY pace state (today vs prior close),
// broker-sourced (intraday equity), NEVER TradeNode.pnl_dollar. Every badge
// names its source verbatim. Copy reads "Today: Alpha pace", never a standing
// "SignalDelta is Alpha" claim. Thresholds are NAMED config — retunable here;
// true live-without-deploy retune needs them seeded into TradingConfigNode + a
// proxy endpoint (future), which `data?.tierConfig` will honor with NO portal
// change. Until then these defaults apply.
// ───────────────────────────────────────────────────────────────────────
const TIER_DEFAULTS = { tier_alpha_pct: 0.38, tier_elite_pct: 1.0 };
// Tier swatch colors: Green pace = teal, Alpha = blue, Elite = amber, loss = red.
const TIER_COLOR = { green: '#00c2ff', alpha: '#3d8bff', elite: '#ffab00', loss: '#ff3d57' };
const TIER_SRC = {
  green: 'Green = a positive day (today’s pace > 0%). Per-day state, resets daily.',
  alpha: 'Alpha = top-500 day-trader pace (Barber et al., +0.38%/day net). Today’s pace only.',
  elite: 'Elite = ~2.6× the Alpha pace (≥1.0%/day). Today’s pace only, resets daily.',
};

function tierThresholds(data) {
  const c = data?.tierConfig || {};
  const a = Number(c.tier_alpha_pct);
  const e = Number(c.tier_elite_pct);
  return {
    alpha: Number.isFinite(a) ? a : TIER_DEFAULTS.tier_alpha_pct,
    elite: Number.isFinite(e) ? e : TIER_DEFAULTS.tier_elite_pct,
  };
}
// Returns the day's tier from its return % (null for a flat/negative day).
function dayTier(pct, thr) {
  if (pct == null || !Number.isFinite(pct) || pct <= 0) return null;
  if (pct >= thr.elite) return { key: 'elite', label: 'Elite', src: TIER_SRC.elite };
  if (pct >= thr.alpha) return { key: 'alpha', label: 'Alpha', src: TIER_SRC.alpha };
  return { key: 'green', label: 'Green', src: TIER_SRC.green };
}
// Bar fill for a completed day's return: tier color when positive, red on a loss.
function tierFill(pct, thr) {
  if (!(pct > 0)) return TIER_COLOR.loss;
  return TIER_COLOR[dayTier(pct, thr).key];
}

// Tiny inline trend sparkline (no axes) from an existing numeric series.
// Trend sparkline that FILLS its container (kpi-graph half). Fixed 100×30 view
// space stretched (preserveAspectRatio=none); non-scaling stroke keeps it thin.
function Sparkline({ values, color }) {
  if (!Array.isArray(values) || values.length < 2) return null;
  const W = 100, H = 30;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = (max - min) || 1;
  const n = values.length;
  const pts = values.map((v, i) => {
    const x = (i / (n - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg className="kpi-spark" width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// One header KPI tile: label · value · direction-colored delta · context line ·
// sparkline. `pending` renders the "— pending verify" placeholder (pnl-gated
// tiles stay numberless until the exit-price fix is verified — §15.5: a number
// pre-verify is a wrong number). `flash` ('alpha'|'elite') glows value + delta.
// KPI tile (2026-06-10 rev2b): vertical stack — label, then value+delta on their
// OWN full-width row (never squeezed/overlapped by the graph), then a bottom row
// = context + a wider/taller sparkline band filling the remaining width (B1: the
// graph fills its area WITHOUT touching the text side).
function KpiTile({ label, value, valueCls, delta, deltaCls, context, badge, spark, sparkColor, flash, pending, title }) {
  return (
    <div className={'kpi-tile' + (flash ? ' kpi-flash kpi-flash-' + flash : '')} title={title}>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        {badge}
      </div>
      {pending ? (
        <div className="kpi-pending">— pending verify</div>
      ) : (
        <div className="kpi-mid">
          <span className={'kpi-value' + (valueCls ? ' ' + valueCls : '')}>{value}</span>
          {delta != null && <span className={'kpi-delta ' + (deltaCls || '')}>{delta}</span>}
        </div>
      )}
      <div className="kpi-bot">
        {context && <span className="kpi-context">{context}</span>}
        {spark && <span className="kpi-graph"><Sparkline values={spark} color={sparkColor} /></span>}
      </div>
    </div>
  );
}

// §6.6 $-panel formatters — render proxy-served broker-reconciling values
// verbatim (no recompute).
function fmtUsdSigned(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return (v < 0 ? '-$' : '+$') + Math.abs(v).toFixed(2);
}
function fmtPf(v) {
  if (v == null || !Number.isFinite(v)) return '∞';
  return v.toFixed(3);
}
function fmtSharpeVal(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return Math.abs(v) < 0.1 ? v.toFixed(4) : v.toFixed(2);
}

function AccountBar({ mode, liveAccountBar, liveWeeklyWaterfall, data }) {
  // Portal v1.14 (2026-05-30): MiniWaterfall extracted to <WeekRow/> below.
  // `liveWeeklyWaterfall` kept on the prop list (was a sibling render); the
  // freed banner-right now holds <HealthStrip layout="pc"/> per M4 §6.
  // Session 40 rebuild (2026-05-29): live-state surfaces are broker-sourced.
  //   Current Value  ← brokerAccount.account.equity (null when broker down)
  //   Open           ← brokerAccount.positions.length
  //   Today P&L      ← broker equity − latest snapshot equity_total
  //   Total Return   ← graph snapshot equity vs capital base (unchanged path)
  //   Trades         ← graph CLOSED count (forensic-excluded)
  // Null broker-sourced fields render as dashes (broker outage), while the
  // graph-sourced fields (Capital Base, Total Return) stay populated.
  const bootstrap = shouldRenderBootstrap(mode) || !liveAccountBar;
  const capitalBase = liveAccountBar?.capitalBase ?? 10000;
  const av = liveAccountBar?.currentValue;            // broker equity or null
  const ap = liveAccountBar?.todayPnl;                // hybrid or null
  const totalReturnPct = liveAccountBar?.totalReturnPct; // graph or null
  const valFmt = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = (v) => (v >= 0 ? '+' : '');
  const cls = (v) => (v >= 0 ? 'g' : 'r');

  // Sparkline source — same daily equity series the curve uses (no 2nd fetch).
  // (Capital Base / Annualized / Day W/L / Trades / Open moved to <SecondaryStrip/>.)
  const series = adaptEquityCurve(data);
  const todayPct = deriveTodayPct(av, ap);

  // Portal KPI tiles (2026-06-10) — broker/count-sourced values + sparklines.
  const winRate = bootstrap ? null : adaptWinRate(data);
  // §6.6 $-panels (proxy): Profit Factor + Expectancy now serve live values
  // (exit-price fix verified → pnl_dollar trustworthy; 36 corrupt closes
  // excluded server-side). Replaces the "— pending verify" §15.5 placeholders.
  const pf = bootstrap ? null : adaptPanelProfitFactor(data);
  const exp = bootstrap ? null : adaptPanelExpectancy(data);
  const totalPnl = (av != null && Number.isFinite(av)) ? av - capitalBase : null;
  const thr = tierThresholds(data);
  const todayTier = bootstrap ? null : dayTier(todayPct, thr);
  const tierFlash = todayTier && (todayTier.key === 'alpha' || todayTier.key === 'elite') ? todayTier.key : null;

  // Sparkline series from the existing equity series + closed-trade feed (no new
  // data wiring): equity trend, daily-P&L (equity diffs), cumulative win-rate.
  const eqVals = useMemo(() => (series ? series.map((p) => Number(p.equity) || 0) : null), [series]);
  const dailyPnlVals = useMemo(() => {
    if (!series || series.length < 2) return null;
    const out = [];
    for (let i = 1; i < series.length; i++) out.push((Number(series[i].equity) || 0) - (Number(series[i - 1].equity) || 0));
    return out;
  }, [series]);
  const winRateVals = useMemo(() => {
    if (bootstrap) return null;
    const tl = adaptTradeList(data);
    if (!Array.isArray(tl)) return null;
    const closed = tl.filter((t) => t.status === 'CLOSED' && t.exitTimestamp)
      .sort((a, b) => String(a.exitTimestamp).localeCompare(String(b.exitTimestamp)));
    if (closed.length < 2) return null;
    let w = 0; const out = [];
    closed.forEach((t, i) => { if (t.winLoss === 'Win') w++; out.push((w / (i + 1)) * 100); });
    return out;
  }, [bootstrap, data]);

  const tierBadge = todayTier
    ? <span className={'kpi-tier kpi-tier-' + todayTier.key} title={todayTier.src}>{todayTier.label}</span>
    : null;

  return (
    <div className="acct">
      <div className="acct-tiles">
        <KpiTile
          label="Total Return"
          value={totalReturnPct != null ? `${sign(totalReturnPct)}${totalReturnPct.toFixed(2)}%` : '—'}
          valueCls={totalReturnPct != null ? cls(totalReturnPct) : ''}
          delta={totalPnl != null ? `${sign(totalPnl)}$${Math.abs(totalPnl).toFixed(0)}` : null}
          deltaCls={totalPnl != null ? cls(totalPnl) : ''}
          context={`since $${capitalBase.toLocaleString()} base`}
          spark={totalReturnPct != null ? eqVals : null}
          sparkColor={totalReturnPct >= 0 ? TIER_COLOR.green : TIER_COLOR.loss}
          title="Total return — graph equity vs capital base."
        />
        <KpiTile
          label="Equity"
          value={av != null ? `$${valFmt(av)}` : '—'}
          valueCls={av != null ? cls(av - capitalBase) : ''}
          delta={totalPnl != null ? `${sign(totalPnl)}$${Math.abs(totalPnl).toFixed(0)}` : null}
          deltaCls={totalPnl != null ? cls(totalPnl) : ''}
          context="broker equity (live)"
          spark={av != null ? eqVals : null}
          sparkColor={(totalPnl ?? 0) >= 0 ? TIER_COLOR.green : TIER_COLOR.loss}
          title="Current account value — broker equity."
        />
        <KpiTile
          label="Today's P&L"
          value={ap != null ? `${sign(ap)}$${Math.abs(ap).toFixed(2)}` : '—'}
          valueCls={ap != null ? cls(ap) : ''}
          delta={todayPct != null ? `${sign(todayPct)}${todayPct.toFixed(2)}%` : null}
          deltaCls={todayPct != null ? cls(todayPct) : ''}
          badge={tierBadge}
          flash={tierFlash}
          context={todayTier ? `Today: ${todayTier.label} pace` : 'vs prior close'}
          spark={ap != null ? dailyPnlVals : null}
          sparkColor={(ap ?? 0) >= 0 ? TIER_COLOR.green : TIER_COLOR.loss}
          title={todayTier ? todayTier.src : 'Today’s P&L — broker intraday equity vs prior-day close. Tier is today’s pace only (resets daily), never a standing claim.'}
        />
        <KpiTile
          label="Win Rate"
          value={winRate ? `${winRate.pct.toFixed(1)}%` : '—'}
          valueCls={winRate && winRate.pct >= 50 ? 'g' : ''}
          context={winRate ? `${winRate.wins} W / ${winRate.total} trades` : 'awaiting first close'}
          spark={winRateVals}
          sparkColor={TIER_COLOR.green}
          title="Win rate — closed-trade count (forensic-excluded)."
        />
        <KpiTile
          label="Profit Factor"
          value={pf && pf.overall != null ? fmtPf(pf.overall) : '—'}
          valueCls={pf && pf.overall != null ? (pf.overall >= 1 ? 'g' : 'r') : ''}
          context={pf ? `${pf.n} closed · excl-36` : 'awaiting proxy'}
          title="§15.5: profit factor = Σ gross profit / |Σ gross loss| on pnl_dollar (broker-reconciling; exit-price fix verified live). Excludes the 36 §6.6 corrupt trigger-copy closes. All-time."
        />
        <KpiTile
          label="Expectancy ($)"
          value={exp ? fmtUsdSigned(exp.overall) : '—'}
          valueCls={exp ? (exp.overall >= 0 ? 'g' : 'r') : ''}
          context={exp ? `avg/trade · ${exp.n} closed` : 'awaiting proxy'}
          title="§15.5: expectancy = mean pnl_dollar per closed trade (broker-reconciling; exit-price fix verified live). Excludes the 36 §6.6 corrupt closes. All-time."
        />
      </div>
      {void liveWeeklyWaterfall}
      {/* Walled two-line block: LINE 1 = account/broker banner (HealthStrip),
          LINE 2 = the 5 secondaries, both left-aligned at the block's left edge
          (the .acct-health border-left "wall" separates it from the KPI tiles). */}
      <div className="acct-health">
        <HealthStrip data={data} layout="pc" />
        <SecondaryStrip mode={mode} liveAccountBar={liveAccountBar} data={data} />
      </div>
    </div>
  );
}

// Portal secondaries relocate (2026-06-10): the 5 plain secondary items moved
// OUT of the KPI tile row into a thin full-width line directly under the
// account/broker (health) bar, above the main grid. Readable color restored
// (pre-build): Base white · Day W/L white (green ≥50%) · Trades/Open cyan;
// "Ann" stays muted grey (correct no-data 'building' state). No size change.
function SecondaryStrip({ mode, liveAccountBar, data }) {
  const bootstrap = shouldRenderBootstrap(mode) || !liveAccountBar;
  const capitalBase = liveAccountBar?.capitalBase ?? 10000;
  const openCount = liveAccountBar?.open;
  const series = adaptEquityCurve(data);
  const annual = useMemo(() => computeAnnualized(series), [series]);
  const annualBoot = bootstrap || !series;
  const closedToday = data?.tradesClosedToday;
  const dayWins = Array.isArray(closedToday) ? closedToday.filter((r) => r.win_loss === 'Win').length : 0;
  const dayTotal = Array.isArray(closedToday) ? closedToday.length : 0;
  const dayPct = dayTotal ? Math.round((dayWins / dayTotal) * 100) : null;
  return (
    <div className="acct-sec-line">
      <span className="asec"><span className="asec-l">Base</span><span className="asec-v">${capitalBase.toLocaleString()}</span></span>
      <span className="asec"><span className="asec-l">Ann</span><span className="asec-v dim">{annualBoot ? '—' : annual.display}</span></span>
      <span className="asec"><span className="asec-l">Day W/L</span><span className={'asec-v' + (dayTotal && dayPct >= 50 ? ' g' : '')}>{bootstrap || !Array.isArray(closedToday) ? '—' : `${dayWins}/${dayTotal}${dayTotal ? ` · ${dayPct}%` : ''}`}</span></span>
      <span className="asec"><span className="asec-l">Trades</span><span className="asec-v c">{bootstrap ? 0 : (liveAccountBar?.trades ?? 0)}</span></span>
      <span className="asec"><span className="asec-l">Open</span><span className="asec-v c">{bootstrap || openCount == null ? '—' : openCount}</span></span>
    </div>
  );
}

// Portal reflow (2026-06-10): WeekRow + MiniWaterfall removed. The full-width
// Weekly P&L row was retired (freed 64px reclaimed into the equity panel via
// .col-center grid retune); this also retired the −60.77% double-×100 weekly
// render bug. The mobile waterfall (MobileApp.jsx) is independent and unchanged;
// shared adaptWeeklyWaterfall/buildWeekFrame in dataAdapter are still used by it.

function Main({ mode, data }) {
  return (
    <div className="main">
      <div className="col-scanner">
        <ScannerPanel mode={mode} data={data} />
      </div>
      <div className="col-center">
        <TradeListPanel mode={mode} data={data} />
        <EquityCurvePanel mode={mode} data={data} />
        <NewsAndStatusPanel mode={mode} data={data} />
      </div>
      <div className="col-metrics">
        <MetricsPanel mode={mode} data={data} />
        <KernelPanel data={data} />
      </div>
      <div className="col-extra">
        <ReturnsByDomainPanel mode={mode} data={data} />
        <RulesAddedPanel mode={mode} data={data} />
      </div>
    </div>
  );
}

function ScannerPanel({ mode, data }) {
  // Portal v1.2 scanner-cycle dispatch (2026-05-26):
  //
  // Replaces the v1.0 random-evaluating cosmetic loop with a live data-
  // backed full-asset vertical auto-scroll. Rows come from adaptScanner(),
  // which joins TradingConfigNode.monitored_assets (mount-time read) with
  // the per-poll scanner_scores query and the tradeList OPEN-asset set.
  //
  // Motion model: CSS keyframe `scanner-vscroll` translates the inner
  // wrapper Y from 0 to -50% over a fixed 60s. Row list is duplicated for
  // seamless loop. Hover pauses via `:hover { animation-play-state: paused }`.
  //
  // FIRED treatment: per-row `.srow.fired` adds the `scanner-fired-pulse`
  // CSS animation (1.5s ease-in-out, gentle opacity oscillation on the
  // green-tinted background). Stops the instant the trade closes (status
  // flips OPEN→CLOSED) because the OPEN-asset Set rebuilds on every poll.
  //
  // BUILDING DATA: rows with `hasScore=false` show no score number, no
  // bar fill, no fired badge — still cycle like the others, visually quiet.
  const bootstrap = shouldRenderBootstrap(mode);
  const scanRows = adaptScanner(data);

  // Bootstrap (no live data yet) or pre-mount (monitored_assets fetch not
  // settled): fall back to the placeholder list so the panel never empties.
  const fallback = bootstrap || !scanRows;
  const rows = fallback
    ? SCANNER_ASSETS.map((a) => ({
        sym: a.sym, sub: a.track, score: 0, hasScore: false, fired: false,
      }))
    : scanRows;

  // Duplicate for seamless vertical loop. The CSS animation translates
  // 0 → -50% so the second copy of the list slides up into the visible
  // window precisely as the first copy exits the top.
  const doubled = [...rows, ...rows];

  return (
    <div className="panel p-scanner">
      <div className="ptitle">
        <span><span className="ptitle-bar" />SIGNAL SCANNER</span>
        <span className="ptitle-r">{rows.length} ASSETS</span>
      </div>
      <div className="scanner-list">
        <div className="scanner-list-inner">
          {doubled.map((a, i) => (
            <ScannerRow a={a} key={`${a.sym}-${i}`} fallback={fallback} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ScannerRow({ a, fallback }) {
  const showScore = !fallback && a.hasScore;
  const isFired = !fallback && a.fired;
  const isGo = !fallback && a.go;
  // Single-row no-data dim: a live node exists but its state is stale
  // (fresh===false). NOT a board-wide wash.
  const noData = showScore && a.fresh === false;
  const color = showScore ? scoreColor(a.score) : 'var(--w3)';
  let cls = 'srow';
  // Tier 2 (2026-06-09): the box lights on GO (fireable live), not on a raw
  // score cutoff. FIRED (open position) takes visual precedence.
  if (isFired) cls += ' fired';
  else if (isGo) cls += ' go';
  if (noData) cls += ' nodata';
  return (
    <div className={cls}>
      <div>
        <div className="sasset">{a.sym}</div>
        <div className="strack">{a.sub}</div>
      </div>
      <div>
        {showScore ? (
          <div className="sbar-bg">
            <div className="sbar-fill" style={{ width: a.score + '%', background: color }} />
          </div>
        ) : (
          <div className="sbuilding">BUILDING DATA</div>
        )}
      </div>
      <div className="sscore" style={showScore ? { color } : undefined}>
        {showScore ? a.score : '·'}
      </div>
      {isFired && <div className="fired-badge">FIRED</div>}
    </div>
  );
}

function TradeListPanel({ mode, data }) {
  // Portal v1.1 Change 2: chronological list of OPEN + CLOSED trades,
  // cutoff-filtered at the proxy. OPEN rows get a green-tint background
  // + drifting current price + progress-toward-target bar. CLOSED rows
  // show exit_price in Current, WIN/LOSS final bar, realized P&L.
  const liveTrades = adaptTradeList(data);
  const bootstrap = shouldRenderBootstrap(mode) || !liveTrades;
  const trades = liveTrades ?? [];
  const openTrades = trades.filter((t) => t.status === 'OPEN');
  // 2026-06-08 (Item 93): the cosmetic per-row price drift is GONE. OPEN-row
  // P&L is now a real since-entry compute (live price vs graph entry) done in
  // TradeListRow — no random offset feeds any displayed price or P&L.
  // Portal v1.14 P2.4 (2026-05-30): build the M4 monitor-coverage Set from
  // AccountStateNode.monitor_coverage_unmonitored_trade_ids — union across
  // all accounts (current portal has one account, future-proof for many).
  // `state` = null means no AccountStateNode written yet (engine M4 hasn't
  // shipped) — badge renders nothing (neutral) in that case.
  const stateAccounts = adaptAccountState(data).accounts;
  const m4State = stateAccounts.length > 0 ? 'present' : 'absent';
  const unmonitoredSet = new Set();
  for (const a of stateAccounts) {
    for (const id of a.monitorCoverageUnmonitoredTradeIds) unmonitoredSet.add(String(id));
  }

  // Portal Rev 32.1 (2026-06-05): panel cap is a fixed constant = the measured
  // fit from diag portal_trades_panel_rowfit_and_sort_diag (usable tbody ~525px
  // / row ~39px = 13). The runtime useRowFitCap hook latched at 1 on the
  // operator's machine, so it is removed in favor of the locked constant.
  // EXPAND opens the windowed sort/filter modal (its own fetch).
  const capPc = 13;
  const [expanded, setExpanded] = useState(false);
  // 2026-06-08: OPEN rows pin to the top and are always shown (cap guard); the
  // remaining budget fills with the most-recent closed.
  const { visible: visibleTrades, overflow, moreCount } = selectVisibleTrades(trades, capPc);

  return (
    <div className="panel p-positions">
      <div className="ptitle">
        <span><span className="ptitle-bar" />TRADES</span>
        <span className="ptitle-r">
          {bootstrap
            ? 'AWAITING TRADES SINCE MARKET OPEN'
            : (
              <>
                {overflow
                  ? `${visibleTrades.length} OF ${trades.length}`
                  : `${openTrades.length} OPEN · ${trades.length} TOTAL`}
                <button type="button" className="trades-expand-btn" onClick={() => setExpanded(true)}>
                  {overflow ? `+${moreCount} MORE` : 'EXPAND'}
                </button>
              </>
            )}
        </span>
      </div>
      <table className="pos-table trade-list">
        <thead>
          <tr>
            <th>Asset</th><th>Class</th><th>Track</th><th>Conv</th>
            <th>Entry</th><th>Current</th>
            <th>Stop</th><th>Target</th>
            <th>Progress</th><th>P&amp;L</th><th>Hold</th>
          </tr>
        </thead>
        <tbody>
          {bootstrap ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--w3)', padding: '20px', fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px' }}>— AWAITING TRADES SINCE MARKET OPEN —</td></tr>
          ) : visibleTrades.map((t) => (
            <TradeListRow key={t.requestId || `${t.asset}-${t.entryTimestamp}`}
                          t={t}
                          m4State={m4State}
                          unmonitoredSet={unmonitoredSet} />
          ))}
        </tbody>
      </table>
      <TradesExpandModal
        open={expanded}
        onClose={() => setExpanded(false)}
        variant="pc"
        data={data}
        m4State={m4State}
        unmonitoredSet={unmonitoredSet}
        RowComponent={TradeListRow} />
    </div>
  );
}

function TradeListRow({ t, m4State = 'absent', unmonitoredSet = null }) {
  const isOpen = t.status === 'OPEN';
  if (isOpen) {
    // 2026-06-08 (Item 93): REAL since-entry P&L per leg — live price vs graph
    // entry, NO drift. The old `t.pnl/t.pnlPct + offset` was a random walk over
    // the null engine field (the displayed value AND its green/red sign were
    // noise; a losing long could render green). currentPx is the real broker
    // price already on the row (adapter `cur`); it was only drifted in the view.
    const livePriced = !!t.brokerPriced;
    const cur = t.cur;                  // CURRENT column = real broker price (no drift)
    const { pp, pv, hasPnl } = computeOpenLegPnl({
      currentPx: t.cur, entryPx: t.entry ?? 0, size: t.size ?? 0,
      direction: t.direction, target: t.target,
    });
    // 2026-06-08: no-live-price → neutral placeholder (P&L unknown, not a
    // fabricated $0.00); neutral-at-zero (0 is neither gain nor loss).
    const pnlTone = openPnlTone({ pv, livePriced, hasPnl });
    const pnlKnown = pnlTone !== 'none';
    const clr = pnlTone === 'pos' ? 'var(--green)' : pnlTone === 'neg' ? 'var(--red)' : 'var(--w2)';
    // Portal v1.16 (2026-05-30): M4 monitor-coverage join key derivation.
    // Used by the per-row monitor LIGHT under the asset name (see below).
    // Replaced the v1.14 P2.4 progress-cell takeover that became invisible
    // when m4State='absent'. Light is always-on for open rows: grey when
    // the engine hasn't written AccountStateNode yet, green when covered,
    // red when this row's tradeId appears in the unmonitored list.
    const m4Known = m4State === 'present';
    const isUnmonitored = m4Known && t.tradeId != null && unmonitoredSet?.has(String(t.tradeId));
    // (isMonitored is implicit: m4Known && !isUnmonitored && tradeId; see
    //  monitorState ternary below — kept as a derived bool for readability.)
    // eslint-disable-next-line no-unused-vars
    const isMonitored   = m4Known && !isUnmonitored && t.tradeId != null;
    // Portal v1.9 F2 (2026-05-29): directional progress + broker-miss.
    // Previous formula clamp(0, 100, (cur-entry)/(target-entry)) hid every
    // loss-direction hold as 0%, indistinguishable from "no movement," and
    // silently used cur=entry when the broker had no matching position —
    // pinning the bar at 0% with no indication on stranded phantoms.
    // New: signed move (using direction to flip for shorts) splits into
    //   - winning side: green fill toward target (denominator = target range)
    //   - losing side:  red fill toward stop      (denominator = stop range)
    //   - no-broker:    grey "NO LIVE PRICE" badge, no fill.
    // 2026-06-08: "% TO STOP" measures against the LIVE current_stop (breakeven/
    // trailing-adjusted), fallback entry stop_loss_price; BE guard when the stop
    // has ratcheted to/past entry. See computeOpenProgress.
    const prog = computeOpenProgress({
      cur, entry: t.entry, target: t.target,
      currentStop: t.currentStop, stop: t.stop,
      direction: t.direction, livePriced,
    });
    const progPct = prog.progPct;
    const progLabel = prog.label;
    const progClr = prog.mode === 'nolive' ? 'var(--w3)'
                  : prog.mode === 'be' ? 'var(--w2)'          // neutral/locked, NOT red
                  : prog.winning ? 'var(--green)' : 'var(--red)';
    // Portal v1.16 (2026-05-30): per-row monitor LIGHT under the asset cell.
    // Replaces the v1.15 visible trade-ID sub-label (clutter) and the dormant
    // Option-I badge that hid in the % TO TARGET cell (invisible when
    // m4State='absent'). One indicator per open row: dot + inline word.
    //   absent  → grey  · AWAITING       (every open row today, no node yet)
    //   covered → green · MONITORED
    //   in unmonitored set → red · UNMONITORED
    // Always render the dot on open rows — grey IS the no-data state.
    const monitorState = !m4Known ? 'grey' : (isUnmonitored ? 'red' : 'green');
    const monitorLabel = !m4Known ? 'AWAITING' : (isUnmonitored ? 'UNMONITORED' : 'MONITORED');
    return (
      <tr className="row-open">
        <td>
          <span className="passet">{t.asset}</span>
          <div className={'row-monitor ' + monitorState} aria-label={'monitor: ' + monitorLabel.toLowerCase()}>
            <span className="row-monitor-dot" aria-hidden="true" />
            <span className="row-monitor-lbl">{monitorLabel}</span>
          </div>
        </td>
        {/* Rev 34: CLASS in its own column — never inlined into the ASSET cell
            (which already carries the MONITORED badge side-by-side). */}
        <td><span className={'pclass ' + assetClassTag(t).cls}>{assetClassTag(t).lbl}</span></td>
        <td><span className={'ptrack ' + t.track}>{t.tl}</span></td>
        <td><span className={'pconv ' + t.conv}>{t.cl}</span></td>
        <td style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--w2)' }}>{t.entry.toLocaleString()}</td>
        <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--white)' }}>{cur.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
        <td style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--red)' }}>{t.stop.toLocaleString()}</td>
        <td style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--green)' }}>{t.target.toLocaleString()}</td>
        <td className="prog-wrap">
          {/* Portal v1.16 (2026-05-30): monitor badge moved out of this cell
              and into the per-row light under the asset name above. The
              progress cell is back to its v1.9 F2 shape: signed-direction
              fill + "X% TO TARGET" / "X% TO STOP" / "NO LIVE PRICE". */}
          <div className="prog-bg">
            {livePriced && <div className="prog-fill" style={{ width: progPct + '%', background: progClr }} />}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: progClr, marginTop: '2px' }}>{progLabel}</div>
        </td>
        <td>
          {pnlKnown ? (
            <>
              <div className="ppnl" style={{ color: clr }}>{pv > 0 ? '+' : pv < 0 ? '-' : ''}${Math.abs(pv).toFixed(2)}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: clr }}>{pp > 0 ? '+' : ''}{pp.toFixed(2)}%</div>
            </>
          ) : (
            <div className="ppnl" style={{ color: 'var(--w2)' }} title="no live price">—</div>
          )}
        </td>
        {/* HOLD cell — raised w3→w2 (2026-06-08) for legibility; matches the
            muted-but-readable CLASS/CONV label tone. */}
        <td style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--w2)' }}>{t.hold}</td>
      </tr>
    );
  }
  // Closed
  const isWin = t.winLoss === 'Win';
  const finalClr = isWin ? 'var(--green)' : 'var(--red)';
  const outcomeLabel = isWin ? 'WIN' : 'LOSS';
  return (
    <tr className="row-closed">
      <td><span className="passet">{t.asset}</span></td>
      <td><span className={'pclass ' + assetClassTag(t).cls}>{assetClassTag(t).lbl}</span></td>
      <td><span className={'ptrack ' + t.track}>{t.tl}</span></td>
      <td><span className={'pconv ' + t.conv}>{t.cl}</span></td>
      <td style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--w2)' }}>{t.entry.toLocaleString()}</td>
      <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--w2)' }}>{t.exit != null ? t.exit.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</td>
      <td style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--w3)' }}>{t.stop.toLocaleString()}</td>
      <td style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--w3)' }}>{t.target.toLocaleString()}</td>
      <td className="prog-wrap">
        <div className="prog-bg"><div className="prog-fill" style={{ width: '100%', background: finalClr }} /></div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: finalClr, marginTop: '2px', letterSpacing: '1px' }}>{outcomeLabel}</div>
      </td>
      <td>
        <div className="ppnl" style={{ color: finalClr }}>{t.pnl >= 0 ? '+' : ''}${Math.abs(t.pnl).toFixed(2)}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: finalClr }}>{t.pnlPct >= 0 ? '+' : ''}{t.pnlPct.toFixed(2)}%</div>
      </td>
      {/* HOLD cell — raised w3→w2 (2026-06-08) for legibility. */}
      <td style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--w2)' }}>
        {t.hold}
        {t.exitTimestamp && <div className="hold-closed">Closed {fmtCloseET(t.exitTimestamp)}</div>}
      </td>
    </tr>
  );
}

// Portal charts (2026-06-10): time-range toggle + Recharts helpers.
// A range is ENABLED once the series spans MORE than the previous tier's window,
// so with ~12 days of history only 1W / 1M / All are live; 3M / 1Y grey until
// the data exists. Toggle slices the existing broker-true series — no new wiring.
const CHART_RANGES = [
  { key: '1W', days: 7, minSpan: 0 },
  { key: '1M', days: 30, minSpan: 7 },
  { key: '3M', days: 90, minSpan: 30 },
  { key: '1Y', days: 365, minSpan: 90 },
  { key: 'All', days: Infinity, minSpan: 0 },
];
const DAY_MS = 86400000;
// Literal hex (matches the --cyan/--red/--w3 skin vars) — CSS custom properties
// are unreliable inside SVG presentation attributes, so pass concrete colors.
const CK = { cyan: '#00c2ff', red: '#ff3d57', amber: 'rgba(255,171,0,0.45)',
  grid: 'rgba(0,194,255,0.06)', axis: 'rgba(0,194,255,0.12)', tick: '#5b7da0', zero: '#3d6080' };
const AXIS_TICK = { fill: CK.tick, fontFamily: 'Share Tech Mono', fontSize: 7 };

function chartSpanDays(series) {
  if (!series || series.length < 2) return 0;
  return (new Date(series[series.length - 1].date).getTime() - new Date(series[0].date).getTime()) / DAY_MS;
}
function sliceByRange(rows, rangeKey) {
  if (!rows || !rows.length || rangeKey === 'All') return rows || [];
  const r = CHART_RANGES.find((x) => x.key === rangeKey);
  if (!r || !Number.isFinite(r.days)) return rows;
  const newest = new Date(rows[rows.length - 1].date).getTime();
  const cutoff = newest - r.days * DAY_MS;
  return rows.filter((p) => new Date(p.date).getTime() >= cutoff);
}
// Parse 'YYYY-MM-DD' as a LOCAL date (new Date('YYYY-MM-DD') is UTC-midnight and
// shifts a day back in negative-offset timezones — the axis/tooltip off-by-one).
const ymdLocal = (d) => { const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, dd || 1); };
const fmtDateTick = (d) => { const t = ymdLocal(d); return `${t.getMonth() + 1}/${t.getDate()}`; };
const fmtDateFull = (d) => ymdLocal(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtUsdTick = (v) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`);
const fmtUsdFull = (v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPctTick = (v) => `${v.toFixed(1)}%`;

function EquityTip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="eq-tip">
      <div className="eq-tip-d">{fmtDateFull(p.date)}</div>
      <div className="eq-tip-v" style={{ color: CK.cyan }}>{fmtUsdFull(p.equity)}</div>
    </div>
  );
}
function ReturnTip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  const up = p.r >= 0;
  const color = p.fill || (up ? CK.cyan : CK.red);
  return (
    <div className="eq-tip">
      <div className="eq-tip-d">{fmtDateFull(p.date)}</div>
      <div className="eq-tip-v" style={{ color }}>
        {(up ? '+' : '') + p.r.toFixed(2)}%{p.tier ? ` · ${p.tier.label}` : ''}
      </div>
      {p.tier && <div className="eq-tip-src">{p.tier.src}</div>}
    </div>
  );
}

function EquityCurvePanel({ mode, data }) {
  const series = adaptEquityCurve(data);
  const bootstrap = shouldRenderBootstrap(mode) || !series;
  // Time-range toggle (default 1M). A range greys out until the series spans
  // past the previous tier; the selected range falls back to All if disabled.
  const [range, setRange] = useState('1M');
  const span = useMemo(() => chartSpanDays(series), [series]);
  const enabled = useMemo(() => {
    const e = {};
    for (const r of CHART_RANGES) e[r.key] = !!series && series.length >= 2 && span >= r.minSpan;
    return e;
  }, [series, span]);
  const effRange = enabled[range] ? range : 'All';

  // Equity points sliced to the visible range (the chart line + fill).
  const eqData = useMemo(
    () => (bootstrap ? [] : sliceByRange(series, effRange)),
    [bootstrap, series, effRange],
  );
  // Daily returns derived from the FULL series (so the first visible bar keeps a
  // real prior), then sliced to the range — same broker-true equity points. Each
  // completed day carries its tier color (green/Alpha/Elite) + §15.5 source.
  const thr = tierThresholds(data);
  const retData = useMemo(() => {
    if (bootstrap || !series || series.length < 2) return [];
    const all = [];
    for (let i = 1; i < series.length; i++) {
      const prev = series[i - 1].equity;
      const cur = series[i].equity;
      const r = (Number.isFinite(prev) && prev > 0 && Number.isFinite(cur)) ? (cur / prev - 1) * 100 : 0;
      all.push({ date: series[i].date, r, fill: tierFill(r, thr), tier: dayTier(r, thr) });
    }
    return sliceByRange(all, effRange);
  }, [bootstrap, series, effRange, thr.alpha, thr.elite]);
  // Symmetric ±% domain so the daily chart's zero line sits at the vertical mid.
  const retMax = useMemo(
    () => Math.max(0.5, Math.ceil(retData.reduce((a, d) => Math.max(a, Math.abs(d.r)), 0) * 2) / 2),
    [retData],
  );
  const subscript = mode !== 'combined' ? <span style={{ fontSize: '6px', color: 'var(--w3)', marginLeft: '2px' }}>(combined)</span> : null;

  // Portal v1.21 (2026-06-01): client-side reducer over the live equity_total
  // series, replacing the v1.6-era pass-through from adaptEquityHeader.
  // EquitySnapshotNode persists none of peak/drawdown/twr per §9.1/§11.2
  // intent (engine writes only equity_total per nightly snapshot); the
  // proxy equity_curve_stats query reads those fields but they come back
  // null on every row. Compute here, reactively as the series grows (one
  // point/night). No new fetch — reuses the whitelisted equity_curve_series
  // already on the poll batch via Q_EQUITY_CURVE.
  //   PEAK     = max(equity_total) over the visible series.
  //   DRAWDOWN = max over series of (runningPeak - equity)/runningPeak,
  //              expressed as %. Zero capital flows in window today →
  //              raw == flow-adjusted. Generalized via runningPeak so
  //              off-monotonic series (peak-then-recovery) render correctly.
  //   TWR      = (lastEquity / firstEquity − 1) × 100, expressed as %.
  //              Single sub-period because no CapitalFlowNode wiring is
  //              hooked into the curve yet; will generalize to a product
  //              of (1+r_i) across sub-periods once flows arrive.
  // On today's monotonic-descending zero-flow series, DRAWDOWN and TWR
  // both land ≈ TOTAL RETURN — three near-identical values is the
  // expected output, not a bug; they diverge on peak-then-recovery curves.
  // Portal charts (2026-06-10): PEAK/DRAWDOWN/TWR now reflect the VISIBLE range
  // (eqData) so the header stats track the selected toggle.
  const computed = useMemo(() => {
    if (!eqData || eqData.length < 1) return null;
    let peak = -Infinity;
    let runningPeak = -Infinity;
    let maxDD = 0;
    for (const p of eqData) {
      const e = p.equity;
      if (!Number.isFinite(e)) continue;
      if (e > peak) peak = e;
      if (e > runningPeak) runningPeak = e;
      if (runningPeak > 0) {
        const dd = (runningPeak - e) / runningPeak;
        if (dd > maxDD) maxDD = dd;
      }
    }
    const firstEquity = eqData[0]?.equity;
    const lastEquity = eqData[eqData.length - 1]?.equity;
    const twr = (Number.isFinite(firstEquity) && firstEquity > 0 && Number.isFinite(lastEquity))
      ? (lastEquity / firstEquity - 1) * 100
      : null;
    return {
      peak: Number.isFinite(peak) ? peak : null,
      drawdownPct: maxDD * 100,
      twrPct: twr,
    };
  }, [eqData]);

  const peakFmt = computed?.peak != null ? `$${Math.round(computed.peak).toLocaleString()}` : '—';
  const ddFmt = computed?.drawdownPct != null ? `${computed.drawdownPct.toFixed(2)}%` : '—';
  const twrFmt = computed?.twrPct != null ? `${computed.twrPct >= 0 ? '+' : ''}${computed.twrPct.toFixed(2)}%` : '—';

  return (
    <div className="panel eq-panel">
      <div className="eq-head">
        <span className="eq-title"><span className="ptitle-bar" />EQUITY CURVE</span>
        <span className="eq-stats">
          <span className="lbl">PEAK</span><span className="g">{peakFmt}</span>
          <span className="lbl">DD</span><span className="r">{ddFmt}</span>
          <span className="lbl">TWR</span><span>{twrFmt}</span>{subscript}
          {/* Portal charts (2026-06-10): time-range toggle (default 1M; ranges
              without enough history are greyed/disabled). */}
          <span className="eq-range">
            {CHART_RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                className={'eq-range-btn' + (effRange === r.key ? ' active' : '')}
                disabled={!enabled[r.key]}
                onClick={() => { if (enabled[r.key]) setRange(r.key); }}
              >{r.key}</button>
            ))}
          </span>
        </span>
      </div>
      <div className="eq-svg-wrap">
        {/* Portal charts (2026-06-10): Recharts equity AreaChart (top, flex) +
            daily-return BarChart (bottom, fixed) — axes + hover tooltip. */}
        <div className="eq-svg-equity">
          {bootstrap ? (
            <div className="eq-await">— AWAITING LIVE EQUITY SERIES —</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={eqData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="eqGradPos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(0,194,255,0.18)" />
                    <stop offset="100%" stopColor="rgba(0,194,255,0)" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CK.grid} vertical={false} />
                <ReferenceLine y={10000} stroke={CK.amber} strokeDasharray="3 3" ifOverflow="extendDomain" />
                <XAxis dataKey="date" tickFormatter={fmtDateTick} tick={AXIS_TICK}
                  tickLine={false} axisLine={{ stroke: CK.axis }} minTickGap={26} height={14} />
                <YAxis tickFormatter={fmtUsdTick} tick={AXIS_TICK} tickLine={false}
                  axisLine={false} width={36} domain={['auto', 'auto']} />
                <Tooltip content={<EquityTip />} cursor={{ stroke: CK.cyan, strokeOpacity: 0.4, strokeDasharray: '3 3' }} />
                <Area type="monotone" dataKey="equity" stroke={CK.cyan} strokeWidth={1.4}
                  fill="url(#eqGradPos)" dot={false} activeDot={{ r: 2.5, fill: CK.cyan, stroke: 'none' }}
                  isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="eq-svg-return">
          <span className="eq-ret-lbl">DAILY RETURN</span>
          {!bootstrap && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={retData} margin={{ top: 2, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
                <CartesianGrid stroke={CK.grid} vertical={false} />
                <ReferenceLine y={0} stroke={CK.zero} strokeOpacity={0.7} />
                <XAxis dataKey="date" tickFormatter={fmtDateTick} tick={AXIS_TICK}
                  tickLine={false} axisLine={{ stroke: CK.axis }} minTickGap={26} height={14} />
                <YAxis tickFormatter={fmtPctTick} tick={AXIS_TICK} tickLine={false}
                  axisLine={false} width={36} domain={[-retMax, retMax]} />
                <Tooltip content={<ReturnTip />} cursor={{ fill: 'rgba(0,194,255,0.08)' }} />
                <Bar dataKey="r" radius={[1, 1, 0, 0]} isAnimationActive={false}>
                  {retData.map((d, i) => (
                    <Cell key={i} fill={d.fill} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

function NewsAndStatusPanel({ mode, data }) {
  // Portal v1.2 (2026-05-26) — three horizontal streaming marquees stacked:
  //   - StatusStrip    (top)    SYSTEM EVENTS horizontal scroll (Change 2)
  //   - MacroNewsStrip (middle) Alpha Vantage macro feed (Change 3: moved up
  //                              from bottom so the operator sees Fed/macro
  //                              news without scrolling; Change 4: 90s loop)
  //   - NewsTicker     (bottom) per-asset NewsContextNode marquee
  const recentEvents = adaptRecentEvents(data, 5);
  const newsItems = adaptNewsTicker(data);
  const macroItems = adaptMacroNews(data);
  const cacheStatus = data?.macroNews?.cache;
  // Mode toggle filtering: under LIVE, suppress per-asset content per the
  // existing bootstrap convention. Macro news + system events stay visible.
  const bootstrap = shouldRenderBootstrap(mode);

  return (
    <div className="panel p-news-status">
      <StatusStrip recentEvents={recentEvents} />
      <div className="news-row macro">
        <MacroNewsStrip items={macroItems} cacheStatus={cacheStatus} />
      </div>
      <div className="news-row primary">
        {bootstrap
          ? <div className="news-ticker-empty">— LIVE MODE — PER-ASSET NEWS SUPPRESSED —</div>
          : <NewsTicker items={newsItems} />}
      </div>
    </div>
  );
}

// Compact dollar (no decimals) for the tight 3×3 domain grid cells.
function fmtUsd0(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const r = Math.round(v);
  return (r < 0 ? '-$' : '+$') + Math.abs(r);
}

function DollarCell({ metric, title, ariaLabel, extraCls }) {
  const ec = extraCls ? ' ' + extraCls : '';
  if (!metric || !metric.hasData) {
    return (
      <div className={'rm-cell rm-empty' + ec} title={title} aria-label={ariaLabel} data-empty="true">
        <div className="rm-cell-pct">—</div>
        <div className="rm-cell-n">n=0</div>
      </div>
    );
  }
  const cls = metric.pnl > 0 ? 'rm-pos' : (metric.pnl < 0 ? 'rm-neg' : 'rm-flat');
  return (
    <div className={'rm-cell ' + cls + ec} title={title} aria-label={ariaLabel}>
      <div className="rm-cell-pct">{fmtUsd0(metric.pnl)}</div>
      <div className="rm-cell-n">n={metric.n}</div>
    </div>
  );
}

// §6.6 RETURNS BY DOMAIN — consolidated panel with a PANEL-LOCAL $/% toggle
// (drives ONLY this panel). "$" = LIVE cumulative dollars (proxy
// panel_returns_by_domain; exclude-36, asset_class folded — no 'Large Cap
// Stock' split). "%" = DEFERRED: a pending state, NOT a number — annualized-%
// awaits the proxy methodology + insufficient_history flag. ZERO frontend
// annualization; when the proxy serves it, "%" is a field wire-up, no relayout.
function ReturnsByDomainPanel({ mode, data }) {
  const liveMode = mode === 'live';
  const [view, setView] = useState('$');
  const m = liveMode ? null : adaptPanelReturnsByDomain(data);
  const TRACK_ABBR = { Conservative: 'CONS', Moderate: 'MOD', Aggressive: 'AGG' };

  const header = (
    <div className="ptitle">
      <span><span className="ptitle-bar" />RETURNS BY DOMAIN</span>
      <span className="rbd-toggle" role="group" aria-label="dollar or percent view">
        <button type="button" className={'rbd-tab' + (view === '$' ? ' on' : '')} aria-pressed={view === '$'} onClick={() => setView('$')}>$</button>
        <button type="button" className={'rbd-tab' + (view === '%' ? ' on' : '')} aria-pressed={view === '%'} onClick={() => setView('%')}>%</button>
      </span>
    </div>
  );

  // "%" — DEFERRED pending state. No number, no frontend annualization.
  if (view === '%') {
    return (
      <div className="panel p-returns p-returns-pc rbd-panel">
        {header}
        <div className="rbd-pending">
          <div className="rbd-pending-main">— % VIEW PENDING —</div>
          <div className="rbd-pending-sub">Annualized return awaiting proxy methodology + insufficient-history flag (12 equity days &lt; 30 → ~30× annualization). No frontend annualization.</div>
        </div>
      </div>
    );
  }

  // "$" — LIVE (default view).
  if (!m) {
    return (
      <div className="panel p-returns p-returns-pc rbd-panel">
        {header}
        <div className="rm-bootstrap">— AWAITING LIVE $ MATRIX —</div>
      </div>
    );
  }
  const { assetClassOrder, trackOrder, cell, rowSigma, colSigma, corner } = m;
  return (
    <div className="panel p-returns p-returns-pc rbd-panel">
      {header}
      <div className="rbd-meta" title="§15.5: cumulative pnl_dollar per track × asset_class, broker-reconciling; 36 §6.6 corrupt closes excluded; asset_class folded.">excl-36 · broker-reconciling · {fmtUsd0(corner.pnl)} · {corner.n} closed</div>
      <div className="rm-grid rbd-grid">
        <div className="rm-h rm-corner-h" aria-hidden="true" />
        {trackOrder.map((tr) => (
          <div key={tr} className="rm-h rm-col-h" title={tr}>{TRACK_ABBR[tr] ?? tr}</div>
        ))}
        <div className="rm-h rm-col-h rm-sigma-h" title="Per-asset-class $ totals">Total</div>

        {assetClassOrder.map((ac) => (
          <DomainDollarRow key={ac} assetClass={ac} trackOrder={trackOrder} cell={cell} colSigma={colSigma[ac]} />
        ))}

        <div className="rm-h rm-row-h rm-sigma-h rbd-total-h" title="Per-track $ totals">Total</div>
        {trackOrder.map((tr) => (
          <DollarCell key={'rs-' + tr} metric={rowSigma[tr]} extraCls="rbd-total-cell" title={`All asset classes · ${tr}`} ariaLabel={`All asset classes · ${tr}: ${fmtUsdSigned(rowSigma[tr]?.pnl)} over ${rowSigma[tr]?.n ?? 0} trades`} />
        ))}
        <DollarCell metric={corner} extraCls="rbd-total-cell" title="Grand total ($)" ariaLabel={`Grand total: ${fmtUsdSigned(corner.pnl)} over ${corner.n} trades`} />
      </div>
    </div>
  );
}

function DomainDollarRow({ assetClass, trackOrder, cell, colSigma }) {
  return (
    <>
      <div className="rm-h rm-row-h" title={assetClass}>{assetClass}</div>
      {trackOrder.map((tr) => {
        const c = cell[`${assetClass}:${tr}`];
        return (
          <DollarCell key={tr} metric={c} title={`${assetClass} · ${tr}`} ariaLabel={`${assetClass} · ${tr}: ${c ? fmtUsdSigned(c.pnl) : '—'} over ${c?.n ?? 0} trades`} />
        );
      })}
      <DollarCell metric={colSigma} title={`${assetClass} · all tracks`} ariaLabel={`${assetClass} · all tracks: ${fmtUsdSigned(colSigma?.pnl)} over ${colSigma?.n ?? 0} trades`} />
    </>
  );
}

function MetricsPanel({ mode, data }) {
  const liveMode = mode === 'live';
  const winRate = adaptWinRate(data);
  // §6.6 (2026-06-10): Sharpe now reads the proxy per-trade log-return panel
  // (exact §12, exclude-36) instead of the stale WeeklyContextNode value.
  const sharpe = adaptPanelSharpe(data);
  const conviction = adaptConviction(data);
  // Lane 2 is always OFFLINE in Phase 1.1 regardless of data; placeholder
  // amber treatment is the correct state per Section A.

  const wrBoot = liveMode || !winRate;
  const srBoot = liveMode || !sharpe;
  const ctBoot = liveMode || !conviction;

  return (
    <div className="panel p-waterfall">
      <div className="ptitle"><span><span className="ptitle-bar" />SYSTEM METRICS</span></div>

      {/* WIN RATE */}
      <div className="mc">
        <div className="mc-left">
          <div className="mc-label">WIN RATE</div>
          {wrBoot ? (
            <>
              <div className="mc-value dim" style={{ color: 'var(--w3)' }}>—%</div>
              <div className="mc-sub">AWAITING FIRST CLOSED TRADE</div>
            </>
          ) : (
            <>
              <div className="mc-value g">{winRate.pct.toFixed(1)}%</div>
              <div className="mc-sub">{winRate.wins} wins / {winRate.total} trades</div>
            </>
          )}
        </div>
        <svg className="mc-arc" width="56" height="34" viewBox="0 0 56 34" overflow="visible">
          <path d="M4,30 A24,24 0 0,1 52,30" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" strokeLinecap="round" />
          {!wrBoot && (
            <>
              <path d="M4,30 A24,24 0 0,1 52,30" fill="none" stroke="var(--green)" strokeWidth="5" strokeLinecap="round"
                strokeDasharray="75.4" strokeDashoffset={(1 - winRate.pct / 100) * 75.4} opacity="0.9" />
              <text x="28" y="22" textAnchor="middle" fontFamily="Share Tech Mono" fontSize="8" fill="var(--green)">{winRate.pct.toFixed(1)}%</text>
            </>
          )}
        </svg>
      </div>

      {/* SHARPE — per-trade log-return basis (§6.6 exclude-36), proxy-served.
          Honest display: band/confidence shown verbatim, CRITICAL not dressed
          up; the annualized (daily-equity) basis is marked UNAVAILABLE while
          equity-day history is thin (insufficient_history). */}
      <div className="mc">
        <div className="mc-left">
          <div className="mc-label">SHARPE RATIO</div>
          {srBoot ? (
            <>
              <div className="mc-value dim" style={{ color: 'var(--w3)' }}>—</div>
              <div className="mc-sub">AWAITING PROXY SHARPE</div>
            </>
          ) : (
            <>
              <div className={'mc-value ' + (sharpe.band === 'CRITICAL' ? 'r' : 'c')}>{fmtSharpeVal(sharpe.sr)}</div>
              <div className="mc-sub">
                band <span style={{ color: sharpe.band === 'CRITICAL' ? 'var(--loss)' : 'var(--cyan)', fontWeight: 700 }}>{sharpe.band}</span>
                {' · '}conf {sharpe.confidence}{' · '}n={sharpe.n}
              </div>
              <div className="mc-sub" style={{ color: 'var(--w3)' }}>per-trade log-return · excl-36 · broker-reconciling</div>
              {sharpe.insufficientHistory && (
                <div className="mc-sub" style={{ color: 'var(--amber)', opacity: 0.85 }}>
                  annualized (daily-equity) basis UNAVAILABLE — {sharpe.equityDays} equity days &lt; 30 (insufficient history)
                </div>
              )}
            </>
          )}
        </div>
        <svg className="mc-arc" width="56" height="34" viewBox="0 0 56 34" overflow="visible">
          <path d="M4,30 A24,24 0 0,1 52,30" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" strokeLinecap="round" />
          {!srBoot && (
            <>
              <path d="M4,30 A24,24 0 0,1 52,30" fill="none" stroke={sharpe.band === 'CRITICAL' ? 'var(--loss)' : 'var(--cyan)'} strokeWidth="5" strokeLinecap="round"
                strokeDasharray="75.4" strokeDashoffset={Math.max(0, (1 - Math.min(Math.max(sharpe.sr, 0) / 3, 1)) * 75.4)} opacity="0.9" />
              <text x="28" y="22" textAnchor="middle" fontFamily="Share Tech Mono" fontSize="7" fill={sharpe.band === 'CRITICAL' ? 'var(--loss)' : 'var(--cyan)'}>{fmtSharpeVal(sharpe.sr)}</text>
            </>
          )}
        </svg>
      </div>

      {/* LANE 2 OFFLINE — Phase 1.1 invariant */}
      <div className="mc mc-delta offline">
        <div className="mc-left">
          <div className="mc-label" style={{ color: 'var(--amber)', letterSpacing: '3px' }}>LANE 2 Δ DELTA</div>
          <div className="mc-value dim" style={{ fontSize: '18px', color: 'var(--amber)' }}>OFFLINE</div>
          <div className="mc-sub" style={{ color: 'var(--amber)', opacity: 0.75 }}>lane2_enabled = false · scaffold mode</div>
          <div className="mc-sub" style={{ color: 'var(--w3)', marginTop: '3px' }}>
            {data?.lane2 ? `${data.lane2.resolved_count || 0} / 200 PREDICTIONS RESOLVED` : '0 / 200 PREDICTIONS RESOLVED'}
          </div>
        </div>
        <svg className="mc-arc" width="56" height="40" viewBox="0 0 56 40" overflow="visible">
          <path d="M4,36 A24,24 0 0,1 52,36" fill="none" stroke="rgba(255,171,0,0.10)" strokeWidth="7" strokeLinecap="round" />
          <path d="M4,36 A24,24 0 0,1 52,36" fill="none" stroke="var(--amber)" strokeWidth="7" strokeLinecap="round"
            strokeDasharray="75.4" strokeDashoffset="37.7" opacity="0.20" />
          <text x="28" y="26" textAnchor="middle" fontFamily="Share Tech Mono" fontSize="8" fill="var(--amber)" opacity="0.7">5%</text>
          <text x="28" y="36" textAnchor="middle" fontFamily="Share Tech Mono" fontSize="6" fill="var(--w3)">GATE</text>
        </svg>
      </div>

      {/* CONVICTION DONUT */}
      <div className="mc">
        <div className="mc-left">
          <div className="mc-label">CONVICTION TIERS</div>
          {ctBoot ? (
            <>
              <div className="mc-value dim" style={{ color: 'var(--w3)', fontSize: '18px' }}>— PENDING</div>
              <div className="mc-sub">AWAITING FIRST TRADE</div>
            </>
          ) : (
            <>
              <div className="mc-value" style={{ color: 'var(--amber)', fontSize: '18px' }}>{conviction.dominantLabel} {conviction.dominantPct.toFixed(0)}%</div>
              {/* Portal v1.2 conviction-tier display fix (2026-05-26):
                  Previously the sub-line read "High N% · Std N% · sizing …"
                  which duplicated the Std value already in the headline AND
                  hid the Max tier entirely. New layout shows all three tiers
                  in Max/High/Std order (highest sizing first) on one line,
                  with the sizing multipliers on a second aligned line so
                  ×1.5 sits under Max, ×1.25 under High, ×1.0 under Std. */}
              <div className="mc-sub">Max {conviction.max.toFixed(0)}% · High {conviction.high.toFixed(0)}% · Std {conviction.std.toFixed(0)}%</div>
              <div className="mc-sub">sizing ×1.5 · ×1.25 · ×1.0</div>
            </>
          )}
        </div>
        <svg width="56" height="56" viewBox="0 0 56 56" style={{ flexShrink: 0 }}>
          <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
          {!ctBoot && (
            <ConvictionDonut conviction={conviction} />
          )}
        </svg>
      </div>
    </div>
  );
}

function ConvictionDonut({ conviction }) {
  // Circumference ≈ 138.23. Each segment occupies (pct/100) of the circumference.
  // Three slices, STD-first ordering so the dash offset chain reads cleanly
  // around the ring: STD (gray) → HIGH (cyan) → MAX (amber). Per the v1.2
  // conviction-tier display-fix dispatch, the center-number text element was
  // removed — it showed Max% which collapsed to a misleading "0%" whenever
  // the engine wasn't producing maximum-conviction trades, AND it duplicated
  // the headline's dominant-tier number. Three slices alone carry the visual.
  const C = 2 * Math.PI * 22;
  const stdLen = (conviction.std / 100) * C;
  const hiLen = (conviction.high / 100) * C;
  const maxLen = (conviction.max / 100) * C;
  return (
    <>
      <circle cx="28" cy="28" r="22" fill="none" stroke="var(--w3)" strokeWidth="7"
        strokeDasharray={`${stdLen} ${C - stdLen}`} strokeDashoffset="0" transform="rotate(-90 28 28)" />
      <circle cx="28" cy="28" r="22" fill="none" stroke="var(--cyan)" strokeWidth="7"
        strokeDasharray={`${hiLen} ${C - hiLen}`} strokeDashoffset={-stdLen} transform="rotate(-90 28 28)" />
      <circle cx="28" cy="28" r="22" fill="none" stroke="var(--amber)" strokeWidth="7"
        strokeDasharray={`${maxLen} ${C - maxLen}`} strokeDashoffset={-(stdLen + hiLen)} transform="rotate(-90 28 28)" />
    </>
  );
}

function KernelPanel({ data }) {
  // Phase 1.1: Three.js scene renders the 5-cluster INITIALIZING placeholder
  // regardless of data wiring (IndicatorNodes don't exist until Phase 4).
  const canvasRef = useRef(null);
  const [counts, setCounts] = useState({ nodes: KERNEL_COUNTS.nodes, edges: KERNEL_COUNTS.edges });
  // Portal v1.9 F1 (2026-05-29): kernel-overlay CYCLES now reads the real
  // learning-loop cycle count from `rules_footer.max(r.cycle_number)` (same
  // source the Rules-footer CYCLE pill uses), not the placeholder literal
  // `KERNEL_COUNTS.cycles = 6` that pre-dated live wiring. With zero loop
  // runs this shows 0.
  const foot = adaptRulesFoot(data);
  const cyclesCount = foot?.cycle ?? 0;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const k = initKernelScene(canvas);
    setCounts(k.counts);
    const onResize = () => k.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      k.destroy();
    };
  }, []);

  return (
    <div className="panel p-kernel">
      <canvas id="kernel-canvas" ref={canvasRef} />
      <div className="kernel-overlay">
        <span className="kernel-title">KNOWLEDGE KERNELS</span>
        <span className="kernel-count">{counts.nodes} NODES · {counts.edges} EDGES</span>
      </div>
      <div className="kernel-legend">
        <div className="kl-item"><span className="kl-dot" style={{ background: '#00c2ff' }} />TRADES</div>
        <div className="kl-item"><span className="kl-dot" style={{ background: '#ffab00' }} />NEWS</div>
        <div className="kl-item"><span className="kl-dot" style={{ background: '#ddeeff' }} />WEEKLY</div>
        <div className="kl-item"><span className="kl-dot" style={{ background: '#3d6080' }} />SCAFFOLD</div>
        <div className="kl-item"><span className="kl-dot" style={{ background: '#00e676' }} />RULES</div>
      </div>
      <div className="kernel-bottom">
        <div className="kernel-stat">PHASE <span>{KERNEL_COUNTS.phase}</span></div>
        <div className="kernel-stat">CYCLES <span>{cyclesCount}</span></div>
        <div className="kernel-stat">LANE 2 <span className="amber">OFFLINE</span></div>
      </div>
    </div>
  );
}

// Portal v1.17 (2026-05-30): local stub removed; rendering moved to the
// shared component at src/lib/ReturnsMatrixPanel.jsx so PC + mobile DATA
// tab consume one source. v1.17 wired the 16-call returns_matrix_* batch
// into useNeo4jPoll and the adaptReturnsMatrix() derivations into
// dataAdapter. The PC caller at <Main> passes mode+data unchanged.

function RulesAddedPanel({ mode, data }) {
  const rules = adaptRulesThisWeek(data);
  const foot = adaptRulesFoot(data);
  const cohort = adaptClosestCohort(data);
  const bootstrap = shouldRenderBootstrap(mode) || (!rules && !foot);

  return (
    <div className="panel p-rules">
      <div className="ptitle">
        {/* 2026-06-08: "THIS CYCLE" (was "THIS WEEK") — rules are counted per
            learning-loop cycle; the footer "0 RULES" is the rules count, not a
            week number. */}
        <span><span className="ptitle-bar" />RULES ADDED THIS CYCLE</span>
        <span className="ptitle-r">CYCLE {foot?.cycle ?? 0}</span>
      </div>
      <div className="rules-list">
        {bootstrap || !rules ? (
          // 2026-06-08: informative empty-state — progress toward the first rule.
          // Suppress cohort progress under live-mode bootstrap (no live corpus).
          <RulesEmptyState cohort={bootstrap ? null : cohort} />
        ) : rules.map((r, i) => (
          <div className={'rule-row sec-' + r.sec.toLowerCase()} key={r.ruleId || i}>
            <div className={'rule-badge sec-' + r.sec.toLowerCase()}>{r.sec}</div>
            <div className="rule-day">{r.day}</div>
            <div className="rule-text">{r.text.map((part, j) =>
              typeof part === 'string' ? part : <strong key={j}>{part.b}</strong>
            )}</div>
          </div>
        ))}
        <div className="rules-foot">
          {foot?.thisWeek ?? 0} RULES · CYCLE <span>{foot?.cycle ?? 0}</span> · TOTAL <span>{foot?.total ?? 0}</span>
        </div>
      </div>
    </div>
  );
}

// Portal v1.11 (2026-05-29): Ticker now reads live Alpaca SIP stocks +
// crypto via the proxy /price_ticker endpoint (full 32-asset monitored
// universe sourced server-side from TradingConfigNode). Retires the
// hardcoded TICKER literal + the cosmetic ±0.1% setInterval wobble.
//
// Refresh: piggybacks on the 60s useNeo4jPoll cadence — no own interval.
// The 28s marquee scroll is cosmetic and unchanged.
// Offline: when proxy returns 503/error or both arrays empty, renders
// "PRICE FEED OFFLINE" instead of a frozen stale list.
// Freshness: small dim pill at the right edge shows "as of Ns" computed
// from fetched_at_ms, re-rendered every second.
function Ticker({ data }) {
  const { items, fetchedAtMs, offline } = adaptPriceTicker(data);
  // 1s timer for the freshness counter — independent of the data poll.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ageSeconds = fetchedAtMs != null
    ? Math.max(0, Math.floor((nowMs - fetchedAtMs) / 1000))
    : null;

  if (offline) {
    return (
      <div className="ticker ticker-offline">
        <div className="ticker-offline-msg">— PRICE FEED OFFLINE —</div>
      </div>
    );
  }
  const all = [...items, ...items]; // doubled for seamless marquee loop
  return (
    <div className="ticker">
      <div className="ticker-inner">
        {all.map((t, i) => (
          <div className="ti" key={`${t.s}-${i}`}>
            <span className="ti-sym">{t.s}</span>
            <span className="ti-px">{t.p}</span>
            <span className={'ti-ch ' + t.d}>{t.c}</span>
          </div>
        ))}
      </div>
      {ageSeconds != null && (
        <div className="ticker-asof" title={`Last fetched ${ageSeconds}s ago`}>
          as of {ageSeconds}s
        </div>
      )}
    </div>
  );
}
