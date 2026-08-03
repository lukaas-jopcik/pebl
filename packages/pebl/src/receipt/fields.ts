import type { VerificationResult } from '../verification/join.js';
import { selectInsight } from './insight.js';
import type { ReceiptField, ReceiptFields, ReceiptInput } from './types.js';

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function formatTokenCount(count: number): string {
  if (count >= 1000) return `${Math.round(count / 1000)}k`;
  return String(count);
}

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function buildEffortField(input: ReceiptInput): ReceiptField {
  const parts: string[] = [];
  if (input.durationMs !== undefined) parts.push(formatDuration(input.durationMs));
  if (input.tokenCount !== undefined) parts.push(`${formatTokenCount(input.tokenCount)} tokens`);
  parts.push(`${input.toolCallCount} tool call${input.toolCallCount === 1 ? '' : 's'}`);

  return { label: 'Effort', value: parts.join(' · '), evidenceSource: 'session hook events' };
}

/**
 * FR-11's never-fabricate guard, made structural: every branch here must
 * come from a real field on VerificationResult (status/reason/commitSha)
 * — there is no default/else branch that invents a status.
 */
function buildVerificationField(result: VerificationResult): ReceiptField {
  if (result.status === 'verified') {
    const commit = result.commitSha ? ` — commit ${shortSha(result.commitSha)}` : '';
    return {
      label: 'Verified',
      value: `✓ checks passed${commit}`,
      evidenceSource: 'matched commit + test/build run',
    };
  }

  if (result.status === 'verification_reversed') {
    const commit = result.commitSha ? ` (commit ${shortSha(result.commitSha)})` : '';
    return {
      label: 'Verified',
      value: `✗ verification reversed${commit} — later reverted or rewritten`,
      evidenceSource: 'revert recheck (24h/5d)',
    };
  }

  // not_yet_verified — reason is required by the VerificationReason type,
  // so this switch is exhaustive by construction, not by convention.
  const reasonText: Record<NonNullable<VerificationResult['reason']>, string> = {
    no_commit_detected: 'no commit detected in the matching window',
    no_test_signal: `commit found${result.commitSha ? ` (${shortSha(result.commitSha)})` : ''}, no test command detected`,
    checks_failed: `commit found${result.commitSha ? ` (${shortSha(result.commitSha)})` : ''}, checks failed`,
    commit_reverted_or_rewritten: 'commit was reverted or rewritten',
  };
  const reason = result.reason ? reasonText[result.reason] : 'outcome unknown';

  return {
    label: 'Verified',
    value: `not yet verified — ${reason}`,
    evidenceSource: 'Verification Join',
  };
}

function buildFrictionField(events: ReceiptInput['frictionEvents']): ReceiptField {
  const parts: string[] = [];
  if (events.permissionDenials > 0) {
    parts.push(`${events.permissionDenials} permission denial${events.permissionDenials === 1 ? '' : 's'}`);
  }
  if (events.failedToolCalls > 0) {
    parts.push(`${events.failedToolCalls} failed tool call${events.failedToolCalls === 1 ? '' : 's'}`);
  }
  if (events.retries > 0) {
    parts.push(`${events.retries} retr${events.retries === 1 ? 'y' : 'ies'}`);
  }

  return {
    label: 'Friction',
    value: parts.length > 0 ? parts.join(', ') : 'none detected',
    evidenceSource: 'permission/tool-failure/retry events',
  };
}

function buildConfidenceField(result: VerificationResult): ReceiptField {
  if (result.status === 'verified') {
    return {
      label: 'Confidence',
      value: 'High — commit found and checks passed.',
      evidenceSource: 'Verification Join',
    };
  }
  if (result.status === 'verification_reversed') {
    return {
      label: 'Confidence',
      value: 'High — later evidence (revert) contradicts the initial pass.',
      evidenceSource: 'Verification Join',
    };
  }
  return {
    label: 'Confidence',
    value: 'n/a — outcome unknown, not claimed.',
    evidenceSource: 'Verification Join',
  };
}

/** Builds every receipt field per FR-12/FR-13: each is evidence-tagged, and nothing is ever approximated. */
export function buildReceiptFields(input: ReceiptInput): ReceiptFields {
  const fields: ReceiptFields = {
    effort: buildEffortField(input),
    verification: buildVerificationField(input.verification),
    friction: buildFrictionField(input.frictionEvents),
    confidence: buildConfidenceField(input.verification),
  };

  if (input.intentText) {
    fields.intent = {
      label: 'Task',
      value: input.intentText,
      evidenceSource: 'UserPromptSubmit payload',
    };
  }

  const insight = selectInsight(input);
  if (insight) {
    fields.insight = { label: 'Insight', value: insight, evidenceSource: 'insight confidence gate' };
  }

  return fields;
}
