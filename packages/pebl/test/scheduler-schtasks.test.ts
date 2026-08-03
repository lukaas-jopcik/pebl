import { describe, expect, it } from 'vitest';
import {
  installSchtasksScheduler,
  isSchtasksSchedulerInstalled,
  uninstallSchtasksScheduler,
} from '../src/scheduler/schtasks-install.js';
import type { CommandRunner } from '../src/scheduler/command-runner.js';

function fakeRunner(initiallyInstalled: boolean): CommandRunner & { installed: boolean; calls: string[][] } {
  const state = { installed: initiallyInstalled, calls: [] as string[][] };
  return {
    ...state,
    run(cmd, args) {
      state.calls.push([cmd, ...args]);
      if (cmd !== 'schtasks') throw new Error(`unexpected command: ${cmd}`);
      if (args[0] === '/Query') {
        if (!state.installed) throw new Error('ERROR: task not found');
        return 'ok';
      }
      if (args[0] === '/Create') {
        state.installed = true;
        return '';
      }
      if (args[0] === '/Delete') {
        state.installed = false;
        return '';
      }
      throw new Error(`unexpected schtasks args: ${args.join(' ')}`);
    },
  };
}

describe('schtasks scheduler (via an injected runner, never touches a real Task Scheduler)', () => {
  it('installs the task once and is idempotent on a second call', () => {
    const runner = fakeRunner(false);
    const first = installSchtasksScheduler('pebl recheck --due', runner);
    expect(first.changed).toBe(true);
    expect(isSchtasksSchedulerInstalled(runner)).toBe(true);

    const second = installSchtasksScheduler('pebl recheck --due', runner);
    expect(second.changed).toBe(false);
  });

  it('uninstalls a previously installed task', () => {
    const runner = fakeRunner(true);
    const result = uninstallSchtasksScheduler(runner);
    expect(result.changed).toBe(true);
    expect(isSchtasksSchedulerInstalled(runner)).toBe(false);
  });

  it('reports no change when uninstalling a task that was never installed', () => {
    const runner = fakeRunner(false);
    const result = uninstallSchtasksScheduler(runner);
    expect(result.changed).toBe(false);
  });
});
