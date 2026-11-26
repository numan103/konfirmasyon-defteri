# QA agent playbook

Two background agents keep the chart UX honest:

- `web-qa` — desktop/tablet, charts, indicators, workspace, explorer, watchlist.
- `mobile-qa` — phone/landscape, touch gestures, FAB, carousel, PWA/share/alarm.

## Run manually

```text
/qa-web http://127.0.0.1:8787
/qa-mobile http://127.0.0.1:8787
/qa-loop http://127.0.0.1:8787
```

Or directly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alfa-qa-web.ps1 -Url http://127.0.0.1:8787 -Unit
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alfa-qa-mobile.ps1 -Url http://127.0.0.1:8787 -Unit
```

The optional production smoke is separate and explicit:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alfa-qa-smoke.ps1 -Url https://alfa-trader.com
```

The `egress` suite is only appended by that wrapper. A local smoke run omits it:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alfa-qa-run.ps1 -Surface smoke -Url http://127.0.0.1:8787
```

## Loop for every finding

1. Reproduce with the relevant browser suite or a new Playwright script.
2. Write a regression test that fails on the current code.
3. Fix only the owning surface. If shared code is involved, note the cross-surface risk.
4. Rerun the owning suite; then rerun the full nightly runner if shared code changed.
5. Save screenshots under `.qa-reports/` (ignored by Git).
6. Report in this format:

```text
Finding: <one sentence>
Surface: web | mobile | shared
Root cause: <one sentence>
Regression test: <file:line or suite>
Fix: <files>
Verification: <commands and PASS/FAIL>
Risk: <none | described>
```

## Guardrails

- Work in a separate worktree.
- Push, merge, promote, and deploy are permitted without prompts. Run them only when the task requires a release and report target, commit, and rollback.
- Never invent product requirements to make a test pass.
- Never delete a failing test to get green; fix the behavior or explain why the test is stale.
- No real user data or credentials.
- Production smoke is opt-in and anonymous.
