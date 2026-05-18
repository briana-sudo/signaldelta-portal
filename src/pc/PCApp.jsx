import { useEffect, useMemo, useRef, useState } from 'react';
import { useClock, usePollCountdown } from '../lib/useClock.js';
import {
  SCANNER_ASSETS, POSITIONS, WEEKLY_WATERFALL, SEED_EVENTS,
  RETURNS_MATRIX, RULES_ADDED, RULES_FOOT, TICKER, ACCOUNT_BAR,
  KERNEL_COUNTS, LOGO_SVG,
} from '../lib/placeholders.js';
import { buildEquityCurveSvg } from '../lib/equityCurve.js';

// Mode toggle: hardcoded TRAINING default per Section E of reconciliation v1.1.
// Phase 4 wires systemState-driven default function + localStorage persistence.
const MODES = ['live', 'training', 'combined'];
const DEFAULT_MODE = 'training';

const scoreCls = (s) => (s >= 65 ? 'hi' : s >= 40 ? 'mi' : 'lo');
const barClr = (s) => {
  if (s >= 65) return 'var(--green)';
  if (s >= 40) return 'var(--cyan)';
  if (s >= 20) return 'var(--amber)';
  return 'var(--w3)';
};

export default function PCApp() {
  const clock = useClock();
  const { secs: pollSecs, pulse: pollPulse } = usePollCountdown();
  const [mode, setMode] = useState(DEFAULT_MODE);

  return (
    <div className="pc-shell">
      <Header clock={clock} mode={mode} setMode={setMode} />
      <AccountBar pollSecs={pollSecs} pollPulse={pollPulse} />
      <Main />
      <Ticker />
    </div>
  );
}

function Header({ clock, mode, setMode }) {
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
        <div className="pill"><div className="dot dot-green" />SYSTEM ACTIVE</div>
        <div className="pill"><div className="dot dot-cyan" />PAPER TRADING</div>
        <div className="sim-tag">SIMULATED PERFORMANCE</div>
        <div className="mode-toggle">
          {MODES.map((m) => (
            <div
              key={m}
              className={'mode-pill' + (mode === m ? ' active' : '')}
              onClick={() => setMode(m)}
            >{m.toUpperCase()}</div>
          ))}
        </div>
      </div>
      <div className="clock">{clock} UTC</div>
    </div>
  );
}

function AccountBar({ pollSecs, pollPulse }) {
  const a = ACCOUNT_BAR;
  return (
    <div className="acct">
      <div className="aitem"><span className="alabel">Capital Base</span><span className="aval">${a.capitalBase.toLocaleString()}</span></div>
      <div className="aitem"><span className="alabel">Current Value</span><span className="aval g">${a.currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
      <div className="aitem"><span className="alabel">Total Return</span><span className="aval g">+{a.totalReturnPct.toFixed(2)}%</span></div>
      <div className="aitem"><span className="alabel">Today P&amp;L</span><span className="aval g">+${a.todayPnl.toFixed(2)}</span></div>
      <div className="aitem"><span className="alabel">Trades</span><span className="aval c">{a.trades}</span></div>
      <div className="aitem"><span className="alabel">Open</span><span className="aval c">{a.open}</span></div>
      <div className="acct-divider" />
      <MiniWaterfall />
      <div className="acct-divider" />
      <div className="poll-ind">
        <div className={'poll-ring' + (pollPulse ? ' active' : '')}><div className="poll-fill" /></div>
        <span>SYNC: {pollSecs}s</span>
      </div>
    </div>
  );
}

function MiniWaterfall() {
  const wrapRef = useRef(null);
  const [heights, setHeights] = useState(() => WEEKLY_WATERFALL.map(() => 2));
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const barH = wrap.clientHeight - 20;
    const maxP = 7;
    WEEKLY_WATERFALL.forEach((w, i) => {
      setTimeout(() => {
        setHeights((prev) => {
          const next = [...prev];
          next[i] = Math.max(4, (Math.abs(w.p) / maxP) * barH);
          return next;
        });
      }, 80 + i * 100);
    });
  }, []);
  return (
    <div className="acct-wf" ref={wrapRef}>
      <div className="acct-wf-baseline" />
      {WEEKLY_WATERFALL.map((w, i) => (
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

function Main() {
  return (
    <div className="main">
      <div className="col-scanner">
        <ScannerPanel />
      </div>
      <div className="col-center">
        <PositionsPanel />
        <EquityCurvePanel />
        <EventFeedPanel />
      </div>
      <div className="col-metrics">
        <MetricsPanel />
        <KernelPanel />
      </div>
      <div className="col-extra">
        <ReturnsMatrixPanel />
        <RulesAddedPanel />
      </div>
    </div>
  );
}

function ScannerPanel() {
  const [rows, setRows] = useState(() =>
    SCANNER_ASSETS.map((a) => ({ ...a, score: 0, bar: 0, evaluating: false })),
  );
  useEffect(() => {
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
        if (curScore >= target) {
          clearInterval(stepTimer);
          stepTimer = null;
        }
      }, 35);
    }, 500);
    return () => {
      clearInterval(tick);
      if (stepTimer) clearInterval(stepTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rowClass = (a) => {
    if (a.fired) return 'srow fired';
    if (a.evaluating) return 'srow eval';
    if (a.score >= 65) return 'srow thresh';
    return 'srow';
  };

  return (
    <div className="panel p-scanner">
      <div className="ptitle">
        <span><span className="ptitle-bar" />SIGNAL SCANNER</span>
        <span className="ptitle-r">847 ASSETS</span>
      </div>
      <div className="scanner-list">
        {rows.map((a, i) => (
          <div className={rowClass(a)} key={a.sym}>
            <div>
              <div className="sasset">{a.sym}</div>
              <div className="strack">{a.track}</div>
            </div>
            <div>
              <div className="sbar-bg">
                <div className="sbar-fill" style={{ width: a.bar + '%', background: barClr(a.score) }} />
              </div>
            </div>
            <div className={'sscore ' + scoreCls(a.score)}>{a.score || '—'}</div>
            {a.fired && <div className="fired-badge">FIRED</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function PositionsPanel() {
  return (
    <div className="panel p-positions">
      <div className="ptitle">
        <span><span className="ptitle-bar" />OPEN POSITIONS</span>
        <span className="ptitle-r">3 ACTIVE · P&amp;L LIVE</span>
      </div>
      <table className="pos-table">
        <thead>
          <tr>
            <th>Asset</th><th>Track</th><th>Conv</th>
            <th>Entry</th><th>Current</th>
            <th>Stop</th><th>Target</th>
            <th>Progress</th><th>P&amp;L</th><th>Hold</th>
          </tr>
        </thead>
        <tbody>
          {POSITIONS.map((p) => {
            const pos = p.pnl >= 0;
            const clr = pos ? 'var(--green)' : 'var(--red)';
            return (
              <tr key={p.asset}>
                <td><span className="passet">{p.asset}</span></td>
                <td><span className={'ptrack ' + p.track}>{p.tl}</span></td>
                <td><span className={'pconv ' + p.conv}>{p.cl}</span></td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--w2)' }}>{p.entry.toLocaleString()}</td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--white)' }}>{p.cur.toLocaleString()}</td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--red)' }}>{p.stop.toLocaleString()}</td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--green)' }}>{p.target.toLocaleString()}</td>
                <td className="prog-wrap">
                  <div className="prog-bg"><div className="prog-fill" style={{ width: p.prog + '%', background: clr }} /></div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--w3)', marginTop: '2px' }}>{p.prog}% TO TARGET</div>
                </td>
                <td>
                  <div className="ppnl" style={{ color: clr }}>{pos ? '+' : ''}${Math.abs(p.pnl).toFixed(2)}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: clr }}>{pos ? '+' : ''}{p.pnlPct.toFixed(2)}%</div>
                </td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--w3)' }}>{p.hold}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EquityCurvePanel() {
  const svg = useMemo(() => buildEquityCurveSvg({ width: 600, height: 80 }), []);
  return (
    <div className="panel eq-panel">
      <div className="eq-head">
        <span className="eq-title"><span className="ptitle-bar" />EQUITY CURVE</span>
        <span className="eq-stats">
          <span className="lbl">PEAK</span><span className="g">$12,114</span>
          <span className="lbl">DRAWDOWN</span><span className="r">-2.20%</span>
          <span className="lbl">TWR</span><span>+18.47%</span>
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
          <line x1="0" y1={svg.baseY} x2={svg.width} y2={svg.baseY}
            stroke="rgba(255,171,0,0.4)" strokeWidth="0.6" strokeDasharray="3,3" />
          <text x="4" y={svg.baseY - 3} fontFamily="Share Tech Mono" fontSize="6" fill="var(--amber)" opacity="0.6">$10K BASE</text>
          <path d={svg.fillD} fill="url(#eqGradPos)" stroke="none" />
          <path d={svg.d} fill="none" stroke="var(--green)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={svg.endX} cy={svg.endY} r="2.5" fill="var(--green)">
            <animate attributeName="r" values="2.5;4;2.5" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx={svg.peakX} cy={svg.peakY} r="2" fill="var(--cyan)" opacity="0.8" />
        </svg>
      </div>
    </div>
  );
}

function EventFeedPanel() {
  return (
    <div className="panel p-events">
      <div className="ptitle">
        <span><span className="ptitle-bar" />SYSTEM EVENT FEED</span>
        <span className="ptitle-r">{SEED_EVENTS.length} EVENTS TODAY</span>
      </div>
      <div className="event-feed">
        {SEED_EVENTS.slice(0, 8).map((e, i) => (
          <div className={'ev ' + e.cls} key={i}>
            <span className="ev-icon">{e.icon}</span>
            <span className="ev-time">{e.t}</span>
            <span className="ev-text">{e.text}</span>
            {e.val && <span className={'ev-val ' + e.valcls}>{e.val}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricsPanel() {
  return (
    <div className="panel p-waterfall">
      <div className="ptitle"><span><span className="ptitle-bar" />SYSTEM METRICS</span></div>

      {/* WIN RATE */}
      <div className="mc">
        <div className="mc-left">
          <div className="mc-label">WIN RATE</div>
          <div className="mc-value g">68.4%</div>
          <div className="mc-sub">169 wins / 247 trades</div>
        </div>
        <svg className="mc-arc" width="56" height="34" viewBox="0 0 56 34" overflow="visible">
          <path d="M4,30 A24,24 0 0,1 52,30" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" strokeLinecap="round" />
          <path d="M4,30 A24,24 0 0,1 52,30" fill="none" stroke="var(--green)" strokeWidth="5" strokeLinecap="round"
            strokeDasharray="75.4" strokeDashoffset="24.3" opacity="0.9" />
          <text x="28" y="22" textAnchor="middle" fontFamily="Share Tech Mono" fontSize="8" fill="var(--green)">68.4%</text>
        </svg>
      </div>

      {/* SHARPE */}
      <div className="mc">
        <div className="mc-left">
          <div className="mc-label">SHARPE RATIO</div>
          <div className="mc-value c">2.31</div>
          <div className="mc-sub">target ≥ 1.0 · phase 3 gate</div>
        </div>
        <svg className="mc-arc" width="56" height="34" viewBox="0 0 56 34" overflow="visible">
          <path d="M4,30 A24,24 0 0,1 52,30" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" strokeLinecap="round" />
          <path d="M4,30 A24,24 0 0,1 52,30" fill="none" stroke="var(--cyan)" strokeWidth="5" strokeLinecap="round"
            strokeDasharray="75.4" strokeDashoffset="9" opacity="0.9" />
          <text x="28" y="22" textAnchor="middle" fontFamily="Share Tech Mono" fontSize="8" fill="var(--cyan)">2.31</text>
        </svg>
      </div>

      {/* LANE 2 OFFLINE (Phase 1) */}
      <div className="mc mc-delta offline">
        <div className="mc-left">
          <div className="mc-label" style={{ color: 'var(--amber)', letterSpacing: '3px' }}>LANE 2 Δ DELTA</div>
          <div className="mc-value dim" style={{ fontSize: '18px', color: 'var(--amber)' }}>OFFLINE</div>
          <div className="mc-sub" style={{ color: 'var(--amber)', opacity: 0.75 }}>lane2_enabled = false · scaffold mode</div>
          <div className="mc-sub" style={{ color: 'var(--w3)', marginTop: '3px' }}>0 / 200 PREDICTIONS RESOLVED</div>
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
          <div className="mc-value" style={{ color: 'var(--amber)', fontSize: '18px' }}>MAX 41%</div>
          <div className="mc-sub">High 33% · Std 26% · sizing ×1.5 / ×1.25 / ×1.0</div>
        </div>
        <svg width="56" height="56" viewBox="0 0 56 56" style={{ flexShrink: 0 }}>
          <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
          <circle cx="28" cy="28" r="22" fill="none" stroke="var(--w3)" strokeWidth="7"
            strokeDasharray="35.9 102.1" strokeDashoffset="0" transform="rotate(-90 28 28)" />
          <circle cx="28" cy="28" r="22" fill="none" stroke="var(--cyan)" strokeWidth="7"
            strokeDasharray="45.6 92.4" strokeDashoffset="-35.9" transform="rotate(-90 28 28)" />
          <circle cx="28" cy="28" r="22" fill="none" stroke="var(--amber)" strokeWidth="7"
            strokeDasharray="56.5 81.5" strokeDashoffset="-81.5" transform="rotate(-90 28 28)" />
          <text x="28" y="31" textAnchor="middle" fontFamily="Share Tech Mono" fontSize="8" fill="var(--amber)">41%</text>
        </svg>
      </div>
    </div>
  );
}

function KernelPanel() {
  // Three.js scene wired in Step F. Step C renders the static overlays + empty canvas.
  return (
    <div className="panel p-kernel">
      <canvas id="kernel-canvas" />
      <div className="kernel-overlay">
        <span className="kernel-title">KNOWLEDGE KERNELS</span>
        <span className="kernel-count">{KERNEL_COUNTS.nodes} NODES · {KERNEL_COUNTS.edges} EDGES</span>
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

function ReturnsMatrixPanel() {
  const m = RETURNS_MATRIX;
  return (
    <div className="panel p-returns">
      <div className="ptitle">
        <span><span className="ptitle-bar" />RETURNS BY DOMAIN</span>
        <span className="ptitle-r">3×3</span>
      </div>
      <div className="matrix">
        <div className="matrix-grid">
          <div />
          <div className="matrix-h">CON</div>
          <div className="matrix-h">MOD</div>
          <div className="matrix-h">AGG</div>
          <div className="matrix-h sigma">Σ</div>
          {m.rows.map((row) => (
            <RowRender key={row.label} row={row} />
          ))}
          {/* aggregate row */}
          <div className="matrix-rh sigma">Σ</div>
          {m.colSigma.map((c, i) => (
            <div className="matrix-cell sigma-row" key={i}>
              <div className="mc-r g big">+{c.ret.toFixed(1)}%</div>
              <div className="mc-s">SR <span className="c">{c.sr.toFixed(2)}</span></div>
            </div>
          ))}
          <div className="matrix-cell sigma-corner">
            <div className="mc-r g big">+{m.total.ret.toFixed(2)}%</div>
            <div className="mc-s c">TOTAL</div>
          </div>
        </div>
      </div>
    </div>
  );
}
function RowRender({ row }) {
  return (
    <>
      <div className="matrix-rh">{row.label}</div>
      {row.cells.map((c, i) => (
        <div className="matrix-cell" key={i}>
          <div className={'mc-w' + (c.wp >= 60 ? ' g' : '')}>{c.wp}%</div>
          <div className="mc-s">SR <span className="c">{c.sr.toFixed(2)}</span></div>
          <div className="mc-r g">+{c.ret.toFixed(1)}%</div>
        </div>
      ))}
      <div className="matrix-cell sigma-col">
        <div className="mc-r g big">+{row.sigma.ret.toFixed(1)}%</div>
        <div className="mc-s">SR <span className="c">{row.sigma.sr.toFixed(2)}</span></div>
      </div>
    </>
  );
}

function RulesAddedPanel() {
  return (
    <div className="panel p-rules">
      <div className="ptitle">
        <span><span className="ptitle-bar" />RULES ADDED THIS WEEK</span>
        <span className="ptitle-r">CYCLE {RULES_FOOT.cycle}</span>
      </div>
      <div className="rules-list">
        {RULES_ADDED.map((r, i) => (
          <div className={'rule-row sec-' + r.sec.toLowerCase()} key={i}>
            <div className={'rule-badge sec-' + r.sec.toLowerCase()}>{r.sec}</div>
            <div className="rule-day">{r.day}</div>
            <div className="rule-text">{r.text.map((part, j) =>
              typeof part === 'string' ? part : <strong key={j}>{part.b}</strong>
            )}</div>
          </div>
        ))}
        <div className="rules-foot">
          {RULES_FOOT.thisWeek} RULES · CYCLE <span>{RULES_FOOT.cycle}</span> · TOTAL <span>{RULES_FOOT.total}</span>
        </div>
      </div>
    </div>
  );
}

function Ticker() {
  const all = [...TICKER, ...TICKER];
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
