# Event Model

## Core event envelope

```json
{
  "event_id": "uuid",
  "event_type": "prompt.submitted",
  "timestamp": "ISO-8601",
  "source": "claude-code",
  "project_id": "local-stable-id",
  "session_id": "provider-session-id",
  "privacy_class": "metadata",
  "payload": {}
}
```

## Core events

- `prompt.submitted`
- `prompt.classified`
- `agent.started`
- `agent.status_changed`
- `tool.called`
- `file.read`
- `file.modified`
- `command.executed`
- `verification.started`
- `verification.completed`
- `agent.completed`
- `interaction.clustered`
- `receipt.generated`
- `insight.generated`
- `insight.applied`
- `memory.suggested`
- `memory.approved`
- `report.generated`

## Event principles

- Events are append-only.
- Sensitive payload fields are explicitly classified.
- Adapters normalize provider-specific data.
- Derived analytics can be rebuilt from the event stream.
- Retention differs by privacy class.
