import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PeblEvent } from '../../src/events/schema.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

/** Loads and parses a JSON fixture, e.g. loadFixture('claude-code/stop'). */
export function loadFixture<T = unknown>(relativePath: string): T {
  const path = join(FIXTURES_DIR, `${relativePath}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

let counter = 0;

/** Builds a valid PeblEvent with sane defaults; override only what a test cares about. */
export function makeEvent(overrides: Partial<PeblEvent> = {}): PeblEvent {
  counter += 1;
  return {
    event_id: `evt-${counter}`,
    event_type: 'UserPromptSubmit',
    timestamp: '2026-08-03T12:00:00.000Z',
    source: 'claude-code',
    project_id: 'proj-test',
    session_id: 'session-test',
    privacy_class: 'metadata',
    payload: {},
    ...overrides,
  };
}
