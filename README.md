# MiniGeoportal

[![Testy i obraz](https://github.com/envirosolutionspl/minigeoportal/actions/workflows/image.yml/badge.svg?branch=main)](https://github.com/envirosolutionspl/minigeoportal/actions/workflows/image.yml)
[![Obraz Dockera](https://img.shields.io/badge/ghcr.io-minigeoportal-2496ED?logo=docker&logoColor=white)](https://github.com/envirosolutionspl/minigeoportal/pkgs/container/minigeoportal)
[![minigeoportal.pl](https://img.shields.io/website?url=https%3A%2F%2Fminigeoportal.pl&label=minigeoportal.pl)](https://minigeoportal.pl)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A522.18-5FA04E?logo=nodedotjs&logoColor=white)](package.json)
[![Licencja MIT](https://img.shields.io/github/license/envirosolutionspl/minigeoportal)](LICENSE)

**Działki, plany miejscowe i ortofotomapa na prostej, szybkiej mapie.** MiniGeoportal pokazuje publiczne dane z geoportal.gov.pl osobom, które nie pracują z mapami zawodowo, na komputerze i na telefonie. Działa na [minigeoportal.pl](https://minigeoportal.pl).

_A simple, fast web map for public map services. Documentation in English: [docs/en](docs/en/README.md)._

![Wyszukanie adresu, informacje o działce, menu kontekstowe, wyszukiwarka działek, lista warstw, profil terenu i podróż w czasie](docs/img/prezentacja.gif)

## Co potrafi

- **Wyszukiwarka** adresów, miejscowości i obiektów. Działkę znajdzie po numerze i obrębie, punkt po współrzędnych.
- **Informacje o miejscu** po kliknięciu w mapę: działka, przeznaczenie w planie miejscowym, wysokość terenu i dane innych włączonych warstw. Link prowadzi do **raportu o działce** na geoportal.gov.pl.
- **Ponad 400 warstw** geoportal.gov.pl w jednej liście, z wyszukiwarką, tematami i przezroczystością. Gdy warstwy nie da się pokazać albo długo się wczytuje, lista mówi dlaczego.
- **Menu kontekstowe** (prawy przycisk myszy albo przytrzymanie palca): współrzędne w PL-1992 i WGS 84 oraz dojazd w Google Maps.
- **Profil terenu**: narysuj linię, a zobaczysz wykres wysokości wzdłuż niej, z najwyższym punktem i nachyleniem (dane NMT GUGiK).
- **Selekcja działek**: kliknij działki na mapie albo dodaj je z wyszukiwarki, a zobaczysz ich listę i łączną powierzchnię. Selekcję wyślesz linkiem albo pobierzesz jako GeoJSON, KML lub CSV.
- **Pomiar** odległości i powierzchni, **wydruk** w skali na A4 lub A3 (także do PDF) i **link** do bieżącego widoku.
- **Podróż w czasie**: archiwalne zdjęcia lotnicze od 1995 r. i dawne mapy topograficzne. Suwak pokazuje tylko lata, z których są dane w oglądanym miejscu. Kurtyna porównuje wybrany rok z dniem dzisiejszym. Widok z datą można wysłać linkiem albo wydrukować.
- **Telefon**: panele na cały ekran, przytrzymanie palca zamiast prawego przycisku, „Moja lokalizacja”.
- **Dostępność** WCAG 2.1 AA (wyjątki opisuje deklaracja dostępności): klawiatura, czytniki ekranu, tryb ciemny, większy tekst, wysoki kontrast. Interfejs po polsku i angielsku.

## Zrzuty ekranu

|                                         | Komputer                                                            | Telefon                                                            |
| --------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Wyszukiwarka adresów                    | <img src="docs/img/komputer-wyszukiwarka-adresow.webp" width="520"> | <img src="docs/img/telefon-wyszukiwarka-adresow.webp" width="180"> |
| Wyszukiwarka działek                    | <img src="docs/img/komputer-wyszukiwarka-dzialek.webp" width="520"> | <img src="docs/img/telefon-wyszukiwarka-dzialek.webp" width="180"> |
| Znaleziona działka                      | <img src="docs/img/komputer-znaleziona-dzialka.webp" width="520">   | <img src="docs/img/telefon-znaleziona-dzialka.webp" width="180">   |
| Informacje o miejscu, raport o działce  | <img src="docs/img/komputer-raport-o-dzialce.webp" width="520">     | <img src="docs/img/telefon-raport-o-dzialce.webp" width="180">     |
| Menu kontekstowe                        | <img src="docs/img/komputer-menu-kontekstowe.webp" width="520">     | <img src="docs/img/telefon-menu-kontekstowe.webp" width="180">     |
| Lista warstw                            | <img src="docs/img/komputer-warstwy.webp" width="520">              | <img src="docs/img/telefon-warstwy.webp" width="180">              |
| Profil terenu: z Zakopanego na Kasprowy | <img src="docs/img/komputer-profil-terenu.webp" width="520">        | <img src="docs/img/telefon-profil-terenu.webp" width="180">        |
| Podróż w czasie: 2007 i dziś            | <img src="docs/img/komputer-podroz-w-czasie.webp" width="520">      | <img src="docs/img/telefon-podroz-w-czasie.webp" width="180">      |

Link „Raport o działce” (obwiedziony na zrzutach) otwiera raport geoportal.gov.pl dla klikniętej działki, z wydrukiem i zapisem do PDF:

<img src="docs/img/komputer-raport-geoportal.webp" width="640" alt="Raport o działce na geoportal.gov.pl">

## Własna mapa

Aplikacja nie jest przywiązana do GUGiK. Pokaże dowolne usługi mapowe (WMS, WMTS, ArcGIS REST, kafle XYZ) w dowolnym układzie współrzędnych. Własna mapa to katalog plików YAML i Markdown, bez zmian w kodzie. W repozytorium są dwa przykłady:

- `config/`: [minigeoportal.pl](https://minigeoportal.pl), usługi GUGiK w układzie PL-1992 z modułem `gugik` (działki, plany, ceny, uzbrojenie, ortofotomapa, wysokości terenu, katalog warstw geoportalu).
- `examples/osm/`: OpenStreetMap, wyszukiwarka Nominatim i jedna warstwa WMS, bez usług GUGiK. Dobry punkt wyjścia.

## Szybki start

Wymaga Node.js 22.18 lub nowszego.

```bash
git clone https://github.com/envirosolutionspl/minigeoportal.git
cd minigeoportal
npm install
npm run dev                            # wdrożenie z config/, aplikacja na porcie 5173
CONFIG_DIR=examples/osm npm run dev    # inne wdrożenie
```

Na serwer: gotowy obraz Dockera `ghcr.io/envirosolutionspl/minigeoportal`, z Caddy albo za istniejącym nginx. Opis w [Wdrożeniu](docs/pl/wdrozenie.md).

## Dokumentacja

| Polski                                                    | English                                                |
| --------------------------------------------------------- | ------------------------------------------------------ |
| [Przegląd](docs/pl/README.md)                             | [Overview](docs/en/README.md)                          |
| [Pierwsze wdrożenie](docs/pl/pierwsze-wdrozenie.md)       | [First deployment](docs/en/first-deployment.md)        |
| [Konfiguracja](docs/pl/konfiguracja.md)                   | [Configuration](docs/en/configuration.md)              |
| [Treści i języki](docs/pl/tresci-i-jezyki.md)             | [Texts and languages](docs/en/texts-and-languages.md)  |
| [Skórki](docs/pl/skorki.md)                               | [Skins](docs/en/skins.md)                              |
| [Wyszukiwarka i moduły](docs/pl/wyszukiwarka-i-moduly.md) | [Search and modules](docs/en/search-and-modules.md)    |
| [Warstwy zmienne w czasie](docs/pl/warstwy-czasowe.md)    | [Layers that change over time](docs/en/time-layers.md) |
| [Wdrożenie](docs/pl/wdrozenie.md)                         | [Deployment](docs/en/deployment.md)                    |
| [Architektura](docs/pl/architektura.md)                   | [Architecture](docs/en/architecture.md)                |

## Licencja i dane

Projekt open source na licencji MIT, tworzony przez [EnviroSolutions](https://envirosolutions.pl). Aplikacja pobiera dane na bieżąco z usług wskazanych w konfiguracji i ich nie przechowuje. Za dane odpowiadają ich wydawcy; informacje mają charakter poglądowy.
