import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PrintPanel, PrintSheet, printedLayers } from './Print';
import { useMapStore } from '@/state/store';
import { openPrint } from '@/map/print';
import { withCapabilities } from '@/test/helpers';
import { overlayById } from '@/config/runtime';

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

// Some tests lend the shared KIEG layer a source and a legend of its own; taken back here, so a
// failed assertion does not leave them to the next test.
afterEach(() => {
  const kieg = overlayById.get('kieg')!;
  delete kieg.attribution;
  delete kieg.sublayers.find((l) => l.name === 'dzialki')!.legend;
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
    // The map's credit is on the map itself, as on screen; the footer note comes from the deployment's texts.
    expect(container.querySelector('.print-frame .print-source')?.textContent).toBe('Dane: GUGiK, geoportal.gov.pl');
    expect(text).toContain('Źródło warstw mapy: geoportal.gov.pl');
    expect(container.querySelector('#print-map')).toBeTruthy();
  });

  it('names the layer of the time view and its date when printed from it', () => {
    const request = { paper: 'A4' as const, orientation: 'landscape' as const, scale: 1000, title: '' };
    useMapStore.setState({ printRequest: request, printFromTime: true, timeLayer: null, time: '2007-01-01' });
    const { container, rerender } = render(<PrintSheet />);
    expect(container.textContent).toContain('Podkład: Mapa · Ortofotomapa archiwalna, stan na 01.01.2007');
    act(() => useMapStore.setState({ printFromTime: false }));
    rerender(<PrintSheet />);
    expect(container.textContent).not.toContain('Ortofotomapa archiwalna');
    useMapStore.setState({ printRequest: null, time: null });
  });

  it('credits a layer with its own source next to the map', () => {
    const kieg = overlayById.get('kieg')!;
    kieg.attribution = '<a href="https://powiat.example">Powiat</a>';
    useMapStore.setState({ printRequest: { paper: 'A4', orientation: 'landscape', scale: 1000, title: '' } });
    const { container } = render(<PrintSheet />);
    const source = container.querySelector('.print-source')!;
    expect(source.textContent).toBe('Dane: GUGiK, geoportal.gov.pl · Powiat');
    expect(source.querySelector('a[href="https://powiat.example"]')).toBeTruthy();
  });

  it('names no source when nothing is printed', () => {
    useMapStore.setState({ base: 'none', printRequest: { paper: 'A4', orientation: 'landscape', scale: 1000000, title: '' } });
    const { container } = render(<PrintSheet />);
    expect(container.querySelector('.print-source')).toBeNull();
  });

  it('prints the legend layers.yaml names before the one from the capabilities', () => {
    const kieg = overlayById.get('kieg')!;
    const dzialki = kieg.sublayers.find((l) => l.name === 'dzialki')!;
    dzialki.legend = 'https://example.org/legend.png';
    useMapStore.setState({ printRequest: { paper: 'A4', orientation: 'landscape', scale: 2500, title: '' } });
    const { container } = render(<PrintSheet />);
    expect([...container.querySelectorAll('.print-legend img')].map((i) => i.getAttribute('src'))).toContain(
      'https://example.org/legend.png',
    );
  });

  it('lists no layers that are not drawn at the print scale', () => {
    useMapStore.setState({ printRequest: { paper: 'A4', orientation: 'landscape', scale: 1000000, title: '' } });
    const { container } = render(<PrintSheet />);
    expect(container.textContent).not.toContain('Warstwy:');
  });
});
