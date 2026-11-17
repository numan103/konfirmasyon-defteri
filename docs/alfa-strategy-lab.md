# ALFA Strategy Lab — Phase 4 / Module 4

Manual research only. No automatic trading, optimizer, exchange order client,
paid API or virtual balance. Checkpoint: `strategy-lab-pre`.

## Integration

Replay → Paper Trading → **Strategy Lab**, beside Strategy Tester.
The original Replay, Paper execution and Strategy Tester calculation engines
are not rewritten. Lab calls `analyzeTrades` for every summary, cohort,
cumulative R, drawdown and scenario summary; RR variants run isolated copies of
`PaperTradingEngine`. Actual orders, fills, fees, initial risk and results are
never edited by research.

New modules:

- `alfa-lab-model.mjs`: templates, versioned observations, provenance, filters,
  cohorts and sample-size descriptions.
- `alfa-lab.mjs`: research tab, tag/template editors and cancellable scenarios.
- `alfa-lab-store.mjs`: scoped saved research snapshots in existing payloads.
- `alfa-lab-scenarios.mjs`: price-path-based RR variants using Paper execution.

## Templates / tags

Default templates:

- **0.382 Retracement**: Swing Type, MSB, Displacement, HTF Confirmation,
  Entry 0.382, Stop Location, RR Target.
- **IFVG**: Bullish/Bearish, FVG Timeframe, Invalidation Type, Retest,
  HTF Context, Entry Type, RR Target.
- **Custom Strategy** plus user-created named strategies with up to 30 custom
  text fields. Setup categories and condition labels accept user-defined text.

Every pending/open/closed Paper trade can be tagged after creation, including
legacy trades. Common fields: Strategy, Setup Type, Session, HTF Bias, Market
Structure, Displacement, Entry Model, Stop Model, Target Model, RR Target,
Confidence and Notes. Template-specific fields are additional.
Tags are manual descriptions, not automatically verified indicator signals.
RR Target labels are not a source of execution results.

Each edit appends a revision containing replay clock, wall-clock save time,
maximum replay clock already observed, strategy, field values and provenance.
Existing financial commands and original Paper/Tester notes/screenshots remain.
Strategy edits share the existing Tester strategy tag. Subsequent strategy
edits from the Tester journal also append a timed Lab revision.

**Pre-entry** requires a newly instrumented pending order, evidence recorded
before entry, no already-observed future clock, and reliable local watermark
storage. Closed/open trades, legacy orders lacking evidence, edits after rewind
from future data, or uncertain storage are **retrospective**. New order commands
only gain `labOrigin` metadata; execution is unchanged.

The owner/symbol/timeframe/session-scoped `:lab-watermark` stores a tiny
high-water clock as replay advances, so reload/rewind cannot reset observation
history. The high-water value also travels in the Lab document. Storage failure
conservatively disables new pre-entry claims. This records *when input was
saved*, not proof that a human never knew future prices.

Future-clock tag revisions are unavailable at an earlier replay clock.
“Only pre-entry records” selects the preserved pre-entry version, not the later
retrospective relabel. History remains visible in the trade editor.

## Filters, cohorts and visuals

Filters: Strategy, Symbol, Timeframe, inclusive UTC exit date range, Replay
Session, Direction, trading Session, HTF Bias, Setup Type, Displacement, Entry
Model, RR Target and provenance. Research scope defaults to **active session**.

Opt-in **saved sessions** combines this owner's saved Paper/Replay research
snapshots, enabling BTC/ETH and 15m/1h comparisons without mixing users.
Snapshots are derived from engine evaluation at the last saved replay clock,
not freshly reevaluated histories. The active evaluated state always replaces
all saved copies of that session, even after rewind. The latest *save*, not the
largest replay clock, is chosen; conflicting equal-save snapshots are excluded.
Legacy sessions without a snapshot are omitted with an explanation: reopen and
save them. No historical outcome is fabricated.

Comparisons: strategy, Session, HTF Bias, Displacement, Long/Short, Symbol,
Timeframe, Setup Type, Entry Model, RR Target. Each cohort displays:
count, Win Rate, Average Win/Loss R, Expectancy, Profit Factor, Total Net R,
Maximum Drawdown, Longest Losing Streak and sample-size warning.

Charts: Strategy Comparison, Expectancy by Session, Expectancy by HTF Bias,
Win Rate by Setup Type, Cumulative Net R, Drawdown and R Distribution.
Counts and all arithmetic come from recorded realized results. Open/unresolved
ambiguous trades are excluded. Source-level exclusions are reported separately
from filtered cohort counts. Duplicate and branch rules reuse Tester.

Sample descriptions: <30 low, 30–99 limited, 100+ stronger. These are heuristics,
not significance thresholds or guarantees. Small cohorts, retrospective labels,
multiple comparisons, selection bias and non-causality are explicitly warned.

## RR scenarios: what they mean

User-triggered **2R / 2.5R / 3R**, separately labeled **HYPOTHETICAL**:

1. Restrict to selected resolved closed trades in the active replay scope.
2. Require continuous actual closed OHLC covering original order placement
   through the current replay clock. Never fetch/read future prices.
3. Reproduce the original trade from its create/edit/cancel/close/resolve
   journal. Entry, exit, original risk and financial result must match.
4. Set a hypothetical target from **actual entry and frozen initial risk per
   unit**. Replace TP only in isolated cloned create/edit commands.
5. Preserve original order type, entry, quantity, costs, stop edits and manual
   close requests. Use the existing conservative execution policy; explicit
   ambiguity-resolution commands are unnecessary in the conservative variant.
6. Validate the same entry/frozen risk. Use Paper's actual gap, limit,
   intrabar-limit TP deferral, spread/slippage and fee behavior.

No result is produced for missing original commands/OHLC, holes, missing
prefix/end coverage, nonreproducible entry, invalid/non-positive target,
unsupported state or a scenario still open at the known horizon.
Final realized R is **never** used to infer whether another target was hit.
Example tested: actual +2.5R, then observed reversal → hypothetical 3R loses 1R.

Results show completed/selected counts and missing/open/unsupported counts for
each target. Unequal completion subsets must not be ranked as a “best target.”
Archived sessions do not store candle paths: reopen that replay to run scenarios.
No scenario is saved as an actual trade or included in actual performance.
Changing clock, filters, owner or metadata invalidates the result; computation
is cancellable. At most 200 selected active trades/request; larger cohorts must
be filtered, not silently truncated.

Original manual close commands are intentionally retained. A trader who
manually exited early can therefore get the same result for all RR targets.
These are fixed-command counterfactuals, not a simulated alternate human
decision process and not tick-accurate execution.

## Persistence / safety

Existing Paper payload adds optional `lab` and `labSnapshot` documents, also
embedded in the existing Replay save. No new Supabase tables or cloud uploads.
Metadata merge preserves per-trade revision histories and custom templates;
divergent same-revision observations/template IDs fail safely without deleting
copies. Saved-session lookup checks key/context, original create IDs, scope and
exit clocks. Owner mismatch blocks edits/serialization and clears Lab.

Paper's unsaved-map, JSON backup, guarded exit and unload protections include
Lab metadata and snapshots. The independent high-water key is small and shares
the exact existing Paper owner/symbol/timeframe/session prefix. Local browser
storage is not second-device sync; clearing it requires external backup.

## Verification

- **29/29 new Node tests PASS**, with fixed OHLC fixtures and exact R values.
- Paper + Tester + Lab targeted calculations: **71/71 PASS**.
- Full working tree: **566 total / 565 PASS / 1 FAIL**. Existing
  `tests/mobile-ui.test.mjs:37` Access-screen array-literal assertion remains
  failing. Unrelated `api/access.mjs`, `index.html` and Access SQL changes are
  preserved and excluded from the release.
- `tests/browser/alfa-lab.browser.mjs`: real Chrome + real Binance BTC/15m and
  ETH/1h; three manually created/closed trades, fib/IFVG tags, pending pre-entry
  and closed retrospective labels, rewind high-water proof, user template,
  shared Tester journal tag edits, condition filters/comparisons, immutable
  prices/risk, exact Tester metric consistency, real-OHLC RR variants retaining
  manual close, save/reload, saved scopes/active rewind override, quota failure
  and retry, simulated owner guard and 390px layout: **PASS**.
- Local existing Strategy Tester, Paper and 4,000-candle Replay browser suites:
  **PASS**. Drawing scenarios: **14/14 PASS**, original tolerances unchanged.
- No page errors, real order requests or image uploads in Lab acceptance.
- Initial browser fixture used a short with a stop 100% above entry, making
  2R/3R target prices non-positive. The engine correctly refused scenarios;
  the test's “all complete” assertion failed. Test order risk was corrected to
  10%, and a permanent unit test now asserts invalid target refusal. No
  execution policy or production assertion was weakened.

## Remaining limits

Authenticated two-account/token-renewal tests, physical devices and second
devices remain manual/unverified; simulated owner guards are labeled as such.
Large sustained histories/cohorts are not benchmarked. Saved-source scan is
bounded to 500 records and warns on overflow. A per-trade tag history is bounded
to 100 revisions; no destructive truncation. Bootstrap confidence intervals and
out-of-sample split tooling are optional and **not implemented** in this release.
No automatic trading or optimization algorithms.

Production status is recorded after release verification below.
