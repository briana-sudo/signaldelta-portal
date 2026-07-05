// Phase 3d-iii-b — Discovery console tests (vitest + testing-library).
// Firewall at the UI: reads + sends intent, never writes the graph, never holds a
// credential, no 7687 reference. Plus the coverage-map sizing/color logic.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { statusColor, sizeForPotential, isHot, layoutSpans } from './coverage.js';
import { makeContract, groundedAnalyst } from './api/contract.js';
import BoardQueue from './components/BoardQueue.jsx';
import DataNeeds from './components/DataNeeds.jsx';
import AnalystPanel from './components/AnalystPanel.jsx';
import TimelineView from './components/TimelineView.jsx';
import InProgress from './components/InProgress.jsx';
import Topbar from './components/Topbar.jsx';
import RunRoom from './components/RunRoom.jsx';
import { composeReport, mergeRuns, runsForSurface, versionDiff, surfaceOf, deriveCellStatuses, computeAttention, rejudgeReason } from './runs.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// --- coverage-map instrument: sized-by-potential + colored-by-status ---------
describe('coverage map logic', () => {
  it('colors by status (the map language)', () => {
    expect(statusColor('whitespace')).toBe('#00C2FF');
    expect(statusColor('gated')).toBe('#F5B544');
    expect(statusColor('retained')).toBe('#34D399');
    expect(statusColor('occupied')).toBe('#5A6B82');
  });
  it('sizes by discovery potential — frontier large, picked-over small', () => {
    expect(sizeForPotential(0.95)).toBeGreaterThan(sizeForPotential(0.15));
    expect(sizeForPotential(0.15)).toBeGreaterThanOrEqual(0.18);   // floor keeps it legible
  });
  it('the uncrowded frontier glows, occupied ground does not', () => {
    expect(isHot({ discovery_potential: 0.95, status: 'gated' })).toBe(true);
    expect(isHot({ discovery_potential: 0.20, status: 'occupied' })).toBe(false);
  });
  it('layout gives higher-potential surfaces a bigger span', () => {
    const spans = layoutSpans([
      { name: 'a', discovery_potential: 0.95, status: 'gated' },
      { name: 'b', discovery_potential: 0.15, status: 'occupied' },
    ]);
    expect(spans[0].surface.name).toBe('a');
    expect(spans[0].span).toBeGreaterThanOrEqual(spans[1].span);
  });
});

// --- board: approve/reject calls resolve INTENT (never a graph write) ---------
describe('board decision → resolve API (gated-write intent)', () => {
  it('approve calls resolve with the §4.1 payload, not a graph write', async () => {
    const resolve = vi.fn(async () => ({ resolved: true, new_status: 'CLEARED' }));
    const onResolved = vi.fn();
    const items = [{ item_id: 'g1', type: 'gated-option', status: 'PENDING', kind: 'Gated option',
                     age: '2m', title: 'Unlock X', meta: ['$26k'], recommendation: 'EV +0.7', version: 1,
                     options: ['approve', 'reject'] }];
    render(<BoardQueue contract={{ resolve }} items={items} onResolved={onResolved} />);
    fireEvent.click(screen.getByText('Approve & onboard'));
    await waitFor(() => expect(resolve).toHaveBeenCalledWith(
      { gate_item_id: 'g1', decision: 'approve', gate_item_version: 1 }));
    expect(onResolved).toHaveBeenCalledWith('g1', 'CLEARED');
  });
  it('BoardQueue exposes no direct-write path (only resolve intent)', () => {
    const src = fs.readFileSync(path.join(HERE, 'components/BoardQueue.jsx'), 'utf8');
    expect(src).not.toMatch(/session|driver|MERGE|CREATE|\.run\(/i);
    expect(src).toMatch(/contract\.resolve/);
  });
  it('concluded items show Re-evaluate, which calls the deliberate-review intent (not a graph write)', async () => {
    const reevaluate = vi.fn(async () => ({ state: 'queued' }));
    const items = [{ item_id: 'new-search-surface:V-015', type: 'new-search-surface', status: 'CLEARED',
                     kind: 'Cleared', title: 'V-015 payment-cycle flows', age: 'now',
                     disposition: 'killed (all flows null, as tested)' }];
    // a provisional component makes a re-judge worthwhile → the button renders
    const runs = [{ parent: 'new-search-surface:V-015', recipe_id: 'V-015-TDF', provisional: true, classified_by: 'heuristic',
      result: { t: 1.6, n: 576, gate_pass: false, gate: {} } }];
    render(<BoardQueue contract={{ resolve: vi.fn(), reevaluate }} items={items} onResolved={vi.fn()} runs={runs} lessons={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /Re-judge/i }));   // "↻ Re-judge stored results" — no data fetched
    await waitFor(() => expect(reevaluate).toHaveBeenCalledWith('new-search-surface:V-015'));
  });
  it('terminus proposals render provenance badges (derived / combination) and survive missing meta/options', () => {
    const items = [
      { item_id: 'D-1', type: 'new-search-surface', status: 'PENDING', kind: 'Needs data',
        title: 'tail variant of X', provenance: 'derived', derived_from: 'V-015-TOM', ev: 0 },
      { item_id: 'C-1', type: 'new-search-surface', status: 'PENDING', kind: 'Needs build',
        title: 'COMBINE A x B', provenance: 'combination', oos_window: 'sealed holdout', ev: 0 },
    ];
    const { container } = render(<BoardQueue contract={{ resolve: vi.fn() }} items={items} onResolved={vi.fn()} />);
    expect(container.querySelector('.prov-derived')).toBeTruthy();   // ⌥ derived badge
    expect(container.querySelector('.prov-combo')).toBeTruthy();     // ⋈ combine badge
    expect(screen.getByText('tail variant of X')).toBeTruthy();  // no crash on absent meta/options
  });
});

// --- data-needs onboarding: credential → server-side field, never in state ----
describe('onboarding credential firewall', () => {
  it('credential goes to onboard() and is never passed to the analyst', async () => {
    const onboard = vi.fn(async () => ({ configured: true }));
    const analyst = vi.fn();
    const gated = [{ id: 'options_skew', surface: 'Options · skew', vendor: 'ORATS', price: '$9,200',
                     unlocks: '6 cells', ev: '+0.48', likely_death: 'capacity' }];
    render(<DataNeeds contract={{ onboard, analyst }} gated={gated} />);
    fireEvent.click(screen.getByText('Approve & onboard'));
    const input = screen.getByLabelText(/API key for Options/i);
    fireEvent.change(input, { target: { value: 'sk-SECRET-XYZ' } });
    fireEvent.click(screen.getByText('Store server-side'));
    await waitFor(() => expect(onboard).toHaveBeenCalled());
    const arg = onboard.mock.calls[0][0];
    expect(arg.credential).toBe('sk-SECRET-XYZ');   // posted to the server-side field
    expect(analyst).not.toHaveBeenCalled();          // NEVER to the analyst
    expect(input.value).toBe('');                     // cleared — not persisted in the DOM/state
  });
  it('uses an uncontrolled field (value never enters React state)', () => {
    const src = fs.readFileSync(path.join(HERE, 'components/DataNeeds.jsx'), 'utf8');
    expect(src).toMatch(/useRef/);                    // ref, not useState, for the credential
    expect(src).not.toMatch(/useState\([^)]*credential/i);
  });
});

// --- firewall: no 7687 / trading-engine reference anywhere in the console ------
describe('UI firewall', () => {
  it('no 7687 / trading-engine identifier in the discovery source', () => {
    const files = walk(HERE).filter((f) => /\.(jsx?|css)$/.test(f) && !f.endsWith('.test.jsx'));
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      // the hard trading-engine identifiers (the port + the node label) — prose
      // that merely says "not the trading engine" is fine; a 7687/TradeNode ref is not
      expect(src, `${f} must hold no 7687 reference`).not.toMatch(/7687|TradeNode/);
    }
  });
  it('default mode is live (reads 7688 via proxy, falls back to file→mock)', async () => {
    const c = makeContract();                       // default → live
    expect(c.mode).toBe('live');
    const grid = await c.query('grid');             // proxy + file fetch both fail in jsdom → mock fallback
    expect(Array.isArray(grid)).toBe(true);
    expect(typeof c.resolve).toBe('function');      // intent path, still no graph write
    expect(c.write).toBeUndefined();
  });
  it('grounded analyst answers "what is runnable now" from the live board (V-015)', async () => {
    const board = [{ kind: 'Runnable now', title: 'V-015 payment-cycle / rebalancing flows' },
                   { kind: 'Needs build', title: 'V-008 neglected-universe event composite' }];
    const q = async (slice) => (slice === 'board' ? board : []);
    const r = await groundedAnalyst('what is runnable now?', q);
    expect(r.kind).toBe('EXPLAIN');
    expect(r.explanation).toContain('V-015');            // grounded in live state
  });
  it('the contract exposes reads + intent only (no graph-write method)', () => {
    const c = makeContract('mock');
    expect(typeof c.query).toBe('function');
    expect(typeof c.resolve).toBe('function');       // intent, not a graph write
    expect(c.write).toBeUndefined();
    expect(c.session).toBeUndefined();
  });
  it('mock resolve is optimistic-concurrency aware (stale version rejected)', async () => {
    const c = makeContract('mock');
    const bad = await c.resolve({ gate_item_id: c._board[0].item_id, decision: 'approve', gate_item_version: 99 });
    expect(bad.rejected).toBe(true);
    const ok = await c.resolve({ gate_item_id: c._board[0].item_id, decision: 'approve', gate_item_version: 1 });
    expect(ok.resolved).toBe(true);
  });
});

// --- the engine power switch (topbar button) --------------------------------
describe('engine power switch button', () => {
  const noop = () => {};
  it('stopped → grey, click starts', () => {
    const onStart = vi.fn();
    render(<Topbar tab="Coverage" setTab={noop} cellsMapped={0} engineStatus="stopped" onStart={onStart} onStop={noop} />);
    const btn = screen.getByRole('button', { name: /Engine stopped/i });
    fireEvent.click(btn);
    expect(onStart).toHaveBeenCalled();
  });
  it('running → confirm-on-stop (confirm true → stops)', () => {
    const onStop = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Topbar tab="Coverage" setTab={noop} cellsMapped={1134} engineStatus="running" onStart={noop} onStop={onStop} />);
    fireEvent.click(screen.getByRole('button', { name: /Engine running/i }));
    expect(onStop).toHaveBeenCalled();
    window.confirm.mockRestore();
  });
  it('running → confirm cancelled → does NOT stop (no accidental kill)', () => {
    const onStop = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Topbar tab="Coverage" setTab={noop} cellsMapped={1134} engineStatus="running" onStart={noop} onStop={onStop} />);
    fireEvent.click(screen.getByRole('button', { name: /Engine running/i }));
    expect(onStop).not.toHaveBeenCalled();
    window.confirm.mockRestore();
  });
  it('starting → amber, not clickable', () => {
    const onStart = vi.fn(), onStop = vi.fn();
    render(<Topbar tab="Coverage" setTab={noop} cellsMapped={0} engineStatus="starting" onStart={onStart} onStop={onStop} />);
    const btn = screen.getByRole('button', { name: /Starting/i });
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onStart).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
  });
  it('contract engine methods control the service (start→starting, stop→stopping)', async () => {
    const c = makeContract('mock');
    expect((await c.engineStatus()).status).toBe('stopped');
    expect((await c.engineStart()).status).toBe('starting');
    expect((await c.engineStop()).status).toBe('stopping');
    // the switch is separate from research — resolve is unaffected
    expect(typeof c.resolve).toBe('function');
  });
});

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// --- Timeline / Watches view (revival schedule + data-pull queue + history) --
// Driven by the REAL seed read_model.json (now with PERSISTED monitor state):
// B-AG recheck 2026-12 is a revival watch with a real last_checked, the recent-
// decay trio is watched, the gated surfaces appear in the data-pull queue, and
// the scan_history slice shows a real recheck ran (no "not persisted" banner).
describe('Timeline / Watches view', () => {
  const RM = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', 'public', 'read_model.json'), 'utf8'));
  const seedContract = () => ({
    mode: 'real',
    query: async (slice) => RM[slice] ?? null,
    // firewall tripwires: if the Timeline ever tried to act, these would be hit
    resolve: () => { throw new Error('Timeline must not resolve'); },
    onboard: () => { throw new Error('Timeline must not onboard'); },
  });

  it('reads the STRUCTURED watches slice — B-AG with recheck 2026-12 + a real last_checked', async () => {
    render(<TimelineView contract={seedContract()} />);
    await waitFor(() => expect(screen.getAllByText('B-AG').length).toBeGreaterThan(0));
    expect(screen.getAllByText(/2026-12/).length).toBeGreaterThan(0);
    // the persisted last_checked timestamp is shown (proving it came from the monitor, not the seed text)
    const bag = RM.watches.find((w) => w.id === 'B-AG');
    expect(bag.last_checked).toBeTruthy();
    expect(screen.getAllByText(new RegExp(bag.last_checked.slice(0, 10))).length).toBeGreaterThan(0);
  });

  it('the recent-decay trio (B-AG, low-vol, sin) all show as watched', async () => {
    render(<TimelineView contract={seedContract()} />);
    await waitFor(() => expect(screen.getAllByText('B-AG').length).toBeGreaterThan(0));
    for (const id of ['B1xlow-vol', 'B1xsin']) {
      if (RM.watches.some((w) => w.id === id)) expect(screen.getByText(id)).toBeTruthy();
    }
  });

  it('data-pull queue surfaces the gated data needs (options/futures/relational)', async () => {
    render(<TimelineView contract={seedContract()} />);
    await waitFor(() => expect(screen.getByText(/Data-pull queue/)).toBeTruthy());
    const first = RM.gated[0];
    if (first) expect(screen.getAllByText(new RegExp(first.surface.split(/[ ·]/)[0], 'i')).length).toBeGreaterThan(0);
  });

  it('recheck history shows a real scan ran — no "not persisted" banner', async () => {
    render(<TimelineView contract={seedContract()} />);
    await waitFor(() => expect(screen.getByText(/Recheck history/)).toBeTruthy());
    // the persisted scan is surfaced (evaluated count from scan_history)
    expect(screen.getAllByText(/Last scan/i).length).toBeGreaterThan(0);
    // the honesty-gap banner is GONE now that §1 persists the data
    expect(screen.queryByText(/not persisted/i)).toBeNull();
  });

  it('firewall: reads only — never resolves or onboards', async () => {
    // seedContract throws if resolve/onboard is called; a clean render proves read-only
    const { container } = render(<TimelineView contract={seedContract()} />);
    await waitFor(() => expect(screen.getByText(/Revival watches/)).toBeTruthy());
    expect(container.querySelector('button.exp-mini')).toBeTruthy();   // export is the only action (read-only MD)
  });
});

// --- Floating analyst panel (conversation + upload firewall + export + minimize)
describe('floating analyst panel', () => {
  const mkContract = (over = {}) => ({
    mode: 'mock',
    query: async (slice) => (slice === 'board'
      ? [{ item_id: 'b1', title: 'B1', kind: 'x' }] : []),
    analyst: vi.fn(async ({ ask }) => ({ kind: 'EXPLAIN', explanation: `answer to: ${ask}` })),
    onboard: () => { throw new Error('analyst chat must NEVER onboard'); },
    resolve: () => { throw new Error('analyst chat must NEVER resolve'); },
    ...over,
  });

  const reset = () => { try { localStorage.clear(); } catch { /* ok */ } };

  it('conversation: ask renders the analyst answer in the panel history', async () => {
    reset();
    const c = mkContract();
    render(<AnalystPanel contract={c} />);
    fireEvent.change(screen.getByLabelText(/Ask the analyst/i), { target: { value: 'what is B1?' } });
    fireEvent.submit(screen.getByLabelText(/Ask the analyst/i).closest('form'));
    await waitFor(() => expect(screen.getByText(/answer to: what is B1\?/)).toBeTruthy());
    expect(screen.getByText('what is B1?')).toBeTruthy();     // the user turn is in the history too
    expect(c.analyst).toHaveBeenCalledWith(expect.objectContaining({ ask: 'what is B1?' }));
  });

  it('file upload is a DISCUSSION attachment only — never onboards/seeds engine state', async () => {
    reset();
    const c = mkContract();
    const { container } = render(<AnalystPanel contract={c} />);
    const file = new File(['col_a,col_b\n1,2'], 'notes.csv', { type: 'text/csv' });
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/discussion only|never becomes engine state/i)).toBeTruthy());
    // the chat file never reaches onboarding/resolve (those throw if called)
    // and the attachment rides along as discussion context on the next ask
    fireEvent.change(screen.getByLabelText(/Ask the analyst/i), { target: { value: 'summarize' } });
    fireEvent.submit(screen.getByLabelText(/Ask the analyst/i).closest('form'));
    await waitFor(() => expect(c.analyst).toHaveBeenCalled());
    expect(c.analyst.mock.calls[0][0].attachment).toBeTruthy();   // passed as discussion context
  });

  it('export request produces MD without calling the analyst (read-only)', async () => {
    reset();
    const c = mkContract();
    render(<AnalystPanel contract={c} />);
    fireEvent.change(screen.getByLabelText(/Ask the analyst/i), { target: { value: 'export the board' } });
    fireEvent.submit(screen.getByLabelText(/Ask the analyst/i).closest('form'));
    await waitFor(() => expect(screen.getByText(/Exported/i)).toBeTruthy());
    expect(c.analyst).not.toHaveBeenCalled();                    // export is not an analyst call
  });

  it('minimize collapses to a corner bubble and reopens (not just close)', async () => {
    reset();
    render(<AnalystPanel contract={mkContract()} />);
    fireEvent.click(screen.getByTitle(/Minimize/i));
    const bubble = await screen.findByRole('button', { name: /Open analyst/i });
    expect(bubble).toBeTruthy();
    fireEvent.click(bubble);
    await waitFor(() => expect(screen.getByLabelText(/Ask the analyst/i)).toBeTruthy());  // reopened
  });

  it('the analyst answers a recheck question from the live watches/scan slices', async () => {
    const watches = [{ id: 'B-AG', disposition: 'fast-scan', trigger: 'data-advance',
      recheck_due: '2026-12', last_checked: '2026-07-04T12:00:00+00:00', status: 'ran-no-change' }];
    const scans = [{ at: '2026-07-04T12:00:00+00:00', evaluated: 8, revived: 0 }];
    const q = async (slice) => (slice === 'watches' ? watches : slice === 'scan_history' ? scans : []);
    const r = await groundedAnalyst('did the B-AG recheck run?', q);
    expect(r.kind).toBe('EXPLAIN');
    expect(r.explanation).toMatch(/B-AG/);
    expect(r.explanation).toMatch(/2026-12|ran|re-scanned|stayed dead/i);   // grounded in real monitor state
  });
});

// --- proxy power switch (restart the SignalDeltaProxy service from the console) --
describe('proxy control button', () => {
  const base = { tab: 'Coverage', setTab: () => {}, cellsMapped: 0,
                 engineStatus: 'running', onStart: () => {}, onStop: () => {} };

  it('running → confirm-on-restart fires onProxyRestart', () => {
    const onProxyRestart = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Topbar {...base} proxyStatus="running" onProxyRestart={onProxyRestart} />);
    fireEvent.click(screen.getByText(/Proxy live/).closest('button'));
    expect(window.confirm).toHaveBeenCalled();          // confirm-on-restart (not accidental)
    expect(onProxyRestart).toHaveBeenCalled();
    window.confirm.mockRestore();
  });

  it('confirm cancelled → does NOT restart', () => {
    const onProxyRestart = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Topbar {...base} proxyStatus="running" onProxyRestart={onProxyRestart} />);
    fireEvent.click(screen.getByText(/Proxy live/).closest('button'));
    expect(onProxyRestart).not.toHaveBeenCalled();
    window.confirm.mockRestore();
  });

  it('proxy button is Update & restart; a stale commit shows the stale chip', () => {
    const onUpd = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { container } = render(<Topbar {...base} proxyStatus="running"
      proxyCommit={{ running_commit: 'aaa1111', tree_commit: 'bbb2222', stale: true }}
      onProxyUpdateRestart={onUpd} onProxyRestart={vi.fn()} />);
    // running-commit visibility: stale chip shows running→tree
    expect(container.querySelector('.commit-chip.stale')).toBeTruthy();
    expect(screen.getByText(/aaa1111→bbb2222/)).toBeTruthy();
    // the action updates then restarts (not a bare restart)
    fireEvent.click(screen.getByText(/Proxy live/).closest('button'));
    expect(onUpd).toHaveBeenCalled();
    window.confirm.mockRestore();
  });

  it('restarting → amber label, not clickable', () => {
    render(<Topbar {...base} proxyStatus="restarting" onProxyRestart={vi.fn()} />);
    const btn = screen.getByText(/Restarting/).closest('button');
    expect(btn.disabled).toBe(true);
  });

  it('mock contract: restart transitions running → restarting', async () => {
    const c = makeContract('mock');
    expect((await c.proxyStatus()).status).toBe('running');
    expect((await c.proxyRestart()).status).toBe('restarting');
    expect((await c.proxyStatus()).status).toBe('restarting');
  });

  it('live contract: proxy control degrades gracefully when unreachable', async () => {
    const c = makeContract('live');                     // fetch fails in jsdom
    const r = await c.proxyStatus();
    expect(typeof r.status).toBe('string');              // never throws — 'unreachable' fallback
    expect((await c.proxyRestart()).status).toBe('restarting');
  });
});

// --- decision queue: sorted by readiness tier, then EV within tier -----------
describe('decision queue readiness sort', () => {
  const mk = (id, kind, type, ev, title) => ({ item_id: id, type, status: 'PENDING', kind, ev,
    age: 'seed', title, meta: [], recommendation: '', version: 1, options: ['hold'] });

  it('tier bands render RUNNABLE-NOW → NEEDS-DATA → NEEDS-BUILD → NEEDS-BROKER', () => {
    const items = [
      mk('nk', 'setup-state', 'setup-state', 0.74, 'V-028'),
      mk('nb', 'engine-change-needed', 'engine-change-needed', 0.82, 'V-008'),
      mk('rn', 'new-search-surface', 'new-search-surface', 0.88, 'V-015'),
      mk('nd', 'gated-option', 'gated-option', 0.78, 'V-020'),
    ];
    items[2].kind = 'Runnable now'; items[3].kind = 'Needs data';
    items[1].kind = 'Needs build'; items[0].kind = 'Needs broker';
    const { container } = render(<BoardQueue contract={{}} items={items} onResolved={() => {}} />);
    const bands = [...container.querySelectorAll('.tier-band .tb-label')].map((e) => e.textContent);
    expect(bands.slice(0, 4)).toEqual(['RUNNABLE NOW', 'NEEDS DATA', 'NEEDS BUILD', 'NEEDS BROKER']);  // CONCLUDED band follows
    expect(container.querySelector('.item .ttl').textContent).toMatch(/V-015/);   // runnable-now tops the board
  });

  it('within a tier, higher EV leads (V-008 over enumerated whitespace)', () => {
    const items = [
      mk('gen', 'engine-change-needed', 'engine-change-needed', 0.70, 'Probe relational'),
      mk('v8', 'engine-change-needed', 'engine-change-needed', 0.82, 'V-008 event composite'),
    ];
    items.forEach((i) => (i.kind = 'Needs build'));
    const { container } = render(<BoardQueue contract={{}} items={items} onResolved={() => {}} />);
    const titles = [...container.querySelectorAll('.item .ttl')].map((e) => e.textContent);
    expect(titles[0]).toMatch(/V-008/);
  });

  it('the REAL seed sorts V-015 top and V-008 leading needs-build', () => {
    const RM = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', 'public', 'read_model.json'), 'utf8'));
    const { container } = render(<BoardQueue contract={{}} items={RM.board} onResolved={() => {}} />);
    const titles = [...container.querySelectorAll('.item .ttl')].map((e) => e.textContent);
    expect(titles[0]).toMatch(/V-015/);
    const groups = [...container.querySelectorAll('.tier-group')];
    const nb = groups.find((g) => /NEEDS BUILD/.test(g.querySelector('.tb-label')?.textContent || ''));
    expect(nb.querySelector('.item .ttl').textContent).toMatch(/V-008/);
  });
});

// --- data-needs: richer fields + the Price-it/Research firewall ---------------
describe('data-needs fields + price-it', () => {
  const gated = [{ id: 'rel', surface: 'Relational · graph', blocker: 'needs-data', unlocks: '8 cells',
    cost_yr: 'unpriced — research needed', monthly: 'unpriced — research needed', vendor: 'unpriced — research needed',
    terms: 'unpriced — research needed', what_you_get: 'supplier/customer linkages',
    tiers: 'unpriced — research needed', ev: 'unpriced — research needed', likely_death: 'gated-data-cost' }];

  it('shows the priceable fields and "unpriced — research needed" where unknown', () => {
    render(<DataNeeds contract={{}} gated={gated} />);
    for (const label of ['Cost / yr', 'Monthly option', 'Vendor', 'Contract terms', 'What you get', 'Tiers']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getAllByText(/unpriced — research needed/).length).toBeGreaterThan(0);
  });

  it('"Price it / Research" runs the worker + fills fields — never onboards/resolves', async () => {
    const research = vi.fn(async () => ({ researched: true, surface_id: 'rel',
      fields: { vendor: 'FactSet Revere', cost_yr: 'quote required', monthly: 'quote required',
                terms: 'enterprise', tiers: 'Enterprise', what_you_get: 'linkages' },
      questions: [], note: 'researched cost — no purchase' }));
    const onboard = vi.fn(); const resolve = vi.fn();
    render(<DataNeeds contract={{ research, onboard, resolve }} gated={gated} />);
    fireEvent.click(screen.getByText('Price it / Research'));
    await waitFor(() => expect(research).toHaveBeenCalledWith(expect.objectContaining({ surface_id: 'rel' })));
    expect(onboard).not.toHaveBeenCalled();          // never buys
    expect(resolve).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('FactSet Revere')).toBeTruthy());  // field populated
    expect(screen.getByText('priced ✓')).toBeTruthy();
  });

  it('worker questions hand off to the assistant (Part C)', async () => {
    const research = vi.fn(async () => ({ researched: true, surface_id: 'rel', fields: {},
      questions: [{ kind: 'tier', q: 'Which tier fits?' }], note: '' }));
    const onAskAssistant = vi.fn();
    render(<DataNeeds contract={{ research }} gated={gated} onAskAssistant={onAskAssistant} resolutions={{}} />);
    fireEvent.click(screen.getByText('Price it / Research'));
    await waitFor(() => expect(screen.getByText(/Which tier fits/)).toBeTruthy());
    fireEvent.click(screen.getByText('Ask the assistant'));
    expect(onAskAssistant).toHaveBeenCalledWith('rel', 'Relational · graph', 'Which tier fits?');
  });

  it('a recorded resolution shows on the card', () => {
    render(<DataNeeds contract={{}} gated={gated} resolutions={{ rel: 'API tier, no intraday' }} />);
    expect(screen.getByText(/Resolved with the assistant/)).toBeTruthy();
    expect(screen.getByText(/API tier, no intraday/)).toBeTruthy();
  });

  it('mock research() is intent-only (fills fields, no credential/spend)', async () => {
    const r = await makeContract('mock').research({ surface_id: 'options_skew', surface: 'Options · skew' });
    expect(r.researched).toBe(true);
    expect(r.fields.vendor).toMatch(/ORATS/);
    expect(r.credential).toBeUndefined();
  });
});

// --- Part C: the assistant panel poses the worker question + records the answer -
describe('assistant panel — costing handoff', () => {
  it('poses a costing question and records the operator answer (no spend)', async () => {
    const analyst = vi.fn(async () => ({ kind: 'EXPLAIN', explanation: 'The API tier gives the IV surface.' }));
    const onCostingResolved = vi.fn();
    const cq = { surface_id: 'rel', surface: 'Relational · graph', question: 'Which tier fits?' };
    render(<AnalystPanel contract={{ analyst, query: async () => [] }}
                         costingQuestion={cq} onCostingResolved={onCostingResolved} />);
    await waitFor(() => expect(screen.getByText(/Which tier fits/)).toBeTruthy());   // question posed
    fireEvent.change(screen.getByLabelText(/Ask the analyst/i), { target: { value: 'API tier is fine' } });
    fireEvent.submit(screen.getByLabelText(/Ask the analyst/i).closest('form'));
    await waitFor(() => expect(onCostingResolved).toHaveBeenCalledWith('rel', 'API tier is fine'));
    expect(screen.getByText(/Recorded for Relational/)).toBeTruthy();
  });
});

// --- probe run: Approve→run→result, one-at-a-time queue, Hold, In-progress tab --
describe('probe run states + queue', () => {
  const runnable = (id, title, ev) => ({ item_id: id, type: 'new-search-surface', status: 'PENDING',
    kind: 'Runnable now', ev, age: 'seed', title, meta: [], recommendation: 'r', version: 1, options: ['approve', 'hold'] });

  it('Approve scope enqueues a run (resolve intent) — never runs client-side', async () => {
    const resolve = vi.fn(async () => ({ resolved: true, new_status: 'QUEUED', enqueued: true, recipe_id: 'V-015' }));
    const items = [runnable('new-search-surface:V-015', 'V-015 payment-cycle', 0.88)];
    render(<BoardQueue contract={{ resolve }} items={items} onResolved={() => {}} probe={{ running: null, queue: [], done: [] }} />);
    fireEvent.click(screen.getByText('Approve scope'));
    await waitFor(() => expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ gate_item_id: 'new-search-surface:V-015', decision: 'approve' })));
  });

  it('a RUNNING component greys the card + shows the flow stage; siblings queue', () => {
    const items = [runnable('new-search-surface:V-015', 'V-015', 0.88)];
    const P = 'new-search-surface:V-015';
    const probe = { running: { item_id: `${P}#V-015-TOM`, parent: P, recipe_id: 'V-015-TOM', stage: 'computing' },
      queue: [{ item_id: `${P}#V-015-DFC`, parent: P, recipe_id: 'V-015-DFC' }], done: [] };
    render(<BoardQueue contract={{}} items={items} onResolved={() => {}} probe={probe} />);
    expect(screen.getByText('RUNNING')).toBeTruthy();
    expect(screen.getByText('TOM')).toBeTruthy();
    expect(screen.getByText('DFC')).toBeTruthy();
    expect(screen.getByText(/computing/)).toBeTruthy();
    expect(screen.getByText('Running…').closest('button').disabled).toBe(true);   // one-at-a-time: no re-approve
  });

  it('a component null does NOT kill the surface — a survivor keeps it a candidate', () => {
    const items = [runnable('new-search-surface:V-015', 'V-015', 0.88)];
    const P = 'new-search-surface:V-015';
    const probe = { running: null, queue: [], done: [
      { item_id: `${P}#V-015-TOM`, parent: P, recipe_id: 'V-015-TOM', disposition: 'killed (no-edge, as tested)', result: { t: 0.03, n: 1704 } },
      { item_id: `${P}#V-015-DFC`, parent: P, recipe_id: 'V-015-DFC', disposition: 'retained-candidate', result: { t: 3.4, n: 40 } },
      { item_id: `${P}#V-015-TDF`, parent: P, recipe_id: 'V-015-TDF', disposition: 'killed (no-edge, as tested)', result: { t: 0.5, n: 30 } } ] };
    render(<BoardQueue contract={{}} items={items} onResolved={() => {}} probe={probe} />);
    expect(screen.getByText(/killed . t=0.03/)).toBeTruthy();     // TOM killed
    expect(screen.getByText(/retained . t=3.4/)).toBeTruthy();    // DFC survived
    expect(screen.getByText(/a flow survived/)).toBeTruthy();     // surface NOT killed
  });

  it('Hold parks the item with a visible HELD state (not a dead click)', async () => {
    const resolve = vi.fn(async () => ({ resolved: true, new_status: 'HELD', held: true }));
    const items = [runnable('new-search-surface:V-015', 'V-015', 0.88)];
    render(<BoardQueue contract={{ resolve }} items={items} onResolved={() => {}} probe={{ running: null, queue: [], done: [] }} />);
    fireEvent.click(screen.getByText('Hold'));
    await waitFor(() => expect(screen.getByText('HELD')).toBeTruthy());
  });

  it('In-progress tab shows the running stages, the queue, and finished results', () => {
    const probe = { running: { item_id: 'x', title: 'V-015', recipe_id: 'V-015', stage: 'computing',
        steps: [{ stage: 'fetching data', detail: '24 names' }, { stage: 'computing', detail: '1704 vs 7224' }] },
      queue: [{ item_id: 'y', title: 'V-008', recipe_id: 'V-008' }],
      done: [{ item_id: 'z', title: 'V-020', recipe_id: 'V-020', disposition: 'killed (no-edge, as tested)',
               result: { edge_pct_per_day: 0.0018, t: 0.03, n: 1704, gate_pass: false } }] };
    render(<InProgress probe={probe} />);
    expect(screen.getByText('Running now')).toBeTruthy();
    expect(screen.getAllByText(/V-015/).length).toBeGreaterThan(0);
    expect(screen.getByText('1704 vs 7224')).toBeTruthy();     // live stage detail
    expect(screen.getByText(/Queue/)).toBeTruthy();
    expect(screen.getByText('FAIL')).toBeTruthy();             // finished result gate outcome
  });

  it('idle In-progress says so plainly', () => {
    render(<InProgress probe={{ running: null, queue: [], done: [] }} />);
    expect(screen.getByText(/Nothing running/)).toBeTruthy();
  });
});

// --- gated learning: propose ≠ bank; operator Bank/Reject --------------------
describe('gated learning (lessons)', () => {
  it('In-progress shows a PROPOSED lesson with Bank/Reject that fire the gate', () => {
    const onBank = vi.fn(); const onReject = vi.fn();
    const lessons = [{ id: 'lesson-v015-tom-seed', status: 'PROPOSED', source: 'V-015-TOM',
      text: 'V-015-TOM turn-of-month: t=0.03, n=1704 — structural, null.' }];
    render(<InProgress probe={{ running: null, queue: [], done: [] }} lessons={lessons} onBank={onBank} onReject={onReject} />);
    expect(screen.getByText('PROPOSED')).toBeTruthy();
    expect(screen.getByText(/t=0.03, n=1704/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bank' }));
    expect(onBank).toHaveBeenCalledWith('lesson-v015-tom-seed');
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onReject).toHaveBeenCalledWith('lesson-v015-tom-seed');
  });

  it('a BANKED lesson shows without Bank/Reject (already banked)', () => {
    const lessons = [{ id: 'x', status: 'BANKED', text: 'banked lesson' }];
    render(<InProgress probe={{ running: null, queue: [], done: [] }} lessons={lessons} />);
    expect(screen.getByText('BANKED')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bank' })).toBeNull();
  });

  it('mock contract: propose ≠ bank (only bankLesson sets BANKED)', async () => {
    const c = makeContract('mock');
    const seed = (await c.lessons()).find((l) => l.id === 'lesson-v015-tom-seed');
    expect(seed.status).toBe('PROPOSED');             // seeded proposed, not banked
    const p = await c.proposeLesson('new lesson', 'src');
    expect(p.status).toBe('PROPOSED');                // propose only proposes
    const b = await c.bankLesson('lesson-v015-tom-seed');
    expect(b.status).toBe('BANKED');                  // operator Bank promotes
    expect((await c.lessons()).find((l) => l.id === 'lesson-v015-tom-seed').status).toBe('BANKED');
  });
});

// --- THE RUN ROOM + terminus report -----------------------------------------
describe('Run Room + terminus report', () => {
  const run = {
    item_id: 'new-search-surface:V-015#V-015-TDF', recipe_id: 'V-015-TDF', parent: 'new-search-surface:V-015',
    status: 'done', stage: 'result', disposition: 'inconclusive (underpowered, as tested)',
    classification: 'underpowered', mechanism: 'right-signed but under-powered', revival_condition: 'powered re-test',
    classified_by: 'llm', provisional: false,
    progress: [{ stage: 'validating recipe', detail: 'V-015-TDF' }, { stage: 'result', detail: 'inconclusive' }],
    result: { edge_pct_per_day: 0.14, t: 1.61, n: 576, window: ['2025-01-04', '2026-07-04'], universe: 24, gate_pass: false },
    reports: [
      { version: 1, classified_by: 'heuristic', classification: 'structural-change', disposition: 'killed (no-edge, as tested)', provisional: true },
      { version: 2, classified_by: 'llm', classification: 'underpowered', disposition: 'inconclusive (underpowered, as tested)', provisional: false },
    ],
  };
  const slices = {
    lessons: [{ id: 'L1', status: 'PROPOSED', source: 'terminus:V-015-TDF · llm', text: 'inconclusive, not a null' }],
    board: [{ item_id: 'D:V-015-TDF-FULL', provenance: 'derived', derived_from: 'V-015-TDF', title: 'V-015-TDF-FULL powered re-test', ev: 0.67, blocker: 'runnable-now' }],
    correlations: [],
  };

  it('composeReport builds all six blocks from the slices', () => {
    const r = composeReport(run, slices);
    expect(r.result.t).toBe(1.61);
    expect(r.classification.class).toBe('underpowered');
    expect(r.classification.by).toBe('llm');
    expect(r.lessons).toHaveLength(1);
    expect(r.derivations[0].item_id).toBe('D:V-015-TDF-FULL');
    expect(r.versions).toHaveLength(2);
  });

  it('versionDiff shows the correction (v1 heuristic → v2 LLM)', () => {
    const d = versionDiff(run.reports[0], run.reports[1]);
    expect(d.join(' ')).toMatch(/killed.*inconclusive/i);
    expect(d.join(' ')).toMatch(/heuristic.*llm/i);
  });

  it('RunRoom renders the report + version diff, and Bank/Reject are inline', () => {
    const onBank = vi.fn();
    render(<RunRoom run={run} slices={slices} onClose={vi.fn()} onBank={onBank} onReject={vi.fn()} />);
    expect(screen.getByText('Run report')).toBeTruthy();
    expect(screen.getByText('underpowered')).toBeTruthy();          // classification block
    expect(screen.getByText(/V-015-TDF-FULL powered re-test/)).toBeTruthy();   // derivation card
    expect(screen.getByText(/Correction history/i)).toBeTruthy();   // versioning
    fireEvent.click(screen.getByRole('button', { name: 'Bank' }));
    expect(onBank).toHaveBeenCalledWith('L1');                      // inline gate
  });

  it('mergeRuns overlays live probe stages; runsForSurface filters by surface', () => {
    const merged = mergeRuns([run], { running: { item_id: run.item_id, stage: 'computing', steps: [{ stage: 'computing' }] } });
    expect(merged.find((r) => r.item_id === run.item_id).stage).toBe('computing');   // live overlay wins
    expect(runsForSurface([run], 'V-015')).toHaveLength(1);
    expect(surfaceOf('new-search-surface:V-015#V-015-TDF')).toBe('V-015');
  });

  it('board component chip opens the component Run Room', () => {
    const onOpenRun = vi.fn();
    const items = [{ item_id: 'new-search-surface:V-015', status: 'CLEARED', kind: 'Cleared', title: 'V-015',
                     disposition: 'killed (all flows null)', components: { 'V-015-TDF': 'inconclusive', 'V-015-TOM': 'killed' } }];
    render(<BoardQueue contract={{ resolve: vi.fn(), reevaluate: vi.fn() }} items={items} onResolved={vi.fn()} onOpenRun={onOpenRun} />);
    fireEvent.click(screen.getByText('TDF'));
    expect(onOpenRun).toHaveBeenCalledWith('new-search-surface:V-015#V-015-TDF');
  });

  it('provisional lessons have NO Bank button; LLM lessons do; Unbank on banked; superseded/retracted shown', () => {
    const onUnbank = vi.fn();
    const lessons = [
      { id: 'L-prov', status: 'PROPOSED', provisional: true, text: 'heuristic draft', source: 'terminus:V-015-TDF · v1 · heuristic' },
      { id: 'L-llm', status: 'PROPOSED', provisional: false, text: 'llm draft', source: 'terminus:V-015-TDF · v2 · llm' },
      { id: 'L-bank', status: 'BANKED', text: 'banked lesson', source: 'seed' },
      { id: 'L-old', status: 'SUPERSEDED', text: 'old dup', source: 'terminus:V-015-TDF · v1' },
      { id: 'L-ret', status: 'RETRACTED', text: 'retracted', source: 'terminus:V-015-DFC' },
    ];
    render(<InProgress probe={{ running: null, queue: [], done: [] }} lessons={lessons} onBank={vi.fn()} onUnbank={onUnbank} onReject={vi.fn()} />);
    // exactly ONE Bank button (the LLM lesson); the provisional one has none
    expect(screen.getAllByRole('button', { name: 'Bank' })).toHaveLength(1);
    expect(screen.getByText(/heuristic draft — Re-evaluate to enable Bank/i)).toBeTruthy();
    // Unbank on the banked lesson
    fireEvent.click(screen.getByRole('button', { name: 'Unbank' }));
    expect(onUnbank).toHaveBeenCalledWith('L-bank');
    expect(screen.getByText('SUPERSEDED')).toBeTruthy();
    expect(screen.getByText('RETRACTED')).toBeTruthy();
  });

  it('computeAttention surfaces re-evaluate + approve + provisional-lesson, each with a reason', () => {
    const runs = [{ parent: 'new-search-surface:V-015', recipe_id: 'V-015-TDF', disposition: 'killed (no-edge, as tested)',
      classified_by: 'heuristic', provisional: true, result: { gate_pass: false, t: 1.61, n: 576, edge_pct_per_day: 0.14, gate: { min_abs_t: 2.0, direction: 'positive' } } }];
    const board = [{ item_id: 'D:V-015-TDF-FULL', recipe_id: 'V-015-TDF-FULL', provenance: 'derived', blocker: 'runnable-now', status: 'PENDING', title: 're-test' }];
    const lessons = [{ status: 'PROPOSED', provisional: true, text: 'x' }];
    const a = computeAttention({ runs, board, lessons });
    const kinds = a.map((x) => x.kind);
    expect(kinds).toContain('reevaluate');
    expect(kinds).toContain('approve');
    expect(kinds).toContain('note');
    expect(a.find((x) => x.kind === 'reevaluate').reason).toMatch(/superseded taxonomy|provisional heuristic/);
    expect(a.every((x) => x.reason)).toBe(true);              // NO bare recommendation
  });

  it('empty attention → nothing needs you', () => {
    expect(computeAttention({ runs: [], board: [], lessons: [] })).toHaveLength(0);
  });

  it('map dots derive from runs (not stored) — V-015 strip = 1 killed + 2 inconclusive + rest blue', () => {
    const grid = [{ surface: 'V-015', status: 'whitespace', cells: Array(8).fill({ status: 'whitespace' }) }];
    const runs = [
      { parent: 'new-search-surface:V-015', recipe_id: 'V-015-TOM', result: { gate_pass: false, t: 0.03, n: 1704, edge_pct_per_day: 0.0018, gate: { min_abs_t: 2.0, direction: 'positive' } } },
      { parent: 'new-search-surface:V-015', recipe_id: 'V-015-DFC', result: { gate_pass: false, t: 0.95, n: 27, edge_pct_per_day: 0.36, gate: { min_abs_t: 2.0, direction: 'positive' } } },
      { parent: 'new-search-surface:V-015', recipe_id: 'V-015-TDF', result: { gate_pass: false, t: 1.61, n: 576, edge_pct_per_day: 0.14, gate: { min_abs_t: 2.0, direction: 'positive' } } },
    ];
    const cells = deriveCellStatuses(grid, runs)[0].cells;
    const count = (s) => cells.filter((c) => c.status === s).length;
    expect(count('killed')).toBe(1);               // TOM red
    expect(count('tested-inconclusive')).toBe(2);  // DFC + TDF violet
    expect(count('whitespace')).toBe(5);           // rest blue
  });

  it('re-judge Recent row: no gate/FAIL badge; a real summary', () => {
    const probe = { running: null, queue: [], done: [{ item_id: 'RETERMINUS#x', recipe_id: 'RETERMINUS', kind: 'reterminus',
      title: 'Re-evaluate V-015', result: { target: 'new-search-surface:V-015', flips: [{ recipe_id: 'V-015-TDF', from: 'killed', to: 'inconclusive' }], reevaluated: 3 } }] };
    render(<InProgress probe={probe} onOpenRun={vi.fn()} />);
    expect(screen.getByText(/Re-judge · V-015/)).toBeTruthy();
    expect(screen.getByText(/re-judge complete · 1 flip/)).toBeTruthy();   // verdict, not a to-do
    expect(screen.queryByText('FAIL')).toBeNull();     // a re-judge has no gate — no lying FAIL badge
    expect(screen.getByText('complete')).toBeTruthy();
  });

  it('rejudgeReason: current LLM classifications → null (button absent); provisional → reason', () => {
    const current = [{ parent: 'new-search-surface:V-015', recipe_id: 'V-015-TDF', classified_by: 'llm', provisional: false,
      classified_at: '2026-07-04T00:00:00Z', classified_tax_version: 2, result: { t: 1.6, n: 576, gate_pass: false, gate: {} } }];
    expect(rejudgeReason('V-015', current, [])).toBeNull();     // nothing a re-judge would change
    const prov = [{ ...current[0], classified_by: 'heuristic', provisional: true }];
    expect(rejudgeReason('V-015', prov, [])).toMatch(/provisional\/heuristic/);
    // a lesson banked AFTER the judgment also triggers it
    expect(rejudgeReason('V-015', current, [{ status: 'BANKED', banked_at: '2026-07-05T00:00:00Z' }])).toMatch(/banked since/);
  });

  it('Re-judge button is ABSENT (not ghosted) when classifications are current', () => {
    const items = [{ item_id: 'new-search-surface:V-015', status: 'OPEN', title: 'V-015', disposition: 'open' }];
    const runs = [{ parent: 'new-search-surface:V-015', recipe_id: 'V-015-TDF', classified_by: 'llm', provisional: false,
      classified_tax_version: 2, result: { t: 1.6, n: 576, gate_pass: false, gate: {} } }];
    render(<BoardQueue contract={{ resolve: vi.fn(), reevaluate: vi.fn() }} items={items} onResolved={vi.fn()} onOpenRun={vi.fn()} runs={runs} lessons={[]} />);
    expect(screen.queryByRole('button', { name: /Re-judge/i })).toBeNull();
  });

  it('section logic: OPEN item is not under CONCLUDED', () => {
    const items = [{ item_id: 'new-search-surface:V-015', status: 'OPEN', title: 'V-015', disposition: 'open — underpowered flows' }];
    const { container } = render(<BoardQueue contract={{ resolve: vi.fn(), reevaluate: vi.fn() }} items={items} onResolved={vi.fn()} onOpenRun={vi.fn()} />);
    const bands = [...container.querySelectorAll('.tier-band .tb-label')].map((e) => e.textContent);
    expect(bands).toContain('OPEN');
    expect(bands).toContain('CONCLUDED');
    // the V-015 card sits inside the OPEN group, not CONCLUDED
    const openGroup = [...container.querySelectorAll('.tier-group')].find((g) => g.querySelector('.tb-open'));
    expect(openGroup.textContent).toMatch(/V-015/);
    const concludedGroup = [...container.querySelectorAll('.tier-group')].find((g) => g.querySelector('.tb-concluded'));
    expect(concludedGroup.textContent).toMatch(/None fully disposed yet/);
  });

  it('deriveCellStatuses reads a surface true-state from run results (cold, not stored)', () => {
    const grid = [{ surface: 'V-015', status: 'whitespace' }, { surface: 'other', status: 'gated' }];
    const runs = [
      { parent: 'new-search-surface:V-015', result: { gate_pass: false, t: 1.61, n: 576, edge_pct_per_day: 0.14, gate: { min_abs_t: 2.0, direction: 'positive' } } },
      { parent: 'new-search-surface:V-015', result: { gate_pass: false, t: 0.03, n: 1704, edge_pct_per_day: 0.0018, gate: { min_abs_t: 2.0, direction: 'positive' } } },
    ];
    const out = deriveCellStatuses(grid, runs);
    expect(out[0].status).toBe('tested-inconclusive');   // stored 'whitespace' overridden by derivation
    expect(out[1].status).toBe('gated');                 // untested surface keeps generator status
  });

  it('In-progress Recent row opens the Run Room', () => {
    const onOpenRun = vi.fn();
    const probe = { running: null, queue: [], done: [{ item_id: 'r1', recipe_id: 'V-015-TOM', disposition: 'killed', result: { t: 0.03, n: 1704 } }] };
    render(<InProgress probe={probe} onOpenRun={onOpenRun} />);
    fireEvent.click(screen.getByText('V-015-TOM'));
    expect(onOpenRun).toHaveBeenCalledWith('r1');
  });
});
