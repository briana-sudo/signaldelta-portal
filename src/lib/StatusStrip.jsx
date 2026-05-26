// ─────────────────────────────────────────────────────────────
// SYSTEM EVENTS strip — 5-event vertical cycle, 3 rows visible.
// Portal v1.1 status-strip 5-event-cycle dispatch (2026-05-26).
//
// Visual:
//   - Header label "SYSTEM EVENTS" (replaces v1.0 "Last event:")
//   - Three rows visible: depth-0 sharp / depth-1 dimmer / depth-2 dimmest
//   - Stack advances every ~5s: top fades, content reshuffles, new event
//     appears at bottom. Container plays a brief slide-up + fade-in
//     keyframe on each cycle (500ms ease-out per spec)
//   - Hover pauses the cycle (operator can stop and read)
//
// Per-row format: [SEVERITY-PILL] [EVENT_TYPE] [asset?] · [time_ago]
//
// Empty state: "AWAITING SYSTEM EVENTS" single static line, no animation
// Partial state (<5 events): cycle through what's there, loop
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';

const VISIBLE_ROWS = 3;
const CYCLE_INTERVAL_MS = 5000;

export default function StatusStrip({ recentEvents }) {
  const events = recentEvents || [];
  const [pos, setPos] = useState(0);
  const [paused, setPaused] = useState(false);

  // Cycle tick: only when we have more events than the visible window
  // (otherwise there's nothing to cycle through).
  useEffect(() => {
    if (events.length <= VISIBLE_ROWS || paused) return;
    const id = setInterval(() => {
      setPos((p) => (p + 1) % events.length);
    }, CYCLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [events.length, paused]);

  // Reset position if the events list shrinks below current pos
  useEffect(() => {
    if (pos >= events.length) setPos(0);
  }, [events.length, pos]);

  if (events.length === 0) {
    return (
      <div className="status-strip empty">
        <span className="status-strip-label">SYSTEM EVENTS</span>
        <span className="status-strip-empty-text">— AWAITING SYSTEM EVENTS —</span>
      </div>
    );
  }

  // Build the visible window — wrap around the array so a 5-event list
  // shows positions [0,1,2] then [1,2,3] then [2,3,4] then [3,4,0]...
  const visible = [];
  const count = Math.min(VISIBLE_ROWS, events.length);
  for (let i = 0; i < count; i++) {
    visible.push(events[(pos + i) % events.length]);
  }

  return (
    <div
      className="status-strip cycle"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      title={paused ? 'Paused — move cursor away to resume cycle' : 'Cycling every 5s — hover to pause'}
    >
      <span className="status-strip-label">SYSTEM EVENTS</span>
      <div className="status-stack" key={pos}>
        {visible.map((e, depth) => (
          <StatusRow key={depth + '-' + (e.eventId || e.timestamp)} event={e} depth={depth} />
        ))}
      </div>
    </div>
  );
}

function StatusRow({ event, depth }) {
  return (
    <div className={'status-row depth-' + depth}>
      <span className={'sev-pill sev-' + event.severityClass}>{event.severity}</span>
      <span className="status-event">{event.eventType}</span>
      {event.asset && <span className="status-asset">{event.asset}</span>}
      <span className="status-sep">·</span>
      <span className="status-time">{event.timeAgo}</span>
    </div>
  );
}
