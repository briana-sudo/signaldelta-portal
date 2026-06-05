// ─────────────────────────────────────────────────────────────
// TradesExpandModal — Portal Rev 32 (2026-06-05). PC + mobile.
//
// Opened by the EXPAND control in the trades panel. Unlike the panel (which
// renders the 60s-polled set), this modal OWNS its own on-demand fetch via the
// whitelisted `trade_list_window` proxy query — fetch on open and on every
// time-window change. It is NOT wired into pollOnce.
//
// Reuses the `.overlay` / `.overlay.show` dim-layer (PC) and the
// `.m-trades-sheet` full-screen sheet (mobile); click the scrim or CLOSE (or
// Esc) to dismiss; e.stopPropagation() on the card keeps inner clicks alive.
// Deliberately NOT TradeOverlay (timer-driven single-trade toast, wrong
// lifecycle).
//
// Four operator-locked controls:
//   1. Time window  — 6h / 24h / 7d / all (default 24h); changing it RE-FETCHES.
//   2. Asset class  — All / Crypto / Stocks (client filter on t.assetClass).
//   3. Symbol       — All + distinct symbols in the fetched window (client).
//   4. Sort         — entry time (default desc), P&L, asset, track, win/loss.
//                     PC: clickable column headers. Mobile: sort dropdown.
//
// Locked sort keys: P&L = t.pnlPct (t.pnl is 0 on OPEN); track = explicit
// ordinal {con,mod,agg}; win/loss = OPEN rows always last.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { adaptTradeList } from '../lib/dataAdapter.js';
import { callTradesWindow } from '../hooks/useNeo4jPoll.js';

const WINDOW_PRESETS = [
  { key: '6h',  label: '6H',  ms: 6 * 3600 * 1000 },
  { key: '24h', label: '24H', ms: 24 * 3600 * 1000 },
  { key: '7d',  label: '7D',  ms: 7 * 24 * 3600 * 1000 },
  { key: 'all', label: 'ALL', ms: null },
];

const ASSET_FILTERS = [
  { key: 'All',    label: 'ALL' },
  { key: 'Crypto', label: 'CRYPTO' },
  { key: 'Stocks', label: 'STOCKS' },
];

const SORT_FIELDS = [
  { key: 'entry',   label: 'Entry time' },
  { key: 'pnl',     label: 'P&L' },
  { key: 'asset',   label: 'Asset' },
  { key: 'track',   label: 'Track' },
  { key: 'winloss', label: 'Win/Loss' },
];

const TRACK_ORD = { con: 0, mod: 1, agg: 2 };

function windowStartIso(preset) {
  const def = WINDOW_PRESETS.find((p) => p.key === preset);
  if (!def || def.ms == null) return '1970-01-01T00:00:00Z'; // "all" → $cutoff governs
  return new Date(Date.now() - def.ms).toISOString();
}

function sortValue(t, key) {
  switch (key) {
    case 'entry': return t.entryTimestamp ? Date.parse(t.entryTimestamp) : 0;
    case 'pnl':   return Number.isFinite(t.pnlPct) ? t.pnlPct : 0;
    case 'asset': return t.asset || '';
    case 'track': return TRACK_ORD[t.track] ?? 99;
    default:      return 0;
  }
}

function makeComparator(key, dir) {
  return (a, b) => {
    if (key === 'winloss') {
      // OPEN rows (no win_loss) always sort to the bottom, regardless of dir.
      const ao = a.status !== 'CLOSED';
      const bo = b.status !== 'CLOSED';
      if (ao && bo) return 0;
      if (ao) return 1;
      if (bo) return -1;
      const rank = (v) => (v === 'Win' ? 1 : 0); // Win outranks Loss
      const ra = rank(a.winLoss);
      const rb = rank(b.winLoss);
      const base = ra === rb ? 0 : (ra > rb ? -1 : 1); // higher rank first
      return dir === 'desc' ? base : -base;
    }
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (av < bv) return dir === 'desc' ? 1 : -1;
    if (av > bv) return dir === 'desc' ? -1 : 1;
    return 0;
  };
}

export default function TradesExpandModal({
  open,
  onClose,
  variant = 'pc',
  data,
  m4State = 'absent',
  unmonitoredSet = null,
  RowComponent,
}) {
  const isMobile = variant === 'mobile';

  const [windowPreset, setWindowPreset] = useState('24h');
  const [assetFilter, setAssetFilter] = useState('All');
  const [symbolFilter, setSymbolFilter] = useState('All');
  const [sortKey, setSortKey] = useState('entry');
  const [sortDir, setSortDir] = useState('desc');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Esc-to-dismiss (mirrors the scrim click).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Fetch on open and on every window-preset change. Modal-only; on-demand.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    callTradesWindow(windowStartIso(windowPreset))
      .then((r) => { if (!cancelled) { setRows(Array.isArray(r) ? r : []); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e?.message || String(e)); setRows([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [open, windowPreset]);

  // New window → reset the symbol filter so a stale symbol can't blank the list.
  useEffect(() => { setSymbolFilter('All'); }, [windowPreset]);
  // Asset-class change → the symbol set shifts; reset to All.
  useEffect(() => { setSymbolFilter('All'); }, [assetFilter]);

  // Adapt the fetched window rows with the SAME adapter the panel uses, reusing
  // the live poll `data` for broker-price enrichment of OPEN rows.
  const adapted = useMemo(
    () => adaptTradeList({ ...(data || {}), tradeList: rows }) ?? [],
    [rows, data],
  );

  const assetFiltered = useMemo(() => {
    if (assetFilter === 'All') return adapted;
    if (assetFilter === 'Crypto') return adapted.filter((t) => t.assetClass === 'Crypto');
    return adapted.filter((t) => t.assetClass !== 'Crypto'); // Stocks = non-crypto
  }, [adapted, assetFilter]);

  const symbolOptions = useMemo(() => {
    const set = new Set(assetFiltered.map((t) => t.asset).filter(Boolean));
    return Array.from(set).sort();
  }, [assetFiltered]);

  const visible = useMemo(() => {
    const filtered = symbolFilter === 'All'
      ? assetFiltered
      : assetFiltered.filter((t) => t.asset === symbolFilter);
    return [...filtered].sort(makeComparator(sortKey, sortDir));
  }, [assetFiltered, symbolFilter, sortKey, sortDir]);

  if (!open) return null;

  // PC clickable-header → sort field map (win/loss rides the Progress header,
  // which renders the WIN/LOSS outcome badge).
  const HEADER_SORT = {
    Asset: 'asset', Track: 'track', Entry: 'entry', Progress: 'winloss', 'P&L': 'pnl',
  };
  const onHeaderClick = (key) => {
    if (!key) return;
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir(key === 'entry' || key === 'pnl' ? 'desc' : 'asc'); }
  };
  const sortArrow = (key) => (sortKey === key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '');

  const headerCell = (label) => {
    const key = HEADER_SORT[label];
    if (!key) return <th>{label === 'P&L' ? <>P&amp;L</> : label}</th>;
    return (
      <th
        className={'tx-sortable' + (sortKey === key ? ' tx-active' : '')}
        onClick={() => onHeaderClick(key)}
        title={`Sort by ${label}`}
      >
        {label === 'P&L' ? <>P&amp;L</> : label}{sortArrow(key)}
      </th>
    );
  };

  const countLabel = loading ? '…' : `${visible.length} of ${adapted.length}`;

  const controls = (
    <div className="tx-controls">
      <div className="tx-ctl">
        <span className="tx-ctl-lbl">WINDOW</span>
        <div className="tx-seg">
          {WINDOW_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={'tx-seg-btn' + (windowPreset === p.key ? ' tx-on' : '')}
              onClick={() => setWindowPreset(p.key)}
            >{p.label}</button>
          ))}
        </div>
      </div>
      <div className="tx-ctl">
        <span className="tx-ctl-lbl">CLASS</span>
        <div className="tx-seg">
          {ASSET_FILTERS.map((a) => (
            <button
              key={a.key}
              type="button"
              className={'tx-seg-btn' + (assetFilter === a.key ? ' tx-on' : '')}
              onClick={() => setAssetFilter(a.key)}
            >{a.label}</button>
          ))}
        </div>
      </div>
      <div className="tx-ctl">
        <span className="tx-ctl-lbl">SYMBOL</span>
        <select className="tx-select" value={symbolFilter} onChange={(e) => setSymbolFilter(e.target.value)}>
          <option value="All">ALL</option>
          {symbolOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {isMobile && (
        <div className="tx-ctl">
          <span className="tx-ctl-lbl">SORT</span>
          <select className="tx-select" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            {SORT_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <button
            type="button"
            className="tx-dir-btn"
            onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
            title="Toggle sort direction"
          >{sortDir === 'desc' ? '▼' : '▲'}</button>
        </div>
      )}
    </div>
  );

  const body = (() => {
    if (error) return <div className="tx-msg tx-err">FETCH FAILED · {error}</div>;
    if (loading) return <div className="tx-msg">LOADING…</div>;
    if (visible.length === 0) return <div className="tx-msg">NO TRADES IN THIS WINDOW</div>;
    if (isMobile) {
      return (
        <div className="m-sheet-cards">
          {visible.map((t) => (
            <RowComponent key={t.requestId || `${t.asset}-${t.entryTimestamp}`}
                          t={t} offset={0} m4State={m4State} unmonitoredSet={unmonitoredSet} />
          ))}
        </div>
      );
    }
    return (
      <table className="pos-table trade-list">
        <thead>
          <tr>
            {headerCell('Asset')}{headerCell('Track')}{headerCell('Conv')}
            {headerCell('Entry')}{headerCell('Current')}
            {headerCell('Stop')}{headerCell('Target')}
            {headerCell('Progress')}{headerCell('P&L')}{headerCell('Hold')}
          </tr>
        </thead>
        <tbody>
          {visible.map((t) => (
            <RowComponent key={t.requestId || `${t.asset}-${t.entryTimestamp}`}
                          t={t} offset={0} m4State={m4State} unmonitoredSet={unmonitoredSet} />
          ))}
        </tbody>
      </table>
    );
  })();

  return (
    <div className={isMobile ? 'm-trades-sheet' : 'overlay show'} onClick={onClose}>
      <div
        className={isMobile ? 'm-trades-sheet-card' : 'ov-card trades-expand-card'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={isMobile ? 'm-trades-sheet-head' : 'trades-expand-head'}>
          <span><span className="ptitle-bar" />ALL TRADES</span>
          <span className="trades-expand-head-r">
            {countLabel}
            <button type="button" className="trades-expand-close" onClick={onClose}>CLOSE ✕</button>
          </span>
        </div>
        {controls}
        <div className={isMobile ? 'm-trades-sheet-body' : 'trades-expand-body'}>
          {body}
        </div>
      </div>
    </div>
  );
}
