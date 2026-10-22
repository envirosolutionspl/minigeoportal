# Layers that change over time

A layer whose data has dates (orthophoto editions, plans in force in a given year) is marked in `layers.yaml` with a `time` block. The map draws one value of it; a view to choose another one is planned, and the configuration already describes everything it will need.

## A dimension of one service

A WMS or WMTS service that draws a given date when asked for it (`TIME=2020`, or another dimension `DIM_<name>`):

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

With `capabilities` the server reads the dimension from the service (a list, or ranges written start/end/period, as WMS writes them) when it refreshes the metadata (`npm run update`).

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

Each edition has a `value` and, where it differs from the layer, its own `url` or `layer`. The layer's own `url` and sublayers show the newest edition.
