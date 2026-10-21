import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PrintDialog, PrintSheet, usePrintDialog } from './Print';
import { useMapStore } from '@/state/store';
import { withCapabilities } from '@/test/helpers';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

beforeEach(async () => {
  usePrintDialog.setState({ open: false });
  useMapStore.setState({ printRequest: null, scale: 1890, base: 'mapa', overlays: ['kieg'], sublayers: {}, center: [656849, 482462] });
  await withCapabilities();
});

describe('PrintDialog', () => {
  it('starts at the scale closest to the map and asks the map to print the chosen sheet', () => {
    render(<PrintDialog />);
    act(() => usePrintDialog.getState().setOpen(true));
    expect((screen.getByLabelText('Skala') as HTMLSelectElement).value).toBe('2000');
    fireEvent.change(screen.getByLabelText('Tytuł (opcjonalnie)'), { target: { value: ' Działka 22/1 ' } });
    fireEvent.click(screen.getByLabelText('A3'));
    fireEvent.click(screen.getByLabelText('Pionowa'));
    fireEvent.click(screen.getByRole('button', { name: 'Drukuj' }));
    expect(useMapStore.getState().printRequest).toEqual({ paper: 'A3', orientation: 'portrait', scale: 2000, title: 'Działka 22/1' });
    expect(screen.getByRole('button', { name: 'Przygotowuję wydruk…' })).toBeTruthy();
    act(() => useMapStore.getState().printDone());
    expect(usePrintDialog.getState().open).toBe(false);
  });
});

describe('PrintSheet', () => {
  it('shows title, scale, layers, legends and sources while printing', () => {
    useMapStore.setState({ printRequest: { paper: 'A4', orientation: 'landscape', scale: 1000, title: 'Moja działka' } });
    const { container } = render(<PrintSheet />);
    const text = container.textContent!.replace(/\s/g, ' ');
    expect(text).toContain('Moja działka');
    expect(text).toContain('Skala 1:1000');
    expect(text).toContain('Warstwy: Ewidencja gruntów i budynków');
    expect(text).toContain('Dane: GUGiK');
    expect(container.querySelector('#print-map')).toBeTruthy();
  });
});
