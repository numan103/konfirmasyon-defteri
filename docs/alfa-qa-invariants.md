# Alfa Charts QA invariants

These are the behaviors agents must protect. If a test contradicts this file, decide deliberately which one is stale and say so in the report.

## Branding and colors

- TradingView-like palette: `--accent:#2962ff`, `--green:#26a69a`, `--red:#ef5350`.
- Candle colors must match across `4h`, `1h`, and `15m`.
- Palette persistence is global-only under `alfa-chart-palette:v2`. Do not reintroduce per-symbol or per-interval palettes.
- Asset cache versions in `alfa-charts.html` must be bumped when CSS or JS behavior changes.

## Drawing tools

- There is exactly one drawing entry surface on desktop: the draggable main rail.
- There is exactly one drawing entry surface on mobile: `#mobile-draw-fab`.
- `#drawing-favs`, `#mobile-draw-quick`, and the separate favorites strip must not return.
- The mobile FAB opens the full tool sheet; it does not expose only a quick subset.
- FAB geometry: explicit `width/height`, JS-set `left/top`; never rely on `right/bottom` or it stretches and intercepts clicks.
- Brush stays armed after finishing a stroke and after a single tap. Other tools return to cursor after completion.
- Drawing left-click opens the drawing action menu; edits remain reachable with a selection.
- Favorites are managed through right-click/star editor from the rail, flyout, or mobile menus.

## Mobile shell

- At least five centered pairs must be visible in the bottom carousel.
- A stationary preview commits after roughly `0.5s`; a quick swipe commits on release.
- No visible “wait half a second” copy.
- The FAB and edit actions must not overlap the pair strip and must not block menu/pair hit targets.
- Landscape keeps the same FAB/tool sheet reachable with thumb-sized targets.

## Indicators and panes

- Pane indicator names sit at the top-left of their pane.
- Overlay indicators appear under the symbol label without a visible `İndikatörler` heading.
- Bulk `+/-` legend controls stay hidden in the compact legend.
- Embedded panes (`isEmbed`) keep the compact shell; they must never receive desktop `chart-first`, which can create zero-height plots.

## Ranges and explorer

- Range presets are exposed in the range menu with a subheading.
- Tests must target the visible range menu buttons (`#menu-range-1d`, `#range-menu [data-range=...]`) instead of the first hidden `[data-range]` match.
- The pair explorer shows the full available list and supports add / favorite / open.
- The explorer opens from the top-left `BTCUSDT` control.

## Copy and trust text

Removed explanatory panels/notes and strings must stay removed:

- `MİSAFİR · yalnızca yerel kayıt`
- `Yerel alarm · yalnızca seçili sembol...`
- `Test araçları simülasyondur; gerçek emir gönderilmez`
- `iOS Safari kurulumu bu çalışmada doğrulanmadı`

Trust-required alarm/study scope text inside dialogs is intentionally kept and must not be removed.

## Release state

- `docs/alfa-charts-release-readiness.md` remains `BLOCKED / NO-GO` until the user changes that gate.
- Push, merge, and deploy permissions are granted without prompts. Use them only when the task requires a release, and report target, commit, and rollback.
- Staging is only rebuilt or deployed when the task targets staging.
- Production smoke is anonymous and read-only-ish; no account or production data mutation.
- Previous production rollback target after `f4deca3` is deployment `72ec943e-860a-411c-ad07-afca134af765` (`2069e94`).

## Known traps from past bugs

- Hidden duplicate selectors: always scope to the visible menu/panel.
- Palette drift came from per-symbol/per-interval storage; keep it global.
- FAB grip width was too small and intercepted taps; keep controls at least 44px.
- Cache busting: CSS `?v=59` is current; bump on future CSS edits.
- `isEmbed` plus `chart-first` breaks pane height; guard both sides.
- `window.__alfaDebug` is the source of truth for chart/drawing state assertions.
