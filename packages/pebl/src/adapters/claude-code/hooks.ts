import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  registeredEventsFromConfig,
  registerHookConfig,
  unregisterHookConfig,
} from '../../hooks/hook-config-file.js';
import type { CanonicalEventType } from '../../events/schema.js';

/** The eight Claude Code events this package needs, per PRD FR-1. */
export const MANAGED_EVENTS: CanonicalEventType[] = [
  'SessionStart',
  'UserPromptSubmit',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'PermissionDenied',
  'Stop',
  'SessionEnd',
];

/** Events whose hook entry accepts (and, for reliable coverage, should set) a tool matcher. */
const TOOL_SCOPED_EVENTS = new Set<CanonicalEventType>([
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'PermissionDenied',
]);

export type HookScope = 'global' | 'project';

/**
 * Claude Code itself honors `CLAUDE_CONFIG_DIR` to relocate its entire config
 * directory (settings, plugins, etc.) away from `~/.claude`. We must resolve
 * the global settings path the same way, or hook registration silently
 * targets a file the running agent never reads.
 */
function globalClaudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
}

export function settingsPath(scope: HookScope, cwd: string): string {
  return scope === 'global'
    ? join(globalClaudeConfigDir(), 'settings.json')
    : join(cwd, '.claude', 'settings.json');
}

/**
 * `pebl` is expected to be resolvable on PATH by the time an agent invokes
 * a hook — hook registration only makes sense for a persistent global (or
 * project devDependency) install, never for a one-off `npx pebl` run, so a
 * bare command name (not an absolute path to this process) is correct here.
 */
function commandFor(event: CanonicalEventType): string {
  return `pebl hook claude-code ${event}`;
}

function isOwnHookCommand(command: string): boolean {
  return command.startsWith('pebl hook claude-code ');
}

/**
 * Idempotently registers this package's hooks into the given scope's
 * settings.json, preserving every unrelated key and every non-pebl hook
 * entry already present (including other tools' hooks on the same event).
 */
export function registerHooks(scope: HookScope, cwd: string): { path: string; changed: boolean } {
  const path = settingsPath(scope, cwd);
  const { changed } = registerHookConfig({
    configPath: path,
    managedEvents: MANAGED_EVENTS,
    toolScopedEvents: TOOL_SCOPED_EVENTS,
    commandFor,
    isOwnCommand: isOwnHookCommand,
  });
  return { path, changed };
}

/** Removes only this package's own hook entries; leaves everything else untouched. */
export function unregisterHooks(scope: HookScope, cwd: string): { path: string; changed: boolean } {
  const path = settingsPath(scope, cwd);
  const { changed } = unregisterHookConfig(path, isOwnHookCommand);
  return { path, changed };
}

/** Reports which of MANAGED_EVENTS currently have this package's hook registered. Used by `pebl doctor`. */
export function registeredEvents(scope: HookScope, cwd: string): CanonicalEventType[] {
  const path = settingsPath(scope, cwd);
  return registeredEventsFromConfig(path, MANAGED_EVENTS, isOwnHookCommand);
}
