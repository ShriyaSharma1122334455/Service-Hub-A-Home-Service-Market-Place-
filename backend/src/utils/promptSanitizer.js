/**
 * Prompt Sanitizer - Protection against prompt injection attacks
 *
 * Sanitizes user input before inserting into AI prompts to prevent
 * malicious users from manipulating AI behavior through injection attacks.
 */

/**
 * Patterns that could indicate prompt injection attempts.
 * These are removed or neutralized from user input.
 */
const INJECTION_PATTERNS = [
  // Instruction overrides
  /ignore\s+(previous|all|above|prior)\s+instructions?/gi,
  /disregard\s+(previous|all|above|prior)\s+instructions?/gi,
  /forget\s+(previous|all|above|prior)\s+instructions?/gi,

  // System role attempts
  /system\s*:/gi,
  /assistant\s*:/gi,
  /\[\s*system\s*\]/gi,
  /\[\s*assistant\s*\]/gi,

  // Delimiter/fence attempts
  /###\s*system/gi,
  /###\s*assistant/gi,
  /```system/gi,
  /```assistant/gi,

  // Role switching attempts
  /you\s+are\s+now/gi,
  /act\s+as\s+(a|an)\s+/gi,
  /pretend\s+to\s+be/gi,

  // Direct instruction overrides
  /new\s+instructions?:/gi,
  /updated\s+instructions?:/gi,
  /override\s+instructions?/gi,
];

/**
 * Sanitize task input to prevent prompt injection.
 *
 * @param {string} input - Raw user input for task description
 * @param {number} maxLength - Maximum allowed length (default: 500)
 * @returns {string} Sanitized input safe for use in prompts
 */
export function sanitizeTaskInput(input, maxLength = 500) {
  if (typeof input !== 'string') {
    return '';
  }

  let sanitized = input;

  // Truncate to max length first
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // Remove injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Normalize whitespace (collapse multiple spaces/newlines)
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

/**
 * Sanitize assessment or recommendation text from VDA service.
 * More permissive than task input since it comes from AI model output,
 * but still prevents injection if the output is re-used in prompts.
 *
 * @param {string} input - Assessment or recommendation text
 * @param {number} maxLength - Maximum allowed length (default: 2000)
 * @returns {string} Sanitized text
 */
export function sanitizeAssessmentText(input, maxLength = 2000) {
  if (typeof input !== 'string') {
    return '';
  }

  let sanitized = input;

  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // Only remove the most dangerous patterns (system role attempts)
  // Less aggressive than task sanitization since this is model output
  const dangerousPatterns = [
    /system\s*:/gi,
    /\[\s*system\s*\]/gi,
    /###\s*system/gi,
    /```system/gi,
  ];

  for (const pattern of dangerousPatterns) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Normalize excessive whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

export default {
  sanitizeTaskInput,
  sanitizeAssessmentText,
};
