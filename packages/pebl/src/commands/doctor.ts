import { statSync } from 'node:fs';
import { platform } from 'node:os';
import * as claudeCodeHooks from '../adapters/claude-code/hooks.js';
import * as codexHooks from '../adapters/codex/hooks.js';
import { listRolloutFiles } from '../adapters/codex/rollout.js';
import { realCommandRunner, type CommandRunner } from '../scheduler/command-runner.js';
import { isSchedulerInstalled } from '../scheduler/index.js';

function describeEvents(events: string[]): string {
  return events.length > 0 ? `${events.length} registered` : 'none registered';
}

function detectCodexWorldReadableSessions(): boolean {
  try {
    for (const file of listRolloutFiles().slice(0, 5)) {
      const stat = statSync(file);
      if ((stat.mode & 0o004) !== 0) return true;
    }
  } catch {
    // No rollout files, or Codex isn't used on this machine — not an error.
  }
  return false;
}

/** `pebl doctor` — reports hook registration, scheduler status, and known permission caveats. */
export function runDoctorCommand(
  cwd: string,
  stdout: NodeJS.WritableStream = process.stdout,
  schedulerRunner: CommandRunner = realCommandRunner,
): void {
  const ccGlobal = claudeCodeHooks.registeredEvents('global', cwd);
  const ccProject = claudeCodeHooks.registeredEvents('project', cwd);
  const codexGlobal = codexHooks.registeredEvents('global', cwd);
  const codexProject = codexHooks.registeredEvents('project', cwd);
  const scheduler = isSchedulerInstalled(schedulerRunner);

  stdout.write('pebl doctor\n\n');
  stdout.write(`Claude Code hooks — global: ${describeEvents(ccGlobal)}\n`);
  stdout.write(`Claude Code hooks — project: ${describeEvents(ccProject)}\n`);
  stdout.write(`Codex hooks — global: ${describeEvents(codexGlobal)}\n`);
  stdout.write(`Codex hooks — project: ${describeEvents(codexProject)}\n`);
  stdout.write(
    `Recheck scheduler: ${scheduler ? 'installed' : 'not installed (opportunistic recheck only)'}\n`,
  );

  if (platform() !== 'win32' && detectCodexWorldReadableSessions()) {
    stdout.write(
      'Note: Codex session files are world-readable on this system — a known upstream Codex ' +
        'behavior, not something pebl changes or controls.\n',
    );
  }
}
