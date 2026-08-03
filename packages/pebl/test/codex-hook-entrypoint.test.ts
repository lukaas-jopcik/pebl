import { Readable, Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { runCodexHook } from '../src/hooks/codex-entrypoint.js';
import { readEvents } from '../src/events/store.js';
import { resolveProjectId } from '../src/paths.js';
import { loadFixture } from './helpers/fixtures.js';
import { useTempPeblHome } from './helpers/tmp-home.js';

useTempPeblHome();

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

describe('runCodexHook end-to-end', () => {
  it('reads a fixture payload from stdin, stores an event tagged source=codex, and answers continue', async () => {
    const payload = loadFixture('codex/session-start');
    const stdout = captureStdout();
    const stderr = captureStdout();

    await runCodexHook(stdinFrom(payload), stdout.stream, stderr.stream);

    expect(stdout.text()).toBe('{"continue":true}');
    expect(stderr.text()).toBe('');

    const projectId = resolveProjectId('/tmp/example-codex-project');
    const events = await drain(readEvents(projectId));
    expect(events).toHaveLength(1);
    expect(events[0]?.source).toBe('codex');
    expect(events[0]?.event_type).toBe('SessionStart');
  });

  it('replays a full interaction (prompt -> tool use -> stop) into the log in order', async () => {
    const stdout = captureStdout();
    const stderr = captureStdout();

    for (const fixture of [
      'codex/session-start',
      'codex/user-prompt-submit',
      'codex/post-tool-use',
      'codex/stop',
      'codex/session-end',
    ]) {
      await runCodexHook(stdinFrom(loadFixture(fixture)), stdout.stream, stderr.stream);
    }

    const projectId = resolveProjectId('/tmp/example-codex-project');
    const events = await drain(readEvents(projectId));
    expect(events.map((e) => e.event_type)).toEqual([
      'SessionStart',
      'UserPromptSubmit',
      'PostToolUse',
      'Stop',
      'SessionEnd',
    ]);
    expect(events.every((e) => e.source === 'codex')).toBe(true);
    expect(stderr.text()).toBe('');
  });

  it('never throws on malformed stdin and still answers continue', async () => {
    const stdout = captureStdout();
    const stderr = captureStdout();

    await runCodexHook(Readable.from(['{not valid']), stdout.stream, stderr.stream);

    expect(stdout.text()).toBe('{"continue":true}');
    expect(stderr.text()).toMatch(/pebl: hook handling failed/);
  });
});
