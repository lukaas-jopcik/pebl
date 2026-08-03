import { Command } from 'commander';
import { runClaudeCodeHook } from './hooks/claude-code-entrypoint.js';
import { writeContinueResponse } from './hooks/stdin.js';

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
    // Codex support lands in Phase 3. Never break the agent's turn over an
    // agent we don't handle yet.
    process.stderr.write(`pebl: no handler for agent "${agent}" yet\n`);
    writeContinueResponse();
  });

program.parseAsync(process.argv);
