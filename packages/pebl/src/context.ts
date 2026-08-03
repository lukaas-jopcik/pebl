import type Database from 'better-sqlite3';
import { ensureIndexUpToDate, openDb } from './db/index.js';
import { indexDbPath, resolveProjectId } from './paths.js';

export interface CliContext {
  db: Database.Database;
  projectId: string;
  cwd: string;
}

/** Opens the local index (auto-rebuilding on schema mismatch) and resolves the current project. */
export async function createContext(cwd: string = process.cwd()): Promise<CliContext> {
  const db = openDb(indexDbPath());
  await ensureIndexUpToDate(db);
  return { db, projectId: resolveProjectId(cwd), cwd };
}
