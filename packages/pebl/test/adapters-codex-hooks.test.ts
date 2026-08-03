import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MANAGED_EVENTS,
  registeredEvents,
  registerHooks,
  unregisterHooks,
} from '../src/adapters/codex/hooks.js';

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'pebl-codex-project-'));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe('codex hook registration (project scope)', () => {
  it('creates .codex/hooks.json with all managed events on first run', () => {
    const { changed, path } = registerHooks('project', projectDir);
    expect(changed).toBe(true);
    expect(path).toBe(join(projectDir, '.codex', 'hooks.json'));
    expect(registeredEvents('project', projectDir).sort()).toEqual([...MANAGED_EVENTS].sort());
  });

  it('is idempotent: registering twice makes no further changes', () => {
    const { path } = registerHooks('project', projectDir);
    const first = readFileSync(path, 'utf8');

    const { changed } = registerHooks('project', projectDir);
    const second = readFileSync(path, 'utf8');

    expect(changed).toBe(false);
    expect(second).toBe(first);
  });

  it('unregisterHooks removes only pebl entries', () => {
    registerHooks('project', projectDir);
    unregisterHooks('project', projectDir);
    expect(registeredEvents('project', projectDir)).toEqual([]);
  });

  it('uses a wildcard matcher for tool-scoped events only', () => {
    const { path } = registerHooks('project', projectDir);
    const config = JSON.parse(readFileSync(path, 'utf8'));

    expect(config.hooks.PostToolUse[0].matcher).toBe('*');
    expect(config.hooks.SessionStart[0].matcher).toBeUndefined();
  });
});
