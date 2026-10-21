import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PrintPanel, PrintSheet, printedLayers } from './Print';
import { useMapStore } from '@/state/store';
import { openPrint } from '@/map/print';
import { withCapabilities } from '@/test/helpers';

beforeEach(async () => {
  useMapStore.setState({
    tool: 'none',
    printRequest: null,
    printSettings: { paper: 'A4', orientation: 'landscape', scale: 10000, title: '' },
    scale: 1890,
    base: 'mapa',
    overlays: ['kieg'],
    sublayers: {},
    center: [656849, 482462],
  });
  await withCapabilities();
});

describe('PrintPanel', () => {
  it('opens with the print tool at the scale closest to the map and prints the chosen sheet', () => {
    render(<PrintPanel />);
    expect(screen.queryByRole('heading', { name: 'Drukuj mapę' })).toBeNull();
    act(() => openPrint());
    expect((screen.getByLabelText('Skala') as HTMLSelectElement).value).toBe('2000');
    expect(document.activeElement).toBe(screen.getByLabelText('Tytuł (opcjonalnie)'));
    fireEvent.change(screen.getByLabelText('Tytuł (opcjonalnie)'), { target: { value: ' Działka 22/1 ' } });
    fireEvent.click(screen.getByLabelText('A3'));
    fireEvent.click(screen.getByLabelText('Pionowa'));
    expect(useMapStore.getState().printSettings).toMatchObject({ paper: 'A3', orientation: 'portrait', scale: 2000 });
    fireEvent.click(screen.getByRole('button', { name: 'Drukuj' }));
    expect(useMapStore.getState().printRequest).toEqual({ paper: 'A3', orientation: 'portrait', scale: 2000, title: 'Działka 22/1' });
    expect(screen.getByRole('button', { name: 'Przygotowuję wydruk…' })).toBeTruthy();
    act(() => useMapStore.getState().printDone());
    expect(useMapStore.getState().tool).toBe('none');
  });
});

describe('printedLayers', () => {
  it('keeps only sublayers drawn at the print scale', () => {
    // KIEG in the test capabilities: precincts 1:10 000-25 000, parcels up to 1:10 000,
    // buildings up to 1:2500, numbers up to 1:1500.
    const at = (scale: number) =>
      printedLayers(['kieg'], {}, { paper: 'A4', orientation: 'landscape', scale }).flatMap(({ names }) => names);
    // 1:25 000 on paper is about 1:15 000 for the server: precincts only.
    expect(at(25000)).toEqual(['obreby']);
    expect(at(2500)).toEqual(['dzialki', 'budynki', 'numery_dzialek']);
    expect(at(1000000)).toEqual([]);
  });
});

describe('PrintSheet', () => {
  it('shows title, scale, visible layers and sources while printing', () => {
    useMapStore.setState({ printRequest: { paper: 'A4', orientation: 'landscape', scale: 1000, title: 'Moja działka' } });
    const { container } = render(<PrintSheet />);
    const text = container.textContent!.replace(/\s/g, ' ');
    expect(text).toContain('Moja działka');
    expect(text).toContain('Skala 1:1000');
    expect(text).toContain('Warstwy: Ewidencja gruntów i budynków');
    expect(text).toContain('Dane: GUGiK');
    expect(container.querySelector('#print-map')).toBeTruthy();
  });

  it('lists no layers that are not drawn at the print scale', () => {
    useMapStore.setState({ printRequest: { paper: 'A4', orientation: 'landscape', scale: 1000000, title: '' } });
    const { container } = render(<PrintSheet />);
    expect(container.textContent).not.toContain('Warstwy:');
  });
});
