import { Command } from 'commander';
import { runClaudeCodeHook } from './hooks/claude-code-entrypoint.js';
import { runCodexHook } from './hooks/codex-entrypoint.js';
import { writeContinueResponse } from './hooks/stdin.js';
import { createContext } from './context.js';
import { runSetupCommand, type SupportedAgent } from './commands/setup.js';
import { runReceiptCommand } from './commands/receipt.js';
import { runRecheckCommand } from './commands/recheck.js';
import { runRebuildIndexCommand } from './commands/rebuild-index.js';
import { runDoctorCommand } from './commands/doctor.js';
import { runUninstallCommand } from './commands/uninstall.js';

const program = new Command();

program
  .name('pebl')
  .description('Local-only AI Task Receipts for Claude Code and Codex CLI.')
  .version('0.1.0');

program
  .command('hook <agent> <event>')
  .description('Internal: invoked by the agent itself on each registered hook event.')
  .action(async (agent: string) => {
    if (agent === 'claude-code') {
      await runClaudeCodeHook();
      return;
    }
    if (agent === 'codex') {
      await runCodexHook();
      return;
    }
    // Never break the agent's turn over an agent we don't handle.
    process.stderr.write(`pebl: no handler for agent "${agent}" yet\n`);
    writeContinueResponse();
  });

program
  .command('setup')
  .description('Register hooks for an agent (and optionally the daily recheck scheduler).')
  .requiredOption('--agent <agent>', 'claude-code or codex')
  .option('--global', 'register in the global (per-user) config instead of this project', false)
  .option('--scheduler', 'also install the optional daily OS-native recheck scheduler', false)
  .action((opts: { agent: string; global: boolean; scheduler: boolean }) => {
    if (opts.agent !== 'claude-code' && opts.agent !== 'codex') {
      process.stderr.write(`pebl: --agent must be "claude-code" or "codex", got "${opts.agent}"\n`);
      process.exitCode = 1;
      return;
    }
    runSetupCommand({
      agent: opts.agent as SupportedAgent,
      global: opts.global,
      scheduler: opts.scheduler,
      cwd: process.cwd(),
    });
  });

program
  .command('receipt')
  .description('Render a receipt for a session (defaults to the most recent one).')
  .option('--session <sessionId>', 'render this specific session id instead of the most recent one')
  .action(async (opts: { session?: string }) => {
    const context = await createContext();
    try {
      await runReceiptCommand(context, opts.session ? { sessionId: opts.session } : {});
    } finally {
      context.db.close();
    }
  });

program
  .command('recheck')
  .description('Run any due 24h/5d verification rechecks. Also invoked by the optional daily scheduler.')
  .option('--due', 'no-op flag kept for compatibility with the scheduler invocation string', false)
  .action(async () => {
    const context = await createContext();
    try {
      runRecheckCommand(context);
    } finally {
      context.db.close();
    }
  });

program
  .command('rebuild-index')
  .description('Rebuild the local SQL index from scratch by replaying the JSONL event log.')
  .action(async () => {
    const context = await createContext();
    try {
      await runRebuildIndexCommand(context);
    } finally {
      context.db.close();
    }
  });

program
  .command('doctor')
  .description('Report hook registration, scheduler status, and known permission caveats.')
  .action(() => {
    runDoctorCommand(process.cwd());
  });

program
  .command('uninstall')
  .description('Remove hook registration and the scheduler entry. Never deletes local data unless --purge-data is passed.')
  .option('--agent <agent>', 'only remove this agent\'s hooks (default: both)')
  .option('--purge-data', 'also delete all local event data and the index', false)
  .action((opts: { agent?: string; purgeData: boolean }) => {
    if (opts.agent && opts.agent !== 'claude-code' && opts.agent !== 'codex') {
      process.stderr.write(`pebl: --agent must be "claude-code" or "codex", got "${opts.agent}"\n`);
      process.exitCode = 1;
      return;
    }
    runUninstallCommand({
      ...(opts.agent ? { agent: opts.agent as SupportedAgent } : {}),
      cwd: process.cwd(),
      purgeData: opts.purgeData,
    });
  });

program.parseAsync(process.argv);
