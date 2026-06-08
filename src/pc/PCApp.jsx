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
  buildWeekFrame,
  fmtCloseET,
  assetClassTag,
} from '../lib/dataAdapter.js';
import { buildEquityCurveSvgFromSeries, buildDailyReturnBars } from '../lib/equityCurve.js';
import { initKernelScene } from '../lib/kernelScene.js';
import { computeBadge } from '../lib/performanceBadge.js';
import { computeAnnualized, computePaceTier, deriveTodayPct, PACE_TIERS } from '../lib/annualizedReturn.js';

// Portal Rev 35/36 (2026-06-04): single-source tier thresholds for the daily-
// return strip — same Rev-33 ladder the pace badge uses, no 2nd threshold.
// Rev 36: bars are colored by tier (STRONG/ELITE), gold pip markers removed.
const STRONG_DAILY_PCT = PACE_TIERS.find((t) => t.key === 'strong')?.dailyMinPct ?? Infinity;
const ELITE_DAILY_PCT = PACE_TIERS.find((t) => t.key === 'elite')?.dailyMinPct ?? Infinity;
// Internal viewBox height for the return strip (preserveAspectRatio=none stretches
// it to the ~24px CSS box beneath the equity curve).
const RETURN_STRIP_H = 40;
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
import ReturnsMatrixPanel from '../lib/ReturnsMatrixPanel.jsx';
import RulesEmptyState from '../lib/RulesEmptyState.jsx';
import TradeOverlay from './TradeOverlay.jsx';
import TradesExpandModal from './TradesExpandModal.jsx';

const MODES = ['live', 'training', 'combined'];
const DEFAULT_MODE = 'training';

const scoreCls = (s) => (s >= 65 ? 'hi' : s >= 40 ? 'mi' : 'lo');
const barClr = (s) => {
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
      <WeekRow mode={mode} data={data} />
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

// Portal Rev 33 (2026-06-04): tiered pace badge (Feature 3). Shared by PC +
// mobile via this module's computePaceTier(). Only SOLID/STRONG/ELITE render a
// badge; plain-positive and down bands carry color on the daily-% stat only
// (no badge). Compliance: copy reads as PACE, never an annual-return claim;
// far-past-elite shows ">60% pace", never a raw extrapolated annual %.
function PaceBadge({ pace }) {
  if (!pace || !pace.label) return null;
  const sub = "today's pace · if every day were like this";
  const aria = `${pace.label} — ${sub}${pace.paceDisplay ? ` (${pace.paceDisplay})` : ''}`;
  return (
    <div className={'pace-badge pace-' + pace.cls} title={sub} aria-label={aria}>
      <span className="pace-dot" aria-hidden="true" />
      <span className="pace-lbl">{pace.label}</span>
      {pace.paceDisplay && <span className="pace-sub">{pace.paceDisplay}</span>}
    </div>
  );
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
  const openCount = liveAccountBar?.open;             // broker or null
  const valFmt = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = (v) => (v >= 0 ? '+' : '');
  const cls = (v) => (v >= 0 ? 'g' : 'r');
  const dash = <span className="aval dim" style={{ color: 'var(--w3)' }}>—</span>;

  // Portal Rev 33 (2026-06-04): annualized stat + per-day pace badge, computed
  // client-side from the same daily equity series the curve uses (no 2nd
  // fetch). Annualized rides the account-bar LIVE/TRAINING filter (dash under
  // LIVE, like its siblings); pace + daily-% derive from broker Today P&L.
  const series = adaptEquityCurve(data);
  const annual = useMemo(() => computeAnnualized(series), [series]);
  const annualBoot = bootstrap || !series;
  const todayPct = deriveTodayPct(av, ap);
  const pace = useMemo(() => computePaceTier(todayPct), [todayPct]);

  // Portal Rev 42 (2026-06-04): DAY W/L (ET) — wins/total of trades CLOSED today
  // on the ET calendar boundary (America/New_York). Deliberately NOT the Alpaca-
  // session TODAY P&L window — hence the "(ET)" label. `tradesClosedToday` is the
  // raw row feed (win_loss per row); null = feed unavailable (proxy pre-restart)
  // → render a dash, not a misleading 0/0.
  const closedToday = data?.tradesClosedToday;
  const dayWins = Array.isArray(closedToday) ? closedToday.filter((r) => r.win_loss === 'Win').length : 0;
  const dayTotal = Array.isArray(closedToday) ? closedToday.length : 0;
  const dayPct = dayTotal ? Math.round((dayWins / dayTotal) * 100) : null;

  return (
    <div className="acct">
      <div className="aitem"><span className="alabel">Capital Base</span><span className="aval">${capitalBase.toLocaleString()}</span></div>
      <div className="aitem aitem-annualized"><span className="alabel">Annualized</span>
        {annualBoot
          ? dash
          : (annual.gated
              ? <span className="aval aval-building">{annual.display}</span>
              : <span className={'aval aval-annualized ' + cls(annual.annualizedPct)}>{annual.display}</span>)}
        {!annualBoot && <PaceBadge pace={pace} />}
      </div>
      <div className="aitem"><span className="alabel">Current Value</span>
        {bootstrap || av == null
          ? dash
          : <span className={'aval ' + cls(av - capitalBase)}>${valFmt(av)}</span>}
      </div>
      <div className="aitem"><span className="alabel">Total Return</span>
        {bootstrap || totalReturnPct == null
          ? dash
          : <span className={'aval ' + cls(totalReturnPct)}>{sign(totalReturnPct)}{totalReturnPct.toFixed(2)}%</span>}
      </div>
      <div className="aitem"><span className="alabel">Today P&amp;L</span>
        {bootstrap || ap == null
          ? dash
          : (
            <>
              <span className={'aval ' + cls(ap)}>{sign(ap)}${Math.abs(ap).toFixed(2)}</span>
              {/* Rev 33 Feature 2: daily-% colored by sign (>=0 green, <0 red). */}
              {todayPct != null && (
                <span className={'aval-sub ' + cls(todayPct)}>{sign(todayPct)}{todayPct.toFixed(2)}%</span>
              )}
            </>
          )}
      </div>
      <div className="aitem"><span className="alabel">Day W/L (ET)</span>
        {bootstrap || !Array.isArray(closedToday)
          ? dash
          : (
            <span className={'aval ' + (dayTotal && dayPct >= 50 ? 'g' : '')}>
              {dayWins}/{dayTotal}{dayTotal ? ` · ${dayPct}%` : ''}
            </span>
          )}
      </div>
      <div className="aitem"><span className="alabel">Trades</span>
        <span className="aval c">{bootstrap ? 0 : (liveAccountBar?.trades ?? 0)}</span>
      </div>
      <div className="aitem"><span className="alabel">Open</span>
        <span className="aval c">{bootstrap || openCount == null ? '—' : openCount}</span>
      </div>
      <div className="acct-divider" />
      {/* Portal v1.14 (2026-05-30): MiniWaterfall moved to <WeekRow/> below
          the banner. Banner-right now hosts the collapsed M4 §6 health
          strip (one row per AccountStateNode). Suppress `liveWeeklyWaterfall`
          unused-var lint by intentionally referencing it. */}
      {void liveWeeklyWaterfall}
      <div className="acct-health">
        <HealthStrip data={data} layout="pc" />
      </div>
    </div>
  );
}

// Portal v1.14 P2.1 + P2.3 (2026-05-30): full-width week-tracker row sitting
// directly beneath the banner. 5-slot default that expand-and-shrinks up to
// the proxy's MAX 13 (rolling-quarter window per dispatch decision 2). The
// inner waterfall reuses the existing MiniWaterfall, which already applies
// the 1B color scheme via .acct-wf-bar.{cur|pos|neg} (cyan-pulse current,
// green completed positive, red completed negative). Header reads "{N}
// WEEKS · CUR W{idx}" derived from the data array — fixes the prior
// hardcoded "6 WEEKS · CUR W6" stamp.
function WeekRow({ mode, data }) {
  const liveWeeklyWaterfall = adaptWeeklyWaterfall(data);
  const bootstrap = shouldRenderBootstrap(mode) || !liveWeeklyWaterfall;
  // Portal v1.15 Item A (2026-05-30): min 5-slot frame, max 13. Frame
  // build moved into buildWeekFrame() in dataAdapter so PC + mobile
  // share one source of truth. Header rule: realCount < 5 → "WEEK c OF 5"
  // (the operator sees today's W1 with W2..W5 ahead); else
  // "{realCount} WEEKS · CUR W{c}".
  const frame = buildWeekFrame(liveWeeklyWaterfall ?? []);
  const header = bootstrap
    ? 'AWAITING LIVE WEEKLY CONTEXTS'
    : (frame.realCount < 5
        ? `WEEK ${Math.max(1, frame.currentIdx)} OF 5`
        : `${frame.realCount} WEEKS · CUR W${frame.currentIdx}`);
  return (
    <div className="week-row">
      <div className="week-row-head">
        <span className="week-row-title"><span className="week-row-bar" />WEEKLY P&amp;L</span>
        <span className="week-row-r">{header}</span>
      </div>
      <div className="week-row-body">
        <MiniWaterfall mode={mode} liveWeeklyWaterfall={liveWeeklyWaterfall} />
      </div>
    </div>
  );
}

function MiniWaterfall({ mode, liveWeeklyWaterfall }) {
  // Section E (updated): waterfall reads WeeklyContextNode.system_weekly_pnl_pct
  // filtered by phase. Empty under LIVE in Phase 1.1 (no live weekly contexts
  // exist) OR when the query returns no rows yet.
  // Portal v1.15 Item A (2026-05-30): always render a min 5-slot frame
  // (max 13). Real slots use existing pos/neg/cur classes; placeholders for
  // [realCount..frameLen-1] get the new .ahead class (muted grey, no
  // numeric label, no height — just the slot reservation).
  const wrapRef = useRef(null);
  const series = liveWeeklyWaterfall;
  const bootstrap = shouldRenderBootstrap(mode) || !series;
  const frame = buildWeekFrame(series ?? []);
  const slots = bootstrap ? buildWeekFrame([]).slots : frame.slots;
  const [heights, setHeights] = useState(() => slots.map(() => 2));
  useEffect(() => {
    if (bootstrap) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    // Portal v1.19 (2026-06-01): pct label is now an absolute pill (~10px
    // tall) anchored to top of the column, no longer in-flow. Reserve only
    // the pill + label headroom (~10px) instead of the prior 20px phantom.
    const barH = wrap.clientHeight - 10;
    const maxP = 7;
    slots.forEach((w, i) => {
      if (w.ahead) return; // placeholders stay at min height
      setTimeout(() => {
        setHeights((prev) => {
          const next = [...prev];
          // Portal v1.18 (2026-06-01): upper clamp so an outlier weekly value
          // (e.g. -60.77% from a buggy WeeklyContextNode) saturates at full
          // strip height instead of bleeding upward over the banner.
          // Portal v1.19 (2026-06-01): log-scale magnitude so a tiny W (-0.55%)
          // and a big W (-60.77%) are visually distinct. LOG_MAX=100 expands
          // the dynamic range without truncating outliers. Clamp + floor kept
          // from v1.18: never exceeds barH (no overflow), never < 4 px floor.
          const LOG_MAX = 100;
          const frac = Math.log10(1 + Math.abs(w.p)) / Math.log10(1 + LOG_MAX);
          next[i] = Math.min(barH, Math.max(4, frac * barH));
          return next;
        });
      }, 80 + i * 100);
    });
  }, [bootstrap, slots]);
  if (bootstrap) {
    return (
      <div className="acct-wf" ref={wrapRef}>
        <div className="acct-wf-baseline" />
        <div style={{ flex: 1, textAlign: 'center', alignSelf: 'center', color: 'var(--w3)', fontFamily: 'var(--mono)', fontSize: '7px', letterSpacing: '1px' }}>
          — AWAITING LIVE WEEKLY CONTEXTS —
        </div>
      </div>
    );
  }
  return (
    <div className="acct-wf" ref={wrapRef}>
      <div className="acct-wf-baseline" />
      {slots.map((w, i) => (
        <div className="acct-wf-col" key={w.w}>
          {w.ahead ? (
            <div className="acct-wf-pct acct-wf-pct-ahead">—</div>
          ) : (
            <div
              className="acct-wf-pct"
              style={{ color: w.cur ? 'var(--cyan)' : w.pos ? 'var(--green)' : 'var(--red)' }}
            >{(w.p >= 0 ? '+' : '') + w.p.toFixed(2) + '%'}</div>
          )}
          <div
            className={'acct-wf-bar ' + (w.ahead ? 'ahead' : (w.cur ? 'cur' : w.pos ? 'pos' : 'neg'))}
            style={{ height: heights[i] + 'px' }}
          />
          <div className="acct-wf-lbl">{w.w}</div>
        </div>
      ))}
    </div>
  );
}

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
        <ReturnsMatrixPanel data={data} layout="pc" />
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
  let cls = 'srow';
  if (isFired) cls += ' fired';
  else if (showScore && a.score >= 65) cls += ' thresh';
  return (
    <div className={cls}>
      <div>
        <div className="sasset">{a.sym}</div>
        <div className="strack">{a.sub}</div>
      </div>
      <div>
        {showScore ? (
          <div className="sbar-bg">
            <div className="sbar-fill" style={{ width: a.score + '%', background: barClr(a.score) }} />
          </div>
        ) : (
          <div className="sbuilding">BUILDING DATA</div>
        )}
      </div>
      <div className={'sscore ' + (showScore ? scoreCls(a.score) : 'lo')}>
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

function EquityCurvePanel({ mode, data }) {
  const series = adaptEquityCurve(data);
  const bootstrap = shouldRenderBootstrap(mode) || !series;
  const svg = useMemo(
    () => (bootstrap ? null : buildEquityCurveSvgFromSeries(series, { width: 600, height: 80 })),
    [bootstrap, series],
  );
  // Rev 35: daily-return strip derived from the SAME equity points (no fetch,
  // no percent_pnl_today). Elite flag uses the single-source Rev-33 threshold.
  const retStrip = useMemo(
    () => (bootstrap ? null : buildDailyReturnBars(series, { width: 600, height: RETURN_STRIP_H, strongThreshold: STRONG_DAILY_PCT, eliteThreshold: ELITE_DAILY_PCT })),
    [bootstrap, series],
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
  const computed = useMemo(() => {
    if (!series || series.length < 1) return null;
    let peak = -Infinity;
    let runningPeak = -Infinity;
    let maxDD = 0;
    for (const p of series) {
      const e = p.equity;
      if (!Number.isFinite(e)) continue;
      if (e > peak) peak = e;
      if (e > runningPeak) runningPeak = e;
      if (runningPeak > 0) {
        const dd = (runningPeak - e) / runningPeak;
        if (dd > maxDD) maxDD = dd;
      }
    }
    const firstEquity = series[0]?.equity;
    const lastEquity = series[series.length - 1]?.equity;
    const twr = (Number.isFinite(firstEquity) && firstEquity > 0 && Number.isFinite(lastEquity))
      ? (lastEquity / firstEquity - 1) * 100
      : null;
    return {
      peak: Number.isFinite(peak) ? peak : null,
      drawdownPct: maxDD * 100,
      twrPct: twr,
    };
  }, [series]);

  const peakFmt = computed?.peak != null ? `$${Math.round(computed.peak).toLocaleString()}` : '—';
  const ddFmt = computed?.drawdownPct != null ? `${computed.drawdownPct.toFixed(2)}%` : '—';
  const twrFmt = computed?.twrPct != null ? `${computed.twrPct >= 0 ? '+' : ''}${computed.twrPct.toFixed(2)}%` : '—';

  return (
    <div className="panel eq-panel">
      <div className="eq-head">
        <span className="eq-title"><span className="ptitle-bar" />EQUITY CURVE</span>
        <span className="eq-stats">
          <span className="lbl">PEAK</span><span className="g">{peakFmt}</span>
          <span className="lbl">DRAWDOWN</span><span className="r">{ddFmt}</span>
          <span className="lbl">TWR</span><span>{twrFmt}</span>{subscript}
          {/* Rev 36: daily-return tier legend — STRONG/ELITE only (no entry for
              red-down or standard-green-positive). Swatch colors match the bars. */}
          <span className="eq-leg"><span className="eq-leg-sw sw-strong" />STRONG</span>
          <span className="eq-leg"><span className="eq-leg-sw sw-elite" />ELITE</span>
        </span>
      </div>
      <div className="eq-svg-wrap">
        {/* Rev 35: equity curve shrinks to the top band (~56px); a daily-return
            bar strip shares the wrap below it. Banner row height unchanged. */}
        <div className="eq-svg-equity">
          {/* Rev 36: BASE reference label — fixed literal "$10K", in a panel-bg
              corner chip OFF the green fill (was an in-SVG gold text on the
              baseline, unreadable over the fill). Literal, NOT computed from the
              series: the curve is flow-adjusted (§11 TWR), so the base must not
              drift when capital is added/withdrawn. Phase-1 paper base = 10000. */}
          <span className="eq-base-lbl">$10K</span>
          <svg id="equity-svg" viewBox="0 0 600 80" preserveAspectRatio="none">
            <defs>
              <linearGradient id="eqGradPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(0,230,118,0.35)" />
                <stop offset="100%" stopColor="rgba(0,230,118,0)" />
              </linearGradient>
            </defs>
            {svg && (
              <>
                <line x1="0" y1={svg.baseY} x2={svg.width} y2={svg.baseY}
                  stroke="rgba(255,171,0,0.4)" strokeWidth="0.6" strokeDasharray="3,3" />
                <path d={svg.fillD} fill="url(#eqGradPos)" stroke="none" />
                <path d={svg.d} fill="none" stroke="var(--green)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={svg.endX} cy={svg.endY} r="2.5" fill="var(--green)">
                  <animate attributeName="r" values="2.5;4;2.5" dur="2s" repeatCount="indefinite" />
                </circle>
                <circle cx={svg.peakX} cy={svg.peakY} r="2" fill="var(--cyan)" opacity="0.8" />
              </>
            )}
            {bootstrap && (
              <text x="300" y="44" textAnchor="middle" fontFamily="Share Tech Mono" fontSize="8" fill="var(--w3)" letterSpacing="2">— AWAITING LIVE EQUITY SERIES —</text>
            )}
          </svg>
        </div>
        <div className="eq-svg-return">
          <span className="eq-ret-lbl">DAILY RETURN</span>
          <svg id="equity-svg-ret" viewBox={`0 0 600 ${RETURN_STRIP_H}`} preserveAspectRatio="none">
            {retStrip && (
              <>
                <line x1="0" y1={retStrip.zeroY} x2="600" y2={retStrip.zeroY}
                  className="eq-ret-zero" strokeDasharray="2,2" />
                {retStrip.bars.map((b, i) => (
                  <rect key={i} className={'eq-ret-bar t-' + b.tier}
                    x={b.x} y={b.y} width={b.w} height={b.h} />
                ))}
              </>
            )}
          </svg>
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

function MetricsPanel({ mode, data }) {
  const liveMode = mode === 'live';
  const winRate = adaptWinRate(data);
  const sharpe = adaptSharpe(data);
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

      {/* SHARPE */}
      <div className="mc">
        <div className="mc-left">
          <div className="mc-label">SHARPE RATIO</div>
          {srBoot ? (
            <>
              <div className="mc-value dim" style={{ color: 'var(--w3)' }}>—</div>
              <div className="mc-sub">AWAITING FIRST WEEKLY SR</div>
            </>
          ) : (
            <>
              <div className="mc-value c">{sharpe.sr.toFixed(2)}</div>
              <div className="mc-sub">target ≥ 1.0 · phase 3 gate</div>
            </>
          )}
        </div>
        <svg className="mc-arc" width="56" height="34" viewBox="0 0 56 34" overflow="visible">
          <path d="M4,30 A24,24 0 0,1 52,30" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" strokeLinecap="round" />
          {!srBoot && (
            <>
              <path d="M4,30 A24,24 0 0,1 52,30" fill="none" stroke="var(--cyan)" strokeWidth="5" strokeLinecap="round"
                strokeDasharray="75.4" strokeDashoffset={Math.max(0, (1 - Math.min(sharpe.sr / 3, 1)) * 75.4)} opacity="0.9" />
              <text x="28" y="22" textAnchor="middle" fontFamily="Share Tech Mono" fontSize="8" fill="var(--cyan)">{sharpe.sr.toFixed(2)}</text>
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
