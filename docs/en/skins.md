# Skins

A skin sets the colours of the interface in light and dark mode. It is one stylesheet, `skin.css`, in a directory named after the skin, and `app.yaml` chooses it:

```yaml
skin: harbour
```

The server looks for `skins/harbour/skin.css` in the configuration directory first, then among the skins that come with the app (`skins/` of the repository; `default` is the look of prostygeoportal.pl), and puts the stylesheet into the page.

Start from a copy of `skins/default/skin.css` and change the values:

```css
:root {
  --text: #1f2933; /* text */
  --surface: #ffffff; /* panels and windows */
  --field: #f2f4f5; /* fields, boxes inside panels */
  --hover: #d9e1d9; /* hovered rows and buttons, thin borders */
  --muted: #52606d; /* secondary text */
  --danger: #8a2c0d; /* error text */
  --danger-soft: #fde8e0; /* error background */
  --highlight: #ff8142; /* found objects and the clicked place on the map, the print frame */
  --map-measure: #466946; /* measured lines and areas */
  --accent: #0b5d8f; /* buttons, links, switched-on items */
  --on-accent: #ffffff; /* text on the accent */
  --accent-soft: #e3eef5; /* background of switched-on layers */
  --map-bg: #f2f4f5; /* under transparent map tiles */
}

@media (prefers-color-scheme: dark) {
  :root {
    /* the same variables for dark mode */
  }
}
```

Keep the text readable: `--text`, `--muted` and `--accent` need a contrast of at least 4.5:1 against `--surface` and `--field`, `--on-accent` against `--accent` and `--danger` against `--surface` and `--danger-soft`, in both modes (WCAG 2.1 AA). The tests of the app check this for every skin in `skins/`.

High contrast (yellow on black, in the display menu) is the same for every skin, so it always works.

The layout and the icons are not part of a skin; the classes in the components are not a stable interface and may change between versions.
