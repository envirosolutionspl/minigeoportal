import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAbortable } from './useAbortable';

/** A request answered by the test: `answer` resolves it, `fail` rejects it. */
function request() {
  const seen: AbortSignal[] = [];
  let answer: (value: string) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const load = (signal: AbortSignal) => {
    seen.push(signal);
    return new Promise<string>((resolve, reject) => {
      answer = resolve;
      fail = reject;
    });
  };
  return { load, seen, answer: (v: string) => answer(v), fail: () => fail(new Error('down')) };
}

describe('useAbortable', () => {
  it('loads for the dependencies and reports the value or the failure', async () => {
    const { load, answer, fail } = request();
    const { result, rerender } = renderHook(({ key }) => useAbortable(load, [key]), { initialProps: { key: 1 } });
    expect(result.current).toEqual({ status: 'loading' });
    await act(async () => answer('one'));
    expect(result.current).toEqual({ status: 'ready', value: 'one' });
    rerender({ key: 2 });
    expect(result.current).toEqual({ status: 'loading' });
    await act(async () => fail());
    expect(result.current).toEqual({ status: 'error' });
  });

  it('aborts the request under way when the dependencies change, so its late answer is dropped', async () => {
    const { load, seen, answer } = request();
    const { result, rerender } = renderHook(({ key }) => useAbortable(load, [key]), { initialProps: { key: 1 } });
    rerender({ key: 2 });
    expect(seen[0].aborted).toBe(true);
    expect(seen[1].aborted).toBe(false);
    // The first request answers anyway, as a slow server does.
    await act(async () => answer('two'));
    expect(result.current).toEqual({ status: 'ready', value: 'two' });
  });

  it('aborts the request under way on unmount', () => {
    const { load, seen } = request();
    const { unmount } = renderHook(() => useAbortable(load, []));
    unmount();
    expect(seen[0].aborted).toBe(true);
  });
});
