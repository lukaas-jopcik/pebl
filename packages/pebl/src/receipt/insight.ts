import type { ReceiptInput } from './types.js';

/**
 * FR-14's confidence gate: at most one insight, shown only when backed by
 * either (a) at least two direct signals observed in this session, or
 * (b) a repeated pattern across at least five of the user's own past
 * sessions. Below that bar, returns undefined — Product Principle #2
 * ("one precise insight beats ten generic tips... remain silent when
 * confidence is low") means silence is the correct output, not a weak
 * guess dressed up as a recommendation.
 */
export function selectInsight(input: Pick<ReceiptInput, 'inSessionSignals' | 'personalBaseline'>): string | undefined {
  if (input.inSessionSignals.length >= 2) {
    return `This session showed: ${describeSignals(input.inSessionSignals)}.`;
  }

  if (input.personalBaseline && input.personalBaseline.matchingPastSessions >= 5) {
    return input.personalBaseline.patternDescription;
  }

  return undefined;
}

const SIGNAL_DESCRIPTIONS: Record<string, string> = {
  explicit_deliverable: 'a clear deliverable',
  constraint_language: 'explicit constraints',
  success_criteria: 'stated success criteria',
  project_convention_reference: 'a reference to existing project conventions',
  verification_request: 'a requested verification step',
  contradictory_instructions: 'potentially contradictory instructions',
  broad_scope: 'a broad scope',
};

function describeSignals(signals: string[]): string {
  return signals.map((signal) => SIGNAL_DESCRIPTIONS[signal] ?? signal).join(', ');
}
