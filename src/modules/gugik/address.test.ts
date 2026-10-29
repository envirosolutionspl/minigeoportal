import { describe, expect, it } from 'vitest';
import { addressAt } from './address';
import { stubFetch } from '@/test/helpers';

const signal = new AbortController().signal;

const answer = (result: object | null) => JSON.stringify({ type: 'address', results: result && { 1: result } });

describe('addressAt', () => {
  it('asks the geocoder for the address nearest to a point, east first, and shortens the street', async () => {
    const { calls } = stubFetch([
      ['GetAddressReverse', answer({ city: 'Warszawa', street: 'ulica Krucza', number: '33/39', code: '00-525', distance: '32.87' })],
    ]);
    expect(await addressAt([637700, 486600], signal)).toEqual({ street: 'ul. Krucza 33/39', place: '00-525 Warszawa', distance: 32.87 });
    expect(decodeURIComponent(calls[0])).toBe(
      'https://services.gugik.gov.pl/uug/?request=GetAddressReverse&location=POINT(637700.00 486600.00)&srid=2180',
    );
  });

  it('names a place without streets by the place and a missing postcode by nothing', async () => {
    stubFetch([['GetAddressReverse', answer({ city: 'Krzewina', street: null, number: '12', code: null, distance: '8' })]]);
    expect(await addressAt([1, 2], signal)).toEqual({ street: 'Krzewina 12', place: 'Krzewina', distance: 8 });
  });

  it('has none where no address is within reach, and fails on an error of the service', async () => {
    stubFetch([['GetAddressReverse', answer(null)]]);
    expect(await addressAt([1, 2], signal)).toBeNull();
    stubFetch([['uug', 'down', { status: 503 }]]);
    await expect(addressAt([1, 2], signal)).rejects.toThrow('HTTP 503');
  });
});
