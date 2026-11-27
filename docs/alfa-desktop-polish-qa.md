# Desktop polish QA — 2026-11-27

Release-readiness document remains **BLOCKED / NO-GO**. User explicitly requested
publishing this UX batch.

- Production target: `alfa-traders / main`, `https://alfa-trader.com/alfa-charts.html`.
- Product commit: `5fdb14dda77cca5b7d7cd31448c2caa914c97afb`.
- Git push target: `origin/feat/mobile-ux-upgrade`.
- Deployment: `32de29be-bd60-43f8-9587-93d03f2f2367`.
- Rollback: `c1da6f92-6f31-46ef-be0c-78a2c656cc9f`.
- Read-only production GET checks confirmed HTML CSS v63, JS v105, the
  persistence guard and pane-label assets. No production smoke suite was run.

## Findings and fixes

| Finding | Surface | Root cause / fix |
| --- | --- | --- |
| Old candles briefly appear under the new timeframe | Shared | `loadMarket` cached outgoing history using the already-changed incoming symbol/interval. Removed that write; incoming data still populates its own cache. |
| Indicators disappear after timeframe changes | Shared | Clearing outgoing indicators fires persistence callbacks. Mark the outgoing study context unloaded during transport changes so transient empty state cannot overwrite the saved bundle. |
| Empty buttons appear above desktop candles | Web | The phone swipe overlay had no desktop hiding rule. Hide it only under `chart-first`. |
| Study header consumes chart height | Web | Desktop reserved a grid row for the legend. Make it an interactive overlay, leaving the canvas full height below the toolbar. |
| Study controls are tiny and descriptions clutter the legend | Web | Use 24px click targets, flat rows and hide verbose metadata in desktop CSS. Settings and removal remain reachable. |
| Pane captions disappear or overlap after rebuild | Shared | Native pane rows are created/reused asynchronously. Retry caption attachment during layout, move captions away from reused rows and cancel pending work on detach. |
| Pane names repeat as coloured axis badges | Shared | Public series titles produced native price-axis labels. Keep names in the actual pane's top-left caption instead. |
| Tucked panes remain too tall on a larger canvas | Shared | Stretch factors were proportional to the old smaller canvas. Reduce the tucked factor; tested heights are 19px with an 846px host. |
| Session times are not visible on the chart | Web display, shared module | Show actual per-box UTC start/end timestamps in desktop labels, including DST-resolved boundaries. Phone short labels are preserved; full times are in the SVG title. |

## Regression coverage

`tests/browser/alfa-desk-pane-density.browser.mjs` uses deterministic anonymous
fixtures and asserts actual chart state, not screenshots alone:

- Bar, line, area, Heikin Ashi and candle switches.
- Range, lab and view menu visibility/viewport bounds.
- Grid toggle, chart settings, screenshot menu and watchlist toggle.
- Study add, eye-hide (native pane removed), restore, double-click tuck/restore.
- Actual captions in separate panes after timeframe changes.
- No phone carousel leakage, no reserved legend row, usable click targets.
- Actual UTC session labels.
- Delayed 15m transport with no hourly cache contamination.
- Rapid timeframe changes preserve EMA.
- No uncaught errors and no unmocked same-origin writes.

`tests/browser/alfa-workspace.browser.mjs` additionally covers drawings, undo,
right-click, alarms, session settings, palette, persisted layouts, explorer,
watchlist, multi-chart, embedded sync and object tree.

Stale tests were deliberately updated for the one-button phone FAB and desktop
overlay legend. The palette test now right-clicks an unobscured plot point
rather than the legend.

## Verification

- Dedicated desktop regression: PASS after failing on each newly asserted bug.
- Workspace suite: PASS, 25 checks, one attempt.
- UX-eight suite: PASS, eight checks, one attempt.
- Earlier mobile batch: PASS, unit plus ten browser suites, no retries.
- Final full nightly: 33/34 PASS, no retries. The sole failure was the old
  indicator-row 22px/top-edge assertion. Updated to 24px click targets and
  vertical-centre alignment; `alfa-indicator-pane` then PASS on its first run.
  No product code changed after that nightly.
- Final web runner: **23/24 PASS**, no retries. Workspace timed out at the
  native mouse crosshair propagation assertion between real embedded frames
  (`tests/browser/alfa-workspace.browser.mjs:582`).
- Standalone diagnostic workspace rerun on unchanged product: **25 checks PASS**.
  This does not erase the failed full run or establish a root cause. Embedded
  crosshair synchronization remains an unresolved intermittent QA finding.
- `git diff --check`: PASS.
- Screenshots: `.qa-reports/desktop-polish/` (ignored).

## Risks and limits

Shared cache, persistence, pane caption and study changes also affect mobile and
embedded charts; their nightly suites passed without retries. Automated browser tests
do not prove live exchange feed accuracy, every browser combination or physical
iOS focus-zoom behavior. No real accounts, credentials or production mutations
were used. Production smoke was not requested or run.

Do not describe this batch as fully green: the final web runner's embedded
crosshair timeout remains open despite the subsequent standalone pass.
