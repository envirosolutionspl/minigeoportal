import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * Starts the app in root, or says it could not: when loading fails (the configuration, a part of
 * the app missing after a new release) or the app crashes later, a short note with a reload button
 * takes the place of an empty page.
 */
export async function start(root: HTMLElement, load: () => Promise<ReactNode>): Promise<void> {
  try {
    const app = await load();
    createRoot(root, { onUncaughtError: (error) => fail(root, error) }).render(app);
  } catch (error) {
    fail(root, error);
  }
}

// Static text in both languages: the configuration and its translations may be what failed.
function fail(root: HTMLElement, error: unknown): void {
  console.error(error);
  const note = document.createElement('div');
  note.setAttribute('role', 'alert');
  note.className = 'flex h-full flex-col items-center justify-center gap-4 p-6 text-center';
  const text = document.createElement('p');
  text.textContent = 'Nie udało się uruchomić mapy. / The map could not start.';
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.className = 'rounded-xl border px-4 py-2 font-semibold';
  reload.textContent = 'Odśwież / Reload';
  reload.addEventListener('click', () => location.reload());
  note.append(text, reload);
  root.replaceChildren(note);
}
