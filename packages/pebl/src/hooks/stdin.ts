/** Reads and parses the JSON payload an agent pipes to a hook's stdin. */
export async function readStdinJson(stdin: NodeJS.ReadableStream = process.stdin): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (raw.length === 0) {
    throw new Error('Expected a JSON payload on stdin, got nothing');
  }
  return JSON.parse(raw);
}

/**
 * Every hook this package registers is passive/observational — it never
 * blocks or alters agent behavior — so the response contract is always
 * the same "proceed normally" shape both Claude Code and Codex expect.
 */
export function writeContinueResponse(stdout: NodeJS.WritableStream = process.stdout): void {
  stdout.write(JSON.stringify({ continue: true }));
}
