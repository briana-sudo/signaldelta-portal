// Phase filter for the LIVE / TRAINING / COMBINED mode toggle.
// Reconciliation Section E:
//   - LIVE filters TradeNodes to phase IN ['Live Crypto', 'Live Stocks']
//   - TRAINING filters to phase = 'Paper'
//   - COMBINED applies no filter
//
// Phase 1.1 reality: zero live trades exist. LIVE mode therefore renders
// bootstrap states across every filtered panel. TRAINING and COMBINED
// render the placeholder data (identical visually in Phase 1).
//
// The filter set per Section E:
//   APPLIES to:    Account Bar, Open Positions, Event Feed, Win Rate,
//                  Sharpe, Lane 2 Δ, Conviction, Returns Matrix, Equity Curve series
//   EXCEPT:        Equity Curve PEAK/DD/TWR header (always combined),
//                  Kernel Map (cosmetic in Phase 1),
//                  Ticker, Mini Waterfall (always combined system-weekly)

export function isLiveFiltered(mode) {
  return mode === 'live';
}

// Returns true when this panel should render its bootstrap/empty state
// because the operator filtered to LIVE and no live trades exist yet.
export function shouldRenderBootstrap(mode) {
  return mode === 'live';
}
