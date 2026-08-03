import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const MAX_CAPTURED_OUTPUT_CHARS = 2000;

export interface CheckResult {
  exitCode: number;
  durationMs: number;
  /**
   * Short, truncated tail of combined stdout/stderr — enough to
   * distinguish "test failed" from "command not found" in a receipt,
   * deliberately not the full output. Full logs are never persisted here:
   * a receipt showing verification evidence must not become a second copy
   * of the project's build/test logs (FR-13's evidence fields stay small).
   */
  outputTail: string;
}

function truncateTail(text: string): string {
  return text.length > MAX_CAPTURED_OUTPUT_CHARS ? text.slice(-MAX_CAPTURED_OUTPUT_CHARS) : text;
}

/**
 * Runs a detected/cached test command in the given project directory via
 * the shell (commands like "npm test" or "go test ./..." are shell
 * strings, not a single executable + argv), capturing exit code, wall-
 * clock duration, and a truncated output tail (FR-9/FR-10 evidence).
 */
export async function runCheck(command: string, cwd: string): Promise<CheckResult> {
  const startedAt = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(command, [], {
      cwd,
      shell: true,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      exitCode: 0,
      durationMs: Date.now() - startedAt,
      outputTail: truncateTail(stdout + stderr),
    };
  } catch (err) {
    const execError = err as { code?: number; stdout?: string; stderr?: string };
    return {
      exitCode: typeof execError.code === 'number' ? execError.code : 1,
      durationMs: Date.now() - startedAt,
      outputTail: truncateTail((execError.stdout ?? '') + (execError.stderr ?? '')),
    };
  }
}
