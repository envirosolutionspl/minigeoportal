import { beforeEach, describe, expect, it } from 'vitest';
import { statusOf, useStatusStore } from './status';
import { withCapabilities } from '@/test/helpers';

beforeEach(async () => {
  useStatusStore.setState({ status: {} });
  await withCapabilities();
});

const report = (id: string, ok: boolean) => useStatusStore.getState().reportLoad(id, ok);
const status = (id: string) => statusOf(useStatusStore.getState().status, id);

describe('initial status from the capabilities cache', () => {
  it('is unknown for working services, blocked for 401/403 and down for other errors', () => {
    expect(status('kieg')).toBe('unknown');
    expect(status('kiut')).toBe('blocked');
    expect(status('rcn')).toBe('down');
  });
});

describe('reportLoad', () => {
  it('marks an overlay degraded after one failed image and ok after a success', () => {
    report('kieg', false);
    expect(status('kieg')).toBe('degraded');
    report('kieg', true);
    expect(status('kieg')).toBe('ok');
  });

  it('tolerates a single failed tile of a base map, not two in a row', () => {
    report('orto', false);
    expect(status('orto')).toBe('unknown');
    report('orto', false);
    expect(status('orto')).toBe('degraded');
    report('orto', true);
    report('orto', false);
    expect(status('orto')).toBe('ok');
  });
});
