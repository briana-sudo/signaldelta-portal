// Portal Rev 33 (2026-06-04): annualized-return reducer + per-day pace ladder.
//
// Client-side only. No new proxy query, no engine write — everything here is
// computed from the daily EquitySnapshotNode `series` already fetched for the
// equity curve (adaptEquityCurve over the whitelisted equity_curve_series).
// This mirrors the Rev-30/v1.21 PEAK/DRAWDOWN/TWR reducer pattern that lives
// inside EquityCurvePanel; the annualized value is lifted here so the banner
// stat strip (capital-base row) can consume it without a second fetch.
//
// Compliance (§15 anti-fraud):
//   - Feature 1 (ANNUALIZED) is the only figure framed as an actual annual
//     return, and ONLY after the 20-day confidence gate is satisfied. It is
//     the system's measured averaged figure, never a single-day extrapolation.
//   - Feature 3 (pace badge) measures a SINGLE DAY's pace, explicitly framed
//     as pace ("today's pace · if every day were like this"). It is never an
//     annual-return claim. When today's pace runs well past the elite bar we
//     surface ">60% pace" / "ELITE+" — never a raw extrapolated annual %.
//   - No named-fund claim anywhere. The 60% bar is an internal config value
//     with no attribution.

export const TRADING_DAYS_PER_YEAR = 252;

// Confidence gate: below this many daily return periods we render
// "building (N/20 days)" instead of a number. One day is not a rate, and
// geometric annualization of a tiny N explodes — the gate prevents that.
export const ANNUALIZED_MIN_DAYS = 20;

// Operator-tunable pace ladder (proposed Rev 33 defaults). `dailyMinPct` is the
// single-day percentage at/above which the tier applies; `approxAnnual` is
// informational only (≈ dailyMinPct × 252, simple). Highest tier first so the
// first match wins.
export const PACE_TIERS = [
  { key: 'elite',  dailyMinPct: 0.238, approxAnnual: 60, label: 'ELITE PACE', cls: 'elite'  },
  { key: 'strong', dailyMinPct: 0.119, approxAnnual: 30, label: 'STRONG',     cls: 'strong' },
  { key: 'solid',  dailyMinPct: 0.060, approxAnnual: 15, label: 'SOLID',      cls: 'solid'  },
];

// Annualized pace (today's % × 252) above which we treat the day as "far past
// elite" and refuse to surface a raw annual figure — it would read as a
// forecast. ">60% pace" / "ELITE+" is shown instead.
export const ELITE_PACE_FLOOR_PCT = 60;

function signedPct(pct) {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

// Feature 1 — TWR-annualized (geometric) over the daily equity series.
//   annualized = (equityLast / equityFirst) ^ (252 / N) − 1,  N = series.length − 1
// Reuses the Rev-30 TWR basis: TWR (zero-flow) = equityLast/equityFirst − 1, so
// annualizing it geometrically is consistent. Returns a shape the banner
// consumes directly:
//   gated → { gated:true,  display:"building (N/20 days)", annualizedPct:null, n }
//   ready → { gated:false, display:"+X.XX%",               annualizedPct,      n }
//   bad   → { gated:true,  display:"—",                    annualizedPct:null, n:0 }
export function computeAnnualized(series, minDays = ANNUALIZED_MIN_DAYS) {
  if (!Array.isArray(series) || series.length < 2) {
    const n = Array.isArray(series) && series.length ? series.length - 1 : 0;
    return { gated: true, display: `building (${n}/${minDays} days)`, annualizedPct: null, n };
  }
  const n = series.length - 1; // daily return periods
  const first = series[0]?.equity;
  const last = series[series.length - 1]?.equity;

  if (n < minDays) {
    return { gated: true, display: `building (${n}/${minDays} days)`, annualizedPct: null, n };
  }
  if (!(Number.isFinite(first) && first > 0 && Number.isFinite(last))) {
    return { gated: true, display: '—', annualizedPct: null, n };
  }
  const annualizedPct = (Math.pow(last / first, TRADING_DAYS_PER_YEAR / n) - 1) * 100;
  return { gated: false, display: signedPct(annualizedPct), annualizedPct, n };
}

// Feature 3 — per-day pace tier. NOT gated by N; reflects today's single-day
// pace only. `dailyPct` is today's percent move (e.g. +2.44). Returns:
//   { tier, label, cls, positive, beyondElite, paceDisplay, todayPace }
// label/cls are null-ish for the no-badge bands (positive / down → color only).
export function computePaceTier(dailyPct) {
  if (dailyPct == null || !Number.isFinite(dailyPct)) {
    return { tier: null, label: null, cls: null, positive: null, beyondElite: false, paceDisplay: null, todayPace: null };
  }
  const todayPace = dailyPct * TRADING_DAYS_PER_YEAR; // annualized pace — tier comparison only
  const positive = dailyPct >= 0;
  const matched = PACE_TIERS.find((t) => dailyPct >= t.dailyMinPct) || null;
  // Far-past-elite: never surface a raw annual figure (would read as forecast).
  const beyondElite = todayPace > ELITE_PACE_FLOOR_PCT;
  const paceDisplay = beyondElite ? '>60% pace' : null;
  return {
    tier: matched ? matched.key : (positive ? 'positive' : 'down'),
    label: matched ? matched.label : null,    // positive/down → no badge label
    cls: matched ? matched.cls : (positive ? 'positive' : 'down'),
    positive,
    beyondElite,
    paceDisplay,
    todayPace,
  };
}

// Today's single-day percent move, derived from the banner's broker-sourced
// Current Value (av) and Today P&L dollar (ap): baseline = av − ap, so
// dailyPct = ap / (av − ap) × 100. Ties the daily-% stat (Feature 2) and the
// pace badge (Feature 3) to the same Today P&L the operator already sees.
// Returns null when inputs are missing or the baseline is non-positive.
export function deriveTodayPct(av, ap) {
  if (av == null || ap == null) return null;
  const baseline = av - ap;
  if (!(Number.isFinite(baseline) && baseline > 0)) return null;
  return (ap / baseline) * 100;
}
