import { rmSync } from 'node:fs';
import * as claudeCodeHooks from '../adapters/claude-code/hooks.js';
import * as codexHooks from '../adapters/codex/hooks.js';
import { resolvePeblHome } from '../paths.js';
import { realCommandRunner, type CommandRunner } from '../scheduler/command-runner.js';
import { uninstallScheduler } from '../scheduler/index.js';
import type { SupportedAgent } from './setup.js';

export interface UninstallOptions {
  agent?: SupportedAgent; // undefined = both
  cwd: string;
  purgeData: boolean;
}

/**
 * `pebl uninstall` — removes hook registration and the scheduler entry.
 * Never deletes the local event log or index unless --purge-data is
 * explicitly passed (a separate, deliberate action from uninstalling).
 */
export function runUninstallCommand(
  options: UninstallOptions,
  stdout: NodeJS.WritableStream = process.stdout,
  schedulerRunner: CommandRunner = realCommandRunner,
): void {
  const agents: SupportedAgent[] = options.agent ? [options.agent] : ['claude-code', 'codex'];
  for (const agent of agents) {
    const hooks = agent === 'claude-code' ? claudeCodeHooks : codexHooks;
    hooks.unregisterHooks('global', options.cwd);
    hooks.unregisterHooks('project', options.cwd);
    stdout.write(`pebl: removed ${agent} hooks (global + project scope, if present).\n`);
  }

  uninstallScheduler(schedulerRunner);
  stdout.write('pebl: removed the recheck scheduler entry, if it was installed.\n');

  if (options.purgeData) {
    rmSync(resolvePeblHome(), { recursive: true, force: true });
    stdout.write('pebl: purged all local event data and the index (--purge-data).\n');
  } else {
    stdout.write('pebl: local event data and index left untouched (pass --purge-data to remove them too).\n');
  }
}
