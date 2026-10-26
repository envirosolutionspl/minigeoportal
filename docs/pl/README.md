# MiniGeoportal: przegląd

MiniGeoportal pokazuje publiczne usługi mapowe (WMS, WMTS, ArcGIS REST, kafle XYZ) na mapie, która szybko się wczytuje i jest prosta w obsłudze dla osób niepracujących z mapami na co dzień. Działa jako jeden niewielki serwer Node, który serwuje aplikację i cienkie API; nie ma bazy danych.

Wszystko, co wyróżnia dane wdrożenie, jest w **katalogu konfiguracji**:

```
config/
  app.yaml          nazwa, języki, wyszukiwarka, moduły, formularz zgłoszeń, skórka, treści
  map.yaml          układ współrzędnych, skale, widok startowy, podkłady i usługi kafli
  layers.yaml       tematy, warstwy nad podkładem, kolejność rysowania
  content/          treści w Markdown dla każdego języka: welcome.pl.md, accessibility.pl.md
  i18n/             zmiany napisów interfejsu albo nowy język
  skins/            własna skórka (kolory)
  seed/             metadane usług na start, przed pierwszą aktualizacją (opcjonalnie)
  brand/            znak aplikacji i logo autora, wskazywane przez icon i author.logo (opcjonalnie)
```

Repozytorium zawiera dwa wdrożenia:

- `config/`: MiniGeoportal (minigeoportal.pl), na usługach Głównego Urzędu Geodezji i Kartografii (GUGiK) w układzie PL-1992 (EPSG:2180), z modułem `gugik`.
- `examples/osm/`: kafle OpenStreetMap w układzie Web Mercator (EPSG:3857), wyszukiwarka Nominatim i jedna warstwa WMS, bez żadnej usługi GUGiK.

Uruchomienie przykładu:

```bash
CONFIG_DIR=examples/osm npm run dev
```

## Jak wdrożenie trafia do przeglądarki

Serwer czyta katalog konfiguracji przy starcie i zatrzymuje się z listą wszystkich znalezionych problemów, każdy z plikiem, wierszem i kolumną. Potem umieszcza konfigurację, z tekstami już w języku odwiedzającego, w samej stronie, więc aplikacja startuje bez czekania na kolejne zapytanie. Zmiana konfiguracji działa po ponownym uruchomieniu serwera (w trybie deweloperskim serwer restartuje się sam po zmianach w `config/`; przy innym `CONFIG_DIR` trzeba go uruchomić ponownie).

Do przeglądarki trafiają tylko pola potrzebne aplikacji, a w `app.yaml`, `map.yaml` i `layers.yaml` nie wolno zapisać niczego tajnego: klucz wyglądający na hasło, token albo klucz API jest odrzucany. Sekrety (hasło do serwera poczty) należą do zmiennych środowiskowych.

## Dalej

- [Pierwsze wdrożenie](pierwsze-wdrozenie.md): od kopii przykładu do działającej mapy, krok po kroku.
- [Konfiguracja](konfiguracja.md): wszystkie pola `app.yaml`, `map.yaml` i `layers.yaml`.
- [Treści i języki](tresci-i-jezyki.md): strony w Markdown, napisy interfejsu, dodawanie języka.
- [Skórki](skorki.md): kolory interfejsu.
- [Wyszukiwarka i moduły](wyszukiwarka-i-moduly.md): GUGiK, Nominatim albo same współrzędne; moduł `gugik`.
- [Warstwy zmienne w czasie](warstwy-czasowe.md): blok `time` warstwy i podróż w czasie (`timeTravel` w `map.yaml`).
- [Wdrożenie](wdrozenie.md): Docker, Caddy, nginx, serwer bez Dockera, zmienne środowiskowe, ścieżki, polecenia.
- [Architektura](architektura.md): budowa, bezpieczeństwo, jakość.
