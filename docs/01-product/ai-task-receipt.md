# AI Task Receipt Specification

## Purpose

Convert a completed AI interaction into a compact, useful retrospective.

## Required fields

- Intent
- Outcome status
- Duration
- Model/provider
- Token usage where available
- Tool-call count
- Files touched count
- Verification evidence
- Retry count
- Repeated discovery signals
- Confidence
- Primary coaching insight

## Optional fields

- Estimated avoidable effort
- Better prompt
- Suggested project rule
- Suggested reusable template
- Model-routing recommendation
- Risk note

## Receipt example

```text
TASK COMPLETED
Implement Google OAuth

Outcome
✓ Build passed
✓ 18 tests passed

Effort
12m 48s · 184k tokens · 21 tool calls

Main inefficiency
The session strategy was not specified. The agent first
implemented JWT sessions, then replaced them after discovering
the existing Prisma adapter.

Recommended improvement
Include the existing authentication adapter and session strategy
in the initial prompt.

Confidence
High — supported by two abandoned code paths and repeated config reads.
```

## Quality bar

A receipt is useful only when it answers at least one:

- What happened?
- What was avoidable?
- Why was it avoidable?
- What should change?
- What should be remembered?

## Display rule

Show no more than one primary recommendation by default.
