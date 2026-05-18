// ─────────────────────────────────────────────────────────────
// Static placeholder data — sourced verbatim from the locked
// HTML baselines for Step C layout. Step D replaces these with
// live Cypher reads against Neo4j on the 60-second poll.
// ─────────────────────────────────────────────────────────────

export const SCANNER_ASSETS = [
  { sym: 'BTC/USD',  track: 'MOD', fired: true  },
  { sym: 'ETH/USD',  track: 'CON', fired: false },
  { sym: 'SOL/USD',  track: 'AGG', fired: false },
  { sym: 'NVDA',     track: 'AGG', fired: true  },
  { sym: 'AAPL',     track: 'MOD', fired: false },
  { sym: 'TSLA',     track: 'CON', fired: false },
  { sym: 'SPY',      track: 'MOD', fired: false },
  { sym: 'QQQ',      track: 'AGG', fired: false },
  { sym: 'AVAX/USD', track: 'AGG', fired: false },
  { sym: 'LINK/USD', track: 'MOD', fired: false },
  { sym: 'MSFT',     track: 'CON', fired: false },
  { sym: 'AMZN',     track: 'MOD', fired: false },
  { sym: 'MATIC/USD',track: 'AGG', fired: false },
  { sym: 'AMD',      track: 'MOD', fired: false },
];

export const POSITIONS = [
  { asset: 'BTC/USD', track: 'mod', tl: 'MOD', conv: 'max', cl: 'MAX',
    entry: 67420.5, cur: 68104.2, stop: 66800, target: 69200,
    pnl: 683.7, pnlPct: 1.01, prog: 55, hold: '2h 14m' },
  { asset: 'NVDA', track: 'agg', tl: 'AGG', conv: 'hi', cl: 'HIGH',
    entry: 142.3, cur: 145.8, stop: 139.5, target: 148.2,
    pnl: 350, pnlPct: 2.46, prog: 60, hold: '47m' },
  { asset: 'ETH/USD', track: 'con', tl: 'CON', conv: 'std', cl: 'STD',
    entry: 3280, cur: 3241.5, stop: 3210, target: 3380,
    pnl: -38.5, pnlPct: -1.17, prog: 45, hold: '1h 03m' },
];

export const WEEKLY_WATERFALL = [
  { w: 'W1', p: 3.2, pos: true,  cur: false },
  { w: 'W2', p: 5.1, pos: true,  cur: false },
  { w: 'W3', p: -1.8, pos: false, cur: false },
  { w: 'W4', p: 4.7, pos: true,  cur: false },
  { w: 'W5', p: 6.2, pos: true,  cur: false },
  { w: 'W6', p: 2.1, pos: true,  cur: true  },
];

export const SEED_EVENTS = [
  { cls: 'gate',      icon: '◆', text: 'GATE PASSED · weekly Sharpe 2.31 above 1.0 floor', val: null, valcls: '', t: '14:45' },
  { cls: 'sync',      icon: '◉', text: 'DATA SYNC · 247 trades · positions reconciled',     val: null, valcls: '', t: '14:30' },
  { cls: 'signal',    icon: '◈', text: 'RSI DIVERGENCE · BTC/USD · 28.4 oversold',           val: null, valcls: '', t: '14:22' },
  { cls: 'open',      icon: '▶', text: 'TRADE OPEN · ETH/USD · CON track · STD conviction', val: null, valcls: '', t: '13:45' },
  { cls: 'close-loss',icon: '✗', text: 'TRADE CLOSED · TSLA · stop hit',                     val: '-1.4%', valcls: 'r', t: '12:18' },
  { cls: 'open',      icon: '▶', text: 'TRADE OPEN · NVDA · AGG track · HIGH conviction',   val: null, valcls: '', t: '11:02' },
  { cls: 'close-win', icon: '✓', text: 'TRADE CLOSED · AAPL · target hit',                   val: '+2.8%', valcls: 'g', t: '10:47' },
  { cls: 'signal',    icon: '◈', text: 'COMPOSITE THRESHOLD HIT · BTC/USD · score 87 · MAX tier confirmed', val: null, valcls: '', t: '09:30' },
  { cls: 'open',      icon: '▶', text: 'TRADE OPEN · BTC/USD · MOD track · MAX conviction', val: null, valcls: '', t: '09:31' },
  { cls: 'close-win', icon: '✓', text: 'TRADE CLOSED · SOL/USD · target hit',                val: '+6.2%', valcls: 'g', t: '09:14' },
  { cls: 'rule',      icon: '§', text: 'RULE WRITTEN · Section A · Loosen MOD crypto Choppy threshold', val: null, valcls: '', t: '06:01' },
  { cls: 'loop',      icon: '⟳', text: 'LEARNING LOOP CYCLE 6 · 28 rules · SR→2.31',         val: null, valcls: '', t: '06:00' },
];

export const RETURNS_MATRIX = {
  // rows = asset_class, columns = track. Σ row/col computed independently
  // (per reconciliation D2). Static values below are illustrative.
  rows: [
    { label: 'Crypto', cells: [
      { wp: 71, sr: 2.10, ret: 8.2 },
      { wp: 66, sr: 2.45, ret: 11.4 },
      { wp: 62, sr: 2.71, ret: 14.8 },
    ], sigma: { ret: 11.5, sr: 2.42 } },
    { label: 'L-Cap', cells: [
      { wp: 73, sr: 1.89, ret: 4.1 },
      { wp: 69, sr: 2.18, ret: 5.7 },
      { wp: 64, sr: 2.34, ret: 7.2 },
    ], sigma: { ret: 5.7, sr: 2.14 } },
    { label: 'Growth', cells: [
      { wp: 68, sr: 1.74, ret: 3.4 },
      { wp: 64, sr: 2.02, ret: 5.1 },
      { wp: 59, sr: 2.27, ret: 8.9 },
    ], sigma: { ret: 5.8, sr: 2.01 } },
  ],
  colSigma: [
    { ret: 5.2,  sr: 1.91 },
    { ret: 7.4,  sr: 2.22 },
    { ret: 10.3, sr: 2.44 },
  ],
  total: { ret: 18.47 },
};

export const RULES_ADDED = [
  { sec: 'A', day: 'TUE', text: ['Loosen ', { b: 'MOD' }, ' threshold · crypto Choppy → 65 to 63'] },
  { sec: 'B', day: 'TUE', text: ['Prohibit ', { b: 'AGG' }, ' stocks during EARNINGS impact=HIGH'] },
  { sec: 'A', day: 'WED', text: ['Prioritize ', { b: 'MAX' }, '-tier NVDA setups · cohort SR 2.6'] },
  { sec: 'C', day: 'THU', text: ['Pause candidate · VWAP reject in Trending Up regime'] },
  { sec: 'B', day: 'FRI', text: ['Prohibit ', { b: 'CON' }, ' during LOW time bucket on weekends'] },
];

export const RULES_FOOT = { thisWeek: 5, cycle: 6, total: 28 };

export const TICKER = [
  { s: 'BTC/USD',  p: '68,104', c: '+1.01%', d: 'u' },
  { s: 'ETH/USD',  p: '3,241',  c: '-1.17%', d: 'd' },
  { s: 'SOL/USD',  p: '182.40', c: '+3.22%', d: 'u' },
  { s: 'NVDA',     p: '145.80', c: '+2.46%', d: 'u' },
  { s: 'AAPL',     p: '214.30', c: '+0.82%', d: 'u' },
  { s: 'TSLA',     p: '271.50', c: '-0.44%', d: 'd' },
  { s: 'SPY',      p: '548.20', c: '+0.31%', d: 'u' },
  { s: 'QQQ',      p: '471.80', c: '+0.58%', d: 'u' },
  { s: 'AVAX/USD', p: '38.40',  c: '+5.10%', d: 'u' },
  { s: 'LINK/USD', p: '14.82',  c: '+2.80%', d: 'u' },
  { s: 'MSFT',     p: '424.70', c: '+1.14%', d: 'u' },
  { s: 'AMD',      p: '168.40', c: '+1.88%', d: 'u' },
];

export const ACCOUNT_BAR = {
  capitalBase: 10000,
  currentValue: 11847.32,
  totalReturnPct: 18.47,
  todayPnl: 142.18,
  trades: 247,
  open: 3,
};

// TradingConfigNode.current_phase — Phase 1.1 invariant per v3 §15.
// Source of truth when Step D activates: polled accountBar.current_phase
// from useNeo4jPoll. Until then, hardcoded constant so the Section E.1
// badge selector has a value to read.
export const CURRENT_PHASE = 'Paper';

export const EQUITY_CURVE = {
  start: 10000,
  end: 11847,
  peak: 12114,
  drawdownPct: -2.20,
  twrPct: 18.47,
  N: 60,
};

// Kernel placeholder counts shown in PC kernel overlay + mobile kernel chip.
// Layout shell only; Three.js scene wired in Step F.
export const KERNEL_COUNTS = {
  nodes: 93,
  edges: 76,
  cycles: 6,
  phase: 1,
};

// Trade demo sequence — Step G timing per locked baseline.
// PC fires modal overlay + event feed; mobile fires event feed only (Section G).
export const TRADE_DEMO_SEQUENCE = [
  {
    delay: 5000,
    overlay: {
      type: 'open',
      asset: 'SOL/USD',
      entry: 182.4,
      composite: 88,
      conviction: 'MAX TIER',
      convColor: 'var(--green)',
      convBg: 'var(--green2)',
      inds: [
        { name: 'RSI-14', val: '28.4 OVERSOLD', positive: true },
        { name: 'EMA-20', val: 'BULLISH CROSS', positive: true },
        { name: 'VWAP',   val: 'PRICE ABOVE',  positive: true },
        { name: 'MACD',   val: 'SIGNAL CROSS', positive: true },
      ],
    },
    event: { cls: 'open', icon: '▶', text: 'TRADE OPEN · SOL/USD · AGG track · MAX conviction', val: null, valcls: '' },
  },
  {
    delay: 18000,
    overlay: {
      type: 'close-win',
      asset: 'BTC/USD',
      exit: 69182,
      hold: '3h 22m',
      pnl: 876.5,
      pnlPct: 1.30,
      conviction: 'MAX TIER',
      convColor: 'var(--green)',
      convBg: 'var(--green2)',
    },
    event: { cls: 'close-win', icon: '✓', text: 'TRADE CLOSED · BTC/USD · target hit', val: '+1.30%', valcls: 'g' },
  },
];

// Logo SVG markup (identical in both baselines).
// Kept here so PCApp and MobileApp render the same mark.
export const LOGO_SVG = `<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="logoBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0A1628;stop-opacity:1"/>
      <stop offset="100%" style="stop-color:#1A3A5C;stop-opacity:1"/>
    </linearGradient>
    <linearGradient id="logoSignal" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#00C2FF;stop-opacity:0.3"/>
      <stop offset="50%" style="stop-color:#00C2FF;stop-opacity:1"/>
      <stop offset="100%" style="stop-color:#00C2FF;stop-opacity:0.3"/>
    </linearGradient>
    <filter id="logoGlow">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <circle cx="200" cy="200" r="196" fill="url(#logoBg)"/>
  <circle cx="200" cy="200" r="196" fill="none" stroke="#00C2FF" stroke-width="2" opacity="0.4"/>
  <polyline points="60,200 90,200 110,160 130,240 150,175 170,225 190,155 210,245 230,175 250,225 270,200 310,200 340,200"
    fill="none" stroke="url(#logoSignal)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" filter="url(#logoGlow)"/>
  <polygon points="268,148 316,232 220,232" fill="none" stroke="#00C2FF" stroke-width="3.5" stroke-linejoin="round" opacity="0.9" filter="url(#logoGlow)"/>
  <polygon points="268,148 316,232 220,232" fill="#00C2FF" opacity="0.08"/>
</svg>`;
