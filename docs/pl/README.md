# MiniGeoportal: przegląd

MiniGeoportal pokazuje publiczne usługi mapowe (WMS, WMTS, ArcGIS REST, kafle XYZ) na mapie, która szybko się wczytuje i jest prosta dla osób niepracujących z mapami. To jeden niewielki serwer Node: serwuje aplikację i cienkie API. Nie ma bazy danych.

Wszystko, czym różnią się wdrożenia, jest w **katalogu konfiguracji**:

```
config/
  app.yaml          nazwa, języki, wyszukiwarka, moduły, formularz zgłoszeń, skórka, treści
  map.yaml          układ współrzędnych, skale, widok startowy, podkłady i usługi kafli
  layers.yaml       tematy, warstwy nad podkładem, kolejność rysowania
  content/          treści w Markdown dla każdego języka: welcome.pl.md, accessibility.pl.md
  i18n/             zmiany napisów interfejsu albo nowy język
  skins/            własna skórka (kolory)
  seed/             metadane usług na start, przed pierwszą aktualizacją (opcjonalnie)
  brand/            znak aplikacji i logo autora (opcjonalnie)
```

W repozytorium są dwa wdrożenia:

- `config/`: minigeoportal.pl, na usługach Głównego Urzędu Geodezji i Kartografii (GUGiK) w układzie PL-1992 (EPSG:2180), z modułem `gugik`.
- `examples/osm/`: kafle OpenStreetMap w układzie Web Mercator (EPSG:3857), wyszukiwarka Nominatim i jedna warstwa WMS, bez usług GUGiK.

Uruchomienie przykładu:

```bash
CONFIG_DIR=examples/osm npm run dev
```

## Jak konfiguracja trafia do przeglądarki

1. Serwer czyta katalog konfiguracji przy starcie. Jeśli coś jest nie tak, zatrzymuje się i wypisuje każdy problem z plikiem, wierszem i kolumną.
2. Konfigurację, z tekstami już w języku odwiedzającego, umieszcza w samej stronie. Aplikacja startuje bez dodatkowego zapytania.
3. Zmiana konfiguracji działa po ponownym uruchomieniu serwera. W trybie deweloperskim serwer restartuje się sam po zmianach w `config/`; przy innym `CONFIG_DIR` trzeba go uruchomić ręcznie.

Do przeglądarki trafiają tylko pola potrzebne aplikacji. W `app.yaml`, `map.yaml` i `layers.yaml` nie wolno zapisać niczego tajnego: klucz wyglądający na hasło, token albo klucz API jest odrzucany. Sekrety (np. hasło do serwera poczty) należą do zmiennych środowiskowych.

## Dalej

- [Pierwsze wdrożenie](pierwsze-wdrozenie.md): od kopii przykładu do działającej mapy, krok po kroku.
- [Konfiguracja](konfiguracja.md): wszystkie pola `app.yaml`, `map.yaml` i `layers.yaml`.
- [Treści i języki](tresci-i-jezyki.md): strony w Markdown, napisy interfejsu, nowy język.
- [Skórki](skorki.md): kolory interfejsu.
- [Wyszukiwarka i moduły](wyszukiwarka-i-moduly.md): GUGiK, Nominatim albo same współrzędne; moduł `gugik` z wysokościami terenu.
- [Warstwy zmienne w czasie](warstwy-czasowe.md): blok `time` warstwy i podróż w czasie.
- [Wdrożenie](wdrozenie.md): Docker, Caddy, nginx, serwer bez Dockera, zmienne środowiskowe, polecenia.
- [Architektura](architektura.md): budowa, dane, bezpieczeństwo, jakość.
