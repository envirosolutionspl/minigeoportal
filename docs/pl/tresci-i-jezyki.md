# Treści i języki

## Treści wdrożenia w Markdown

Okno powitalne i deklaracja dostępności to pliki Markdown w katalogu konfiguracji, po jednym dla każdego języka. `app.yaml` wskazuje je bez kodu języka:

```yaml
content:
  welcome: content/welcome # content/welcome.pl.md, content/welcome.en.md
  accessibility: content/accessibility
```

Plik języka domyślnego musi istnieć. Język bez własnego pliku pokazuje plik domyślny. Serwer zamienia Markdown na HTML przy starcie:

- nagłówki, akapity, listy, wyróżnienia i cytaty działają jak zwykle; cytat jest rysowany jako wyróżniona ramka (ramka „Ważne” w domyślnym powitaniu);
- HTML wpisany w Markdown jest pokazywany jako tekst, nigdy nie jest wykonywany;
- obrazy nie są pokazywane;
- linki mogą prowadzić do adresów www (otwierają się w nowej karcie), e-mail (`mailto:`) i stron samego serwisu (`/pomoc`, `/?l=kieg,kimpzp`: mapa z włączonymi warstwami); inne linki stają się zwykłym tekstem. Specjalne linki otwierają części aplikacji, np. `[formularz zgłoszeń](app:report)`:

| Link                | Otwiera                               |
| ------------------- | ------------------------------------- |
| `app:report`        | formularz zgłoszeń                    |
| `app:accessibility` | deklarację dostępności                |
| `app:welcome`       | okno powitalne                        |
| `app:time`          | podróż w czasie (gdy wdrożenie ją ma) |

### Poradniki

Poradniki to osobne strony z odpowiedziami na pytania, które ludzie wpisują w wyszukiwarkę („jak sprawdzić, czy działka jest budowlana”). Serwer składa je z Markdown w zwykłe strony HTML, które wyszukiwarki czytają bez uruchamiania aplikacji:

```yaml
guides:
  path: { pl: pomoc, en: help } # adres listy: /pomoc, /en/help
  pages: # content/guides/<strona>.<język>.md, adres /pomoc/<strona>
    - czy-dzialka-jest-budowlana
    - teren-zalewowy
```

- Strona jest w tych językach, dla których ma plik; wystarczy jeden. Brak pliku w każdym języku to błąd konfiguracji.
- Tytuł strony to jej pierwszy nagłówek `#`, opis dla wyszukiwarek to pierwszy akapit (do 160 znaków).
- Pod tekstem jest przycisk „Sprawdź na mapie” i lista pozostałych poradników; adres `path` wymienia wszystkie.
- Strony mają kolory skórki i działają bez JavaScriptu. Podgląd w trakcie pracy: `npm run dev:api` i adres serwera API (strony podaje serwer, nie Vite).
- `/sitemap.xml` wymienia strony główne wszystkich języków, listy i poradniki, a `/robots.txt` wskazuje mapę witryny. Oba są także bez poradników.

## Napisy interfejsu

Napisy interfejsu (przyciski, komunikaty, etykiety) są w aplikacji w `i18n/pl.yaml` i `i18n/en.yaml`. Klucze są zagnieżdżone:

```yaml
search:
  coordinates:
    placeholder: Współrzędne, np. 52,2318 21,0067
```

Moduł ma własne napisy w `src/modules/<moduł>/i18n/<język>.yaml`, dodawane tylko wtedy, gdy `app.yaml` go włącza (zob. [Wyszukiwarka i moduły](wyszukiwarka-i-moduly.md#napisy-modułu)).

Wdrożenie zmienia pojedyncze napisy w `i18n/<język>.yaml` swojego katalogu konfiguracji. Wystarczą same zmienione klucze:

```yaml
# config/i18n/pl.yaml
layers:
  popular: Na start
```

Tak samo wdrożenie dopasowuje napisy do swoich danych. Domyślna konfiguracja robi to dla usług GUGiK w `config/i18n/`:

- `info.fields`: czytelne nazwy technicznych pól z odpowiedzi usług (kluczem jest nazwa pola);
- `print.note`: cała stopka wydruku, ze źródłem danych;
- podpowiedź wyszukiwania warstw, powody, dla których warstwy nie da się pokazać, panel miejsca bez warstw, wstęp formularza zgłoszeń.

```yaml
info:
  fields:
    opis_oznac: Przeznaczenie
```

`{nazwa}` w napisie wypełnia aplikacja. Napisy zależne od liczby mają formę dla każdej kategorii liczby mnogiej języka (`one`, `few`, `many`, `other`, jak w `Intl.PluralRules`). Angielski potrzebuje `one` i `other`, polski także `few` i `many`:

```yaml
parcel:
  several:
    one: Znaleziono {count} działkę o tym numerze. Wybierz ją.
    few: Znaleziono {count} działki o tym numerze. Wybierz jedną.
    many: Znaleziono {count} działek o tym numerze. Wybierz jedną.
    other: Znaleziono {count} działki o tym numerze. Wybierz jedną.
```

Liczby i daty są zapisywane tak, jak w danym języku (1 234,5 po polsku, 1,234.5 po angielsku).

## Języki i adresy

Języki wdrożenia ustawia `app.yaml`:

```yaml
locales:
  default: en # dla odwiedzających, których przeglądarka nie prosi o żaden z dostępnych
  available: [pl, en] # kolejność w przełączniku języka
  root: pl # opcjonalnie: język pod samym adresem domeny, bez /pl/
report:
  locale: pl # język maili ze zgłoszeniami do administratora (domyślnie locales.default)
```

Kod języka to dwie lub trzy małe litery, opcjonalnie z regionem: `pl`, `de`, `en-GB`.

Każdy język ma własny adres: `https://twoja-domena/pl/`, `https://twoja-domena/en/`. Widok mapy jest w parametrach (`/pl/?x=…&y=…`), więc link zachowuje i widok, i język.

Wejście na sam adres domeny wybiera język w tej kolejności:

1. język wybrany wcześniej przełącznikiem w menu ułatwień (zapamiętany w ciasteczku `lang`);
2. pierwszy język z preferencji przeglądarki, który aplikacja ma (`de-AT` pasuje do `de`);
3. `locales.default`.

Co dzieje się pod samym adresem domeny:

- **Bez `root`** adres domeny tylko przekierowuje na adres wybranego języka.
- **Z `root: pl`** polski nie ma kodu w adresie i mieszka pod `/`. Odwiedzający wybierający inny język są przekierowani (`/en/`), a `/pl/` prowadzi pod `/`. Zapytanie bez żadnego języka (podgląd linku w komunikatorze, robot wyszukiwarki) dostaje język `root`. Tak działa minigeoportal.pl: `https://minigeoportal.pl/` po polsku, `https://minigeoportal.pl/en/` po angielsku.
- **Jeden język**: wdrożenie działa pod samym adresem domeny, bez kodu i bez przełącznika.

Stare linki z `?lang=en` prowadzą pod `/en/`, a nieznany kod (`/xx/`) tak jak sam adres domeny. Strona podaje wyszukiwarkom wszystkie wersje językowe (`hreflang`).

Język domyślny uzupełnia też tłumaczenia: tekst, napis interfejsu albo plik Markdown, którego brakuje w języku odwiedzającego, pokazuje się w języku domyślnym. Nowy język można więc dodawać stopniowo.

## Dodawanie języka krok po kroku

Przykład: niemiecki (`de`) w katalogu konfiguracji `config/`.

1. **Dopisz język** w `app.yaml`:

   ```yaml
   locales:
     default: en
     available: [pl, en, de]
   ```

2. **Napisy interfejsu.** Skopiuj z aplikacji `i18n/en.yaml` do `config/i18n/de.yaml` i przetłumacz wartości, bez zmiany kluczy.
   - Zachowaj `{nazwa}` w napisach.
   - Napisom zależnym od liczby daj formy, których potrzebuje język (niemiecki: `one` i `other`).
   - Przy włączonym module gugik dopisz do tego samego pliku klucze z `src/modules/gugik/i18n/en.yaml` i też je przetłumacz.
   - Jeśli `config/i18n/en.yaml` wdrożenia ma własne napisy (np. `info.fields`, `print.note`), przetłumacz je w tym samym pliku.

3. **Treści w Markdown.** Dodaj `content/welcome.de.md` i `content/accessibility.de.md` (przetłumacz wersję angielską). Bez nich niemiecka strona pokaże treści w języku domyślnym.

4. **Teksty w plikach YAML.** Wszędzie, gdzie tekst ma wersje językowe, dopisz niemiecką:
   - w `app.yaml`: nazwa, tytuł, opis, `tagline`, kategorie zgłoszeń, `links.fallbackName`;
   - w `map.yaml`: podkłady, `homeLabel`, `attribution`, etykiety warstw podróży w czasie;
   - w `layers.yaml`: tematy, warstwy i podwarstwy.

   ```yaml
   title: { pl: 'Mapa gminy', en: 'Municipal map', de: 'Gemeindekarte' }
   ```

   Nazwa układu współrzędnych (`projection.name`) jest jedna dla wszystkich języków. Słowa kluczowe wyszukiwania warstw mogą mieć osobną listę na język: `keywords: { pl: [działka], de: [Flurstück] }`.

5. **Sprawdź** konfigurację bez uruchamiania serwera:

   ```bash
   npm run config:check config
   ```

   Wynik wymienia języki (`OK (pl, en, de; …)`) albo każdy problem z plikiem, wierszem i kolumną.

6. **Uruchom serwer ponownie**, bo konfiguracja jest czytana przy starcie. W Dockerze: `docker compose up -d --force-recreate app updater`; przy `npm start`: ponowne uruchomienie procesu. W trybie deweloperskim serwer restartuje się sam po zmianach w `config/`.

7. **Zobacz wynik** pod `https://twoja-domena/de/`. Przeglądarki ustawione na niemiecki dostaną go pod samym adresem domeny, a przełącznik w menu ułatwień pokaże „Deutsch”.

Usunięcie języka to usunięcie jego kodu z `locales.available`; pliki mogą zostać. Linki do usuniętego języka (`/de/…`) prowadzą wtedy tak jak sam adres domeny.
