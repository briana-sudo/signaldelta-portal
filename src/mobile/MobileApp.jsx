import { useEffect, useMemo, useRef, useState } from 'react';
import { useClock, usePollCountdown } from '../lib/useClock.js';
import { usePositionDrift } from '../lib/useDrift.js';
import { shouldRenderBootstrap } from '../lib/usePhaseFilter.js';
import {
  SCANNER_ASSETS, WEEKLY_WATERFALL, KERNEL_COUNTS, LOGO_SVG, CURRENT_PHASE,
} from '../lib/placeholders.js';
import {
  adaptAccountBar, adaptWeeklyWaterfall, adaptEvents,
  adaptWinRate, adaptSharpe, adaptConviction,
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

const MODES = ['live', 'training', 'combined'];
const DEFAULT_MODE = 'training';

const TABS = [
  { id: 'desk',   icon: '▤', label: 'Desk' },
  { id: 'scan',   icon: '◈', label: 'Scan' },
  { id: 'system', icon: '◉', label: 'System' },
  { id: 'data',   icon: '▦', label: 'Data' },
];

const scoreCls = (s) => (s >= 65 ? 'hi' : s >= 40 ? 'mi' : 'lo');
const barClr = (s) => {
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

  const liveAccountBar = adaptAccountBar(data);
  const currentPhase = liveAccountBar?.currentPhase || CURRENT_PHASE;
  const liveEvents = adaptEvents(data);
  const heartbeat = adaptHeartbeat(data);
  const pollTimestamp = data?.pollTimestamp;

  return (
    <div className="mobile-shell">
      <MobileStatusBanner error={error} errors={errors} hasAnyData={hasAnyData} />
      <MobileHeader
        clock={clock}
        mode={mode}
        currentPhase={currentPhase}
        heartbeat={heartbeat}
        pollSecs={pollSecs}
        pollPulse={pollPulse}
      />
      <ModeToggle mode={mode} setMode={setMode} />
      <MobileAccountBar
        mode={mode}
        liveAccountBar={liveAccountBar}
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
          <DataTab mode={mode} data={data} liveEvents={liveEvents} />
        </div>
      </div>
      <TabBar tab={tab} setTab={setTab} />
      <KernelOverlay open={kernelOpen} onClose={() => setKernelOpen(false)} />
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

function MobileHeader({ clock, mode, currentPhase, heartbeat, pollSecs, pollPulse }) {
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
        <div className="clock">
          <span className="clock-et">{clock.etCompact}</span>
          <span className="clock-sep">·</span>
          <span className="clock-utc">{clock.utcCompact}</span>
        </div>
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

function MobileAccountBar({ mode, liveAccountBar }) {
  // Drift removed 2026-05-26 per drift-scope-fix dispatch — display polled
  // values directly. usePositionDrift retained for OPEN trade rows in DeskTab.
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
  const liveTrades = adaptTradeList(data);
  const liveWaterfall = adaptWeeklyWaterfall(data);
  const liveAccountBar = adaptAccountBar(data);
  const tradesBoot = shouldRenderBootstrap(mode) || !liveTrades;
  const wfBoot = shouldRenderBootstrap(mode) || !liveWaterfall;
  const trades = liveTrades ?? [];
  const openTrades = trades.filter((t) => t.status === 'OPEN');
  const openOffsets = usePositionDrift(openTrades, { pollTimestamp, enabled: !tradesBoot });
  const openOffsetByReq = new Map(openTrades.map((t, i) => [t.requestId, openOffsets[i] ?? 0]));

  return (
    <>
      <div className="panel">
        <div className="ptitle">
          <span><span className="ptitle-bar" />TRADES</span>
          <span className="ptitle-r">
            {tradesBoot ? 'AWAITING TRADES SINCE MARKET OPEN' : `${openTrades.length} OPEN · ${trades.length} TOTAL`}
          </span>
        </div>
        {tradesBoot ? (
          <div style={{ textAlign: 'center', color: 'var(--w3)', padding: '20px', fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px' }}>
            — AWAITING TRADES SINCE MARKET OPEN —
          </div>
        ) : trades.map((t) => (
          <MobileTradeCard key={t.requestId || `${t.asset}-${t.entryTimestamp}`}
                           t={t} offset={openOffsetByReq.get(t.requestId) ?? 0} />
        ))}
      </div>

      <div className="panel eq-panel">
        <MobileEquity mode={mode} data={data} />
      </div>

      <div className="stats-chip">
        <div className="sc-item"><div className="sc-val">{tradesBoot ? 0 : openTrades.length}</div><div className="sc-lbl">Open</div></div>
        <div className="sc-item"><div className="sc-val">{tradesBoot ? 0 : (liveAccountBar?.trades ?? 0)}</div><div className="sc-lbl">Trades</div></div>
        <div className="sc-item"><div className="sc-val">{tradesBoot ? 0 : eventsCount}</div><div className="sc-lbl">Events Today</div></div>
      </div>

      <div className="panel wf-panel">
        <div className="ptitle">
          <span><span className="ptitle-bar" />WEEKLY P&amp;L</span>
          <span className="ptitle-r">{wfBoot ? 'AWAITING LIVE WEEKLY CONTEXTS' : '6 WEEKS · CUR W6'}</span>
        </div>
        <MobileWaterfall mode={mode} liveWaterfall={liveWaterfall} />
      </div>
    </>
  );
}

function MobileTradeCard({ t, offset }) {
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
      <div className="pos-card card-open">
        <div className="pc-row1">
          <div className="pc-asset">{t.asset}</div>
          <div className="pc-pills">
            <span className={'ptrack ' + t.track}>{t.tl}</span>
            <span className={'pconv ' + t.conv}>{t.cl}</span>
          </div>
          <div className="pc-spacer" />
          <div className="pc-pnl-wrap">
            <div className="pc-pnl" style={{ color: clr }}>{pos ? '+' : ''}${Math.abs(pv).toFixed(2)}</div>
            <div className="pc-pnl-pct" style={{ color: clr }}>{pos ? '+' : ''}{pp.toFixed(2)}%</div>
          </div>
        </div>
        <div className="pc-row2">
          <div className="pc-cell"><div className="pc-cell-lbl">Entry</div><div className="pc-cell-val">{t.entry.toLocaleString()}</div></div>
          <div className="pc-cell"><div className="pc-cell-lbl">Current</div><div className="pc-cell-val">{cur.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div></div>
          <div className="pc-cell"><div className="pc-cell-lbl">Stop</div><div className="pc-cell-val r">{t.stop.toLocaleString()}</div></div>
          <div className="pc-cell"><div className="pc-cell-lbl">Target</div><div className="pc-cell-val g">{t.target.toLocaleString()}</div></div>
        </div>
        <div className="pc-row3">
          <div className="pc-prog-wrap">
            <div className="pc-prog-bg"><div className="pc-prog-fill" style={{ width: progPct + '%', background: clr }} /></div>
            <div className="pc-prog-lbl">{progPct.toFixed(0)}% TO TARGET</div>
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
        <div className="pc-hold">{t.hold}</div>
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
        </span>
      </div>
      <div className="eq-svg-wrap">
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
              <text x="4" y={svg.baseY - 3} fontFamily="Share Tech Mono" fontSize="6" fill="var(--amber)" opacity="0.6">$10K BASE</text>
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
    </>
  );
}

function MobileWaterfall({ mode, liveWaterfall }) {
  const wrapRef = useRef(null);
  const series = liveWaterfall;
  const bootstrap = shouldRenderBootstrap(mode) || !series;
  const data = series ?? WEEKLY_WATERFALL;
  const [heights, setHeights] = useState(() => data.map(() => 2));
  useEffect(() => {
    if (bootstrap) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const barH = wrap.clientHeight - 22;
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
      <div className="wf-wrap" ref={wrapRef}>
        <div className="wf-baseline" />
        <div style={{ flex: 1, textAlign: 'center', alignSelf: 'center', color: 'var(--w3)', fontFamily: 'var(--mono)', fontSize: '8px', letterSpacing: '1px' }}>
          — AWAITING LIVE WEEKLY CONTEXTS —
        </div>
      </div>
    );
  }
  return (
    <div className="wf-wrap" ref={wrapRef}>
      <div className="wf-baseline" />
      {data.map((w, i) => (
        <div className="wf-col" key={w.w}>
          <div
            className="wf-pct"
            style={{ color: w.cur ? 'var(--cyan)' : w.pos ? 'var(--green)' : 'var(--red)' }}
          >{(w.pos ? '+' : '') + w.p + '%'}</div>
          <div
            className={'wf-bar ' + (w.cur ? 'cur' : w.pos ? 'pos' : 'neg')}
            style={{ height: heights[i] + 'px' }}
          />
          <div className="wf-lbl">{w.w}</div>
        </div>
      ))}
    </div>
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
  const doubled = [...rows, ...rows];
  return (
    <div className="panel">
      <div className="ptitle">
        <span><span className="ptitle-bar" />SIGNAL SCANNER</span>
        <span className="ptitle-r">{rows.length} ASSETS</span>
      </div>
      <div className="scanner-list">
        <div className="scanner-list-inner">
          {doubled.map((a, i) => (
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

function SystemTab({ mode, data, onOpenKernel }) {
  const liveMode = mode === 'live';
  const winRate = adaptWinRate(data);
  const sharpe = adaptSharpe(data);
  const conviction = adaptConviction(data);
  const wrBoot = liveMode || !winRate;
  const srBoot = liveMode || !sharpe;
  const ctBoot = liveMode || !conviction;

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
              <div className="conv-bar">
                <div className="conv-seg std" style={{ width: conviction.std + '%' }} />
                <div className="conv-seg hi"  style={{ width: conviction.high + '%' }} />
                <div className="conv-seg max" style={{ width: conviction.max + '%' }} />
              </div>
              <div className="conv-legend">
                <span>STD <span style={{ color: 'var(--white)' }}>{conviction.std.toFixed(0)}%</span> ×1.0</span>
                <span style={{ color: 'var(--cyan)' }}>HIGH <span>{conviction.high.toFixed(0)}%</span> ×1.25</span>
                <span style={{ color: 'var(--amber)' }}>MAX <span>{conviction.max.toFixed(0)}%</span> ×1.5</span>
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
            <span>CYCLES <span className="c">{KERNEL_COUNTS.cycles}</span></span>
            <span>LANE 2 <span className="a">OFFLINE</span></span>
          </div>
          <button className="kc-view-btn" onClick={onOpenKernel}>VIEW GRAPH</button>
        </div>
      </div>
    </>
  );
}

function DataTab({ mode, data, liveEvents }) {
  const rules = adaptRulesThisWeek(data);
  const foot = adaptRulesFoot(data);
  const bootstrap = shouldRenderBootstrap(mode);
  const rulesBoot = bootstrap || (!rules && !foot);
  const eventsBoot = bootstrap || !liveEvents;
  const events = liveEvents ?? [];

  return (
    <>
      <div className="panel">
        <div className="ptitle">
          <span><span className="ptitle-bar" />RETURNS BY DOMAIN</span>
          <span className="ptitle-r">3×3</span>
        </div>
        <div style={{ textAlign: 'center', color: 'var(--w3)', padding: '20px', fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px' }}>
          — AWAITING LIVE RETURNS MATRIX —
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">
          <span><span className="ptitle-bar" />RULES ADDED THIS WEEK</span>
          <span className="ptitle-r">CYCLE {foot?.cycle ?? 0}</span>
        </div>
        <div className="rules-list">
          {rulesBoot || !rules ? (
            <div style={{ textAlign: 'center', color: 'var(--w3)', padding: '12px', fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px' }}>
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
              <StatusStrip recentEvents={recentEvents} />
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
    </>
  );
}

function KernelOverlay({ open, onClose }) {
  const canvasRef = useRef(null);
  const [counts, setCounts] = useState({ nodes: KERNEL_COUNTS.nodes, edges: KERNEL_COUNTS.edges });
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
        <div className="kf-stat">CYCLES <span>{KERNEL_COUNTS.cycles}</span></div>
        <div className="kf-stat">{counts.nodes} NODES · {counts.edges} EDGES</div>
        <div className="kf-stat">LANE 2 <span className="amber">OFFLINE</span></div>
      </div>
    </div>
  );
}
