/**
 * Redaction utilities for VRA outputs (CSV/JSON evidence).
 * Conservative patterns to remove potential PII/secrets from free-form fields like reason_code.
 */

// Basic redaction similar to logger redactions; keep dependency‑free here for reuse in controllers/services.
export function redactString(val: string): string {
  if (!val) return '';
  let s = String(val);
  // Email redaction
  s = s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]');
  // Authorization headers / Bearer tokens
  s = s.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]');
  // JWT-like strings (three base64url segments)
  s = s.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[REDACTED_JWT]');
  // Stripe keys
  s = s.replace(/sk_(test|live)_[A-Za-z0-9]+/g, 'sk_$1_[REDACTED]');
  // Potential card-like sequences (very conservative): 13-19 digits
  s = s.replace(/\b\d{13,19}\b/g, '[REDACTED_NUMERIC]');
  return s;
}

export default { redactString };
