import { appendEvent } from '../events/store.js';
import { isCodexHookPayload, toPeblEvent } from '../adapters/codex/parse.js';
import { resolveProjectId } from '../paths.js';
import { readStdinJson, writeContinueResponse } from './stdin.js';

/**
 * The command Codex invokes for every registered hook event (see
 * adapters/codex/hooks.ts, including its config-format caveat). Same
 * fail-open contract as the Claude Code entrypoint: never fail the
 * agent's turn over a hook-handling error.
 */
export async function runCodexHook(
  stdin: NodeJS.ReadableStream = process.stdin,
  stdout: NodeJS.WritableStream = process.stdout,
  stderr: NodeJS.WritableStream = process.stderr,
): Promise<void> {
  try {
    const raw = await readStdinJson(stdin);
    if (!isCodexHookPayload(raw)) {
      stderr.write('pebl: ignoring unrecognized Codex hook payload\n');
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
