import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runSetupCommand } from '../src/commands/setup.js';
import { registeredEvents, settingsPath } from '../src/adapters/claude-code/hooks.js';
import type { CommandRunner } from '../src/scheduler/command-runner.js';

let projectDir: string;

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

// Same self-reference requirement as test/scheduler-cron.test.ts's fakeRunner:
// `run` must mutate `runner.crontab` on the returned object itself.
function fakeSchedulerRunner(): CommandRunner & { crontab: string } {
  const runner: CommandRunner & { crontab: string } = {
    crontab: '',
    run(cmd, args, input) {
      if (cmd === 'crontab' && args[0] === '-l') return runner.crontab;
      if (cmd === 'crontab' && args[0] === '-') {
        runner.crontab = input ?? '';
        return '';
      }
      throw new Error(`unexpected: ${cmd} ${args.join(' ')}`);
    },
  };
  return runner;
}

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'pebl-setup-'));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe('runSetupCommand', () => {
  it('registers Claude Code hooks in project scope and reports the path', () => {
    const stdout = captureStdout();
    runSetupCommand(
      { agent: 'claude-code', global: false, scheduler: false, cwd: projectDir },
      stdout.stream,
    );

    expect(registeredEvents('project', projectDir).length).toBeGreaterThan(0);
    expect(stdout.text()).toContain('registered claude-code hooks (project scope)');
    expect(stdout.text()).toContain(settingsPath('project', projectDir));
  });

  it('does not touch the scheduler when the opt-in flag is false', () => {
    const runner = fakeSchedulerRunner();
    const stdout = captureStdout();
    runSetupCommand(
      { agent: 'claude-code', global: false, scheduler: false, cwd: projectDir },
      stdout.stream,
      runner,
    );

    expect(runner.crontab).toBe('');
    expect(stdout.text()).toContain('scheduler not installed');
  });

  it('installs the scheduler (via the injected runner only) when opted in', () => {
    const runner = fakeSchedulerRunner();
    const stdout = captureStdout();
    runSetupCommand(
      { agent: 'claude-code', global: false, scheduler: true, cwd: projectDir },
      stdout.stream,
      runner,
    );

    expect(runner.crontab).toContain('pebl-recheck-scheduler');
    expect(stdout.text()).toContain('installed the daily recheck scheduler');
  });

  it('is idempotent when run twice', () => {
    runSetupCommand({ agent: 'claude-code', global: false, scheduler: false, cwd: projectDir }, captureStdout().stream);
    const before = readFileSync(settingsPath('project', projectDir), 'utf8');

    runSetupCommand({ agent: 'claude-code', global: false, scheduler: false, cwd: projectDir }, captureStdout().stream);
    const after = readFileSync(settingsPath('project', projectDir), 'utf8');

    expect(after).toBe(before);
  });
});
