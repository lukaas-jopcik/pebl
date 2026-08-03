import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach } from 'vitest';

/**
 * Points PEBL_HOME at a fresh temp directory for the duration of one test
 * file, and cleans it up afterwards. Every test in this repo that touches
 * the filesystem must use this — nothing should ever read or write a real
 * user's ~/.pebl.
 */
export function useTempPeblHome(): void {
  let dir: string;
  let previous: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pebl-test-'));
    previous = process.env.PEBL_HOME;
    process.env.PEBL_HOME = dir;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (previous === undefined) {
      delete process.env.PEBL_HOME;
    } else {
      process.env.PEBL_HOME = previous;
    }
  });
}
