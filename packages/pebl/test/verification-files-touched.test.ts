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
