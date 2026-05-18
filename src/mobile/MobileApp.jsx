import { useEffect, useMemo, useRef, useState } from 'react';
import { useClock, usePollCountdown } from '../lib/useClock.js';
import { useAccountDrift, usePositionDrift } from '../lib/useDrift.js';
import { shouldRenderBootstrap } from '../lib/usePhaseFilter.js';
import {
  SCANNER_ASSETS, WEEKLY_WATERFALL, KERNEL_COUNTS, LOGO_SVG, CURRENT_PHASE,
} from '../lib/placeholders.js';
import {
  adaptAccountBar, adaptWeeklyWaterfall, adaptPositions, adaptEvents,
  adaptWinRate, adaptSharpe, adaptConviction,
  adaptEquityCurve, adaptEquityHeader,
  adaptRulesThisWeek, adaptRulesFoot,
} from '../lib/dataAdapter.js';
import { buildEquityCurveSvgFromSeries } from '../lib/equityCurve.js';
import { initKernelScene } from '../lib/kernelScene.js';
import { computeBadge } from '../lib/performanceBadge.js';

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

  return (
    <div className="mobile-shell">
      <MobileStatusBanner error={error} errors={errors} hasAnyData={hasAnyData} />
      <MobileHeader clock={clock} mode={mode} currentPhase={currentPhase} />
      <ModeToggle mode={mode} setMode={setMode} />
      <MobileAccountBar
        pollSecs={pollSecs}
        pollPulse={pollPulse}
        mode={mode}
        liveAccountBar={liveAccountBar}
      />
      <div className="tab-wrap">
        <div className={'tab-content' + (tab === 'desk' ? ' active' : '')}>
          <DeskTab mode={mode} data={data} eventsCount={liveEvents?.length ?? 0} />
        </div>
        <div className={'tab-content' + (tab === 'scan' ? ' active' : '')}>
          <ScanTab mode={mode} />
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

function MobileHeader({ clock, mode, currentPhase }) {
  const { text, dot } = useMemo(() => computeBadge(currentPhase, mode), [mode, currentPhase]);
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
        <div className={'status-dot dot-' + dot} title={text} />
        <div className="clock">
          <span className="clock-et">{clock.etCompact}</span>
          <span className="clock-sep">·</span>
          <span className="clock-utc">{clock.utcCompact}</span>
        </div>
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

function MobileAccountBar({ pollSecs, pollPulse, mode, liveAccountBar }) {
  const bootstrap = shouldRenderBootstrap(mode) || !liveAccountBar;
  const capitalBase = liveAccountBar?.capitalBase ?? 10000;
  const { av, ap } = useAccountDrift({
    initialValue: liveAccountBar?.currentValue ?? capitalBase,
    initialPnl: liveAccountBar?.todayPnl ?? 0,
    enabled: !bootstrap,
  });
  const totalReturnPct = capitalBase ? ((av - capitalBase) / capitalBase) * 100 : 0;
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
      <div className="sync-edge">
        <div className="poll-ind">
          <div className={'poll-ring' + (pollPulse ? ' active' : '')}><div className="poll-fill" /></div>
          <span>{pollSecs}s</span>
        </div>
      </div>
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

function DeskTab({ mode, data, eventsCount }) {
  const livePositions = adaptPositions(data);
  const liveWaterfall = adaptWeeklyWaterfall(data);
  const liveAccountBar = adaptAccountBar(data);
  const posBoot = shouldRenderBootstrap(mode) || !livePositions;
  const wfBoot = shouldRenderBootstrap(mode) || !liveWaterfall;
  const positions = livePositions ?? [];
  const offsets = usePositionDrift(positions, { enabled: !posBoot });

  return (
    <>
      <div className="panel">
        <div className="ptitle">
          <span><span className="ptitle-bar" />OPEN POSITIONS</span>
          <span className="ptitle-r">{posBoot ? 'AWAITING LIVE TRADES' : `${positions.length} ACTIVE · P&L LIVE`}</span>
        </div>
        {posBoot ? (
          <div style={{ textAlign: 'center', color: 'var(--w3)', padding: '20px', fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px' }}>
            — AWAITING LIVE TRADES —
          </div>
        ) : positions.map((p, i) => {
          const offset = offsets[i] ?? 0;
          const pv = p.pnl + offset;
          const pp = p.pnlPct + (p.entry ? (offset / p.entry) * 100 : 0);
          const cur = p.cur + offset * 0.01;
          const range = p.target - p.entry;
          const progPct = range ? Math.max(0, Math.min(100, ((cur - p.entry) / range) * 100)) : 0;
          const pos = pv >= 0;
          const clr = pos ? 'var(--green)' : 'var(--red)';
          return (
            <div className="pos-card" key={p.requestId || p.asset}>
              <div className="pc-row1">
                <div className="pc-asset">{p.asset}</div>
                <div className="pc-pills">
                  <span className={'ptrack ' + p.track}>{p.tl}</span>
                  <span className={'pconv ' + p.conv}>{p.cl}</span>
                </div>
                <div className="pc-spacer" />
                <div className="pc-pnl-wrap">
                  <div className="pc-pnl" style={{ color: clr }}>{pos ? '+' : ''}${Math.abs(pv).toFixed(2)}</div>
                  <div className="pc-pnl-pct" style={{ color: clr }}>{pos ? '+' : ''}{pp.toFixed(2)}%</div>
                </div>
              </div>
              <div className="pc-row2">
                <div className="pc-cell"><div className="pc-cell-lbl">Entry</div><div className="pc-cell-val">{p.entry.toLocaleString()}</div></div>
                <div className="pc-cell"><div className="pc-cell-lbl">Current</div><div className="pc-cell-val">{cur.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div></div>
                <div className="pc-cell"><div className="pc-cell-lbl">Stop</div><div className="pc-cell-val r">{p.stop.toLocaleString()}</div></div>
                <div className="pc-cell"><div className="pc-cell-lbl">Target</div><div className="pc-cell-val g">{p.target.toLocaleString()}</div></div>
              </div>
              <div className="pc-row3">
                <div className="pc-prog-wrap">
                  <div className="pc-prog-bg"><div className="pc-prog-fill" style={{ width: progPct + '%', background: clr }} /></div>
                  <div className="pc-prog-lbl">{progPct.toFixed(0)}% TO TARGET</div>
                </div>
                <div className="pc-hold">{p.hold}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel eq-panel">
        <MobileEquity mode={mode} data={data} />
      </div>

      <div className="stats-chip">
        <div className="sc-item"><div className="sc-val">{posBoot ? 0 : (liveAccountBar?.open ?? 0)}</div><div className="sc-lbl">Open</div></div>
        <div className="sc-item"><div className="sc-val">{posBoot ? 0 : (liveAccountBar?.trades ?? 0)}</div><div className="sc-lbl">Trades</div></div>
        <div className="sc-item"><div className="sc-val">{posBoot ? 0 : eventsCount}</div><div className="sc-lbl">Events Today</div></div>
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

function ScanTab({ mode }) {
  const bootstrap = shouldRenderBootstrap(mode);
  const [rows, setRows] = useState(() =>
    SCANNER_ASSETS.map((a) => ({ ...a, score: 0, bar: 0, evaluating: false })),
  );
  useEffect(() => {
    if (bootstrap) return;
    let stepTimer = null;
    const tick = setInterval(() => {
      const i = Math.floor(Math.random() * rows.length);
      setRows((cur) => {
        if (cur[i].fired) return cur;
        const next = [...cur];
        next[i] = { ...next[i], evaluating: true };
        return next;
      });
      const target = Math.floor(Math.random() * 95) + 5;
      let curScore = 0;
      stepTimer = setInterval(() => {
        curScore = Math.min(curScore + Math.floor(Math.random() * 7) + 3, target);
        setRows((cur) => {
          const next = [...cur];
          if (next[i].fired) return cur;
          next[i] = { ...next[i], score: curScore, bar: curScore };
          if (curScore >= target) next[i] = { ...next[i], evaluating: false };
          return next;
        });
        if (curScore >= target) { clearInterval(stepTimer); stepTimer = null; }
      }, 35);
    }, 500);
    return () => {
      clearInterval(tick);
      if (stepTimer) clearInterval(stepTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap]);
  const rowClass = (a) => {
    if (bootstrap) return 'srow';
    if (a.fired) return 'srow fired';
    if (a.evaluating) return 'srow eval';
    if (a.score >= 65) return 'srow thresh';
    return 'srow';
  };
  return (
    <div className="panel">
      <div className="ptitle">
        <span><span className="ptitle-bar" />SIGNAL SCANNER</span>
        <span className="ptitle-r">{SCANNER_ASSETS.length} ASSETS</span>
      </div>
      <div className="scanner-list">
        {rows.map((a) => (
          <div className={rowClass(a)} key={a.sym}>
            <div>
              <div className="sasset">{a.sym}</div>
              <div className="strack">{a.track}</div>
            </div>
            <div>
              <div className="sbar-bg">
                <div className="sbar-fill" style={{ width: (bootstrap ? 0 : a.bar) + '%', background: barClr(bootstrap ? 0 : a.score) }} />
              </div>
            </div>
            <div className={'sscore ' + scoreCls(bootstrap ? 0 : a.score)}>{bootstrap || !a.score ? '—' : a.score}</div>
            {!bootstrap && a.fired && <div className="fired-badge">FIRED</div>}
          </div>
        ))}
      </div>
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

      <div className="panel">
        <div className="ptitle">
          <span><span className="ptitle-bar" />SYSTEM EVENT FEED</span>
          <span className="ptitle-r">{eventsBoot ? '0 EVENTS' : `${events.length} EVENTS`}</span>
        </div>
        <div className="event-feed">
          {eventsBoot ? (
            <div style={{ textAlign: 'center', color: 'var(--w3)', padding: '12px', fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px' }}>— AWAITING LIVE EVENTS —</div>
          ) : events.map((e) => (
            <div className={'ev ' + e.cls} key={e.eventId || (e.t + e.text)}>
              <span className="ev-icon">{e.icon}</span>
              <span className="ev-time">{e.t}</span>
              <span className="ev-text">{e.text}</span>
              {e.val && <span className={'ev-val ' + e.valcls}>{e.val}</span>}
            </div>
          ))}
        </div>
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
