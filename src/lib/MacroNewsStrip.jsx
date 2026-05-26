// ─────────────────────────────────────────────────────────────
// Macro news strip — horizontal marquee distinct from the per-asset
// ticker. Portal v1.1 Change 4. Drives off adaptMacroNews(data) output.
//
// Visually different from NewsTicker via amber-tinted border and
// labeled "MACRO" lead-in. Sentiment color on title (Bearish=red,
// Bullish=green, Neutral=gray).
// ─────────────────────────────────────────────────────────────

export default function MacroNewsStrip({ items, cacheStatus }) {
  if (!items || items.length === 0) {
    return (
      <div className="macro-strip-empty">
        <span className="macro-label">MACRO</span>
        <span className="macro-empty-text">— NO RECENT MACRO EVENTS —</span>
      </div>
    );
  }
  const all = [...items, ...items];
  return (
    <div className="macro-strip-wrap">
      <span className="macro-label" title={cacheStatus ? `cache: ${cacheStatus}` : ''}>MACRO</span>
      <div className="macro-strip-inner">
        {all.map((item, i) => (
          <MacroItem item={item} key={`${item.url}-${i}`} />
        ))}
      </div>
    </div>
  );
}

function MacroItem({ item }) {
  return (
    <div className="macro-item">
      <span className="macro-time">{item.time_ago}</span>
      <span className="macro-source">{item.source}</span>
      <span
        className={'macro-title sent-' + item.sentiment_class}
        title={item.sentiment_label || ''}
      >{item.title}</span>
      <span className="macro-divider">·</span>
    </div>
  );
}
