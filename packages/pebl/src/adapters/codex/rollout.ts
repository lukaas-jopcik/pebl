import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

export function codexHome(): string {
  return process.env.CODEX_HOME ?? join(homedir(), '.codex');
}

export function sessionsRoot(): string {
  return join(codexHome(), 'sessions');
}

let warnedWorldReadable = false;

/**
 * Codex writes session rollout files world-readable (mode 0644) on Unix
 * by default — a known upstream behavior, not a bug in this package (see
 * PRD §11 risk list / IMPL §2.3). pebl must not attempt to change
 * permissions it doesn't own on files it didn't create; it warns once per
 * process so the user is aware, without being noisy on every hook call.
 */
export function warnIfWorldReadable(
  path: string,
  stderr: NodeJS.WritableStream = process.stderr,
): void {
  if (warnedWorldReadable || platform() === 'win32') return; // POSIX mode bits don't apply on Windows
  try {
    const stat = statSync(path);
    const worldReadable = (stat.mode & 0o004) !== 0;
    if (worldReadable) {
      stderr.write(
        'pebl: note: Codex session files are world-readable on this system. ' +
          'This is a known upstream Codex behavior, not something pebl changes or controls. ' +
          '(This message will not repeat.)\n',
      );
      warnedWorldReadable = true;
    }
  } catch {
    // A stat failure here isn't worth surfacing; the caller's own read will
    // fail loudly on its own if the file is genuinely inaccessible.
  }
}

/** Test-only: lets a test suite see the warning fire more than once per process. */
export function resetWorldReadableWarningForTests(): void {
  warnedWorldReadable = false;
}

function safeReadDir(path: string): string[] {
  try {
    return readdirSync(path).sort();
  } catch {
    return [];
  }
}

function rolloutFilesUnder(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const year of safeReadDir(root)) {
    for (const month of safeReadDir(join(root, year))) {
      for (const day of safeReadDir(join(root, year, month))) {
        for (const file of safeReadDir(join(root, year, month, day))) {
          if (file.startsWith('rollout-') && file.endsWith('.jsonl')) {
            files.push(join(root, year, month, day, file));
          }
        }
      }
    }
  }
  return files.sort();
}

export function listRolloutFiles(root: string = sessionsRoot()): string[] {
  return rolloutFilesUnder(root);
}

export interface RolloutHeader {
  session_id: string;
  source?: string;
  timestamp?: string;
  model_provider?: string;
  [key: string]: unknown;
}

export type RolloutLine = Record<string, unknown>;

export interface ParsedRollout {
  header: RolloutHeader;
  lines: RolloutLine[];
}

export class EmptyRolloutFileError extends Error {}

/** Reads one rollout file: the first line is the session header, the rest are RolloutLine events. */
export async function readRolloutFile(path: string): Promise<ParsedRollout> {
  warnIfWorldReadable(path);
  const rl = createInterface({ input: createReadStream(path, { encoding: 'utf8' }) });
  let header: RolloutHeader | undefined;
  const lines: RolloutLine[] = [];
  for await (const raw of rl) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (!header) {
      header = parsed as RolloutHeader;
    } else {
      lines.push(parsed);
    }
  }
  if (!header) throw new EmptyRolloutFileError(`Rollout file has no header line: ${path}`);
  return { header, lines };
}

/**
 * Finds the rollout file for a given session, if one exists yet. Header
 * writes can lag session start slightly, so this may legitimately find
 * nothing for a session that only just began — callers should treat that
 * as "not yet available," not an error (matches G2's never-fabricate rule).
 */
export async function findRolloutForSession(
  sessionId: string,
  root: string = sessionsRoot(),
): Promise<ParsedRollout | undefined> {
  for (const file of listRolloutFiles(root)) {
    try {
      const parsed = await readRolloutFile(file);
      if (parsed.header.session_id === sessionId) return parsed;
    } catch (err) {
      if (err instanceof EmptyRolloutFileError) continue;
      throw err;
    }
  }
  return undefined;
}
