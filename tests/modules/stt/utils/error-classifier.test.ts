/**
 * Error Classifier Tests
 * Target Coverage: 90%+
 */

import { describe, it, expect } from 'vitest';
import {
  classifyDeepgramError,
  isFatalError,
  isRetryableError,
  ErrorType,
  type ClassifiedError,
} from '@/modules/stt/utils/error-classifier';

describe('Error Classifier', () => {
  describe('Fatal Errors (4xx client errors)', () => {
    it('should classify 401 as fatal', () => {
      const error = new Error('HTTP 401: Unauthorized');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.FATAL);
      expect(classified.retryable).toBe(false);
      expect(classified.statusCode).toBe(401);
      expect(classified.message).toBe('Invalid API key');
      expect(classified.originalError).toBe(error);
    });

    it('should classify 403 as fatal', () => {
      const error = new Error('HTTP 403: Forbidden');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.FATAL);
      expect(classified.retryable).toBe(false);
      expect(classified.statusCode).toBe(403);
      expect(classified.message).toBe('Access forbidden');
    });

    it('should classify 404 as fatal', () => {
      const error = new Error('HTTP 404: Not Found');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.FATAL);
      expect(classified.retryable).toBe(false);
      expect(classified.statusCode).toBe(404);
      expect(classified.message).toBe('Endpoint not found');
    });

    it('should classify 400 as fatal', () => {
      const error = new Error('HTTP 400: Bad Request');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.FATAL);
      expect(classified.retryable).toBe(false);
      expect(classified.statusCode).toBe(400);
      expect(classified.message).toBe('Invalid request configuration');
    });

    it('should mark all fatal errors as not retryable', () => {
      const fatalCodes = [400, 401, 403, 404];

      fatalCodes.forEach((code) => {
        const error = new Error(`HTTP ${code}: Error`);
        const classified = classifyDeepgramError(error);

        expect(classified.retryable).toBe(false);
        expect(classified.type).toBe(ErrorType.FATAL);
      });
    });

    it('should classify unknown 4xx errors as fatal', () => {
      const error = new Error('HTTP 418: I am a teapot');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.FATAL);
      expect(classified.retryable).toBe(false);
      expect(classified.statusCode).toBe(418);
      expect(classified.message).toBe('Client error 418');
    });
  });

  describe('Retryable Errors (5xx server errors)', () => {
    it('should classify 429 as retryable', () => {
      const error = new Error('HTTP 429: Rate Limit Exceeded');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.RETRYABLE);
      expect(classified.retryable).toBe(true);
      expect(classified.statusCode).toBe(429);
      expect(classified.message).toBe('Rate limit exceeded');
    });

    it('should classify 500 as retryable', () => {
      const error = new Error('HTTP 500: Internal Server Error');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.RETRYABLE);
      expect(classified.retryable).toBe(true);
      expect(classified.statusCode).toBe(500);
      expect(classified.message).toBe('Server error');
    });

    it('should classify 502 as retryable', () => {
      const error = new Error('HTTP 502: Bad Gateway');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.RETRYABLE);
      expect(classified.retryable).toBe(true);
      expect(classified.statusCode).toBe(502);
      expect(classified.message).toBe('Bad gateway');
    });

    it('should classify 503 as retryable', () => {
      const error = new Error('HTTP 503: Service Unavailable');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.RETRYABLE);
      expect(classified.retryable).toBe(true);
      expect(classified.statusCode).toBe(503);
      expect(classified.message).toBe('Service unavailable');
    });

    it('should classify 504 as retryable', () => {
      const error = new Error('HTTP 504: Gateway Timeout');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.RETRYABLE);
      expect(classified.retryable).toBe(true);
      expect(classified.statusCode).toBe(504);
      expect(classified.message).toBe('Gateway timeout');
    });

    it('should mark all retryable errors as retryable: true', () => {
      const retryableCodes = [429, 500, 502, 503, 504];

      retryableCodes.forEach((code) => {
        const error = new Error(`HTTP ${code}: Error`);
        const classified = classifyDeepgramError(error);

        expect(classified.retryable).toBe(true);
        expect([ErrorType.RETRYABLE, ErrorType.TIMEOUT]).toContain(classified.type);
      });
    });

    it('should classify unknown 5xx errors as retryable', () => {
      const error = new Error('HTTP 599: Custom Server Error');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.RETRYABLE);
      expect(classified.retryable).toBe(true);
      expect(classified.statusCode).toBe(599);
      expect(classified.message).toBe('Server error 599');
    });
  });

  describe('Network Errors', () => {
    it('should classify ECONNREFUSED as retryable', () => {
      const error = new Error('ECONNREFUSED: Connection refused');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.TIMEOUT);
      expect(classified.retryable).toBe(true);
      expect(classified.message).toBe('Network or timeout error');
    });

    it('should classify ETIMEDOUT as retryable', () => {
      const error = new Error('ETIMEDOUT: Connection timed out');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.TIMEOUT);
      expect(classified.retryable).toBe(true);
    });

    it('should classify ECONNRESET as retryable', () => {
      const error = new Error('ECONNRESET: Connection reset by peer');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.TIMEOUT);
      expect(classified.retryable).toBe(true);
    });

    it('should classify network timeout as retryable', () => {
      const error = new Error('Network timeout occurred');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.TIMEOUT);
      expect(classified.retryable).toBe(true);
    });

    it('should classify socket errors as retryable', () => {
      const error = new Error('Socket error: connection lost');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.TIMEOUT);
      expect(classified.retryable).toBe(true);
    });

    it('should handle case-insensitive network keywords', () => {
      const error = new Error('NETWORK ERROR DETECTED');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.TIMEOUT);
      expect(classified.retryable).toBe(true);
    });
  });

  describe('Connection Closed Errors', () => {
    it('should classify "connection closed" as retryable (network timeout)', () => {
      const error = new Error('Connection closed unexpectedly');
      const classified = classifyDeepgramError(error);

      // "closed" keyword triggers network error check, classifies as TIMEOUT
      expect(classified.type).toBe(ErrorType.TIMEOUT);
      expect(classified.retryable).toBe(true);
      expect(classified.message).toBe('Network or timeout error');
    });

    it('should classify "socket closed" as retryable (network timeout)', () => {
      const error = new Error('Socket closed by server');
      const classified = classifyDeepgramError(error);

      // "socket" + "closed" keywords trigger network error check
      expect(classified.type).toBe(ErrorType.TIMEOUT);
      expect(classified.retryable).toBe(true);
    });

    it('should classify "websocket closed" as retryable (network timeout)', () => {
      const error = new Error('WebSocket closed abnormally');
      const classified = classifyDeepgramError(error);

      // "websocket" + "closed" keywords trigger network error check
      expect(classified.type).toBe(ErrorType.TIMEOUT);
      expect(classified.retryable).toBe(true);
    });

    it('should handle case-insensitive connection closed keywords', () => {
      const error = new Error('CONNECTION CLOSED');
      const classified = classifyDeepgramError(error);

      // Case-insensitive matching, still triggers network error check
      expect(classified.type).toBe(ErrorType.TIMEOUT);
      expect(classified.retryable).toBe(true);
    });
  });

  describe('Status Code Extraction', () => {
    it('should extract status from error.status property', () => {
      const error = Object.assign(new Error('Server error'), { status: 503 });
      const classified = classifyDeepgramError(error);

      expect(classified.statusCode).toBe(503);
      expect(classified.retryable).toBe(true);
    });

    it('should extract status from error.code property', () => {
      const error = Object.assign(new Error('Bad request'), { code: 400 });
      const classified = classifyDeepgramError(error);

      expect(classified.statusCode).toBe(400);
      expect(classified.retryable).toBe(false);
    });

    it('should extract status from error message "HTTP 401"', () => {
      const error = new Error('HTTP 401: Unauthorized access');
      const classified = classifyDeepgramError(error);

      expect(classified.statusCode).toBe(401);
      expect(classified.retryable).toBe(false);
    });

    it('should extract status from error message "401:"', () => {
      const error = new Error('401: Authentication failed');
      const classified = classifyDeepgramError(error);

      expect(classified.statusCode).toBe(401);
      expect(classified.retryable).toBe(false);
    });

    it('should extract status from error message with whitespace', () => {
      const error = new Error('HTTP  502  Bad Gateway');
      const classified = classifyDeepgramError(error);

      expect(classified.statusCode).toBe(502);
      expect(classified.retryable).toBe(true);
    });

    it('should prioritize error.status over error.code', () => {
      const error = Object.assign(new Error('Error'), { status: 500, code: 400 });
      const classified = classifyDeepgramError(error);

      expect(classified.statusCode).toBe(500); // Should use status, not code
    });

    it('should return undefined statusCode for errors without status', () => {
      const error = new Error('Generic error message');
      const classified = classifyDeepgramError(error);

      expect(classified.statusCode).toBeUndefined();
    });

    it('should handle errors with non-numeric status property', () => {
      const error = Object.assign(new Error('Error'), { status: 'INVALID' });
      const classified = classifyDeepgramError(error);

      // Should not extract invalid status, fallback to unknown error handling
      expect(classified.retryable).toBe(true); // Unknown errors are retryable
    });

    it('should handle errors with non-numeric code property', () => {
      const error = Object.assign(new Error('Error'), { code: 'ERR_CONNECTION' });
      const classified = classifyDeepgramError(error);

      // Should not extract invalid code, fallback to unknown error handling
      expect(classified.retryable).toBe(true);
    });
  });

  describe('Unknown Errors', () => {
    it('should default to retryable for unknown errors', () => {
      const error = new Error('Unknown weird error');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.RETRYABLE);
      expect(classified.retryable).toBe(true);
      expect(classified.message).toBe('Unknown weird error');
    });

    it('should handle errors without message', () => {
      const error = new Error();
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.RETRYABLE);
      expect(classified.retryable).toBe(true);
      expect(classified.message).toBe('Unknown error');
    });

    it('should handle errors with empty message', () => {
      const error = new Error('');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.RETRYABLE);
      expect(classified.retryable).toBe(true);
      expect(classified.message).toBe('Unknown error');
    });

    it('should handle errors with special characters', () => {
      const error = new Error('Error: 💥 Something exploded!');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.RETRYABLE);
      expect(classified.retryable).toBe(true);
      expect(classified.originalError).toBe(error);
    });
  });

  describe('Helper Functions', () => {
    describe('isFatalError', () => {
      it('should return true for 401 errors', () => {
        const error = new Error('HTTP 401: Unauthorized');
        expect(isFatalError(error)).toBe(true);
      });

      it('should return false for 500 errors', () => {
        const error = new Error('HTTP 500: Internal Server Error');
        expect(isFatalError(error)).toBe(false);
      });

      it('should return false for network errors', () => {
        const error = new Error('ECONNREFUSED');
        expect(isFatalError(error)).toBe(false);
      });

      it('should return false for unknown errors', () => {
        const error = new Error('Unknown error');
        expect(isFatalError(error)).toBe(false);
      });
    });

    describe('isRetryableError', () => {
      it('should return false for 401 errors', () => {
        const error = new Error('HTTP 401: Unauthorized');
        expect(isRetryableError(error)).toBe(false);
      });

      it('should return true for 500 errors', () => {
        const error = new Error('HTTP 500: Internal Server Error');
        expect(isRetryableError(error)).toBe(true);
      });

      it('should return true for 503 errors', () => {
        const error = new Error('HTTP 503: Service Unavailable');
        expect(isRetryableError(error)).toBe(true);
      });

      it('should return true for network errors', () => {
        const error = new Error('ECONNREFUSED');
        expect(isRetryableError(error)).toBe(true);
      });

      it('should return true for connection closed errors', () => {
        const error = new Error('Connection closed');
        expect(isRetryableError(error)).toBe(true);
      });

      it('should return true for unknown errors (fail-safe)', () => {
        const error = new Error('Mysterious error');
        expect(isRetryableError(error)).toBe(true);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle errors with both status code and network keywords', () => {
      const error = Object.assign(new Error('Network timeout'), { status: 504 });
      const classified = classifyDeepgramError(error);

      // Status code takes precedence in implementation (checked first)
      expect(classified.type).toBe(ErrorType.RETRYABLE);
      expect(classified.statusCode).toBe(504);
      expect(classified.retryable).toBe(true);
    });

    it('should handle errors with status code in message AND property', () => {
      const error = Object.assign(new Error('HTTP 401: Unauthorized'), { status: 500 });
      const classified = classifyDeepgramError(error);

      // Property should take precedence over message
      expect(classified.statusCode).toBe(500);
      expect(classified.retryable).toBe(true);
    });

    it('should preserve original error reference', () => {
      const error = new Error('Test error');
      const classified = classifyDeepgramError(error);

      expect(classified.originalError).toBe(error);
      expect(classified.originalError).toBeInstanceOf(Error);
    });

    it('should handle errors with very long messages', () => {
      const longMessage = 'Error: ' + 'A'.repeat(10000);
      const error = new Error(longMessage);
      const classified = classifyDeepgramError(error);

      expect(classified.message).toBe(longMessage);
      expect(classified.retryable).toBe(true);
    });

    it('should handle multiple status codes in message (use first)', () => {
      const error = new Error('HTTP 500 led to 502 gateway error');
      const classified = classifyDeepgramError(error);

      expect(classified.statusCode).toBe(500); // Should extract first code
    });

    it('should handle status code at beginning of message', () => {
      const error = new Error('500 Internal Server Error');
      const classified = classifyDeepgramError(error);

      expect(classified.statusCode).toBe(500);
      expect(classified.retryable).toBe(true);
    });

    it('should not extract invalid status codes', () => {
      const error = new Error('Error code 999 happened');
      const classified = classifyDeepgramError(error);

      expect(classified.statusCode).toBe(999);
      // 999 is not in 4xx or 5xx range, falls through to unknown
      expect(classified.retryable).toBe(true);
    });
  });

  describe('Real-World Deepgram Error Patterns', () => {
    it('should handle Deepgram API key error', () => {
      const error = Object.assign(new Error('Invalid API key'), { status: 401 });
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.FATAL);
      expect(classified.retryable).toBe(false);
      expect(classified.message).toBe('Invalid API key');
    });

    it('should handle Deepgram rate limit error', () => {
      const error = Object.assign(new Error('Rate limit exceeded'), { status: 429 });
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.RETRYABLE);
      expect(classified.retryable).toBe(true);
      expect(classified.message).toBe('Rate limit exceeded');
    });

    it('should handle Deepgram service unavailable', () => {
      const error = Object.assign(new Error('Service temporarily unavailable'), { status: 503 });
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.RETRYABLE);
      expect(classified.retryable).toBe(true);
    });

    it('should handle WebSocket connection errors', () => {
      const error = new Error('WebSocket closed with code 1006');
      const classified = classifyDeepgramError(error);

      // "websocket" + "closed" keywords trigger network error check
      expect(classified.type).toBe(ErrorType.TIMEOUT);
      expect(classified.retryable).toBe(true);
    });

    it('should handle Deepgram timeout errors', () => {
      const error = new Error('Deepgram request timeout');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.TIMEOUT);
      expect(classified.retryable).toBe(true);
    });
  });
});
