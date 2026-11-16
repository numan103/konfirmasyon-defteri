# ALFA CHARTS — Paper Trading (Phase 4 / Module 2)

Replay-only simulation; no exchange client, real order endpoint, real capital,
Strategy Tester, Equity Curve or Strategy Lab.
Checkpoint: `paper-trading-pre-37d8b1d`.

## Architecture / persistence

- `assets/alfa-paper-model.mjs`: pure deterministic order/event reducer.
- `assets/alfa-paper.mjs`: trade panel, input validation, price lines, journal
  persistence and JSON export. Analysis drawings remain separate objects.
- Every command has an ID, replay clock and version. Re-evaluation uses only
  closed replay candles and commands at or before that clock.
- Rewind removes future fills/exits from derived state. Future commands are
  retained, not silently deleted; they reapply at their recorded replay time.
- Journal key:
  `alfa-paper:v1:<user>:<symbol>:<timeframe>:<replay-session-id>`.
  A journal is also embedded in the existing replay-session save payload.
- Restore checks session/symbol/timeframe/exchange/market context. It merges
  identical event IDs once; differing contents for the same ID stop restore
  rather than overwrite. LocalStorage is not cleared or migrated destructively.
- Commands auto-save both the journal and replay session. Quota errors preserve
  the in-memory draft, show a warning, permit JSON backup, guard replay exit and
  page unload. Failed drafts can be recovered on reopening the same session
  within the page. No persistence can survive browser storage deletion without
  an external backup.

## Explicit OHLC execution policies

- Market entry and requested manual exit execute on the next available candle
  open, never on the already-visible previous close.
- Buy limit: favorable lower open; sell limit: favorable higher open. Execution
  costs never worsen a limit fill past the limit. Otherwise the level must be
  reached in a subsequent candle.
- For an intrabar limit fill, OHLC cannot prove TP occurred after entry.
  TP-only touches in that fill candle are conservatively deferred; SL still
  executes. This approximation is not presented as tick-accurate execution.
- If both SL/TP occur in the candle: default SL-first. Optional Ambiguous policy
  freezes the position and requires explicit user SL/TP resolution.
- An already-open position gapping beyond SL fills at the worse opening price.
  If a new entry gaps beyond its valid SL/TP plan, it is cancelled, not given
  zero/negative initial risk or a fabricated favorable result.
- SL/TP edits take effect only from the command clock forward. Profit-lock stops
  can cross entry, but must remain on the valid side of the last known price.
- Expiration applies to pending orders, before a fill at/after expiration.
- Commission/slippage use bps; spread is an absolute quote-price width.
  Buy/sell costs are adverse; entry/exit commission is charged separately.
  Intrabar timestamps describe the source candle/confirmation, not a fabricated
  precise tick time. Fill records include quantity for future partial exits.

## R convention

Initial SL and risk per unit are frozen at actual entry fill:

    riskPerUnit = direction * (actualEntry - initialSL)
    initialRisk = quantity * riskPerUnit
    realizedR = direction * (actualExit - actualEntry) / riskPerUnit
    netR = realizedR - totalFees / initialRisk

`direction` is +1 long / -1 short. Spread and slippage are already included in
actual fill prices, so they are not subtracted a second time.
Moving SL, including into profit, does not redefine the initial 1R.
Market gaps can change actual monetary risk relative to the planned amount.
The risk-% field is informational: this module does not maintain a virtual
balance, margin/leverage, liquidation or an equity curve.

## Verification

- Paper model tests: **22/22 PASS**. Full working-tree Node suite:
  **517 total / 516 PASS / 1 FAIL**, the unrelated Access assertion below.
- Local real-Binance Paper UI acceptance passed with no page errors and
  zero real order requests. Existing replay acceptance passed; the standalone
  drawing regression run passed all 14 scenarios.
- `tests/alfa-paper.test.mjs`: market/limit long/short, favorable limits, both
  SL/TP policies, adverse gaps, fees/spread/slippage, manual close, profit-lock
  SL, frozen R, cancellation/expiration, invalid input, partial/missing candles,
  duplicate prevention, determinism, rewind, and JSON save/restore.
- `tests/browser/alfa-paper.browser.mjs`: disposable guest Chrome profile,
  real Binance history. Through actual UI: create market long/short and pending
  limit long/short, next-open execution, rewind/re-forward identical state,
  select lines, SL edit, manual close, cancel, replay save/reload/restore,
  history view, separate ETH replay, return to live. Injected storage failure
  verifies an unsaved journal is preserved and exit may be cancelled; retry
  saves the complete journal. No real order requests, no page errors.
- Exact TP/SL/limit-touch/gap amounts are verified with synthetic unit fixtures,
  not claimed to have been forced on historical production prices.
- Existing replay acceptance (4,000 real candles / drawings / MTF) and the
  14-scenario drawing browser suite remain required regressions.
- The uncommitted Access-screen array-literal assertion remains separately
  failing in the working tree; it is not suppressed or included in the release.

## Limitations / manual checks

- No lower-timeframe/tick ambiguity resolution or partial close UI.
- Real two-account sign-in/token-renewal and physical-device interactions have
  not been verified for this new panel. This is local persistence, not cloud sync.
- Very large trade logs / 50,000-candle sustained playback are not benchmarked.
- One concurrent-browser drawing run hit a projection timing assertion after
  resize; a standalone rerun passed all 14. No test was disabled or weakened.
- Browser storage quotas and user-cleared site data require external JSON backup.
