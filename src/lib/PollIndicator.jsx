// ─────────────────────────────────────────────────────────────
// PollIndicator — prominent header countdown per Change 3 dispatch.
//
// Was: tiny 12px ring + 8px "SYNC: Xs" label tucked into the account bar.
//   Too easy to miss; operator couldn't see at a glance that the portal
//   was alive.
// Now: header-resident with bigger ring + bigger countdown number.
//   On rollover (poll fires) the ring flashes bright cyan + brief glow
//   for ~500ms. Content-safe — no banner pulse, no viewport-edge effects.
//
// `variant`:
//   'pc'     — ring 18px + "SYNC" label + countdown 14px
//   'mobile' — ring 14px + countdown 11px (no "SYNC" label, save space)
// ─────────────────────────────────────────────────────────────

export default function PollIndicator({ secs, pulse, variant = 'pc' }) {
  const cls = ['poll-prom', 'variant-' + variant, pulse ? 'fired' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls} title={`Next poll in ${secs}s — pulses on rollover when the cycle fires`}>
      <div className="poll-prom-ring"><div className="poll-prom-fill" /></div>
      {variant === 'pc' && <span className="poll-prom-label">SYNC</span>}
      <span className="poll-prom-count">{secs}s</span>
    </div>
  );
}
