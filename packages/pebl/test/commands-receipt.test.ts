import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runReceiptCommand } from '../src/commands/receipt.js';
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

describe('runReceiptCommand', () => {
  it('reports no sessions when nothing has been recorded yet', async () => {
    const stdout = captureStdout();
    await runReceiptCommand(context, {}, stdout.stream);
    expect(stdout.text()).toContain('no sessions recorded');
  });

  it('renders a receipt for the most recent session when no --session is given', async () => {
    appendEvent(
      makeEvent({
        project_id: context.projectId,
        session_id: 'sess-x',
        event_type: 'SessionStart',
        timestamp: '2026-08-03T10:00:00.000Z',
        payload: { cwd: repo.dir },
      }),
    );
    appendEvent(
      makeEvent({
        project_id: context.projectId,
        session_id: 'sess-x',
        event_type: 'SessionEnd',
        timestamp: '2026-08-03T10:01:00.000Z',
        payload: {},
      }),
    );
    await rebuildIndex(context.db);

    const stdout = captureStdout();
    await runReceiptCommand(context, {}, stdout.stream);

    expect(stdout.text()).toContain('not yet verified');
    expect(stdout.text()).toContain('Confidence:');
  });

  it('renders a receipt for an explicitly requested session id', async () => {
    appendEvent(
      makeEvent({
        project_id: context.projectId,
        session_id: 'explicit-sess',
        event_type: 'SessionStart',
        timestamp: '2026-08-03T10:00:00.000Z',
        payload: { cwd: repo.dir },
      }),
    );
    await rebuildIndex(context.db);

    const stdout = captureStdout();
    await runReceiptCommand(context, { sessionId: 'explicit-sess' }, stdout.stream);
    expect(stdout.text()).toContain('Confidence:');
  });
});
