# Bar Replay — validation checkpoint

Status: completion implementation; local acceptance passed. See completion results below.

`phase4-mod1-pre` is the pre-development Git checkpoint.

## Implemented / verified

- Private full-data storage in `ReplayEngine`; consumers receive copied prefixes.
- Confirmed base candles only, UTC timeframe close boundary, deterministic steps,
  rewind/restart and missing-candle guard.
- HTF source filtering tests at the exact 4H close boundary.
- Historical live updates no longer truncate loaded history to 1000 candles.
- Pending older-history responses are ignored after generation/symbol changes.
- Reused IANA formatters remove the severe repeated formatter allocation cost.

## Real Chrome / real Binance run

`tests/browser/alfa-replay.browser.mjs`:

- BTCUSDT 15M, 4,000 candles through three older-history API requests.
- Chronological order and duplicate timestamp checks.
- Future candles hidden; exact next/previous step.
- Isolated non-cloud drawing context.
- Fibonacci and Long Position created with mouse interactions.
- Play/pause, speed selection, local save payload, return to live data loading.
- No uncaught page errors.

Existing `alfa-drawings.browser.mjs`: 14 guest scenarios passed, including
Fibonacci, position handles, timestamp retention, timeframe/symbol changes,
zoom/pan, resize and emulated touch.

Node suite at this checkpoint: **486 tests, 485 PASS, 1 FAIL**.
The failure remains `mobile-ui.test.mjs:37`: Access screen no longer contains
the old portfolio-description array literal. It has not been suppressed.

## Original checkpoint limitations (superseded by completion work below)

- Loading saved sessions (save is implemented, restore is not).
- Picking a replay start candle directly on the chart.
- Fetching subsequent replay blocks and bounded memory policy.
- HTF bounded-query integration needs real browser boundary/rewind tests.
- Session Levels still inherit earlier accuracy limitations; passing existing
  tests does not establish exact NYMO / previous-period correctness.
- Event-specific BOS/CHoCH/FVG lookahead regression assertions in the browser.
- Go-to-date warm-up and live/history-gap acceptance.
- Actual authenticated cloud/account-change interactions during replay.
- 50,000-candle performance measurements.

No production deployment for this checkpoint. No database migration or live
user-drawing data modification. Paper Trading / Strategy Tester not started.

## Completion implementation

- Reuses `ReplayEngine`; its dataset remains private. Save includes exact data
  start, replay start/current candle, exchange/market, symbol/timeframe, session
  ID, speed, drawing document and indicator configuration.
- Restore re-fetches every saved prefix candle in sequential <=1000-row pages.
  A missing saved candle, hole or warm-up seed causes an explicit failure.
  It does not resume at an approximate replacement candle.
- Start modal supports UTC date/time, selecting a real plotted candle, and
  saved-session selection. The selected candle is visible **at its close**.
- Start loads at least 300 warm-up bars, or three times the largest configured
  indicator period (up to 5000); unavailable history fails rather than fabricating
  indicator values. Exact EMA200 continuity is tested across restore.
- At the end of a block, playback pauses and fetches the next historical page.
  Appended data remains private until stepped. Missing candles/API failures halt
  advancement. At the latest closed candle, Stop returns to live mode.
- MTF requests have `endTime <= replayClock - 1ms`; a second calculation-layer
  filter requires `sourceOpen + sourceDuration <= replayClock`.
  Request generations and aborts prevent later-clock responses surviving rewind.
- Session Levels has a strict replay calculation path: exact opens, complete
  previous periods, and session H/L only from known closed candles.
  Incomplete/non-aligned source coverage hides the level. This is intentionally
  not a claim that missing history has been recovered from approximate OHLC.
- Live transport is closed during replay and reconnected on exit. Replay drawing
  context is non-cloud and separate from the preserved live drawing state.
- Replay block memory limit: 50,000 candles (explicit stop, no silent truncation).

## Completion verification

`tests/alfa-replay.test.mjs`: 17 tests, all passed.

Includes determinism, copied-prefix isolation, exact save/restore, pagination,
missing candles, atomic append, HTF boundaries, FVG/IFVG inversion on confirmed
source candles, positive BOS/CHoCH/protected-break fixtures at 1H/4H, rewind,
US DST transition dates, strict previous-week/session levels, EMA200 warm-up.
Analytical fixtures are synthetic test data; browser market data is real Binance.

`tests/browser/alfa-replay.browser.mjs`: real Chrome / real Binance BTCUSDT 15M:
4,000 candles, chart candle selection, future hiding, next/previous, subsequent
API block, EMA200 settings through UI, Fibonacci/Long drawings, play/pause/speed,
save, page reload, restore exact timestamp/drawings/EMA200/speed, bounded 1H+4H
data, UTC Go To Date with warm-up, Stop and live reconnect. No page errors.

Existing drawing suite: 14 scenarios passed (guest persistence, mouse, emulated
touch, zoom/pan, timeframe/symbol changes, Fibonacci, Long/Short).

Full working-tree Node suite: 495 tests, 494 PASS / 1 FAIL. The outstanding
Access-screen assertion above remains unchanged and is reported separately.

## Limits / not claimed verified

- Real authenticated account-switch / token-renewal integration during replay,
  second physical device, real touchscreen/pinch/fullscreen: manual verification.
- 50,000-candle sustained performance has not been benchmarked.
- Live production quotes can be unavailable when Binance/network is unavailable;
  API failure does not synthesize missing replay candles.
- Date/time is explicitly UTC. Non-aligned input selects its containing candle
  and displays the selected opening timestamp.
- No Paper Trading, Strategy Tester, exchange order calls, paid API or database
  migration was introduced.
