import { describe, expect, it } from 'vitest';
import { classifyPrompt, isLowInformation } from '../src/classify/prompt-importance.js';

describe('isLowInformation', () => {
  const lowInfo = [
    '',
    '   ',
    'yes',
    'Yes!',
    'ok',
    'OK.',
    'okay',
    'continue',
    'Continue.',
    'retry',
    'try again',
    'thanks',
    'thank you',
    'thanks!',
    'fix typo',
    'Fix Typo.',
    'lgtm',
    'looks good',
    'done',
    'cool',
    'nvm',
  ];

  it.each(lowInfo)('treats %j as low-information', (text) => {
    expect(isLowInformation(text)).toBe(true);
  });

  const meaningful = [
    'Add rate limiting to the auth endpoint, must include a test.',
    'Refactor the pricing calculation, keep the existing test suite green.',
    'Fix the null pointer exception in parseConfig',
    'yes, but also add error handling for the timeout case',
    'continue implementing the retry backoff logic',
  ];

  it.each(meaningful)('treats %j as NOT low-information', (text) => {
    expect(isLowInformation(text)).toBe(false);
  });
});

describe('classifyPrompt', () => {
  it('marks a low-information message as not meaningful with no signals', () => {
    const result = classifyPrompt('continue');
    expect(result.meaningful).toBe(false);
    expect(result.signals).toEqual([]);
  });

  it('marks a real task prompt as meaningful and detects deterministic signals', () => {
    const result = classifyPrompt(
      'Add rate limiting to the auth endpoint, must include a test for the 429 response.',
    );
    expect(result.meaningful).toBe(true);
    expect(result.signals).toContain('explicit_deliverable');
    expect(result.signals).toContain('success_criteria');
  });

  it('detects constraint language', () => {
    const result = classifyPrompt("Refactor parseConfig, but don't change its public signature.");
    expect(result.signals).toContain('constraint_language');
  });

  it('detects a project-convention reference', () => {
    const result = classifyPrompt('Implement Google OAuth using the existing Prisma adapter.');
    expect(result.signals).toContain('project_convention_reference');
  });

  it('detects a verification request', () => {
    const result = classifyPrompt('Make the change, then run the tests to confirm nothing broke.');
    expect(result.signals).toContain('verification_request');
  });

  it('flags broad_scope for a long message and not for a short one', () => {
    const longPrompt = Array.from({ length: 45 }, (_, i) => `word${i}`).join(' ');
    const shortPrompt = 'Fix the typo in the README title.';

    expect(classifyPrompt(longPrompt).signals).toContain('broad_scope');
    expect(classifyPrompt(shortPrompt).signals).not.toContain('broad_scope');
  });

  it('a meaningful prompt can have zero matched signals but is still meaningful', () => {
    // Deliberately picks a real, non-trivial request that happens to dodge
    // every keyword rule — signals are informational enrichment, not the gate.
    const result = classifyPrompt('rename Foo to Bar everywhere');
    expect(result.meaningful).toBe(true);
  });
});
