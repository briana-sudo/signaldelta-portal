// ─────────────────────────────────────────────────────────────
// Market Status Clock — header pills.
// Market-status-clock dispatch 2026-05-26.
//
// Renders two adjacent pills:
//   - Stocks pill: state-driven (OPEN green pulse / CLOSED gray / HOLIDAY amber)
//     with countdown text to the next session boundary
//   - Crypto pill: static cyan "CRYPTO 24/7"
//
// Mobile variant collapses the stocks pill to a single compact label and
// drops the crypto pill (crypto is always-on context the operator already
// knows). Operator can re-enable crypto on mobile if requested.
// ─────────────────────────────────────────────────────────────
// 2026-06-08: market-state is now LIFTED to the shell (one useMarketStatus()
// call per shell, shared with the MarketBell). The pill consumes it as a prop —
// no second clock/poll. `status` is required (shell always passes it).
const STATE_CLASS = {
  OPEN:     'mkt-open',
  CLOSED:   'mkt-closed',
  HOLIDAY:  'mkt-holiday',
  LOADING:  'mkt-loading',
  FALLBACK: 'mkt-closed',
};

export default function MarketStatusPill({ variant = 'pc', status }) {
  if (!status) return null;
  const cls = STATE_CLASS[status.state] || 'mkt-closed';

  if (variant === 'mobile') {
    // Compact: single pill, no crypto.
    const compactCountdown = status.countdown
      ? status.countdown.replace('STOCKS ', '').replace('OPENS IN ', '').replace('CLOSES IN ', '')
      : '';
    return (
      <div className={'mkt-pill mkt-compact ' + cls} title={`${status.label} · ${status.countdown}${status.fallback ? ' (calendar unavailable)' : ''}`}>
        <span className="mkt-dot" />
        <span className="mkt-label">{compactLabel(status.state)}</span>
        {compactCountdown && <span className="mkt-time">{compactCountdown}</span>}
      </div>
    );
  }

  return (
    <div className="mkt-cluster">
      <div className={'mkt-pill ' + cls} title={status.fallback ? 'Calendar unavailable — weekday-only logic' : ''}>
        <span className="mkt-dot" />
        <span className="mkt-label">{status.label}</span>
        {status.countdown && <span className="mkt-cd">{status.countdown}</span>}
        {status.fallback && <span className="mkt-fallback" title="Calendar unavailable — no holiday awareness">·NO CAL</span>}
      </div>
      <div className="mkt-pill mkt-crypto" title="Crypto markets trade 24/7">
        <span className="mkt-dot" />
        <span className="mkt-label">CRYPTO 24/7</span>
      </div>
    </div>
  );
}

function compactLabel(state) {
  if (state === 'OPEN') return 'OPEN';
  if (state === 'HOLIDAY') return 'HOLIDAY';
  if (state === 'LOADING') return '…';
  return 'CLOSED';
}
