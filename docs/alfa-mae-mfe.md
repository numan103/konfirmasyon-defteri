# ALFA CHARTS — Phase 5 / Module 1: MAE & MFE

Checkpoint: `mae-mfe-pre`. Entry point:
**Replay → Paper Trading → Strategy Lab → MAE/MFE analizini aç**.
No automated execution, optimizer, paid API, new Supabase table or cloud upload.
Existing Paper, Replay, Tester and Lab arithmetic/execution are unchanged.

## Calculation and conventions

`alfa-excursion-model.mjs` is a pure consumer of original Paper events and actual
closed OHLC. It reproduces each original closed trade with `PaperTradingEngine`
before measuring it. Prices, initial risk, realized R, fees and fills must match.

- Long: MFE = max(0, active high − actual entry);
  MAE = max(0, actual entry − active low).
- Short: MFE = max(0, actual entry − active low);
  MAE = max(0, active high − actual entry).
- Price distances / actual entry × 100 give percentages.
- Price distances / **frozen initial risk per unit** give R.
- Actual entry is included as a zero baseline, so excursions are nonnegative.
- These are market-price excursions relative to an execution price, not Net R.
  Fees are not subtracted from OHLC, and exit slippage is not invented as a market
  price. Gross and Net R remain the original engine values.

Every metric has **lower/upper price, percent and R**, plus its own `exact` flag.
The overall result is exact only when both intervals collapse. No midpoint or
full-boundary-candle extremum is passed off as a measured excursion.

## Active-window and boundary correctness

The existing entry fill stores its source candle and open/intrabar precision.
An isolated engine evaluation at the recorded exit clock distinguishes an
intrabar-confirmed exit from a next-open exit. No execution model change or
fabricated tick timestamp is needed.

- Candles before the entry candle and after the exit are never measured.
- A market/favorable-open limit entry has a known start.
- An intrabar limit entry has unknown ordering: the full entry candle is only a
  possible envelope; its high/low are not automatically active extrema.
- Fully active interior candles contribute their actual high/low.
- A manual/gap next-open exit contributes **only its open**, never that candle's
  later high/low/close.
- For an intrabar exit, guaranteed points include the active open (when known)
  and exit reference. The close may be after exit and is not used.
- Unknown boundary envelopes are clipped to the first-exit stop/target levels,
  conditional on the original Paper policy (including conservative SL-first).
  The special intrabar-limit TP deferral is retained.
- Whole active candles or guaranteed exit levels can establish an exact metric
  even while the other metric remains bounded.
- Unresolved trades are excluded. Explicitly resolved OHLC ambiguity has no
  reliable active exit boundary; this release produces no excursion for it.
- Missing candles, holes, mismatched original execution or wrong scope produce
  no result, never a fabricated zero. Rewind cannot reconstruct an unconfirmed
  historical close early.

These bounds are conditional on the simulator's first-exit assumptions, not
proof of the exchange's unknown tick path.

## Optional lower-timeframe refinement

The UI can request **only boundary candles** through the existing free Binance
history client: 5m→1m, 15m→1m, 30m→5m, 1h→5m, 4h→15m, 1d→1h, 1w→4h.
1m has no supported finer feed. Exact primary measurements need no extra fetch.

Lower candles must tile a complete parent interval, be closed at/before the
current replay clock, match symbol and aggregate to the parent OHLC. First-touch
entry/exit subcandles narrow the unknown window; later subcandles are excluded.
The remaining subcandle still has unknown intrabar order.

If lower data demonstrates a sequence/gap incompatible with the original
simulated exit, the row is marked `boundary-conflict` and **no measurement**
is produced in lower mode. It does not silently change fills or choose an
optimistic path. Missing/malformed/nonmatching lower data leaves the original
primary bounds with a warning; it does not create precision.

Limits: 200 active selected trades/request, 40 unique boundary requests,
64 in-memory cached windows. No silent cohort truncation. Requests are bounded
by the replay clock, abort on invalidation/owner change, and never fetch future
prices. Cache is cleared on session stop. Sustained large histories are not
benchmarked.

## Lab analyses / visuals

The selected closed rows come from **the existing Lab filters**, including
strategy, session, HTF bias, direction, date, symbol and timeframe/provenance.
There is no separate conflicting filter or financial calculator.

- MAE and MFE by strategy, MAE by winning/losing/breakeven (original Net R class).
- MFE by trading session and MAE by HTF bias.
- MAE distribution, MFE distribution, MAE/MFE scatter and MFE/Gross Realized R.
- Strategy comparison table and interval charts.
- Initial risk, first 1R distance (price/%), MAE/MFE (price/%/R), realized R,
  exit reason, quality and source warnings per trade.
- Stop Distance Analysis: MAE / frozen stop distance × 100.
- Missed Profit: max(0, MFE R − max(Gross Realized R, 0)), as an interval.
  This is hindsight price information, not achievable profit or an optimal stop.

Histograms include **only exact values for the respective metric**, with sample
counts. Scatter plots use green points for exact data and orange rectangles/
lines for uncertainty, never midpoint estimates. Group averages are averages of
lower/upper bounds; measured/selected/exact/bounded counts remain visible.
Different completeness subsets and small samples are not evidence of success.

## Persistence / scope

The enable/precision preferences use the existing Lab filter document and
Paper/Replay persistence. Results are derived, not saved as stale trade fields.
After reload they are recomputed from restored original events/OHLC.
Active state and current filters replace previous calculations on every update.
Owner mismatch clears results/cache and invalidates in-flight work.

Archived Lab snapshots **do not contain OHLC**. They retain their financial
results but have unavailable MAE/MFE until that replay is opened. No current
symbol/session's path is borrowed. Measurement keys include session, symbol,
timeframe, branch and Trade ID; duplicates are counted once and conflicting
measurements are excluded. Existing main-branch scope remains unchanged.

## Tests

- **25/25** new fixed-fixture tests:
  long/short price/%/R, before-entry/after-exit exclusion, limit entry, favorable
  open fill, TP/SL boundary and collision clipping, adverse/target gaps, manual
  exit, frozen risk after SL edit, costs, unresolved/resolved ambiguity, missing
  OHLC, wrong scope, rewind, JSON restore, lower refinement/mismatch/conflict,
  duplicate/conflicting measurements, cross-session ID isolation, Lab strategy
  filtering/cohorts and empty data.
- Full working tree: **591 total / 590 PASS / 1 FAIL**. Existing
  `tests/mobile-ui.test.mjs:37` Access literal assertion remains failing.
  Separate `api/access.mjs`, `index.html` and Access SQL edits are preserved,
  not released or reverted.
- Real Chrome acceptance (`tests/browser/alfa-excursions.browser.mjs`):
  two manual long/short trades (fib/IFVG), independent raw active-OHLC checks,
  nine visuals, immutable trading state, strategy filters, rewind, restore,
  390px layout, missing archive OHLC and simulated owner isolation: PASS.
- An additional real historical TP boundary test is deliberately **post-hoc**:
  the test selects an already-visible closed candle, rewinds and places a
  manually entered tight target. This is not presented as strategy performance.
  Primary uncertainty rectangles and real 1m fetch/refinement are verified;
  requests end strictly before the current replay clock. No prices are mocked.
- No page errors or real order requests in the browser acceptance.
- Existing local Lab, Tester, Paper, 4,000-candle Replay browser suites and all
  **14 drawing scenarios PASS**.

## Limits / manual checks

No tick precision, inferred future profitability, automatic stops or optimizer.
Lower feed can disagree with a conservative parent-candle trade; those rows
have no lower-mode measurement rather than rewritten execution.
No archived excursion snapshot storage or multi-device cloud sync. Existing
Paper OHLC execution limitations remain. Authenticated two-account/token-renewal
and physical-device testing remain unverified; simulated owner checks are not
claimed as authenticated acceptance.

Production results are recorded after the clean release verification.
