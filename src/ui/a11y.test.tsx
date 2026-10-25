import { beforeEach, describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import axe from 'axe-core';
import { TopBar } from './TopBar';
import { LayerCatalog } from './LayerCatalog';
import { InfoPanel } from './InfoPanel';
import { MeasureBar } from './MeasureBar';
import { WelcomeDialog, useWelcome } from './WelcomeDialog';
import { ReportDialog, useReport } from './ReportDialog';
import { PrintPanel } from './Print';
import { AccessibilityDialog, useAccessibility } from './AccessibilityDialog';
import { BasemapSwitcher } from './BasemapSwitcher';
import { useInfoStore } from '@/state/info';
import { useMapStore } from '@/state/store';
import { stubFetch, withCapabilities } from '@/test/helpers';

/** WCAG 2.1 A and AA rules; contrast needs real rendering and is checked by hand (see README). */
async function violations(container: Element) {
  const result = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

beforeEach(async () => {
  stubFetch([['/api/report', { enabled: true }]]);
  await withCapabilities();
  useMapStore.setState({ overlays: ['kieg'], sublayers: {}, panel: 'catalog', scale: 47247, tool: 'none' });
});

describe('accessibility (axe, WCAG 2.1 AA)', () => {
  it('search bar and tool buttons', async () => {
    const { container } = render(<TopBar />);
    expect(await violations(container)).toEqual([]);
  });

  it('the "More" sheet of phones, with the display aids unfolded', async () => {
    const { container, getByRole } = render(<TopBar />);
    act(() => getByRole('button', { name: 'Więcej' }).click());
    act(() => getByRole('button', { name: 'Ułatwienia' }).click());
    expect(await violations(container)).toEqual([]);
  });

  it('the wheel of base maps', async () => {
    const { container, getByRole } = render(
      <main>
        <BasemapSwitcher />
      </main>,
    );
    const thumb = getByRole('button', { name: /^Przełącz podkład na/ });
    act(() => {
      thumb.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    });
    await act(() => new Promise((r) => setTimeout(r, 500)));
    expect(getByRole('listbox', { name: 'Podkłady' })).toBeTruthy();
    expect(await violations(container)).toEqual([]);
  });

  it('layer catalog and base map switcher', async () => {
    const { container } = render(
      <main>
        <LayerCatalog />
        <BasemapSwitcher />
      </main>,
    );
    expect(await violations(container)).toEqual([]);
  });

  it('print panel', async () => {
    useMapStore.setState({ tool: 'print' });
    const { container } = render(
      <main>
        <PrintPanel />
      </main>,
    );
    expect(await violations(container)).toEqual([]);
  });

  it('place panel and measurement bar', async () => {
    useInfoStore.getState().start([656849, 482462], ['kieg']);
    useMapStore.setState({ tool: 'measure-line', measureResult: '1 km' });
    const { container } = render(
      <main>
        <InfoPanel />
        <MeasureBar />
      </main>,
    );
    expect(await violations(container)).toEqual([]);
  });

  it('dialogs', async () => {
    const { container } = render(
      <main>
        <WelcomeDialog />
        <ReportDialog />
        <AccessibilityDialog />
      </main>,
    );
    for (const open of [
      () => useWelcome.getState().setOpen(true),
      () => useReport.getState().openReport(),
      () => useAccessibility.getState().setOpen(true),
    ]) {
      act(open);
    }
    expect(await violations(container)).toEqual([]);
  });
});
