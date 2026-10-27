import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { WelcomeDialog, useWelcome } from './WelcomeDialog';
import { useMapStore } from '@/state/store';

describe('WelcomeDialog', () => {
  it('says what the service is for and where the data come from, briefly, with links to the geoportal and the source code', () => {
    render(<WelcomeDialog />);
    act(() => useWelcome.getState().setOpen(true));
    expect(screen.getByText('Dane z geoportal.gov.pl – prościej i szybciej')).toBeTruthy();
    // The page keeps its one h1 (App.tsx); the window's title is the first of its headings.
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'MiniGeoportal',
      'Po co jest ten serwis',
      'Skąd są dane',
      'Ważne',
    ]);
    expect(screen.getByText(/Wyszukaj i przejrzyj oficjalne dane szybciej i łatwiej/)).toBeTruthy();
    // Every mention of the national geoportal in the text is a link to it.
    const links = screen.getAllByRole('link', { name: 'geoportal.gov.pl' });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link.getAttribute('href')).toBe('https://www.geoportal.gov.pl');
    expect(screen.getByRole('link', { name: 'kod źródłowy na GitHubie' }).getAttribute('href')).toBe(
      'https://github.com/envirosolutionspl/minigeoportal',
    );
  });

  it('leads to the time travel from its text', () => {
    useMapStore.setState({ tool: 'none' });
    render(<WelcomeDialog />);
    act(() => useWelcome.getState().setOpen(true));
    fireEvent.click(screen.getByRole('link', { name: 'podróż w czasie' }));
    expect(useWelcome.getState().open).toBe(false);
    expect(useMapStore.getState().tool).toBe('time');
    act(() => useMapStore.getState().setTool('none'));
  });

  it('is seen once: going to the map remembers that, so the next visit starts on the map', () => {
    localStorage.clear();
    render(<WelcomeDialog />);
    act(() => useWelcome.getState().setOpen(true));
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Przejdź do mapy' }));
    expect(useWelcome.getState().open).toBe(false);
    expect(Object.values({ ...localStorage })).toContain('hidden');
  });

  it('starts on the way to the map, which stays in sight while the text scrolls on a small screen', () => {
    render(<WelcomeDialog />);
    act(() => useWelcome.getState().setOpen(true));
    const start = screen.getByRole('button', { name: 'Przejdź do mapy' });
    expect(document.activeElement).toBe(start);
    expect(start.closest('.overflow-y-auto')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Po co jest ten serwis' }).closest('.overflow-y-auto')).not.toBeNull();
  });

  it('puts the author between the report form and the accessibility statement in its footer', () => {
    render(<WelcomeDialog />);
    act(() => useWelcome.getState().setOpen(true));
    const footer = screen.getByRole('link', { name: /Stworzone przez/ }).parentElement!;
    expect([...footer.children].map((el) => el.textContent)).toEqual([
      'Zgłoś błąd w serwisie',
      expect.stringMatching(/^Stworzone przez/),
      'Deklaracja dostępności',
    ]);
  });
});
