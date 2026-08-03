import { describe, expect, it } from 'vitest';
import { filesTouched, filesTouchedByInteraction } from '../src/verification/files-touched.js';
import { makeEvent } from './helpers/fixtures.js';

describe('filesTouched', () => {
  it('collects file_path from tool_input across PostToolUse events', () => {
    const events = [
      makeEvent({ event_type: 'PostToolUse', payload: { tool_input: { file_path: 'src/a.ts' } } }),
      makeEvent({ event_type: 'PostToolUse', payload: { tool_input: { file_path: 'src/b.ts' } } }),
    ];
    expect(filesTouched(events)).toEqual(new Set(['src/a.ts', 'src/b.ts']));
  });

  it('deduplicates repeated edits to the same file', () => {
    const events = [
      makeEvent({ event_type: 'PostToolUse', payload: { tool_input: { file_path: 'src/a.ts' } } }),
      makeEvent({ event_type: 'PostToolUse', payload: { tool_input: { file_path: 'src/a.ts' } } }),
    ];
    expect(filesTouched(events)).toEqual(new Set(['src/a.ts']));
  });

  it('falls back to a top-level file_path/path field when tool_input is absent', () => {
    const events = [makeEvent({ event_type: 'PostToolUse', payload: { path: 'src/c.ts' } })];
    expect(filesTouched(events)).toEqual(new Set(['src/c.ts']));
  });

  it('ignores non-tool events entirely', () => {
    const events = [
      makeEvent({ event_type: 'UserPromptSubmit', payload: { file_path: 'should-not-count.ts' } }),
      makeEvent({ event_type: 'SessionStart', payload: {} }),
    ];
    expect(filesTouched(events)).toEqual(new Set());
  });

  it('never fabricates a path when no recognizable key is present', () => {
    const events = [makeEvent({ event_type: 'PostToolUse', payload: { tool_name: 'Bash' } })];
    expect(filesTouched(events)).toEqual(new Set());
  });

  it('counts a failed tool use too (a failed edit still touched a file)', () => {
    const events = [
      makeEvent({ event_type: 'PostToolUseFailure', payload: { tool_input: { file_path: 'src/d.ts' } } }),
    ];
    expect(filesTouched(events)).toEqual(new Set(['src/d.ts']));
  });

  describe("Codex's apply_patch (V4A patch format, no structured file_path field)", () => {
    it('extracts the path from an "Add File" section', () => {
      const events = [
        makeEvent({
          event_type: 'PostToolUse',
          payload: {
            tool_input: {
              command: ['apply_patch', '*** Begin Patch\n*** Add File: hello.txt\n+Hello, world!\n*** End Patch\n'],
            },
          },
        }),
      ];
      expect(filesTouched(events)).toEqual(new Set(['hello.txt']));
    });

    it('extracts the path from an "Update File" section with a hunk', () => {
      const patch =
        '*** Begin Patch\n*** Update File: src/app.py\n@@ def greet():\n-print("Hi")\n+print("Hello, world!")\n*** End Patch\n';
      const events = [
        makeEvent({ event_type: 'PostToolUse', payload: { tool_input: { command: ['apply_patch', patch] } } }),
      ];
      expect(filesTouched(events)).toEqual(new Set(['src/app.py']));
    });

    it('extracts both the original and renamed path from an "Update File" + "Move to" pair', () => {
      const patch =
        '*** Begin Patch\n*** Update File: src/app.py\n*** Move to: src/main.py\n@@ def greet():\n-print("Hi")\n+print("Hello, world!")\n*** End Patch\n';
      const events = [
        makeEvent({ event_type: 'PostToolUse', payload: { tool_input: { command: ['apply_patch', patch] } } }),
      ];
      expect(filesTouched(events)).toEqual(new Set(['src/app.py', 'src/main.py']));
    });

    it('extracts every file touched across multiple sections in one patch', () => {
      const patch =
        '*** Begin Patch\n*** Add File: a.txt\n+a\n*** Delete File: b.txt\n*** Update File: c.txt\n@@\n-old\n+new\n*** End Patch\n';
      const events = [
        makeEvent({ event_type: 'PostToolUse', payload: { tool_input: { command: ['apply_patch', patch] } } }),
      ];
      expect(filesTouched(events)).toEqual(new Set(['a.txt', 'b.txt', 'c.txt']));
    });

    it('never fabricates a path for a non-apply_patch command array', () => {
      const events = [
        makeEvent({ event_type: 'PostToolUse', payload: { tool_input: { command: ['ls', '-la'] } } }),
      ];
      expect(filesTouched(events)).toEqual(new Set());
    });
  });
});

describe('filesTouchedByInteraction', () => {
  it('groups by prompt_id and keeps interactions separate', () => {
    const events = [
      makeEvent({ prompt_id: 'p1', event_type: 'PostToolUse', payload: { tool_input: { file_path: 'a.ts' } } }),
      makeEvent({ prompt_id: 'p2', event_type: 'PostToolUse', payload: { tool_input: { file_path: 'b.ts' } } }),
    ];
    const grouped = filesTouchedByInteraction(events);
    expect(grouped.get('p1')).toEqual(new Set(['a.ts']));
    expect(grouped.get('p2')).toEqual(new Set(['b.ts']));
  });

  it('falls back to turn_id when prompt_id is absent (Codex events)', () => {
    const events = [
      makeEvent({ turn_id: 't1', event_type: 'PostToolUse', payload: { tool_input: { path: 'x.ts' } } }),
    ];
    const grouped = filesTouchedByInteraction(events);
    expect(grouped.get('t1')).toEqual(new Set(['x.ts']));
  });

  it('drops events with neither prompt_id nor turn_id', () => {
    const events = [makeEvent({ event_type: 'PostToolUse', payload: { tool_input: { file_path: 'a.ts' } } })];
    expect(filesTouchedByInteraction(events).size).toBe(0);
  });
});
