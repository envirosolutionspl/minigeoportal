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

## Dodawanie języka

1. Dopisz jego kod do `locales.available` w `app.yaml`.
2. Umieść wszystkie napisy interfejsu w `i18n/<kod>.yaml` katalogu konfiguracji (skopiuj `i18n/en.yaml` aplikacji i przetłumacz). Brakujące klucze pokazują język domyślny.
3. Nadaj tekstom w `app.yaml`, `map.yaml` i `layers.yaml` wersję w tym języku tam, gdzie to ważne: `title: { pl: Mapa, de: Karte }`.
4. Dodaj pliki Markdown: `content/welcome.<kod>.md` i pozostałe.

Język wynika z `?lang=` w adresie, potem z ciasteczka ustawianego przez przełącznik języka, potem z preferencji przeglądarki, a na końcu jest język domyślny. Przełącznik pojawia się w menu ułatwień, gdy są co najmniej dwa języki.
