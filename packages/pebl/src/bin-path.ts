import { resolve } from 'node:path';

/**
 * Absolute path to the currently-running `pebl` executable, resolved once at
 * hook-registration time. Hook runners are not guaranteed to invoke commands
 * with the same PATH as the interactive shell that ran `pebl setup` — a bare
 * `pebl` command name has been observed to silently fail to resolve in at
 * least one real Claude Code hook runner, even though it registers cleanly.
 * Writing the absolute path removes the PATH dependency entirely.
 */
export function peblBinPath(): string {
  return resolve(process.argv[1] ?? 'pebl');
}
