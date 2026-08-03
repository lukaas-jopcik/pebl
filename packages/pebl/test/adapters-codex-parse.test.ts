import { describe, expect, it } from 'vitest';
import { isCodexHookPayload, toPeblEvent, type CodexHookPayload } from '../src/adapters/codex/parse.js';
import { UnmappedHookEventError } from '../src/adapters/canonical-events.js';
import { validateEvent } from '../src/events/schema.js';
import { loadFixture } from './helpers/fixtures.js';

describe('codex parse', () => {
  it('recognizes a well-formed payload', () => {
    const raw = loadFixture('codex/session-start');
    expect(isCodexHookPayload(raw)).toBe(true);
  });

  it('rejects a payload missing session_id', () => {
    expect(isCodexHookPayload({ hook_event_name: 'Stop' })).toBe(false);
  });

  it('maps SessionStart into a valid metadata-class PeblEvent with source "codex"', () => {
    const raw = loadFixture<CodexHookPayload>('codex/session-start');
    const event = toPeblEvent(raw, 'proj-1');

    expect(event.event_type).toBe('SessionStart');
    expect(event.source).toBe('codex');
    expect(event.session_id).toBe('codex-session-xyz789');
    expect(event.privacy_class).toBe('metadata');
    expect(() => validateEvent(event)).not.toThrow();
  });

  it('classifies UserPromptSubmit as user_content and carries turn_id, not prompt_id', () => {
    const raw = loadFixture<CodexHookPayload>('codex/user-prompt-submit');
    const event = toPeblEvent(raw, 'proj-1');

    expect(event.privacy_class).toBe('user_content');
    expect(event.turn_id).toBe('turn-1');
    expect(event.prompt_id).toBeUndefined();
    expect(event.payload.prompt).toMatch(/Refactor the pricing/);
  });

  it('classifies PostToolUse as metadata-only', () => {
    const raw = loadFixture<CodexHookPayload>('codex/post-tool-use');
    const event = toPeblEvent(raw, 'proj-1');

    expect(event.privacy_class).toBe('metadata');
    expect(event.payload.tool_name).toBe('apply_patch');
  });

  it('does not leak envelope fields into payload', () => {
    const raw = loadFixture<CodexHookPayload>('codex/user-prompt-submit');
    const event = toPeblEvent(raw, 'proj-1');

    expect(event.payload).not.toHaveProperty('session_id');
    expect(event.payload).not.toHaveProperty('hook_event_name');
    expect(event.payload).not.toHaveProperty('turn_id');
  });

  it('throws on a hook_event_name outside the Codex canonical mapping (e.g. PostToolUseFailure)', () => {
    const raw = loadFixture<CodexHookPayload>('codex/session-start');
    expect(() => toPeblEvent({ ...raw, hook_event_name: 'PostToolUseFailure' }, 'proj-1')).toThrow(
      UnmappedHookEventError,
    );
  });
});
