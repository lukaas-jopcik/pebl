import { appendFileSync, createReadStream, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { eventsDir } from '../paths.js';
import { validateEvent, type PeblEvent } from './schema.js';

function dayFileFor(projectId: string, isoTimestamp: string): string {
  const date = isoTimestamp.slice(0, 10); // YYYY-MM-DD, stable for any valid ISO-8601 input
  return join(eventsDir(projectId), `${date}.jsonl`);
}

/**
 * Appends one event as a single JSON line. Each call opens the file with
 * O_APPEND (via appendFileSync) and issues one write(); for event payloads
 * of normal size (well under the platform's atomic-write threshold) this
 * is safe against interleaving from multiple concurrent `pebl hook`
 * processes, which is the only realistic concurrent writer in this design
 * (no daemon — see IMPL §2.4/2.6). Unusually large payloads are not
 * guaranteed atomic; adapters should not put full transcripts in payload.
 */
export function appendEvent(event: PeblEvent): void {
  validateEvent(event);
  const dir = eventsDir(event.project_id);
  mkdirSync(dir, { recursive: true });
  const file = dayFileFor(event.project_id, event.timestamp);
  appendFileSync(file, JSON.stringify(event) + '\n', { encoding: 'utf8' });
}

export function listEventFiles(projectId: string): string[] {
  const dir = eventsDir(projectId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.jsonl'))
    .sort() // filenames are YYYY-MM-DD, so lexical sort is chronological
    .map((name) => join(dir, name));
}

/**
 * Streams every event for a project in chronological order without
 * loading a full day's file into memory at once.
 */
export async function* readEvents(projectId: string): AsyncGenerator<PeblEvent> {
  for (const file of listEventFiles(projectId)) {
    const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }) });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      yield JSON.parse(trimmed) as PeblEvent;
    }
  }
}
