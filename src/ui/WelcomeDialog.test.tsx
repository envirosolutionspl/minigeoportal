import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { WelcomeDialog, useWelcome } from './WelcomeDialog';

describe('WelcomeDialog', () => {
  it('says what the service is for and where the data come from, briefly', () => {
    render(<WelcomeDialog />);
    act(() => useWelcome.getState().setOpen(true));
    expect(screen.getByText('Dane z geoportal.gov.pl – prościej i szybciej')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Po co jest ten serwis',
      'Skąd są dane',
      'Ważne',
    ]);
    expect(screen.getByText(/Wyszukaj i przejrzyj oficjalne dane szybciej i łatwiej/)).toBeTruthy();
    // Every mention of the national geoportal in the text is a link to it.
    const links = screen.getAllByRole('link', { name: 'geoportal.gov.pl' });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link.getAttribute('href')).toBe('https://www.geoportal.gov.pl');
  });

  it('links to the source code of the project', () => {
    render(<WelcomeDialog />);
    act(() => useWelcome.getState().setOpen(true));
    expect(screen.getByRole('link', { name: 'kod źródłowy na GitHubie' }).getAttribute('href')).toBe(
      'https://github.com/envirosolutionspl/minigeoportal',
    );
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
