# ALFA CHARTS · Phase 2

## Implementation

- `assets/alfa-drawings-model.mjs`: timestamp/price anchors, Fibonacci math,
  position math, document validation and transactional undo/redo.
- `assets/alfa-drawings-render.mjs`: SVG overlay limited to the chart plot.
  Pixels are derived at render time, never saved.
- `assets/alfa-drawings.mjs`: pointer/touch tools, selection, handles, management,
  settings, Fibonacci templates and chart projection. No separate market connection.
- `assets/alfa-drawings-store.mjs`: existing Supabase Auth session, account/symbol
  isolation, local write-through backup, debounced cloud writes, optimistic revisions.
- `supabase/site/007_chart_drawings.sql`: isolated table and ownership RLS policies.
  Existing journals, API functions and Phase 1 WebSocket endpoints are untouched.

## Database activation and authenticated checks

The live REST API initially returned `PGRST205` for `public.chart_drawings`.
The user subsequently applied `supabase/site/007_chart_drawings.sql` through
Supabase SQL Editor. **The table is now operational.**

1. In the existing project's Supabase SQL Editor, run
   `supabase/site/007_chart_drawings.sql` once.
2. Sign in through the existing Alfa Traders site, then open ALFA CHARTS.
   Both localStorage ("remember me") and sessionStorage sessions are supported.
3. Create BTCUSDT drawings; wait for **Hesabınıza kaydedildi**. Refresh and check.
4. Check ETHUSDT isolation, then verify in a second browser signed into the same
   account. Guest drawings intentionally do not migrate into an account.
5. With a second real account, verify it cannot select/update/delete the first
   account's rows through Supabase REST, including requests specifying another UUID.
6. Test token renewal/sign-out and simultaneous-tab revision conflicts. The adapter
   refuses conflicting overwrites and preserves the local copy. JSON export is
   available for recovery. Retry cloud save after restoring connectivity/migration.

No service-role key is delivered to the browser. Do not disable RLS.
Do not use a real user's password in scripts or logs.

Verified against the real backend using the user's manually signed-in browser:

- A test Fibonacci document was saved at revision 1 and returned after page reload.
- A fresh store with local reads disabled retrieved the same timestamp/price anchors
  from Supabase; this was not merely a localStorage restoration.
- ETHUSDT did not contain the BTCUSDT test drawing.
- Fibonacci template levels/style were saved in the cloud document.
- Anonymous reads were denied; inserting a row with a different user ID and
  transferring ownership of the owned test row both returned SQL error `42501`.
- A second store instance read revision 1; the first saved revision 2; the stale
  update was rejected and the server retained revision 2's drawing style.
- Only the known test drawing ID and test template name were removed afterward.
  The cleanup was read back from Supabase. No existing user drawings were removed.

These checks did not export credentials or store an authenticated browser profile.
The stale-write test used two stores in one browser, not two real user accounts.

## Behavior

- Two clicks create trend/ray/rectangle/Fibonacci/position/ruler drawings.
  One click creates horizontal/vertical/text. Completion returns to cursor.
- Escape cancels a draft/drag. Select a drawing to expose handles; drag its body
  to move it. Double-click or open **Çizimler / Ayarlar** for settings.
- Hidden drawings remain selectable in the object list. Locked drawings have no
  handles and cannot be edited/moved/deleted until unlocked. Copying unlocks the copy.
- Undo/redo: toolbar or Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y.
  History is separate for each account/symbol during the current page session;
  drawings/templates (not undo history) survive reload.
- Fibonacci defaults: 0, .236, .382, .5, .618, .705, .786, 1.
  0 is the second anchor, 1 is the first anchor. For 60000 → 65000,
  .382 = `65000 + (60000 - 65000) * .382 = 63090`.
  Reversal swaps the endpoint interpretation. Settings accept comma-separated
  decimal-point levels (up to 30), price visibility, color and width. Apply settings
  before saving a named template. Templates are account/symbol-scoped.
- Long/short default target is 2.5 times the stop distance. Entry, SL, TP and width
  anchors are draggable. Invalid SL/TP crossings are rejected, not silently flipped.
  Risk/gain percentages are **price distance / entry**, not account equity risk.
  Positions are drawings only; no order submission exists.
- Off-bar timestamps are interpolated between real candle times and extrapolated
  outside loaded history. Changing timeframe never rewrites stored timestamps.
  Series bar indexing stays aligned as new WebSocket candles arrive.
  LWC 5.0.9 returns zero for fractional `logicalToCoordinate` inputs, and its
  `coordinateToLogical` snaps to bars: the drawing adapter explicitly interpolates
  integer bar-center coordinates in both directions instead.
- Maximum 300 drawings, 30 templates, 100 undo steps per active document.
- No paid chart/drawing package and no TradingView iframe.

## Tests

```
node --test tests/*.test.mjs
node tests/browser/alfa-drawings.browser.mjs --playwright=<path/to/playwright/index.mjs>
```

The browser test uses a separate, ephemeral Chrome profile, real Binance market data,
real mouse/keyboard/touchscreen actions, and guest storage. It never signs in or
writes production account data. Chrome's path can be changed with `--chrome=...`,
the target with `--url=...`. Playwright is a test-only external installation, not
a production dependency.

**Verified locally:** all drawing tools; horizontal drag; trend endpoint resize;
Fibonacci .382 rendered price, endpoint/body drag, levels/reversal/color/width/
price visibility/template; long/short 2.5R and live recalculation after handle drag;
SVG wheel forwarding; native zoom/pan with unchanged anchors; timeframe/resize/
reload retention; ETH/BTC isolation and per-symbol undo stacks; hide/show, lock,
copy, delete, undo/redo keyboard shortcuts; Escape cancellation; line mode;
390px layout; real touch taps creating drawings. No uncaught page errors.

After production deployment to `https://alfa-trader.com`, the same 14 real-Chrome
guest scenarios passed against the live site, again with no uncaught page errors.
The full Node suite passed 407 tests.

**Not verified:** retrieval on a second physical device, token renewal/sign-out,
isolation between two separately signed-in real accounts, real-device pinch
gestures, fullscreen. Unit tests also cover cloud adapter failures and conflicts;
the authenticated checks above separately exercised the real backend.

Phase 3 is not included.
