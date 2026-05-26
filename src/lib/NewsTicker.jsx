// ─────────────────────────────────────────────────────────────
// Per-asset news ticker — horizontal scrolling marquee.
// Portal v1.1 Change 3A. Drives off adaptNewsTicker(data) output.
//
// Item format: [ASSET] [IMPACT pill] [event_summary] · (divider)
// Continuous scroll via CSS animation; items duplicated for seamless loop.
// Content-safe styling — bounded to the panel slot, no banner overlay.
// ─────────────────────────────────────────────────────────────

export default function NewsTicker({ items }) {
  if (!items || items.length === 0) {
    return (
      <div className="news-ticker-empty">
        — NO NON-QUIET NEWS EVENTS IN GRAPH —
      </div>
    );
  }
  // Duplicate for seamless loop (same trick as the existing asset Ticker).
  const all = [...items, ...items];
  return (
    <div className="news-ticker-wrap">
      <div className="news-ticker-inner">
        {all.map((item, i) => (
          <NewsItem item={item} key={`${item.written_at || ''}-${item.asset}-${i}`} />
        ))}
      </div>
    </div>
  );
}

function NewsItem({ item }) {
  return (
    <div className="news-item">
      <span className="news-asset">{item.asset}</span>
      <span className={'news-pill pill-' + item.impact_class}>{item.impact_level}</span>
      <span className="news-summary">{item.event_summary}</span>
      {item.time_ago && <span className="news-time">{item.time_ago}</span>}
      <span className="news-divider">·</span>
    </div>
  );
}
