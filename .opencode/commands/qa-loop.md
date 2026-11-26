---
description: Launch both QA agents and reconcile their reports
---

Launch web-qa and mobile-qa in separate worktrees against $ARGUMENTS (default http://127.0.0.1:8787). Ask each to run its owning suite with unit tests, add a regression test before any fix, and report using docs/alfa-qa-agent-playbook.md. Reconcile overlapping files, rerun scripts/alfa-qa-nightly.ps1 for shared changes, and present one consolidated report. Do not push, merge, promote, or deploy.
