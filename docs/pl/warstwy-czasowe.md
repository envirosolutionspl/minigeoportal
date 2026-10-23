# Warstwy zmienne w czasie

Warstwę, której dane mają daty (kolejne edycje ortofotomapy, plany obowiązujące w danym roku), oznacza się w `layers.yaml` blokiem `time`. Mapa rysuje jedną jej wartość; widok wyboru innej jest zaplanowany, a konfiguracja już opisuje wszystko, czego będzie potrzebował.

## Wymiar jednej usługi

Usługa WMS lub WMTS, która rysuje daną datę, gdy się o nią poprosi (`TIME=2020` albo inny wymiar `DIM_<nazwa>`). `values: capabilities` działa tylko dla WMS; dla WMTS podaj listę albo zakres:

```yaml
time:
  type: dimension
  param: TIME # albo DIM_ELEVATION i podobne
  values: capabilities # wartości, które usługa podaje w capabilities
  default: '2020' # opcjonalnie: rysowana wartość; w przeciwnym razie domyślna usługi albo najnowsza
```

`values` może też być listą albo zakresem z okresem ISO 8601 w latach, miesiącach lub dniach:

```yaml
values: ['2015', '2018', '2021']
values: { start: '2010', end: '2024', step: P2Y }
values: { start: '2023-01', end: '2024-12', step: P1M }
```

Przy `capabilities` serwer odczytuje wymiar z usługi (listę albo zakresy zapisane jako start/koniec/okres, jak zapisuje je WMS) przy odświeżaniu metadanych (`npm run update`).

## Seria edycji

Gdy każda data to osobna usługa lub warstwa:

```yaml
time:
  type: series
  editions:
    - value: '2015'
      url: https://example.org/wms/orto2015
    - value: '2020'
      layer: orto_2020
```

Każda edycja ma `value` i, jeśli różni się od warstwy, własny `url` lub `layer`. Własne `url` i podwarstwy warstwy pokazują najnowszą edycję i to one są dziś rysowane; `url` i `layer` edycji czekają na widok wyboru.
