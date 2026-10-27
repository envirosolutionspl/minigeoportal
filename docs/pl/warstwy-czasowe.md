# Warstwy zmienne w czasie

Warstwę, której dane mają daty (kolejne edycje ortofotomapy, plany z danego roku), oznacza się w `layers.yaml` blokiem `time`. Są dwa rodzaje takich warstw: jedna usługa z wymiarem czasu albo seria osobnych edycji.

Włączona z listy warstw, warstwa z datami rysuje jedną wartość: skonfigurowaną, domyślną usługi albo najnowszą. Datę wybiera się w [podróży w czasie](#podróż-w-czasie).

## Wymiar jednej usługi

Usługa WMS lub WMTS, która rysuje daną datę, gdy się o nią poprosi (`TIME=2020` albo inny wymiar `DIM_<nazwa>`):

```yaml
time:
  type: dimension
  param: TIME # albo DIM_ELEVATION i podobne
  values: capabilities # wartości, które usługa podaje w capabilities
  default: '2020' # opcjonalnie: rysowana wartość; w przeciwnym razie domyślna usługi albo najnowsza
```

`values: capabilities` działa tylko dla WMS. Serwer odczytuje wtedy wymiar z usługi przy odświeżaniu metadanych (raz na dobę albo od razu przez `npm run update`). Dla WMTS podaj listę albo zakres z okresem ISO 8601 w latach, miesiącach lub dniach:

```yaml
values: ['2015', '2018', '2021']
values: { start: '2010', end: '2024', step: P2Y }
values: { start: '2023-01', end: '2024-12', step: P1M }
```

## Seria edycji

Gdy każda data to osobna warstwa usługi:

```yaml
time:
  type: series
  editions:
    - value: '2015'
      url: https://example.org/wms/orto2015
    - value: '2020'
      layer: orto_2020
```

Każda edycja ma:

- `value`: datę albo inną wartość;
- `layer`: własną podwarstwę, jeśli różni się od warstwy. Może to być kilka podwarstw po przecinku, w kolejności rysowania; usługa rysuje każdą w jej zakresie skal;
- `label` (_tekst_, opcjonalnie): nazwę edycji na pasku czasu zamiast wartości;
- `url`: własny adres usługi (zarezerwowane, jeszcze nieobsługiwane).

Włączona z listy warstw seria rysuje podwarstwy samej warstwy (najnowszą edycję). W podróży w czasie rysuje podwarstwy wybranej edycji.

## Podróż w czasie

`map.yaml` wskazuje warstwy z blokiem `time`, które pasek czasu rysuje nad podkładem na wybraną datę, po jednej naraz:

```yaml
timeTravel:
  base: orto # podkład wymuszany, póki podróż trwa (opcjonalnie)
  layers:
    - { id: orto-archiwalna, label: Zdjęcia } # wymiar jednej usługi, nad zdjęciami
    - { id: mapy-dawne, label: Mapy dawne, base: mapa } # seria edycji, nad dzisiejszą mapą
```

Kurtyna porównuje wybraną datę z podkładem. Dlatego podkład powinien być tego samego rodzaju co warstwa: dawne zdjęcia z dzisiejszymi zdjęciami, dawne mapy z dzisiejszą mapą.

Warstwy podróży w czasie są pobierane z CORS (`crossOrigin: anonymous`), żeby przeglądarka mogła rozpoznać pusty obraz. Ich usługa musi więc odsyłać nagłówek `Access-Control-Allow-Origin` (usługi GUGiK go odsyłają).

### Co widzi odwiedzający

Narzędzie „Podróż w czasie” to przycisk w kolumnie narzędzi (na telefonie pozycja w „Więcej”). Otwiera pasek z:

- przełącznikiem warstw, gdy jest ich więcej niż jedna;
- suwakiem dat i przyciskami do wcześniejszej i późniejszej daty;
- opisem tego, co widać, i podpowiedzią, gdy mapa jest za daleko, by warstwa rysowała;
- przyciskiem „Porównaj z aktualnymi danymi”.

Suwak chodzi po datach, z których są dane, a nie po każdym miesiącu zakresu: usługa z wymiarem TIME pokazuje stan na datę (zdjęcie zrobione tego dnia albo wcześniej). Bez modułu, który zna daty w danym miejscu, suwak ma pierwszą wartość każdego roku z listy warstwy. Moduł `gugik` zawęża daty do zdjęć i arkuszy znanych w środku mapy (zob. [Wyszukiwarka i moduły](wyszukiwarka-i-moduly.md#ortho-data-zdjęcia-i-archiwum-zdjęć)).

Przy zmianie warstwy data zostaje. Suwak staje na najpóźniejszej wartości nowej warstwy, nie późniejszej od wybranej daty (zdjęcie z 2007 na mapach dawnych pokazuje ostatni arkusz sprzed 2007).

### Kurtyna

„Porównaj z aktualnymi danymi” dzieli mapę pionową linią: po lewej warstwa na wybraną datę, po prawej podkład, czyli dziś. Linię przesuwa się:

- przeciągając uchwyt myszą lub palcem;
- klikając na wysokości uchwytu, w miejscu, gdzie ma stanąć;
- strzałkami w lewo i w prawo z klawiatury.

### Gdy usługa nie działa

- Usługa nie odpowiada: pasek mówi np. „Usługa warstwy Ortofotomapa archiwalna nie odpowiedziała.”.
- Usługa przysyła obraz cały biały albo cały przezroczysty (tak usługi GUGiK odpowiadają w czasie awarii, a mapy dawne także tam, gdzie nie ma arkusza): pasek mówi „Brak obrazu warstwy Ortofotomapa archiwalna w tym miejscu: nie ma tu danych z tej daty albo usługa warstwy chwilowo nie działa.”.

W obu przypadkach obok jest przycisk „Spróbuj ponownie”.

### Wydruk i linki

Wydruk otwarty w trakcie podróży drukuje warstwę na wybraną datę nad jej podkładem, bez kurtyny. Stopka podaje nazwę warstwy i datę („Ortofotomapa archiwalna, stan na 01.01.2007”). Po zamknięciu wydruku podróż trwa dalej.

Link do widoku niesie datę i otwiera mapę od razu w podróży:

- `t=2007-01-01`: data;
- `c=1`: z porównaniem;
- `tl=mapy-dawne`: warstwa inna niż pierwsza.

Escape kończy podróż i przywraca podkład sprzed niej. Link `app:time` w treściach Markdown otwiera podróż w czasie (zob. [Treści i języki](tresci-i-jezyki.md)).
