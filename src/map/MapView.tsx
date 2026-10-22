import { useEffect, useRef } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import { defaults as defaultControls, MousePosition, ScaleLine, ZoomToExtent } from 'ol/control';
import { defaults as defaultInteractions } from 'ol/interaction/defaults';
import { duration } from './motion';
import { EPSG2180, GUGIK_RESOLUTIONS, OGC_PIXEL, POLAND_EXTENT } from './projection';
import { BASE_MAPS, TILE_SERVICE_BY_ID, selectedSublayers, type Overlay } from '@/services/registry';
import { loadCatalogLayer, overlayDef } from '@/services/catalog';
import { createOverlayLayer, createTileLayer, resolutionRange, showSublayers, type OverlayLayer } from '@/services/layers';
import { hasInitialView, overlayOpacity, useMapStore } from '@/state/store';
import { attachFeatureInfo } from './featureInfoClick';
import { attachFocus } from './focus';
import { attachMeasure } from './measure';
import { attachPrint } from './print';
import { coordinateBar } from './format';

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
    /**
     * Overlay layers are made when first switched on, not upfront: the catalog has hundreds of
     * layers. They stay on the map, hidden, when switched off.
     */
    const overlays = new globalThis.Map<string, { def: Overlay; layer: OverlayLayer }>();

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
      layers: bases.map((b) => b.layer),
      view,
      interactions: defaultInteractions({ zoomDuration: duration(250) }),
      controls: defaultControls({
        attributionOptions: { collapsible: false },
        rotate: false,
        zoomOptions: { duration: duration(250), zoomInTipLabel: 'Przybliż', zoomOutTipLabel: 'Oddal' },
      }).extend([
        new ScaleLine({ units: 'metric' }),
        new ZoomToExtent({ extent: POLAND_EXTENT, label: wholeCountryIcon(), tipLabel: 'Cała Polska' }),
        // Shown only with a mouse (CSS hides it on touch screens), without live announcements.
        new MousePosition({ projection: EPSG2180, coordinateFormat: (c) => (c ? coordinateBar(c) : ''), placeholder: '' }),
      ]),
    });

    if (!hasInitialView) view.fit(POLAND_EXTENT, { padding: [24, 24, 24, 24] });

    /** The layer of an overlay, made now if its definition is known; catalog layers load first. */
    const ensureOverlay = (id: string) => {
      if (overlays.has(id)) return;
      const def = overlayDef(id);
      if (!def) {
        void loadCatalogLayer(id).then((loaded) => loaded && applyState());
        return;
      }
      const layer = createOverlayLayer(def);
      overlays.set(id, { def, layer });
      map.addLayer(layer);
    };

    const applyState = () => {
      const s = useMapStore.getState();
      for (const { def, layer } of bases) layer.setVisible(def.id === s.base);
      for (const id of s.overlays) ensureOverlay(id);
      for (const { def, layer } of overlays.values()) {
        const names = selectedSublayers(def, s.sublayers);
        const visible = s.overlays.includes(def.id) && names.length > 0;
        layer.setVisible(visible);
        if (!visible) continue;
        showSublayers(layer, names);
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

    const detachFeatureInfo = attachFeatureInfo(map, () => [...overlays.values()]);
    const detachFocus = attachFocus(map);
    const detachMeasure = attachMeasure(map);
    const detachPrint = attachPrint(map);

    return () => {
      detachPrint();
      detachMeasure();
      detachFocus();
      detachFeatureInfo();
      unsubscribeState();
      map.setTarget(undefined);
    };
  }, []);

  // Focusable so OpenLayers' keyboard pan and zoom work; Enter asks about the centre.
  return (
    <>
      <div
        ref={container}
        id="map"
        tabIndex={0}
        role="region"
        aria-label="Mapa"
        aria-describedby="map-keys"
        className="absolute inset-0 bg-[var(--map-bg)]"
      />
      <p id="map-keys" className="sr-only">
        Strzałki przesuwają mapę, plus i minus zmieniają skalę, Enter pokazuje informacje o miejscu w środku mapy.
      </p>
    </>
  );
}

/** Label of the "whole country" control: a frame around a map (Lucide icon shapes). */
function wholeCountryIcon(): HTMLElement {
  const span = document.createElement('span');
  span.innerHTML =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect width="10" height="8" x="7" y="8" rx="1"/></svg>';
  return span;
}
