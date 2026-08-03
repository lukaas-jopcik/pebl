import { appendEvent } from '../events/store.js';
import { isClaudeCodeHookPayload, toPeblEvent } from '../adapters/claude-code/parse.js';
import { resolveProjectId } from '../paths.js';
import { readStdinJson, writeContinueResponse } from './stdin.js';

/**
 * The actual command Claude Code invokes for every registered hook event
 * (see adapters/claude-code/hooks.ts). This must never fail the agent's
 * turn: any error is logged to stderr (stdout must stay a clean JSON
 * response) and a "continue" response is written regardless — matching
 * the System Architecture "fail open" rule (docs/02-engineering/system-architecture.md).
 */
export async function runClaudeCodeHook(
  stdin: NodeJS.ReadableStream = process.stdin,
  stdout: NodeJS.WritableStream = process.stdout,
  stderr: NodeJS.WritableStream = process.stderr,
): Promise<void> {
  try {
    const raw = await readStdinJson(stdin);
    if (!isClaudeCodeHookPayload(raw)) {
      stderr.write('pebl: ignoring unrecognized Claude Code hook payload\n');
      writeContinueResponse(stdout);
      return;
    }
    const cwd = raw.cwd ?? process.cwd();
    const projectId = resolveProjectId(cwd);
    const event = toPeblEvent(raw, projectId);
    appendEvent(event);
  } catch (err) {
    stderr.write(`pebl: hook handling failed, continuing anyway: ${String(err)}\n`);
  }
  writeContinueResponse(stdout);
}
