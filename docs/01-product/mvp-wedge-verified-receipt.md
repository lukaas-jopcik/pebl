# MVP Wedge: Verified AI Task Receipt

## Status

Proposed. Supersedes the MVP scope in [Canonical PRD](canonical-prd.md) for the first shipped version, based on competitive research (see project vault, `99-Research/Competitive-Research-and-Buildability-Verdict.md`). Does not replace the long-term vision in [Vision and Strategy](../00-foundation/vision-strategy.md) — it is the smallest slice of it that is not already free elsewhere.

## Why this scope, not the original MVP scope

Research found that prompt-quality coaching, local event collection, cost/token receipts, and daily rollups are already shipped and free (vibe-log, Promptster Solo, three OSS prompt-coach skills, five OSS cost dashboards). None of them can tell the user whether a task **actually worked**. That gap — joining an agent session to its real-world outcome — is unoccupied by every competitor found. This document scopes the MVP to exactly that gap.

## One-line thesis

> After a meaningful AI coding task, tell the developer — with evidence, not a guess — whether it actually held up.

## Included in v1

- Claude Code adapter (hooks + GA OpenTelemetry events).
- Codex CLI adapter (hooks + JSONL session rollouts).
- Local, deterministic prompt-importance classification (reuse [Prompt Quality Engine](../03-ai/prompt-quality-engine.md) deterministic features only — no LLM call required for v1).
- The **Verification Join** (see below) — the one component that does not exist anywhere else.
- A terminal-native AI Task Receipt, rendered locally, no account required.
- Local-only history. No cloud, no sync, no login, in v1.
- Fully open source, Apache 2.0, from day one.

## Explicitly excluded from v1 (deferred, not abandoned)

- Gemini CLI adapter — weakest telemetry surface (OTel only, no prompt-capturing hook) and smallest share of the target user base. Add only when a real user asks.
- Prompt-coaching insights as a headline feature — already free three ways elsewhere ([`claude-code-prompt-coach-skill`](https://github.com/hancengiz/claude-code-prompt-coach-skill), CC-Meta, lobehub `coach`). May ship as a minor secondary field on the receipt, never as the pitch.
- Managed cloud analysis, cross-device sync, any paid individual tier. Research shows two direct competitors already tested this and priced it at $0 — do not rebuild that experiment.
- Work Graph, Project Memory with approved golden rules, team playbooks, enterprise governance (SSO, audit, residency). These are the vision, not the wedge; see [Roadmap](../06-roadmap/roadmap.md) Phase 2–4.
- Employee ranking, leaderboards, productivity scores — permanent non-goal, and a direct point of differentiation against Anthropic's native Claude Code dashboard, which ships a contributor leaderboard.

## The receipt: fields and evidence source

Every field must name where its evidence came from. No field ships without a source.

| Field | Evidence source | Confidence if missing |
|---|---|---|
| Intent | `UserPromptSubmit` hook payload (`user_prompt`) | — |
| Duration | `SessionStart` → `SessionEnd` / `Stop` timestamps | — |
| Tokens / cost | OTel GA metrics: `claude_code.token.usage`, `claude_code.cost.usage` | — |
| Tool-call count, files touched | `PostToolUse` events, `code_edit_tool.decision` | — |
| Retries / correction loops | Repeated `UserPromptSubmit` within the same cluster + `PostToolUseFailure` | Omit field, do not guess |
| Permission friction | `PermissionRequest` / `PermissionDenied` events | — |
| **Verification status** (the differentiator) | **Verification Join** — see below | If the join produces no match, the receipt explicitly says "not yet verified" — never fabricate a pass/fail |
| One coaching insight | Only shown if backed by ≥2 direct signals from this session or a same-shape pattern across ≥5 of the user's own past sessions (personal baseline, never a universal score) | Omit if confidence is Low, per [Product Principles](../00-foundation/product-principles.md) #2 |

Example:

```
TASK: Add rate limiting to the auth endpoint
Duration: 9m 12s · 61k tokens · 14 tool calls

Verified: ✓ build passed · ✓ 6/6 tests passed · commit a1b2c3d
          not reverted or rewritten in the following 5 days

Friction: 1 permission denial, 1 retry after a failed lint check

Confidence: High — build, test, and 5-day commit stability all agree.
```

If verification cannot be established:

```
TASK: Refactor the pricing calculation
Duration: 14m 30s · 88k tokens · 9 tool calls

Verified: not yet verified — no test run or commit detected in this session
          or within 30 minutes after it

Friction: none detected

Confidence: n/a — outcome unknown, not claimed.
```

## The Verification Join (the actual new work)

This is the only component in the wedge that is not already available for free. Everything upstream of it (event capture, cost accounting, prompt logging) is a commodity and should be consumed, not rebuilt.

Pipeline:

1. `session_id` / `prompt_id` (from Claude Code hooks and OTel `prompt.id` correlation; Codex `turn_id`) is the join key.
2. Collect files touched during the session (`PostToolUse` file-edit events).
3. Watch the local git repository for a commit that touches an overlapping file set within a bounded window after session end.
4. Record the result of the next test/build/lint run associated with that commit (local CI config if present; otherwise a locally-run test command if the user's project defines one).
5. Re-check after N days (configurable, default 5) whether the commit was reverted, force-pushed over, or the same files were substantially rewritten — this is the "did it actually stick" signal, not just "did it compile once."
6. If no commit is found in the window, or no test/build signal exists, the receipt says so explicitly. **Never infer success from silence.**

This pipeline runs entirely locally, needs no new provider API, and is buildable from data the CLIs already emit plus the user's own git history — no new trust boundary is crossed.

## Adapter approach

Do not write a novel event collector. Evaluate forking or wrapping [`o11y-dev/opentelemetry-hooks`](https://github.com/o11y-dev/opentelemetry-hooks) (MIT) for hook normalization across Claude Code and Codex before writing anything from scratch. Time spent on the collector itself is time not spent on the Verification Join, which is the only part that matters competitively.

## Non-goals reaffirmed

Same as [Canonical PRD](canonical-prd.md#5-mvp-scope): no employee ranking, no automatic source-code modification, no full IDE product, no fully autonomous prompt rewriting by default. Add: no individual paid tier, no cloud requirement, no Gemini CLI adapter, no coaching-as-headline.

## Success criteria for this wedge specifically

- On the builder's own last 200 real sessions, the Verification Join produces a correct verified/not-verified call with ≥80% precision (spot-checked manually).
- Of the first 30 developers shown a real receipt on their own work, at least 10 report something concrete they'd do differently next time — not politeness, a specific behavior change.
- The "not yet verified" case is common enough to be credible (i.e. the tool is not silently hiding its failure cases) and rare enough to be useful.

## Kill criteria for this wedge

- If the Verification Join cannot clear 80% precision on real dogfood data after genuine effort, stop — there is no differentiated product left, only what already exists for free (see research doc).
- If a competitor (Promptster, vibe-log, or Anthropic natively) ships session-to-outcome verification before this does, the wedge is gone; re-evaluate before continuing.
- If fewer than 1 in 3 shown developers report a concrete behavior change, the receipt is a correct dashboard nobody acts on — same failure mode `sniffly`'s author already reported.

## Monetization path (not in v1, stated for context only)

Individual usage stays free and OSS permanently — this is distribution, not a future paid tier. The only paid surface planned after this wedge ships is an opt-in, non-ranking **team aggregation** view (which task shapes verify first-try, which agent/model wastes money, where the team repeatedly rediscovers the same thing), priced near or below Promptster's $15/seat/mo, with manager seats free. Do not build this until the individual wedge has real usage data to aggregate.

---

Related: [Canonical PRD](canonical-prd.md) · [AI Task Receipt](ai-task-receipt.md) · [System Architecture](../02-engineering/system-architecture.md) · [Event Model](../02-engineering/event-model.md) · [Provider Architecture](../02-engineering/provider-architecture.md) · [Validation Plan](../06-roadmap/validation-plan.md)
