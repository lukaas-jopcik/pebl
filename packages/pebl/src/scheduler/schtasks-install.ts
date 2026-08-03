import { realCommandRunner, type CommandRunner } from './command-runner.js';

export const SCHTASKS_TASK_NAME = 'pebl-recheck-scheduler';

export function isSchtasksSchedulerInstalled(runner: CommandRunner = realCommandRunner): boolean {
  try {
    runner.run('schtasks', ['/Query', '/TN', SCHTASKS_TASK_NAME]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Installs (idempotently) a once-daily Windows Scheduled Task running the
 * given command — the Windows-parity path for cron-install.ts, same
 * opt-in-only contract (IMPL §2.6/PRD §8's Windows-from-v1 scope).
 */
export function installSchtasksScheduler(
  peblCommand: string,
  runner: CommandRunner = realCommandRunner,
): { changed: boolean } {
  if (isSchtasksSchedulerInstalled(runner)) return { changed: false };
  runner.run('schtasks', [
    '/Create',
    '/TN',
    SCHTASKS_TASK_NAME,
    '/TR',
    peblCommand,
    '/SC',
    'DAILY',
    '/ST',
    '09:00',
    '/F',
  ]);
  return { changed: true };
}

export function uninstallSchtasksScheduler(runner: CommandRunner = realCommandRunner): { changed: boolean } {
  if (!isSchtasksSchedulerInstalled(runner)) return { changed: false };
  runner.run('schtasks', ['/Delete', '/TN', SCHTASKS_TASK_NAME, '/F']);
  return { changed: true };
}
