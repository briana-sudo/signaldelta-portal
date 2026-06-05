// Trades expand modal — Portal v1.17 (2026-06-04).
// PC-only. Opened by the EXPAND control in TradeListPanel when the trade
// corpus exceeds the panel cap. Renders the FULL `trades` array (bounded by
// the proxy `trade_list_recent` LIMIT 50) in a scrollable table, reusing the
// same TradeListRow component the panel uses.
//
// Reuses the established `.overlay` / `.overlay.show` dim-layer pattern
// (index.css) — click the dim backdrop to dismiss, e.stopPropagation() on the
// card keeps clicks inside from closing. Deliberately NOT TradeOverlay: that
// component is a timer-driven single-trade execution toast with the wrong
// lifecycle for a persistent scrollable list.
import { useEffect } from 'react';

export default function TradesExpandModal({
  open,
  onClose,
  trades,
  openOffsetByReq,
  m4State = 'absent',
  unmonitoredSet = null,
  RowComponent,
}) {
  // Esc-to-dismiss, mirroring the click-dim dismiss.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="overlay show" onClick={onClose}>
      <div className="ov-card trades-expand-card" onClick={(e) => e.stopPropagation()}>
        <div className="trades-expand-head">
          <span><span className="ptitle-bar" />ALL TRADES</span>
          <span className="trades-expand-head-r">
            {trades.length} TOTAL
            <button type="button" className="trades-expand-close" onClick={onClose}>CLOSE ✕</button>
          </span>
        </div>
        <div className="trades-expand-body">
          <table className="pos-table trade-list">
            <thead>
              <tr>
                <th>Asset</th><th>Track</th><th>Conv</th>
                <th>Entry</th><th>Current</th>
                <th>Stop</th><th>Target</th>
                <th>Progress</th><th>P&amp;L</th><th>Hold</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <RowComponent key={t.requestId || `${t.asset}-${t.entryTimestamp}`}
                              t={t}
                              offset={openOffsetByReq?.get(t.requestId) ?? 0}
                              m4State={m4State}
                              unmonitoredSet={unmonitoredSet} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
