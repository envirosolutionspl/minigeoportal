/** Address search through GUGiK's universal geocoder (UUG). */

export interface GeocodeHit {
  label: string;
  /** EPSG:2180 */
  center: [number, number];
}

interface UugResult {
  city?: string;
  street?: string;
  number?: string;
  teryt?: string;
  x?: string | number;
  y?: string | number;
}

interface UugResponse {
  found_objects?: number;
  results?: Record<string, UugResult>;
}

const UUG = 'https://services.gugik.gov.pl/uug/';

export async function geocode(query: string, signal?: AbortSignal): Promise<GeocodeHit[]> {
  const url = `${UUG}?request=GetAddress&address=${encodeURIComponent(query)}&srid=2180`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`UUG ${res.status}`);
  const data = (await res.json()) as UugResponse;
  return Object.values(data.results ?? {})
    .map((r) => {
      const x = Number(r.x);
      const y = Number(r.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      const label = [r.city, [r.street, r.number].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      return { label, center: [x, y] as [number, number] };
    })
    .filter((h): h is GeocodeHit => h !== null);
}
