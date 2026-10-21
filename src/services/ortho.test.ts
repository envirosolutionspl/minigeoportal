import { describe, expect, it } from 'vitest';
import { dateText, orthoAt, pixelText } from './ortho';
import { stubFetch } from '@/test/helpers';

describe('ortho', () => {
  it('formats pixel sizes and dates the Polish way', () => {
    expect(pixelText(0.05)).toBe('5 cm');
    expect(pixelText(0.25)).toBe('25 cm');
    expect(pixelText(1)).toBe('1 m');
    expect(dateText('2025-04-27')).toBe('27.04.2025');
  });

  it('asks the backend at the rounded point', async () => {
    const { calls } = stubFetch([['/api/orto', { archived: 0 }]]);
    expect(await orthoAt([636500.4, 486499.6], new AbortController().signal)).toEqual({ archived: 0 });
    expect(calls).toEqual(['/api/orto?x=636500&y=486500']);
  });
});
