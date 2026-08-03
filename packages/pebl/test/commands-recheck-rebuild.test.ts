import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runRecheckCommand } from '../src/commands/recheck.js';
import { runRebuildIndexCommand } from '../src/commands/rebuild-index.js';
import { createContext, type CliContext } from '../src/context.js';
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

describe('runRecheckCommand', () => {
  it('reports zero due checks against an empty index', () => {
    const stdout = captureStdout();
    runRecheckCommand(context, stdout.stream);
    expect(stdout.text()).toContain('checked 0 due verification checkpoint(s)');
  });

  it('reports a due, verified checkpoint for a real commit', () => {
    const sha = repo.commit({ 'a.txt': 'v1' }, { dateIso: '2026-08-01T10:00:00Z' });
    context.db
      .prepare(`INSERT INTO projects (project_id, root_path, updated_at) VALUES (?, ?, ?)`)
      .run(context.projectId, repo.dir, new Date().toISOString());
    context.db
      .prepare(
        `INSERT INTO commits (sha, project_id, interaction_id, matched_at, files) VALUES (?, ?, NULL, ?, '[]')`,
      )
      .run(sha, context.projectId, '2026-08-01T10:00:00.000Z');

    const stdout = captureStdout();
    runRecheckCommand(context, stdout.stream);
    expect(stdout.text()).toContain('checked 1 due verification checkpoint(s)');
  });
});

describe('runRebuildIndexCommand', () => {
  it('replays the JSONL log into the SQL index and reports success', async () => {
    appendEvent(
      makeEvent({
        project_id: context.projectId,
        session_id: 'sess-rebuild',
        event_type: 'SessionStart',
      }),
    );

    const stdout = captureStdout();
    await runRebuildIndexCommand(context, stdout.stream);

    expect(stdout.text()).toContain('index rebuilt');
    const row = context.db.prepare('SELECT * FROM sessions WHERE session_id = ?').get('sess-rebuild');
    expect(row).toBeDefined();
  });
});
