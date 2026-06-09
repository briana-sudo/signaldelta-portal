// ─────────────────────────────────────────────────────────────
// ScannerContext — Tier 1 liveness + capital strip for the Signal
// Scanner (2026-06-09). Sits between the panel title and the row
// list, shared by the PC ScannerPanel and the mobile ScanTab.
//
// Answers "is it broke?" at a glance when the scanner is lit-but-idle:
//   ● ENGINE LIVE · beat 25s   |   $4.9k cash · 0 pos   |   last clear 71m ago
//
// HONESTY CONSTRAINT (per dispatch): the heartbeat proves the engine
// PROCESS is alive — it's the L4 account-health poller's ~30s write,
// NOT a per-evaluation-cycle signal. We say "ENGINE LIVE" / "process",
// never "evaluating". The true eval-loop beat is Tier 2 (ships later).
// ─────────────────────────────────────────────────────────────
import { adaptHeartbeat, adaptAccountState } from './dataAdapter.js';

const STATE_LABEL = { live: 'ENGINE LIVE', stale: 'ENGINE STALE', stopped: 'ENGINE STOPPED' };

// Seconds-aware age so a fresh ~30s beat reads "25s", not "0m".
function ageLabel(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 90) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function minLabel(min) {
  if (min == null || !Number.isFinite(min)) return null;
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function money(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 10_000) return '$' + Math.round(n / 1000) + 'k';
  if (n >= 1_000) return '$' + (n / 1000).toFixed(1) + 'k';
  return '$' + Math.round(n);
}

// lastClearAgeMin: min ageMin across scored scanner rows (the freshest clear),
// passed from the panel so we don't re-run adaptScanner here. null when the
// engine hasn't cleared anything in-window.
export default function ScannerContext({ data, lastClearAgeMin = null }) {
  const hb = adaptHeartbeat(data);
  const acct = adaptAccountState(data).accounts[0] || null;
  const state = hb.state || 'stopped';
  const beat = ageLabel(hb.lastWriteIso);
  const cash = acct ? money(acct.cash) : '—';
  const pos = acct && acct.openPositionCount != null ? acct.openPositionCount : null;
  const blocked = acct ? acct.tradingBlocked : false;
  const lastClear = minLabel(lastClearAgeMin);

  const beatTitle = hb.lastWriteEt
    ? `Engine process heartbeat — last write ${hb.lastWriteEt} ET (${beat} ago). `
      + 'Source: account-health poller (~30s). Proves the process is alive, '
      + 'NOT that the evaluation loop ticked this cycle.'
    : 'Engine heartbeat unavailable — no recent node-write timestamp.';

  return (
    <div className={'scanner-ctx ctx-' + state}>
      <span className="ctx-seg ctx-engine" title={beatTitle}>
        <span className={'ctx-dot dot-' + state} />
        {STATE_LABEL[state] || 'ENGINE —'}
        {beat ? <span className="ctx-sub">· beat {beat}</span> : null}
      </span>
      <span className="ctx-seg ctx-cap" title="Broker cash + open positions (AccountStateNode)">
        {cash} cash<span className="ctx-sub">· {pos == null ? '—' : pos} pos</span>
        {blocked ? <span className="ctx-blocked">BLOCKED</span> : null}
      </span>
      <span
        className="ctx-seg ctx-clear"
        title="Time since the engine last cleared any monitored asset (most-recent THRESHOLD_HIT). Scanner scores are last-cleared values, not live."
      >
        {lastClear ? <>last clear <span className="ctx-strong">{lastClear}</span> ago</> : 'no clears in window'}
      </span>
    </div>
  );
}
