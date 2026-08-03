import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MANAGED_EVENTS,
  registeredEvents,
  registerHooks,
  settingsPath,
  unregisterHooks,
} from '../src/adapters/claude-code/hooks.js';

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'pebl-project-'));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe('claude-code hook registration (global scope honors CLAUDE_CONFIG_DIR)', () => {
  let configDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'pebl-claude-config-'));
    originalEnv = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = configDir;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = originalEnv;
    rmSync(configDir, { recursive: true, force: true });
  });

  it('registers into $CLAUDE_CONFIG_DIR/settings.json, not ~/.claude/settings.json', () => {
    const path = settingsPath('global', projectDir);
    expect(path).toBe(join(configDir, 'settings.json'));

    const { changed } = registerHooks('global', projectDir);
    expect(changed).toBe(true);
    expect(registeredEvents('global', projectDir).sort()).toEqual([...MANAGED_EVENTS].sort());
  });
});

describe('claude-code hook registration (project scope)', () => {
  it('creates .claude/settings.json with all managed events on first run', () => {
    const { changed } = registerHooks('project', projectDir);
    expect(changed).toBe(true);
    expect(registeredEvents('project', projectDir).sort()).toEqual([...MANAGED_EVENTS].sort());
  });

  it('is idempotent: registering twice makes no further changes', () => {
    registerHooks('project', projectDir);
    const path = settingsPath('project', projectDir);
    const contentsAfterFirst = readFileSync(path, 'utf8');

    const { changed } = registerHooks('project', projectDir);
    const contentsAfterSecond = readFileSync(path, 'utf8');

    expect(changed).toBe(false);
    expect(contentsAfterSecond).toBe(contentsAfterFirst);
  });

  it('preserves unrelated top-level settings and other tools hooks on the same event', () => {
    const path = settingsPath('project', projectDir);
    mkdirSync(join(projectDir, '.claude'), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify(
        {
          someOtherSetting: true,
          hooks: {
            PostToolUse: [
              { matcher: 'Bash', hooks: [{ type: 'command', command: 'some-other-tool --watch' }] },
            ],
          },
        },
        null,
        2,
      ),
    );

    registerHooks('project', projectDir);
    const settings = JSON.parse(readFileSync(path, 'utf8'));

    expect(settings.someOtherSetting).toBe(true);
    const postToolUseEntries = settings.hooks.PostToolUse;
    expect(postToolUseEntries).toHaveLength(2);
    expect(
      postToolUseEntries.some((entry: { hooks: { command: string }[] }) =>
        entry.hooks.some((h) => h.command === 'some-other-tool --watch'),
      ),
    ).toBe(true);
    expect(
      postToolUseEntries.some((entry: { hooks: { command: string }[] }) =>
        entry.hooks.some((h) => h.command.includes('hook claude-code')),
      ),
    ).toBe(true);
  });

  it('unregisterHooks removes only pebl entries, leaving other tools intact', () => {
    registerHooks('project', projectDir);
    const path = settingsPath('project', projectDir);
    const settings = JSON.parse(readFileSync(path, 'utf8'));
    settings.hooks.Stop.push({
      hooks: [{ type: 'command', command: 'other-tool-stop-hook' }],
    });
    writeFileSync(path, JSON.stringify(settings, null, 2));

    unregisterHooks('project', projectDir);

    const after = JSON.parse(readFileSync(path, 'utf8'));
    expect(registeredEvents('project', projectDir)).toEqual([]);
    expect(
      after.hooks.Stop.some((entry: { hooks: { command: string }[] }) =>
        entry.hooks.some((h) => h.command === 'other-tool-stop-hook'),
      ),
    ).toBe(true);
  });

  it('uses a wildcard matcher for tool-scoped events', () => {
    registerHooks('project', projectDir);
    const path = settingsPath('project', projectDir);
    const settings = JSON.parse(readFileSync(path, 'utf8'));

    expect(settings.hooks.PostToolUse[0].matcher).toBe('*');
    expect(settings.hooks.SessionStart[0].matcher).toBeUndefined();
  });
});
