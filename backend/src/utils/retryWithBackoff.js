/**
 * Retry with Exponential Backoff
 *
 * Provides resilience against transient failures when calling external services.
 * Retries network errors and 5xx server errors, but not 4xx client errors.
 */

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_DELAYS = [1000, 2000]; // 1s, 2s between retries

/**
 * Executes an async function with retry logic and exponential backoff
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry configuration
 * @param {number} options.maxAttempts - Maximum number of attempts (default: 3)
 * @param {number[]} options.delays - Delays in ms between retries (default: [1000, 2000])
 * @param {Function} options.shouldRetry - Custom function to determine if error is retryable
 * @param {Function} options.onRetry - Callback called before each retry (for logging)
 * @returns {Promise<any>} Result from the function
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    delays = DEFAULT_DELAYS,
    shouldRetry = defaultShouldRetry,
    onRetry = null,
  } = options;

  let lastError;

  /* Sequential retries: each attempt must finish (or fail) before the next. */
  /* eslint-disable no-await-in-loop -- backoff requires sequential awaits */
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry this error
      const isRetryable = shouldRetry(error, attempt);

      // If this was the last attempt or error is not retryable, throw
      if (attempt >= maxAttempts || !isRetryable) {
        throw error;
      }

      // Calculate delay for this retry (use delay for attempt-1, or last delay if beyond array)
      const delayIndex = Math.min(attempt - 1, delays.length - 1);
      const delayMs = delays[delayIndex] || delays[delays.length - 1] || 1000;

      // Call retry callback if provided
      if (onRetry) {
        onRetry(error, attempt, delayMs);
      }

      // Wait before retrying
      await sleep(delayMs);
    }
  }
  /* eslint-enable no-await-in-loop */

  // Should never reach here, but just in case
  throw lastError;
}

/**
 * Default retry logic: retry on transient failures, not client errors
 * @param {Error} error - The error that occurred
 * @param {number} _attempt - Current attempt number
 * @returns {boolean} Whether to retry
 */
function defaultShouldRetry(error, _attempt) {
  // AbortError means timeout - do NOT retry (already waited too long)
  if (error?.name === 'AbortError') {
    return false;
  }

  // Network errors (connection refused, timeout, DNS, etc.) - RETRY
  if (isNetworkError(error)) {
    return true;
  }

  // If error has a response (HTTP error), check status code
  if (error?.response || error?.status) {
    const status = error.response?.status || error.status;

    // 5xx server errors - RETRY (transient)
    if (status >= 500 && status < 600) {
      return true;
    }

    // 4xx client errors - DO NOT RETRY (our fault, won't change)
    if (status >= 400 && status < 500) {
      return false;
    }

    // 429 Too Many Requests - RETRY (but could be enhanced with longer backoff)
    if (status === 429) {
      return true;
    }
  }

  // For VDA service, check if error indicates server issue
  if (error?.message) {
    const msg = error.message.toLowerCase();

    // Connection errors - RETRY
    if (
      msg.includes('econnrefused') ||
      msg.includes('enotfound') ||
      msg.includes('etimedout') ||
      msg.includes('econnreset') ||
      msg.includes('socket hang up') ||
      msg.includes('network error') ||
      msg.includes('fetch failed')
    ) {
      return true;
    }
  }

  // Unknown errors - do NOT retry by default (safer)
  return false;
}

/**
 * Checks if an error is a network-level error (not HTTP error)
 * @param {Error} error
 * @returns {boolean}
 */
function isNetworkError(error) {
  if (!error) return false;

  // Check error code (Node.js network errors)
  const networkCodes = [
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNRESET',
    'EPIPE',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EAI_AGAIN',
  ];

  if (error.code && networkCodes.includes(error.code)) {
    return true;
  }

  // Check error type
  if (error.type === 'system' || error.type === 'network') {
    return true;
  }

  return false;
}

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Specialized retry wrapper for fetch calls
 * Automatically wraps fetch and checks response status
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {Object} retryOptions - Retry configuration
 * @returns {Promise<Response>} Fetch response
 */
export function retryFetch(url, options = {}, retryOptions = {}) {
  return retryWithBackoff(
    async () => {
      const response = await fetch(url, options);

      // For fetch, we need to check if response is ok
      // If not ok and retryable status, throw to trigger retry
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        error.status = response.status;
        error.response = response;
        throw error;
      }

      return response;
    },
    {
      ...retryOptions,
      shouldRetry: (error, attempt) => {
        // Use custom retry logic if provided
        if (retryOptions.shouldRetry) {
          return retryOptions.shouldRetry(error, attempt);
        }

        // Use default retry logic
        return defaultShouldRetry(error, attempt);
      },
    },
  );
}

export default { retryWithBackoff, retryFetch };
