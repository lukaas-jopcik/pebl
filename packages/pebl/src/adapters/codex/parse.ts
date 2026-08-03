import { randomUUID } from 'node:crypto';
import { CODEX_EVENT_MAP, mapHookEventName } from '../canonical-events.js';
import type { PeblEvent, PrivacyClass } from '../../events/schema.js';

/**
 * Verified (2026-08-03) against https://learn.chatgpt.com/docs/hooks.
 * Common fields on every hook invocation: session_id, transcript_path,
 * cwd, model, permission_mode. Turn-scoped hooks add turn_id (a Codex-
 * specific extension). The prompt text field on UserPromptSubmit is
 * `prompt` — NOT `user_prompt` as originally assumed here (that guess
 * was modeled on Claude Code's field name and was wrong; caught by
 * checking the real docs rather than leaving the assumption in place).
 * `last_assistant_message` on Stop was already correct.
 */
export interface CodexHookPayload {
  session_id: string;
  hook_event_name: string;
  turn_id?: string;
  transcript_path?: string;
  cwd?: string;
  model?: string;
  permission_mode?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: unknown;
  last_assistant_message?: string;
  end_reason?: string;
  duration_ms?: number;
  [key: string]: unknown;
}

const ENVELOPE_FIELDS = new Set(['session_id', 'hook_event_name', 'turn_id']);
const USER_CONTENT_FIELDS = ['prompt', 'last_assistant_message'];

function determinePrivacyClass(payload: Record<string, unknown>): PrivacyClass {
  return USER_CONTENT_FIELDS.some((field) => field in payload) ? 'user_content' : 'metadata';
}

function buildPayload(raw: CodexHookPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (ENVELOPE_FIELDS.has(key)) continue;
    if (value !== undefined) payload[key] = value;
  }
  return payload;
}

export function isCodexHookPayload(value: unknown): value is CodexHookPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).session_id === 'string' &&
    typeof (value as Record<string, unknown>).hook_event_name === 'string'
  );
}

export function toPeblEvent(raw: CodexHookPayload, projectId: string): PeblEvent {
  const eventType = mapHookEventName(CODEX_EVENT_MAP, raw.hook_event_name);
  const payload = buildPayload(raw);

  const event: PeblEvent = {
    event_id: randomUUID(),
    event_type: eventType,
    timestamp: new Date().toISOString(),
    source: 'codex',
    project_id: projectId,
    session_id: raw.session_id,
    privacy_class: determinePrivacyClass(payload),
    payload,
  };
  if (raw.turn_id) event.turn_id = raw.turn_id;
  return event;
}
