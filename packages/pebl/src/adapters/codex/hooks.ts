import { join } from 'node:path';
import {
  registeredEventsFromConfig,
  registerHookConfig,
  unregisterHookConfig,
} from '../../hooks/hook-config-file.js';
import { codexHome } from './rollout.js';
import { peblBinPath } from '../../bin-path.js';
import type { CanonicalEventType } from '../../events/schema.js';

/**
 * Verified (2026-08-03) against https://learn.chatgpt.com/docs/hooks:
 * Codex discovers hooks at `~/.codex/hooks.json` (global) or
 * `<repo>/.codex/hooks.json` (project-local) — both scopes supported,
 * matching this module's `hooksConfigPath()`. The documented shape is
 * exactly `{ hooks: { EventName: [{ matcher?, hooks: [{ type: "command",
 * command }] }] } }`, matching `hooks/hook-config-file.ts`'s
 * `HookConfigFile`/`HookMatcherEntry`/`HookCommand` types. The docs
 * explicitly confirm `matcher: "*"` (used here for tool-scoped events)
 * as the documented way to match all occurrences, not an assumption
 * about regex wildcard behavior.
 *
 * Not implemented: Codex also accepts an equivalent TOML block under
 * `~/.codex/config.toml` / `<repo>/.codex/config.toml`. This module only
 * writes the JSON form — sufficient per the docs, since both scopes are
 * documented to be read independently, not merged from one format only.
 */
export const MANAGED_EVENTS: CanonicalEventType[] = [
  'SessionStart',
  'SessionEnd',
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
  'UserPromptSubmit',
  'Stop',
];

const TOOL_SCOPED_EVENTS = new Set<CanonicalEventType>([
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
]);

export type HookScope = 'global' | 'project';

export function hooksConfigPath(scope: HookScope, cwd: string): string {
  return scope === 'global'
    ? join(codexHome(), 'hooks.json')
    : join(cwd, '.codex', 'hooks.json');
}

// See claude-code/hooks.ts commandFor for why this is an absolute path.
function commandFor(event: CanonicalEventType): string {
  return `${peblBinPath()} hook codex ${event}`;
}

// See claude-code/hooks.ts isOwnHookCommand for why this matches on the
// subcommand shape rather than a "pebl" substring.
function isOwnHookCommand(command: string): boolean {
  return command.includes('hook codex ');
}

export function registerHooks(scope: HookScope, cwd: string): { path: string; changed: boolean } {
  const path = hooksConfigPath(scope, cwd);
  const { changed } = registerHookConfig({
    configPath: path,
    managedEvents: MANAGED_EVENTS,
    toolScopedEvents: TOOL_SCOPED_EVENTS,
    commandFor,
    isOwnCommand: isOwnHookCommand,
  });
  return { path, changed };
}

export function unregisterHooks(scope: HookScope, cwd: string): { path: string; changed: boolean } {
  const path = hooksConfigPath(scope, cwd);
  const { changed } = unregisterHookConfig(path, isOwnHookCommand);
  return { path, changed };
}

export function registeredEvents(scope: HookScope, cwd: string): CanonicalEventType[] {
  const path = hooksConfigPath(scope, cwd);
  return registeredEventsFromConfig(path, MANAGED_EVENTS, isOwnHookCommand);
}
