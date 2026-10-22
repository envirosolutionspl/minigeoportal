# Wyszukiwarka i moduły

## Pole wyszukiwania

`app.yaml` wybiera jednego dostawcę wyszukiwania:

```yaml
search:
  provider: gugik # gugik, nominatim albo none
  parcel: true
```

- **`gugik`**: adresy, miejscowości, jednostki administracyjne, rzeki, jeziora i szczyty oraz działki z usług Głównego Urzędu Geodezji i Kartografii. Wyniki pojawiają się podczas pisania; wybrany adres jest obrysowywany razem z budynkiem, miejscowość z granicą. Wymaga modułu `gugik`.
- **`nominatim`**: miejsca i adresy z OpenStreetMap. Serwer pyta Nominatim w imieniu wszystkich, zgodnie z [zasadami korzystania](https://operations.osmfoundation.org/policies/nominatim/): najwyżej jedno zapytanie na sekundę dla całego serwisu, aplikacja przedstawiona w User-Agent, odpowiedzi zapamiętywane (to samo wyszukiwanie za drugim razem nic nie kosztuje). Dlatego szuka po naciśnięciu Enter, a nie podczas pisania. Zbyt długa kolejka odpowiada „spróbuj za chwilę”. Przy dużym ruchu warto mieć własny serwer Nominatim i ustawić `search.nominatim.url`. `countryCodes` ogranicza wyniki do wybranych krajów, `viewbox` stawia na początku wyniki z danego obszaru.
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
    ortho: true # data i rozdzielczość zdjęcia lotniczego w klikniętym miejscu
    parcelReport: true # link do raportu o działce w geoportal.gov.pl
```

Działa tylko w PL-1992: konfiguracja jest odrzucana, gdy moduł jest włączony przy innym `projection.code`.

- **catalog**: serwer czyta konfigurację geoportal.gov.pl (listę warstw i grupy), sprawdza każdą usługę i zapisuje wynik na dysku; lista warstw pokazuje je według tematów, a warstwy, których nie da się tu pokazać, są na liście wyszarzone z wyjaśnieniem. `npm run update` odświeża katalog (minuta lub dwie).
- **drawOrder**: skonfigurowane warstwy z `catalogId` są rysowane w kolejności geoportal.gov.pl; gdy nie da się jej odczytać, obowiązuje `layers.drawOrder`.
- **ortho**: data zdjęcia pod ortofotomapą i link do pobrania arkusza.
- **parcelReport**: link w panelu informacji o miejscu do raportu o działce w geoportal.gov.pl.

Wyszukiwarka GUGiK (`search.provider: gugik`) i wyszukiwarka działek (`search.parcel`) też wymagają modułu. Bez niego serwer nie ma jego tras, a strona nie łączy się bezpośrednio z żadnym serwerem GUGiK.
