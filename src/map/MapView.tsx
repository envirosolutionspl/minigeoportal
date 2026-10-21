import { useEffect, useRef } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import { defaults as defaultControls, ScaleLine } from 'ol/control';
import { EPSG2180, GUGIK_RESOLUTIONS, OGC_PIXEL, POLAND_EXTENT } from './projection';
import { BASE_MAPS, OVERLAYS, selectedSublayers } from '@/services/registry';
import { createBaseLayer, createOverlayLayer, resolutionRange } from '@/services/layers';
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
    // A base with an overview is two layers: the overview above its scale threshold, the base below it.
    const bases = BASE_MAPS.flatMap((def) => {
      if (!def.overview) return [{ def, layer: createBaseLayer(def) }];
      const r = def.overview.scale * OGC_PIXEL;
      const overview = BASE_MAPS.find((b) => b.id === def.overview!.id)!;
      return [
        { def, layer: createBaseLayer(overview, { minResolution: r }) },
        { def, layer: createBaseLayer(def, { maxResolution: r }) },
      ];
    });
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
