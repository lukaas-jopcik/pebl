import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type TestCommandSource = 'ci' | 'convention' | 'cached' | 'none';

export interface TestCommandResolution {
  command?: string;
  source: TestCommandSource;
}

interface PeblProjectConfig {
  testCommand?: string;
  [key: string]: unknown;
}

function projectConfigPath(projectRoot: string): string {
  return join(projectRoot, '.pebl', 'config.json');
}

function readProjectConfig(projectRoot: string): PeblProjectConfig {
  const path = projectConfigPath(projectRoot);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PeblProjectConfig;
  } catch {
    return {};
  }
}

/** Caches a user-provided (or otherwise resolved) test command for this project, per FR-9 step 3. */
export function cacheTestCommand(projectRoot: string, command: string): void {
  const config = readProjectConfig(projectRoot);
  config.testCommand = command;
  mkdirSync(join(projectRoot, '.pebl'), { recursive: true });
  writeFileSync(projectConfigPath(projectRoot), JSON.stringify(config, null, 2) + '\n', 'utf8');
}

const CI_TEST_COMMAND_PATTERNS = [
  /\bnpm (run )?test\b/,
  /\byarn test\b/,
  /\bpnpm test\b/,
  /\bpytest\b/,
  /\bcargo test\b/,
  /\bgo test\b/,
  /\bmake test\b/,
];

/**
 * Deliberately not a real YAML parser — a text scan for `run: <command>`
 * lines matching a known test-command shape. Good enough to find the
 * common case without adding a YAML dependency; a job whose test step
 * doesn't match one of these patterns falls through to convention
 * detection rather than being silently misreported.
 */
function detectFromCiWorkflows(projectRoot: string): string | undefined {
  const workflowsDir = join(projectRoot, '.github', 'workflows');
  if (!existsSync(workflowsDir)) return undefined;

  let files: string[];
  try {
    files = readdirSync(workflowsDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  } catch {
    return undefined;
  }

  for (const file of files.sort()) {
    let content: string;
    try {
      content = readFileSync(join(workflowsDir, file), 'utf8');
    } catch {
      continue;
    }
    for (const line of content.split('\n')) {
      const match = /run:\s*(.+)$/.exec(line);
      if (!match) continue;
      const command = match[1]?.trim();
      if (command && CI_TEST_COMMAND_PATTERNS.some((pattern) => pattern.test(command))) {
        return command;
      }
    }
  }
  return undefined;
}

function hasPyprojectPytestSection(projectRoot: string): boolean {
  const path = join(projectRoot, 'pyproject.toml');
  if (!existsSync(path)) return false;
  try {
    return readFileSync(path, 'utf8').includes('[tool.pytest');
  } catch {
    return false;
  }
}

function detectFromConvention(projectRoot: string): string | undefined {
  const packageJsonPath = join(projectRoot, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
        scripts?: Record<string, string>;
      };
      const testScript = pkg.scripts?.test;
      if (testScript && !/no test specified/i.test(testScript)) return 'npm test';
    } catch {
      // Malformed package.json: fall through to other conventions rather than throw.
    }
  }

  const makefilePath = join(projectRoot, 'Makefile');
  if (existsSync(makefilePath)) {
    try {
      if (/^test:/m.test(readFileSync(makefilePath, 'utf8'))) return 'make test';
    } catch {
      // fall through
    }
  }

  if (existsSync(join(projectRoot, 'Cargo.toml'))) return 'cargo test';
  if (existsSync(join(projectRoot, 'go.mod'))) return 'go test ./...';
  if (existsSync(join(projectRoot, 'pytest.ini'))) return 'pytest';
  if (existsSync(join(projectRoot, 'setup.cfg'))) return 'pytest';
  if (hasPyprojectPytestSection(projectRoot)) return 'pytest';

  return undefined;
}

/**
 * FR-9 / OQ-3 resolution order: CI workflow file -> per-language
 * convention -> previously cached user-provided command -> none. The
 * interactive "ask the user once" step is wired at the CLI layer
 * (Phase 7's `pebl setup`/hook flow calling cacheTestCommand()); this
 * function only ever reports what it can already resolve — `source:
 * 'none'` is a valid, honest result (FR-9's "no test signal available"),
 * never a fabricated guess (G2).
 */
export function resolveTestCommand(projectRoot: string): TestCommandResolution {
  const fromCi = detectFromCiWorkflows(projectRoot);
  if (fromCi) return { command: fromCi, source: 'ci' };

  const fromConvention = detectFromConvention(projectRoot);
  if (fromConvention) return { command: fromConvention, source: 'convention' };

  const cached = readProjectConfig(projectRoot).testCommand;
  if (cached) return { command: cached, source: 'cached' };

  return { source: 'none' };
}
