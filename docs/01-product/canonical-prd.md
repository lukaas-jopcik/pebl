# Canonical Product Requirements Document

## 1. Executive summary

Pebl is an open-source, terminal-first AI Collaboration Intelligence product. Its first module observes meaningful interactions with AI coding agents and produces actionable feedback that improves future collaboration.

The MVP focuses on a single promise:

> After meaningful AI work, Pebl tells you what worked, what caused avoidable effort, and what should change next time.

## 2. Problem

AI-native workers currently lack a trusted feedback loop.

Existing tools primarily show token consumption, model usage, latency, cost, and raw transcripts. They do not reliably answer:

- Was the prompt sufficiently scoped?
- Why did the agent need multiple corrections?
- Which project context was discovered repeatedly?
- Which steps were avoidable?
- What should the user change next time?
- Is collaboration quality improving?

## 3. Initial user

Primary:

- developers using Claude Code, Codex CLI, or Gemini CLI several times per day;
- independent builders and technical founders;
- engineers comfortable installing open-source CLI tooling.

Secondary:

- engineering managers;
- platform teams;
- enterprise AI enablement teams.

## 4. Jobs to be done

### Functional

- Understand whether an AI task was efficient.
- Improve future prompts without studying prompt engineering.
- Detect repeated waste.
- Preserve useful project learnings.
- Track personal progress over time.
- Control where sensitive data is processed.

### Emotional

- Feel in control of AI-assisted work.
- Trust that AI is not eroding personal judgment.
- See visible evidence of improvement.

## 5. MVP scope

### Included

- automatic prompt importance classification;
- automatic interaction grouping;
- local event collection;
- cost, time, and tool-call metrics where available;
- AI Task Receipt;
- one post-task coaching insight;
- daily summary;
- local Project Memory;
- optional cloud sync;
- provider abstraction;
- privacy modes.

### Excluded

- general psychology or non-work microlearning;
- employee ranking;
- automatic modification of source code;
- full IDE product;
- broad enterprise governance suite;
- fully autonomous prompt rewriting by default.

## 6. Core experience

### Before execution

For high-value prompts only, Pebl may show a non-blocking suggestion when a critical omission is detected.

Example:

> Missing acceptance criteria. Add how success will be verified?

The user can ignore it without friction.

### During execution

Pebl collects events silently. It does not inject unrelated learning content into the terminal.

### After execution

Pebl creates an AI Task Receipt containing intent, outcome, duration, tokens and cost where available, retries and repeated work, verification status, one actionable improvement, and a suggested memory update.

### End of day

Pebl generates a concise report containing meaningful AI interactions, first-pass success, estimated avoidable effort, strongest habit, recurring issue, and one recommendation for tomorrow.

## 7. Automatic interaction model

Users never manually create work units.

Pebl maintains two internal concepts.

### Interaction

A single meaningful user request plus the immediate agent response cycle.

### Work Cluster

A group of interactions inferred to serve the same goal.

Clustering signals include temporal proximity, semantic similarity, same files or commands, repeated correction language, shared repository state, agent continuation markers, and successful build, test, or commit boundaries.

Receipts can exist at interaction or cluster level. The user sees the level that produces the clearest insight.

## 8. Prompt importance

Pebl ignores low-information messages such as yes, continue, retry, thanks, or fix typo.

A prompt is meaningful when it introduces or materially changes intent, scope, constraints, acceptance criteria, architecture, or expected output.

## 9. Success criteria

MVP success requires evidence that:

- at least 30% of active users read receipts weekly;
- at least 20% apply a suggested improvement;
- applied improvements correlate with fewer retries or reduced avoidable effort;
- users report that Pebl does not interrupt flow;
- seven-day retention exceeds that of a passive usage dashboard.

## 10. Main risk

The product fails if feedback feels generic, incorrect, or obvious.

Therefore, Pebl should prefer silence over weak advice, evidence over speculation, deterministic signals over unnecessary LLM generation, and user-specific comparisons over universal scores.
