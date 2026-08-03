import picocolors from 'picocolors';
import type { ReceiptFields } from './types.js';

/**
 * Terminal-native layout matching the example format in
 * docs/01-product/mvp-wedge-verified-receipt.md. Minimal color (green for
 * a verified checkmark, red for a reversed one) — no TUI framework, this
 * is plain formatted text a receipt command prints and exits.
 */
export function renderReceipt(fields: ReceiptFields): string {
  const lines: string[] = [];

  if (fields.intent) {
    lines.push(`${picocolors.bold('TASK:')} ${fields.intent.value}`);
    lines.push('');
  }

  lines.push(fields.effort.value);
  lines.push('');

  lines.push(`${picocolors.bold('Verified:')} ${colorizeVerification(fields.verification.value)}`);
  lines.push('');

  lines.push(`${picocolors.bold('Friction:')} ${fields.friction.value}`);
  lines.push('');

  if (fields.insight) {
    lines.push(`${picocolors.bold('Insight:')} ${fields.insight.value}`);
    lines.push('');
  }

  lines.push(`${picocolors.bold('Confidence:')} ${fields.confidence.value}`);

  return lines.join('\n');
}

function colorizeVerification(value: string): string {
  if (value.startsWith('✓')) return picocolors.green(value);
  if (value.startsWith('✗')) return picocolors.red(value);
  return value;
}
