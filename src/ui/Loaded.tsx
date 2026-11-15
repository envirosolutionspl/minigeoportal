import { Component, createElement, lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { t } from '@/i18n';

/** The loads of lazyPart() that failed, each with how to make it anew; a retry of Loaded makes them all again. */
const failed = new Set<() => void>();

/**
 * lazy() whose failed load can be tried again: React keeps a failed lazy() failed for good, so the retry button of
 * Loaded puts a new one in its place, which asks for the file again. Only that button retries, never a render on its
 * own: a part that cannot load would otherwise be asked for over and over.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the same bound React's lazy() has
export function lazyPart<T extends ComponentType<any>>(load: () => Promise<{ default: T }>): T {
  const make = () =>
    lazy(() =>
      load().catch((e: unknown) => {
        failed.add(renew);
        throw e;
      }),
    ) as unknown as ComponentType<object>;
  const holder = { Part: make() };
  const renew = () => (holder.Part = make());
  return ((props: object) => createElement(holder.Part, props)) as unknown as T;
}

/**
 * A part of the app that loads on its own (a window or panel of a module): Suspense for its code, and a boundary for
 * its failures. A file that did not arrive (the network, a new release) or an error while it is shown leaves a note
 * with a retry button in its place; the map and the other windows go on, with what was typed in them.
 */
export class Loaded extends Component<{ children: ReactNode }, { error: boolean; turn: number }> {
  state = { error: false, turn: 0 };

  // React writes the error to the console itself (the root's onCaughtError).
  static getDerivedStateFromError() {
    return { error: true };
  }

  retry = () => {
    for (const renew of failed) renew();
    failed.clear();
    // A new key mounts the part afresh, so an error while it was shown starts over too.
    this.setState((s) => ({ error: false, turn: s.turn + 1 }));
  };

  render() {
    if (this.state.error)
      return (
        <div
          role="alert"
          className="pointer-events-auto max-w-80 rounded-2xl bg-[var(--surface)] p-3 text-sm text-[var(--text)] shadow-lg ring-1 ring-black/10"
        >
          <p>{t('app.partFailed')}</p>
          <button
            type="button"
            onClick={this.retry}
            className="mt-2 min-h-10 rounded-2xl px-4 font-medium ring-1 ring-black/10 hover:bg-[var(--hover)]"
          >
            {t('app.retry')}
          </button>
        </div>
      );
    return (
      <Suspense key={this.state.turn} fallback={null}>
        {this.props.children}
      </Suspense>
    );
  }
}
