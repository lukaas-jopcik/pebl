import { Readable, Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { runClaudeCodeHook } from '../src/hooks/claude-code-entrypoint.js';
import { readEvents } from '../src/events/store.js';
import { resolveProjectId } from '../src/paths.js';
import { MANAGED_EVENTS, registerHooks, registeredEvents, unregisterHooks } from '../src/adapters/claude-code/hooks.js';
import { loadFixture } from './helpers/fixtures.js';
import { useTempPeblHome, useTempClaudeConfigDir } from './helpers/tmp-home.js';

useTempPeblHome();
useTempClaudeConfigDir();

function stdinFrom(payload: unknown): Readable {
  return Readable.from([JSON.stringify(payload)]);
}

function captureStdout(): { stream: Writable; text: () => string } {
  let text = '';
  const stream = new Writable({
    write(chunk, _enc, callback) {
      text += chunk.toString();
      callback();
    },
  });
  return { stream, text: () => text };
}

async function drain<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

describe('runClaudeCodeHook end-to-end', () => {
  it('reads a fixture payload from stdin, stores an event, and answers continue on stdout', async () => {
    const payload = loadFixture('claude-code/session-start');
    const stdout = captureStdout();
    const stderr = captureStdout();

    await runClaudeCodeHook(stdinFrom(payload), stdout.stream, stderr.stream);

    expect(stdout.text()).toBe('{"continue":true}');
    expect(stderr.text()).toBe('');

    const projectId = resolveProjectId('/tmp/example-project');
    const events = await drain(readEvents(projectId));
    expect(events).toHaveLength(1);
    expect(events[0]?.event_type).toBe('SessionStart');
    expect(events[0]?.session_id).toBe('cc-session-abc123');
  });

  it('replays a full interaction (prompt -> tool use -> stop) into the log in order', async () => {
    const stdout = captureStdout();
    const stderr = captureStdout();

    for (const fixture of [
      'claude-code/session-start',
      'claude-code/user-prompt-submit',
      'claude-code/post-tool-use',
      'claude-code/stop',
      'claude-code/session-end',
    ]) {
      await runClaudeCodeHook(stdinFrom(loadFixture(fixture)), stdout.stream, stderr.stream);
    }

    const projectId = resolveProjectId('/tmp/example-project');
    const events = await drain(readEvents(projectId));
    expect(events.map((e) => e.event_type)).toEqual([
      'SessionStart',
      'UserPromptSubmit',
      'PostToolUse',
      'Stop',
      'SessionEnd',
    ]);
    expect(stderr.text()).toBe('');
  });

  it('still answers continue and never throws when stdin is malformed JSON', async () => {
    const stdout = captureStdout();
    const stderr = captureStdout();

    await runClaudeCodeHook(Readable.from(['not json at all']), stdout.stream, stderr.stream);

    expect(stdout.text()).toBe('{"continue":true}');
    expect(stderr.text()).toMatch(/pebl: hook handling failed/);
  });

  it('still answers continue for a payload with an unrecognized shape', async () => {
    const stdout = captureStdout();
    const stderr = captureStdout();

    await runClaudeCodeHook(stdinFrom({ foo: 'bar' }), stdout.stream, stderr.stream);

    expect(stdout.text()).toBe('{"continue":true}');
    expect(stderr.text()).toMatch(/ignoring unrecognized/);
  });

  it('self-heals global hook registration if another process wiped it mid-session', async () => {
    const payload = loadFixture('claude-code/session-start');
    const cwd = '/tmp/example-project';

    // Simulate a prior `pebl setup --global`, then a concurrent process
    // flushing a stale settings snapshot that drops our entries.
    registerHooks('global', cwd);
    unregisterHooks('global', cwd);
    expect(registeredEvents('global', cwd)).toHaveLength(0);

    const stdout = captureStdout();
    const stderr = captureStdout();
    await runClaudeCodeHook(stdinFrom(payload), stdout.stream, stderr.stream);

    expect(stdout.text()).toBe('{"continue":true}');
    expect(registeredEvents('global', cwd).sort()).toEqual([...MANAGED_EVENTS].sort());
  });
});
