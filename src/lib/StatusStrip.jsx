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

export default function StatusStrip({ recentEvents, variant = 'pc' }) {
  const events = Array.isArray(recentEvents) ? recentEvents.slice(0, 5) : [];
  const isMobile = variant === 'mobile';

  if (events.length === 0) {
    return (
      <div className={'system-strip-wrap empty' + (isMobile ? ' sev-list' : '')}>
        <span className="system-strip-label">SYSTEM EVENTS</span>
        <span className="system-strip-empty-text">— AWAITING SYSTEM EVENTS —</span>
      </div>
    );
  }

  // Rev 46 — mobile: readable STACKED LIST instead of the single-line marquee.
  // The marquee crammed badge+type+asset+age onto one 26px line and the opaque
  // z-index label overlapped/clipped the first item at the narrow viewport.
  // One row per event (no duplication, no animation); badge fully inside the
  // panel inset, event-type ellipsis-clips, age pinned right. PC keeps the
  // marquee unchanged (variant defaults to 'pc').
  if (isMobile) {
    return (
      <div className="system-strip-wrap sev-list">
        <span className="system-strip-label">SYSTEM EVENTS</span>
        <div className="sev-list-rows">
          {events.map((e, i) => (
            <div className="sev-row" key={`${e.eventId || e.timestamp}-${i}`}>
              <span className={'sev-pill sev-' + e.severityClass}>{e.severity}</span>
              <span className="system-event">{e.eventType}</span>
              {e.asset && <span className="system-asset">{e.asset}</span>}
              <span className="system-time">{e.timeAgo}</span>
            </div>
          ))}
        </div>
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
