import type { VerificationResult } from '../verification/join.js';

/**
 * Everything a receipt needs, already assembled by the caller (Phase 7's
 * `pebl receipt` command: query the local index, run the Verification
 * Join, pull classifier signals). Deliberately decoupled from exactly how
 * those facts were gathered — this module only formats them.
 */
export interface ReceiptInput {
  /** Raw prompt text for the "TASK:" line. Undefined if privacy settings withhold it. */
  intentText?: string;
  durationMs?: number;
  /** Total input+output tokens, if OTel enrichment was available (additive, never required). */
  tokenCount?: number;
  toolCallCount: number;
  frictionEvents: {
    permissionDenials: number;
    failedToolCalls: number;
    retries: number;
  };
  verification: VerificationResult;
  /** Deterministic classifier signals (Phase 4) observed in this interaction. */
  inSessionSignals: string[];
  /**
   * Only ever this one user's own history — never cross-user (Product
   * Principle #2 / FR-14). The caller is responsible for that scoping;
   * this type has no notion of "other users" to accidentally widen into.
   */
  personalBaseline?: {
    matchingPastSessions: number;
    patternDescription: string;
  };
}

export interface ReceiptField {
  label: string;
  value: string;
  evidenceSource: string;
}

export interface ReceiptFields {
  intent?: ReceiptField;
  effort: ReceiptField;
  verification: ReceiptField;
  friction: ReceiptField;
  confidence: ReceiptField;
  insight?: ReceiptField;
}
