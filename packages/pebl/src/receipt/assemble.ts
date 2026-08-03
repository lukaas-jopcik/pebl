import type Database from 'better-sqlite3';
import { classifyPrompt } from '../classify/prompt-importance.js';
import { readEvents } from '../events/store.js';
import type { PeblEvent } from '../events/schema.js';
import { filesTouched } from '../verification/files-touched.js';
import { computeMatchWindowEnd } from '../verification/git-watch.js';
import { runInitialVerification } from '../verification/join.js';
import type { ReceiptInput } from './types.js';

const OTEL_TOKEN_METRIC = 'claude_code.token.usage';

function sumOtelTokenUsage(events: PeblEvent[]): number | undefined {
  const values = events
    .map((e) => (e.payload.otel_metric === OTEL_TOKEN_METRIC ? e.payload.otel_value : undefined))
    .filter((v): v is number => typeof v === 'number');
  if (values.length === 0) return undefined;
  return values.reduce((sum, v) => sum + v, 0);
}

const TOOL_CALL_EVENT_TYPES = new Set(['PostToolUse', 'PostToolUseFailure']);

/**
 * Reads the full session from the JSONL log (the SQL index only stores a
 * lossy tool_events projection — file paths and prompt text live in the
 * raw payload, so receipt assembly reads from the source of truth
 * directly rather than reconstructing it from the derived index) and
 * assembles a ReceiptInput: effort metrics, friction counts, classifier
 * signals, and a live Verification Join result. Also records a verified
 * commit into the SQL index's `commits` table so the opportunistic
 * recheck scheduler (src/verification/opportunistic.ts) can find it later.
 */
export async function assembleReceiptInput(
  db: Database.Database,
  projectId: string,
  projectRoot: string,
  sessionId: string,
): Promise<ReceiptInput> {
  const allEvents: PeblEvent[] = [];
  for await (const event of readEvents(projectId)) {
    if (event.session_id === sessionId) allEvents.push(event);
  }

  const sessionStart = allEvents.find((e) => e.event_type === 'SessionStart')?.timestamp;
  const sessionEnd = allEvents.find((e) => e.event_type === 'SessionEnd' || e.event_type === 'Stop')
    ?.timestamp;
  const firstPrompt = allEvents.find((e) => e.event_type === 'UserPromptSubmit');
  // Claude Code's prompt-text field is `user_prompt`; Codex's is `prompt`
  // (verified against https://learn.chatgpt.com/docs/hooks — the two
  // adapters do not share a field name here, so both must be checked).
  const rawIntentText =
    firstPrompt?.payload.user_prompt ?? firstPrompt?.payload.prompt;
  const intentText = typeof rawIntentText === 'string' ? rawIntentText : undefined;

  const toolCallCount = allEvents.filter((e) => TOOL_CALL_EVENT_TYPES.has(e.event_type)).length;
  const permissionDenials = allEvents.filter((e) => e.event_type === 'PermissionDenied').length;
  const failedToolCalls = allEvents.filter((e) => e.event_type === 'PostToolUseFailure').length;
  const tokenCount = sumOtelTokenUsage(allEvents);

  const inSessionSignals = intentText ? classifyPrompt(intentText).signals : [];

  const touchedFiles = filesTouched(allEvents);
  const verification =
    sessionStart && sessionEnd
      ? await runInitialVerification(
          projectRoot,
          touchedFiles,
          sessionStart,
          computeMatchWindowEnd(sessionEnd),
        )
      : { status: 'not_yet_verified' as const, reason: 'no_commit_detected' as const };

  if (verification.status === 'verified' && verification.commitSha) {
    db.prepare(
      `INSERT INTO commits (sha, project_id, interaction_id, matched_at, files) VALUES (@sha, @project_id, NULL, @matched_at, @files)
       ON CONFLICT(sha) DO NOTHING`,
    ).run({
      sha: verification.commitSha,
      project_id: projectId,
      matched_at: sessionEnd ?? new Date().toISOString(),
      files: JSON.stringify(Array.from(touchedFiles)),
    });
  }

  const durationMs =
    sessionStart && sessionEnd ? new Date(sessionEnd).getTime() - new Date(sessionStart).getTime() : undefined;

  const input: ReceiptInput = {
    toolCallCount,
    frictionEvents: { permissionDenials, failedToolCalls, retries: 0 },
    verification,
    inSessionSignals,
  };
  if (intentText !== undefined) input.intentText = intentText;
  if (durationMs !== undefined) input.durationMs = durationMs;
  if (tokenCount !== undefined) input.tokenCount = tokenCount;
  return input;
}

/** Finds the most recently started session for a project, from the SQL index. */
export function findLatestSessionId(db: Database.Database, projectId: string): string | undefined {
  const row = db
    .prepare(
      `SELECT session_id FROM sessions WHERE project_id = ? ORDER BY started_at DESC LIMIT 1`,
    )
    .get(projectId) as { session_id: string } | undefined;
  return row?.session_id;
}
