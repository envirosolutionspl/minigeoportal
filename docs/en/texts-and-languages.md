# Texts and languages

## Texts of the deployment in Markdown

The welcome window and the accessibility statement are Markdown files of the configuration directory, one per language. `app.yaml` names them without the language:

```yaml
content:
  welcome: content/welcome # content/welcome.pl.md, content/welcome.en.md
  accessibility: content/accessibility
```

The file of the default language must exist; another language without its file shows the default one. The server turns the Markdown into HTML when it starts:

- headings, paragraphs, lists, emphasis and quotes as usual; a quote is drawn as a highlighted box (the "Important" box of the default welcome text);
- HTML written into the Markdown is shown as text, never run;
- links may lead to web addresses (they open in a new tab) and to e-mail addresses (`mailto:`); a link `app:report` opens the bug report form, `app:accessibility` the accessibility statement and `app:welcome` the welcome window: `[report form](app:report)`; other links become plain text;
- images are not shown.

## Interface texts

Texts of the interface (buttons, messages, labels) come with the app in `i18n/pl.yaml` and `i18n/en.yaml`. Keys are nested:

```yaml
search:
  gugik:
    placeholder: Address, town, parcel…
```

A deployment changes single texts in `i18n/<lang>.yaml` of its configuration directory; only the changed keys need to be there:

```yaml
# config/i18n/en.yaml
layers:
  popular: Start here
```

The same way a deployment gives readable names to technical fields in the answers of its services (`info.fields`, keyed by the field name) and names its data source in the footer of a printout (`print.note`); the default configuration does this for the GUGiK services in `config/i18n/`:

```yaml
info:
  fields:
    opis_oznac: Designation
```

`{name}` in a text is filled in by the app. Texts that depend on a number have a form per plural category of the language (`one`, `few`, `many`, `other`, as `Intl.PluralRules` names them); English needs `one` and `other`, Polish also `few` and `many`:

```yaml
parcel:
  several:
    one: '{count} parcel with this number found. Choose it.'
    other: '{count} parcels with this number found. Choose one.'
```

Numbers and dates are written the way the language writes them (1 234,5 in Polish, 1,234.5 in English).

## Adding a language

1. Add its code to `locales.available` in `app.yaml`.
2. Put all interface texts in `i18n/<code>.yaml` of the configuration directory (copy `i18n/en.yaml` of the app and translate it). Missing keys show the default language.
3. Give the texts of `app.yaml`, `map.yaml` and `layers.yaml` a version in the language where it matters: `title: { pl: Mapa, de: Karte }`.
4. Add the Markdown files: `content/welcome.<code>.md` and the like.

Each language has its own address: `https://your-domain/pl/`, `https://your-domain/en/`, `https://your-domain/de/`. The map view is in the query (`/en/?x=…&y=…`), so a link keeps both the view and the language. The bare domain redirects to the language chosen earlier with the switch (remembered in a cookie), without such a choice to the browser's language, and to the default language when the app does not have it. Old links with `?lang=en` lead to `/en/`. The page tells search engines about every language version (`hreflang`). A deployment with one language lives at the bare domain.

The switch appears in the display menu once there are two languages or more.
