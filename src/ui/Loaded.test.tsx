import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Loaded, lazyPart } from './Loaded';

// React writes an error caught by a boundary to the console; the tests expect them.
beforeEach(() => void vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe('Loaded', () => {
  it('leaves the rest of the app as it is when one part fails while shown: the part says so, with a retry', async () => {
    let broken = true;
    function Window() {
      if (broken) throw new Error('render');
      return <p>okno</p>;
    }
    const { container } = render(
      <>
        <p>map</p>
        <Loaded>
          <Window />
        </Loaded>
      </>,
    );
    const note = await screen.findByRole('alert');
    expect(note.textContent).toContain('Nie udało się wyświetlić tej części aplikacji.');
    expect(container.textContent).toContain('map');
    broken = false;
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }));
    expect(await screen.findByText('okno')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.textContent).toBe('mapokno');
  });

  it('asks again for a part whose file did not arrive, only when told to', async () => {
    const load = vi
      .fn<() => Promise<{ default: () => React.ReactNode }>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
      .mockResolvedValue({ default: () => <p>okno</p> });
    const Part = lazyPart(load);
    const { container } = render(
      <>
        <p>map</p>
        <Loaded>
          <Part />
        </Loaded>
      </>,
    );
    await screen.findByRole('alert');
    expect(container.textContent).toContain('map');
    // Not over and over by itself: once, until the button.
    await new Promise((r) => setTimeout(r, 20));
    expect(load).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }));
    expect(await screen.findByText('okno')).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('passes the props on to the part it loads', async () => {
    const Part = lazyPart(async () => ({ default: ({ name }: { name: string }) => <p>{name}</p> }));
    render(
      <Loaded>
        <Part name="okno" />
      </Loaded>,
    );
    expect(await screen.findByText('okno')).toBeTruthy();
  });
});
