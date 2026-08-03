/**
 * Deterministic prompt-importance classification — no LLM call (FR-5).
 * Implements docs/01-product/canonical-prd.md §8 ("Prompt importance") and
 * the deterministic feature list from docs/03-ai/prompt-quality-engine.md.
 */

/**
 * Low-information messages that never produce a standalone receipt
 * (FR-6). Matched case-insensitively against the trimmed, punctuation-
 * stripped message — "Yes!", "ok.", "  Continue " all match.
 */
const LOW_INFORMATION_PHRASES = new Set([
  '',
  'yes',
  'y',
  'no',
  'n',
  'ok',
  'okay',
  'k',
  'kk',
  'sure',
  'go ahead',
  'continue',
  'proceed',
  'retry',
  'try again',
  'again',
  'thanks',
  'thank you',
  'thx',
  'ty',
  'cool',
  'nice',
  'great',
  'awesome',
  'perfect',
  'good',
  'looks good',
  'lgtm',
  'done',
  'fix typo',
  'fix the typo',
  'np',
  'nvm',
  'never mind',
  'stop',
  'cancel',
  'never',
]);

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, '')
    .trim();
}

export function isLowInformation(text: string): boolean {
  return LOW_INFORMATION_PHRASES.has(normalize(text));
}

export type PromptSignal =
  | 'explicit_deliverable'
  | 'constraint_language'
  | 'success_criteria'
  | 'project_convention_reference'
  | 'verification_request'
  | 'contradictory_instructions'
  | 'broad_scope';

interface SignalRule {
  signal: PromptSignal;
  pattern: RegExp;
}

// Deterministic, keyword/pattern-based — deliberately simple and auditable
// (each match is inspectable via `signals`), not a learned model.
const SIGNAL_RULES: SignalRule[] = [
  {
    signal: 'explicit_deliverable',
    pattern: /\b(add|implement|create|build|fix|refactor|remove|update|write|migrate)\b/i,
  },
  {
    signal: 'constraint_language',
    pattern: /\b(must not|do not|don't|without|only|never|exclude|excluding|except)\b/i,
  },
  {
    signal: 'success_criteria',
    pattern: /\b(test|tests|verify|acceptance criteria|should pass|passes|passing)\b/i,
  },
  {
    signal: 'project_convention_reference',
    pattern: /\b(existing|current|like we did|convention|pattern|adapter|as before)\b/i,
  },
  {
    signal: 'verification_request',
    pattern: /\b(run (the )?tests|check|confirm|make sure|ensure)\b/i,
  },
  {
    // Weak, deliberately simplistic heuristic: a negation near a contrastive
    // conjunction. False positives are acceptable here — this signal only
    // ever informs an insight's confidence, never gates `meaningful`.
    signal: 'contradictory_instructions',
    pattern: /\b(but (don't|not|never)|however (don't|not|never))\b/i,
  },
];

const BROAD_SCOPE_WORD_COUNT = 40;

export interface PromptImportance {
  meaningful: boolean;
  signals: PromptSignal[];
}

/**
 * Word count is an intentionally weak proxy for scope size — per
 * docs/03-ai/prompt-quality-engine.md, "length equals quality" is exactly
 * the assumption this must NOT make. It is one signal among several, not
 * a score, and never the sole basis for `meaningful`.
 */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function classifyPrompt(text: string): PromptImportance {
  if (isLowInformation(text)) {
    return { meaningful: false, signals: [] };
  }

  const signals: PromptSignal[] = [];
  for (const rule of SIGNAL_RULES) {
    if (rule.pattern.test(text)) signals.push(rule.signal);
  }
  if (wordCount(text) >= BROAD_SCOPE_WORD_COUNT) signals.push('broad_scope');

  return { meaningful: true, signals };
}
