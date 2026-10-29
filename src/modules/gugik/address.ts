/**
 * The address nearest to a point, from the GUGiK geocoder (UUG, the national register of
 * addresses), asked from the browser (the service sends CORS headers). It looks within 100 m;
 * further out, as in a field or a forest, there is none.
 */

const UUG = 'https://services.gugik.gov.pl/uug/';

export interface NearestAddress {
  /** "ul. Krucza 33/39" or, in a place without streets, "Krzewina 12". */
  street: string;
  /** "00-525 Warszawa". */
  place: string;
  /** Metres from the point. */
  distance: number;
}

interface UugAddress {
  city?: string | null;
  street?: string | null;
  number?: string | null;
  code?: string | null;
  distance?: string;
}

/** The register writes the kind of street in full; the short form is the usual one on a letter. */
const shortStreet = (street: string) =>
  street
    .replace(/^ulica /, 'ul. ')
    .replace(/^aleja /, 'al. ')
    .replace(/^plac /, 'pl. ');

/** The nearest address within 100 m of a map point (PL-1992, east and north), or null. */
export async function addressAt([east, north]: [number, number], signal: AbortSignal): Promise<NearestAddress | null> {
  const location = encodeURIComponent(`POINT(${east.toFixed(2)} ${north.toFixed(2)})`);
  const res = await fetch(`${UUG}?request=GetAddressReverse&location=${location}&srid=2180`, { signal });
  if (!res.ok) throw new Error(`UUG: HTTP ${res.status}`);
  const data = (await res.json()) as { results?: Record<string, UugAddress> | null };
  const a = Object.values(data.results ?? {})[0];
  if (!a?.number || !a.city) return null;
  return {
    street: `${a.street ? shortStreet(a.street) : a.city} ${a.number}`,
    place: [a.code, a.city].filter(Boolean).join(' '),
    distance: Number(a.distance) || 0,
  };
}
