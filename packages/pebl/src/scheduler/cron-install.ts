import { realCommandRunner, type CommandRunner } from './command-runner.js';

/** Marks the line this package owns so install/uninstall never touches the user's other cron entries. */
export const CRON_MARKER = '# pebl-recheck-scheduler';

function readCrontab(runner: CommandRunner): string {
  try {
    return runner.run('crontab', ['-l']);
  } catch {
    // No crontab yet (or `crontab` not installed) — treated as empty, not an error.
    return '';
  }
}

/** Pure: builds the new crontab content, or reports no change if our entry already exists. */
export function buildCrontabWithEntry(
  existing: string,
  peblCommand: string,
): { content: string; changed: boolean } {
  if (existing.includes(CRON_MARKER)) return { content: existing, changed: false };
  const line = `0 9 * * * ${peblCommand} ${CRON_MARKER}`;
  const content = existing.trim().length > 0 ? `${existing.trimEnd()}\n${line}\n` : `${line}\n`;
  return { content, changed: true };
}

/** Pure: removes only the line(s) carrying our marker. */
export function removeCrontabEntry(existing: string): { content: string; changed: boolean } {
  const before = existing.split('\n');
  const after = before.filter((line) => !line.includes(CRON_MARKER));
  return { content: after.join('\n'), changed: after.length !== before.length };
}

/**
 * Installs (idempotently) a once-daily crontab entry running the given
 * command, so a project the user hasn't reopened still gets its 24h/5d
 * recheck (opt-in only, per IMPL §2.6 — never installed unless the user
 * asks for it during `pebl setup`).
 */
export function installCronScheduler(
  peblCommand: string,
  runner: CommandRunner = realCommandRunner,
): { changed: boolean } {
  const existing = readCrontab(runner);
  const { content, changed } = buildCrontabWithEntry(existing, peblCommand);
  if (changed) runner.run('crontab', ['-'], content);
  return { changed };
}

export function uninstallCronScheduler(runner: CommandRunner = realCommandRunner): { changed: boolean } {
  const existing = readCrontab(runner);
  const { content, changed } = removeCrontabEntry(existing);
  if (changed) runner.run('crontab', ['-'], content);
  return { changed };
}

export function isCronSchedulerInstalled(runner: CommandRunner = realCommandRunner): boolean {
  return readCrontab(runner).includes(CRON_MARKER);
}
