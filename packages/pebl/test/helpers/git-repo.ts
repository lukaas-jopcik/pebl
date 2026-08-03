import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

export interface TempGitRepo {
  dir: string;
  /** Writes the given files (path -> content) and commits them, optionally at a fixed author/committer date. */
  commit(files: Record<string, string>, opts?: { dateIso?: string; message?: string }): string;
  cleanup(): void;
}

function run(dir: string, args: string[]): void {
  execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' });
}

/** A real, disposable git repository for integration tests — no mocking of git itself. */
export function createTempGitRepo(): TempGitRepo {
  const dir = mkdtempSync(join(tmpdir(), 'pebl-git-'));
  run(dir, ['init', '-q', '-b', 'main']);
  run(dir, ['config', 'user.email', 'test@example.com']);
  run(dir, ['config', 'user.name', 'Pebl Test']);

  return {
    dir,
    commit(files, opts) {
      for (const [relPath, content] of Object.entries(files)) {
        const full = join(dir, relPath);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, content, 'utf8');
      }
      run(dir, ['add', '.']);
      const env = opts?.dateIso
        ? { ...process.env, GIT_AUTHOR_DATE: opts.dateIso, GIT_COMMITTER_DATE: opts.dateIso }
        : process.env;
      execFileSync('git', ['-C', dir, 'commit', '-q', '-m', opts?.message ?? 'test commit'], {
        env,
        stdio: 'ignore',
      });
      return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
