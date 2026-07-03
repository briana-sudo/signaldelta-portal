// Phase 3d-iii-b — Discovery console tests (vitest + testing-library).
// Firewall at the UI: reads + sends intent, never writes the graph, never holds a
// credential, no 7687 reference. Plus the coverage-map sizing/color logic.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { statusColor, sizeForPotential, isHot, layoutSpans } from './coverage.js';
import { makeContract } from './api/contract.js';
import BoardQueue from './components/BoardQueue.jsx';
import DataNeeds from './components/DataNeeds.jsx';
import AnalystDock from './components/AnalystDock.jsx';
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

// --- analyst dock: surfaces routing outcomes, never enacts --------------------
describe('analyst dock surfaces, never enacts', () => {
  it('a DECISION ask surfaces a routed-to-gate outcome (no resolve/enact)', async () => {
    const analyst = vi.fn(async () => ({ kind: 'DECISION', explanation: 'EV case', routed_item_type: 'decision' }));
    const resolve = vi.fn();
    render(<AnalystDock contract={{ analyst, resolve, exportMd: vi.fn() }} />);
    fireEvent.change(screen.getByLabelText(/Ask the analyst/i), { target: { value: 'should I buy on-chain?' } });
    fireEvent.click(screen.getByText('Ask'));
    await waitFor(() => expect(screen.getByText(/routed → gate/i)).toBeTruthy());
    expect(resolve).not.toHaveBeenCalled();           // surfaced, never enacted
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
