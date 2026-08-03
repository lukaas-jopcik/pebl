import type { CanonicalEventType } from '../events/schema.js';

/**
 * Per-agent hook/event name -> canonical event name.
 *
 * The event taxonomy itself (which names exist, how they line up across
 * agents) is adapted from the mapping table published by
 * `o11y-dev/opentelemetry-hooks` (MIT) — see docs/impl/verified-ai-task-receipt/IMPL.md
 * §2.4 and PRD §11 for the decision record. We do not depend on that
 * project's code (it is a Python subprocess CLI, incompatible with this
 * package's zero-Python-dependency goal); only its published event-name
 * table is reused here, as data.
 */
export const CLAUDE_CODE_EVENT_MAP: Record<string, CanonicalEventType> = {
  SessionStart: 'SessionStart',
  SessionEnd: 'SessionEnd',
  UserPromptSubmit: 'UserPromptSubmit',
  PreToolUse: 'PreToolUse',
  PostToolUse: 'PostToolUse',
  PostToolUseFailure: 'PostToolUseFailure',
  PermissionRequest: 'PermissionRequest',
  PermissionDenied: 'PermissionDenied',
  Stop: 'Stop',
  PreCompact: 'PreCompact',
  PostCompact: 'PostCompact',
  SubagentStart: 'SubagentStart',
  SubagentStop: 'SubagentStop',
};

/**
 * Codex's hook names are deliberately near-isomorphic to Claude Code's
 * (per PRD §11's technical feasibility research), with two differences
 * this package cares about: no PostToolUseFailure (tool failures surface
 * as a regular PostToolUse payload) and no PermissionDenied (only the
 * request side is observable).
 */
export const CODEX_EVENT_MAP: Record<string, CanonicalEventType> = {
  SessionStart: 'SessionStart',
  SessionEnd: 'SessionEnd',
  UserPromptSubmit: 'UserPromptSubmit',
  PreToolUse: 'PreToolUse',
  PostToolUse: 'PostToolUse',
  PermissionRequest: 'PermissionRequest',
  Stop: 'Stop',
  PreCompact: 'PreCompact',
  PostCompact: 'PostCompact',
  SubagentStart: 'SubagentStart',
  SubagentStop: 'SubagentStop',
};

export class UnmappedHookEventError extends Error {}

export function mapHookEventName(
  map: Record<string, CanonicalEventType>,
  rawEventName: string,
): CanonicalEventType {
  const mapped = map[rawEventName];
  if (!mapped) {
    throw new UnmappedHookEventError(
      `No canonical mapping for hook event "${rawEventName}". ` +
        `This means either the agent registered a hook we didn't ask for, ` +
        `or the agent renamed/added an event since this mapping was written.`,
    );
  }
  return mapped;
}
