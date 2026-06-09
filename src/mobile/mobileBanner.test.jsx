// Mobile sliding banner parity: TRADES (total) + OPEN tiles, sourced from the
// same liveAccountBar fields the PC banner uses.
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, within } from '@testing-library/react';
import { MobileAccountBar } from './MobileApp.jsx';

afterEach(cleanup);

const tile = (container, label) => {
  const lbl = within(container).getByText(label);
  return lbl.parentElement; // .aitem wraps <span.alabel> + <span.aval>
};

describe('MobileAccountBar — TRADES + OPEN tiles', () => {
  it('shows TRADES total and OPEN count from liveAccountBar', () => {
    const { container } = render(
      <MobileAccountBar mode="combined" liveAccountBar={{ trades: 151, open: 1, capitalBase: 10000 }} data={{}} />,
    );
    expect(tile(container, 'Trades').textContent).toContain('151');
    expect(tile(container, 'Open').textContent).toContain('1');
  });

  it('OPEN renders "—" (not 0) when the broker open count is null', () => {
    const { container } = render(
      <MobileAccountBar mode="combined" liveAccountBar={{ trades: 151, open: null, capitalBase: 10000 }} data={{}} />,
    );
    expect(tile(container, 'Open').textContent).toContain('—');
  });
});
