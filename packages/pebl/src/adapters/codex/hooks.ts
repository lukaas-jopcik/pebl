import { join } from 'node:path';
import {
  registeredEventsFromConfig,
  registerHookConfig,
  unregisterHookConfig,
} from '../../hooks/hook-config-file.js';
import { codexHome } from './rollout.js';
import type { CanonicalEventType } from '../../events/schema.js';

/**
 * ⚠️ UNVERIFIED ASSUMPTION — resolve before relying on this in real use.
 *
 * Codex's on-disk hook-registration file format/location is modeled here
 * on Claude Code's `.claude/settings.json` (same JSON shape: {matcher?,
 * hooks: [{type, command}]}, mirrored under CODEX_HOME instead of
 * ~/.claude), because PRD §11's technical-feasibility research found
 * Codex's hook *payload* shape "deliberately near-isomorphic" to Claude
 * Code's — but that research verified Codex's *hook event names and
 * payload fields* against https://learn.chatgpt.com/docs/hooks, not the
 * exact on-disk config file this module writes to register them.
 *
 * Before this adapter is used against a real Codex CLI install, verify
 * the actual config file name/path/shape against current Codex hooks
 * documentation and correct hooksConfigPath()/commandFor() below — every
 * other module in this adapter (parse.ts, rollout.ts) is independent of
 * this file's correctness.
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

function commandFor(event: CanonicalEventType): string {
  return `pebl hook codex ${event}`;
}

function isOwnHookCommand(command: string): boolean {
  return command.startsWith('pebl hook codex ');
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
