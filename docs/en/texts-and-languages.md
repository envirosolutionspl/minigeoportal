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

The language comes from `?lang=` in the address, then from a cookie the language switch sets, then from the browser's preferences, then the default language. The switch appears in the display menu once there are two languages or more.
