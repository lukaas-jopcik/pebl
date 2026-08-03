import { execFileSync } from 'node:child_process';

/**
 * Everything that touches the real OS scheduler (crontab, schtasks) goes
 * through this seam so tests can inject a fake runner and never modify a
 * real developer machine's crontab/task scheduler during automated test
 * runs — that's real system state, not something a test suite should
 * mutate as a side effect.
 */
export interface CommandRunner {
  run(cmd: string, args: string[], input?: string): string;
}

export const realCommandRunner: CommandRunner = {
  run(cmd, args, input) {
    return execFileSync(cmd, args, { encoding: 'utf8', input });
  },
};
