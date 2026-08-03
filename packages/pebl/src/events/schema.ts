/**
 * Canonical event vocabulary shared by every adapter. Adapters (Phase 2/3)
 * are responsible for mapping each agent's native hook/event names onto
 * these canonical names — see docs/impl/verified-ai-task-receipt/IMPL.md §2.4.
 */
export const CANONICAL_EVENT_TYPES = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'PermissionDenied',
  'Stop',
  'PreCompact',
  'PostCompact',
  'SubagentStart',
  'SubagentStop',
  'ErrorOccurred',
] as const;

export type CanonicalEventType = (typeof CANONICAL_EVENT_TYPES)[number];

export function isCanonicalEventType(value: string): value is CanonicalEventType {
  return (CANONICAL_EVENT_TYPES as readonly string[]).includes(value);
}

export type PrivacyClass = 'metadata' | 'user_content';

export type EventSource = 'claude-code' | 'codex';

/**
 * Envelope matching docs/02-engineering/event-model.md. `payload` carries
 * whatever event-specific fields the source hook/event provided; it is
 * intentionally untyped here so adapters aren't forced through a giant
 * discriminated union before Phase 2/3 solidify real payload shapes.
 */
export interface PeblEvent {
  event_id: string;
  event_type: CanonicalEventType;
  timestamp: string; // ISO-8601
  source: EventSource;
  project_id: string;
  session_id: string;
  /** Claude Code correlation key for one prompt/response cycle. */
  prompt_id?: string;
  /** Codex correlation key for one prompt/response cycle. */
  turn_id?: string;
  privacy_class: PrivacyClass;
  payload: Record<string, unknown>;
}

export class InvalidEventError extends Error {}

/**
 * Structural + policy validation. This is deliberately stricter than the
 * TypeScript type: privacy_class and event_type are exactly the fields a
 * malformed adapter is most likely to get wrong, and this project's privacy
 * guarantees (FR-15/FR-16) depend on privacy_class always being present and
 * correct, not just assumed from the compiler.
 */
export function validateEvent(event: PeblEvent): void {
  if (!event.event_id) throw new InvalidEventError('event_id is required');
  if (!isCanonicalEventType(event.event_type)) {
    throw new InvalidEventError(`event_type "${event.event_type}" is not a canonical event type`);
  }
  if (!event.timestamp || Number.isNaN(Date.parse(event.timestamp))) {
    throw new InvalidEventError('timestamp must be a valid ISO-8601 string');
  }
  if (event.source !== 'claude-code' && event.source !== 'codex') {
    throw new InvalidEventError(`source "${event.source}" is not a supported adapter`);
  }
  if (!event.project_id) throw new InvalidEventError('project_id is required');
  if (!event.session_id) throw new InvalidEventError('session_id is required');
  if (event.privacy_class !== 'metadata' && event.privacy_class !== 'user_content') {
    throw new InvalidEventError(
      `privacy_class "${String(event.privacy_class)}" must be "metadata" or "user_content"`,
    );
  }
  if (typeof event.payload !== 'object' || event.payload === null) {
    throw new InvalidEventError('payload must be an object');
  }
}
