// ─────────────────────────────────────────────────────────────
// EnginePill — engine heartbeat indicator in the portal header.
// Replaces the static "SYSTEM ACTIVE" pill per Change 2 dispatch.
//
// Three states, thresholds in adaptHeartbeat:
//   LIVE     green pulse        last engine write ≤ 7 min ago
//   STALE    amber slow pulse   7–30 min ago
//   STOPPED  red, no pulse      30+ min ago, OR no data
//
// Hover tooltip: last engine write timestamp in ET + minutes-ago count.
// `variant` selects the dense-UI shell:
//   'pc'      — full pill with dot + label (PC header hdr-mid)
//   'mobile'  — bare dot only (mobile header hdr-right)
// ─────────────────────────────────────────────────────────────

const LABELS = {
  live: 'ENGINE LIVE',
  stale: 'ENGINE STALE',
  stopped: 'ENGINE STOPPED',
};

function tooltipText(hb) {
  if (!hb || !hb.lastWriteEt) {
    return 'Engine heartbeat unavailable — no node-write timestamp from any of the 6 tracked types';
  }
  return `Last engine write: ${hb.lastWriteEt} ET · ${hb.minutesAgo} min ago`;
}

export default function EnginePill({ heartbeat, variant = 'pc' }) {
  const state = heartbeat?.state ?? 'stopped';
  const title = tooltipText(heartbeat);

  if (variant === 'mobile') {
    return <div className={'status-dot engine-dot dot-' + state} title={title} />;
  }
  return (
    <div className={'pill pill-engine state-' + state} title={title}>
      <div className={'dot engine-dot dot-' + state} />
      {LABELS[state]}
    </div>
  );
}
