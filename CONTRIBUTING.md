# Jak pomóc

Błędy i pomysły zgłaszaj w [issues](https://github.com/envirosolutionspl/minigeoportal/issues), podatności według [SECURITY.md](SECURITY.md).

## Uruchomienie

Potrzebny jest Node.js 22.18 lub nowszy.

```bash
npm install
npm run dev     # aplikacja na porcie 5173, API na 8787
npm run check   # typy, ESLint, Prettier i testy, jak w CI
```

## Zasady

- Każda zmiana ma test w tym samym commicie (Vitest, plik `*.test.ts(x)` obok kodu).
- `npm run check` przechodzi przed każdym commitem.
- Teksty interfejsu tylko przez tłumaczenia (`i18n/pl.yaml` i `i18n/en.yaml`), w obu językach.
- Zmiana zachowania opisanego w dokumentacji poprawia oba języki: `docs/pl` i `docs/en`.
- Commity po angielsku: jedno zdanie, które mówi, co się zmienia, np. `Measure: distances on the sphere of the place's Gaussian radius, like areas`.

Więcej o budowie i testach: [Architektura](docs/pl/architektura.md).

## English

Report bugs in [issues](https://github.com/envirosolutionspl/minigeoportal/issues) and vulnerabilities as in [SECURITY.md](SECURITY.md). Run `npm install`, `npm run dev` and `npm run check` (Node.js 22.18+). Every change comes with its test in the same commit, `npm run check` passes, UI texts go through `i18n/pl.yaml` and `i18n/en.yaml`, documentation changes cover `docs/pl` and `docs/en`, and commit messages are one English sentence saying what changes. See [Architecture](docs/en/architecture.md).
