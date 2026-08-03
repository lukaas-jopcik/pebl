import { platform } from 'node:os';
import { realCommandRunner, type CommandRunner } from './command-runner.js';
import { installCronScheduler, isCronSchedulerInstalled, uninstallCronScheduler } from './cron-install.js';
import {
  installSchtasksScheduler,
  isSchtasksSchedulerInstalled,
  uninstallSchtasksScheduler,
} from './schtasks-install.js';

/**
 * Picks cron (macOS/Linux) or Task Scheduler (Windows) based on the
 * current platform. `runner` defaults to the real OS scheduler but is
 * always overridable — every caller in this codebase that might run
 * under test MUST accept/forward a runner rather than relying on the
 * default, so automated tests never touch a real crontab/Task Scheduler.
 */
export function installScheduler(
  peblCommand: string,
  runner: CommandRunner = realCommandRunner,
): { changed: boolean } {
  return platform() === 'win32'
    ? installSchtasksScheduler(peblCommand, runner)
    : installCronScheduler(peblCommand, runner);
}

export function uninstallScheduler(runner: CommandRunner = realCommandRunner): { changed: boolean } {
  return platform() === 'win32' ? uninstallSchtasksScheduler(runner) : uninstallCronScheduler(runner);
}

export function isSchedulerInstalled(runner: CommandRunner = realCommandRunner): boolean {
  return platform() === 'win32' ? isSchtasksSchedulerInstalled(runner) : isCronSchedulerInstalled(runner);
}
