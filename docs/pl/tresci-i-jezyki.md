# Treści i języki

## Treści wdrożenia w Markdown

Okno powitalne i deklaracja dostępności to pliki Markdown w katalogu konfiguracji, po jednym dla każdego języka. `app.yaml` wskazuje je bez języka:

```yaml
content:
  welcome: content/welcome # content/welcome.pl.md, content/welcome.en.md
  accessibility: content/accessibility
```

Plik języka domyślnego musi istnieć; inny język bez własnego pliku pokazuje domyślny. Serwer zamienia Markdown na HTML przy starcie:

- nagłówki, akapity, listy, wyróżnienia i cytaty jak zwykle; cytat jest rysowany jako wyróżniona ramka (ramka „Ważne” w domyślnym powitaniu);
- HTML wpisany w Markdown jest pokazywany jako tekst, nigdy nie jest wykonywany;
- linki mogą prowadzić do adresów www (otwierają się w nowej karcie) i adresów e-mail (`mailto:`); link `app:report` otwiera formularz zgłoszeń, `app:accessibility` deklarację dostępności, a `app:welcome` okno powitalne: `[formularz zgłoszeń](app:report)`; inne linki stają się zwykłym tekstem;
- obrazy nie są pokazywane.

## Napisy interfejsu

Napisy interfejsu (przyciski, komunikaty, etykiety) są w aplikacji w `i18n/pl.yaml` i `i18n/en.yaml`. Klucze są zagnieżdżone:

```yaml
search:
  gugik:
    placeholder: Adres, miejscowość, działka…
```

Wdrożenie zmienia pojedyncze napisy w `i18n/<język>.yaml` swojego katalogu konfiguracji; wystarczą same zmienione klucze:

```yaml
# config/i18n/pl.yaml
layers:
  popular: Na start
```

Tak wdrożenie podaje też czytelne nazwy technicznych pól z odpowiedzi usług (`info.fields`, kluczem jest nazwa pola) i dopisuje źródło danych do stopki wydruku (`print.note`); domyślna konfiguracja robi to dla usług GUGiK w `config/i18n/`:

```yaml
info:
  fields:
    opis_oznac: Przeznaczenie
```

`{nazwa}` w napisie wypełnia aplikacja. Napisy zależne od liczby mają formę dla każdej kategorii liczby mnogiej języka (`one`, `few`, `many`, `other`, jak nazywa je `Intl.PluralRules`); angielski potrzebuje `one` i `other`, polski także `few` i `many`:

```yaml
parcel:
  several:
    one: Znaleziono {count} działkę o tym numerze. Wybierz ją.
    few: Znaleziono {count} działki o tym numerze. Wybierz jedną.
    many: Znaleziono {count} działek o tym numerze. Wybierz jedną.
    other: Znaleziono {count} działki o tym numerze. Wybierz jedną.
```

Liczby i daty są zapisywane tak, jak zapisuje je dany język (1 234,5 po polsku, 1,234.5 po angielsku).

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

Każdy język ma własny adres: `https://twoja-domena/pl/`, `https://twoja-domena/en/`. Widok mapy jest w parametrach (`/pl/?x=…&y=…`), więc link zachowuje i widok, i język. Wejście na sam adres domeny wybiera język odwiedzającego:

1. język wybrany wcześniej przełącznikiem w menu ułatwień (zapamiętany w ciasteczku `lang`),
2. bez takiego wyboru pierwszy język z preferencji przeglądarki, który aplikacja ma (`de-AT` pasuje do `de`),
3. gdy aplikacja nie ma żadnego z nich, `locales.default`.

Bez `root` sam adres domeny tylko przekierowuje na adres wybranego języka. Z `root: pl` polski nie ma kodu w adresie: mieszka pod samym adresem domeny, który pokazuje go odwiedzającym wybierającym polski, a pozostałych przekierowuje (`/en/`); `/pl/` prowadzi wtedy pod `/`. Zapytanie bez żadnego języka (podgląd linku w komunikatorze, robot wyszukiwarki) dostaje pod samym adresem język `root`, więc podgląd linku do domeny jest w tym języku. Tak działa domyślne wdrożenie: `https://minigeoportal.pl/` po polsku, `https://minigeoportal.pl/en/` po angielsku.

Stare linki z `?lang=en` prowadzą pod `/en/`, a nieznany kod (`/xx/`) jak sam adres domeny. Strona podaje wyszukiwarkom wszystkie wersje językowe (`hreflang`). Wdrożenie z jednym językiem działa pod samym adresem domeny, bez `/pl/`, i nie ma przełącznika.

Język domyślny uzupełnia też tłumaczenia: tekst, napis interfejsu czy plik Markdown, którego nie ma w języku odwiedzającego, pokazuje się w języku domyślnym. Dzięki temu nowy język można dodawać stopniowo.

Tak działa każde wdrożenie aplikacji, nie tylko domyślne: zmienia się wyłącznie katalog konfiguracji.

## Dodawanie języka krok po kroku

Przykład: niemiecki (`de`) w katalogu konfiguracji `config/`.

1. **Dopisz język** w `app.yaml`:

   ```yaml
   locales:
     default: en
     available: [pl, en, de]
   ```

2. **Napisy interfejsu.** Skopiuj z aplikacji `i18n/en.yaml` do `config/i18n/de.yaml` i przetłumacz wartości, nie zmieniając kluczy. Zachowaj `{nazwa}` w napisach, a napisom zależnym od liczby daj formy, których potrzebuje język (niemiecki: `one` i `other`). Jeśli `config/i18n/en.yaml` wdrożenia zawiera własne napisy (np. `info.fields`, `print.note`), przetłumacz je w tym samym pliku `de.yaml`.

3. **Treści w Markdown.** Dodaj `content/welcome.de.md` i `content/accessibility.de.md` (przetłumacz wersję angielską). Bez nich niemiecka strona pokaże treści w języku domyślnym.

4. **Teksty w plikach YAML.** Wszędzie, gdzie tekst ma wersje językowe, dopisz niemiecką; dotyczy to nazwy i opisu w `app.yaml`, kategorii zgłoszeń, podkładów i układów współrzędnych w `map.yaml` oraz tematów i warstw w `layers.yaml`:

   ```yaml
   title: { pl: 'Mapa gminy', en: 'Municipal map', de: 'Gemeindekarte' }
   ```

   Słowa kluczowe wyszukiwania warstw mogą mieć osobną listę na język: `keywords: { pl: [działka], de: [Flurstück] }`.

5. **Sprawdź** konfigurację bez uruchamiania serwera:

   ```bash
   npm run config:check config
   ```

   Wynik wymienia języki (`OK (pl, en, de; …)`) albo każdy problem z plikiem, wierszem i kolumną.

6. **Uruchom serwer ponownie**, bo konfiguracja jest czytana przy starcie: w Dockerze `docker compose up -d --force-recreate app`, przy `npm start` ponowne uruchomienie procesu (w trybie deweloperskim serwer restartuje się sam).

7. **Zobacz wynik** pod `https://twoja-domena/de/`. Sam adres domeny otworzy niemiecki przeglądarkom ustawionym na niemiecki, a przełącznik języka w menu ułatwień pokaże „Deutsch” (nazwę języka w nim samym).

Usunięcie języka to usunięcie jego kodu z `locales.available`; pliki mogą zostać. Linki do usuniętego języka (`/de/…`) prowadzą wtedy jak sam adres domeny.
