import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
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

interface HookCommand {
  type: 'command';
  command: string;
  [key: string]: unknown;
}

interface HookMatcherEntry {
  matcher?: string;
  hooks: HookCommand[];
  [key: string]: unknown;
}

interface ClaudeSettings {
  hooks?: Record<string, HookMatcherEntry[]>;
  [key: string]: unknown;
}

export type HookScope = 'global' | 'project';

export function settingsPath(scope: HookScope, cwd: string): string {
  return scope === 'global'
    ? join(homedir(), '.claude', 'settings.json')
    : join(cwd, '.claude', 'settings.json');
}

function readSettings(path: string): ClaudeSettings {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf8').trim();
  if (raw.length === 0) return {};
  return JSON.parse(raw) as ClaudeSettings;
}

function writeSettings(path: string, settings: ClaudeSettings): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2) + '\n', 'utf8');
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
  const settings = readSettings(path);
  settings.hooks ??= {};

  let changed = false;
  for (const event of MANAGED_EVENTS) {
    const existing = settings.hooks[event] ?? [];
    const withoutOurs = existing.filter(
      (entry) => !entry.hooks.every((hook) => isOwnHookCommand(hook.command)),
    );
    const ours: HookMatcherEntry = TOOL_SCOPED_EVENTS.has(event)
      ? { matcher: '*', hooks: [{ type: 'command', command: commandFor(event) }] }
      : { hooks: [{ type: 'command', command: commandFor(event) }] };

    const next = [...withoutOurs, ours];
    if (JSON.stringify(next) !== JSON.stringify(existing)) {
      settings.hooks[event] = next;
      changed = true;
    }
  }

  if (changed) writeSettings(path, settings);
  return { path, changed };
}

/** Removes only this package's own hook entries; leaves everything else untouched. */
export function unregisterHooks(scope: HookScope, cwd: string): { path: string; changed: boolean } {
  const path = settingsPath(scope, cwd);
  if (!existsSync(path)) return { path, changed: false };
  const settings = readSettings(path);
  if (!settings.hooks) return { path, changed: false };

  let changed = false;
  for (const event of Object.keys(settings.hooks)) {
    const existing = settings.hooks[event] ?? [];
    const next = existing.filter(
      (entry) => !entry.hooks.every((hook) => isOwnHookCommand(hook.command)),
    );
    if (next.length !== existing.length) {
      settings.hooks[event] = next;
      changed = true;
    }
  }

  if (changed) writeSettings(path, settings);
  return { path, changed };
}

/** Reports which of MANAGED_EVENTS currently have this package's hook registered. Used by `pebl doctor`. */
export function registeredEvents(scope: HookScope, cwd: string): CanonicalEventType[] {
  const path = settingsPath(scope, cwd);
  if (!existsSync(path)) return [];
  const settings = readSettings(path);
  if (!settings.hooks) return [];

  return MANAGED_EVENTS.filter((event) =>
    (settings.hooks?.[event] ?? []).some((entry) =>
      entry.hooks.some((hook) => isOwnHookCommand(hook.command)),
    ),
  );
}
