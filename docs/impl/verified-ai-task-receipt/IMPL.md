# IMPL: Verified AI Task Receipt

**Feature**: `verified-ai-task-receipt`
**PRD Version**: 1.1.0
**IMPL Version**: 1.0.0
**Status**: Ready to start

## 1. Architecture summary

Single npm package, published as `pebl` (bin: `pebl`), Node.js ≥ 20, TypeScript, ESM, no runtime dependency on Python or any daemon process.

```
                 ┌───────────────────────────────┐
Claude Code /    │  pebl hook <agent> <event>     │   (invoked by the CLI's own hook config)
Codex CLI  ─────▶│  reads JSON from stdin         │──────┐
                 │  writes {"continue": true}      │      │
                 └───────────────────────────────┘      ▼
                                                  ┌───────────────┐
                                                  │ Event Log     │  append-only JSONL
                                                  │ (source of    │  ~/.pebl/events/<project>/<date>.jsonl
                                                  │  truth)       │
                                                  └──────┬────────┘
                                                         │ rebuildable
                                                         ▼
                                                  ┌───────────────┐
                                                  │ SQLite index  │  better-sqlite3
                                                  │ (derived)     │  ~/.pebl/index.db
                                                  └──────┬────────┘
                                                         │
                          ┌──────────────────────────────┼───────────────────────────────┐
                          ▼                              ▼                               ▼
                 ┌────────────────┐           ┌────────────────────┐          ┌─────────────────────┐
                 │ Prompt-import.  │           │ Verification Join   │          │ Receipt renderer     │
                 │ classifier      │           │ (git watch + test   │          │ + coaching insight   │
                 │ (deterministic) │           │  detection + revert │          │ gate                 │
                 └────────────────┘           │  recheck)           │          └─────────────────────┘
                                                └────────────────────┘
```

Three components deliberately have **no** long-running process:
- Hook handler: short-lived, one process per event, matches the `otel-hook` "no sidecar, no daemon" model.
- SQLite index: rebuilt from the JSONL log on demand (`pebl rebuild-index`), never the source of truth.
- Verification recheck: see §2.4 — resolved as opportunistic + optional OS scheduler entry, not a daemon.

## 2. Component design

### 2.1 Event schema & storage (implements FR-15, FR-16, OQ-1)

- `src/events/schema.ts` — internal event envelope, matching [Event Model](../../02-engineering/event-model.md):
  ```ts
  interface PeblEvent {
    event_id: string;       // uuid v4
    event_type: string;     // canonical name, see 2.2/2.3 mapping tables
    timestamp: string;      // ISO-8601
    source: 'claude-code' | 'codex';
    project_id: string;     // derived from git remote + path hash, stable per local repo
    session_id: string;
    prompt_id?: string;     // Claude Code correlation key
    turn_id?: string;       // Codex correlation key
    privacy_class: 'metadata' | 'user_content';
    payload: Record<string, unknown>;
  }
  ```
- `src/events/store.ts` — append-only writer to `~/.pebl/events/<project_id>/<YYYY-MM-DD>.jsonl`; one JSON object per line, `fsync`-safe append. Reader streams line-by-line (never loads a full day into memory at once).
- `src/db/index.ts` — `better-sqlite3` schema: `sessions`, `interactions`, `tool_events`, `files_touched`, `commits`, `verification_checks`. Built exclusively by replaying the JSONL log (`pebl rebuild-index` truncates and rebuilds; also runs automatically on version mismatch).
- No network calls anywhere in this module (G4, FR-15).

### 2.2 Claude Code adapter (implements FR-1, US-001)

- `src/adapters/claude-code/hooks.ts` — registers `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied`, `Stop`, `SessionEnd` in `.claude/settings.json` (project scope) or `~/.claude/settings.json` (global), matching Claude Code's documented hook config format. Each hook entry invokes `pebl hook claude-code <event>`.
- `src/adapters/claude-code/parse.ts` — reads the JSON payload Claude Code pipes to stdin for each event (`session_id`, `prompt_id`, `transcript_path`, `cwd`, `permission_mode`, plus event-specific fields like `user_prompt`, `tool_error`, `last_assistant_message`, `end_reason`), maps to `PeblEvent`.
- `src/adapters/claude-code/otel.ts` — optional OTLP receiver (local-only HTTP listener bound to `127.0.0.1`, ephemeral port, only active while a `pebl hook` process needs it) to ingest GA metrics (`claude_code.cost.usage`, `claude_code.token.usage`) and events (`claude_code.tool_result`, `claude_code.tool_decision`) when the user has Claude Code's OTel export enabled; correlated to the same event log via `prompt.id`. **This is additive, not required** — the hook payloads alone satisfy FR-1's core fields; OTel enrichment fills in cost/token numbers when available.

### 2.3 Codex CLI adapter (implements FR-2, US-002)

- `src/adapters/codex/hooks.ts` — registers `SessionStart`, `SessionEnd`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `UserPromptSubmit`, `Stop` via Codex's documented hook config, each invoking `pebl hook codex <event>`.
- `src/adapters/codex/rollout.ts` — tail-reads `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl` for session reconstruction/enrichment when hook payloads are incomplete, correlated via `turn_id`. **Security note (carried from PRD risk list):** these files are world-readable (0644) on Unix by default upstream — `pebl` must not write anything sensitive back into that directory, and must warn once (not repeatedly) if it detects overly permissive session file modes, without attempting to change permissions it doesn't own.

### 2.4 Shared adapter reference schema (implements FR-3, US-007)

- `src/adapters/canonical-events.ts` — a static mapping table (data, not code) adapted from `o11y-dev/opentelemetry-hooks`'s README event table, listing canonical event names and their per-agent equivalents. Used by both adapters to normalize into one `PeblEvent.event_type` vocabulary. Attribution comment in the file header crediting the source table (MIT, per PRD §11).
- Explicitly **not** a dependency on the `opentelemetry-hooks` Python package — no subprocess shelling, no `pip`/`pipx` requirement.

### 2.5 Prompt-importance classifier (implements FR-5, FR-6, US-005)

- `src/classify/prompt-importance.ts` — pure function, deterministic, no LLM call:
  - Low-information filter: a maintained list/regex set (yes, ok, continue, retry, thanks, fix typo, and close variants) → always `meaningful: false`.
  - Otherwise, score presence of: explicit deliverable noun phrase, constraint/exclusion language, success-criteria language, reference to existing project conventions, requested verification, contradictory-instruction flag, breadth-of-scope heuristic (message length + verb count as a weak proxy, never the sole signal).
  - Output: `{ meaningful: boolean, signals: string[] }` — signals are stored so classifier behavior is auditable/debuggable, not a black box.

### 2.6 Verification Join (implements FR-7 – FR-11, US-003, US-004, OQ-2, OQ-3)

- `src/verification/files-touched.ts` — aggregates `PostToolUse` file-edit events for an interaction into a file set.
- `src/verification/git-watch.ts` — implements the FR-8 matching window (next `SessionStart` for the same project, or 30 min idle, capped at 2h) via `git log --since=<session_end> --name-only` scoped to the project path; matches by file-set overlap, picks the earliest qualifying commit.
- `src/verification/test-detect.ts` — implements the FR-9 detection order: (1) parse `.github/workflows/*.yml` / `.gitlab-ci.yml` / equivalents for a job whose name/script suggests test or build; (2) `package.json` `scripts.test`, Makefile `test` target, `pytest.ini`/`pyproject.toml`, `Cargo.toml`, `go.mod` presence; (3) prompt once via the CLI, cache the answer in `.pebl/config.json` (project-local, git-ignored by default template).
- `src/verification/run-check.ts` — executes the detected/cached command in the project directory, captures exit code + duration, never captures full stdout/stderr into the receipt (avoid re-leaking source/log content) beyond a short truncated tail used only for the "no test signal" vs. "test failed" distinction.
- `src/verification/recheck.ts` — implements FR-10's two checkpoints (24h, 5 days). **Architecture decision (resolved, not left open):** `pebl` has no daemon, matching the "no sidecar" design goal. Rechecks are triggered two ways, both idempotent and safe to run redundantly:
  1. **Opportunistic**: every `pebl hook` invocation for a project also checks whether any of that project's pending verification checks are due, and runs them inline (adds negligible latency, piggybacks on activity that's already happening).
  2. **OS-native scheduler (installed once during `pebl setup`, optional, off by default, opt-in prompt)**: a `cron` entry (macOS/Linux) or Scheduled Task (`schtasks`, Windows) that runs `pebl recheck --due` once daily, so a project the user doesn't touch for days still gets its checks. `pebl setup --no-scheduler` skips this; `pebl doctor` reports whether it's installed and healthy.
  - This means a check can be arbitrarily late if the user opts out of the scheduler and never reopens the project — the receipt for that session simply stays in "pending verification" until the next opportunistic trigger. This is explicitly acceptable: it is more honest than silently expiring or fabricating a result (G2).
- `src/verification/join.ts` — orchestrates the above into a `VerificationResult`: `{ status: 'verified' | 'verification_reversed' | 'not_yet_verified', reason?, commit_sha?, checks: [...] }`.

### 2.7 Receipt rendering (implements FR-12 – FR-14, US-001, US-004)

- `src/receipt/render.ts` — terminal formatter matching the example format in the [MVP Wedge spec](../../01-product/mvp-wedge-verified-receipt.md#the-receipt-fields-and-evidence-source). Uses `picocolors` (zero-dependency, no ESM/CJS friction) for the minimal color needed; no heavyweight TUI framework for v1.
- `src/receipt/fields.ts` — builds each field from its named evidence source per FR-13; a field with no evidence is omitted or explicitly marked absent, never approximated.
- `src/receipt/insight.ts` — implements FR-14's confidence gate: computes candidate insights from (a) ≥2 direct signals within the current session, or (b) a repeated pattern across ≥5 of the user's own past interactions (queried from the SQLite index, never cross-user). Returns at most one insight; returns none below the confidence bar rather than a weak one (Product Principle #2).

### 2.8 CLI surface

- `pebl setup [--agent claude-code|codex] [--global|--no-global] [--no-scheduler]` — registers hooks, optionally installs the recheck scheduler entry.
- `pebl hook <agent> <event>` — the actual hook entrypoint invoked by the agent's own config; reads stdin, writes to the event log, runs opportunistic rechecks, returns the agent's expected continue/response contract on stdout.
- `pebl receipt [--session <id>] [--last]` — renders a receipt on demand for a past interaction.
- `pebl recheck [--due]` — runs pending verification rechecks; `--due` limits to checks past their checkpoint time (used by the scheduler entry).
- `pebl rebuild-index` — truncates and rebuilds the SQLite index from the JSONL log.
- `pebl doctor` — reports hook registration status per agent, scheduler status, index freshness, and any detected permission issues (e.g. Codex's world-readable session files).
- `pebl uninstall [--agent <agent>]` — removes hook registration and (if present) the scheduler entry; never deletes the local event log or index without a separate explicit `--purge-data` flag.

## 3. Data model (SQLite index — derived, rebuildable)

- `sessions(session_id, source, project_id, started_at, ended_at)`
- `interactions(interaction_id, session_id, prompt_id_or_turn_id, prompt_text, meaningful, classified_signals, started_at, ended_at)`
- `tool_events(id, interaction_id, tool_name, event_type, success, duration_ms, timestamp)`
- `files_touched(interaction_id, file_path)`
- `commits(sha, project_id, interaction_id, matched_at, files)`
- `verification_checks(id, commit_sha, checkpoint, status, ran_at, exit_code, reason)`

No `WorkCluster`, `MemoryItem`, `Habit`, or `Report` tables in this wedge — those belong to [Data Model](../../02-engineering/data-model.md)'s full scope (Phase 2+ of the [Roadmap](../../06-roadmap/roadmap.md)), not this IMPL. Receipts in v1 are always at the **interaction** level, never a Work Cluster — clustering (ADR-001) is deferred; not doing so is a deliberate scope cut, not an oversight.

## 4. Testing strategy

- **Unit**: prompt-importance classifier (fixture prompt corpus with expected meaningful/not labels), test-command detection order, receipt field builder (evidence-present vs. evidence-missing cases), verification-status state machine (verified → verification_reversed transition).
- **Integration**: recorded fixture hook payloads (captured once from a real Claude Code and a real Codex session, checked in as sample JSON) replayed through the adapter → event log → SQLite index → receipt pipeline, in a temporary directory with a throwaway git repo, asserting the Verification Join against known commit/test outcomes.
- **Cross-platform**: the git-watch, test-detect, and scheduler-install paths run in CI on macOS, Linux, and Windows runners (per PRD §8 OS scope) — this is non-negotiable given the PRD risk note on Windows being least-proven.
- **Dogfood harness**: `pebl eval --sessions 200 --spot-check` — a helper command (not shipped as a user-facing feature, internal/hidden) that replays the builder's own last 200 real sessions and outputs a CSV of verification calls for manual spot-check, directly supporting SM-1's ≥80% precision measurement. This is the single most important test in the whole plan — it validates the wedge's actual thesis, not just code correctness.

## 5. Task breakdown

| Phase | Tasks | Estimated |
|---|---|---|
| 0. Scaffolding | 4 | Small |
| 1. Event schema & storage | 5 | Medium |
| 2. Claude Code adapter | 5 | Medium |
| 3. Codex CLI adapter | 4 | Medium |
| 4. Prompt-importance classifier | 3 | Small |
| 5. Verification Join | 7 | Large |
| 6. Receipt rendering & insight | 4 | Medium |
| 7. CLI surface & setup UX | 5 | Medium |
| 8. Cross-platform hardening | 3 | Medium |
| 9. Testing & dogfood harness | 4 | Medium |
| 10. Packaging & release | 3 | Small |
| **Total** | **47** | |

### Phase 0 — Scaffolding
- **T0.1** Initialize npm package `pebl`: `package.json` (bin, ESM `type: module`, Node ≥20 engines), `tsconfig.json`, build via `tsup`.
- **T0.2** Lint/format: ESLint + Prettier config consistent with repo conventions.
- **T0.3** Test runner: Vitest configured for unit + integration test dirs.
- **T0.4** CI workflow: GitHub Actions matrix over macOS/Linux/Windows runners running lint + unit + integration tests (needed before Phase 8, set up early so every later phase is covered).

### Phase 1 — Event schema & storage (FR-15, FR-16, OQ-1)
- **T1.1** Define `PeblEvent` schema + `event_type` canonical vocabulary skeleton (`src/events/schema.ts`).
- **T1.2** Append-only JSONL writer with safe concurrent-append handling (`src/events/store.ts`).
- **T1.3** JSONL streaming reader (line-by-line, no full-file load).
- **T1.4** SQLite schema + `rebuild-index` (truncate + replay) (`src/db/index.ts`).
- **T1.5** Unit tests: writer/reader round-trip, rebuild idempotency, privacy-class field always present.

### Phase 2 — Claude Code adapter (FR-1, US-001)
- **T2.1** Hook registration writer for `.claude/settings.json` / `~/.claude/settings.json` (`src/adapters/claude-code/hooks.ts`).
- **T2.2** Stdin payload parser for each Claude Code hook event (`src/adapters/claude-code/parse.ts`).
- **T2.3** Mapping into `PeblEvent` using the canonical taxonomy (§2.4).
- **T2.4** Optional local-only OTLP receiver for GA metrics/events enrichment (`src/adapters/claude-code/otel.ts`).
- **T2.5** Integration test with recorded fixture payloads.

### Phase 3 — Codex CLI adapter (FR-2, US-002)
- **T3.1** Hook registration writer for Codex's hook config format.
- **T3.2** Stdin payload parser for Codex hook events.
- **T3.3** JSONL rollout tail-reader with the world-readable-file warning (once, not repeated).
- **T3.4** Integration test with recorded fixture payloads.

### Phase 4 — Prompt-importance classifier (FR-5, FR-6, US-005)
- **T4.1** Low-information filter list + matcher.
- **T4.2** Deterministic feature scorer (deliverable/constraints/criteria/scope signals).
- **T4.3** Unit tests against a labeled fixture prompt corpus (build this corpus from the builder's own real prompt history where possible).

### Phase 5 — Verification Join (FR-7–FR-11, US-003, US-004, OQ-2, OQ-3) — largest, highest-risk phase
- **T5.1** Files-touched aggregator per interaction.
- **T5.2** Git-watch matching window implementation (next-SessionStart-or-30min-idle, capped 2h).
- **T5.3** Test-command detection chain (CI file → per-language convention → cached prompt).
- **T5.4** Check runner (exit code + duration capture, truncated output only).
- **T5.5** Recheck scheduling: opportunistic trigger inside `pebl hook`, plus OS-scheduler installer (cron/launchd entry, `schtasks` entry) wired to `pebl setup`.
- **T5.6** Verification state machine (`not_yet_verified` → `verified` → `verification_reversed`), with the "never fabricate" guard as an explicit unit-tested invariant (FR-11, G2).
- **T5.7** Integration tests using a disposable git repo fixture: happy path (commit + passing test + no revert), revert-after-verified path, no-commit-found path, no-test-signal path.

### Phase 6 — Receipt rendering & insight (FR-12–FR-14, US-001, US-004)
- **T6.1** Field builder with evidence-source tagging and omit-if-missing behavior.
- **T6.2** Terminal renderer matching the MVP Wedge spec's example format.
- **T6.3** Coaching-insight confidence gate (≥2 in-session signals or ≥5-session personal-baseline pattern; personal-only, never cross-user).
- **T6.4** Unit tests: evidence-present vs. evidence-missing rendering, insight suppressed below confidence bar.

### Phase 7 — CLI surface & setup UX (US-006)
- **T7.1** `pebl setup` command (agent selection, global/project scope, scheduler opt-in prompt).
- **T7.2** `pebl hook` entrypoint wiring adapters → event log → opportunistic recheck → agent response contract.
- **T7.3** `pebl receipt` / `pebl recheck` / `pebl rebuild-index` commands.
- **T7.4** `pebl doctor` (hook registration, scheduler, index freshness, permission warnings).
- **T7.5** `pebl uninstall` (hook + scheduler removal; data untouched unless `--purge-data`).

### Phase 8 — Cross-platform hardening
- **T8.1** Windows path handling audit (hook config paths, `$CODEX_HOME` equivalent, git invocation via `cmd`/PowerShell quoting).
- **T8.2** Windows scheduler integration (`schtasks`) parity test against the macOS/Linux `cron` path.
- **T8.3** Cross-platform CI green on all three OSes for the full Phase 1–7 test suite.

### Phase 9 — Testing & dogfood harness
- **T9.1** Build the fixture corpus (recorded real Claude Code + Codex hook payload samples, sanitized).
- **T9.2** Build the disposable-git-repo integration test harness used by T5.7.
- **T9.3** `pebl eval --sessions 200 --spot-check` internal command for SM-1 precision measurement.
- **T9.4** Run the actual SM-1 dogfood evaluation on the builder's real history and record the result in this IMPL's changelog before considering the phase done — this is a go/no-go gate, not a checkbox (ties directly to KC-1).

### Phase 10 — Packaging & release
- **T10.1** README, LICENSE (Apache 2.0 per PRD/Open Source Strategy), CHANGELOG for the npm package itself.
- **T10.2** `npm publish` dry run + `npx pebl setup` smoke test on a clean machine/container per OS.
- **T10.3** Update this feature's PRD status to "Implemented" and record actual SM-1/SM-2 results once available.

## 6. Gate before Phase 6+ (explicit go/no-go)

Per KC-1, do not proceed past Phase 5 into polishing the receipt/CLI UX until T9.4's dogfood result is known. If precision is below ~80% after genuine tuning, stop and re-open the PRD rather than continuing to build UI on top of an unproven join. This gate is intentionally placed before the "nice" work, not after.

## 7. Related documents

- [PRD: Verified AI Task Receipt](../../prd/verified-ai-task-receipt/PRD.md)
- [MVP Wedge spec](../../01-product/mvp-wedge-verified-receipt.md)
- [Event Model](../../02-engineering/event-model.md) · [Data Model](../../02-engineering/data-model.md) · [System Architecture](../../02-engineering/system-architecture.md)
