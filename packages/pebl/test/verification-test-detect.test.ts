import { afterEach, describe, expect, it } from 'vitest';
import { cacheTestCommand, resolveTestCommand } from '../src/verification/test-detect.js';
import { createTempProject, type TempProject } from './helpers/temp-project.js';

let project: TempProject;

afterEach(() => {
  project.cleanup();
});

describe('resolveTestCommand', () => {
  it('returns source "none" for a project with no detectable signal', () => {
    project = createTempProject();
    expect(resolveTestCommand(project.dir)).toEqual({ source: 'none' });
  });

  it('detects a test command from a GitHub Actions workflow', () => {
    project = createTempProject({
      '.github/workflows/ci.yml': [
        'name: CI',
        'jobs:',
        '  test:',
        '    steps:',
        '      - run: npm ci',
        '      - run: npm test',
        '',
      ].join('\n'),
    });
    expect(resolveTestCommand(project.dir)).toEqual({ command: 'npm test', source: 'ci' });
  });

  it('prefers the CI workflow over a package.json convention when both exist', () => {
    project = createTempProject({
      '.github/workflows/ci.yml': 'jobs:\n  test:\n    steps:\n      - run: pytest -x\n',
      'package.json': JSON.stringify({ scripts: { test: 'jest' } }),
    });
    expect(resolveTestCommand(project.dir)).toEqual({ command: 'pytest -x', source: 'ci' });
  });

  it('falls back to package.json scripts.test when no CI file resolves anything', () => {
    project = createTempProject({ 'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }) });
    expect(resolveTestCommand(project.dir)).toEqual({ command: 'npm test', source: 'convention' });
  });

  it('ignores npm\'s default placeholder test script', () => {
    project = createTempProject({
      'package.json': JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
    });
    expect(resolveTestCommand(project.dir)).toEqual({ source: 'none' });
  });

  it('detects a Makefile test target', () => {
    project = createTempProject({ Makefile: 'build:\n\techo building\n\ntest:\n\techo testing\n' });
    expect(resolveTestCommand(project.dir)).toEqual({ command: 'make test', source: 'convention' });
  });

  it('detects Cargo.toml -> cargo test', () => {
    project = createTempProject({ 'Cargo.toml': '[package]\nname = "x"\n' });
    expect(resolveTestCommand(project.dir)).toEqual({ command: 'cargo test', source: 'convention' });
  });

  it('detects go.mod -> go test ./...', () => {
    project = createTempProject({ 'go.mod': 'module example.com/x\n' });
    expect(resolveTestCommand(project.dir)).toEqual({ command: 'go test ./...', source: 'convention' });
  });

  it('detects a pyproject.toml pytest section -> pytest', () => {
    project = createTempProject({ 'pyproject.toml': '[tool.pytest.ini_options]\naddopts = "-x"\n' });
    expect(resolveTestCommand(project.dir)).toEqual({ command: 'pytest', source: 'convention' });
  });

  it('falls back to a cached command when nothing else resolves', () => {
    project = createTempProject();
    cacheTestCommand(project.dir, './scripts/run-tests.sh');
    expect(resolveTestCommand(project.dir)).toEqual({
      command: './scripts/run-tests.sh',
      source: 'cached',
    });
  });

  it('prefers convention detection over a stale cached command', () => {
    project = createTempProject({ 'go.mod': 'module example.com/x\n' });
    cacheTestCommand(project.dir, 'old-cached-command');
    expect(resolveTestCommand(project.dir)).toEqual({ command: 'go test ./...', source: 'convention' });
  });
});
