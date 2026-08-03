# PRD: Verified AI Task Receipt

**Feature**: `verified-ai-task-receipt`
**Version**: 1.1.0
**Status**: Built — pending real-world validation. Every functional requirement (FR-1–FR-16) is implemented and covered by real integration tests (real disposable git repos, real hook payloads, real test runs — not mocked). Deliberately **not** marked "Implemented" in the usual sense: SM-1 (Verification Join precision on 200 real sessions) has not run and cannot yet, because no historical usage exists in the implementation environment (see [IMPL §6](../../impl/verified-ai-task-receipt/IMPL.md#6-gate-before-phase-6-explicit-gono-go)). The npm publish naming collision (unscoped `pebl` taken) is resolved — published as `bepebl` (CLI command stays `pebl`); see `packages/pebl/CHANGELOG.md`.
**Owner**: Lukas Jopcik
**Supersedes (for v1 shipping scope only)**: [Canonical PRD §5 MVP scope](../../01-product/canonical-prd.md#5-mvp-scope)
**Detailed spec**: [MVP Wedge: Verified AI Task Receipt](../../01-product/mvp-wedge-verified-receipt.md)

## 1. Summary

Ship a local-only, open-source CLI companion that watches Claude Code and Codex CLI sessions and produces, after each meaningful task, an **AI Task Receipt** whose headline claim — did this actually work — is backed by real evidence (a git commit, a test/build result, and a revert check), not inferred from token counts or asserted from a model's own self-report.

This is the deliberately narrowed MVP wedge chosen after competitive research (`Pebl_Vault/99-Research/Competitive-Research-and-Buildability-Verdict.md`) found that every other piece of the original Canonical PRD scope — local event collection, cost/token receipts, daily rollups, prompt-quality coaching — is already shipped for free by at least one competitor (vibe-log, Promptster Solo, `o11y-dev/opentelemetry-hooks`, three OSS prompt-coach skills). The **Verification Join** (session → files → commit → test/CI result → revert check) is the one piece nobody has built.

## 2. Problem

Developers using Claude Code / Codex CLI daily cannot currently answer, without manually checking: *"did that task I just ran actually hold up?"* Existing tools (native dashboards, ccusage, sniffly, vibe-log) report what happened *inside* the session (tokens, tool calls, retries) or what happened at the delivery level (DORA/SEI platforms track commits and PRs org-wide) — but nothing joins a specific agent session to its specific, verified real-world outcome. 30% of developers report little or no trust in AI-generated code (DORA 2025), and independent research found >15% of AI-authored commits introduce at least one quality issue — the distrust is well-founded and currently unaddressed by any per-task feedback loop.

## 3. Goals

- G1: After a meaningful Claude Code or Codex CLI task, render a receipt whose verification status is evidence-backed, not asserted.
- G2: Never fabricate a pass/fail. If evidence is insufficient, the receipt says "not yet verified" explicitly.
- G3: Zero setup friction beyond installing the CLI and (for hooks that need it) approving hook registration once.
- G4: 100% local. No account, no network call, no telemetry beyond what the user explicitly opts into later.
- G5: Reuse existing OSS event-capture work (fork/wrap `o11y-dev/opentelemetry-hooks`) instead of writing a novel collector.

## 4. Non-goals (v1)

- Gemini CLI support (weakest telemetry surface — OTel only, no prompt-capturing hook; smallest share of target users; add only on real user demand).
- Prompt-quality coaching as a headline feature. Already free three ways elsewhere (`claude-code-prompt-coach-skill`, CC-Meta, lobehub `coach`). May exist as a minor, secondary field later — never the pitch.
- Any paid individual tier, account, login, or cloud sync. Two direct competitors already tested this and settled on $0 — do not re-run that experiment.
- Work Graph, Project Memory / golden rules, team playbooks, enterprise governance (SSO, audit, residency). These belong to [Roadmap](../../06-roadmap/roadmap.md) Phase 2–4, not this wedge.
- Employee ranking, leaderboards, or any cross-user comparison. Permanent non-goal — and a direct differentiator against Anthropic's native Claude Code dashboard, which ships a contributor leaderboard.

## 5. Target users

**Primary**: individual developers using Claude Code and/or Codex CLI daily, comfortable installing an OSS CLI tool, on macOS, Linux, or Windows.

**Secondary (not designed for yet, but should not be actively excluded)**: a developer who wants to show a teammate a receipt as a screenshot — this is the only "sharing" surface in v1, and it is manual (copy/paste or screenshot), not a feature.

## 6. User stories

- **US-001**: As a Claude Code user, when I finish a meaningful task, I want a receipt that tells me whether my change actually built, passed tests, and stuck — not just how many tokens it cost.
- **US-002**: As a Codex CLI user, I want the same receipt experience, using Codex's own hooks and session rollout logs.
- **US-003**: As a developer, when the tool cannot determine whether a task worked (no commit found, no test run detected), I want it to say "not yet verified" rather than guess or stay silent.
- **US-004**: As a developer, I want to see friction signals (retries, permission denials, repeated failed tool calls) on the receipt so avoidable effort is visible even when the outcome was eventually verified.
- **US-005**: As a developer, I want low-information messages (yes, continue, retry, thanks) to never generate their own receipt — only meaningful interactions should.
- **US-006**: As a developer, I want to install this with a single command and have it start working without creating an account or sending anything off my machine.
- **US-007**: As a maintainer, I want the underlying event schema to be forked/adapted from an existing normalized schema (`o11y-dev/opentelemetry-hooks`) rather than invented, so effort goes into the Verification Join, not event capture.

## 7. Functional requirements

### 7.1 Adapters
- **FR-1**: Register Claude Code hooks: `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`/`PermissionDenied`, `Stop`, `SessionEnd`. Consume GA OpenTelemetry metrics (`claude_code.cost.usage`, `claude_code.token.usage`) and events (`claude_code.user_prompt`, `claude_code.tool_result`, `claude_code.tool_decision`) where the hook payload doesn't already carry the data, correlated via `prompt.id`.
- **FR-2**: Register Codex CLI hooks: `SessionStart`, `SessionEnd`, `PreToolUse`/`PostToolUse`, `PermissionRequest`, `UserPromptSubmit`, `Stop`. Parse `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl` for session reconstruction and enrichment, correlated via `turn_id`.
- **FR-3**: Both adapters normalize into one internal event schema. **Resolved (spike complete, see §11):** do not fork the code of `o11y-dev/opentelemetry-hooks` — it is ~90% Python, distributed as a subprocess CLI (`otel-hook`, JSON over stdin/stdout), not an importable library, and adding a Python runtime dependency contradicts FR-6/G3's zero-setup `npx` install. Instead, adopt its **canonical event-name taxonomy and hook-mapping table** (MIT-licensed content, reusable) as the reference schema for our own native TypeScript hook scripts.
- **FR-4**: Gemini CLI is explicitly not implemented in v1 (see Non-goals).

### 7.2 Prompt-importance classification
- **FR-5**: Classify each `UserPromptSubmit` as meaningful or not, using deterministic features only (explicit deliverable, constraints, success criteria, scope size) — no LLM call in v1. Reuse the deterministic feature list from [Prompt Quality Engine](../../03-ai/prompt-quality-engine.md).
- **FR-6**: Low-information prompts (yes, continue, retry, thanks, fix typo, and equivalents) never produce a standalone receipt.

### 7.3 Verification Join
- **FR-7**: For each meaningful interaction, record the set of files touched (from `PostToolUse` file-edit events).
- **FR-8**: Watch the local git repository for a commit whose changed files overlap with the files touched, using a **resolved matching window (see §11 OQ-2)**: until the next `SessionStart` for the same project, or 30 minutes of inactivity, whichever comes first, capped at 2 hours.
- **FR-9**: If a commit is found, capture the result of the next test/build/lint run associated with it, using the **resolved detection order (see §11 OQ-3)**: (1) a CI workflow file in the repo, (2) a per-language convention (`package.json` test script, Makefile `test` target, `pytest`/`cargo test`/`go test` presence), (3) a one-time prompt to set a project-level test command, cached in `.pebl/config.json`. If none resolve, mark "no test signal available" (not a failure).
- **FR-10**: Re-check at two checkpoints — **24 hours** (catches fast reverts/CI failures) and **5 days** (final, resolved default, see §11 OQ-2) — whether the matched commit was reverted, force-pushed over, or had its touched files substantially rewritten. Downgrade a previously "verified" receipt to "verification reversed" if so, and surface this as a distinct, visible state — never silently update history.
- **FR-11**: If no commit is found in the window, the receipt must say "not yet verified" with the specific reason (no commit detected / no test signal / window elapsed) — fabricating a status is treated as a defect.

### 7.4 Receipt rendering
- **FR-12**: Render a terminal-native receipt (see format in [MVP Wedge spec](../../01-product/mvp-wedge-verified-receipt.md#the-receipt-fields-and-evidence-source)) immediately after each meaningful interaction resolves, and on demand via a CLI command for past sessions.
- **FR-13**: Every field on the receipt must be traceable to a named evidence source; if evidence is missing, omit the field or state its absence explicitly rather than approximating it.
- **FR-14**: At most one coaching insight per receipt, shown only when backed by ≥2 direct signals in-session or a repeated pattern across ≥5 of the user's own past sessions — never a universal or cross-user comparison.

### 7.5 Storage & privacy
- **FR-15**: All events, session state, and receipts are stored locally only. **Resolved (see §11 OQ-1):** append-only JSONL event log as source of truth (consistent with [Event Model](../../02-engineering/event-model.md) principle "derived analytics can be rebuilt from the event stream"), plus a local `better-sqlite3` index/materialized view — rebuildable from the log at any time — for the Verification Join's time-window queries. No network calls in v1.
- **FR-16**: Raw prompt text captured via hooks is stored locally and never transmitted; this PRD does not implement any sync/cloud path.

## 8. Platform & stack

- **Runtime**: Node.js / TypeScript. Rationale: fastest path to a single `npx`-installable CLI, closest ecosystem fit to the tools being consumed/forked (`o11y-dev/opentelemetry-hooks`, `ccusage`-style tooling), and native JSON/JSONL/OTel handling.
- **OS support**: macOS, Linux, and Windows from v1. Windows adds real work — hook script execution model, path handling, and git integration differ from macOS/Linux — and this is accepted as in-scope cost, not deferred.
- **Distribution**: npm package, invocable via `npx`, matching the install pattern of the closest comparable OSS tools (ccusage, vibe-log-cli).

## 9. Success metrics (this wedge)

- SM-1: On the builder's own last 200 real sessions, the Verification Join produces a correct verified / not-verified call with ≥80% precision on manual spot-check.
- SM-2: Of the first 30 developers shown a real receipt generated from their own work, ≥10 report a specific, concrete behavior change for their next task (not general positive sentiment).
- SM-3: The "not yet verified" outcome occurs often enough to be credible (the tool is visibly not hiding its failure cases) and rarely enough to remain useful — track the raw ratio, no target threshold yet, but the number must be reported and discussed before wider release.

## 10. Kill criteria

Stop, or stop shipping this as scoped, if any of the following becomes true:

- KC-1: The Verification Join cannot clear ≥80% precision on real dogfood data after genuine tuning effort — there is no differentiated product left beyond what already exists for free.
- KC-2: A competitor (Promptster, vibe-log, or Anthropic natively) ships session-to-outcome verification before this does — re-evaluate before continuing; the wedge's exclusivity is the whole thesis.
- KC-3: Fewer than 1 in 3 developers shown a real receipt report a concrete behavior change — this is the same failure mode `sniffly`'s own author already reported ("nothing particularly interesting"): a correct dashboard nobody acts on.
- KC-4: Maintaining the two adapters consumes more than 30% of engineering time in any given quarter (both CLIs are fast-moving, vendor-owned surfaces).

## 11. Dependencies & risks

- **Dependency — resolved, spike complete**: `o11y-dev/opentelemetry-hooks` (MIT, verified via `pyproject.toml` and GitHub API on 2026-08-03: `licenseInfo` is null at the repo level because no top-level `LICENSE` file exists, but the license is explicitly declared MIT in package metadata and OSI classifiers). Language breakdown confirmed via `gh api .../languages`: Python 492,906 bytes (~90%), Shell 51,326, TypeScript 5,593. It ships as a subprocess CLI (`otel-hook`) that agents pipe JSON to via stdin/stdout — **not an importable library**, and not fork-compatible with a Node/TS codebase without adding a Python runtime dependency, which would break G3/FR-6 (zero-setup `npx` install). **Decision: do not fork the code.** Adopt its canonical event-name taxonomy and per-agent hook-mapping table (data/spec, MIT, freely reusable) as the reference schema when writing native TypeScript hook handlers for Claude Code and Codex CLI. Revisit as an optional v1.1 integration: if a user already runs `otel-hook`, consume its OTLP stream as an alternate ingestion path instead of registering a second set of hooks — not required for v1.
- **Risk**: Claude Code's `transcript_path` is written asynchronously and may lag real-time state — receipt rendering must be event-driven, with transcript-based enrichment reconciled after the fact, not relied on for real-time completeness.
- **Risk**: Both CLIs are fast-moving; hook/OTel schemas can change between versions (traces are explicitly beta/subject to change on Claude Code; GitHub already hard-cut a legacy metrics API in a comparable surface). Version-pin and test against multiple CLI releases.
- **Risk**: Windows hook execution and git integration are the least-proven part of this scope; budget an explicit spike before committing to the FR-8/FR-9 implementation on Windows.

## 12. Open questions — resolved

- **OQ-1 (resolved)**: Append-only JSONL event log as source of truth + `better-sqlite3` as a rebuildable local index for the Verification Join's window queries. Rationale: consistent with the existing [Event Model](../../02-engineering/event-model.md) principle that derived analytics must be rebuildable from the event stream, and `better-sqlite3` is synchronous, dependency-light, and fits a single-process Node CLI without a server.
- **OQ-2 (resolved)**: Commit-matching window — until next `SessionStart` for the same project or 30 minutes of inactivity, whichever comes first, capped at 2 hours (handles developers who keep working past the agent session boundary). Revert re-check — two checkpoints, 24 hours and 5 days, both configurable; the 24h check catches fast CI failures/reverts, the 5-day check is the final "did it stick" signal. Both windows remain user-configurable; these are the shipped defaults, not yet validated against dogfood data — validating them is part of SM-1.
- **OQ-3 (resolved)**: Test-command detection order — (1) parse a CI workflow file if present in the repo (highest confidence, matches real project behavior), (2) fall back to per-language convention detection (`package.json` `scripts.test`, Makefile `test` target, presence of `pytest`/`cargo test`/`go test` config), (3) if neither resolves, prompt the user once for a project-level test command and cache it in `.pebl/config.json`. Never guess silently beyond this chain — an unresolved test command produces "no test signal available," not a fabricated result.

## 13. Related documents

- [Canonical PRD](../../01-product/canonical-prd.md)
- [MVP Wedge: Verified AI Task Receipt](../../01-product/mvp-wedge-verified-receipt.md) — full narrative spec this PRD formalizes
- [AI Task Receipt](../../01-product/ai-task-receipt.md)
- [System Architecture](../../02-engineering/system-architecture.md)
- [Event Model](../../02-engineering/event-model.md)
- [Provider Architecture](../../02-engineering/provider-architecture.md)
- [Validation Plan](../../06-roadmap/validation-plan.md)
- Competitive research: `Pebl_Vault/99-Research/Competitive-Research-and-Buildability-Verdict.md` (project vault, outside this repo)
