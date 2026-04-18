/**
 * VDA Response Validator
 *
 * Validates response data from the VDA service to prevent malformed data
 * from corrupting the frontend or causing runtime errors, and HTML-escapes
 * free-text fields so image-based prompt injection that lands in
 * `assessment` or `recommendation` cannot execute as markup on the client
 * or smuggle role-impersonation tokens into the downstream Groq prompt.
 */

// Maximum field lengths. Kept in sync with the producer-side caps in
// visual-damage-assessment/gemini_vision.py `_OUTPUT_FIELD_LIMITS`. A little
// headroom is allowed in case the producer truncation marker (U+2026) pushes
// a field one char past the nominal cap.
const MAX_LENGTHS = {
  assessment: 2000,
  recommendation: 2000,
  estimated_cost_usd: 60,
  confidence_score: 8,
};

const REQUIRED_FIELDS = ['assessment', 'recommendation', 'estimated_cost_usd', 'confidence_score'];

// Control chars (NUL-US, DEL) minus \t \n \r. Any of these in a free-text
// field is a strong signal of adversarial output and we reject outright.
const CONTROL_CHAR_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

// Free-text fields that may legitimately contain end-user content and
// therefore MUST be HTML-escaped before being returned to the browser or
// piped into another LLM prompt.
const HTML_ESCAPED_FIELDS = new Set(['assessment', 'recommendation']);

/**
 * Minimal HTML-entity escape. Covers the five characters that can break
 * out of a text context into markup or attribute context.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Validates VDA service response against expected schema
 * @param {Object} vdaResponse - Parsed JSON response from VDA service
 * @returns {Object} { isValid: boolean, sanitized: Object|null, errors: string[] }
 */
export function validateVdaResponse(vdaResponse) {
  const errors = [];

  // Check if response is an object
  if (!vdaResponse || typeof vdaResponse !== 'object' || Array.isArray(vdaResponse)) {
    return {
      isValid: false,
      sanitized: null,
      errors: ['Response must be a JSON object'],
    };
  }

  // Check for required fields
  for (const field of REQUIRED_FIELDS) {
    if (!(field in vdaResponse)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // If missing required fields, fail immediately
  if (errors.length > 0) {
    return { isValid: false, sanitized: null, errors };
  }

  // Validate and sanitize each field
  const sanitized = {};

  for (const field of REQUIRED_FIELDS) {
    const value = vdaResponse[field];

    if (typeof value !== 'string') {
      errors.push(`Field '${field}' must be a string, got ${typeof value}`);
      continue;
    }

    const maxLength = MAX_LENGTHS[field];
    if (value.length > maxLength) {
      errors.push(
        `Field '${field}' exceeds maximum length of ${maxLength} characters (got ${value.length})`,
      );
      continue;
    }

    if (CONTROL_CHAR_RE.test(value)) {
      errors.push(`Field '${field}' contains disallowed control characters`);
      continue;
    }

    if (field === 'confidence_score') {
      if (!isValidConfidenceScore(value)) {
        errors.push(`Field 'confidence_score' has invalid format: ${value}`);
        continue;
      }
    }

    if (field === 'estimated_cost_usd') {
      if (!isValidCostEstimate(value)) {
        errors.push(`Field 'estimated_cost_usd' has invalid format: ${value}`);
        continue;
      }
    }

    // HTML-escape free-text fields so any injected markup in the model's
    // output becomes inert before it reaches the frontend or the Groq
    // catalog matcher. Structured fields (cost, confidence) are already
    // format-validated above.
    sanitized[field] = HTML_ESCAPED_FIELDS.has(field) ? escapeHtml(value) : value;
  }

  // If any validation errors, return invalid
  if (errors.length > 0) {
    return { isValid: false, sanitized: null, errors };
  }

  // Success - return sanitized object (only known fields)
  return { isValid: true, sanitized, errors: [] };
}

/**
 * Validates confidence score format
 * @param {string} score - Confidence score string
 * @returns {boolean} Whether format is valid
 */
function isValidConfidenceScore(score) {
  if (!score || score.trim() === '') {
    return false;
  }

  // Allow patterns like: "0.85", "85%", "high", "medium", "low", "N/A"
  const trimmed = score.trim().toLowerCase();

  // Common text values
  if (['high', 'medium', 'low', 'n/a', 'unknown'].includes(trimmed)) {
    return true;
  }

  // Numeric patterns (with or without %)
  const numericPattern = /^[\d.]+%?$/;
  return numericPattern.test(trimmed);
}

/**
 * Validates cost estimate format
 * @param {string} cost - Cost estimate string
 * @returns {boolean} Whether format is valid
 */
function isValidCostEstimate(cost) {
  if (!cost || cost.trim() === '') {
    return false;
  }

  const trimmed = cost.trim().toLowerCase();

  // Allow "N/A", "Unknown", etc.
  if (['n/a', 'unknown', 'tbd', 'contact for quote'].includes(trimmed)) {
    return true;
  }

  // Allow ranges like "$100-$500", "$100 - $500", "$1,000", etc.
  // Allow currency symbols: $, €, £ and optional whitespace around the range separator
  const costPattern = /^[$€£]?[\d,.]+(\s*[-–]\s*[$€£]?[\d,.]+)?(\s*(USD|EUR|GBP))?$/i;
  return costPattern.test(trimmed);
}

/**
 * Validates VDA response and throws error if invalid
 * Convenience wrapper for use in controllers
 * @param {Object} vdaResponse - Parsed JSON response from VDA service
 * @returns {Object} Sanitized response (only if valid)
 * @throws {Error} If validation fails
 */
export function validateAndSanitizeVdaResponse(vdaResponse) {
  const { isValid, sanitized, errors } = validateVdaResponse(vdaResponse);

  if (!isValid) {
    const error = new Error(`Invalid VDA response: ${errors.join('; ')}`);
    error.validationErrors = errors;
    error.statusCode = 502; // Bad Gateway - upstream returned invalid data
    throw error;
  }

  return sanitized;
}

export default { validateVdaResponse, validateAndSanitizeVdaResponse };
