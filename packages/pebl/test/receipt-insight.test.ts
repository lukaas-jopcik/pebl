import { describe, expect, it } from 'vitest';
import { selectInsight } from '../src/receipt/insight.js';

describe('selectInsight (FR-14 confidence gate)', () => {
  it('returns undefined when there are fewer than two in-session signals and no personal baseline', () => {
    expect(selectInsight({ inSessionSignals: [] })).toBeUndefined();
    expect(selectInsight({ inSessionSignals: ['explicit_deliverable'] })).toBeUndefined();
  });

  it('returns an insight once at least two in-session signals are present', () => {
    const insight = selectInsight({
      inSessionSignals: ['explicit_deliverable', 'success_criteria'],
    });
    expect(insight).toBeDefined();
    expect(insight).toMatch(/clear deliverable/);
    expect(insight).toMatch(/success criteria/);
  });

  it('ignores a personal baseline with fewer than 5 matching past sessions', () => {
    const insight = selectInsight({
      inSessionSignals: [],
      personalBaseline: { matchingPastSessions: 4, patternDescription: 'should not appear' },
    });
    expect(insight).toBeUndefined();
  });

  it('surfaces a personal-baseline insight once the 5-session threshold is met', () => {
    const insight = selectInsight({
      inSessionSignals: [],
      personalBaseline: {
        matchingPastSessions: 5,
        patternDescription: 'Tasks with a stated test command verify first-try more often.',
      },
    });
    expect(insight).toBe('Tasks with a stated test command verify first-try more often.');
  });

  it('prefers in-session signals over a personal baseline when both qualify', () => {
    const insight = selectInsight({
      inSessionSignals: ['explicit_deliverable', 'constraint_language'],
      personalBaseline: { matchingPastSessions: 10, patternDescription: 'baseline insight' },
    });
    expect(insight).not.toBe('baseline insight');
  });
});
