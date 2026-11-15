# Free-plan Supabase egress reduction

## Confirmed diagnosis

The organization Usage dashboard showed a 5 GB uncached-egress allowance and
7.18 GB consumed for 27 Oct–27 Nov 2026. The grace-period warning names
14 Dec 2026 as the possible restriction date. Usage refreshes hourly.
98.82% of the chart's outgoing bytes were REST, not Realtime or object storage.

Read-only SQL diagnostics (no personal document bodies exported):

| Source | JSON bytes |
| --- | ---: |
| `edu_shared.alfa_trading` | 1,832,875 |
| `alfanews`, two documents | 1,558,415 |
| `journals`, all 25 records | 1,290,423 |
| analytics, 374 encrypted sessions | 293,580 |

These are document sizes, not attribution of every historical billed byte.
`pg_stat_statements` also showed frequent shared-document reads; its counters
are cumulative and must not be interpreted as billing-period-specific counts.

## Changes

- `008_egress_projections.sql` creates three additive `security_invoker` views.
  Existing RLS applies. No data is deleted, moved, or made writable.
  The migration was applied through the signed-in Supabase SQL Editor.
- Landing metadata is projected inside PostgreSQL, excluding embedded images,
  comments, emails and trading levels. The measured projected REST response was
  6,854 bytes versus about 1.83 MB for the source JSON (about 99.6% less raw JSON
  for this read, NOT a promised percentage reduction of the entire bill).
- Each landing/social picture request reads one original/blur image through its
  scoped view, rather than downloading the entire trading-feed document.
  Existing publication/time limits and raster-image checks remain enforced.
- Public feed source reads use a bounded, process-local revision cache. Small
  `updated_at` probes detect other-instance writes every 10 seconds; a five-minute
  hard expiry bounds staleness if a legacy writer fails to update timestamps.
  Mutations always read fresh source data, write a new timestamp, and invalidate.
  Unauthorized mutations are rejected before the large source read.
- News/Mentoring are lazy-loaded only when opened. Their browser memory cache is
  account-scoped, single-flight, and revision-validated; saves invalidate it.
  In the manually signed-in browser: home made zero `alfanews` requests; opening
  each section and immediately reopening made one full request, not two.
- Home-preview requests coalesce and also cache legitimate empty results.
  Failure does not fall back to downloading the large feed or claim no posts.
- Analytics reports retain the fresh admin check and `Cache-Control: no-store`.
  Warm instances initially read a bounded window, then only changed sessions,
  with one-second timestamp overlap, five-minute full refresh, bounded memory,
  and reset after the existing explicit prune action. Failed reads are errors,
  not stale-success reports. Session encryption at rest is unchanged.
- Analytics display-only member-name/email mapping is cached for five minutes.
  JWT validation and premium/access checks are NOT cached by this change.
- Visible analytics heartbeats/polling are 60 seconds. Hidden-tab periodic
  analytics, presence and chat work stops; final pagehide/visibility beacons
  remain enabled. The closed admin-chat badge refresh is 30 seconds and does
  not duplicate the open panel's existing five-second poll.
- No new Vercel API function, paid service, upgrade, or extra production dependency.
  ALFA CHARTS's Binance REST/WebSocket flow remains direct and unchanged.

## Tests and monitoring

- 420 Node tests passed, including cache races/invalidation, unchanged vs changed
  revisions, owner isolation, lazy loading, incremental report correctness,
  denied admin access, no error-triggered full-feed download, and inline syntax.
- Before deployment, the new projected public channel content exactly matched
  the existing live endpoint's trades/biases/results, including picture URLs.
- Live authenticated News/Mentoring read/reopen behavior was checked on localhost
  with real Supabase data without editing any user content.
- After production deployment, the anonymous browser smoke test passed: landing
  and a real preview image returned 200, home made no full-feed/News/Mentoring
  downloads, private Pano/Analytics endpoints still returned 401, and no uncaught
  browser errors occurred. `tests/browser/egress.browser.mjs` reproduces this.
- Two real authenticated production analytics GETs returned 200 and the same
  complete 128-session report with `Cache-Control: no-store`. No emails or session
  details were exported into diagnostic output. Admin authorization remains fresh.
- All 14 ALFA CHARTS real-Chrome production regression scenarios also passed.
- Keep checking the organization Usage dashboard daily after deployment.
  For a 30-day period, 5 GB averages roughly 167 MB/day; use a lower target to
  leave headroom. Compare a full post-release day, not a partial deployment day.
- On 27 Nov confirm the new cycle begins and inspect the new cycle's daily REST
  egress before 14 Dec. Optimizations do not refund consumed egress, remove the
  prior warning immediately, or guarantee that any traffic level fits Free.
- If projected traffic still exceeds the free allowance, measure and reduce the
  remaining hot endpoints; do not silently upgrade or delete content.

Cold serverless instances cannot share process-local caches; the database-side
projection still saves bytes on cold starts. External record deletions can remain
in the incremental report until its five-minute full refresh; the explicit prune
path clears it immediately.
