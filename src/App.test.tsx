import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import App from './App';
import { useInfoStore } from '@/state/info';
import { useMapStore } from '@/state/store';
import { useWelcome } from '@/ui/WelcomeDialog';
import { stubFetch, withCapabilities } from '@/test/helpers';

beforeAll(() => withCapabilities());

beforeEach(() => {
  stubFetch([['/api/report', { enabled: true }]]);
  useWelcome.setState({ open: false });
  useInfoStore.setState({ query: null });
  useMapStore.setState({ tool: 'none', panel: 'catalog', time: null, compare: false, overlays: ['kieg'], sublayers: {} });
});

const escape = () => fireEvent.keyDown(window, { key: 'Escape' });
const state = () => useMapStore.getState();

describe('Escape', () => {
  it('ends the print tool before anything else', () => {
    render(<App />);
    act(() => state().setTool('print'));
    act(() => useInfoStore.getState().start([656849, 482462], []));
    act(escape);
    expect(state().tool).toBe('none');
    expect(useInfoStore.getState().query).not.toBeNull();
  });

  it('closes the place panel, then the layer list, then the time view, one a press', () => {
    render(<App />);
    act(() => state().setTool('time'));
    act(() => useInfoStore.getState().start([656849, 482462], []));
    act(escape);
    expect(useInfoStore.getState().query).toBeNull();
    expect(state().panel).toBe('catalog');
    act(escape);
    expect(state().panel).toBe('none');
    expect(state().tool).toBe('time');
    act(escape);
    expect(state().tool).toBe('none');
  });

  it('leaves a measurement and an open dialog to their own Escape', () => {
    render(<App />);
    act(() => state().setTool('measure-line'));
    act(escape);
    expect(state().tool).toBe('measure-line');
    expect(state().panel).toBe('catalog');
    act(() => state().setTool('none'));
    act(() => useWelcome.getState().setOpen(true));
    act(escape);
    expect(state().panel).toBe('catalog');
  });
});
