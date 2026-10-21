import { useEffect, useRef } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import { defaults as defaultControls, ScaleLine, ZoomToExtent } from 'ol/control';
import { EPSG2180, GUGIK_RESOLUTIONS, OGC_PIXEL, POLAND_EXTENT } from './projection';
import { BASE_MAPS, OVERLAYS, TILE_SERVICE_BY_ID, selectedSublayers } from '@/services/registry';
import { createOverlayLayer, createTileLayer, resolutionRange } from '@/services/layers';
import { useStatusStore } from '@/services/status';
import { hasInitialView, overlayOpacity, useMapStore } from '@/state/store';
import { attachFeatureInfo } from './featureInfoClick';
import { attachFocus } from './focus';

export function MapView() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = container.current;
    if (!el) return;

    const { center, zoom, setView } = useMapStore.getState();
    // Each base map is a composition: one layer per tile service, drawn in its scale range.
    const bases = BASE_MAPS.flatMap((def) =>
      def.sources.flatMap((src) => {
        const service = TILE_SERVICE_BY_ID.get(src.service);
        if (!service) return [];
        const layer = createTileLayer(service, {
          minResolution: src.minScale !== undefined ? src.minScale * OGC_PIXEL : undefined,
          maxResolution: src.maxScale !== undefined ? src.maxScale * OGC_PIXEL : undefined,
        });
        return [{ def, layer }];
      }),
    );
    const overlays = OVERLAYS.map((def) => ({ def, layer: createOverlayLayer(def) }));

    const view = new View({
      projection: EPSG2180,
      resolutions: GUGIK_RESOLUTIONS,
      center,
      zoom,
      extent: EPSG2180.getExtent(),
      constrainOnlyCenter: true,
    });

    const map = new Map({
      target: el,
      layers: [...bases.map((b) => b.layer), ...overlays.map((o) => o.layer)],
      view,
      controls: defaultControls({ attributionOptions: { collapsible: false }, rotate: false }).extend([
        new ScaleLine({ units: 'metric' }),
        new ZoomToExtent({ extent: POLAND_EXTENT, label: wholeCountryIcon(), tipLabel: 'Cała Polska' }),
      ]),
    });

    if (!hasInitialView) view.fit(POLAND_EXTENT, { padding: [24, 24, 24, 24] });

    const applyState = () => {
      const s = useMapStore.getState();
      for (const { def, layer } of bases) layer.setVisible(def.id === s.base);
      for (const { def, layer } of overlays) {
        const names = selectedSublayers(def, s.sublayers);
        const visible = s.overlays.includes(def.id) && names.length > 0;
        layer.setVisible(visible);
        if (!visible) continue;
        const source = layer.getSource()!;
        const layersParam = names.join(',');
        if (source.getParams().LAYERS !== layersParam) source.updateParams({ LAYERS: layersParam });
        const range = resolutionRange(def, names);
        layer.setMinResolution(range.min);
        layer.setMaxResolution(range.max);
        layer.setOpacity(overlayOpacity(def.id, s.opacity));
      }
    };
    applyState();

    const unsubscribeState = useMapStore.subscribe((s, prev) => {
      if (s.base !== prev.base || s.overlays !== prev.overlays || s.sublayers !== prev.sublayers || s.opacity !== prev.opacity) {
        applyState();
      }
    });

    map.on('moveend', () => {
      const c = view.getCenter();
      const z = view.getZoom();
      const r = view.getResolution();
      if (c && z !== undefined && r !== undefined) setView([c[0], c[1]], z, r / OGC_PIXEL);
    });

    // Probe services only after the first view is drawn, so probes never compete with visible tiles.
    map.once('rendercomplete', () => void useStatusStore.getState().probeAll());

    const detachFeatureInfo = attachFeatureInfo(map, overlays);
    const detachFocus = attachFocus(map);

    return () => {
      detachFocus();
      detachFeatureInfo();
      unsubscribeState();
      map.setTarget(undefined);
    };
  }, []);

  return <div ref={container} className="absolute inset-0 bg-[var(--map-bg)]" />;
}

/** Label of the "whole country" control: a frame around a map (Lucide icon shapes). */
function wholeCountryIcon(): HTMLElement {
  const span = document.createElement('span');
  span.innerHTML =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect width="10" height="8" x="7" y="8" rx="1"/></svg>';
  return span;
}
