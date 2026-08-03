import type { PeblEvent } from '../events/schema.js';

const FILE_PATH_KEYS = ['file_path', 'filePath', 'path'] as const;
const TOOL_EVENT_TYPES = new Set(['PreToolUse', 'PostToolUse', 'PostToolUseFailure']);

/**
 * Best-effort file-path extraction from a tool-use event's payload.
 * Claude Code's file-editing tools are widely documented to pass a
 * `file_path` field inside `tool_input`; Codex's equivalent is assumed to
 * follow a similar shape pending live verification against Codex hooks
 * docs (same caveat class as adapters/codex/hooks.ts — flagged there, not
 * re-litigated here). Returns undefined rather than guessing when no
 * known key is present: an unrecognized tool payload should silently
 * contribute nothing, never a fabricated path (G2).
 */
function extractFilePath(payload: Record<string, unknown>): string | undefined {
  const toolInput = payload.tool_input;
  if (toolInput && typeof toolInput === 'object') {
    for (const key of FILE_PATH_KEYS) {
      const value = (toolInput as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.length > 0) return value;
    }
  }
  for (const key of FILE_PATH_KEYS) {
    const value = payload[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/** Aggregates the distinct set of files touched across one interaction's tool events (FR-7). */
export function filesTouched(events: PeblEvent[]): Set<string> {
  const files = new Set<string>();
  for (const event of events) {
    if (!TOOL_EVENT_TYPES.has(event.event_type)) continue;
    const path = extractFilePath(event.payload);
    if (path) files.add(path);
  }
  return files;
}

/** Groups a session's tool events by interaction (prompt_id or turn_id) and aggregates files touched per group. */
export function filesTouchedByInteraction(events: PeblEvent[]): Map<string, Set<string>> {
  const byInteraction = new Map<string, PeblEvent[]>();
  for (const event of events) {
    const interactionId = event.prompt_id ?? event.turn_id;
    if (!interactionId) continue;
    const list = byInteraction.get(interactionId) ?? [];
    list.push(event);
    byInteraction.set(interactionId, list);
  }

  const result = new Map<string, Set<string>>();
  for (const [interactionId, list] of byInteraction) {
    result.set(interactionId, filesTouched(list));
  }
  return result;
}
