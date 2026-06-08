// Blotter open-first pin (main view) + "Open first" modal sort — 2026-06-08.
import { describe, it, expect } from 'vitest';
import { selectVisibleTrades } from './dataAdapter.js';
import { makeComparator, SORT_FIELDS } from '../pc/TradesExpandModal.jsx';

const mk = (id, status, entry) => ({ requestId: id, status, entryTimestamp: entry });

describe('selectVisibleTrades — OPEN pinned + cap guard', () => {
  it('old OPEN (past the cap cutoff) is still visible, pinned to top', () => {
    // 1 old open + 20 newer closed, cap 13. Without the pin the old open would
    // fall outside the first 13 by entry time and vanish behind +MORE.
    const closed = Array.from({ length: 20 }, (_, i) => mk(`c${i}`, 'CLOSED', `2026-06-08T${String(10 + i).padStart(2, '0')}:00:00Z`));
    const oldOpen = mk('open-old', 'OPEN', '2026-06-01T09:00:00Z');
    const { visible, overflow, moreCount } = selectVisibleTrades([...closed, oldOpen], 13);
    expect(visible.map((t) => t.requestId)).toContain('open-old'); // pinned, not hidden
    expect(visible[0].requestId).toBe('open-old');                 // at the top
    expect(visible.length).toBe(13);
    expect(overflow).toBe(true);
    expect(moreCount).toBe(21 - 13);                               // counter reflects true total
  });

  it('all OPEN rows order above all CLOSED rows', () => {
    const list = [mk('c1', 'CLOSED', '2026-06-08T12:00:00Z'), mk('o1', 'OPEN', '2026-06-07T12:00:00Z'), mk('c2', 'CLOSED', '2026-06-08T13:00:00Z'), mk('o2', 'OPEN', '2026-06-05T12:00:00Z')];
    const { visible } = selectVisibleTrades(list, 13);
    const lastOpen = visible.map((t) => t.status).lastIndexOf('OPEN');
    const firstClosed = visible.map((t) => t.status).indexOf('CLOSED');
    expect(lastOpen).toBeLessThan(firstClosed); // every open before every closed
  });

  it('cap guard: open count exceeds cap → every OPEN still present', () => {
    const open = Array.from({ length: 8 }, (_, i) => mk(`o${i}`, 'OPEN', `2026-06-0${i + 1}T09:00:00Z`));
    const closed = Array.from({ length: 10 }, (_, i) => mk(`c${i}`, 'CLOSED', `2026-06-08T1${i}:00:00Z`));
    const { visible } = selectVisibleTrades([...closed, ...open], 6); // cap < open count
    const openIds = open.map((t) => t.requestId);
    expect(openIds.every((id) => visible.some((t) => t.requestId === id))).toBe(true);
    expect(visible.filter((t) => t.status === 'OPEN').length).toBe(8); // open wins the budget
    expect(visible.filter((t) => t.status === 'CLOSED').length).toBe(0); // no closed room left
  });
});

describe('modal "Open first" sort', () => {
  it('option exists in SORT_FIELDS', () => {
    expect(SORT_FIELDS.some((f) => f.key === 'open' && /open/i.test(f.label))).toBe(true);
  });
  it('open above closed, secondary entry-time desc (old open near top)', () => {
    const list = [
      mk('c-new', 'CLOSED', '2026-06-08T15:00:00Z'),
      mk('o-old', 'OPEN', '2026-06-01T09:00:00Z'),
      mk('o-new', 'OPEN', '2026-06-08T09:00:00Z'),
      mk('c-old', 'CLOSED', '2026-06-02T09:00:00Z'),
    ];
    const sorted = [...list].sort(makeComparator('open', 'desc'));
    expect(sorted.map((t) => t.requestId)).toEqual(['o-new', 'o-old', 'c-new', 'c-old']);
    // both opens precede both closed; old open is in the top group
    expect(sorted[0].status).toBe('OPEN');
    expect(sorted[1].requestId).toBe('o-old');
  });
});
