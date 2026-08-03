import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runDoctorCommand } from '../src/commands/doctor.js';
import { runSetupCommand } from '../src/commands/setup.js';
import { runUninstallCommand } from '../src/commands/uninstall.js';
import { registeredEvents as claudeCodeRegisteredEvents } from '../src/adapters/claude-code/hooks.js';
import type { CommandRunner } from '../src/scheduler/command-runner.js';
import { useTempPeblHome } from './helpers/tmp-home.js';

useTempPeblHome();

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

function fakeSchedulerRunner(initialCrontab = ''): CommandRunner & { crontab: string } {
  const runner: CommandRunner & { crontab: string } = {
    crontab: initialCrontab,
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
  projectDir = mkdtempSync(join(tmpdir(), 'pebl-doctor-'));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe('runDoctorCommand', () => {
  it('reports no hooks registered on a fresh project', () => {
    const runner = fakeSchedulerRunner();
    const stdout = captureStdout();
    runDoctorCommand(projectDir, stdout.stream, runner);

    expect(stdout.text()).toContain('Claude Code hooks — project: none registered');
    expect(stdout.text()).toContain('Codex hooks — project: none registered');
    expect(stdout.text()).toContain('Recheck scheduler: not installed');
  });

  it('reflects hooks and scheduler state after setup', () => {
    const runner = fakeSchedulerRunner();
    runSetupCommand({ agent: 'claude-code', global: false, scheduler: true, cwd: projectDir }, captureStdout().stream, runner);

    const stdout = captureStdout();
    runDoctorCommand(projectDir, stdout.stream, runner);

    expect(stdout.text()).toContain('Claude Code hooks — project: 8 registered');
    expect(stdout.text()).toContain('Recheck scheduler: installed');
  });
});

describe('runUninstallCommand', () => {
  it('removes registered hooks but leaves event data untouched by default', () => {
    const runner = fakeSchedulerRunner();
    runSetupCommand({ agent: 'claude-code', global: false, scheduler: true, cwd: projectDir }, captureStdout().stream, runner);
    expect(claudeCodeRegisteredEvents('project', projectDir).length).toBeGreaterThan(0);

    const stdout = captureStdout();
    runUninstallCommand({ agent: 'claude-code', cwd: projectDir, purgeData: false }, stdout.stream, runner);

    expect(claudeCodeRegisteredEvents('project', projectDir)).toEqual([]);
    expect(runner.crontab).not.toContain('pebl-recheck-scheduler');
    expect(stdout.text()).toContain('left untouched');
  });

  it('purges local data when --purge-data is passed', () => {
    const runner = fakeSchedulerRunner();
    const stdout = captureStdout();
    runUninstallCommand({ cwd: projectDir, purgeData: true }, stdout.stream, runner);
    expect(stdout.text()).toContain('purged all local event data');
  });
});
