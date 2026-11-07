import { describe, expect, it, vi } from 'vitest';
import { start } from './start';

function Broken(): never {
  throw new Error('render');
}

async function started(load: () => Promise<React.ReactNode>) {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  // Rendered as in the page, not inside act: act takes React's errors for itself and they never
  // reach onUncaughtError.
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
  const root = document.createElement('div');
  await start(root, load);
  await vi.waitFor(() => expect(root.childNodes.length).toBeGreaterThan(0));
  return { root, error };
}

const note = (root: HTMLElement) => root.querySelector('[role="alert"]');

describe('start', () => {
  it('renders the app', async () => {
    const { root } = await started(async () => <p>map</p>);
    expect(root.textContent).toBe('map');
    expect(note(root)).toBeNull();
  });

  it('says the app could not start when loading fails, with a reload button', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...location, reload });
    const { root, error } = await started(() => Promise.reject(new Error('config')));
    expect(note(root)?.textContent).toContain('Nie udało się uruchomić mapy.');
    expect(error).toHaveBeenCalledWith(new Error('config'));
    root.querySelector('button')!.click();
    expect(reload).toHaveBeenCalled();
  });

  it('says the same when the app crashes while rendering', async () => {
    const { root, error } = await started(async () => <Broken />);
    expect(note(root)?.textContent).toContain('The map could not start.');
    expect(error).toHaveBeenCalledWith(new Error('render'));
  });
});
