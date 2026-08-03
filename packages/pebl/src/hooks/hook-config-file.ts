import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CanonicalEventType } from '../events/schema.js';

/**
 * Shared JSON hook-config read/merge/write logic used by both the Claude
 * Code adapter (.claude/settings.json) and the Codex adapter (see
 * adapters/codex/hooks.ts for its own file-location caveat). Both agents'
 * hook config uses the same {matcher?, hooks: [{type, command}]} shape.
 */

export interface HookCommand {
  type: 'command';
  command: string;
  [key: string]: unknown;
}

export interface HookMatcherEntry {
  matcher?: string;
  hooks: HookCommand[];
  [key: string]: unknown;
}

export interface HookConfigFile {
  hooks?: Record<string, HookMatcherEntry[]>;
  [key: string]: unknown;
}

export interface HookRegistrationSpec {
  configPath: string;
  managedEvents: CanonicalEventType[];
  toolScopedEvents: ReadonlySet<CanonicalEventType>;
  commandFor: (event: CanonicalEventType) => string;
  isOwnCommand: (command: string) => boolean;
}

function readConfig(path: string): HookConfigFile {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf8').trim();
  return raw.length === 0 ? {} : (JSON.parse(raw) as HookConfigFile);
}

function writeConfig(path: string, config: HookConfigFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

/**
 * Idempotently merges this package's hook entries into the config file,
 * preserving every unrelated top-level key and every non-pebl hook entry
 * already present on the same event (including other tools' hooks).
 */
export function registerHookConfig(spec: HookRegistrationSpec): { changed: boolean } {
  const config = readConfig(spec.configPath);
  config.hooks ??= {};

  let changed = false;
  for (const event of spec.managedEvents) {
    const existing = config.hooks[event] ?? [];
    const withoutOurs = existing.filter(
      (entry) => !entry.hooks.every((hook) => spec.isOwnCommand(hook.command)),
    );
    const ours: HookMatcherEntry = spec.toolScopedEvents.has(event)
      ? { matcher: '*', hooks: [{ type: 'command', command: spec.commandFor(event) }] }
      : { hooks: [{ type: 'command', command: spec.commandFor(event) }] };

    const next = [...withoutOurs, ours];
    if (JSON.stringify(next) !== JSON.stringify(existing)) {
      config.hooks[event] = next;
      changed = true;
    }
  }

  if (changed) writeConfig(spec.configPath, config);
  return { changed };
}

/** Removes only entries whose commands all match isOwnCommand; leaves everything else untouched. */
export function unregisterHookConfig(
  configPath: string,
  isOwnCommand: (command: string) => boolean,
): { changed: boolean } {
  if (!existsSync(configPath)) return { changed: false };
  const config = readConfig(configPath);
  if (!config.hooks) return { changed: false };

  let changed = false;
  for (const event of Object.keys(config.hooks)) {
    const existing = config.hooks[event] ?? [];
    const next = existing.filter((entry) => !entry.hooks.every((hook) => isOwnCommand(hook.command)));
    if (next.length !== existing.length) {
      config.hooks[event] = next;
      changed = true;
    }
  }

  if (changed) writeConfig(configPath, config);
  return { changed };
}

export function registeredEventsFromConfig(
  configPath: string,
  managedEvents: CanonicalEventType[],
  isOwnCommand: (command: string) => boolean,
): CanonicalEventType[] {
  if (!existsSync(configPath)) return [];
  const config = readConfig(configPath);
  if (!config.hooks) return [];

  return managedEvents.filter((event) =>
    (config.hooks?.[event] ?? []).some((entry) => entry.hooks.some((hook) => isOwnCommand(hook.command))),
  );
}
