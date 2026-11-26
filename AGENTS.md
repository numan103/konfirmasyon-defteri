# Alfa Charts project rules

This repository is a static production site plus a large browser-test harness. Treat every change as user-facing and verify it before proposing it.

## Non-negotiable rules

1. **Anonymous only.** Never use real user accounts, real order data, production writes, or credentials in tests.
2. **Release actions are permitted.** The user granted all tool permissions, including `git push`, merge, and `wrangler pages deploy`. Do not release as part of a routine QA loop unless the task requires it, and always report the exact target, commit, and rollback deployment.
3. **Test first.** For every bug found, add or update a deterministic regression test before changing product code.
4. **One surface at a time.** Web work owns desktop/tablet behavior; mobile work owns phone/landscape/touch behavior. If a fix touches shared code, call it out in the report instead of silently changing the other surface.
5. **Use isolated worktrees** for parallel web/mobile agents. Never edit the same file from two agent sessions at once.
6. **Assert state, not screenshots alone.** Screenshots are evidence; DOM/state assertions are the contract.
7. **Keep release-readiness status honest.** `docs/alfa-charts-release-readiness.md` stays `BLOCKED / NO-GO` unless the user explicitly changes that gate.

## QA entrypoints

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alfa-qa-web.ps1 -Url http://127.0.0.1:8787 -Unit
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alfa-qa-mobile.ps1 -Url http://127.0.0.1:8787 -Unit
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alfa-qa-nightly.ps1 -Url http://127.0.0.1:8787
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alfa-qa-smoke.ps1 -Url https://alfa-trader.com
```

Set `ALFA_PLAYWRIGHT` when Playwright is not installed locally. Do not run the production smoke suite automatically; it is opt-in.

Detailed invariants and known traps live in `docs/alfa-qa-invariants.md`. The operating loop is in `docs/alfa-qa-agent-playbook.md`.

## Definition of done

A change is done only when:

- the relevant QA surface passes with no retries,
- unit tests pass when code changed,
- a regression test covers the found bug,
- the final report lists files changed, tests run, and any risk,
- the working tree is left clean of temporary reports (`.qa-reports/` is ignored),
- any push/merge/deploy was reported with target, commit, and rollback.
