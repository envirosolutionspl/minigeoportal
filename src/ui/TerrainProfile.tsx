import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { formatLength, heightText, percentText } from '@/map/format';
import { profileOf, profileSamples, type Profile } from '@/map/profile';
import type { HeightsAt } from '@/modules';
import { t } from '@/i18n';

/** Drawing area of the chart; the SVG stretches it to the bar's width. */
const W = 300;
const H = 90;
/** Heights under the bends closer than this share of the chart to the last one shown are left out, not overlapped. */
const LABEL_GAP = 0.15;

type State = { status: 'loading' } | { status: 'done'; profile: Profile | undefined } | { status: 'error' };

/**
 * The profile of the terrain along a drawn line: a chart of the height over the distance and
 * a summary in words (the range of heights, the climb and descent, the steepest slope), which is
 * what screen readers get. A new line asks again; a line left before its answer is not waited for.
 */
export function TerrainProfile({ line, heightsAt }: { line: [number, number][]; heightsAt: HeightsAt }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    const samples = profileSamples(line);
    heightsAt(
      samples.map((s) => s.coordinate),
      controller.signal,
    )
      .then((heights) => setState({ status: 'done', profile: profileOf(samples, heights) }))
      .catch(() => !controller.signal.aborted && setState({ status: 'error' }));
    return () => controller.abort();
  }, [line, heightsAt]);

  if (state.status === 'loading') {
    return (
      <p className="flex items-center gap-1.5 px-2 pt-2 text-xs text-[var(--muted)]">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> {t('profile.loading')}
      </p>
    );
  }
  if (state.status === 'error') return <p className="px-2 pt-2 text-xs text-[var(--muted)]">{t('profile.error')}</p>;
  const { profile } = state;
  if (!profile) return <p className="px-2 pt-2 text-xs text-[var(--muted)]">{t('profile.none')}</p>;

  // A flat line still gets a metre of room above and below.
  const span = Math.max(profile.max - profile.min, 2);
  const low = (profile.min + profile.max) / 2 - span / 2;
  const x = (d: number) => (d / profile.length) * W;
  const y = (h: number) => H - ((h - low) / span) * H;
  const path = profile.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.distance).toFixed(1)},${y(p.height).toFixed(1)}`).join('');
  /** Where on the chart, in per cent, so dots and labels in HTML keep their shape as the chart stretches. */
  const left = (d: number) => `${(x(d) / W) * 100}%`;
  const measured = profile.bends.filter((b): b is { distance: number; height: number } => b.height !== null);
  const labelled = measured.reduce<typeof measured>((shown, b) => {
    const last = shown[shown.length - 1];
    return last && (b.distance - last.distance) / profile.length < LABEL_GAP ? shown : [...shown, b];
  }, []);

  return (
    <figure className="px-2 pt-2">
      <div aria-hidden="true" className="grid grid-cols-[auto_1fr] gap-x-1.5 text-[11px] text-[var(--muted)] tabular-nums">
        <div className="flex flex-col justify-between text-right">
          <span>{heightText(profile.max)}</span>
          <span>{heightText(profile.min)}</span>
        </div>
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-24 w-full">
            {/* The bends of the drawn line: where each clicked point lies along the profile. */}
            {profile.bends.map((b) => (
              <line
                key={b.distance}
                x1={x(b.distance)}
                x2={x(b.distance)}
                y1={0}
                y2={H}
                stroke="var(--muted)"
                strokeWidth="1"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path
              d={`${path}L${x(profile.points[profile.points.length - 1].distance)},${H}L${x(profile.points[0].distance)},${H}Z`}
              fill="var(--accent)"
              fillOpacity="0.15"
            />
            <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
          {measured.map((b) => (
            <span
              key={b.distance}
              className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)] ring-2 ring-[var(--surface)]"
              style={{ left: left(b.distance), top: `${(y(b.height) / H) * 100}%` }}
            />
          ))}
        </div>
        {labelled.length > 0 && (
          <>
            <span />
            <div className="relative h-4">
              {labelled.map((b) => (
                <span
                  key={b.distance}
                  className="absolute -translate-x-1/2 whitespace-nowrap text-[var(--text)]"
                  style={{ left: left(b.distance) }}
                >
                  {heightText(b.height)}
                </span>
              ))}
            </div>
          </>
        )}
        <span />
        <div className="flex justify-between">
          <span>0 m</span>
          <span>{formatLength(profile.length)}</span>
        </div>
      </div>
      <figcaption className="pt-1 text-xs">
        {t('profile.summary', {
          min: heightText(profile.min),
          max: heightText(profile.max),
          ascent: heightText(profile.ascent),
          descent: heightText(profile.descent),
          slope: percentText(profile.slope),
        })}
        {profile.missing > 0 && ` ${t('profile.partial')}`}
        {measured.length > 0 && (
          <span className="sr-only"> {t('profile.bends', { heights: measured.map((b) => heightText(b.height)).join(', ') })}</span>
        )}
      </figcaption>
    </figure>
  );
}
