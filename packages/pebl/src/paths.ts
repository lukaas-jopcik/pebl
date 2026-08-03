import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Root data directory. Overridable via PEBL_HOME so tests never touch a
 * real user's home directory.
 */
export function resolvePeblHome(): string {
  return process.env.PEBL_HOME ?? join(homedir(), '.pebl');
}

export function eventsRootDir(): string {
  return join(resolvePeblHome(), 'events');
}

export function eventsDir(projectId: string): string {
  return join(eventsRootDir(), projectId);
}

export function indexDbPath(): string {
  return join(resolvePeblHome(), 'index.db');
}

export function globalConfigPath(): string {
  return join(resolvePeblHome(), 'config.json');
}

/** All project IDs that currently have at least one event file on disk. */
export function listProjectIds(): string[] {
  const root = eventsRootDir();
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/**
 * Stable per-repo identifier: the git remote URL when available (survives
 * the repo being cloned to a different path), otherwise the git root path,
 * otherwise the raw cwd. Hashed so the on-disk directory name never leaks
 * a repo URL or local path directly.
 */
export function resolveProjectId(cwd: string): string {
  const root = tryGitRoot(cwd) ?? cwd;
  const remote = tryGitRemote(root);
  return shortHash(remote ?? root);
}

function tryGitRoot(cwd: string): string | undefined {
  try {
    const out = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out.length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

function tryGitRemote(root: string): string | undefined {
  try {
    const out = execFileSync('git', ['-C', root, 'config', '--get', 'remote.origin.url'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out.length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}
