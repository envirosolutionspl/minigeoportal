import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { usePinnedPage } from './usePinnedPage';

function Page() {
  const ref = useRef<HTMLDivElement>(null);
  usePinnedPage(ref);
  return (
    <div ref={ref} data-testid="page">
      <input aria-label="Numer działki" />
      <h2 tabIndex={-1}>Warstwy</h2>
    </div>
  );
}

afterEach(() => vi.useRealTimers());

describe('usePinnedPage', () => {
  it('puts back a scroll of the app box, as focus causes in a box with hidden overflow', () => {
    const { getByTestId } = render(<Page />);
    const page = getByTestId('page');
    page.scrollTop = 353;
    fireEvent.scroll(page);
    expect(page.scrollTop).toBe(0);
  });

  it('lets the browser place a field above the keyboard, and puts the page back once the field is left', () => {
    vi.useFakeTimers();
    const { getByTestId, getByLabelText } = render(<Page />);
    const page = getByTestId('page');
    const field = getByLabelText('Numer działki');
    field.focus();
    page.scrollTop = 200;
    fireEvent.scroll(page);
    expect(page.scrollTop).toBe(200);
    field.blur();
    vi.advanceTimersByTime(300);
    expect(page.scrollTop).toBe(0);
  });
});
