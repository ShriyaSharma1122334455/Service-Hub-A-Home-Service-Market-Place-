/**
 * VDA Error Normalizer
 *
 * Sanitizes error messages from the VDA service to prevent information leakage.
 * Returns safe messages for clients while providing detailed logs for server-side debugging.
 */

/**
 * Normalizes VDA service errors to safe client messages
 * @param {Object} vdaJson - Parsed JSON response from VDA service
 * @param {number} statusCode - HTTP status code from VDA service
 * @returns {Object} { userMessage: string, logDetails: string }
 */
export function normalizeVdaError(vdaJson, statusCode) {
  // Extract raw error from VDA response
  const raw = vdaJson?.detail ?? vdaJson?.error ?? vdaJson?.message ?? 'Unknown error';

  // Build detailed log for server-side only
  const logDetails = {
    statusCode,
    rawError: raw,
    fullResponse: vdaJson,
    timestamp: new Date().toISOString(),
  };

  // Determine safe user-facing message based on status code and error patterns
  let userMessage;

  if (statusCode >= 500) {
    // 5xx: Server errors - generic message, don't expose internals
    userMessage = 'The visual assessment service is temporarily unavailable. Please try again later.';
  } else if (statusCode === 413) {
    // 413: Payload too large
    userMessage = 'The uploaded image is too large. Please try a smaller image.';
  } else if (statusCode === 415) {
    // 415: Unsupported media type
    userMessage = 'The uploaded file format is not supported. Please upload a JPEG or PNG image.';
  } else if (statusCode === 422) {
    // 422: Validation error - strip internal details before showing
    const detail = Array.isArray(raw) ? raw.map((e) => e.msg || e).join('; ') : String(raw);
    // Strip any file paths, stack traces, or internal references
    const sanitized = stripInternalDetails(detail);
    // Only show sanitized message if it's meaningful
    if (sanitized && sanitized !== 'Processing error') {
      userMessage = `Unable to process the request: ${sanitized}`;
    } else {
      userMessage = 'Unable to process the request. Please check your input and try again.';
    }
  } else if (statusCode === 401 || statusCode === 403) {
    // Auth errors - don't expose authentication details
    userMessage = 'Visual assessment service authentication failed. Please contact support.';
  } else if (statusCode === 404) {
    // 404: Not found
    userMessage = 'Visual assessment service endpoint not found. Please contact support.';
  } else if (statusCode >= 400 && statusCode < 500) {
    // Other 4xx: Client errors - generic message
    userMessage = 'Unable to complete the visual assessment. Please check your input and try again.';
  } else {
    // Unexpected status code
    userMessage = 'An unexpected error occurred during visual assessment. Please try again.';
  }

  return {
    userMessage,
    logDetails: JSON.stringify(logDetails, null, 2),
  };
}

/**
 * Strips potentially sensitive internal details from error messages
 * @param {string} message - Raw error message
 * @returns {string} Sanitized message
 */
function stripInternalDetails(message) {
  if (!message || typeof message !== 'string') {
    return 'Invalid input';
  }

  let sanitized = message;

  // Remove file paths (Unix and Windows style)
  sanitized = sanitized.replace(/\/[\w/.-]+\.(py|js|ts|json|txt|log)/gi, '');
  sanitized = sanitized.replace(/[A-Z]:\\[\w\\.-]+\.(py|js|ts|json|txt|log)/gi, '');
  // Also remove directory paths without extensions
  sanitized = sanitized.replace(/\/[\w/.-]+\//g, '');

  // Remove stack trace indicators
  sanitized = sanitized.replace(/File ".*?", line \d+/gi, '');
  sanitized = sanitized.replace(/at .+? \(.+?:\d+:\d+\)/gi, '');

  // Remove internal module references (e.g., "vision.handlers", "app.utils")
  sanitized = sanitized.replace(/in module ['"]?[\w./-]+['"]?/gi, '');
  sanitized = sanitized.replace(/\b[\w]+\.[\w]+/g, ''); // Remove dotted module names

  // Remove function names that might expose implementation
  sanitized = sanitized.replace(/function ['"]?[\w._]+['"]?/gi, '');
  sanitized = sanitized.replace(/at ['"]?[\w._]+['"]?/gi, '');

  // Remove IP addresses and localhost references
  sanitized = sanitized.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]');
  sanitized = sanitized.replace(/localhost:\d+/gi, '[service]');

  // Remove common internal error prefixes
  sanitized = sanitized.replace(/^(Error|Exception|Traceback|ValueError|TypeError|RuntimeError):\s*/i, '');

  // Truncate if still too long (prevent DoS via huge error messages)
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 197) + '...';
  }

  // Clean up any multiple spaces from removals
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized || 'Processing error';
}

export default { normalizeVdaError };
