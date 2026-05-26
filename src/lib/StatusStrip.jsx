// ─────────────────────────────────────────────────────────────
// SYSTEM EVENTS strip — horizontal scrolling marquee.
// Portal v1.2 Change 2 (2026-05-26).
//
// Replaces the v1.1 3-visible vertical cycle. Same `recent_events` query,
// same 5-most-recent slice, same SeverityClass color tokens — only the
// motion model changes. Single-line marquee matches the per-asset news
// ticker pattern so the operator can scan event/news/macro as three
// parallel streaming strips.
//
// Item format: [SEVERITY-PILL] [EVENT_TYPE] [asset?] [Xm ago] · (divider)
// Items duplicated for seamless loop. Hover-to-pause via CSS
// `.system-strip-wrap:hover .system-strip-inner { animation-play-state: paused; }`.
//
// Empty state: centered "AWAITING SYSTEM EVENTS", no animation.
// ─────────────────────────────────────────────────────────────

export default function StatusStrip({ recentEvents }) {
  const events = Array.isArray(recentEvents) ? recentEvents.slice(0, 5) : [];

  if (events.length === 0) {
    return (
      <div className="system-strip-wrap empty">
        <span className="system-strip-label">SYSTEM EVENTS</span>
        <span className="system-strip-empty-text">— AWAITING SYSTEM EVENTS —</span>
      </div>
    );
  }

  // Duplicate for seamless loop (same trick as NewsTicker / MacroNewsStrip).
  const all = [...events, ...events];
  return (
    <div className="system-strip-wrap">
      <span className="system-strip-label">SYSTEM EVENTS</span>
      <div className="system-strip-inner">
        {all.map((e, i) => (
          <SystemItem event={e} key={`${e.eventId || e.timestamp}-${i}`} />
        ))}
      </div>
    </div>
  );
}

function SystemItem({ event }) {
  return (
    <div className="system-item">
      <span className={'sev-pill sev-' + event.severityClass}>{event.severity}</span>
      <span className="system-event">{event.eventType}</span>
      {event.asset && <span className="system-asset">{event.asset}</span>}
      <span className="system-time">{event.timeAgo}</span>
      <span className="system-divider">·</span>
    </div>
  );
}
