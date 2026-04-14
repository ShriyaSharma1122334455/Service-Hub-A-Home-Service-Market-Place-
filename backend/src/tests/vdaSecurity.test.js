/**
 * VDA Security Test Suite
 *
 * Tests for security fixes:
 * - Error normalization (prevents information leakage)
 * - Retry logic (resilience against transient failures)
 * - Response validation (prevents malformed data)
 * - URL validation (prevents misconfiguration)
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { normalizeVdaError } from '../utils/vdaErrorNormalizer.js';
import { retryWithBackoff } from '../utils/retryWithBackoff.js';
import { validateVdaResponse, validateAndSanitizeVdaResponse } from '../utils/vdaResponseValidator.js';

describe('VDA Security - Error Normalization', () => {
  it('should normalize 500 server errors to generic message', () => {
    const vdaJson = {
      detail: 'Internal server error: File /app/groq_vision.py line 42 failed',
    };

    const { userMessage, logDetails } = normalizeVdaError(vdaJson, 500);

    expect(userMessage).toBe('The visual assessment service is temporarily unavailable. Please try again later.');
    expect(logDetails).toContain('"statusCode": 500');
    expect(logDetails).toContain('groq_vision.py'); // Full error logged
  });

  it('should hide stack traces from client errors', () => {
    const vdaJson = {
      error: 'ValueError: invalid input at function process_image in module vision.handlers',
    };

    const { userMessage } = normalizeVdaError(vdaJson, 422);

    expect(userMessage).not.toContain('process_image');
    expect(userMessage).not.toContain('vision.handlers');
    expect(userMessage).toContain('Unable to process the request');
  });

  it('should strip file paths from error messages', () => {
    const vdaJson = {
      detail: 'Failed to load image from /app/uploads/temp_abc123.jpg',
    };

    const { userMessage } = normalizeVdaError(vdaJson, 422);

    expect(userMessage).not.toContain('/app/uploads');
    expect(userMessage).not.toContain('temp_abc123.jpg');
    expect(userMessage).toContain('Failed to load image from');
  });

  it('should normalize 413 payload too large error', () => {
    const { userMessage } = normalizeVdaError({}, 413);

    expect(userMessage).toBe('The uploaded image is too large. Please try a smaller image.');
  });

  it('should normalize 401 auth errors without exposing details', () => {
    const vdaJson = {
      detail: 'Invalid token: expected format Bearer xyz123',
    };

    const { userMessage } = normalizeVdaError(vdaJson, 401);

    expect(userMessage).toBe('Visual assessment service authentication failed. Please contact support.');
    expect(userMessage).not.toContain('Bearer');
    expect(userMessage).not.toContain('xyz123');
  });

  it('should log full error details server-side', () => {
    const vdaJson = {
      detail: 'Sensitive error details',
      trace: 'Full stack trace here',
    };

    const { logDetails } = normalizeVdaError(vdaJson, 500);
    const parsed = JSON.parse(logDetails);

    expect(parsed.fullResponse.detail).toBe('Sensitive error details');
    expect(parsed.fullResponse.trace).toBe('Full stack trace here');
    expect(parsed.statusCode).toBe(500);
    expect(parsed.timestamp).toBeDefined();
  });
});

describe('VDA Security - Retry Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should retry on network failure and succeed on 2nd attempt', async () => {
    let attempt = 0;
    const mockFn = jest.fn(async () => {
      attempt++;
      if (attempt === 1) {
        const err = new Error('fetch failed');
        err.code = 'ECONNREFUSED';
        throw err;
      }
      return 'success';
    });

    const result = await retryWithBackoff(mockFn, {
      maxAttempts: 3,
      delays: [100, 200],
    });

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should NOT retry on 400 client errors', async () => {
    const mockFn = jest.fn(async () => {
      const err = new Error('Bad request');
      err.status = 400;
      throw err;
    });

    await expect(
      retryWithBackoff(mockFn, {
        maxAttempts: 3,
        delays: [100, 200],
      }),
    ).rejects.toThrow('Bad request');

    expect(mockFn).toHaveBeenCalledTimes(1); // No retry
  });

  it('should retry on 503 service unavailable', async () => {
    let attempt = 0;
    const mockFn = jest.fn(async () => {
      attempt++;
      if (attempt < 3) {
        const err = new Error('Service unavailable');
        err.status = 503;
        throw err;
      }
      return 'success';
    });

    const result = await retryWithBackoff(mockFn, {
      maxAttempts: 3,
      delays: [100, 200],
    });

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should NOT retry on AbortError (timeout)', async () => {
    const mockFn = jest.fn(async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    });

    await expect(
      retryWithBackoff(mockFn, {
        maxAttempts: 3,
        delays: [100, 200],
      }),
    ).rejects.toThrow('The operation was aborted');

    expect(mockFn).toHaveBeenCalledTimes(1); // No retry on timeout
  });

  it('should respect max attempts limit', async () => {
    const mockFn = jest.fn(async () => {
      const err = new Error('fetch failed');
      err.code = 'ETIMEDOUT';
      throw err;
    });

    await expect(
      retryWithBackoff(mockFn, {
        maxAttempts: 3,
        delays: [50, 50],
      }),
    ).rejects.toThrow('fetch failed');

    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should call onRetry callback before each retry', async () => {
    let attempt = 0;
    const onRetry = jest.fn();
    const mockFn = jest.fn(async () => {
      attempt++;
      if (attempt < 2) {
        const err = new Error('Network error');
        err.code = 'ECONNRESET';
        throw err;
      }
      return 'success';
    });

    await retryWithBackoff(mockFn, {
      maxAttempts: 3,
      delays: [100, 200],
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 100);
  });
});

describe('VDA Security - Response Validation', () => {
  it('should accept valid VDA response', () => {
    const response = {
      assessment: 'Minor water damage to ceiling',
      recommendation: 'Replace drywall and check for leaks',
      estimated_cost_usd: '$500-$800',
      confidence_score: '0.85',
    };

    const { isValid, sanitized } = validateVdaResponse(response);

    expect(isValid).toBe(true);
    expect(sanitized).toEqual(response);
  });

  it('should reject response with missing required field', () => {
    const response = {
      assessment: 'Damage assessment',
      recommendation: 'Fix it',
      // Missing estimated_cost_usd and confidence_score
    };

    const { isValid, errors } = validateVdaResponse(response);

    expect(isValid).toBe(false);
    expect(errors).toContain('Missing required field: estimated_cost_usd');
    expect(errors).toContain('Missing required field: confidence_score');
  });

  it('should reject response with oversized field', () => {
    const response = {
      assessment: 'A'.repeat(6000), // Exceeds 5000 char limit
      recommendation: 'Fix it',
      estimated_cost_usd: '$500',
      confidence_score: '0.85',
    };

    const { isValid, errors } = validateVdaResponse(response);

    expect(isValid).toBe(false);
    expect(errors[0]).toContain('exceeds maximum length');
    expect(errors[0]).toContain('assessment');
  });

  it('should reject response with non-string field', () => {
    const response = {
      assessment: 'Damage assessment',
      recommendation: 'Fix it',
      estimated_cost_usd: 500, // Number instead of string
      confidence_score: '0.85',
    };

    const { isValid, errors } = validateVdaResponse(response);

    expect(isValid).toBe(false);
    expect(errors[0]).toContain('estimated_cost_usd');
    expect(errors[0]).toContain('must be a string');
  });

  it('should strip unknown fields for security', () => {
    const response = {
      assessment: 'Damage assessment',
      recommendation: 'Fix it',
      estimated_cost_usd: '$500',
      confidence_score: '0.85',
      malicious_field: '<script>alert("xss")</script>',
      internal_data: '/path/to/secret',
    };

    const { isValid, sanitized } = validateVdaResponse(response);

    expect(isValid).toBe(true);
    expect(sanitized).not.toHaveProperty('malicious_field');
    expect(sanitized).not.toHaveProperty('internal_data');
    expect(Object.keys(sanitized)).toHaveLength(4);
  });

  it('should accept valid confidence score formats', () => {
    const validScores = ['0.85', '85%', 'high', 'medium', 'low', 'N/A'];

    validScores.forEach((score) => {
      const response = {
        assessment: 'Test',
        recommendation: 'Test',
        estimated_cost_usd: '$500',
        confidence_score: score,
      };

      const { isValid } = validateVdaResponse(response);
      expect(isValid).toBe(true);
    });
  });

  it('should accept valid cost estimate formats', () => {
    const validCosts = ['$500', '$500-$800', '$1,000', 'N/A', 'Contact for quote', '€500'];

    validCosts.forEach((cost) => {
      const response = {
        assessment: 'Test',
        recommendation: 'Test',
        estimated_cost_usd: cost,
        confidence_score: '0.85',
      };

      const { isValid } = validateVdaResponse(response);
      expect(isValid).toBe(true);
    });
  });

  it('should throw error when using validateAndSanitizeVdaResponse on invalid data', () => {
    const invalidResponse = {
      assessment: 'Test',
      // Missing required fields
    };

    expect(() => {
      validateAndSanitizeVdaResponse(invalidResponse);
    }).toThrow('Invalid VDA response');
  });

  it('should return sanitized data when using validateAndSanitizeVdaResponse on valid data', () => {
    const validResponse = {
      assessment: 'Test assessment',
      recommendation: 'Test recommendation',
      estimated_cost_usd: '$500',
      confidence_score: '0.85',
      extra_field: 'should be stripped',
    };

    const sanitized = validateAndSanitizeVdaResponse(validResponse);

    expect(sanitized).not.toHaveProperty('extra_field');
    expect(sanitized.assessment).toBe('Test assessment');
  });
});

describe('VDA Security - Edge Cases', () => {
  it('should handle null VDA response gracefully', () => {
    const { isValid, errors } = validateVdaResponse(null);

    expect(isValid).toBe(false);
    expect(errors[0]).toContain('must be a JSON object');
  });

  it('should handle array instead of object', () => {
    const { isValid, errors } = validateVdaResponse([]);

    expect(isValid).toBe(false);
    expect(errors[0]).toContain('must be a JSON object');
  });

  it('should truncate oversized error messages in normalizer', () => {
    const vdaJson = {
      detail: 'X'.repeat(500), // Very long error
    };

    const { userMessage } = normalizeVdaError(vdaJson, 422);

    // Should be truncated and sanitized
    expect(userMessage.length).toBeLessThan(250);
  });
});
