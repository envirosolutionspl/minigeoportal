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
- links may lead to web addresses (they open in a new tab) and to e-mail addresses (`mailto:`); a link `app:report` opens the bug report form, `app:accessibility` the accessibility statement, `app:welcome` the welcome window and `app:time` the time view (where the deployment has one): `[report form](app:report)`; other links become plain text;
- images are not shown.

## Interface texts

Texts of the interface (buttons, messages, labels) come with the app in `i18n/pl.yaml` and `i18n/en.yaml`. Keys are nested:

```yaml
search:
  coordinates:
    placeholder: Coordinates, e.g. 52.2318 21.0067
```

A module brings its own texts in `src/modules/<module>/i18n/<lang>.yaml`; they are added only when `app.yaml` enables the module (see [Search and modules](search-and-modules.md#texts-of-the-module)).

A deployment changes single texts in `i18n/<lang>.yaml` of its configuration directory; only the changed keys need to be there:

```yaml
# config/i18n/en.yaml
layers:
  popular: Start here
```

The same way a deployment gives readable names to technical fields in the answers of its services (`info.fields`, keyed by the field name), replaces the footer of a printout with its own, naming its data source (`print.note`, the whole footer text) and words texts for its own data (the hint of the layer search, the reasons a layer cannot be shown, the place panel without layers, the introduction of the report form); the default configuration does this for the GUGiK services in `config/i18n/`:

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

## Languages and addresses

The languages of a deployment are set in `app.yaml`:

```yaml
locales:
  default: en # for visitors whose browser asks for none of the available ones
  available: [pl, en] # order in the language switch
  root: pl # optional: the language at the bare domain, without /pl/
report:
  locale: pl # language of the report mails to the administrator (default: locales.default)
```

A language code is two or three lowercase letters, optionally with a region: `pl`, `de`, `en-GB`.

Each language has its own address: `https://your-domain/pl/`, `https://your-domain/en/`. The map view is in the query (`/en/?x=…&y=…`), so a link keeps both the view and the language. A visit to the bare domain picks the visitor's language:

1. the language chosen earlier with the switch in the display menu (remembered in the `lang` cookie),
2. without such a choice the first language of the browser's preferences the app has (`de-AT` matches `de`),
3. when the app has none of them, `locales.default`.

Without `root` the bare domain only redirects to the address of that language. With `root: pl` Polish has no code in the address: it lives at the bare domain, which shows it to visitors who pick Polish and redirects the others (`/en/`); `/pl/` then leads to `/`. A request that names no language at all (a messenger's link preview, a crawler) gets the `root` language at the bare domain, so a preview of a link to the domain is in that language. The default deployment works this way: `https://minigeoportal.pl/` in Polish, `https://minigeoportal.pl/en/` in English.

Old links with `?lang=en` lead to `/en/`, and an unknown code (`/xx/`) goes where the bare domain goes. The page tells search engines about every language version (`hreflang`). A deployment with one language lives at the bare domain, without `/en/`, and has no switch.

The default language also fills in translations: a text, interface message or Markdown file missing in the visitor's language shows in the default language. A new language can therefore be added step by step.

Every deployment of the app works this way, not only the default one: only the configuration directory changes.

## Adding a language step by step

Example: German (`de`) in the configuration directory `config/`.

1. **Add the language** in `app.yaml`:

   ```yaml
   locales:
     default: en
     available: [pl, en, de]
   ```

2. **Interface texts.** Copy the app's `i18n/en.yaml` to `config/i18n/de.yaml` and translate the values, keeping the keys. Keep `{name}` placeholders, and give messages that depend on a number the forms the language needs (German: `one` and `other`). With the gugik module on, add the keys of `src/modules/gugik/i18n/en.yaml` to the same `de.yaml` and translate them too. If the deployment's `config/i18n/en.yaml` has texts of its own (e.g. `info.fields`, `print.note`), translate them in the same `de.yaml`.

3. **Markdown content.** Add `content/welcome.de.md` and `content/accessibility.de.md` (translate the English ones). Without them the German page shows the content in the default language.

4. **Texts in the YAML files.** Wherever a text has language versions, add the German one: the name, description, `tagline`, report categories and `links.fallbackName` in `app.yaml`, base maps, `homeLabel` and `attribution` in `map.yaml`, topics, layers and sublayers in `layers.yaml`. The name of the coordinate system (`projection.name`) is one for all languages:

   ```yaml
   title: { pl: 'Mapa gminy', en: 'Municipal map', de: 'Gemeindekarte' }
   ```

   Layer search keywords can have a list per language: `keywords: { en: [parcel], de: [Flurstück] }`.

5. **Check** the configuration without starting the server:

   ```bash
   npm run config:check config
   ```

   The result lists the languages (`OK (pl, en, de; …)`) or every problem with its file, line and column.

6. **Restart the server**, as the configuration is read when it starts: with Docker `docker compose up -d --force-recreate app`, with `npm start` a restart of the process (in development the server restarts by itself on changes in `config/`).

7. **See the result** at `https://your-domain/de/`. The bare domain opens German for browsers set to German, and the language switch in the display menu shows "Deutsch" (the language's name in itself).

Removing a language means removing its code from `locales.available`; the files may stay. Links to the removed language (`/de/…`) then go where the bare domain goes.
