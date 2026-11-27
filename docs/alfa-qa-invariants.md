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
- Phone touch never opens the desktop drawing context menu; the date readout stays visible on touch hold.
- Phone sheets close on a downward swipe from the sheet body; a stationary tap inside the sheet keeps it open.
- Dialogs on phones use at most three quarters of the viewport and keep backdrop blur at or below `1px`.
- Mobile text inputs stay at least `16px` so focusing them does not zoom the page; accessibility zoom remains enabled.
- Timeframe is global across pairs: `5m`, `15m`, and `30m` survive a pair switch with matching URL and data requests.
- Landscape keeps the same FAB/tool sheet reachable with thumb-sized targets.

## Indicators and panes

- Pane indicator names and desktop actions sit at the top-left of their own pane; do not repeat pane names in the upper overlay legend.
- Overlay indicators appear under the symbol label without a visible `İndikatörler` heading.
- Bulk `+/-` legend controls stay hidden in the compact legend.
- Embedded panes (`isEmbed`) keep the compact shell; they must never receive desktop `chart-first`, which can create zero-height plots.
- Desktop `chart-first` keeps the chart host at least 70% of viewport height even with CVD/OI/delta panes. Per the user's revised requirement, double-clicking the plot completely hides every lower pane (no ribbons); a second double-click restores the same studies. Price overlays stay unchanged.
- Double-clicking a pane-study legend row must resize its real pane, not only flip the stored `collapsed` flag.
- The desktop overlay legend has a bottom count/arrow control that folds names only, without disabling the indicators.
- Desktop phone sheets must be `display:none`, not appended below the chart. Hiding the watchlist must actually expand the canvas.
- Replay display timeframe changes preserve the execution engine, paper journal and replay clock. Render only candles closed by that clock; do not use the selected display timeframe to evaluate paper trades.
- Historical public statistics requests are bounded by the review/replay clock. Live depth is unavailable in historical mode; never substitute it for historical liquidity.

## Ranges and explorer

- Range presets are exposed in the range menu with a subheading.
- Tests must target the visible range menu buttons (`#menu-range-1d`, `#range-menu [data-range=...]`) instead of the first hidden `[data-range]` match.
- The pair explorer shows the full available list and supports add / favorite / open.
- The explorer opens from the top-left `BTCUSDT` control. Desktop rows open directly without separate add/star/open buttons; phone list actions remain available.

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
- The phone FAB brush is its own drag handle; there is no separate grip, and the brush stays at least 44px.
- Cache busting: CSS `?v=64` is current; bump on future CSS edits.
- `isEmbed` plus `chart-first` breaks pane height; guard both sides.
- `window.__alfaDebug` is the source of truth for chart/drawing state assertions.
