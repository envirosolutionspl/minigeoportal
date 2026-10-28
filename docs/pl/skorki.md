# Skórki

Skórka ustala kolory interfejsu w trybie jasnym i ciemnym. To jeden arkusz stylów, `skin.css`, w katalogu nazwanym jak skórka; `app.yaml` ją wybiera:

```yaml
skin: przystan
```

Serwer szuka `skins/przystan/skin.css` najpierw w katalogu konfiguracji, potem wśród skórek dołączonych do aplikacji (`skins/` w repozytorium; `default` to wygląd minigeoportal.pl), i umieszcza arkusz w stronie.

Zacznij od kopii `skins/default/skin.css` i zmień wartości. Przykład niżej to skórka w odcieniach niebieskiego; wartości wyglądu minigeoportal.pl są w samym pliku `default`:

```css
:root {
  --text: #1f2933; /* tekst */
  --surface: #ffffff; /* panele i okna */
  --field: #f2f4f5; /* pola, ramki w panelach */
  --hover: #d9e1d9; /* wskazane wiersze i przyciski, cienkie obramowania */
  --muted: #52606d; /* tekst pomocniczy */
  --danger: #8a2c0d; /* tekst błędu */
  --danger-soft: #fde8e0; /* tło błędu */
  --highlight: #ff8142; /* znalezione obiekty i kliknięte miejsce na mapie */
  --highlight-ui: #c2410c; /* ten sam kolor na panelach (ikony miejsca i działki, ramka wydruku); bez tego --highlight */
  --map-measure: #466946; /* mierzone linie i powierzchnie */
  --map-selection: #7c3aed; /* działki selekcji */
  --accent: #0b5d8f; /* przyciski, linki, włączone elementy */
  --on-accent: #ffffff; /* tekst na akcencie */
  --accent-soft: #e3eef5; /* tło włączonych warstw */
  --map-bg: #f2f4f5; /* pod przezroczystymi kaflami mapy */
  --mark: #0b5d8f; /* wbudowany znak aplikacji; bez tego akcent */
  --mark-line: #52606d; /* granice w jego lupie; bez tego --muted */
}

@media (prefers-color-scheme: dark) {
  :root {
    /* te same zmienne dla trybu ciemnego */
  }
}
```

Tekst musi być czytelny (WCAG 2.1 AA). W obu trybach potrzebny jest kontrast co najmniej 4,5:1:

- `--text`, `--muted`, `--accent` i `--highlight-ui` względem `--surface` i `--field`;
- `--on-accent` względem `--accent`;
- `--danger` względem `--surface` i `--danger-soft`.

Testy aplikacji sprawdzają to dla każdej skórki w `skins/`, więc skórka trzymana tam musi mieć też `--highlight-ui`.

Wysoki kontrast (żółty na czarnym, w menu ułatwień) jest wspólny dla wszystkich skórek, więc zawsze działa.

Układ i ikony nie należą do skórki. Klasy w komponentach nie są stabilnym interfejsem i mogą się zmieniać między wersjami.
