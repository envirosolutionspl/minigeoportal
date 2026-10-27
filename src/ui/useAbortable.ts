import { useEffect, useState, type DependencyList } from 'react';

export type Loaded<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error' };

/**
 * A value loaded for the dependencies: `load` runs again when they change, and the request
 * under way is aborted then, as it is on unmount, so a late answer never lands on a newer
 * question. An aborted request ends in neither 'ready' nor 'error'.
 */
export function useAbortable<T>(load: (signal: AbortSignal) => Promise<T>, deps: DependencyList): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    load(controller.signal)
      .then((value) => !controller.signal.aborted && setState({ status: 'ready', value }))
      .catch(() => !controller.signal.aborted && setState({ status: 'error' }));
    return () => controller.abort();
    // `load` is a new closure on every render; the dependencies name what it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
