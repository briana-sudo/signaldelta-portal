// ─────────────────────────────────────────────────────────────
// System Event Status Strip — single-line readout of the most recent
// SystemEventNode. Portal v1.1 Change 3B.
//
// Preserves operator visibility into phase transitions, Sharpe band
// changes, learning loop runs, etc. that were previously surfaced via
// the full Event Feed panel before the news ticker took its slot.
// ─────────────────────────────────────────────────────────────

export default function StatusStrip({ lastEvent }) {
  if (!lastEvent) {
    return (
      <div className="status-strip">
        <span className="status-label">Last event:</span>
        <span className="status-value dim">—</span>
      </div>
    );
  }
  const tag = lastEvent.eventType || 'EVENT';
  return (
    <div className="status-strip" title={lastEvent.summary || ''}>
      <span className="status-label">Last event:</span>
      <span className={'status-event sev-' + (lastEvent.severity || 'INFO').toLowerCase()}>
        {tag}
      </span>
      {lastEvent.asset && (
        <span className="status-asset">{lastEvent.asset}</span>
      )}
      <span className="status-sep">·</span>
      <span className="status-time">{lastEvent.timeAgo}</span>
    </div>
  );
}
