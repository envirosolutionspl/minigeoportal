# Texts and languages

## Texts of the deployment in Markdown

The welcome window and the accessibility statement are Markdown files of the configuration directory, one per language. `app.yaml` names them without the language code:

```yaml
content:
  welcome: content/welcome # content/welcome.pl.md, content/welcome.en.md
  accessibility: content/accessibility
```

The file of the default language must exist. A language without its file shows the default one. The server turns the Markdown into HTML when it starts:

- headings, paragraphs, lists, emphasis and quotes work as usual; a quote is drawn as a highlighted box (the "Important" box of the default welcome text);
- HTML written into the Markdown is shown as text, never run;
- images are not shown;
- links may lead to web addresses (they open in a new tab), e-mail addresses (`mailto:`) and pages of the site itself (`/help`, `/?l=kieg,kimpzp`: the map with layers switched on); other links become plain text. Special links open parts of the app, e.g. `[report form](app:report)`:

| Link                | Opens                                        |
| ------------------- | -------------------------------------------- |
| `app:report`        | the bug report form                          |
| `app:accessibility` | the accessibility statement                  |
| `app:welcome`       | the welcome window                           |
| `app:time`          | the time view (where the deployment has one) |

### Guides

Guides are separate pages answering questions people type into a search engine ("how to check if a plot can be built on"). The server turns their Markdown into plain HTML pages, which search engines read without running the app:

```yaml
guides:
  path: { pl: pomoc, en: help } # the address of the list: /pomoc, /en/help
  pages: # content/guides/<page>.<language>.md, at /pomoc/<page>
    - czy-dzialka-jest-budowlana
    - teren-zalewowy
```

- A page exists in the languages that have its file; one is enough. A page with no file in any language is a configuration error.
- The page's title is its first `#` heading, its description for search engines the first paragraph (up to 160 characters).
- Under the text are a "Check on the map" button and the list of the other guides; the address of `path` lists them all.
- The pages take the skin's colours, carry the app's sign and name in the header (a link to the map) and the author's logo (`author.logo`) in the footer, and work without JavaScript. To preview them while working: `npm run dev:api` and the API server's address (the server serves them, not Vite).
- `/sitemap.xml` lists the home pages of every language, the lists and the guides, and `/robots.txt` points to the sitemap. Both exist without guides too.

## Interface texts

Texts of the interface (buttons, messages, labels) come with the app in `i18n/pl.yaml` and `i18n/en.yaml`. Keys are nested:

```yaml
search:
  coordinates:
    placeholder: Coordinates, e.g. 52.2318 21.0067
```

A module brings its own texts in `src/modules/<module>/i18n/<lang>.yaml`, added only when `app.yaml` enables it (see [Search and modules](search-and-modules.md#texts-of-the-module)).

A deployment changes single texts in `i18n/<lang>.yaml` of its configuration directory. Only the changed keys need to be there:

```yaml
# config/i18n/en.yaml
layers:
  popular: Start here
```

The same way a deployment words texts for its own data. The default configuration does this for the GUGiK services in `config/i18n/`:

- `info.fields`: readable names for technical fields in the services' answers (keyed by the field name);
- `print.note`: the whole footer of a printout, with the data source;
- the hint of the layer search, the reasons a layer cannot be shown, the place panel without layers, the introduction of the report form.

```yaml
info:
  fields:
    opis_oznac: Designation
```

`{name}` in a text is filled in by the app. Texts that depend on a number have a form per plural category of the language (`one`, `few`, `many`, `other`, as in `Intl.PluralRules`). English needs `one` and `other`, Polish also `few` and `many`:

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

Each language has its own address: `https://your-domain/pl/`, `https://your-domain/en/`. The map view is in the query (`/en/?x=…&y=…`), so a link keeps both the view and the language.

A visit to the bare domain picks the language in this order:

1. the language chosen earlier with the switch in the display menu (remembered in the `lang` cookie);
2. the first language of the browser's preferences that the app has (`de-AT` matches `de`);
3. `locales.default`.

What happens at the bare domain:

- **Without `root`** the bare domain only redirects to the address of the chosen language.
- **With `root: pl`** Polish has no code in the address and lives at `/`. Visitors who pick another language are redirected (`/en/`), and `/pl/` leads to `/`. A request that names no language at all (a messenger's link preview, a crawler) gets the `root` language. minigeoportal.pl works this way: `https://minigeoportal.pl/` in Polish, `https://minigeoportal.pl/en/` in English.
- **One language**: the deployment lives at the bare domain, without a code and without a switch.

Old links with `?lang=en` lead to `/en/`, and an unknown code (`/xx/`) goes where the bare domain goes. The page tells search engines about every language version (`hreflang`).

The default language also fills in translations: a text, interface message or Markdown file missing in the visitor's language shows in the default language. A new language can therefore be added step by step.

## Adding a language step by step

Example: German (`de`) in the configuration directory `config/`.

1. **Add the language** in `app.yaml`:

   ```yaml
   locales:
     default: en
     available: [pl, en, de]
   ```

2. **Interface texts.** Copy the app's `i18n/en.yaml` to `config/i18n/de.yaml` and translate the values, keeping the keys.
   - Keep the `{name}` placeholders.
   - Give texts that depend on a number the forms the language needs (German: `one` and `other`).
   - With the gugik module on, add the keys of `src/modules/gugik/i18n/en.yaml` to the same file and translate them too.
   - If the deployment's `config/i18n/en.yaml` has texts of its own (e.g. `info.fields`, `print.note`), translate them in the same file.

3. **Markdown content.** Add `content/welcome.de.md` and `content/accessibility.de.md` (translate the English ones). Without them the German page shows the content in the default language.

4. **Texts in the YAML files.** Wherever a text has language versions, add the German one:
   - in `app.yaml`: the name, title, description, `tagline`, report categories, `links.fallbackName`;
   - in `map.yaml`: base maps, `homeLabel`, `attribution`, the labels of the time view's layers;
   - in `layers.yaml`: topics, layers and sublayers.

   ```yaml
   title: { pl: 'Mapa gminy', en: 'Municipal map', de: 'Gemeindekarte' }
   ```

   The name of the coordinate system (`projection.name`) is one for all languages. Layer search keywords can have a list per language: `keywords: { en: [parcel], de: [Flurstück] }`.

5. **Check** the configuration without starting the server:

   ```bash
   npm run config:check config
   ```

   The result lists the languages (`OK (pl, en, de; …)`) or every problem with its file, line and column.

6. **Restart the server**, as the configuration is read when it starts. With Docker: `docker compose up -d --force-recreate app updater`; with `npm start`: a restart of the process. In development the server restarts by itself on changes in `config/`.

7. **See the result** at `https://your-domain/de/`. Browsers set to German get it at the bare domain, and the language switch in the display menu shows "Deutsch".

Removing a language means removing its code from `locales.available`; the files may stay. Links to the removed language (`/de/…`) then go where the bare domain goes.
