# Wyszukiwarka i moduły

## Pole wyszukiwania

`app.yaml` wybiera jednego dostawcę wyszukiwania:

```yaml
search:
  provider: gugik # gugik, nominatim albo none
  parcel: true
```

- **`gugik`**: adresy, miejscowości, jednostki administracyjne, rzeki, jeziora, szczyty i działki z usług Głównego Urzędu Geodezji i Kartografii. Wyniki pojawiają się podczas pisania. Wybrany adres jest obrysowany razem z budynkiem, miejscowość z granicą. Wymaga modułu `gugik`.
- **`nominatim`**: miejsca i adresy z OpenStreetMap. Szuka po naciśnięciu Enter, nie podczas pisania, bo serwer musi przestrzegać [zasad Nominatim](https://operations.osmfoundation.org/policies/nominatim/):
  - najwyżej jedno zapytanie na sekundę dla całego serwisu;
  - aplikacja przedstawia się w User-Agent;
  - odpowiedzi są zapamiętywane, więc to samo wyszukiwanie drugi raz nic nie kosztuje;
  - przy zbyt długiej kolejce serwer odpowiada 503, a lista wyników zostaje pusta.

  Przy dużym ruchu postaw własny serwer Nominatim i ustaw `search.nominatim.url`. `countryCodes` ogranicza wyniki do wybranych krajów, `viewbox` stawia na początku wyniki z danego obszaru.

- **`none`**: bez usługi wyszukiwania.

Przy każdym dostawcy pole rozumie współrzędne:

- szerokość i długość geograficzną: `52.2318, 21.0067` albo `52,2318 21,0067`;
- punkt w układzie mapy, zapisany tak, jak zapisują go jego użytkownicy (w PL-1992 najpierw X, czyli northing: `486980 637000`).

`parcel: true` dodaje wyszukiwarkę działek według województwa, powiatu, gminy, obrębu i numeru (moduł gugik) oraz **selekcję działek**: narzędzie „Selekcja działek” (na komputerze przycisk w kolumnie narzędzi, na telefonie pozycja w „Więcej”). Działki dodaje się na dwa sposoby:

- **kliknięciem na mapie**: przy otwartym narzędziu kursor nad mapą zmienia się w krzyżyk, kliknięcie działki dodaje ją do listy, a kliknięcie działki już zaznaczonej usuwa ją; z klawiatury to samo robi Enter w środku mapy;
- **z wyszukiwarki**: po znalezieniu działki (w polu wyszukiwania po numerze lub identyfikatorze albo w wyszukiwarce działek według obrębu) przycisk „Dodaj do selekcji” dodaje ją i otwiera listę.

Panel wymienia działki w kolejności dodania, z numerami takimi jak na mapie, identyfikatorem, obrębem i powierzchnią, oraz ich sumę. Powierzchnia jest liczona z geometrii działki w ULDK na elipsoidzie GRS80, więc jest przybliżona i nie odpowiada powierzchni ewidencyjnej; panel to mówi. Każda działka jest w selekcji raz, a selekcja ma najwyżej 10 działek, bo każda to zapytanie do ULDK. Link do widoku niesie ją w parametrze `dz` (identyfikatory po przecinku, np. `dz=141201_1.0001.1867/2,141201_1.0001.1868`); działka, której ULDK nie zna, zostaje na liście z taką informacją. Selekcję można pobrać jako GeoJSON (WGS 84), KML albo CSV (średniki, przecinek dziesiętny, obrys jako WKT w układzie mapy).

Znaleziona działka (albo budynek) i działki selekcji mają od skali 1:2500 długości boków na mapie, wzdłuż każdego boku; etykieta, która nie mieści się na krótkim boku, jest pomijana. Długości są liczone na elipsoidzie GRS80 z geometrii ULDK, z dokładnością do decymetra, więc są przybliżone tak jak powierzchnia. Obrys o ponad 200 wierzchołkach (gmina, las) nie dostaje etykiet. Podpowiedź po najechaniu myszą na działkę selekcji podaje też jej obwód.

## Moduł gugik

Integracja z geoportal.gov.pl to moduł, który wdrożenie włącza w `app.yaml`:

```yaml
modules:
  gugik:
    enabled: true
    catalog: true # wszystkie warstwy geoportal.gov.pl na liście warstw
    drawOrder: true # kolejność rysowania z geoportal.gov.pl dla skonfigurowanych warstw
    ortho: { service: orto, history: orto-archiwalna } # data zdjęcia w klikniętym miejscu i archiwum zdjęć
    topo: { history: mapy-dawne } # lata arkuszy map topograficznych w podróży w czasie
    parcelReport: true # link do raportu o działce w geoportal.gov.pl
    elevation: true # wysokość terenu w panelu miejsca i narzędzie „Profil terenu”
    address: true # najbliższy adres w panelu miejsca
```

Moduł działa tylko w układzie PL-1992. Przy innym `projection.code` konfiguracja z włączonym modułem jest odrzucana.

### catalog: wszystkie warstwy geoportalu

Lista warstw pokazuje wszystkie warstwy geoportal.gov.pl według tematów. Te, których nie da się tu pokazać, są wyszarzone z wyjaśnieniem.

- Serwer czyta konfigurację geoportal.gov.pl, sprawdza każdą usługę (po sześć naraz) i zapisuje wynik w `<DATA_DIR>/gugik/catalog.json`.
- Pojedynczy serwer odświeża katalog sam raz na dobę; `npm run update` robi to od razu (minuta lub dwie). Każdy serwer czyta nowy plik w ciągu minuty.
- Przy pierwszym starcie pojedynczy serwer buduje katalog w tle. Do tego czasu `/api/catalog` odpowiada 503, a lista pokazuje tylko warstwy z `layers.yaml`. Repliki z `SHARED_DATA=1` czekają na proces aktualizujący.
- Za zmianami w geoportal.gov.pl nadąża tylko katalog. Warstwy z `layers.yaml` zostają takie, jak w konfiguracji (zob. [Architektura](architektura.md#dane-i-odświeżanie)).
- Katalog przydziela warstwy do tematów `dzialki`, `planowanie`, `ceny`, `uzbrojenie`, `granice`, `teren`, `srodowisko`, `zagrozenia`, `zabytki`, `archiwalne`, `pobieranie`, `geodezja` i `inne`. `layers.yaml` musi je zdefiniować w `topics`; sprawdzenie konfiguracji wymieni brakujące.

### drawOrder: kolejność rysowania

Skonfigurowane warstwy z `catalogId` są rysowane w kolejności geoportal.gov.pl. Gdy nie da się jej odczytać, obowiązuje `layers.drawOrder`.

### ortho: data zdjęcia i archiwum zdjęć

- `service` to usługa kafli z `map.yaml`, która pokazuje zdjęcia lotnicze (domyślnie `orto`). Gdy rysowany przez nią podkład jest na ekranie, panel miejsca podaje datę zdjęcia i link do pobrania arkusza. `false` wyłącza tę część.
- `history` to warstwa z `layers.yaml` z archiwum tych zdjęć (z blokiem `time`). Gdy `map.yaml` wskazuje ją w `timeTravel`, suwak podróży w czasie ma tylko daty zdjęć, które skorowidz zna w środku mapy. Panel miejsca liczy wtedy zdjęcia z archiwum i prowadzi do podróży.

### topo: dawne mapy topograficzne

`history` to warstwa z `layers.yaml` (seria edycji) ze skanami dawnych map topograficznych. Gdy `map.yaml` wskazuje ją w `timeTravel`, podróż w czasie pyta skorowidz map o arkusze w środku mapy i pokazuje ich lata. Rok to „aktualność kartograficzna” arkusza: rok, na który aktualna jest treść mapy, a nie data skanu ani nazwa układu. Każdy rok rysuje własne arkusze.

Bez tej części suwak ma edycje serii z `layers.yaml` (nazwy układów współrzędnych, nie lata). `false` wyłącza tę część.

### parcelReport: raport o działce

Link w panelu miejsca do raportu o działce w geoportal.gov.pl.

### elevation: wysokość terenu i profil terenu

Wysokości pochodzą z numerycznego modelu terenu GUGiK (NMT, siatka 1 m, usługa `services.gugik.gov.pl/nmt`). Przeglądarka pyta o nie bezpośrednio.

- **Panel miejsca** podaje wysokość klikniętego punktu.
- **Profil terenu** to osobne narzędzie: na komputerze przycisk pod pomiarem, na telefonie pozycja w „Więcej”. Rysuje się linię na mapie tak jak przy pomiarze odległości, a panel pokazuje:
  - wykres wysokości wzdłuż linii (do 101 punktów, nie gęściej niż co metr);
  - punkty załamania linii, zaznaczone przerywaną linią, z wysokością nad wykresem i odległością od początku pod nim;
  - podsumowanie: zakres wysokości, największe nachylenie między sąsiednimi punktami i średnie nachylenie.

  Nowa linia zastępuje poprzednią, a zamknięcie narzędzia usuwa ją z mapy.

- Tam, gdzie model nie ma danych (za granicą, na morzu), panel miejsca nie ma wiersza wysokości, a profil pomija takie punkty.

### address: najbliższy adres

Panel miejsca podaje adres najbliższy klikniętemu punktowi, z kodem pocztowym, z państwowego rejestru adresów (geokoder GUGiK, usługa `services.gugik.gov.pl/uug`). Przeglądarka pyta o niego bezpośrednio.

- Punkt bliżej niż 10 m od adresu to „Adres: …”; dalej „Najbliższy adres: … (ok. 35 m)”, odległość zaokrąglona do 5 m.
- Geokoder szuka w promieniu 100 m. Dalej (pole, las) panel nie ma wiersza adresu.

### Co jeszcze zależy od modułu

Wyszukiwarka GUGiK (`search.provider: gugik`) i wyszukiwarka działek (`search.parcel`) też wymagają modułu. Bez niego serwer nie ma jego tras, a strona nie łączy się z żadnym serwerem GUGiK.

Moduł ma własne katalogi: `src/modules/gugik/` (część w przeglądarce, z napisami) i `server/modules/gugik/` (trasy, pamięć podręczna, reguły konfiguracji). Reszta aplikacji sięga do niego tylko przez dwa rejestry: `src/modules/index.ts` i `server/modules/index.ts`. Części modułu w przeglądarce (wyszukiwarka, wyszukiwanie działki, części panelu miejsca) to osobne pliki, pobierane tylko przy włączonym module. Wdrożenie bez modułu nigdy nie wczytuje jego kodu.

### Napisy modułu

Moduł ma swoje napisy w `src/modules/gugik/i18n/pl.yaml` i `en.yaml`. Są dodawane do napisów aplikacji tylko przy włączonym module:

- `search.gugik.*` i `search.parcel*`: wyszukiwarka GUGiK i przycisk działki;
- `parcel.*`: wyszukiwanie działki;
- `layers.catalog*`: wczytywanie listy geoportal.gov.pl;
- `info.parcelReport*`: link do raportu o działce;
- `info.height`: wysokość terenu;
- `info.address`, `info.addressNear`: najbliższy adres;
- `info.photo*`, `info.pixel`, `info.downloadSheet`: data zdjęcia lotniczego.

Wdrożenie zmienia je w swoim `i18n/<język>.yaml` jak każdy inny napis, a nowy język tłumaczy je tam (zob. [Treści i języki](tresci-i-jezyki.md#dodawanie-języka-krok-po-kroku)).

Napisy samej aplikacji nie wymieniają żadnej usługi GUGiK. Domyślna konfiguracja dopasowuje część z nich do swoich danych w `config/i18n/` (`layers.searchPlaceholder`, `layers.why.token`, `layers.why.refused`, `info.noLayers`, `report.intro`).
