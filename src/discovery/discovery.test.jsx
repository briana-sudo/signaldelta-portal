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
import Topbar from './components/Topbar.jsx';

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
