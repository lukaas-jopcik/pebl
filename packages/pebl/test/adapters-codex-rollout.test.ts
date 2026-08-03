import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EmptyRolloutFileError,
  findRolloutForSession,
  listRolloutFiles,
  readRolloutFile,
  resetWorldReadableWarningForTests,
} from '../src/adapters/codex/rollout.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pebl-codex-sessions-'));
  resetWorldReadableWarningForTests();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeRolloutFile(
  relPath: string,
  header: Record<string, unknown>,
  lines: Record<string, unknown>[],
): string {
  const full = join(root, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  const content = [JSON.stringify(header), ...lines.map((l) => JSON.stringify(l))].join('\n') + '\n';
  writeFileSync(full, content, 'utf8');
  return full;
}

describe('codex rollout files', () => {
  it('discovers rollout files nested under YYYY/MM/DD', () => {
    writeRolloutFile('2026/08/03/rollout-100000-aaa.jsonl', { session_id: 's1' }, []);
    writeRolloutFile('2026/08/03/rollout-110000-bbb.jsonl', { session_id: 's2' }, []);
    writeRolloutFile('2026/08/04/rollout-090000-ccc.jsonl', { session_id: 's3' }, []);

    const files = listRolloutFiles(root);
    expect(files).toHaveLength(3);
    expect(files.every((f) => f.endsWith('.jsonl'))).toBe(true);
  });

  it('ignores non-rollout files and returns [] for a missing root', () => {
    mkdirSync(join(root, '2026', '08', '03'), { recursive: true });
    writeFileSync(join(root, '2026', '08', '03', 'notes.txt'), 'irrelevant');

    expect(listRolloutFiles(root)).toEqual([]);
    expect(listRolloutFiles(join(root, 'does-not-exist'))).toEqual([]);
  });

  it('parses the header line separately from the event lines', async () => {
    const path = writeRolloutFile(
      '2026/08/03/rollout-100000-aaa.jsonl',
      { session_id: 's1', model_provider: 'openai' },
      [{ type: 'event', name: 'SessionStart' }, { type: 'event', name: 'Stop' }],
    );

    const parsed = await readRolloutFile(path);
    expect(parsed.header.session_id).toBe('s1');
    expect(parsed.lines).toHaveLength(2);
  });

  it('throws EmptyRolloutFileError for a file with no header line', async () => {
    const path = join(root, 'empty.jsonl');
    writeFileSync(path, '');
    await expect(readRolloutFile(path)).rejects.toThrow(EmptyRolloutFileError);
  });

  it('findRolloutForSession locates the matching file by header session_id', async () => {
    writeRolloutFile('2026/08/03/rollout-100000-aaa.jsonl', { session_id: 'target' }, [{ a: 1 }]);
    writeRolloutFile('2026/08/03/rollout-110000-bbb.jsonl', { session_id: 'other' }, []);

    const found = await findRolloutForSession('target', root);
    expect(found?.lines).toEqual([{ a: 1 }]);
  });

  it('findRolloutForSession returns undefined (not an error) when no file matches yet', async () => {
    const found = await findRolloutForSession('never-written', root);
    expect(found).toBeUndefined();
  });

  it.skipIf(platform() === 'win32')(
    'warns once (not repeatedly) about world-readable session files',
    async () => {
      const path = writeRolloutFile('2026/08/03/rollout-100000-aaa.jsonl', { session_id: 's1' }, []);
      chmodSync(path, 0o644);

      let warnings = '';
      const stderr = {
        write: (chunk: string) => {
          warnings += chunk;
          return true;
        },
      } as NodeJS.WritableStream;

      const { warnIfWorldReadable } = await import('../src/adapters/codex/rollout.js');
      warnIfWorldReadable(path, stderr);
      warnIfWorldReadable(path, stderr);
      warnIfWorldReadable(path, stderr);

      const occurrences = warnings.split('world-readable').length - 1;
      expect(occurrences).toBe(1);
    },
  );
});
