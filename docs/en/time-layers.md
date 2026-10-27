# Layers that change over time

A layer whose data has dates (orthophoto editions, plans of a given year) is marked in `layers.yaml` with a `time` block. There are two kinds of such layers: one service with a time dimension, or a series of separate editions.

Switched on from the layer list, a layer with dates draws one value: the configured one, the service's default or the newest. The date is chosen in the [time view](#the-time-view).

## A dimension of one service

A WMS or WMTS service that draws a given date when asked for it (`TIME=2020`, or another dimension `DIM_<name>`):

```yaml
time:
  type: dimension
  param: TIME # or DIM_ELEVATION and the like
  values: capabilities # the values the service lists in its capabilities
  default: '2020' # optional: the value drawn; the service's default or the newest otherwise
```

`values: capabilities` works for WMS only. The server then reads the dimension from the service when it refreshes the metadata (once a day, or at once with `npm run update`). For WMTS give a list, or a range with an ISO 8601 period of years, months or days:

```yaml
values: ['2015', '2018', '2021']
values: { start: '2010', end: '2024', step: P2Y }
values: { start: '2023-01', end: '2024-12', step: P1M }
```

## A series of editions

When every date is a separate layer of a service:

```yaml
time:
  type: series
  editions:
    - value: '2015'
      url: https://example.org/wms/ortho2015
    - value: '2020'
      layer: ortho_2020
```

Each edition has:

- `value`: a date or another value;
- `layer`: its own sublayer, where it differs from the layer. It may be several sublayers separated by commas, in drawing order; the service draws each in its scale range;
- `label` (_text_, optional): the edition's name on the time bar instead of its value;
- `url`: an address of its own (reserved, not supported yet).

Switched on from the layer list, a series draws the layer's own sublayers (the newest edition). In the time view it draws the sublayers of the chosen edition.

## The time view

`map.yaml` names the layers with a `time` block that the time bar draws over the base map as of the chosen date, one at a time:

```yaml
timeTravel:
  base: orto # a base map forced while the view is open (optional)
  layers:
    - { id: orto-archiwalna, label: Photos } # a dimension of one service, over the photos
    - { id: mapy-dawne, label: Old maps, base: mapa } # a series of editions, over today's map
```

The curtain compares the chosen date with the base map. So the base map should be of the same kind as the layer: old photos with today's photos, old maps with today's map.

The layers of the time view are fetched with CORS (`crossOrigin: anonymous`), so that the browser can recognise a blank image. Their service must therefore send the `Access-Control-Allow-Origin` header (GUGiK's services do).

### What visitors see

The "Time travel" tool is a button in the column of tools (an entry of "More" on a phone). It opens a bar with:

- a switch between the layers, when there are several;
- a slider over the dates, and buttons to the earlier and the later date;
- a line saying what is shown, and a hint when the map is too far out for the layer to draw;
- a "Compare with the present" button.

The slider goes by the dates that have data, not by every month of the range: a service with a TIME dimension shows the state as of a date (a photo taken on that day or before). Without a module that knows the dates at a place, the slider holds the first value of each year of the layer's list. The `gugik` module narrows the dates to the photos and sheets known at the middle of the map (see [Search and modules](search-and-modules.md#ortho-the-date-of-a-photo-and-the-photo-archive)).

Switching the layer keeps the date. The slider stands on the newest value of the new layer not after the chosen date (a photo of 2007 shows the last sheet before 2007 on the old maps).

### The curtain

"Compare with the present" splits the map with a vertical line: the layer as of the chosen date on the left, the base map, that is today, on the right. The line moves:

- by dragging the handle with a mouse or a finger;
- by a click at the handle's height, where the line should go;
- with the left and right arrow keys.

### When a service fails

- The service does not answer: the bar says, for instance, "The service of the layer Archival orthophoto map did not answer.".
- The service sends an image white or transparent all over (as GUGiK's services answer while down, and the old maps also where there is no sheet): the bar says "No image of the layer Archival orthophoto map here: there is no data from this date, or the layer's service is down for a while.".

Both come with a "Try again" button.

### Print and links

A print opened during the time view prints the layer as of the chosen date over its base map, without the curtain. Its footer names the layer and the date ("Archival orthophoto map as of 01.01.2007"). Closing the print goes back to the time view.

A link to the view carries the date and opens the map in the time view:

- `t=2007-01-01`: the date;
- `c=1`: with the comparison;
- `tl=mapy-dawne`: a layer other than the first.

Escape ends the view and brings back the base map used before it. An `app:time` link in Markdown texts opens the time view (see [Texts and languages](texts-and-languages.md)).
