// Portal v1.14 (2026-05-30) — M4 §6 account health strip + detail overlay.
//
// Shared by PC (banner-right, collapsed only — RED expands to overlay,
// board does NOT reflow) and mobile DATA tab (collapsed + inline RED
// expand). Renders ONE strip row per account_id. Reasons + monitors
// line render from the node's data — never hardcoded.
//
// State word per §6.1 (accessibility: dot is paired with the word, not
// color-alone):
//   GREEN → "OK"          (cyan/green dot)
//   AMBER → "constrained" (amber dot)
//   RED   → "CRITICAL"    (red dot)
//   anything else / null → "AWAITING ACCOUNT STATE"
//
// Freshness: now − updatedAt > 90s → append " (stale)".
//
// Detail affordance unifies the §6.2 click-through with the decision-3
// RED expand: a "details" toggle opens an overlay carrying every
// `healthReasons` entry, the monitors line, all §2 props, the open-
// positions list (reused from data.brokerAccount.positions), the last-
// 24h health-anomaly history filtered to this account_id, and the
// freshness stamp. ONE detail surface for all states.
import { useEffect, useMemo, useState } from 'react';
import { adaptAccountState, adaptHealthHistory } from './dataAdapter.js';
import ModalPortal from './ModalPortal.jsx';

const STALE_MS = 90 * 1000;

function stateLabel(s) {
  if (s === 'GREEN') return 'OK';
  if (s === 'AMBER') return 'constrained';
  if (s === 'RED')   return 'CRITICAL';
  return null; // unknown / null
}
function stateDotClass(s) {
  if (s === 'GREEN') return 'hs-dot hs-dot-green';
  if (s === 'AMBER') return 'hs-dot hs-dot-amber';
  if (s === 'RED')   return 'hs-dot hs-dot-red';
  return 'hs-dot hs-dot-dim';
}
function fmtMoney(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const sign = v < 0 ? '−' : '';
  return `${sign}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(2)}%`;
}
function ageSecondsFrom(iso, nowMs) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 1000));
}

export default function HealthStrip({ data, layout = 'pc' }) {
  // `layout: 'pc'` → collapsed-only, expand via overlay (board stable).
  // `layout: 'mobile-data'` → collapsed + inline-expand for RED, since the
  // mobile DATA tab has vertical room beneath.
  const { accounts } = adaptAccountState(data);
  const [openId, setOpenId] = useState(null);
  // 1s tick for the freshness counter — independent of the 60s data poll.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (accounts.length === 0) {
    return (
      <div className={'health-strip hs-' + layout + ' hs-bootstrap'}>
        <span className="hs-bootstrap-msg">AWAITING ACCOUNT STATE</span>
      </div>
    );
  }

  return (
    <div className={'health-strip hs-' + layout}>
      {accounts.map((a) => (
        <HealthStripRow
          key={a.accountId ?? 'unknown'}
          account={a}
          data={data}
          nowMs={nowMs}
          layout={layout}
          isOpen={openId === a.accountId}
          onToggle={() => setOpenId((cur) => (cur === a.accountId ? null : a.accountId))}
        />
      ))}
    </div>
  );
}

function HealthStripRow({ account: a, data, nowMs, layout, isOpen, onToggle }) {
  const word = stateLabel(a.healthState);
  const dotCls = stateDotClass(a.healthState);
  const ageSec = ageSecondsFrom(a.updatedAt, nowMs);
  const stale = ageSec != null && ageSec * 1000 > STALE_MS;
  const reasons = a.healthReasons; // array — render as-is

  // Collapsed-summary content per state. AMBER includes the FIRST reason
  // as the inline summary; RED keeps the full list for the overlay/inline
  // expand only (so the strip stays one line on PC).
  const summaryReason = reasons.length > 0 ? reasons[0] : null;

  // 2026-06-08: BOTH shells open the Account Health detail as an overlay popup.
  // Was: mobile-data inline-expanded RED only — non-RED toggles rendered nothing,
  // so the popup "never appeared". Mobile now portals the overlay above the
  // sticky header. PC overlay render path is unchanged.
  const overlayPc     = layout === 'pc' && isOpen;
  const overlayMobile = layout === 'mobile-data' && isOpen;

  return (
    <>
      <div className={'hs-row hs-row-' + (a.healthState || 'unknown')}>
        <span className={dotCls} aria-hidden="true" />
        <span className="hs-id">{a.accountId ?? '—'}</span>
        <span className="hs-word">
          {word ?? 'unknown'}
          {stale && <span className="hs-stale"> (stale)</span>}
        </span>
        {a.healthState === 'GREEN' && (
          <>
            <span className="hs-sep">•</span>
            <span className="hs-kv">BP <span className="hs-v">{fmtMoney(a.buyingPower)}</span></span>
            <span className="hs-sep">•</span>
            <span className="hs-kv">Portfolio <span className="hs-v">{fmtMoney(a.portfolioValue)}</span></span>
            <span className="hs-sep">•</span>
            <span className="hs-kv">Headroom <span className="hs-v">{fmtPct(a.headroomPct)}</span></span>
          </>
        )}
        {a.healthState === 'AMBER' && (
          <>
            <span className="hs-sep">•</span>
            <span className="hs-kv">BP <span className="hs-v">{fmtMoney(a.buyingPower)}</span></span>
            <span className="hs-sep">•</span>
            <span className="hs-kv">Headroom <span className="hs-v">{fmtPct(a.headroomPct)}</span></span>
            {summaryReason && (
              <>
                <span className="hs-sep">•</span>
                <span className="hs-reason-summary">{summaryReason}</span>
              </>
            )}
          </>
        )}
        {a.healthState === 'RED' && (
          <>
            <span className="hs-sep">•</span>
            <span className="hs-kv">BP <span className="hs-v">{fmtMoney(a.buyingPower)}</span></span>
          </>
        )}
        <button type="button" className="hs-details-btn" onClick={onToggle}>
          {isOpen ? 'hide details' : 'details'}
        </button>
      </div>
      {overlayPc && (
        <HealthDetailOverlay account={a} data={data} nowMs={nowMs} onClose={onToggle} />
      )}
      {overlayMobile && (
        <ModalPortal>
          <HealthDetailOverlay account={a} data={data} nowMs={nowMs} onClose={onToggle} />
        </ModalPortal>
      )}
    </>
  );
}

// Detail block — reused inside both the PC overlay (centered modal) and
// the mobile-data inline expand. Reasons + monitors line render from the
// node's arrays / counts — never hardcoded.
function HealthDetailBlock({ account: a, data, nowMs }) {
  const reasons = a.healthReasons;
  const history = useMemo(() => {
    const all = adaptHealthHistory(data);
    return all.filter((h) => h.accountId === a.accountId);
  }, [data, a.accountId]);
  const positions = Array.isArray(data?.brokerAccount?.positions) ? data.brokerAccount.positions : [];
  const ageSec = ageSecondsFrom(a.updatedAt, nowMs);
  return (
    <div className="hs-detail-block">
      <div className="hs-detail-sec">
        <div className="hs-detail-h">Reasons</div>
        {reasons.length === 0 ? (
          <div className="hs-detail-empty">no reasons reported</div>
        ) : (
          <ul className="hs-reasons">
            {reasons.map((r, i) => (
              <li key={i}><span className="hs-x" aria-hidden="true">✕</span> {r}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="hs-detail-sec">
        <div className="hs-detail-h">Monitors</div>
        <div className="hs-detail-kv">
          {a.monitorCoverageMonitored ?? '—'} of {a.monitorCoverageTotal ?? '—'} active
          {a.monitorCoverageUnmonitored != null && a.monitorCoverageUnmonitored > 0 && (
            <span className="hs-detail-warn"> · {a.monitorCoverageUnmonitored} unmonitored</span>
          )}
        </div>
      </div>
      <div className="hs-detail-sec">
        <div className="hs-detail-h">Account properties</div>
        <div className="hs-detail-grid">
          <div><span className="hs-detail-lbl">Portfolio</span><span className="hs-detail-v">{fmtMoney(a.portfolioValue)}</span></div>
          <div><span className="hs-detail-lbl">Cash</span><span className="hs-detail-v">{fmtMoney(a.cash)}</span></div>
          <div><span className="hs-detail-lbl">BP</span><span className="hs-detail-v">{fmtMoney(a.buyingPower)}</span></div>
          <div><span className="hs-detail-lbl">Non-marg BP</span><span className="hs-detail-v">{fmtMoney(a.nonMarginableBuyingPower)}</span></div>
          <div><span className="hs-detail-lbl">Committed</span><span className="hs-detail-v">{fmtMoney(a.committedNotional)}</span></div>
          <div><span className="hs-detail-lbl">Open positions</span><span className="hs-detail-v">{a.openPositionCount ?? '—'}</span></div>
          <div><span className="hs-detail-lbl">Headroom</span><span className="hs-detail-v">{fmtPct(a.headroomPct)}</span></div>
          <div><span className="hs-detail-lbl">Non-marg headroom</span><span className="hs-detail-v">{fmtPct(a.nonMarginableHeadroomPct)}</span></div>
          <div><span className="hs-detail-lbl">Daytrades</span><span className="hs-detail-v">{a.daytradeCount ?? '—'}</span></div>
          <div><span className="hs-detail-lbl">PDT</span><span className="hs-detail-v">{a.patternDayTrader == null ? '—' : (a.patternDayTrader ? 'yes' : 'no')}</span></div>
          <div><span className="hs-detail-lbl">Trading blocked</span><span className="hs-detail-v">{a.tradingBlocked == null ? '—' : (a.tradingBlocked ? 'YES' : 'no')}</span></div>
          <div><span className="hs-detail-lbl">Mon mismatch</span><span className="hs-detail-v">{a.monitorMismatchCountLastCycle ?? '—'}</span></div>
        </div>
      </div>
      <div className="hs-detail-sec">
        <div className="hs-detail-h">Open positions ({positions.length})</div>
        {positions.length === 0 ? (
          <div className="hs-detail-empty">no broker positions held</div>
        ) : (
          <table className="hs-positions">
            <thead><tr><th>Asset</th><th>Side</th><th>Qty</th><th>Mkt value</th><th>Unreal P&amp;L</th></tr></thead>
            <tbody>
              {positions.map((p, i) => (
                <tr key={p.symbol ?? i}>
                  <td>{p.symbol ?? '—'}</td>
                  <td>{p.side ?? '—'}</td>
                  <td>{p.qty != null ? Number(p.qty).toLocaleString(undefined, { maximumFractionDigits: 8 }) : '—'}</td>
                  <td>{fmtMoney(Number(p.market_value))}</td>
                  <td className={Number(p.unrealized_pl) >= 0 ? 'pos-g' : 'pos-r'}>{fmtMoney(Number(p.unrealized_pl))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="hs-detail-sec">
        <div className="hs-detail-h">Last 24h ({history.length})</div>
        {history.length === 0 ? (
          <div className="hs-detail-empty">no health anomalies in 24h</div>
        ) : (
          <ul className="hs-history">
            {history.map((h, i) => (
              <li key={i}>
                <span className={'hs-hist-type hs-hist-' + (h.anomalyType || '')}>{h.anomalyType ?? '—'}</span>
                <span className="hs-hist-sev">{h.severity ?? ''}</span>
                <span className="hs-hist-ts">{h.createdTimestamp ?? ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="hs-detail-foot">
        Last update: {a.updatedAt ?? '—'}
        {ageSec != null && <> · {ageSec}s ago</>}
      </div>
    </div>
  );
}

function HealthDetailOverlay({ account, data, nowMs, onClose }) {
  return (
    <div className="hs-overlay-scrim" onClick={onClose}>
      <div className="hs-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="hs-overlay-head">
          <span className={stateDotClass(account.healthState)} aria-hidden="true" />
          <span className="hs-overlay-title">Account {account.accountId ?? '—'} · {stateLabel(account.healthState) ?? 'unknown'}</span>
          <button type="button" className="hs-overlay-close" onClick={onClose}>✕</button>
        </div>
        <HealthDetailBlock account={account} data={data} nowMs={nowMs} />
      </div>
    </div>
  );
}
