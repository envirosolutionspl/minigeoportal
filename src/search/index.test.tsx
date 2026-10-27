import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { loadSearchProvider, searchProvider, subscribeSearchProvider, useSearchProvider } from './index';

let renders = 0;

/** A search box as the top bar has it: named and labelled by the provider. */
function Box() {
  renders++;
  const provider = useSearchProvider();
  return <input type="search" aria-label={provider.label} placeholder={provider.placeholder} />;
}

describe('useSearchProvider', () => {
  it('renders the box again once a provider is put in place, and tells whoever listens', async () => {
    const told = vi.fn();
    const stop = subscribeSearchProvider(told);
    render(<Box />);
    const drawn = renders;
    await act(() => loadSearchProvider());
    expect(told).toHaveBeenCalledTimes(1);
    expect(renders).toBe(drawn + 1);
    expect(screen.getByRole('searchbox', { name: searchProvider.label })).toBeTruthy();
    stop();
    await act(() => loadSearchProvider());
    expect(told).toHaveBeenCalledTimes(1);
    expect(renders).toBe(drawn + 2);
  });
});
