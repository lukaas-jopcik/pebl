import { describe, expect, it } from 'vitest';
import { CANONICAL_EVENT_TYPES } from '../src/events/schema.js';
import {
  CLAUDE_CODE_EVENT_MAP,
  CODEX_EVENT_MAP,
  mapHookEventName,
  UnmappedHookEventError,
} from '../src/adapters/canonical-events.js';

describe('canonical event mapping', () => {
  it('maps every Claude Code entry onto a real canonical event type', () => {
    for (const canonical of Object.values(CLAUDE_CODE_EVENT_MAP)) {
      expect(CANONICAL_EVENT_TYPES).toContain(canonical);
    }
  });

  it('maps every Codex entry onto a real canonical event type', () => {
    for (const canonical of Object.values(CODEX_EVENT_MAP)) {
      expect(CANONICAL_EVENT_TYPES).toContain(canonical);
    }
  });

  it('Claude Code hook names map to themselves (near-identical vocabulary)', () => {
    expect(mapHookEventName(CLAUDE_CODE_EVENT_MAP, 'PostToolUseFailure')).toBe(
      'PostToolUseFailure',
    );
  });

  it('Codex has no PostToolUseFailure mapping (surfaces via PostToolUse instead)', () => {
    expect(() => mapHookEventName(CODEX_EVENT_MAP, 'PostToolUseFailure')).toThrow(
      UnmappedHookEventError,
    );
  });

  it('throws a descriptive error for a completely unknown event name', () => {
    expect(() => mapHookEventName(CLAUDE_CODE_EVENT_MAP, 'SomethingNew')).toThrow(
      /No canonical mapping/,
    );
  });
});
