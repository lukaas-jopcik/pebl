import type { CliContext } from '../context.js';
import { assembleReceiptInput, findLatestSessionId } from '../receipt/assemble.js';
import { buildReceiptFields } from '../receipt/fields.js';
import { renderReceipt } from '../receipt/render.js';

export interface ReceiptOptions {
  sessionId?: string;
}

/** `pebl receipt` — renders a receipt for a given session, or the most recent one for this project. */
export async function runReceiptCommand(
  context: CliContext,
  options: ReceiptOptions,
  stdout: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  const sessionId = options.sessionId ?? findLatestSessionId(context.db, context.projectId);
  if (!sessionId) {
    stdout.write('pebl: no sessions recorded yet for this project.\n');
    return;
  }

  const input = await assembleReceiptInput(context.db, context.projectId, context.cwd, sessionId);
  const fields = buildReceiptFields(input);
  stdout.write(renderReceipt(fields) + '\n');
}
