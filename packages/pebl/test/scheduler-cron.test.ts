import { describe, expect, it } from 'vitest';
import {
  buildCrontabWithEntry,
  installCronScheduler,
  isCronSchedulerInstalled,
  removeCrontabEntry,
  uninstallCronScheduler,
} from '../src/scheduler/cron-install.js';
import type { CommandRunner } from '../src/scheduler/command-runner.js';

// IMPORTANT: `run` must mutate `runner.crontab` on this exact returned
// object (not a separately-closed-over variable) — otherwise assertions
// like `expect(runner.crontab)...` silently check a stale snapshot instead
// of the live state, and pass for the wrong reason.
function fakeRunner(initialCrontab: string): CommandRunner & { crontab: string; calls: string[][] } {
  const runner: CommandRunner & { crontab: string; calls: string[][] } = {
    crontab: initialCrontab,
    calls: [],
    run(cmd, args, input) {
      runner.calls.push([cmd, ...args]);
      if (cmd === 'crontab' && args[0] === '-l') return runner.crontab;
      if (cmd === 'crontab' && args[0] === '-') {
        runner.crontab = input ?? '';
        return '';
      }
      throw new Error(`unexpected command: ${cmd} ${args.join(' ')}`);
    },
  };
  return runner;
}

describe('buildCrontabWithEntry (pure)', () => {
  it('appends the entry to a non-empty existing crontab', () => {
    const { content, changed } = buildCrontabWithEntry('0 0 * * * some-other-job\n', 'pebl recheck --due');
    expect(changed).toBe(true);
    expect(content).toContain('some-other-job');
    expect(content).toContain('pebl recheck --due');
  });

  it('does not duplicate the entry if already present', () => {
    const first = buildCrontabWithEntry('', 'pebl recheck --due');
    const second = buildCrontabWithEntry(first.content, 'pebl recheck --due');
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });
});

describe('removeCrontabEntry (pure)', () => {
  it('removes only our marked line, leaving other jobs intact', () => {
    const { content } = buildCrontabWithEntry('0 0 * * * some-other-job\n', 'pebl recheck --due');
    const removed = removeCrontabEntry(content);
    expect(removed.changed).toBe(true);
    expect(removed.content).toContain('some-other-job');
    expect(removed.content).not.toContain('pebl-recheck-scheduler');
  });

  it('reports no change when the marker is absent', () => {
    const removed = removeCrontabEntry('0 0 * * * some-other-job\n');
    expect(removed.changed).toBe(false);
  });
});

describe('install/uninstall via an injected runner (never touches a real crontab)', () => {
  it('installs the entry once and is idempotent on a second call', () => {
    const runner = fakeRunner('');
    const first = installCronScheduler('pebl recheck --due', runner);
    expect(first.changed).toBe(true);
    expect(isCronSchedulerInstalled(runner)).toBe(true);

    const second = installCronScheduler('pebl recheck --due', runner);
    expect(second.changed).toBe(false);
  });

  it('preserves an existing unrelated crontab entry across install and uninstall', () => {
    const runner = fakeRunner('0 0 * * * some-other-job\n');
    installCronScheduler('pebl recheck --due', runner);
    expect(runner.crontab).toContain('some-other-job');

    uninstallCronScheduler(runner);
    expect(runner.crontab).toContain('some-other-job');
    expect(isCronSchedulerInstalled(runner)).toBe(false);
  });

  it('treats a missing crontab (crontab -l fails) as empty, not an error', () => {
    const runner: CommandRunner = {
      run(cmd, args) {
        if (cmd === 'crontab' && args[0] === '-l') throw new Error('no crontab for user');
        return '';
      },
    };
    expect(isCronSchedulerInstalled(runner)).toBe(false);
  });
});
