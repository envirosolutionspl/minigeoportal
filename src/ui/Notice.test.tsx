import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useNotice } from './Notice';

/** A screen with the message and three things to say on it. */
function Host() {
  const { say, notice } = useNotice();
  return (
    <>
      <button type="button" onClick={() => say('Skopiowano.')}>
        Krótko
      </button>
      <button type="button" onClick={() => say('x'.repeat(81))}>
        Długo
      </button>
      <button type="button" onClick={() => say('Skopiowano.', 1000)}>
        Sekundę
      </button>
      {notice}
    </>
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const say = (what: string) => fireEvent.click(screen.getByRole('button', { name: what }));
const status = () => screen.getByRole('status');
const text = () => status().textContent;
const pass = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe('useNotice', () => {
  it('keeps a short message 5 s and a longer one 8 s, or as long as it was given', () => {
    render(<Host />);
    say('Krótko');
    expect(text()).toBe('Skopiowano.');
    pass(4999);
    expect(text()).toBe('Skopiowano.');
    pass(1);
    expect(text()).toBe('');

    say('Długo');
    pass(7999);
    expect(text()).toBe('x'.repeat(81));
    pass(1);
    expect(text()).toBe('');

    say('Sekundę');
    pass(1000);
    expect(text()).toBe('');
  });

  it('stays while the keyboard focus is on it, and goes its usual time after the focus has left', () => {
    render(<Host />);
    say('Krótko');
    fireEvent.focus(status());
    pass(60000);
    expect(text()).toBe('Skopiowano.');
    fireEvent.blur(status());
    pass(4999);
    expect(text()).toBe('Skopiowano.');
    pass(1);
    expect(text()).toBe('');
  });
});
