import { useEffect, useRef } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import { defaults as defaultControls, MousePosition, ScaleLine, ZoomToExtent } from 'ol/control';
import { defaults as defaultInteractions } from 'ol/interaction/defaults';
import { duration } from './motion';
import { HOME_EXTENT, PROJECTION, RESOLUTIONS, resolutionToScale, scaleToResolution } from './projection';
import { config, selectedSublayers, tileServiceById, type Overlay } from '@/config/runtime';
import { loadCatalogLayer, overlayDef, useCatalog } from '@/services/catalog';
import { createOverlayLayer, createTileLayer, resolutionRange, showSublayers, type OverlayLayer } from '@/services/layers';
import { hasInitialView, overlayOpacity, useMapStore } from '@/state/store';
import { attachFeatureInfo } from './featureInfoClick';
import { attachFocus } from './focus';
import { attachMeasure } from './measure';
import { attachPrint } from './print';
import { MapStatus } from './mapStatus';
import { coordinateBar } from './format';
import { t } from '@/i18n';

export function MapView() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = container.current;
    if (!el) return;

    const { center, zoom, setView } = useMapStore.getState();
    // Each base map is a composition: one layer per tile service, drawn in its scale range.
    const bases = config.map.baseMaps.flatMap((def) =>
      def.sources.flatMap((src) => {
        const service = tileServiceById.get(src.service);
        if (!service) return [];
        const layer = createTileLayer(service, {
          minResolution: src.minScale !== undefined ? scaleToResolution(src.minScale) : undefined,
          maxResolution: src.maxScale !== undefined ? scaleToResolution(src.maxScale) : undefined,
        });
        return [{ def, layer }];
      }),
    );
    /**
     * Overlay layers are made when switched on, not upfront: the catalog has hundreds of layers.
     * Switched off, they are dropped again: a hidden WMS layer would keep its last image, several
     * megabytes each, for the whole visit.
     */
    const overlays = new globalThis.Map<string, { def: Overlay; layer: OverlayLayer }>();

    const view = new View({
      projection: PROJECTION,
      resolutions: RESOLUTIONS,
      center,
      zoom,
      extent: config.map.projection.extent,
      constrainOnlyCenter: true,
    });

    const status = new MapStatus();
    const map = new Map({
      target: el,
      layers: bases.map((b) => b.layer),
      view,
      interactions: defaultInteractions({ zoomDuration: duration(250) }),
      controls: defaultControls({
        attributionOptions: { collapsible: false },
        rotate: false,
        zoomOptions: { duration: duration(250), zoomInTipLabel: t('map.zoomIn'), zoomOutTipLabel: t('map.zoomOut') },
      }).extend([
        new ScaleLine({ units: 'metric' }),
        new ZoomToExtent({ extent: HOME_EXTENT, label: wholeCountryIcon(), tipLabel: config.map.view.homeLabel }),
        // The scale, and beside it the cursor position (with a mouse only), in the bottom bar.
        status,
        new MousePosition({
          target: status.positionTarget,
          projection: PROJECTION,
          coordinateFormat: (c) => (c ? coordinateBar(c) : ''),
          placeholder: '',
        }),
      ]),
    });

    if (!hasInitialView) view.fit(HOME_EXTENT, { padding: [24, 24, 24, 24] });

    let alive = true;
    /** The layer of an overlay, made now if its definition is known; catalog layers load first. */
    const ensureOverlay = (id: string) => {
      if (overlays.has(id)) return;
      const def = overlayDef(id);
      if (!def) {
        // A layer that could not be loaded is not asked for again on every change of the map.
        if (useCatalog.getState().failed.has(id)) return;
        void loadCatalogLayer(id).then((loaded) => loaded && alive && applyState());
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
      for (const [id, { def, layer }] of overlays) {
        if (!s.overlays.includes(id)) {
          map.removeLayer(layer);
          layer.dispose();
          overlays.delete(id);
          continue;
        }
        const names = selectedSublayers(def, s.sublayers);
        const visible = names.length > 0;
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
      if (c && z !== undefined && r !== undefined) setView([c[0], c[1]], z, resolutionToScale(r));
    });

    const detachFeatureInfo = attachFeatureInfo(map, () => [...overlays.values()]);
    const detachFocus = attachFocus(map);
    const detachMeasure = attachMeasure(map);
    const detachPrint = attachPrint(map);

    return () => {
      alive = false;
      detachPrint();
      detachMeasure();
      detachFocus();
      detachFeatureInfo();
      unsubscribeState();
      map.setTarget(undefined);
      map.dispose();
    };
  }, []);

  // Focusable so OpenLayers' keyboard pan and zoom work; Enter asks about the centre.
  return (
    <>
      <div
        ref={container}
        id="map"
        // The map is interactive (OpenLayers reads keys and the pointer), so it takes focus.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        role="region"
        aria-label={t('map.title')}
        aria-describedby="map-keys"
        className="absolute inset-0 bg-[var(--map-bg)]"
      />
      <p id="map-keys" className="sr-only">
        {t('map.keys')}
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
