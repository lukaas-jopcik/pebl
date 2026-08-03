import { dirname, join } from 'node:path';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

export interface TempProject {
  dir: string;
  write(relPath: string, content: string): void;
  cleanup(): void;
}

/** A throwaway project directory for filesystem-convention-detection tests. */
export function createTempProject(files: Record<string, string> = {}): TempProject {
  const dir = mkdtempSync(join(tmpdir(), 'pebl-project-'));

  const write = (relPath: string, content: string): void => {
    const full = join(dir, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf8');
  };

  for (const [relPath, content] of Object.entries(files)) write(relPath, content);

  return {
    dir,
    write,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
