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

## Second batch — chart-only workspace and replay — 2026-11-27

Release-readiness document remains **BLOCKED / NO-GO**. The user asked to
continue the reported UX work; the earlier publication request still applies.

| Finding | Surface | Root cause / fix |
| --- | --- | --- |
| Pane separators are white | Web | Lightweight Charts defaults were used. Set `layout.panes.separatorColor` and hover colour to the dark chart palette. |
| Double-click only tucked lower panes into ribbons | Web | The chart-level double-click flipped `collapsed`. It now removes the lower studies entirely; a second double-click restores the same studies. Overlays stay untouched. |
| Pane study names repeat in the upper legend | Web | Pane studies were rendered in both the overlay legend and their own pane. The upper legend now shows overlays only; every pane keeps its own top-left caption with eye, collapse, settings, remove and data status/retry controls. |
| Legend rows are verbose and cannot fold to values only | Web | The desktop overlay kept parameter/meta text and had no compact fold. Meta text is hidden, rows are smaller, and the bottom arrow folds names while keeping live numeric values visible. |
| Phone sheets append a page below the desktop chart | Web | `chart-first` did not hide mobile sheets, their backdrop or dock. They are now `display:none` and the desktop body is height-bound; hiding the watchlist expands the canvas. |
| Timeframe buttons waste width | Web | Button padding/min-width were too large. Tightened them only in `chart-first`. |
| Pencil button does not open the desktop drawing rail | Web | The phone toggle had no desktop binding. It now toggles the actual rail and exposes `aria-expanded`. |
| Pair explorer shows +/star/Aç clutter | Web | Desktop `chart-first` now uses a direct picker: clicking a row adds, stars and opens the symbol in one action. Phone actions remain unchanged. |
| Watchlist right-click cannot classify pairs | Web | Added a section editor and move-to-section actions to the watchlist context menu. Custom sections are normalized and persisted with the watchlist document; unassigned pairs stay in `Diğer`. |
| Replay timeframe change returns to live | Shared | Display timeframe and execution timeframe were the same variable. Replay now keeps its engine, clock and paper context; the higher display timeframe renders only candles closed by that clock. |
| Historical OI/CVD data is missing or future-dated | Shared | Public statistics and kline-flow fetch windows are bounded by the review clock, cached by that clock, filtered before render, and live depth is explicitly marked unavailable instead of substituted. |
| Surviving oscillator captions vanish after a pane remove/restore cycle | Shared | Native pane rows are reused. Pane labels are re-applied after every indicator render/removal and controls are rebound across several frames. |

### Regression coverage

- `tests/browser/alfa-desktop-streamline.browser.mjs` (new): viewport overflow,
  dark separator, watchlist width, pencil toggle, direct pair selection,
  pane hide/restore, compact value-only fold, custom watchlist section reload,
  historical timeframe view preservation, clock-bounded public studies and no
  page errors. Screenshots are saved under `.qa-reports/desktop-streamline/`.
- `tests/browser/alfa-replay.browser.mjs`: display timeframe change preserves
  replay clock and paper timezone; higher interval exposes no unfinished candle.
- `tests/alfa-public-studies.test.mjs`: bounded historical OI requests and
  unavailable live depth during replay.
- `tests/alfa-watchlist-organizer.test.mjs`: custom sections survive
  normalization without duplicate or foreign members.
- Updated stale selectors/contracts in `alfa-desk-pane-density`,
  `alfa-indicator-pane`, `alfa-workspace`, `alfa-chart-scope`,
  `alfa-open-interest`, `alfa-ux-eight` and `alfa-mobile-shell` suites.

### Verification

- New desktop streamline suite: PASS, one attempt.
- Replay suite: PASS with real Binance history, one attempt.
- Desk-pane density, indicator pane, open interest, workspace and mobile chart
  interaction suites: PASS on targeted reruns after the caption-rebind fix.
- Unit suites for public studies and watchlist organizer: PASS.
- `git diff --check`: PASS.
- Final full nightly: **35/35 PASS, fail=0, retried=0**, one attempt at
  `http://127.0.0.1:8787`, report
  `.qa-reports/all-20261127-183248`.

### Risks and limits

Watchlist documents, public-study adapters and indicator caption rebinding are
shared code, so mobile and embedded surfaces are covered by the full nightly
rather than assumed safe. No account, credential or production write was used.
Production smoke remains opt-in and was not run for this batch.
