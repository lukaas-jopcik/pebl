# Changelog: verified-ai-task-receipt

## 1.1.0 — Status update (implementation complete, unvalidated)

All 10 IMPL phases (47 tasks) implemented: Claude Code + Codex adapters, local event log + SQLite index, deterministic classifier, the full Verification Join (files-touched, git-watch, test detection, check runner, revert recheck), receipt rendering + insight gate, the complete CLI surface (`setup`/`hook`/`receipt`/`recheck`/`rebuild-index`/`doctor`/`uninstall`/`eval`), and cross-platform scheduler support. 210+ tests, all real integration tests against real git repos/hook payloads, no mocked git calls. Verified end-to-end multiple times against the built binary, not just unit tests.

Status set to "Built — pending real-world validation" rather than "Implemented": the actual product claim (Verification Join precision, SM-1) is unvalidated — there's no historical usage to evaluate against yet, and the Phase 5→6 go/no-go gate was consequently never honored (documented explicitly in IMPL §6, not silently skipped). `npm publish` is separately blocked on the unscoped name `pebl` already being taken on the registry.

## 1.1.0 — Draft

Resolved all three open questions and the forking dependency spike:
- **Forking `o11y-dev/opentelemetry-hooks`: rejected.** Verified via `gh api` that it's ~90% Python distributed as a subprocess CLI, not an importable library — incompatible with the Node/TS, zero-Python-dependency goal. Adopting its event taxonomy/hook-mapping table as a reference schema instead of its code.
- **OQ-1 (storage)**: append-only JSONL log as source of truth + `better-sqlite3` as a rebuildable local index.
- **OQ-2 (windows)**: commit-matching window = next SessionStart or 30min idle, capped at 2h; revert re-check at 24h and 5 days.
- **OQ-3 (test detection)**: CI workflow file → per-language convention → one-time cached user prompt, in that order.

## 1.0.0 — Draft

Initial PRD. Formalizes the MVP wedge chosen after competitive research (see `Pebl_Vault/99-Research/Competitive-Research-and-Buildability-Verdict.md`): a Claude Code + Codex CLI receipt whose verification status is backed by a git commit → test/build/CI → revert-check join, instead of the broader original Canonical PRD scope (most of which competitors already ship for free).

Stack decisions locked for v1: Node.js/TypeScript, macOS + Linux + Windows support, npm/`npx` distribution, fully local with no account or cloud path.
