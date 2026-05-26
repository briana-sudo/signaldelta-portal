import { useEffect, useMemo, useRef, useState } from 'react';
import { useClock, usePollCountdown } from '../lib/useClock.js';
import { usePositionDrift, useTickerWobble } from '../lib/useDrift.js';
import { shouldRenderBootstrap } from '../lib/usePhaseFilter.js';
import {
  SCANNER_ASSETS, WEEKLY_WATERFALL, TICKER, KERNEL_COUNTS, LOGO_SVG, CURRENT_PHASE,
} from '../lib/placeholders.js';
import {
  adaptAccountBar, adaptWeeklyWaterfall, adaptEvents,
  adaptWinRate, adaptSharpe, adaptLane2, adaptConviction,
  adaptEquityCurve, adaptEquityHeader,
  adaptRulesThisWeek, adaptRulesFoot,
  adaptHeartbeat,
  adaptTradeList, adaptNewsTicker, adaptMacroNews, adaptRecentEvents,
  adaptScanner,
} from '../lib/dataAdapter.js';
import { buildEquityCurveSvgFromSeries } from '../lib/equityCurve.js';
import { initKernelScene } from '../lib/kernelScene.js';
import { computeBadge } from '../lib/performanceBadge.js';
import EnginePill from '../lib/EnginePill.jsx';
import PollIndicator from '../lib/PollIndicator.jsx';
import NewsTicker from '../lib/NewsTicker.jsx';
import MacroNewsStrip from '../lib/MacroNewsStrip.jsx';
import StatusStrip from '../lib/StatusStrip.jsx';
import TradeOverlay from './TradeOverlay.jsx';

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
  const pollTimestamp = data?.pollTimestamp;

  return (
    <div className="pc-shell">
      <StatusBanner error={error} errors={errors} hasAnyData={hasAnyData} />
      <Header
        clock={clock}
        mode={mode}
        setMode={setMode}
        currentPhase={currentPhase}
        heartbeat={heartbeat}
        pollSecs={pollSecs}
        pollPulse={pollPulse}
      />
      <AccountBar
        mode={mode}
        liveAccountBar={liveAccountBar}
        liveWeeklyWaterfall={adaptWeeklyWaterfall(data)}
      />
      <Main mode={mode} data={data} />
      <Ticker />
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

function Header({ clock, mode, setMode, currentPhase, heartbeat, pollSecs, pollPulse }) {
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

function AccountBar({ mode, liveAccountBar, liveWeeklyWaterfall }) {
  // Drift removed 2026-05-26 per drift-scope-fix dispatch. Aggregate equity
  // displays the polled values directly — static between polls, updates only
  // when a new poll lands a fresh value. Drift remains on OPEN-position
  // current price in the trade list (genuine market fluctuation there).
  const bootstrap = shouldRenderBootstrap(mode) || !liveAccountBar;
  const capitalBase = liveAccountBar?.capitalBase ?? 10000;
  const av = liveAccountBar?.currentValue ?? capitalBase;
  const ap = liveAccountBar?.todayPnl ?? 0;
  const totalReturnPct = liveAccountBar?.totalReturnPct ?? 0;
  const valFmt = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = (v) => (v >= 0 ? '+' : '');
  const cls = (v) => (v >= 0 ? 'g' : 'r');

  return (
    <div className="acct">
      <div className="aitem"><span className="alabel">Capital Base</span><span className="aval">${capitalBase.toLocaleString()}</span></div>
      <div className="aitem"><span className="alabel">Current Value</span>
        {bootstrap
          ? <span className="aval dim" style={{ color: 'var(--w3)' }}>—</span>
          : <span className={'aval ' + cls(av - capitalBase)}>${valFmt(av)}</span>}
      </div>
      <div className="aitem"><span className="alabel">Total Return</span>
        {bootstrap
          ? <span className="aval dim" style={{ color: 'var(--w3)' }}>—</span>
          : <span className={'aval ' + cls(totalReturnPct)}>{sign(totalReturnPct)}{totalReturnPct.toFixed(2)}%</span>}
      </div>
      <div className="aitem"><span className="alabel">Today P&amp;L</span>
        {bootstrap
          ? <span className="aval dim" style={{ color: 'var(--w3)' }}>—</span>
          : <span className={'aval ' + cls(ap)}>{sign(ap)}${Math.abs(ap).toFixed(2)}</span>}
      </div>
      <div className="aitem"><span className="alabel">Trades</span>
        <span className="aval c">{bootstrap ? 0 : (liveAccountBar?.trades ?? 0)}</span>
      </div>
      <div className="aitem"><span className="alabel">Open</span>
        <span className="aval c">{bootstrap ? 0 : (liveAccountBar?.open ?? 0)}</span>
      </div>
      <div className="acct-divider" />
      <MiniWaterfall mode={mode} liveWeeklyWaterfall={liveWeeklyWaterfall} />
      {/* Poll indicator moved to header per Change 3 dispatch — see <PollIndicator/> */}
    </div>
  );
}

function MiniWaterfall({ mode, liveWeeklyWaterfall }) {
  // Section E (updated): waterfall reads WeeklyContextNode.system_weekly_pnl_pct
  // filtered by phase. Empty under LIVE in Phase 1.1 (no live weekly contexts
  // exist) OR when the query returns no rows yet.
  const wrapRef = useRef(null);
  const series = liveWeeklyWaterfall;
  const bootstrap = shouldRenderBootstrap(mode) || !series;
  const data = series ?? WEEKLY_WATERFALL; // fallback shape for layout sizing
  const [heights, setHeights] = useState(() => data.map(() => 2));
  useEffect(() => {
    if (bootstrap) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const barH = wrap.clientHeight - 20;
    const maxP = 7;
    data.forEach((w, i) => {
      setTimeout(() => {
        setHeights((prev) => {
          const next = [...prev];
          next[i] = Math.max(4, (Math.abs(w.p) / maxP) * barH);
          return next;
        });
      }, 80 + i * 100);
    });
  }, [bootstrap, data]);
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
      {data.map((w, i) => (
        <div className="acct-wf-col" key={w.w}>
          <div
            className="acct-wf-pct"
            style={{ color: w.cur ? 'var(--cyan)' : w.pos ? 'var(--green)' : 'var(--red)' }}
          >{(w.pos ? '+' : '') + w.p + '%'}</div>
          <div
            className={'acct-wf-bar ' + (w.cur ? 'cur' : w.pos ? 'pos' : 'neg')}
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
        <KernelPanel />
      </div>
      <div className="col-extra">
        <ReturnsMatrixPanel mode={mode} data={data} />
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
  // Drift only over the OPEN rows. usePositionDrift expects positions[i]; we
  // pass open-only and look up by request_id when rendering.
  const openOffsets = usePositionDrift(openTrades, {
    pollTimestamp: data?.pollTimestamp,
    enabled: !bootstrap,
  });
  const openOffsetByReq = new Map(openTrades.map((t, i) => [t.requestId, openOffsets[i] ?? 0]));

  return (
    <div className="panel p-positions">
      <div className="ptitle">
        <span><span className="ptitle-bar" />TRADES</span>
        <span className="ptitle-r">
          {bootstrap ? 'AWAITING TRADES SINCE MARKET OPEN' : `${openTrades.length} OPEN · ${trades.length} TOTAL`}
        </span>
      </div>
      <table className="pos-table trade-list">
        <thead>
          <tr>
            <th>Asset</th><th>Track</th><th>Conv</th>
            <th>Entry</th><th>Current</th>
            <th>Stop</th><th>Target</th>
            <th>Progress</th><th>P&amp;L</th><th>Hold</th>
          </tr>
        </thead>
        <tbody>
          {bootstrap ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--w3)', padding: '20px', fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px' }}>— AWAITING TRADES SINCE MARKET OPEN —</td></tr>
          ) : trades.map((t) => (
            <TradeListRow key={t.requestId || `${t.asset}-${t.entryTimestamp}`}
                          t={t} offset={openOffsetByReq.get(t.requestId) ?? 0} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TradeListRow({ t, offset }) {
  const isOpen = t.status === 'OPEN';
  if (isOpen) {
    const pv = t.pnl + offset;
    const pp = t.pnlPct + (t.entry ? (offset / t.entry) * 100 : 0);
    const cur = t.cur + offset * 0.01;
    const range = t.target - t.entry;
    const progPct = range ? Math.max(0, Math.min(100, ((cur - t.entry) / range) * 100)) : 0;
    const pos = pv >= 0;
    const clr = pos ? 'var(--green)' : 'var(--red)';
    return (
      <tr className="row-open">
        <td><span className="passet">{t.asset}</span></td>
        <td><span className={'ptrack ' + t.track}>{t.tl}</span></td>
        <td><span className={'pconv ' + t.conv}>{t.cl}</span></td>
        <td style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--w2)' }}>{t.entry.toLocaleString()}</td>
        <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--white)' }}>{cur.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
        <td style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--red)' }}>{t.stop.toLocaleString()}</td>
        <td style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--green)' }}>{t.target.toLocaleString()}</td>
        <td className="prog-wrap">
          <div className="prog-bg"><div className="prog-fill" style={{ width: progPct + '%', background: clr }} /></div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--w3)', marginTop: '2px' }}>{progPct.toFixed(0)}% TO TARGET</div>
        </td>
        <td>
          <div className="ppnl" style={{ color: clr }}>{pos ? '+' : ''}${Math.abs(pv).toFixed(2)}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: clr }}>{pos ? '+' : ''}{pp.toFixed(2)}%</div>
        </td>
        <td style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--w3)' }}>{t.hold}</td>
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
      <td style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--w3)' }}>{t.hold}</td>
    </tr>
  );
}

function EquityCurvePanel({ mode, data }) {
  const series = adaptEquityCurve(data);
  const header = adaptEquityHeader(data);
  const bootstrap = shouldRenderBootstrap(mode) || !series;
  const svg = useMemo(
    () => (bootstrap ? null : buildEquityCurveSvgFromSeries(series, { width: 600, height: 80 })),
    [bootstrap, series],
  );
  const subscript = mode !== 'combined' ? <span style={{ fontSize: '6px', color: 'var(--w3)', marginLeft: '2px' }}>(combined)</span> : null;
  const peakFmt = header?.peak ? `$${Math.round(header.peak).toLocaleString()}` : '—';
  const ddFmt = header?.drawdownPct != null ? `${header.drawdownPct.toFixed(2)}%` : '—';
  const twrFmt = header?.twrPct != null ? `${header.twrPct >= 0 ? '+' : ''}${header.twrPct.toFixed(2)}%` : '—';

  return (
    <div className="panel eq-panel">
      <div className="eq-head">
        <span className="eq-title"><span className="ptitle-bar" />EQUITY CURVE</span>
        <span className="eq-stats">
          <span className="lbl">PEAK</span><span className="g">{peakFmt}</span>
          <span className="lbl">DRAWDOWN</span><span className="r">{ddFmt}</span>
          <span className="lbl">TWR</span><span>{twrFmt}</span>{subscript}
        </span>
      </div>
      <div className="eq-svg-wrap">
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
              <text x="4" y={svg.baseY - 3} fontFamily="Share Tech Mono" fontSize="6" fill="var(--amber)" opacity="0.6">$10K BASE</text>
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

function KernelPanel() {
  // Phase 1.1: Three.js scene renders the 5-cluster INITIALIZING placeholder
  // regardless of data wiring (IndicatorNodes don't exist until Phase 4).
  const canvasRef = useRef(null);
  const [counts, setCounts] = useState({ nodes: KERNEL_COUNTS.nodes, edges: KERNEL_COUNTS.edges });
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
        <div className="kernel-stat">CYCLES <span>{KERNEL_COUNTS.cycles}</span></div>
        <div className="kernel-stat">LANE 2 <span className="amber">OFFLINE</span></div>
      </div>
    </div>
  );
}

function ReturnsMatrixPanel({ mode }) {
  // Returns matrix needs 16 per-poll queries (3×3 cells + 3 Σ-rows + 3 Σ-cols
  // + 1 Σ-corner) per Section D2. Not added to the 14-query per-poll set in
  // this iteration — bootstrap state until the Σ-batch is wired in a follow-up.
  void mode;
  return (
    <div className="panel p-returns">
      <div className="ptitle">
        <span><span className="ptitle-bar" />RETURNS BY DOMAIN</span>
        <span className="ptitle-r">3×3</span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--w3)', fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px', textAlign: 'center', padding: '12px' }}>
        — AWAITING LIVE RETURNS MATRIX —
      </div>
    </div>
  );
}

function RulesAddedPanel({ mode, data }) {
  const rules = adaptRulesThisWeek(data);
  const foot = adaptRulesFoot(data);
  const bootstrap = shouldRenderBootstrap(mode) || (!rules && !foot);

  return (
    <div className="panel p-rules">
      <div className="ptitle">
        <span><span className="ptitle-bar" />RULES ADDED THIS WEEK</span>
        <span className="ptitle-r">CYCLE {foot?.cycle ?? 0}</span>
      </div>
      <div className="rules-list">
        {bootstrap || !rules ? (
          <div style={{ flex: 1, textAlign: 'center', color: 'var(--w3)', padding: '12px', fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px' }}>
            — AWAITING LIVE RULES —
          </div>
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

function Ticker() {
  const tick = useTickerWobble(TICKER);
  const wobbled = useMemo(() => TICKER.map((t, i) => {
    const seed = Math.sin((tick + 1) * (i + 1) * 0.37);
    const wobble = seed * 0.001;
    const numericPx = parseFloat(t.p.replace(/,/g, ''));
    if (Number.isFinite(numericPx)) {
      const next = numericPx * (1 + wobble);
      const decimals = t.p.includes('.') ? (t.p.split('.')[1].length) : 0;
      const formatted = next.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      return { ...t, p: formatted };
    }
    return t;
  }), [tick]);
  const all = [...wobbled, ...wobbled];
  return (
    <div className="ticker">
      <div className="ticker-inner">
        {all.map((t, i) => (
          <div className="ti" key={i}>
            <span className="ti-sym">{t.s}</span>
            <span className="ti-px">{t.p}</span>
            <span className={'ti-ch ' + t.d}>{t.c}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
