# Wyszukiwarka i moduły

## Pole wyszukiwania

`app.yaml` wybiera jednego dostawcę wyszukiwania:

```yaml
search:
  provider: gugik # gugik, nominatim albo none
  parcel: true
```

- **`gugik`**: adresy, miejscowości, jednostki administracyjne, rzeki, jeziora i szczyty oraz działki z usług Głównego Urzędu Geodezji i Kartografii. Wyniki pojawiają się podczas pisania; wybrany adres jest obrysowywany razem z budynkiem, miejscowość z granicą. Wymaga modułu `gugik`.
- **`nominatim`**: miejsca i adresy z OpenStreetMap. Serwer pyta Nominatim w imieniu wszystkich, zgodnie z [zasadami korzystania](https://operations.osmfoundation.org/policies/nominatim/): najwyżej jedno zapytanie na sekundę dla całego serwisu, aplikacja przedstawiona w User-Agent, odpowiedzi zapamiętywane (to samo wyszukiwanie za drugim razem nic nie kosztuje). Dlatego szuka po naciśnięciu Enter, a nie podczas pisania. Przy zbyt długiej kolejce serwer odpowiada 503, a lista wyników zostaje pusta. Przy dużym ruchu warto mieć własny serwer Nominatim i ustawić `search.nominatim.url`. `countryCodes` ogranicza wyniki do wybranych krajów, `viewbox` stawia na początku wyniki z danego obszaru.
- **`none`**: bez usługi wyszukiwania.

Przy każdym dostawcy pole rozumie współrzędne: szerokość i długość geograficzną (`52.2318, 21.0067` albo `52,2318 21,0067`) albo punkt w układzie mapy zapisany tak, jak zapisują go jego użytkownicy (w PL-1992 najpierw X, czyli northing: `486980 637000`).

`parcel: true` dodaje wyszukiwarkę działek według województwa, powiatu, gminy, obrębu i numeru (moduł gugik).

## Moduł gugik

Integracja z geoportal.gov.pl to moduł, który wdrożenie włącza:

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
```

Działa tylko w PL-1992: konfiguracja jest odrzucana, gdy moduł jest włączony przy innym `projection.code`.

- **catalog**: serwer czyta konfigurację geoportal.gov.pl (listę warstw i grupy), sprawdza każdą usługę (po sześć naraz) i zapisuje wynik na dysku (`<DATA_DIR>/gugik/catalog.json`); lista warstw pokazuje je według tematów, a warstwy, których nie da się tu pokazać, są na liście wyszarzone z wyjaśnieniem. Pojedynczy serwer sam odświeża katalog raz na dobę, `npm run update` od razu (minuta lub dwie); każdy serwer czyta nowy plik w ciągu minuty. Za zmianami w geoportal.gov.pl nadąża tylko katalog; warstwy z `layers.yaml` zostają takie, jak w konfiguracji (zob. [Architektura](architektura.md#dane-i-odświeżanie)). Pojedynczy serwer buduje go w tle przy pierwszym starcie, a do tego czasu `/api/catalog` odpowiada 503 i lista pokazuje tylko warstwy z `layers.yaml`; repliki z `SHARED_DATA=1` czekają na proces aktualizujący. Katalog przydziela warstwy do tematów o identyfikatorach `dzialki`, `planowanie`, `ceny`, `uzbrojenie`, `granice`, `teren`, `srodowisko`, `zagrozenia`, `zabytki`, `archiwalne`, `pobieranie`, `geodezja` i `inne`, więc `layers.yaml` musi je zdefiniować w `topics` (sprawdzenie konfiguracji wymienia brakujące).
- **drawOrder**: skonfigurowane warstwy z `catalogId` są rysowane w kolejności geoportal.gov.pl; gdy nie da się jej odczytać, obowiązuje `layers.drawOrder`.
- **ortho**: data zdjęcia pod ortofotomapą i link do pobrania arkusza. `service` to usługa kafli z `map.yaml`, która pokazuje zdjęcia: data pojawia się, gdy na ekranie jest rysowany przez nią podkład (domyślnie `orto`; `false` wyłącza tę część). `history` to warstwa z `layers.yaml` pokazująca archiwum tych zdjęć (blok `time`): gdy `map.yaml` wskazuje ją w `timeTravel`, podróż w czasie oferuje tylko daty, z których skorowidz zna zdjęcia w środku mapy, a panel miejsca liczy zdjęcia z archiwum i prowadzi do podróży.
- **topo**: `history` to warstwa z `layers.yaml` (seria edycji) ze skanami dawnych map topograficznych. Gdy `map.yaml` wskazuje ją w `timeTravel`, podróż w czasie pyta skorowidz map topograficznych o arkusze w środku mapy i oferuje ich lata (pole „aktualność kartograficzna”: rok, na który aktualna jest treść mapy, a nie data skanu ani nazwa układu), a każdy rok rysuje własne arkusze. Bez tej części suwak ma edycje serii z `layers.yaml` (układy współrzędnych, które nie są datami). `false` wyłącza tę część.
- **parcelReport**: link w panelu informacji o miejscu do raportu o działce w geoportal.gov.pl.
- **elevation**: wysokość terenu z numerycznego modelu terenu GUGiK (NMT, siatka 1 m, usługa `services.gugik.gov.pl/nmt`), o którą przeglądarka pyta bezpośrednio. Panel miejsca podaje wysokość klikniętego punktu pod współrzędnymi, a narzędzie „Profil terenu” (na komputerze przycisk pod pomiarem, na telefonie pozycja w „Więcej”) rysuje linię na mapie tak jak pomiar odległości i pokazuje wykres wysokości wzdłuż niej (do 101 punktów, nie gęściej niż co metr) i podsumowanie (zakres wysokości, największe nachylenie między sąsiednimi punktami i średnie nachylenie wzdłuż linii). Punkty kliknięte przy rysowaniu, w których linia się załamuje, wykres zaznacza przerywaną linią z wysokością nad wykresem i odległością od początku pod nim. Nowa linia zastępuje poprzednią, a zamknięcie narzędzia usuwa ją z mapy. Tam, gdzie model nie ma danych (za granicą, na morzu), wiersza nie ma, a profil pomija takie punkty.

Wyszukiwarka GUGiK (`search.provider: gugik`) i wyszukiwarka działek (`search.parcel`) też wymagają modułu. Bez niego serwer nie ma jego tras, a strona nie łączy się bezpośrednio z żadnym serwerem GUGiK.

Moduł ma własne katalogi: `src/modules/gugik/` (strona aplikacji, z napisami) i `server/modules/gugik/` (trasy, pamięć podręczna, reguły konfiguracji). Reszta aplikacji sięga do niego tylko przez dwa rejestry, `src/modules/index.ts` i `server/modules/index.ts`. Części modułu w aplikacji (wyszukiwarka, wyszukiwanie działki, części panelu miejsca) to osobne pliki, które przeglądarka pobiera tylko przy włączonym module, więc wdrożenie bez niego nigdy nie wczytuje jego kodu.

### Napisy modułu

Moduł ma swoje napisy w `src/modules/gugik/i18n/pl.yaml` i `en.yaml`, dodawane do napisów aplikacji tylko przy włączonym module: `search.gugik.*` i `search.parcel*` (wyszukiwarka GUGiK i przycisk działki), `parcel.*` (wyszukiwanie działki), `layers.catalog*` (wczytywanie listy geoportal.gov.pl), `info.parcelReport*` (link do raportu o działce), `info.height` (wysokość terenu) oraz `info.photo*`, `info.pixel`, `info.downloadSheet` (data zdjęcia lotniczego). Wdrożenie zmienia je w swoim `i18n/<język>.yaml` jak każdy inny napis, a nowy język tłumaczy je tam (zob. [Treści i języki](tresci-i-jezyki.md#dodawanie-języka-krok-po-kroku)).

Napisy samej aplikacji nie wymieniają żadnej usługi GUGiK; domyślna konfiguracja formułuje część z nich pod swoje dane w `config/i18n/` (`layers.searchPlaceholder`, `layers.why.token`, `layers.why.refused`, `info.noLayers`, `report.intro`).
