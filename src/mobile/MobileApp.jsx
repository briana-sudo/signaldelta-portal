import { useEffect, useMemo, useRef, useState } from 'react';
import { useClock, usePollCountdown } from '../lib/useClock.js';
import { shouldRenderBootstrap } from '../lib/usePhaseFilter.js';
import { computeOpenLegPnl, computeOpenProgress, openPnlTone } from '../lib/openPnl.js';
import TradesExpandModal from '../pc/TradesExpandModal.jsx';
import { MobileHeatmapModal, MobileCalendarModal } from './MobilePnlModals.jsx';
import {
  SCANNER_ASSETS, KERNEL_COUNTS, LOGO_SVG, CURRENT_PHASE,
} from '../lib/placeholders.js';
import {
  adaptAccountBar, adaptEvents,
  adaptWinRate, adaptSharpe, adaptConviction,
  adaptPanelSharpe, adaptPanelAnnReturn, adaptPanelReturnsByDomainPct,
  adaptPanelProfitFactor, adaptPanelExpectancy, adaptPfExpectancySeries,
  adaptEquityCurve, adaptEquityHeader,
  adaptRulesThisWeek, adaptRulesFoot, adaptClosestCohort,
  adaptHeartbeat,
  adaptTradeList, selectVisibleTrades, adaptNewsTicker, adaptMacroNews, adaptRecentEvents,
  adaptScanner, adaptReconciliation,
  adaptAccountState,
  fmtCloseET,
  assetClassTag,
} from '../lib/dataAdapter.js';
import { buildEquityCurveSvgFromSeries, buildDailyReturnBars } from '../lib/equityCurve.js';
import { initKernelScene } from '../lib/kernelScene.js';
import { computeBadge } from '../lib/performanceBadge.js';
import { computeAnnualized, computePaceTier, deriveTodayPct, PACE_TIERS } from '../lib/annualizedReturn.js';

// Portal Rev 35/36 (2026-06-04): single-source tier thresholds, mirror of PC.
const STRONG_DAILY_PCT = PACE_TIERS.find((t) => t.key === 'strong')?.dailyMinPct ?? Infinity;
const ELITE_DAILY_PCT = PACE_TIERS.find((t) => t.key === 'elite')?.dailyMinPct ?? Infinity;
const RETURN_STRIP_H = 40;
import EnginePill from '../lib/EnginePill.jsx';
import PollIndicator from '../lib/PollIndicator.jsx';
import MarketStatusPill from '../lib/MarketStatusPill.jsx';
import MarketBell from '../lib/MarketBell.jsx';
import { useMarketStatus } from '../lib/useMarketStatus.js';
import NewsTicker from '../lib/NewsTicker.jsx';
import MacroNewsStrip from '../lib/MacroNewsStrip.jsx';
import StatusStrip from '../lib/StatusStrip.jsx';
import HealthStrip from '../lib/HealthStrip.jsx';
import RulesEmptyState from '../lib/RulesEmptyState.jsx';
import ReturnsMatrixPanel from '../lib/ReturnsMatrixPanel.jsx';

const MODES = ['live', 'training', 'combined'];
const DEFAULT_MODE = 'training';

const TABS = [
  { id: 'desk',   icon: '▤', label: 'Desk' },
  { id: 'scan',   icon: '◈', label: 'Scan' },
  { id: 'system', icon: '◉', label: 'System' },
  { id: 'data',   icon: '▦', label: 'Data' },
];

// Tier 2 (2026-06-09): one band function colors BOTH bar fill and score number
// (mirror of PC scoreColor) so they can never diverge. Magnitude only.
const scoreColor = (s) => {
  if (s >= 65) return 'var(--green)';
  if (s >= 40) return 'var(--cyan)';
  if (s >= 20) return 'var(--amber)';
  return 'var(--w3)';
};

export default function MobileApp({ data, errors = {}, hasAnyData = false, error, loading }) {
  const clock = useClock();
  const { secs: pollSecs, pulse: pollPulse } = usePollCountdown();
  const [mode, setMode] = useState(DEFAULT_MODE);
  const [tab, setTab] = useState('desk');
  const [kernelOpen, setKernelOpen] = useState(false);

  // Strand 4 mobile parity (2026-06-11): heatmap / returns-calendar popups.
  // Hash is the single source of truth → deep-link parity with desktop
  // (#heatmap / #calendar open the sheet on mobile too); triggers live on the
  // Data tab. openPopup writes the hash; the hashchange listener sets state.
  const [popup, setPopup] = useState(null); // 'heatmap' | 'calendar' | null
  useEffect(() => {
    const apply = () => {
      const h = (window.location.hash || '').replace(/^#/, '').toLowerCase();
      setPopup(h === 'heatmap' || h === 'calendar' ? h : null);
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);
  const openPopup = (name) => { window.location.hash = name; };
  const closePopup = () => {
    const h = (window.location.hash || '').replace(/^#/, '').toLowerCase();
    if (h === 'heatmap' || h === 'calendar') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setPopup(null);
  };

  const liveAccountBar = adaptAccountBar(data);
  const currentPhase = liveAccountBar?.currentPhase || CURRENT_PHASE;
  const liveEvents = adaptEvents(data);
  const heartbeat = adaptHeartbeat(data);
  const recon = adaptReconciliation(data);
  const pollTimestamp = data?.pollTimestamp;
  // 2026-06-08: ONE market-status instance for the shell — shared by the pill
  // and the open/close bell (no second clock/poll).
  const marketStatus = useMarketStatus();

  return (
    <div className="mobile-shell">
      <MobileStatusBanner error={error} errors={errors} hasAnyData={hasAnyData} />
      <MobileHeader
        clock={clock}
        mode={mode}
        currentPhase={currentPhase}
        heartbeat={heartbeat}
        recon={recon}
        pollSecs={pollSecs}
        pollPulse={pollPulse}
        marketStatus={marketStatus}
      />
      <ModeToggle mode={mode} setMode={setMode} />
      <MobileAccountBar
        mode={mode}
        liveAccountBar={liveAccountBar}
        data={data}
      />
      <div className="tab-wrap">
        <div className={'tab-content' + (tab === 'desk' ? ' active' : '')}>
          <DeskTab mode={mode} data={data} eventsCount={liveEvents?.length ?? 0} pollTimestamp={pollTimestamp} />
        </div>
        <div className={'tab-content' + (tab === 'scan' ? ' active' : '')}>
          <ScanTab mode={mode} data={data} />
        </div>
        <div className={'tab-content' + (tab === 'system' ? ' active' : '')}>
          <SystemTab mode={mode} data={data} onOpenKernel={() => setKernelOpen(true)} />
        </div>
        <div className={'tab-content' + (tab === 'data' ? ' active' : '')}>
          <DataTab mode={mode} data={data} liveEvents={liveEvents} onOpenPopup={openPopup} />
        </div>
      </div>
      <TabBar tab={tab} setTab={setTab} />
      <KernelOverlay open={kernelOpen} data={data} onClose={() => setKernelOpen(false)} />
      <MobileHeatmapModal open={popup === 'heatmap'} onClose={closePopup} data={data} />
      <MobileCalendarModal open={popup === 'calendar'} onClose={closePopup} data={data} />
      {loading && !data && !error && <MobileLoadingBadge />}
    </div>
  );
}

function MobileStatusBanner({ error, errors, hasAnyData }) {
  const failed = Object.keys(errors || {});
  const fatalConfig = !!error;
  const allDown = !fatalConfig && failed.length > 0 && !hasAnyData;
  const partial = !fatalConfig && failed.length > 0 && hasAnyData;

  if (!fatalConfig && !allDown && !partial) return null;

  if (fatalConfig || allDown) {
    return (
      <div style={{
        position: 'sticky', top: 0, zIndex: 10000,
        background: 'rgba(255,61,87,0.92)', color: '#fff',
        fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px',
        padding: '6px 12px', textAlign: 'center',
      }}>
        PROXY ERROR · {fatalConfig
          ? (error.message || String(error))
          : `all ${failed.length} queries failed`}
      </div>
    );
  }
  return (
    <div
      title={`Failed: ${failed.join(', ')}`}
      style={{
        position: 'sticky', top: 0, zIndex: 10000,
        background: 'rgba(255,171,0,0.92)', color: '#1a1500',
        fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px',
        padding: '6px 12px', textAlign: 'center',
      }}>
      PARTIAL DATA · {failed.length} failed: {failed.join(', ')}
    </div>
  );
}

function MobileLoadingBadge() {
  return (
    <div style={{
      position: 'fixed', bottom: 70, right: 12, zIndex: 999,
      background: 'var(--navy3)', border: '1px solid var(--border)',
      color: 'var(--cyan)', fontFamily: 'var(--mono)', fontSize: '9px',
      letterSpacing: '2px', padding: '4px 10px',
    }}>
      CONNECTING…
    </div>
  );
}

function MobileReconPill({ recon }) {
  // Session 40 CHANGE 5 (mobile): compact amber recon-diff pill.
  if (!recon || recon.unavailable || !recon.diff) return null;
  return (
    <div className="recon-pill recon-compact" title={`broker-only: ${(recon.onlyBroker||[]).join(', ')||'—'} · graph-only: ${(recon.onlyGraph||[]).join(', ')||'—'}`}>
      <span className="recon-dot" />
      {recon.brokerCount}v{recon.graphCount}
    </div>
  );
}

function MobileHeader({ clock, mode, currentPhase, heartbeat, recon, pollSecs, pollPulse, marketStatus }) {
  // Section E.1 phase badge dot + Section K engine heartbeat dot + Section K
  // prominent poll indicator. Phase dot reflects paper/live/split per the
  // performanceBadge selector; engine dot reflects engine liveness independently.
  const { text: badgeText, dot } = useMemo(() => computeBadge(currentPhase, mode), [mode, currentPhase]);
  return (
    <div className="hdr">
      <div className="logo">
        <div className="logo-mark" dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />
        <div className="logo-text">
          <span className="ls">SIGNAL</span>
          <span className="ld">DELTA</span>
        </div>
      </div>
      <div className="hdr-right">
        <div className={'status-dot dot-' + dot} title={badgeText} />
        <EnginePill heartbeat={heartbeat} variant="mobile" />
        <MobileReconPill recon={recon} />
        <div className="clock">
          <span className="clock-et">{clock.etCompact}</span>
          <span className="clock-sep">·</span>
          <span className="clock-utc">{clock.utcCompact}</span>
        </div>
        {/* Market status clock (2026-05-26 dispatch) — compact mobile
            variant, placed just before SYNC. Crypto pill dropped on mobile
            per dispatch (always-on context). */}
        <MarketStatusPill variant="mobile" status={marketStatus} />
        <MarketBell marketState={marketStatus?.state} />
        <PollIndicator secs={pollSecs} pulse={pollPulse} variant="mobile" />
      </div>
    </div>
  );
}

function ModeToggle({ mode, setMode }) {
  return (
    <div className="mode-toggle">
      {MODES.map((m) => (
        <div
          key={m}
          className={'mode-pill' + (mode === m ? ' active' : '')}
          onClick={() => setMode(m)}
        >{m.toUpperCase()}</div>
      ))}
    </div>
  );
}

// Portal Rev 33 (2026-06-04): mobile mirror of the PC PaceBadge (Feature 3).
// Same computePaceTier() source; .mobile-shell CSS variants. Only
// SOLID/STRONG/ELITE render; positive/down bands are color-only on the daily-%.
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

export function MobileAccountBar({ mode, liveAccountBar, data }) {
  // Session 40 rebuild (2026-05-29): broker-sourced live state, same as PC.
  // Current Value / Today P&L are broker-derived (null when broker down →
  // dash); Total Return stays graph-sourced.
  const bootstrap = shouldRenderBootstrap(mode) || !liveAccountBar;
  const capitalBase = liveAccountBar?.capitalBase ?? 10000;
  const av = liveAccountBar?.currentValue;
  const ap = liveAccountBar?.todayPnl;
  const totalReturnPct = liveAccountBar?.totalReturnPct;
  const valFmt = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = (v) => (v >= 0 ? '+' : '');
  const cls = (v) => (v >= 0 ? 'g' : 'r');
  const dash = <span className="aval dim" style={{ color: 'var(--w3)' }}>—</span>;

  // Portal Rev 33 (2026-06-04): mirror of PC AccountBar — annualized stat +
  // pace badge on the capital-base row, daily-% color on Today P&L. Same
  // client-side reducer, no 2nd fetch.
  const series = adaptEquityCurve(data);
  // §6.6 (2026-06-10): Annualized stat now reads the proxy account-level value
  // (cum + "30d" hint while equity-days < 30), not the frontend estimate.
  const mAnn = bootstrap ? null : adaptPanelAnnReturn(data);
  const todayPct = deriveTodayPct(av, ap);
  const pace = useMemo(() => computePaceTier(todayPct), [todayPct]);

  // Portal Rev 43 (2026-06-04): DAY W/L (ET) — mobile mirror of the PC Rev-42
  // banner cell. Wins/total of trades CLOSED today on the ET calendar boundary
  // (NOT the Alpaca-session TODAY P&L window — hence "(ET)"). `tradesClosedToday`
  // is the raw poll feed (win_loss per row); null = feed unavailable → dash.
  const closedToday = data?.tradesClosedToday;
  const dayWins = Array.isArray(closedToday) ? closedToday.filter((r) => r.win_loss === 'Win').length : 0;
  const dayTotal = Array.isArray(closedToday) ? closedToday.length : 0;
  const dayPct = dayTotal ? Math.round((dayWins / dayTotal) * 100) : null;

  return (
    <div className="acct">
      <div className="aitem"><span className="alabel">Capital Base</span><span className="aval">${capitalBase.toLocaleString()}</span></div>
      <div className="aitem aitem-annualized"><span className="alabel">Annualized</span>
        {!mAnn
          ? dash
          : (mAnn.insufficientHistory
              ? <span className={'aval ' + cls(mAnn.cumReturnPct)}>{`${mAnn.cumReturnPct >= 0 ? '+' : ''}${(mAnn.cumReturnPct ?? 0).toFixed(2)}%`}<span style={{ fontSize: '8px', color: 'var(--w3)', marginLeft: '2px' }}>·30d</span></span>
              : <span className={'aval aval-annualized ' + cls(mAnn.annualizedPct)}>{`${mAnn.annualizedPct >= 0 ? '+' : ''}${mAnn.annualizedPct.toFixed(1)}%`}</span>)}
        {mAnn && <PaceBadge pace={pace} />}
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
              {/* Rev 33 Feature 2: daily-% colored by sign. */}
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
      {/* 2026-06-08: TRADES + OPEN tiles — mobile parity with the PC banner;
          same source fields (liveAccountBar.trades / .open), cyan tone. */}
      <div className="aitem"><span className="alabel">Trades</span>
        <span className="aval c">{bootstrap ? 0 : (liveAccountBar?.trades ?? 0)}</span>
      </div>
      <div className="aitem"><span className="alabel">Open</span>
        <span className="aval c">{bootstrap || liveAccountBar?.open == null ? '—' : liveAccountBar.open}</span>
      </div>
      {/* Poll indicator moved to mobile header per Change 3 dispatch */}
    </div>
  );
}

function TabBar({ tab, setTab }) {
  return (
    <div className="tab-bar">
      {TABS.map((t) => (
        <div
          key={t.id}
          className={'tab-btn' + (tab === t.id ? ' active' : '')}
          onClick={() => setTab(t.id)}
        >
          <div className="tab-icon">{t.icon}</div>
          <div className="tab-label">{t.label}</div>
        </div>
      ))}
    </div>
  );
}

function DeskTab({ mode, data, eventsCount, pollTimestamp }) {
  // Portal v1.1 Change 2 — TradeList (OPEN + CLOSED cards, cutoff-filtered)
  // Portal v1.14 P3.1 (2026-05-30): weekly waterfall MOVED to DataTab.
  const liveTrades = adaptTradeList(data);
  const liveAccountBar = adaptAccountBar(data);
  const tradesBoot = shouldRenderBootstrap(mode) || !liveTrades;
  const trades = liveTrades ?? [];
  const openTrades = trades.filter((t) => t.status === 'OPEN');
  // 2026-06-08 (Item 93): cosmetic price drift removed — OPEN-row P&L is a real
  // since-entry compute in MobileTradeCard (mirrors PC TradeListRow).
  // Portal v1.14 P3.3 (2026-05-30): M4 monitor-coverage Set for the badge
  // in MobileTradeCard (R5 Option I). Same precedence as PC TradeListRow.
  const stateAccounts = adaptAccountState(data).accounts;
  const m4State = stateAccounts.length > 0 ? 'present' : 'absent';
  const unmonitoredSet = new Set();
  for (const a of stateAccounts) {
    for (const id of a.monitorCoverageUnmonitoredTradeIds) unmonitoredSet.add(String(id));
  }

  // Portal v1.17 (2026-06-04): mirror of PC TradeListPanel cap+expand. Panel
  // shows PANEL_CAP cards; EXPAND opens a full-screen sheet with the full
  // `trades` array (bounded by proxy LIMIT 50). Was rendering the full set.
  // Portal Rev 32.1 (2026-06-05): card cap is a fixed constant = the measured
  // fit (6 cards/screen) from diag portal_trades_panel_rowfit_and_sort_diag.
  // The runtime useRowFitCap hook latched at 1, so it is removed in favor of
  // the locked constant; EXPAND opens the shared windowed sort/filter sheet.
  const capMobile = 6;
  const [tradesExpanded, setTradesExpanded] = useState(false);
  // 2026-06-08: OPEN rows pin to the top and are always shown (cap guard).
  const { visible: visibleTrades, overflow: tradesOverflow, moreCount } = selectVisibleTrades(trades, capMobile);

  return (
    <>
      <div className="panel">
        <div className="ptitle">
          <span><span className="ptitle-bar" />TRADES</span>
          <span className="ptitle-r">
            {tradesBoot ? 'AWAITING TRADES SINCE MARKET OPEN' : (
              <>
                {tradesOverflow ? `${visibleTrades.length} OF ${trades.length}` : `${openTrades.length} OPEN · ${trades.length} TOTAL`}
                <button type="button" className="trades-expand-btn" onClick={() => setTradesExpanded(true)}>
                  {tradesOverflow ? `+${moreCount} MORE` : 'EXPAND'}
                </button>
              </>
            )}
          </span>
        </div>
        {tradesBoot ? (
          <div style={{ textAlign: 'center', color: 'var(--w3)', padding: '20px', fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px' }}>
            — AWAITING TRADES SINCE MARKET OPEN —
          </div>
        ) : visibleTrades.map((t) => (
          <MobileTradeCard key={t.requestId || `${t.asset}-${t.entryTimestamp}`}
                           t={t}
                           m4State={m4State}
                           unmonitoredSet={unmonitoredSet} />
        ))}
      </div>

      <TradesExpandModal
        open={tradesExpanded}
        onClose={() => setTradesExpanded(false)}
        variant="mobile"
        data={data}
        m4State={m4State}
        unmonitoredSet={unmonitoredSet}
        RowComponent={MobileTradeCard} />

      <div className="panel eq-panel">
        <MobileEquity mode={mode} data={data} />
      </div>

      <div className="stats-chip">
        <div className="sc-item"><div className="sc-val">{tradesBoot ? 0 : openTrades.length}</div><div className="sc-lbl">Open</div></div>
        <div className="sc-item"><div className="sc-val">{tradesBoot ? 0 : (liveAccountBar?.trades ?? 0)}</div><div className="sc-lbl">Trades</div></div>
        <div className="sc-item"><div className="sc-val">{tradesBoot ? 0 : eventsCount}</div><div className="sc-lbl">Events Today</div></div>
      </div>
      {/* Portal v1.14 P3.1 (2026-05-30): Weekly P&L panel relocated to DataTab. */}
    </>
  );
}

function MobileTradeCard({ t, m4State = 'absent', unmonitoredSet = null }) {
  const isOpen = t.status === 'OPEN';
  if (isOpen) {
    // 2026-06-08 (Item 93): REAL since-entry P&L per leg — live price vs graph
    // entry, NO drift (mirror of PC TradeListRow). Sign comes from real P&L.
    const livePriced = !!t.brokerPriced;
    const cur = t.cur;                  // CURRENT = real broker price (no drift)
    const { pp, pv, hasPnl } = computeOpenLegPnl({
      currentPx: t.cur, entryPx: t.entry ?? 0, size: t.size ?? 0,
      direction: t.direction, target: t.target,
    });
    // 2026-06-08: no-live-price → neutral placeholder; neutral-at-zero (mirror PC).
    const pnlTone = openPnlTone({ pv, livePriced, hasPnl });
    const pnlKnown = pnlTone !== 'none';
    const clr = pnlTone === 'pos' ? 'var(--green)' : pnlTone === 'neg' ? 'var(--red)' : 'var(--w2)';
    // Portal v1.16 (2026-05-30): M4 monitor-coverage join key derivation.
    // Used by the per-row monitor LIGHT inside .pc-asset-wrap (below).
    // Replaced the v1.14 P3.3 progress-cell takeover that became invisible
    // when m4State='absent'. See PC TradeListRow for the same comment.
    const m4Known = m4State === 'present';
    const isUnmonitored = m4Known && t.tradeId != null && unmonitoredSet?.has(String(t.tradeId));
    // eslint-disable-next-line no-unused-vars
    const isMonitored   = m4Known && !isUnmonitored && t.tradeId != null;
    // Portal v1.9 F2 (2026-05-29): mobile mirror of PC TradeListRow.
    // Directional progress (signed by Long/Short) splits the bar into a
    // green "toward target" or red "toward stop" fill, plus a grey
    // "NO LIVE PRICE" state when no broker position matches this row.
    // Was: clamp(0,100, (cur-entry)/(target-entry)) — hid every loss
    // direction and silently fell back to entry on broker miss. See PC
    // TradeListRow comment for the full rationale.
    // 2026-06-08: "% TO STOP" uses the LIVE current_stop (fallback entry stop) +
    // BE guard. Shared helper => PC/mobile parity. See computeOpenProgress.
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
    return (
      <div className="pos-card card-open">
        <div className="pc-row1">
          <div className="pc-asset-wrap">
            <div className="pc-asset">{t.asset}</div>
            {/* Portal v1.16 (2026-05-30): per-row monitor light replaces the
                v1.15 visible trade-ID. Same precedence as PC TradeListRow:
                absent → grey AWAITING; in unmonitored set → red UNMONITORED;
                else → green MONITORED. Always renders on open rows. */}
            <div
              className={'row-monitor ' + (!m4Known ? 'grey' : (isUnmonitored ? 'red' : 'green'))}
              aria-label={'monitor: ' + (!m4Known ? 'awaiting' : (isUnmonitored ? 'unmonitored' : 'monitored'))}
            >
              <span className="row-monitor-dot" aria-hidden="true" />
              <span className="row-monitor-lbl">{!m4Known ? 'AWAITING' : (isUnmonitored ? 'UNMONITORED' : 'MONITORED')}</span>
            </div>
          </div>
          <div className="pc-pills">
            {/* Rev 34: CLASS tag alongside track/conv pills — separate from the
                monitor light in .pc-asset-wrap, so no overlap. */}
            <span className={'pclass ' + assetClassTag(t).cls}>{assetClassTag(t).lbl}</span>
            <span className={'ptrack ' + t.track}>{t.tl}</span>
            <span className={'pconv ' + t.conv}>{t.cl}</span>
          </div>
          <div className="pc-spacer" />
          <div className="pc-pnl-wrap">
            {pnlKnown ? (
              <>
                <div className="pc-pnl" style={{ color: clr }}>{pv > 0 ? '+' : pv < 0 ? '-' : ''}${Math.abs(pv).toFixed(2)}</div>
                <div className="pc-pnl-pct" style={{ color: clr }}>{pp > 0 ? '+' : ''}{pp.toFixed(2)}%</div>
              </>
            ) : (
              <div className="pc-pnl" style={{ color: 'var(--w2)' }} title="no live price">—</div>
            )}
          </div>
        </div>
        <div className="pc-row2">
          <div className="pc-cell"><div className="pc-cell-lbl">Entry</div><div className="pc-cell-val">{t.entry.toLocaleString()}</div></div>
          <div className="pc-cell"><div className="pc-cell-lbl">Current</div><div className="pc-cell-val">{cur.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div></div>
          <div className="pc-cell"><div className="pc-cell-lbl">Stop</div><div className="pc-cell-val r">{t.stop.toLocaleString()}</div></div>
          <div className="pc-cell"><div className="pc-cell-lbl">Target</div><div className="pc-cell-val g">{t.target.toLocaleString()}</div></div>
        </div>
        <div className="pc-row3">
          {/* Portal v1.16 (2026-05-30): monitor takeover removed from this
              cell; replaced by the per-row light above. Progress cell is
              back to its v1.9 F2 shape. */}
          <div className="pc-prog-wrap">
            <div className="pc-prog-bg">
              {livePriced && <div className="pc-prog-fill" style={{ width: progPct + '%', background: progClr }} />}
            </div>
            <div className="pc-prog-lbl" style={{ color: progClr }}>{progLabel}</div>
          </div>
          <div className="pc-hold">{t.hold}</div>
        </div>
      </div>
    );
  }
  // Closed
  const isWin = t.winLoss === 'Win';
  const finalClr = isWin ? 'var(--green)' : 'var(--red)';
  const outcomeLabel = isWin ? 'WIN' : 'LOSS';
  return (
    <div className="pos-card card-closed">
      <div className="pc-row1">
        <div className="pc-asset">{t.asset}</div>
        <div className="pc-pills">
          <span className={'ptrack ' + t.track}>{t.tl}</span>
          <span className={'pconv ' + t.conv}>{t.cl}</span>
        </div>
        <div className="pc-spacer" />
        <div className="pc-pnl-wrap">
          <div className="pc-pnl" style={{ color: finalClr }}>{t.pnl >= 0 ? '+' : ''}${Math.abs(t.pnl).toFixed(2)}</div>
          <div className="pc-pnl-pct" style={{ color: finalClr }}>{t.pnlPct >= 0 ? '+' : ''}{t.pnlPct.toFixed(2)}%</div>
        </div>
      </div>
      <div className="pc-row2">
        <div className="pc-cell"><div className="pc-cell-lbl">Entry</div><div className="pc-cell-val">{t.entry.toLocaleString()}</div></div>
        <div className="pc-cell"><div className="pc-cell-lbl">Exit</div><div className="pc-cell-val">{t.exit != null ? t.exit.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</div></div>
        <div className="pc-cell"><div className="pc-cell-lbl">Stop</div><div className="pc-cell-val r">{t.stop.toLocaleString()}</div></div>
        <div className="pc-cell"><div className="pc-cell-lbl">Target</div><div className="pc-cell-val g">{t.target.toLocaleString()}</div></div>
      </div>
      <div className="pc-row3">
        <div className="pc-prog-wrap">
          <div className="pc-prog-bg"><div className="pc-prog-fill" style={{ width: '100%', background: finalClr }} /></div>
          <div className="pc-prog-lbl" style={{ color: finalClr, letterSpacing: '1px' }}>{outcomeLabel}</div>
        </div>
        <div className="pc-hold">
          {t.hold}
          {t.exitTimestamp && <div className="hold-closed">Closed {fmtCloseET(t.exitTimestamp)}</div>}
        </div>
      </div>
    </div>
  );
}

function MobileEquity({ mode, data }) {
  const series = adaptEquityCurve(data);
  const header = adaptEquityHeader(data);
  const bootstrap = shouldRenderBootstrap(mode) || !series;
  const svg = useMemo(
    () => (bootstrap ? null : buildEquityCurveSvgFromSeries(series, { width: 600, height: 80 })),
    [bootstrap, series],
  );
  // Rev 35: daily-return strip from the same equity points (mirror of PC).
  const retStrip = useMemo(
    () => (bootstrap ? null : buildDailyReturnBars(series, { width: 600, height: RETURN_STRIP_H, strongThreshold: STRONG_DAILY_PCT, eliteThreshold: ELITE_DAILY_PCT })),
    [bootstrap, series],
  );
  const peakFmt = header?.peak ? `$${Math.round(header.peak).toLocaleString()}` : '—';
  const ddFmt = header?.drawdownPct != null ? `${header.drawdownPct.toFixed(2)}%` : '—';
  const twrFmt = header?.twrPct != null ? `${header.twrPct >= 0 ? '+' : ''}${header.twrPct.toFixed(2)}%` : '—';
  return (
    <>
      <div className="eq-head">
        <span className="eq-title"><span className="ptitle-bar" />EQUITY CURVE</span>
        <span className="eq-stats">
          <span className="lbl">PEAK</span><span className="g">{peakFmt}</span>
          <span className="lbl">DD</span><span className="r">{ddFmt}</span>
          <span className="lbl">TWR</span><span>{twrFmt}</span>
          {/* Rev 36: daily-return tier legend — STRONG/ELITE only. */}
          <span className="eq-leg"><span className="eq-leg-sw sw-strong" />STRONG</span>
          <span className="eq-leg"><span className="eq-leg-sw sw-elite" />ELITE</span>
        </span>
      </div>
      <div className="eq-svg-wrap">
        {/* Rev 36: fixed literal BASE label off the fill (see PC rationale). */}
        <span className="eq-base-lbl">$10K</span>
        <svg id="equity-svg-m" viewBox="0 0 600 80" preserveAspectRatio="none">
          <defs>
            <linearGradient id="eqGradPosM" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0,230,118,0.35)" />
              <stop offset="100%" stopColor="rgba(0,230,118,0)" />
            </linearGradient>
          </defs>
          {svg && (
            <>
              <line x1="0" y1={svg.baseY} x2={svg.width} y2={svg.baseY}
                stroke="rgba(255,171,0,0.4)" strokeWidth="0.6" strokeDasharray="3,3" />
              <path d={svg.fillD} fill="url(#eqGradPosM)" stroke="none" />
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
      {/* Rev 35: daily-return strip below the curve. Free-scroll column absorbs
          the added height — no clip. */}
      <div className="eq-svg-return">
        <span className="eq-ret-lbl">DAILY RETURN</span>
        <svg id="equity-svg-m-ret" viewBox={`0 0 600 ${RETURN_STRIP_H}`} preserveAspectRatio="none">
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
    </>
  );
}

function ScanTab({ mode, data }) {
  // Portal v1.2 scanner-cycle dispatch (2026-05-26): mirror of PC
  // ScannerPanel — full asset list vertical scroll, FIRED pulse on OPEN
  // rows, BUILDING DATA placeholder when no recent score in cutoff window.
  // See ScannerPanel in PCApp.jsx for the full motion-model commentary.
  const bootstrap = shouldRenderBootstrap(mode);
  const scanRows = adaptScanner(data);
  const fallback = bootstrap || !scanRows;
  const rows = fallback
    ? SCANNER_ASSETS.map((a) => ({
        sym: a.sym, sub: a.track, score: 0, hasScore: false, fired: false,
      }))
    : scanRows;
  // Portal v1.8 P2 (2026-05-29): mobile renders a SINGLE copy of the rows.
  // The `doubled = [...rows, ...rows]` was only there to seam the desktop-
  // style vscroll ticker. With the mobile animation disabled in CSS, a
  // doubled list would just show every asset twice to a manually-scrolling
  // operator. Desktop ScannerPanel in PCApp.jsx still doubles for its ticker.
  return (
    <div className="panel">
      <div className="ptitle">
        <span><span className="ptitle-bar" />SIGNAL SCANNER</span>
        <span className="ptitle-r">{rows.length} ASSETS</span>
      </div>
      <div className="scanner-list">
        <div className="scanner-list-inner">
          {rows.map((a, i) => (
            <MobileScannerRow a={a} key={`${a.sym}-${i}`} fallback={fallback} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MobileScannerRow({ a, fallback }) {
  const showScore = !fallback && a.hasScore;
  const isFired = !fallback && a.fired;
  const isGo = !fallback && a.go;
  const noData = showScore && a.fresh === false;
  const color = showScore ? scoreColor(a.score) : 'var(--w3)';
  let cls = 'srow';
  // Tier 2 (2026-06-09): box lights on GO (fireable live), not a score cutoff.
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

// Strand 4 mobile parity (2026-06-11): tiny trend sparkline for the PF /
// Expectancy metric rows — mirror of the PC KPI-tile Sparkline, sized for the
// mc-arc slot. Renders nothing usable (empty svg keeps the slot) below 2 points.
function MobileSparkline({ values, color }) {
  if (!Array.isArray(values) || values.length < 2) {
    return <svg className="mc-arc" width="56" height="34" viewBox="0 0 56 34" />;
  }
  const W = 56, H = 30;
  const min = Math.min(...values), max = Math.max(...values);
  const range = (max - min) || 1, n = values.length;
  const pts = values.map((v, i) =>
    `${((i / (n - 1)) * W).toFixed(1)},${(2 + H - ((v - min) / range) * H).toFixed(1)}`).join(' ');
  return (
    <svg className="mc-arc" width="56" height="34" viewBox="0 0 56 34" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.9" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
// Previous-render value, for the "vs prior poll" delta (mirror of PC usePrev).
function usePrev(value) {
  const ref = useRef();
  useEffect(() => { ref.current = value; });
  return ref.current;
}

function SystemTab({ mode, data, onOpenKernel }) {
  const liveMode = mode === 'live';
  const winRate = adaptWinRate(data);
  const sharpe = adaptPanelSharpe(data);
  // Annualized display (settled 06-09): annualized-corpus now; daily ×√252 once
  // the daily-return series ≥ 30. Mirror of the PC dial.
  const useDailyBasisM = !!sharpe && sharpe.dailyReturnCount >= 30 && sharpe.dailySharpe != null;
  const srDial = sharpe
    ? (useDailyBasisM
      ? { value: sharpe.dailySharpe, band: mSharpeBandOf(sharpe.dailySharpe) }
      : { value: sharpe.annualizedCorpus ?? 0, band: sharpe.annualizedCorpusBand || mSharpeBandOf(sharpe.annualizedCorpus) })
    : { value: 0, band: 'CRITICAL' };
  const conviction = adaptConviction(data);
  const wrBoot = liveMode || !winRate;
  const srBoot = liveMode || !sharpe;
  const ctBoot = liveMode || !conviction;
  // Portal v1.9 F1 (2026-05-29): kernel-chip CYCLES now reads the real
  // learning-loop cycle count from `rules_footer.max(r.cycle_number)`, same
  // source as the Rules-footer CYCLE pill. Replaces the placeholder literal
  // KERNEL_COUNTS.cycles = 6 that pre-dated live wiring. With zero loop
  // runs this shows 0.
  const sysFoot = adaptRulesFoot(data);
  const sysCyclesCount = sysFoot?.cycle ?? 0;

  // §6.6 mobile parity (2026-06-11): PF + Expectancy with sparkline + delta —
  // same proxy sources as the PC KPI tiles (panel_profit_factor / _expectancy /
  // pf_expectancy_series). Delta = vs prior poll (usePrev).
  const pf = liveMode ? null : adaptPanelProfitFactor(data);
  const exp = liveMode ? null : adaptPanelExpectancy(data);
  const pfExp = liveMode ? null : adaptPfExpectancySeries(data);
  const prevPf = usePrev(pf?.overall);
  const prevExp = usePrev(exp?.overall);
  const pfDelta = (pf?.overall != null && prevPf != null) ? pf.overall - prevPf : null;
  const expDelta = (exp?.overall != null && prevExp != null) ? exp.overall - prevExp : null;
  const pfBoot = liveMode || !pf || pf.overall == null;
  const expBoot = liveMode || !exp || exp.overall == null;

  return (
    <>
      <div className="panel">
        <div className="ptitle"><span><span className="ptitle-bar" />SYSTEM METRICS</span></div>

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

        <div className="mc">
          <div className="mc-left">
            <div className="mc-label">PROFIT FACTOR</div>
            {pfBoot ? (
              <>
                <div className="mc-value dim" style={{ color: 'var(--w3)' }}>—</div>
                <div className="mc-sub">AWAITING PROXY PANELS</div>
              </>
            ) : (
              <>
                <div className="mc-value" style={{ color: pf.overall >= 1 ? 'var(--green)' : 'var(--red)' }}>
                  {pf.overall.toFixed(3)}
                  {pfDelta != null && Math.abs(pfDelta) >= 0.001 && (
                    <span style={{ fontSize: '10px', marginLeft: '5px', color: pfDelta >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {pfDelta >= 0 ? '+' : ''}{pfDelta.toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="mc-sub">{pf.n} closed · excl-36</div>
              </>
            )}
          </div>
          <MobileSparkline values={pfExp?.pf} color={!pfBoot && pf.overall >= 1 ? 'var(--green)' : 'var(--red)'} />
        </div>

        <div className="mc">
          <div className="mc-left">
            <div className="mc-label">EXPECTANCY ($)</div>
            {expBoot ? (
              <>
                <div className="mc-value dim" style={{ color: 'var(--w3)' }}>—</div>
                <div className="mc-sub">AWAITING PROXY PANELS</div>
              </>
            ) : (
              <>
                <div className="mc-value" style={{ color: exp.overall >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {(exp.overall < 0 ? '-$' : '+$') + Math.abs(exp.overall).toFixed(2)}
                  {expDelta != null && Math.abs(expDelta) >= 0.005 && (
                    <span style={{ fontSize: '10px', marginLeft: '5px', color: expDelta >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {expDelta >= 0 ? '+' : ''}${Math.abs(expDelta).toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="mc-sub">avg/trade · {exp.n} closed</div>
              </>
            )}
          </div>
          <MobileSparkline values={pfExp?.expectancy} color={!expBoot && exp.overall >= 0 ? 'var(--green)' : 'var(--red)'} />
        </div>

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
                <div className="mc-value" style={{ color: mSharpeColor(srDial.band) }}>{(srDial.value ?? 0).toFixed(2)}</div>
                <div className="mc-sub" style={{ color: mSharpeColor(srDial.band), fontWeight: 700, letterSpacing: '1px' }}>{srDial.band}</div>
                <div className="mc-sub" style={{ color: 'var(--w3)', fontSize: '8px', letterSpacing: '.3px' }}>matures at 30 eq-days · 200 trades</div>
              </>
            )}
          </div>
          {srBoot ? (
            <svg className="mc-arc" width="56" height="40" viewBox="0 0 56 40" overflow="visible">
              <path d="M4,30 A24,24 0 0,1 52,30" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" strokeLinecap="round" />
            </svg>
          ) : (
            <MSharpeDial value={srDial.value} band={srDial.band} />
          )}
        </div>

        <div className="mc offline">
          <div className="mc-left">
            <div className="mc-label" style={{ color: 'var(--amber)', letterSpacing: '3px' }}>LANE 2 Δ DELTA</div>
            <div className="mc-value a" style={{ fontSize: '18px' }}>OFFLINE</div>
            <div className="mc-sub" style={{ color: 'var(--amber)', opacity: 0.75 }}>lane2_enabled = false · scaffold mode</div>
            <div className="mc-sub">
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

        <div className="mc" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div className="mc-label">CONVICTION TIERS</div>
            <div className="mc-value a" style={{ fontSize: '18px' }}>
              {ctBoot ? '— PENDING' : `${conviction.dominantLabel} ${conviction.dominantPct.toFixed(0)}%`}
            </div>
          </div>
          {ctBoot ? (
            <div className="mc-sub" style={{ marginTop: '6px' }}>AWAITING FIRST TRADE</div>
          ) : (
            <>
              {/* Portal v1.2 conviction-tier display fix (2026-05-26):
                  legend order flipped from Std/High/Max → Max/High/Std so the
                  highest-sizing tier reads first, matching the PC sub-line
                  ordering. Bar segment order also flipped so the amber Max
                  slice anchors the left side, consistent with the legend. */}
              <div className="conv-bar">
                <div className="conv-seg max" style={{ width: conviction.max + '%' }} />
                <div className="conv-seg hi"  style={{ width: conviction.high + '%' }} />
                <div className="conv-seg std" style={{ width: conviction.std + '%' }} />
              </div>
              <div className="conv-legend">
                <span style={{ color: 'var(--amber)' }}>MAX <span>{conviction.max.toFixed(0)}%</span> ×1.5</span>
                <span style={{ color: 'var(--cyan)' }}>HIGH <span>{conviction.high.toFixed(0)}%</span> ×1.25</span>
                <span>STD <span style={{ color: 'var(--white)' }}>{conviction.std.toFixed(0)}%</span> ×1.0</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">
          <span><span className="ptitle-bar" />KNOWLEDGE KERNELS</span>
          <span className="ptitle-r">PHASE {KERNEL_COUNTS.phase}</span>
        </div>
        <div className="kernel-chip">
          <div className="kc-stats">
            <span><span className="c">{KERNEL_COUNTS.nodes}</span> NODES</span>
            <span><span className="c">{KERNEL_COUNTS.edges}</span> EDGES</span>
            <span>CYCLES <span className="c">{sysCyclesCount}</span></span>
            <span>LANE 2 <span className="a">OFFLINE</span></span>
          </div>
          <button className="kc-view-btn" onClick={onOpenKernel}>VIEW GRAPH</button>
        </div>
      </div>
    </>
  );
}

// ── §6.6 mobile parity (2026-06-10) — annualized Sharpe dial + consolidated
// Returns-by-Domain ($/% toggle + window selector + annualized %). Reuses the
// shared proxy adapters; mobile-scoped render so desktop is untouched. ───────
function mSharpeColor(b) {
  return b === 'WELL' ? 'var(--cyan)' : b === 'ACCEPTABLE' ? 'var(--green)'
    : b === 'WARNING' ? 'var(--amber)' : 'var(--loss)';
}
function mSharpeBandOf(v) {
  if (v == null || !Number.isFinite(v)) return 'CRITICAL';
  if (v > 2) return 'WELL';
  if (v >= 1) return 'ACCEPTABLE';
  if (v >= 0.5) return 'WARNING';
  return 'CRITICAL';
}
function MSharpeDial({ value, band }) {
  const v = Math.max(0, Math.min(value ?? 0, 3)), L = 75.4, color = mSharpeColor(band);
  const a = Math.PI * (1 - 1 / 3);
  const gx1 = 28 + 23 * Math.cos(a), gy1 = 30 - 23 * Math.sin(a);
  const gx2 = 28 + 31 * Math.cos(a), gy2 = 30 - 31 * Math.sin(a);
  return (
    <svg className="mc-arc" width="56" height="40" viewBox="0 0 56 40" overflow="visible">
      <path d="M4,30 A24,24 0 0,1 52,30" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" strokeLinecap="round" />
      <path d="M4,30 A24,24 0 0,1 52,30" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={L} strokeDashoffset={(1 - v / 3) * L} opacity="0.95" />
      <line x1={gx1} y1={gy1} x2={gx2} y2={gy2} stroke="var(--w1)" strokeWidth="1.3" opacity="0.85" />
      <text x={gx2} y={gy2 - 1.5} textAnchor="middle" fontFamily="Share Tech Mono" fontSize="4.5" fill="var(--w2)">1.0</text>
      <text x="28" y="23" textAnchor="middle" fontFamily="Share Tech Mono" fontSize="10" fill={color}>{(value ?? 0).toFixed(2)}</text>
    </svg>
  );
}
function mFmtUsd(v) { if (v == null || !Number.isFinite(v)) return '—'; const r = Math.round(v); return (r < 0 ? '-$' : '$') + Math.abs(r); }
function mFmtPct(v) { if (v == null || !Number.isFinite(v)) return '—'; const a = Math.abs(v), s = v < 0 ? '-' : ''; return a >= 100 ? s + Math.round(a) + '%' : s + a.toFixed(1) + '%'; }
function mFit(str) { const L = (str || '').length; return L <= 5 ? 'rbd-fit-l' : L <= 7 ? 'rbd-fit-m' : L <= 9 ? 'rbd-fit-s' : 'rbd-fit-xs'; }
const M_AC_ABBR = { Crypto: 'CRYPTO', 'Large-cap stock': 'LG-CAP', 'Growth stock': 'GROWTH' };
const M_TRACK_ABBR = { Conservative: 'CONS', Moderate: 'MOD', Aggressive: 'AGG' };
const M_WINDOWS = [{ k: 'current_month', l: 'MTD' }, { k: 'ytd', l: 'YTD' }, { k: '1y', l: '1Y' }, { k: '5y', l: '5Y' }, { k: 'all', l: 'ALL' }];

function MRbdCell({ metric, view, total }) {
  const tc = total ? ' rbd-total-cell' : '';
  if (!metric || !metric.hasData) {
    return <div className={'rm-cell rm-empty' + tc}><div className="rm-cell-pct">—</div><div className="rm-cell-n">n=0</div></div>;
  }
  const raw = view === '%' ? metric.annPct : metric.pnl;
  const str = view === '%' ? mFmtPct(metric.annPct) : mFmtUsd(metric.pnl);
  const tone = raw == null ? 'rm-flat' : (raw > 0 ? 'rm-pos' : (raw < 0 ? 'rm-neg' : 'rm-flat'));
  return <div className={'rm-cell ' + tone + tc}><div className={'rm-cell-pct ' + mFit(str)}>{str}</div><div className="rm-cell-n">n={metric.n}</div></div>;
}
function MRbdRow({ assetClass, trackOrder, cell, colSigma, view }) {
  return (
    <>
      <div className="rm-h rm-row-h">{M_AC_ABBR[assetClass] ?? assetClass}</div>
      {trackOrder.map((tr) => <MRbdCell key={tr} metric={cell[`${assetClass}:${tr}`]} view={view} />)}
      <MRbdCell metric={colSigma} view={view} />
    </>
  );
}
function MReturnsByDomain({ mode, data }) {
  const live = mode === 'live';
  const [view, setView] = useState('$');
  const [win, setWin] = useState('all');
  const rows = live ? null : (data?.panelReturnsByDomainPct?.[win] ?? null);
  const m = rows ? adaptPanelReturnsByDomainPct(rows) : null;
  const header = (
    <>
      <div className="ptitle">
        <span><span className="ptitle-bar" />RETURNS BY DOMAIN</span>
        <span className="rbd-toggle">
          <button type="button" className={'rbd-tab' + (view === '$' ? ' on' : '')} onClick={() => setView('$')}>$</button>
          <button type="button" className={'rbd-tab' + (view === '%' ? ' on' : '')} onClick={() => setView('%')}>%</button>
        </span>
      </div>
      <div className="rbd-winrow">{M_WINDOWS.map((w) => <button key={w.k} type="button" className={'rbd-win' + (win === w.k ? ' on' : '')} onClick={() => setWin(w.k)}>{w.l}</button>)}</div>
    </>
  );
  if (!m) return <div className="panel p-returns p-returns-mobile rbd-panel">{header}<div className="rm-bootstrap">— AWAITING LIVE RETURNS MATRIX —</div></div>;
  const { assetClassOrder, trackOrder, cell, rowSigma, colSigma, corner, insufficient, equityDays } = m;
  const cornerStr = view === '%' ? mFmtPct(corner.annPct) : mFmtUsd(corner.pnl);
  return (
    <div className="panel p-returns p-returns-mobile rbd-panel">
      {header}
      <div className="rbd-meta">excl-36 · {cornerStr} · {corner.n} closed{view === '%' && insufficient && <span className="rbd-flag"> · ⚠ {equityDays}d&lt;30</span>}</div>
      <div className="rm-grid rbd-grid">
        <div className="rm-h rm-corner-h" aria-hidden="true" />
        {trackOrder.map((tr) => <div key={tr} className="rm-h rm-col-h">{M_TRACK_ABBR[tr] ?? tr}</div>)}
        <div className="rm-h rm-col-h rm-sigma-h">Total</div>
        {assetClassOrder.map((ac) => <MRbdRow key={ac} assetClass={ac} trackOrder={trackOrder} cell={cell} colSigma={colSigma[ac]} view={view} />)}
        <div className="rm-h rm-row-h rm-sigma-h rbd-total-h">Total</div>
        {trackOrder.map((tr) => <MRbdCell key={'r' + tr} metric={rowSigma[tr]} view={view} total />)}
        <MRbdCell metric={corner} view={view} total />
      </div>
    </div>
  );
}

function DataTab({ mode, data, liveEvents, onOpenPopup }) {
  const rules = adaptRulesThisWeek(data);
  const foot = adaptRulesFoot(data);
  const cohort = adaptClosestCohort(data);
  const bootstrap = shouldRenderBootstrap(mode);
  const rulesBoot = bootstrap || (!rules && !foot);
  const eventsBoot = bootstrap || !liveEvents;
  const events = liveEvents ?? [];

  return (
    <>
      {/* Portal v1.14 P3.2 (2026-05-30): M4 §6 health strip at top of DATA tab.
          Collapsed GREEN/AMBER same as PC; RED expands INLINE here (mobile
          decision per dispatch P3.2 — DATA has room). Detail block: reasons
          from array, monitors line, props, positions, 24h history, freshness. */}
      <div className="panel">
        <div className="ptitle">
          <span><span className="ptitle-bar" />ACCOUNT HEALTH</span>
        </div>
        <HealthStrip data={data} layout="mobile-data" />
      </div>

      {/* §6.6 D2 (2026-06-10): consolidated Returns-by-Domain — $/% toggle +
          window selector + annualized % (proxy), replacing the %-mean matrix. */}
      <MReturnsByDomain mode={mode} data={data} />

      <div className="panel">
        <div className="ptitle">
          {/* 2026-06-08: "THIS CYCLE" (was "THIS WEEK") — mirrors PC; the 0 is
              the per-cycle rules count, not a week number. */}
          <span><span className="ptitle-bar" />RULES ADDED THIS CYCLE</span>
          <span className="ptitle-r">CYCLE {foot?.cycle ?? 0}</span>
        </div>
        <div className="rules-list">
          {rulesBoot || !rules ? (
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
        </div>
        <div className="rules-foot">{foot?.thisWeek ?? 0} RULES · CYCLE <span>{foot?.cycle ?? 0}</span> · TOTAL <span>{foot?.total ?? 0}</span></div>
      </div>

      <div className="panel p-news-status">
        {(() => {
          // Portal v1.2 (2026-05-26): order matches PC — SYSTEM EVENTS (top),
          // MACRO (middle, moved up from bottom per Change 3), per-asset NEWS
          // (bottom). All three are now horizontal scrolling marquees.
          const recentEvents = adaptRecentEvents(data, 5);
          const newsItems = adaptNewsTicker(data);
          const macroItems = adaptMacroNews(data);
          const cacheStatus = data?.macroNews?.cache;
          return (
            <>
              <StatusStrip recentEvents={recentEvents} variant="mobile" />
              <div className="news-row macro">
                <MacroNewsStrip items={macroItems} cacheStatus={cacheStatus} />
              </div>
              <div className="news-row primary">
                {bootstrap
                  ? <div className="news-ticker-empty">— LIVE MODE — PER-ASSET NEWS SUPPRESSED —</div>
                  : <NewsTicker items={newsItems} />}
              </div>
            </>
          );
        })()}
      </div>

      {/* Strand 4 mobile parity (2026-06-11): P&L VIEWS — heatmap + returns
          calendar triggers. Occupies the slot the retired Weekly P&L panel left
          (Item 101 / −60.77% double-×100 surface removed for desktop parity).
          Opens the mobile bottom-sheet popups; also reachable via #heatmap /
          #calendar deep-links. */}
      <div className="panel">
        <div className="ptitle">
          <span><span className="ptitle-bar" />P&amp;L VIEWS</span>
        </div>
        <div className="m-pnlviews">
          <button type="button" className="m-pnlview-btn" onClick={() => onOpenPopup?.('heatmap')}>▦ HEATMAP</button>
          <button type="button" className="m-pnlview-btn" onClick={() => onOpenPopup?.('calendar')}>▤ CALENDAR</button>
        </div>
      </div>
    </>
  );
}

function KernelOverlay({ open, data, onClose }) {
  const canvasRef = useRef(null);
  const [counts, setCounts] = useState({ nodes: KERNEL_COUNTS.nodes, edges: KERNEL_COUNTS.edges });
  // Portal v1.9 F1 (2026-05-29): kernel-overlay-foot CYCLES reads the real
  // learning-loop cycle count from `rules_footer.max(r.cycle_number)`. See
  // SystemTab and PC KernelPanel for the matching rationale.
  const koFoot = adaptRulesFoot(data);
  const koCyclesCount = koFoot?.cycle ?? 0;
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const k = initKernelScene(canvas);
      setCounts(k.counts);
      const onResize = () => k.resize();
      window.addEventListener('resize', onResize);
      canvas.__destroyKernel = () => {
        window.removeEventListener('resize', onResize);
        k.destroy();
      };
    });
    return () => {
      cancelAnimationFrame(id);
      const canvas = canvasRef.current;
      if (canvas && canvas.__destroyKernel) {
        canvas.__destroyKernel();
        canvas.__destroyKernel = null;
      }
    };
  }, [open]);

  return (
    <div className={'kernel-overlay' + (open ? ' show' : '')}>
      <div className="ko-head">
        <div className="ko-title">KNOWLEDGE KERNELS</div>
        <button className="ko-close" onClick={onClose}>✕</button>
      </div>
      <div className="ko-canvas-wrap">
        <canvas id="kernel-canvas-m" ref={canvasRef} />
        <div className="ko-legend">
          <div className="kl-item"><span className="kl-dot" style={{ background: '#00c2ff' }} />TRADES</div>
          <div className="kl-item"><span className="kl-dot" style={{ background: '#ffab00' }} />NEWS</div>
          <div className="kl-item"><span className="kl-dot" style={{ background: '#ddeeff' }} />WEEKLY</div>
          <div className="kl-item"><span className="kl-dot" style={{ background: '#3d6080' }} />SCAFFOLD</div>
          <div className="kl-item"><span className="kl-dot" style={{ background: '#00e676' }} />RULES</div>
        </div>
      </div>
      <div className="ko-foot">
        <div className="kf-stat">PHASE <span>{KERNEL_COUNTS.phase}</span></div>
        <div className="kf-stat">CYCLES <span>{koCyclesCount}</span></div>
        <div className="kf-stat">{counts.nodes} NODES · {counts.edges} EDGES</div>
        <div className="kf-stat">LANE 2 <span className="amber">OFFLINE</span></div>
      </div>
    </div>
  );
}
