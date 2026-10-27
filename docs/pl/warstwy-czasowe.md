# Warstwy zmienne w czasie

Warstwę, której dane mają daty (kolejne edycje ortofotomapy, plany obowiązujące w danym roku), oznacza się w `layers.yaml` blokiem `time`. Włączona z listy warstw rysuje jedną wartość: skonfigurowaną, domyślną usługi albo najnowszą. Datę wybiera się w podróży w czasie (niżej).

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

Przy `capabilities` serwer odczytuje wymiar z usługi (listę albo zakresy zapisane jako start/koniec/okres, jak zapisuje je WMS) przy odświeżaniu metadanych (raz na dobę albo od razu przez `npm run update`).

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

Każda edycja ma `value` i, jeśli różni się od warstwy, własny `layer` (jedna podwarstwa albo kilka po przecinku, w kolejności rysowania; usługa rysuje każdą w jej zakresie skal) oraz opcjonalnie `label` (_tekst_), którym pasek czasu nazywa edycję zamiast wartości. Włączona z listy warstw seria rysuje podwarstwy warstwy (najnowszą edycję); w podróży w czasie rysuje podwarstwy wybranej edycji. `url` edycji czeka na obsługę.

## Podróż w czasie

`map.yaml` wskazuje warstwy z blokiem `time`, które pasek czasu rysuje nad podkładem na wybraną datę, po jednej naraz:

```yaml
timeTravel:
  base: orto # podkład wymuszany, póki podróż trwa (opcjonalnie)
  layers:
    - { id: orto-archiwalna, label: Zdjęcia, added: nowe-budynki } # wymiar jednej usługi, nad zdjęciami
    - { id: mapy-dawne, label: Mapy dawne, base: mapa } # seria edycji, nad dzisiejszą mapą
```

Kurtyna porównuje wybraną datę z podkładem, więc warto, by podkład był tego samego rodzaju co warstwa: dawne zdjęcia z dzisiejszymi zdjęciami, dawne mapy z dzisiejszą mapą.

Narzędzie „Podróż w czasie” (na komputerze przycisk obok pomiaru, na telefonie pozycja w „Więcej”) pokazuje pasek z przełącznikiem warstw (gdy jest ich więcej niż jedna), suwakiem dat, przyciskami do wcześniejszej i późniejszej daty, opisem tego, co widać, i podpowiedzią, gdy mapa jest za daleko, by warstwa rysowała. Usługa z wymiarem TIME pokazuje stan na datę (np. zdjęcie zrobione tego dnia albo wcześniej), więc suwak chodzi po datach, nie po każdym miesiącu zakresu. Bez modułu, który zna daty w danym miejscu, suwak ma pierwszą wartość każdego roku z listy warstwy. Moduł `gugik` z `ortho.history` wskazującym tę warstwę zawęża daty do zdjęć, które skorowidz ortofotomapy zna w środku mapy (zob. [Wyszukiwarka i moduły](wyszukiwarka-i-moduly.md)).

Przycisk „Porównaj z aktualnymi danymi” w pasku dzieli mapę kurtyną: po lewej warstwa na wybraną datę, po prawej podkład (dziś). Uchwyt na linii przeciąga się myszą lub palcem, klik na wysokości uchwytu stawia linię w tym miejscu, strzałki w lewo i w prawo przesuwają ją z klawiatury.

Warstwa z `added` dostaje w pasku przełącznik tego, co przybyło po wybranej dacie: `added` wskazuje warstwę z serią lat (edycja na rok, np. `budynki_2019`), a pasek rysuje nad warstwą podróży edycje z lat późniejszych niż rok wybranej daty, na całej mapie, także po prawej stronie kurtyny. Przy zdjęciach to budynki dodane do BDOT10k po dacie zdjęcia: na dawnym zdjęciu widać, gdzie staną, na dzisiejszym, co nowego powstało. Przełącznik znika, gdy nie ma późniejszych lat. BDOT10k dostaje budynek zwykle rok lub dwa po budowie, więc część obrysów może już być na zdjęciu.

Przy zmianie warstwy data zostaje, a suwak staje na najpóźniejszej wartości nowej warstwy nie późniejszej od niej (zdjęcie z 2007 na mapach dawnych pokazuje ostatni arkusz sprzed 2007).

Link do widoku niesie datę (`t=2007-01-01`, z porównaniem `c=1`, z inną warstwą niż pierwsza `tl=mapy-dawne`, z nowymi budynkami `a=1`) i otwiera mapę od razu w podróży; Escape ją kończy i przywraca podkład sprzed niej.
