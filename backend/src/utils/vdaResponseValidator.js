/**
 * VDA Response Validator
 *
 * Validates response data from the VDA service to prevent malformed data
 * from corrupting the frontend or causing runtime errors.
 */

// Maximum field lengths (prevent DoS via huge responses)
const MAX_LENGTHS = {
  assessment: 5000,
  recommendation: 5000,
  estimated_cost_usd: 100,
  confidence_score: 10,
};

// Required fields in VDA response
const REQUIRED_FIELDS = ['assessment', 'recommendation', 'estimated_cost_usd', 'confidence_score'];

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

    // Type validation: all fields should be strings
    if (typeof value !== 'string') {
      errors.push(`Field '${field}' must be a string, got ${typeof value}`);
      continue;
    }

    // Length validation
    const maxLength = MAX_LENGTHS[field];
    if (value.length > maxLength) {
      errors.push(`Field '${field}' exceeds maximum length of ${maxLength} characters (got ${value.length})`);
      continue;
    }

    // Content validation for specific fields
    if (field === 'confidence_score') {
      // Should be numeric string or percentage
      if (!isValidConfidenceScore(value)) {
        errors.push(`Field 'confidence_score' has invalid format: ${value}`);
        continue;
      }
    }

    if (field === 'estimated_cost_usd') {
      // Should be reasonable cost format
      if (!isValidCostEstimate(value)) {
        errors.push(`Field 'estimated_cost_usd' has invalid format: ${value}`);
        continue;
      }
    }

    // Add sanitized value (strip unknown fields for security)
    sanitized[field] = value;
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

  // Allow ranges like "$100-$500", "$1,000", etc.
  // Allow currency symbols: $, €, £
  const costPattern = /^[$€£]?[\d,.]+([-–][$€£]?[\d,.]+)?(\s*(USD|EUR|GBP))?$/i;
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
