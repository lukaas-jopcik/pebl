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

**Blocked**: `npm publish` — the unscoped name `pebl` is already taken on the npm registry by an unrelated package (`jin.pebl <jin@pebl.io>`, 15 published versions, unrelated to this project; confirmed via `npm view pebl` on 2026-08-03). Publishing under this name is not possible as-is. This needs an explicit decision from the project owner — options include a scoped package (`@pebl/cli` or similar) or a different unscoped name (e.g. `bepebl-cli`, matching the project's `bepebl.com` domain) — not something to resolve unilaterally, since it affects the CLI command name every doc and user-facing string in this repo currently assumes.
