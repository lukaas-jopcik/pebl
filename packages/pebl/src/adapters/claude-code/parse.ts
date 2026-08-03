import { randomUUID } from 'node:crypto';
import { CLAUDE_CODE_EVENT_MAP, mapHookEventName } from '../canonical-events.js';
import type { PeblEvent, PrivacyClass } from '../../events/schema.js';

/**
 * Fields Claude Code is documented to pipe on every hook invocation, plus
 * the event-specific fields this package reads. `hook_event_name` is the
 * raw Claude Code event name (matches CLAUDE_CODE_EVENT_MAP's keys).
 */
export interface ClaudeCodeHookPayload {
  session_id: string;
  hook_event_name: string;
  prompt_id?: string;
  transcript_path?: string;
  cwd?: string;
  permission_mode?: string;
  effort?: string;
  // event-specific
  user_prompt?: string;
  tool_name?: string;
  tool_error?: string;
  last_assistant_message?: string;
  end_reason?: string;
  duration_ms?: number;
  [key: string]: unknown;
}

const ENVELOPE_FIELDS = new Set(['session_id', 'hook_event_name', 'prompt_id']);

/** Fields whose presence marks an event as carrying raw user/assistant content (FR-16). */
const USER_CONTENT_FIELDS = ['user_prompt', 'last_assistant_message'];

function determinePrivacyClass(payload: Record<string, unknown>): PrivacyClass {
  return USER_CONTENT_FIELDS.some((field) => field in payload) ? 'user_content' : 'metadata';
}

function buildPayload(raw: ClaudeCodeHookPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (ENVELOPE_FIELDS.has(key)) continue;
    if (value !== undefined) payload[key] = value;
  }
  return payload;
}

export function isClaudeCodeHookPayload(value: unknown): value is ClaudeCodeHookPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).session_id === 'string' &&
    typeof (value as Record<string, unknown>).hook_event_name === 'string'
  );
}

export function toPeblEvent(raw: ClaudeCodeHookPayload, projectId: string): PeblEvent {
  const eventType = mapHookEventName(CLAUDE_CODE_EVENT_MAP, raw.hook_event_name);
  const payload = buildPayload(raw);

  const event: PeblEvent = {
    event_id: randomUUID(),
    event_type: eventType,
    timestamp: new Date().toISOString(),
    source: 'claude-code',
    project_id: projectId,
    session_id: raw.session_id,
    privacy_class: determinePrivacyClass(payload),
    payload,
  };
  if (raw.prompt_id) event.prompt_id = raw.prompt_id;
  return event;
}
