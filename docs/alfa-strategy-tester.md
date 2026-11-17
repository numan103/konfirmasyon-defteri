# ALFA CHARTS — Phase 4 / Module 3

Manual/replay Strategy Tester & Performance Analytics. No strategy execution,
real orders, paid API, virtual balance or Strategy Lab.
Pre-development checkpoint: `strategy-tester-pre`.

## Data and calculations

`alfa-strategy-model.mjs` is a pure consumer of the existing Paper engine's
**current evaluated trades**, not a second execution engine. Entry/exit prices,
initial risk, gross realized R, fees and net R are not recomputed or edited.
Trade rows retain ID, strategy, replay session, symbol, timeframe, direction,
entry/exit times/prices, initial risk, gross/net R, fees, slippage, duration,
exit reason, order type and ambiguity status.

Default strategies: 0.382 Retracement, IFVG, Market Structure, Custom.
User categories and per-trade strategy overrides are supported. New orders
persist their strategy tag as metadata in the existing immutable command.

Metrics:

- Total/winning/losing/breakeven trades; wins and losses classified by **Net R**.
- Win Rate = winning trades / all included closed trades (including breakeven).
- Average Win R, Average Loss R (signed negative), Average Net R, Expectancy.
- Expectancy = Total Net R / included trades.
- Total Gross R and Total Net R.
- Profit Factor = sum of positive Net R / absolute sum of negative Net R.
  No losses and positive wins display infinity, stored as `null` plus
  `no-losses` status; empty/all-breakeven shows N/A. No serialized Infinity.
- Maximum Drawdown in R from an initial zero baseline, longest win/loss streak,
  average duration in seconds, recovery factor.
- Breakeven breaks either streak. Nonzero small results remain wins/losses.
- Numeric overflow fails explicitly rather than silently returning a result.

The curve is sorted by exit time, with Trade ID as a deterministic tie-breaker.
Every point contains cumulative Net R, peak R, current/max drawdown, recovered R
since the previous point, and whether a previous drawdown has fully recovered.
Recovery factor = Total Net R / Max Drawdown, or N/A when drawdown is zero.
Charts are **Cumulative R**, drawdown, R histogram, W/L/BE distribution and signed
strategy Net R comparison. They are never labeled as an account balance.

Comparison displays count, win rate, expectancy, profit factor, max DD and total
Net R per strategy. All filters recalculate the rows, metrics, charts and
comparison: strategy, symbol, timeframe, direction, exit date range (UTC,
inclusive bounds), exit reason and market/limit order type. No demo results.

## Scope, duplicates and rewind

Only closed TP/SL/manual results are realized. Open, pending, cancelled, expired,
invalid and unresolved ambiguous trades are excluded and counted separately.
Resolved ambiguity can be included, labeled from Paper history.

Rewind reevaluates the current Paper state; future closes disappear from the
analytics and reappear exactly once when replay advances. No historical result
snapshots are accumulated. Existing replay has a single `main` branch; this
module does **not** add branch editing/forking. Calculation calls scope an
explicit session and branch, default main, excluding other branch versions.
Same session/branch/Trade ID duplicates count once. Conflicting execution
results for an ID are excluded and reported, never arbitrarily selected.

## Journal, persistence and security

The existing Paper payload gains an optional `analytics` document:
version/revision, strategy categories, annotations and filter preferences.
No new Supabase table, cloud upload or screenshot network request.
The existing key remains
`alfa-paper:v1:<user>:<symbol>:<timeframe>:<replay-session-id>`;
the entire payload is also embedded in the replay-session save.
Legacy journals without analytics restore with defaults; original trade notes
are preserved and prefilled into the journal editor.

Annotations contain setup, rationale, mistakes, notes, screenshot, strategy,
revision and replay/wall-clock edit times. Saved/local/unsaved documents merge;
newer per-trade revisions win, same-revision divergent notes or conflicting
category IDs stop restore without deleting the source copies. This is local
persistence, **not multi-device cloud synchronization**.

Screenshots: PNG/JPEG only, input ≤2 MB, predecode dimension limits of 8192px /
16 million pixels. Canvas re-encodes to JPEG ≤1280px and ≤256 KiB per image;
≤1 MiB image bytes per replay session. Stored image headers/dimensions are also
validated. No SVG/external URL. Journal text is inserted as text, never HTML.
An async screenshot cannot save after the dialog/session/owner changes.

Existing Paper quota handling protects unsaved analytics too: warning,
in-memory recovery, JSON backup and guarded exit/unload. Successful subsequent
saves preserve the full document. Export is a backup, not a new import feature.
Owner mismatch prevents serialization/editing and clears the panel; auth-state
notification also clears it when the stored owner changes.

## Verification

- New fixed-fixture tests: **20/20 PASS** in `tests/alfa-strategy.test.mjs`.
- Existing Paper model tests: **22/22 PASS**.
- Full working-tree suite: **537 total, 536 PASS, 1 FAIL**. The existing
  `tests/mobile-ui.test.mjs:37` Access-screen literal assertion is unchanged.
  Separate `api/access.mjs`, `index.html` and Access SQL edits are excluded from
  the release, not reverted.
- Real Chrome + real Binance history: **PASS** in
  `tests/browser/alfa-strategy.browser.mjs`. Two strategy-tagged manual trades,
  long/short, comparison and filters, custom category, notes, local PNG→JPEG,
  immutable risk/fills, rewind/re-forward, save/reload/restore, quota failure and
  retry, 390px responsive layout and simulated owner isolation. **0 page errors,
  0 real order requests, 0 image uploads**. Browser prices are not synthetic.
- Existing local Paper UI acceptance: PASS (including separate ETH replay).
- Existing local 4,000-candle replay acceptance: PASS.
- Existing local drawing acceptance: **14/14 PASS**, unchanged tolerances.

## Remaining manual checks / limits

Real authenticated two-account switching/token renewal, second-device use and
physical mobile devices are not verified. Simulated owner isolation is not
claimed as an authenticated end-to-end test. Existing Paper OHLC ambiguity,
no partial-close UI, and no virtual balance remain unchanged.
Large sustained logs/playback have not been benchmarked; the panel rerenders
current results while visible. Browser storage deletion requires external
backup. No branch-management UI, automated strategies or Strategy Lab.

## Release / production verification

- Calculation/image tests commit: `16c41ae`.
- UI/integration/browser acceptance commit: `b5f34bd`.
- Isolated `git archive HEAD` release, excluding unrelated Access edits:
  **537/537 Node tests PASS**, no skipped tests.
- Production deployment: `dpl_hNdRRwMSN78zDS7no835NkBo5D85`, **READY**,
  aliased to `https://alfa-trader.com`. Published application source: `b5f34bd`.
  Entrypoint `alfa-charts.mjs?v=21`, Paper module `?v=2`, CSS `?v=8`.
- Production real Chrome acceptance repeated: Strategy Tester **PASS**,
  Paper Trading **PASS**, real Binance 4,000-candle replay **PASS**,
  drawing scenarios **14/14 PASS**. Zero page errors / real order requests.
  Strategy screenshot test also confirmed zero image upload requests.
- All browser tests used disposable guest profiles. Production user records
  and authenticated Supabase drawing rows were not modified by these tests.
- Production screenshot captured outside the repository:
  `%LOCALAPPDATA%/Temp/opencode/alfa-strategy-production.png`.

The known working-tree Access assertion remains failing; it was neither hidden
nor fixed as part of this module. Release and working-tree results differ
because the unrelated Access changes were deliberately excluded.
