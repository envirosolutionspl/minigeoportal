import { useEffect, useRef } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import { defaults as defaultControls, ScaleLine } from 'ol/control';
import { EPSG2180, GUGIK_RESOLUTIONS, POLAND_EXTENT } from './projection';
import { SERVICES } from '@/services/registry';
import { createLayer } from '@/services/layers';
import { hasInitialView, serviceOpacity, useMapStore } from '@/state/store';

export function MapView() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = container.current;
    if (!el) return;

    const { center, zoom, setView } = useMapStore.getState();
    const layers = SERVICES.map(createLayer);
    const byId = new window.Map(layers.map((l) => [l.get('serviceId') as string, l]));

    const view = new View({
      projection: EPSG2180,
      resolutions: GUGIK_RESOLUTIONS,
      center,
      zoom,
      extent: EPSG2180.getExtent(),
      smoothExtentConstraint: true,
      constrainOnlyCenter: true,
    });

    const map = new Map({
      target: el,
      layers,
      view,
      controls: defaultControls({ attributionOptions: { collapsible: false }, rotate: false }).extend([
        new ScaleLine({ units: 'metric' }),
      ]),
    });

    if (!hasInitialView) view.fit(POLAND_EXTENT, { padding: [24, 24, 24, 24] });

    const applyState = () => {
      const { base, overlays, opacity } = useMapStore.getState();
      for (const [id, layer] of byId) {
        const visible = id === base || overlays.includes(id);
        if (layer.getVisible() !== visible) layer.setVisible(visible);
        const o = serviceOpacity(id, opacity);
        if (layer.getOpacity() !== o) layer.setOpacity(o);
      }
    };
    applyState();

    const unsubscribeState = useMapStore.subscribe((s, prev) => {
      if (s.base !== prev.base || s.overlays !== prev.overlays || s.opacity !== prev.opacity) applyState();
      if (s.fly && s.fly !== prev.fly) {
        view.animate({ center: s.fly.center, zoom: s.fly.zoom, duration: 600 });
      }
    });

    map.on('moveend', () => {
      const c = view.getCenter();
      const z = view.getZoom();
      if (c && z !== undefined) setView([c[0], c[1]], z);
    });

    return () => {
      unsubscribeState();
      map.setTarget(undefined);
    };
  }, []);

  return <div ref={container} className="absolute inset-0 bg-[var(--map-bg)]" />;
}
