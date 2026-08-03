import { createContext } from '../context.js';
import { indexSingleEvent } from '../db/index.js';
import { appendEvent } from '../events/store.js';
import { isCodexHookPayload, toPeblEvent } from '../adapters/codex/parse.js';
import { runDueRechecks } from '../verification/opportunistic.js';
import { readStdinJson, writeContinueResponse } from './stdin.js';

/**
 * The command Codex invokes for every registered hook event (see
 * adapters/codex/hooks.ts, including its config-format caveat). Same
 * fail-open contract as the Claude Code entrypoint, including the
 * opportunistic recheck trigger (IMPL §2.6) — no daemon.
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
    const context = await createContext(cwd);
    try {
      const event = toPeblEvent(raw, context.projectId);
      appendEvent(event);
      indexSingleEvent(context.db, event);
      runDueRechecks(context.db);
    } finally {
      context.db.close();
    }
  } catch (err) {
    stderr.write(`pebl: hook handling failed, continuing anyway: ${String(err)}\n`);
  }
  writeContinueResponse(stdout);
}
