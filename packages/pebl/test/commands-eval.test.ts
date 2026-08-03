import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runEvalCommand } from '../src/commands/eval.js';
import { createContext, type CliContext } from '../src/context.js';
import { rebuildIndex } from '../src/db/index.js';
import { appendEvent } from '../src/events/store.js';
import { makeEvent } from './helpers/fixtures.js';
import { createTempGitRepo, type TempGitRepo } from './helpers/git-repo.js';
import { useTempPeblHome } from './helpers/tmp-home.js';

useTempPeblHome();

let repo: TempGitRepo;
let context: CliContext;

function captureStdout(): { stream: NodeJS.WritableStream; text: () => string } {
  let text = '';
  const stream = {
    write(chunk: string) {
      text += chunk;
      return true;
    },
  } as NodeJS.WritableStream;
  return { stream, text: () => text };
}

beforeEach(async () => {
  repo = createTempGitRepo();
  context = await createContext(repo.dir);
});

afterEach(() => {
  context.db.close();
  repo.cleanup();
});

describe('runEvalCommand', () => {
  it('reports nothing to evaluate when no sessions exist', async () => {
    const stdout = captureStdout();
    await runEvalCommand(context, { sessionLimit: 200 }, stdout.stream);
    expect(stdout.text()).toContain('nothing to evaluate');
  });

  it('emits a CSV row per session and never claims a precision number itself', async () => {
    appendEvent(
      makeEvent({
        project_id: context.projectId,
        session_id: 'sess-a',
        event_type: 'SessionStart',
        timestamp: '2026-08-01T10:00:00.000Z',
      }),
    );
    appendEvent(
      makeEvent({
        project_id: context.projectId,
        session_id: 'sess-b',
        event_type: 'SessionStart',
        timestamp: '2026-08-02T10:00:00.000Z',
      }),
    );
    await rebuildIndex(context.db);

    const stdout = captureStdout();
    await runEvalCommand(context, { sessionLimit: 200 }, stdout.stream);
    const output = stdout.text();

    expect(output).toContain('session_id,status,reason,commit_sha');
    expect(output).toContain('sess-a');
    expect(output).toContain('sess-b');
    expect(output).not.toMatch(/precision[:=]\s*\d/i); // never asserts a computed number
    expect(output).toContain('never the verdict');
  });

  it('respects the session limit', async () => {
    for (let i = 0; i < 5; i += 1) {
      appendEvent(
        makeEvent({
          project_id: context.projectId,
          session_id: `sess-${i}`,
          event_type: 'SessionStart',
          timestamp: `2026-08-0${i + 1}T10:00:00.000Z`,
        }),
      );
    }
    await rebuildIndex(context.db);

    const stdout = captureStdout();
    await runEvalCommand(context, { sessionLimit: 2 }, stdout.stream);
    expect(stdout.text()).toContain('wrote 2 row(s)');
  });
});
