import { describe, expect, it } from 'vitest';
import { buildReceiptFields, formatDuration, formatTokenCount } from '../src/receipt/fields.js';
import type { ReceiptInput } from '../src/receipt/types.js';

function baseInput(overrides: Partial<ReceiptInput> = {}): ReceiptInput {
  return {
    toolCallCount: 14,
    frictionEvents: { permissionDenials: 0, failedToolCalls: 0, retries: 0 },
    verification: { status: 'not_yet_verified', reason: 'no_commit_detected' },
    inSessionSignals: [],
    ...overrides,
  };
}

describe('formatDuration / formatTokenCount', () => {
  it('formats duration as Nm Ns', () => {
    expect(formatDuration(9 * 60 * 1000 + 12 * 1000)).toBe('9m 12s');
    expect(formatDuration(0)).toBe('0m 0s');
  });

  it('formats token counts with a k suffix above 1000', () => {
    expect(formatTokenCount(61000)).toBe('61k');
    expect(formatTokenCount(500)).toBe('500');
  });
});

describe('buildReceiptFields', () => {
  it('omits the intent field entirely when no intent text is provided', () => {
    const fields = buildReceiptFields(baseInput());
    expect(fields.intent).toBeUndefined();
  });

  it('includes the intent field when intent text is provided', () => {
    const fields = buildReceiptFields(baseInput({ intentText: 'Add rate limiting to the auth endpoint' }));
    expect(fields.intent?.value).toBe('Add rate limiting to the auth endpoint');
    expect(fields.intent?.evidenceSource).toMatch(/UserPromptSubmit/);
  });

  it('omits duration and tokens from the effort line when not provided, but always includes tool call count', () => {
    const fields = buildReceiptFields(baseInput());
    expect(fields.effort.value).toBe('14 tool calls');
  });

  it('includes duration and tokens in the effort line when both are available', () => {
    const fields = buildReceiptFields(
      baseInput({ durationMs: 9 * 60 * 1000 + 12 * 1000, tokenCount: 61000 }),
    );
    expect(fields.effort.value).toBe('9m 12s · 61k tokens · 14 tool calls');
  });

  it('reports "none detected" friction when no friction events occurred', () => {
    const fields = buildReceiptFields(baseInput());
    expect(fields.friction.value).toBe('none detected');
  });

  it('lists every friction category that occurred, with correct pluralization', () => {
    const fields = buildReceiptFields(
      baseInput({
        frictionEvents: { permissionDenials: 1, failedToolCalls: 2, retries: 1 },
      }),
    );
    expect(fields.friction.value).toBe('1 permission denial, 2 failed tool calls, 1 retry');
  });

  it('never shows an insight field when the confidence gate is not met', () => {
    const fields = buildReceiptFields(baseInput());
    expect(fields.insight).toBeUndefined();
  });

  it('shows an insight field once the confidence gate is met', () => {
    const fields = buildReceiptFields(
      baseInput({ inSessionSignals: ['explicit_deliverable', 'success_criteria'] }),
    );
    expect(fields.insight).toBeDefined();
  });

  describe('verification field — one branch per real VerificationResult shape, never a fabricated default', () => {
    it('verified, with commit', () => {
      const fields = buildReceiptFields(
        baseInput({ verification: { status: 'verified', commitSha: 'a1b2c3d4e5f6' } }),
      );
      expect(fields.verification.value).toBe('✓ checks passed — commit a1b2c3d');
      expect(fields.confidence.value).toMatch(/^High/);
    });

    it('not_yet_verified: no_commit_detected', () => {
      const fields = buildReceiptFields(
        baseInput({ verification: { status: 'not_yet_verified', reason: 'no_commit_detected' } }),
      );
      expect(fields.verification.value).toBe('not yet verified — no commit detected in the matching window');
      expect(fields.confidence.value).toBe('n/a — outcome unknown, not claimed.');
    });

    it('not_yet_verified: no_test_signal, includes the short commit sha', () => {
      const fields = buildReceiptFields(
        baseInput({
          verification: { status: 'not_yet_verified', reason: 'no_test_signal', commitSha: 'a1b2c3d4e5f6' },
        }),
      );
      expect(fields.verification.value).toBe('not yet verified — commit found (a1b2c3d), no test command detected');
    });

    it('not_yet_verified: checks_failed', () => {
      const fields = buildReceiptFields(
        baseInput({
          verification: { status: 'not_yet_verified', reason: 'checks_failed', commitSha: 'a1b2c3d4e5f6' },
        }),
      );
      expect(fields.verification.value).toBe('not yet verified — commit found (a1b2c3d), checks failed');
    });

    it('verification_reversed', () => {
      const fields = buildReceiptFields(
        baseInput({
          verification: {
            status: 'verification_reversed',
            reason: 'commit_reverted_or_rewritten',
            commitSha: 'a1b2c3d4e5f6',
          },
        }),
      );
      expect(fields.verification.value).toBe(
        '✗ verification reversed (commit a1b2c3d) — later reverted or rewritten',
      );
      expect(fields.confidence.value).toMatch(/^High/);
    });
  });
});
