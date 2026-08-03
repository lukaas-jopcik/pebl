import { describe, expect, it } from 'vitest';
import { isClaudeCodeHookPayload, toPeblEvent, type ClaudeCodeHookPayload } from '../src/adapters/claude-code/parse.js';
import { UnmappedHookEventError } from '../src/adapters/canonical-events.js';
import { validateEvent } from '../src/events/schema.js';
import { loadFixture } from './helpers/fixtures.js';

describe('claude-code parse', () => {
  it('recognizes a well-formed payload', () => {
    const raw = loadFixture('claude-code/session-start');
    expect(isClaudeCodeHookPayload(raw)).toBe(true);
  });

  it('rejects a payload missing session_id', () => {
    expect(isClaudeCodeHookPayload({ hook_event_name: 'Stop' })).toBe(false);
  });

  it('maps SessionStart into a valid metadata-class PeblEvent', () => {
    const raw = loadFixture<ClaudeCodeHookPayload>('claude-code/session-start');
    const event = toPeblEvent(raw, 'proj-1');

    expect(event.event_type).toBe('SessionStart');
    expect(event.session_id).toBe('cc-session-abc123');
    expect(event.source).toBe('claude-code');
    expect(event.privacy_class).toBe('metadata');
    expect(() => validateEvent(event)).not.toThrow();
  });

  it('classifies UserPromptSubmit as user_content because it carries raw prompt text', () => {
    const raw = loadFixture<ClaudeCodeHookPayload>('claude-code/user-prompt-submit');
    const event = toPeblEvent(raw, 'proj-1');

    expect(event.privacy_class).toBe('user_content');
    expect(event.payload.user_prompt).toBe(
      'Add rate limiting to the auth endpoint, must include a test.',
    );
    expect(event.prompt_id).toBe('prompt-1');
  });

  it('classifies Stop as user_content because it carries last_assistant_message', () => {
    const raw = loadFixture<ClaudeCodeHookPayload>('claude-code/stop');
    const event = toPeblEvent(raw, 'proj-1');

    expect(event.privacy_class).toBe('user_content');
    expect(event.event_type).toBe('Stop');
  });

  it('classifies PostToolUse as metadata-only (no raw content fields)', () => {
    const raw = loadFixture<ClaudeCodeHookPayload>('claude-code/post-tool-use');
    const event = toPeblEvent(raw, 'proj-1');

    expect(event.privacy_class).toBe('metadata');
    expect(event.payload.tool_name).toBe('Edit');
    expect(event.payload.duration_ms).toBe(340);
  });

  it('carries tool_error through for PostToolUseFailure', () => {
    const raw = loadFixture<ClaudeCodeHookPayload>('claude-code/post-tool-use-failure');
    const event = toPeblEvent(raw, 'proj-1');

    expect(event.event_type).toBe('PostToolUseFailure');
    expect(event.payload.tool_error).toMatch(/lint failed/);
  });

  it('does not leak envelope fields (session_id, hook_event_name, prompt_id) into payload', () => {
    const raw = loadFixture<ClaudeCodeHookPayload>('claude-code/user-prompt-submit');
    const event = toPeblEvent(raw, 'proj-1');

    expect(event.payload).not.toHaveProperty('session_id');
    expect(event.payload).not.toHaveProperty('hook_event_name');
    expect(event.payload).not.toHaveProperty('prompt_id');
  });

  it('throws on a hook_event_name outside the canonical mapping', () => {
    const raw = loadFixture<ClaudeCodeHookPayload>('claude-code/session-start');
    expect(() => toPeblEvent({ ...raw, hook_event_name: 'TotallyMadeUp' }, 'proj-1')).toThrow(
      UnmappedHookEventError,
    );
  });
});
