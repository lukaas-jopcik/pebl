import { createContext } from '../context.js';
import { indexSingleEvent } from '../db/index.js';
import { appendEvent } from '../events/store.js';
import { isClaudeCodeHookPayload, toPeblEvent } from '../adapters/claude-code/parse.js';
import { runDueRechecks } from '../verification/opportunistic.js';
import { readStdinJson, writeContinueResponse } from './stdin.js';
import { MANAGED_EVENTS, registeredEvents, registerHooks } from '../adapters/claude-code/hooks.js';

/**
 * A concurrently-running Claude Code process can flush its own in-memory
 * settings snapshot back to disk and, if it started before `pebl setup` ran,
 * silently drop our hook entries in the process (observed in practice on a
 * machine running several simultaneous Claude Code sessions sharing one
 * global settings.json). Since the fact that this function is running at all
 * proves our hooks were registered at global scope at some point, it's safe
 * to opportunistically repair that scope on every invocation — this can
 * never newly opt in a machine that hasn't already run `pebl setup`.
 */
function healGlobalHookRegistration(cwd: string): void {
  try {
    const missing = registeredEvents('global', cwd).length < MANAGED_EVENTS.length;
    if (missing) registerHooks('global', cwd);
  } catch {
    // Best-effort: never let self-healing break the "fail open" contract.
  }
}

/**
 * The actual command Claude Code invokes for every registered hook event
 * (see adapters/claude-code/hooks.ts). This must never fail the agent's
 * turn: any error is logged to stderr (stdout must stay a clean JSON
 * response) and a "continue" response is written regardless — matching
 * the System Architecture "fail open" rule (docs/02-engineering/system-architecture.md).
 *
 * Also carries the opportunistic recheck trigger (IMPL §2.6): every hook
 * invocation, for any project, checks whether any commit anywhere is due
 * for its 24h/5d revert recheck and runs it inline. No daemon.
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
    healGlobalHookRegistration(cwd);
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
