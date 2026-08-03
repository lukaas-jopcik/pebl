import { describe, expect, it } from 'vitest';
import { buildReceiptFields } from '../src/receipt/fields.js';
import { renderReceipt } from '../src/receipt/render.js';
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

describe('renderReceipt', () => {
  it('renders a full verified receipt matching the MVP wedge example shape', () => {
    const fields = buildReceiptFields(
      baseInput({
        intentText: 'Add rate limiting to the auth endpoint',
        durationMs: 9 * 60 * 1000 + 12 * 1000,
        tokenCount: 61000,
        verification: { status: 'verified', commitSha: 'a1b2c3d4e5f6' },
      }),
    );
    const output = renderReceipt(fields);

    expect(output).toContain('Add rate limiting to the auth endpoint');
    expect(output).toContain('9m 12s · 61k tokens · 14 tool calls');
    expect(output).toContain('checks passed — commit a1b2c3d');
    expect(output).toContain('none detected');
    expect(output).toContain('High — commit found and checks passed.');
  });

  it('renders a not-yet-verified receipt without fabricating a pass/fail', () => {
    const fields = buildReceiptFields(baseInput({ intentText: 'Refactor the pricing calculation' }));
    const output = renderReceipt(fields);

    expect(output).toContain('not yet verified — no commit detected in the matching window');
    expect(output).toContain('n/a — outcome unknown, not claimed.');
  });

  it('omits the TASK line entirely when no intent text is available', () => {
    const fields = buildReceiptFields(baseInput());
    const output = renderReceipt(fields);
    expect(output).not.toContain('TASK');
  });

  it('omits the Insight line when the confidence gate was not met', () => {
    const fields = buildReceiptFields(baseInput());
    const output = renderReceipt(fields);
    expect(output).not.toContain('Insight:');
  });

  it('includes the Insight line when the confidence gate was met', () => {
    const fields = buildReceiptFields(
      baseInput({ inSessionSignals: ['explicit_deliverable', 'success_criteria'] }),
    );
    const output = renderReceipt(fields);
    expect(output).toContain('Insight:');
  });
});
