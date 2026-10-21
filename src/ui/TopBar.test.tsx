import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TopBar } from './TopBar';
import { useMapStore } from '@/state/store';
import { clearUnitNames } from '@/services/units';
import { stubFetch } from '@/test/helpers';

const UUG = {
  type: 'city',
  results: {
    1: { city: 'Komaszyce', teryt: '040704', x: '454776', y: '546382' },
    2: { city: 'Komaszyce', teryt: '260502', x: '601729', y: '376839' },
  },
};

beforeEach(() => {
  clearUnitNames();
  useMapStore.setState({ focus: null, tool: 'none' });
  stubFetch([['services.gugik.gov.pl/uug', UUG], ['/api/dict/jednostki', {}]]);
});

const type = async (text: string) => {
  const box = screen.getByRole('combobox');
  fireEvent.change(box, { target: { value: text } });
  // Debounce and the stubbed answers.
  await act(() => new Promise((r) => setTimeout(r, 400)));
  return box;
};

describe('search box', () => {
  it('is a combobox: arrows move through the results, Enter shows the chosen one', async () => {
    render(<TopBar />);
    const box = await type('Komaszyce');
    expect(box.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByRole('status').textContent).toMatch(/^Wyników: 2\./);

    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box.getAttribute('aria-activedescendant')).toBe('search-hit-1');
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box.getAttribute('aria-activedescendant')).toBe('search-hit-0');

    fireEvent.keyDown(box, { key: 'ArrowUp' });
    fireEvent.keyDown(box, { key: 'Enter' });
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(useMapStore.getState().focus).toMatchObject({ center: [601729, 376839] });
  });

  it('closes the list with Escape and says when nothing was found', async () => {
    render(<TopBar />);
    const box = await type('Komaszyce');
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(box.getAttribute('aria-expanded')).toBe('false');
    stubFetch([['services.gugik.gov.pl/uug', { type: 'city', results: {} }]]);
    await type('Xyzzyx');
    expect(screen.getByRole('status').textContent).toBe('Brak wyników.');
  });
});
