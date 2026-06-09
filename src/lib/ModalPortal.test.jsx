// ModalPortal renders to document.body (escapes ancestor stacking contexts so a
// mobile overlay sits above the sticky header) — the shared B+C fix.
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import ModalPortal from './ModalPortal.jsx';

afterEach(cleanup);

describe('ModalPortal', () => {
  it('renders children at document.body, outside the mount container', () => {
    const { container } = render(
      <ModalPortal><div data-testid="overlay">hi</div></ModalPortal>,
    );
    const el = document.querySelector('[data-testid="overlay"]');
    expect(el).toBeTruthy();                       // mounted in the DOM
    expect(container.contains(el)).toBe(false);    // NOT trapped in the local container
    // wrapped in the inert mobile-shell/modal-portal scope (preserves CSS, no box)
    const wrap = el.closest('.modal-portal');
    expect(wrap).toBeTruthy();
    expect(wrap.classList.contains('mobile-shell')).toBe(true);
    expect(wrap.parentElement).toBe(document.body); // top-level under body
  });

  it('renders nothing when no children', () => {
    const before = document.querySelectorAll('.modal-portal').length;
    render(<ModalPortal>{null}</ModalPortal>);
    expect(document.querySelectorAll('.modal-portal').length).toBe(before);
  });
});
