# Data Model

## Main entities

### User
Identity, plan, preferences, privacy mode.

### Device
Installation, client version, encryption keys.

### Project
Local identifier, optional synced identity, repository metadata.

### Provider
Claude Code, Codex CLI, Gemini CLI, custom.

### Session
Provider-level execution session.

### Interaction
Meaningful prompt and response cycle.

### WorkCluster
Automatically inferred set of interactions serving one intent.

### Receipt
Retrospective generated for an interaction or cluster.

### Insight
Evidence-backed coaching recommendation.

### MemoryItem
Observed fact, suggested learning, or golden rule.

### Habit
Behavior pattern with evidence and maturity.

### Report
Daily, weekly, project, or team summary.

## Memory states

- observed;
- suggested;
- approved;
- superseded;
- rejected.

## Privacy classes

- public metadata;
- operational metadata;
- user content;
- source code;
- secret;
- enterprise restricted.
