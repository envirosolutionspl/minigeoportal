import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ProfilePanel } from './ProfilePanel';
import { useMapStore } from '@/state/store';
import { stubFetch } from '@/test/helpers';

beforeEach(() => useMapStore.setState({ tool: 'none', profileLine: null }));

describe('ProfilePanel', () => {
  it('is hidden while the tool is off', () => {
    const { container } = render(<ProfilePanel />);
    expect(container.innerHTML).toBe('');
  });

  it('draws the profile of the terrain along the drawn line, and follows the next one', async () => {
    const { calls } = stubFetch([
      ['GetHByPointList', Array.from({ length: 101 }, (_, i) => `0 0 ${(100 + (i <= 50 ? i : 100 - i) * 0.2).toFixed(1)}`).join(',')],
    ]);
    useMapStore.setState({ tool: 'profile' });
    render(<ProfilePanel />);
    expect(screen.getByRole('heading', { name: 'Profil terenu' })).toBeTruthy();
    // No line yet: only the hint.
    expect(screen.queryByText('Pobieram wysokości terenu…')).toBeNull();
    act(() =>
      useMapStore.getState().setProfileLine([
        [600000, 500000],
        [601000, 500000],
      ]),
    );
    expect(screen.getByText('Pobieram wysokości terenu…')).toBeTruthy();
    expect(await screen.findByText('Wysokość od 100,0 m do 110,0 m n.p.m. Nachylenie największe 2%, średnie 2%.')).toBeTruthy();
    expect(calls).toHaveLength(1);
    act(() =>
      useMapStore.getState().setProfileLine([
        [600000, 500000],
        [600000, 500500],
      ]),
    );
    expect(screen.getByText('Pobieram wysokości terenu…')).toBeTruthy();
    await screen.findByText(/Nachylenie największe/);
    expect(calls).toHaveLength(2);
  });

  it('marks the bends of the line with a dashed line and their heights', async () => {
    stubFetch([['GetHByPointList', Array.from({ length: 101 }, (_, i) => `0 0 ${100 + i}`).join(',')]]);
    useMapStore.setState({
      tool: 'profile',
      profileLine: [
        [600000, 500000],
        [600333, 500000],
        [600333, 500667],
      ],
    });
    const { container } = render(<ProfilePanel />);
    await screen.findByText(/Nachylenie największe/);
    expect(container.querySelectorAll('line[stroke-dasharray]')).toHaveLength(1);
    // The bend is the 34th of 101 samples: its height above the chart, how far along it lies under it.
    const chart = container.querySelector('svg[viewBox="0 0 300 90"]')!;
    const height = screen.getByText('133,0 m');
    const along = screen.getByText(/^33\d,\d m$/);
    expect(height.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(along.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(screen.getByText(/Punkty załamania linii: 133,0 m w odległości 33\d,\d m od początku\./)).toBeTruthy();
  });

  it('leaves out the distance of a bend near the end, where the length stands', async () => {
    stubFetch([['GetHByPointList', Array.from({ length: 101 }, (_, i) => `0 0 ${100 + i}`).join(',')]]);
    useMapStore.setState({
      tool: 'profile',
      profileLine: [
        [600000, 500000],
        [600770, 500000],
        [600770, 500230],
      ],
    });
    const { container } = render(<ProfilePanel />);
    await screen.findByText(/Nachylenie największe/);
    // Its height above the chart stays; under it only the start and the length.
    expect(screen.getByText('177,0 m')).toBeTruthy();
    expect([...container.querySelectorAll('figure div.relative.flex > span')].map((s) => s.textContent)).toEqual([
      '0 m',
      expect.stringMatching(/ m$/),
    ]);
  });

  it('says when the heights cannot be had', async () => {
    stubFetch([['GetHByPointList', 'down', { status: 503 }]]);
    useMapStore.setState({
      tool: 'profile',
      profileLine: [
        [600000, 500000],
        [600100, 500000],
      ],
    });
    render(<ProfilePanel />);
    expect(await screen.findByText('Nie udało się pobrać wysokości terenu.')).toBeTruthy();
  });

  it('closes', () => {
    useMapStore.setState({ tool: 'profile' });
    render(<ProfilePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij profil terenu' }));
    expect(useMapStore.getState().tool).toBe('none');
  });
});
