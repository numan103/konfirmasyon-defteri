# Bar Replay — validation checkpoint

Status: **in progress, not production-ready**.

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

## Not complete / not release acceptance

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
