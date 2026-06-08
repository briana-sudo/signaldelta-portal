// Returns-matrix cell zero-state. An n=0 cohort must render an INTENTIONAL muted
// tile (same bordered container, "—" + n=0 marker, NO numeric %); a populated
// cohort renders its % with sign color. No fabricated returns.
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { CellContents } from './ReturnsMatrixPanel.jsx';

afterEach(cleanup);

describe('ReturnsMatrix CellContents — zero-state', () => {
  it('n=0 cohort: muted box + "—" + n=0 marker, NO numeric %', () => {
    const { container } = render(
      <CellContents metric={{ count: 0, meanReturnPct: null, hasData: false }} ariaLabel="x" title="x" />,
    );
    const cell = container.querySelector('.rm-cell');
    expect(cell).toBeTruthy();
    expect(cell.classList.contains('rm-empty')).toBe(true);     // muted/neutral tile
    expect(cell.getAttribute('data-empty')).toBe('true');       // explicit zero-state marker
    expect(cell.textContent).toContain('—');                    // dash placeholder
    expect(cell.textContent).toContain('n=0');                  // n=0 sublabel
    expect(cell.textContent).not.toContain('%');                // NO numeric % (no fabricated return)
  });

  it('populated cohort: renders % with positive sign color, not empty', () => {
    const { container } = render(
      <CellContents metric={{ count: 5, meanReturnPct: 2.3, hasData: true }} ariaLabel="x" title="x" />,
    );
    const cell = container.querySelector('.rm-cell');
    expect(cell.classList.contains('rm-empty')).toBe(false);
    expect(cell.classList.contains('rm-pos')).toBe(true);       // green / positive
    expect(cell.textContent).toContain('+2.3%');                // real measured %
    expect(cell.textContent).toContain('n=5');
  });

  it('populated negative cohort: red sign color', () => {
    const { container } = render(
      <CellContents metric={{ count: 3, meanReturnPct: -1.5, hasData: true }} ariaLabel="x" title="x" />,
    );
    const cell = container.querySelector('.rm-cell');
    expect(cell.classList.contains('rm-neg')).toBe(true);
    expect(cell.textContent).toContain('-1.5%');
  });
});
