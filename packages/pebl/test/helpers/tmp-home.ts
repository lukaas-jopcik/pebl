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

/**
 * Points CLAUDE_CONFIG_DIR at a fresh temp directory for the duration of one
 * test file, and cleans it up afterwards. Anything that registers or repairs
 * global Claude Code hooks (e.g. the self-healing check in
 * claude-code-entrypoint.ts) must run under this — nothing should ever read
 * or write a real user's ~/.claude/settings.json (or whatever
 * CLAUDE_CONFIG_DIR happens to point at in the dev/CI environment running
 * these tests).
 */
export function useTempClaudeConfigDir(): void {
  let dir: string;
  let previous: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pebl-test-claude-config-'));
    previous = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = dir;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (previous === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = previous;
    }
  });
}
