# Skins

A skin sets the colours of the interface in light and dark mode. It is one stylesheet, `skin.css`, in a directory named after the skin, and `app.yaml` chooses it:

```yaml
skin: harbour
```

The server looks for `skins/harbour/skin.css` in the configuration directory first, then among the skins that come with the app (`skins/` of the repository; `default` is the look of minigeoportal.pl), and puts the stylesheet into the page.

Start from a copy of `skins/default/skin.css` and change the values. The example below is a skin in shades of blue; the values of minigeoportal.pl are in the `default` file itself:

```css
:root {
  --text: #1f2933; /* text */
  --surface: #ffffff; /* panels and windows */
  --field: #f2f4f5; /* fields, boxes inside panels */
  --hover: #d9e1d9; /* hovered rows and buttons, thin borders */
  --muted: #52606d; /* secondary text */
  --danger: #8a2c0d; /* error text */
  --danger-soft: #fde8e0; /* error background */
  --highlight: #ff8142; /* found objects and the clicked place on the map */
  --highlight-ui: #c2410c; /* the same colour on panels (icons of the place and the parcel, the print frame); without it --highlight */
  --map-measure: #466946; /* measured lines and areas */
  --accent: #0b5d8f; /* buttons, links, switched-on items */
  --on-accent: #ffffff; /* text on the accent */
  --accent-soft: #e3eef5; /* background of switched-on layers */
  --map-bg: #f2f4f5; /* under transparent map tiles */
  --mark: #0b5d8f; /* the built-in sign of the app; the accent when left out */
  --mark-line: #52606d; /* boundaries in its lens; --muted when left out */
}

@media (prefers-color-scheme: dark) {
  :root {
    /* the same variables for dark mode */
  }
}
```

Keep the text readable (WCAG 2.1 AA). In both modes a contrast of at least 4.5:1 is needed:

- `--text`, `--muted`, `--accent` and `--highlight-ui` against `--surface` and `--field`;
- `--on-accent` against `--accent`;
- `--danger` against `--surface` and `--danger-soft`.

The tests of the app check this for every skin in `skins/`, so a skin kept there needs `--highlight-ui` too.

High contrast (yellow on black, in the display menu) is the same for every skin, so it always works.

The layout and the icons are not part of a skin. The classes in the components are not a stable interface and may change between versions.
