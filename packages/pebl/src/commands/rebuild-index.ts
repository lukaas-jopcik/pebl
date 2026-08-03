import type { CliContext } from '../context.js';
import { rebuildIndex } from '../db/index.js';

/** `pebl rebuild-index` — explicit full rebuild of the SQL index from the JSONL event log. */
export async function runRebuildIndexCommand(
  context: CliContext,
  stdout: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  await rebuildIndex(context.db);
  stdout.write('pebl: index rebuilt from the local event log.\n');
}
