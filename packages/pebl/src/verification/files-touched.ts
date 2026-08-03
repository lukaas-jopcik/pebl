import type { PeblEvent } from '../events/schema.js';

const FILE_PATH_KEYS = ['file_path', 'filePath', 'path'] as const;
const TOOL_EVENT_TYPES = new Set(['PreToolUse', 'PostToolUse', 'PostToolUseFailure']);

/**
 * Codex's `apply_patch` tool (its default file-editing tool, per
 * https://learn.chatgpt.com/docs/hooks: "Bash and apply_patch use
 * tool_input.command") does not carry a structured file-path field at
 * all — the path is embedded inside a V4A patch document, e.g.
 * `tool_input.command = ["apply_patch", "*** Begin Patch\n*** Update File: src/a.ts\n@@ ...\n*** End Patch\n"]`
 * (confirmed against openai/codex's apply_patch_tool_instructions.md).
 * Without this parser, files-touched would silently find nothing for
 * every Codex session using its primary file-editing tool — not an
 * edge case, the common case. Handles Add/Delete/Update File headers
 * and a following "Move to" (rename) line.
 */
const PATCH_FILE_HEADER_PATTERN = /^\*\*\* (?:Add File|Delete File|Update File|Move to): (.+)$/;

function extractApplyPatchFilePaths(payload: Record<string, unknown>): string[] {
  const toolInput = payload.tool_input;
  if (!toolInput || typeof toolInput !== 'object') return [];
  const command = (toolInput as Record<string, unknown>).command;
  if (!Array.isArray(command)) return [];

  const patchText = command.find(
    (part): part is string => typeof part === 'string' && part.includes('*** Begin Patch'),
  );
  if (!patchText) return [];

  const paths: string[] = [];
  for (const line of patchText.split('\n')) {
    const match = PATCH_FILE_HEADER_PATTERN.exec(line.trim());
    if (match?.[1]) paths.push(match[1].trim());
  }
  return paths;
}

/**
 * Best-effort file-path extraction from a tool-use event's payload.
 * Claude Code's file-editing tools pass a `file_path` field inside
 * `tool_input`; Codex's `apply_patch` needs the dedicated parser above.
 * Returns an empty array rather than guessing when nothing recognizable
 * is present: an unrecognized tool payload should silently contribute
 * nothing, never a fabricated path (G2).
 */
function extractFilePaths(payload: Record<string, unknown>): string[] {
  const toolInput = payload.tool_input;
  if (toolInput && typeof toolInput === 'object') {
    for (const key of FILE_PATH_KEYS) {
      const value = (toolInput as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.length > 0) return [value];
    }
  }
  for (const key of FILE_PATH_KEYS) {
    const value = payload[key];
    if (typeof value === 'string' && value.length > 0) return [value];
  }
  return extractApplyPatchFilePaths(payload);
}

/** Aggregates the distinct set of files touched across one interaction's tool events (FR-7). */
export function filesTouched(events: PeblEvent[]): Set<string> {
  const files = new Set<string>();
  for (const event of events) {
    if (!TOOL_EVENT_TYPES.has(event.event_type)) continue;
    for (const path of extractFilePaths(event.payload)) files.add(path);
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
