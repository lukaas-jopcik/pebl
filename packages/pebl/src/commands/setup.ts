import * as claudeCodeHooks from '../adapters/claude-code/hooks.js';
import * as codexHooks from '../adapters/codex/hooks.js';
import { installScheduler } from '../scheduler/index.js';
import { realCommandRunner, type CommandRunner } from '../scheduler/command-runner.js';

export type SupportedAgent = 'claude-code' | 'codex';

export interface SetupOptions {
  agent: SupportedAgent;
  global: boolean;
  scheduler: boolean;
  cwd: string;
}

function hooksModuleFor(agent: SupportedAgent) {
  return agent === 'claude-code' ? claudeCodeHooks : codexHooks;
}

/**
 * `pebl setup` — registers hooks for one agent, and only installs the
 * OS-native recheck scheduler if explicitly opted in (default false,
 * per IMPL §2.6: "off by default, opt-in prompt"). Never installs
 * anything the user didn't ask for.
 */
export function runSetupCommand(
  options: SetupOptions,
  stdout: NodeJS.WritableStream = process.stdout,
  schedulerRunner: CommandRunner = realCommandRunner,
): void {
  const scope = options.global ? 'global' : 'project';
  const hooks = hooksModuleFor(options.agent);
  const { path, changed } = hooks.registerHooks(scope, options.cwd);

  stdout.write(
    `pebl: ${changed ? 'registered' : 'already registered'} ${options.agent} hooks (${scope} scope) at ${path}\n`,
  );

  if (options.scheduler) {
    const result = installScheduler('pebl recheck --due', schedulerRunner);
    stdout.write(
      `pebl: ${result.changed ? 'installed' : 'already installed'} the daily recheck scheduler.\n`,
    );
  } else {
    stdout.write(
      'pebl: scheduler not installed (pass --scheduler to opt in). ' +
        'Rechecks still run opportunistically whenever a hook fires for a project.\n',
    );
  }
}
