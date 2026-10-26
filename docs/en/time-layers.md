# Layers that change over time

A layer whose data has dates (orthophoto editions, plans in force in a given year) is marked in `layers.yaml` with a `time` block. Switched on from the layer list it draws one value: the configured one, the service's default or the newest. The time view (below) chooses the date.

## A dimension of one service

A WMS or WMTS service that draws a given date when asked for it (`TIME=2020`, or another dimension `DIM_<name>`). `values: capabilities` works for WMS only; for WMTS give a list or a range:

```yaml
time:
  type: dimension
  param: TIME # or DIM_ELEVATION and the like
  values: capabilities # the values the service lists in its capabilities
  default: '2020' # optional: the value drawn; the service's default or the newest otherwise
```

`values` can also be a list, or a range with an ISO 8601 period of years, months or days:

```yaml
values: ['2015', '2018', '2021']
values: { start: '2010', end: '2024', step: P2Y }
values: { start: '2023-01', end: '2024-12', step: P1M }
```

With `capabilities` the server reads the dimension from the service (a list, or ranges written start/end/period, as WMS writes them) when it refreshes the metadata (once a day, or at once with `npm run update`).

## A series of editions

When every date is a separate service or layer:

```yaml
time:
  type: series
  editions:
    - value: '2015'
      url: https://example.org/wms/ortho2015
    - value: '2020'
      layer: ortho_2020
```

Each edition has a `value` and, where it differs from the layer, its own `layer` (one sublayer, or several separated by commas in drawing order; the service draws each in its scale range) and optionally a `label` (_text_) the time bar calls the edition by instead of its value. Switched on from the layer list, a series draws the layer's sublayers (the newest edition); in the time view it draws the sublayers of the chosen edition. An edition's `url` waits for support.

## The time view

`map.yaml` names the layers with a `time` block that the time bar draws over the base map as of the chosen date, one at a time:

```yaml
timeTravel:
  base: orto # a base map forced while the view is open (optional)
  layers:
    - { id: orto-archiwalna, label: Photos } # a dimension of one service, over the photos
    - { id: mapy-dawne, label: Old maps, base: mapa } # a series of editions, over today's map
```

The curtain compares the chosen date with the base map, so the base map is best of the same kind as the layer: old photos with today's photos, old maps with today's map.

The "Time travel" tool (a button beside the measurement on a computer, an entry of "More" on a phone) shows a bar with a switch between the layers (when there are several), a slider over the dates, buttons to the earlier and the later date, a line saying what is shown, and a hint when the map is too far out for the layer to draw. A service with a TIME dimension shows the state as of a date (a photo taken on that day or before), so the slider goes by dates, not by every month of the range. Without a module that knows the dates at a place, the slider holds the first value of each year of the layer's list. The `gugik` module with `ortho.history` naming the layer narrows the dates to the photos the orthophoto index knows at the middle of the map (see [Search and modules](search-and-modules.md)).

The bar's "Compare with the present" button splits the map with a curtain: the layer as of the chosen date on the left, the base map (today) on the right. The handle on the line drags with a mouse or a finger, a click at the handle's height puts the line there, and the left and right arrow keys move it from the keyboard.

Switching the layer keeps the date, and the slider stands on the newest value of the new layer not after it (a photo of 2007 shows the last sheet before 2007 on the old maps).

A link to the view carries the date (`t=2007-01-01`, with the comparison `c=1`, with another layer than the first `tl=mapy-dawne`) and opens the map in the time view; Escape ends it and brings the base map used before it back.
