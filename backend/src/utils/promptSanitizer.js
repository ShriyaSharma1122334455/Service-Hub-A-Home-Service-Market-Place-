/**
 * Prompt Sanitizer - defense-in-depth against prompt injection
 *
 * The authoritative defense against image-based prompt injection is the
 * strict JSON response schema enforced on the VDA side. This module adds
 * denylist-based scrubbing to the task text and to any model-produced text
 * that is re-used in downstream prompts (Gemma catalog ranking).
 *
 * The cleaning pipeline mirrors visual-damage-assessment/gemini_vision.py:
 *   1. NFKC-normalize so Cyrillic / fullwidth / ligature lookalikes collapse
 *      to ASCII before pattern matching.
 *   2. Strip zero-width and bidi control characters.
 *   3. Whitelist printable ASCII + common whitespace.
 *   4. Remove known injection patterns (case-insensitive, tolerant of
 *      punctuation/whitespace between tokens).
 *   5. Collapse whitespace and truncate.
 */

const INVISIBLE_CHAR_RE = /[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;

// Printable ASCII (0x20-0x7e) plus tab / LF / CR.
const NON_ASCII_PRINTABLE_RE = /[^\t\n\r\x20-\x7e]/g;

/**
 * Control characters (NUL–US and DEL) minus tab / LF / CR.
 * Implemented without a regex so eslint `no-control-regex` does not fire.
 * @param {string} s
 * @returns {string}
 */
function stripDisallowedControlChars(s) {
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c === 0x7f || (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d)) {
      continue;
    }
    out += s[i];
  }
  return out;
}

// Between multi-token phrases we tolerate any run of non-word characters so
// attackers can't slip past with punctuation (e.g. "ignore---previous").
const SEP = '[^\\w]+';

const INJECTION_PATTERNS = [
  // Instruction overrides.
  new RegExp(`ignore${SEP}(previous|all|above|prior|the)${SEP}instructions?`, 'gi'),
  new RegExp(`disregard${SEP}(previous|all|above|prior|the)?${SEP}?(instructions?|rules|guidelines)`, 'gi'),
  new RegExp(`forget${SEP}(previous|all|above|prior|what|everything|you)`, 'gi'),

  // System / role impersonation.
  /system\s*:/gi,
  /assistant\s*:/gi,
  /user\s*:/gi,
  /role\s*:/gi,
  /\[\s*system\s*\]/gi,
  /\[\s*assistant\s*\]/gi,
  /\[\s*user\s*\]/gi,

  // Delimiter / fence attempts.
  /###\s*system/gi,
  /###\s*assistant/gi,
  /```system/gi,
  /```assistant/gi,

  // Role switching attempts.
  new RegExp(`you${SEP}are${SEP}now`, 'gi'),
  new RegExp(`act${SEP}(as|like)${SEP}(a|an)?`, 'gi'),
  new RegExp(`pretend${SEP}to${SEP}be`, 'gi'),
  new RegExp(`from${SEP}now${SEP}on`, 'gi'),
  new RegExp(`your${SEP}(new${SEP})?role${SEP}is`, 'gi'),
  new RegExp(`new${SEP}role`, 'gi'),

  // Direct instruction overrides.
  /new\s+instructions?:/gi,
  /updated\s+instructions?:/gi,
  new RegExp(`override${SEP}(instructions?|rules|guidelines)`, 'gi'),

  // System-prompt exfiltration.
  new RegExp(`reveal${SEP}(the${SEP})?(system${SEP})?prompt`, 'gi'),
  new RegExp(`print${SEP}(the${SEP})?(system${SEP})?(prompt|instructions?)`, 'gi'),
  new RegExp(`repeat${SEP}(the${SEP})?(system${SEP})?(prompt|instructions?)`, 'gi'),
];

/**
 * Sanitize task input from the end customer before it is embedded in any
 * prompt sent to Gemma.
 *
 * @param {string} input - Raw user input for task description
 * @param {number} [maxLength=500] - Maximum length after sanitization
 * @returns {string} Sanitized input
 */
export function sanitizeTaskInput(input, maxLength = 500) {
  if (typeof input !== 'string') {
    return '';
  }

  let sanitized = input.normalize('NFKC');
  sanitized = sanitized.replace(INVISIBLE_CHAR_RE, '');
  sanitized = sanitized.replace(NON_ASCII_PRINTABLE_RE, '');

  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}

/**
 * Sanitize model-produced text (assessment / recommendation) before re-using
 * it in a downstream prompt. This runs on already-HTML-escaped strings from
 * the VDA response validator, so it doubles as a second line of defense.
 *
 * @param {string} input - Assessment or recommendation text
 * @param {number} [maxLength=2000] - Maximum length after sanitization
 * @returns {string}
 */
export function sanitizeAssessmentText(input, maxLength = 2000) {
  if (typeof input !== 'string') {
    return '';
  }

  let sanitized = input.normalize('NFKC');
  sanitized = sanitized.replace(INVISIBLE_CHAR_RE, '');
  sanitized = stripDisallowedControlChars(sanitized);

  // Remove the most dangerous role-impersonation markers; keep the rest of
  // the English prose intact so the catalog ranker still has useful context.
  const dangerousPatterns = [
    /system\s*:/gi,
    /assistant\s*:/gi,
    /\[\s*system\s*\]/gi,
    /\[\s*assistant\s*\]/gi,
    /###\s*system/gi,
    /###\s*assistant/gi,
    /```system/gi,
    /```assistant/gi,
    new RegExp(`ignore${SEP}(previous|all|above|prior|the)${SEP}instructions?`, 'gi'),
  ];

  for (const pattern of dangerousPatterns) {
    sanitized = sanitized.replace(pattern, '');
  }

  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}

export default {
  sanitizeTaskInput,
  sanitizeAssessmentText,
};
