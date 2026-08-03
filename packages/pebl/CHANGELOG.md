# Changelog

## 0.1.0 — Unreleased

Initial implementation of the Verified AI Task Receipt wedge (see `docs/prd/verified-ai-task-receipt/`):

- Claude Code and Codex CLI adapters (hooks + JSONL rollout tail-reading for Codex).
- Local-only event log (JSONL) + rebuildable SQLite index.
- Deterministic prompt-importance classifier (no LLM call).
- The Verification Join: files-touched aggregation, git commit matching window, test-command detection, check runner, 24h/5d revert recheck — all with real disposable-git-repo integration tests.
- Receipt field builder, terminal renderer, and an insight confidence gate.
- CLI surface: `setup`, `hook`, `receipt`, `recheck`, `rebuild-index`, `doctor`, `uninstall`, `eval`.
- Cross-platform scheduler (cron / Windows Task Scheduler), opt-in only, behind an injectable command runner so tests never touch a real system scheduler.

**Not yet done**: real-world precision validation (SM-1) — there is no historical usage to evaluate against yet. `pebl eval` produces the data; a human has to judge it.

**Resolved (2026-08-03)**: the unscoped npm name `pebl` was already taken by an unrelated package (`jin.pebl <jin@pebl.io>`, 15 published versions; confirmed via `npm view pebl`). Renamed the npm package to `bepebl` (confirmed available via `npm view bepebl` → 404), matching the project's `bepebl.com` domain. The CLI command itself is unchanged — it's still `pebl`, set via the `bin` field independently of the package name, so every doc and example in this repo (`pebl setup`, `pebl receipt`, ...) stays correct. Install with `npm install -g bepebl`.
