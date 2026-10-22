import { beforeAll, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { WelcomeDialog, useWelcome } from './WelcomeDialog';

beforeAll(() => {
  // jsdom has <dialog> without the modal methods.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

describe('WelcomeDialog', () => {
  it('says what the service is for, why it was made and where the data come from', () => {
    render(<WelcomeDialog />);
    act(() => useWelcome.getState().setOpen(true));
    expect(screen.getByText('Dane z geoportal.gov.pl – prościej i szybciej')).toBeTruthy();
    for (const heading of ['Po co jest ten serwis', 'Skąd ten pomysł', 'Skąd są dane', 'Ważne']) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
    }
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText(/aplikacja mobilna często nie wczytuje map/)).toBeTruthy();
  });
});
