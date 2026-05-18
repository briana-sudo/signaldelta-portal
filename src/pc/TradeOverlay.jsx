// Trade execution overlay — Step G.
// PC-only modal (per reconciliation Section G: mobile only adds to event feed).
// Fires on TRADE_OPENED / TRADE_CLOSED events surfaced by the event feed.
// 8-second auto-dismiss countdown via CSS keyframe `countdown`.
// Phase 1.1 demo timing: fires once at 5s with a TRADE_OPENED, once at 18s
// with a TRADE_CLOSED win. Click anywhere on the dim layer to dismiss early.
import { useEffect, useRef, useState } from 'react';

const DISMISS_MS = 8200;

export default function TradeOverlay({ trigger }) {
  const [shown, setShown] = useState(null); // current trade or null
  const dismissTimer = useRef(null);

  useEffect(() => {
    if (!trigger) return;
    setShown(trigger);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => setShown(null), DISMISS_MS);
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [trigger]);

  const onDismiss = () => setShown(null);

  if (!shown) {
    return (
      <div className="overlay" onClick={onDismiss}>
        <div className="ov-card" style={{ visibility: 'hidden' }} />
      </div>
    );
  }

  const isOpen = shown.type === 'open';
  const isWin = shown.type === 'close-win';
  const typeColor = isOpen ? 'var(--cyan)' : isWin ? 'var(--green)' : 'var(--red)';
  const assetColor = isOpen ? 'var(--white)' : isWin ? 'var(--green)' : 'var(--red)';
  const statusText = isOpen ? 'ORDER EXECUTED' : isWin ? 'WIN · RULE UPDATED' : 'LOSS · PROHIBITION CANDIDATE';
  const statusColor = isOpen ? 'var(--cyan)' : isWin ? 'var(--green)' : 'var(--red)';
  const typeLabel = isOpen ? '▶ TRADE EXECUTION' : isWin ? '✓ TARGET HIT' : '✗ STOP HIT';

  return (
    <div className="overlay show" onClick={onDismiss}>
      <div className="ov-card" onClick={(e) => e.stopPropagation()}>
        <div className="ov-type">
          <span style={{ color: typeColor, fontSize: '11px', letterSpacing: '4px' }}>
            {typeLabel}
          </span>
        </div>
        <div className="ov-asset" style={{ color: assetColor }}>{shown.asset}</div>
        <div className="ov-price">
          {isOpen ? `ENTRY @ $${shown.entry.toLocaleString()}` : `EXIT @ $${shown.exit.toLocaleString()}`}
        </div>

        {isOpen ? (
          <div className="ov-indicators">
            {shown.inds.map((ind, i) => (
              <div className="ov-ind" key={i}>
                <div className="ov-ind-name">{ind.name}</div>
                <div className="ov-ind-val" style={{ color: ind.positive ? 'var(--green)' : 'var(--amber)' }}>
                  {ind.val}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div>
          {isOpen ? (
            <>
              <div className="ov-score-row">
                <span className="ov-score-label">COMPOSITE SCORE</span>
                <div className="ov-score-bar">
                  <div className="ov-score-fill" style={{ width: shown.composite + '%', background: 'var(--green)' }} />
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--green)', marginLeft: '8px' }}>
                  {shown.composite}
                </span>
              </div>
              <div className="ov-score-row">
                <span className="ov-score-label">LANE 2 (SCAFFOLD)</span>
                <div className="ov-score-bar">
                  <div className="ov-score-fill" style={{ width: '0%', background: 'var(--amber)' }} />
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--amber)', marginLeft: '8px' }}>
                  OFFLINE
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="ov-score-row">
                <span className="ov-score-label">HOLD DURATION</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '14px', color: 'var(--w2)', marginLeft: '8px' }}>
                  {shown.hold}
                </span>
              </div>
              <div className="ov-score-row">
                <span className="ov-score-label">RESULT</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '18px', color: isWin ? 'var(--green)' : 'var(--red)', marginLeft: '8px' }}>
                  {isWin ? '+' : ''}{shown.pnlPct}% · {isWin ? '+' : ''}${Math.abs(shown.pnl).toFixed(2)}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="ov-bottom">
          <div className="ov-conviction" style={{
            color: shown.convColor || 'var(--cyan)',
            border: `1px solid ${shown.convColor || 'var(--cyan)'}`,
            background: shown.convBg || 'var(--cyan2)',
          }}>{shown.conviction || ''}</div>
          <div className="ov-lane2">{isOpen ? 'LANE 2 SCAFFOLD · lane2_enabled=false' : ''}</div>
          <div className="ov-status" style={{ color: statusColor }}>{statusText}</div>
        </div>
        <div
          className="ov-countdown"
          key={shown.fireKey /* re-keys to restart CSS animation on each trigger */}
          style={{
            background: typeColor,
            animation: 'countdown 8s linear forwards',
          }}
        />
      </div>
    </div>
  );
}
