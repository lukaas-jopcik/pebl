import { describe, expect, it } from 'vitest';
import { runCheck } from '../src/verification/run-check.js';

describe('runCheck', () => {
  it('reports exit code 0 and captures stdout for a passing command', async () => {
    const result = await runCheck('echo hello-from-pebl', process.cwd());
    expect(result.exitCode).toBe(0);
    expect(result.outputTail).toContain('hello-from-pebl');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reports a non-zero exit code for a failing command', async () => {
    const result = await runCheck('exit 1', process.cwd());
    expect(result.exitCode).toBe(1);
  });

  it('reports a distinct non-zero exit code (not clamped to 1) when the command supplies one', async () => {
    const result = await runCheck('exit 7', process.cwd());
    expect(result.exitCode).toBe(7);
  });

  it('truncates very large output to a bounded tail, keeping the most recent content', async () => {
    // node -e prints a large, obviously-ordered block so we can assert the
    // tail (not the head) survived truncation.
    const script =
      'node -e "for (let i = 0; i < 5000; i++) { console.log(\'line-\' + i) }"';
    const result = await runCheck(script, process.cwd());
    expect(result.outputTail.length).toBeLessThanOrEqual(2000);
    expect(result.outputTail).toContain('line-4999');
    expect(result.outputTail).not.toContain('line-0\n');
  });
});
