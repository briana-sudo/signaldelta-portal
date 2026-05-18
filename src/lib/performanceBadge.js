// ─────────────────────────────────────────────────────────────
// SIMULATED PERFORMANCE badge selector — reconciliation Section E.1.
//
// The amber badge in the PC header is regulatory disclosure: it must
// honestly describe whether real capital is at risk in the currently
// displayed dataset. The selector reads two signals:
//   (1) TradingConfigNode.current_phase  ('Paper' | 'Live Crypto' | 'Live Stocks')
//   (2) the active mode toggle pill       ('live' | 'training' | 'combined')
//
// Phase 1.1: current_phase is hardcoded to 'Paper'. Every branch below
// resolves to amber "SIMULATED PERFORMANCE". The seven-row table is
// built now so Phase 4 activation is a no-op for the portal: only the
// engine's `current_phase` write changes.
//
// Mobile note: the collapsed status dot uses the same selector and
// renders the returned `dot` token (amber / green / split).
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {('Paper' | 'Live Crypto' | 'Live Stocks')} CurrentPhase
 * @typedef {('live' | 'training' | 'combined')} ModePill
 * @typedef {{ text: string, tone: ('amber'|'green'|'split'|'green-amber'), dot: ('amber'|'green'|'split') }} BadgeConfig
 */

/**
 * @param {CurrentPhase} currentPhase
 * @param {ModePill} mode
 * @returns {BadgeConfig}
 */
export function computeBadge(currentPhase, mode) {
  // Row 1: any mode under Paper phase
  if (currentPhase === 'Paper') {
    return { text: 'SIMULATED PERFORMANCE', tone: 'amber', dot: 'amber' };
  }

  // Rows 2–4: Live Crypto (stocks still paper)
  if (currentPhase === 'Live Crypto') {
    if (mode === 'training') {
      return { text: 'SIMULATED PERFORMANCE', tone: 'amber', dot: 'amber' };
    }
    if (mode === 'live') {
      return { text: 'LIVE CRYPTO · REAL CAPITAL', tone: 'green', dot: 'green' };
    }
    // combined — both real crypto + paper stocks visible
    return { text: 'LIVE CRYPTO · SIMULATED STOCKS', tone: 'split', dot: 'split' };
  }

  // Rows 5–7: Live Stocks (crypto already live)
  if (currentPhase === 'Live Stocks') {
    if (mode === 'training') {
      return { text: 'SIMULATED PERFORMANCE', tone: 'amber', dot: 'amber' };
    }
    if (mode === 'live') {
      return { text: 'LIVE TRADING', tone: 'green', dot: 'green' };
    }
    // combined — live trading active + historical paper visible
    return { text: 'LIVE TRADING + HISTORICAL PAPER', tone: 'green-amber', dot: 'split' };
  }

  // Defensive fallback (unknown phase) — honest disclosure rule: default to amber.
  return { text: 'SIMULATED PERFORMANCE', tone: 'amber', dot: 'amber' };
}
