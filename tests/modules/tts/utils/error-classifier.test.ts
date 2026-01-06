/**
 * Error Classifier Utility Tests
 * Tests for Cartesia error classification logic
 */

import { describe, it, expect } from 'vitest';
import {
  classifyCartesiaError,
  isFatalError,
  getRetryDelay,
} from '@/modules/tts/utils/error-classifier';
import { TTSErrorType } from '@/modules/tts/types';

describe('classifyCartesiaError', () => {
  describe('Status Code Classification', () => {
    it('should classify 401 as AUTH error', () => {
      const error = Object.assign(new Error('Unauthorized'), { statusCode: 401 });
      const classified = classifyCartesiaError(error);

      expect(classified.type).toBe(TTSErrorType.AUTH);
      expect(classified.retryable).toBe(false);
      expect(classified.statusCode).toBe(401);
    });

    it('should classify 403 as AUTH error', () => {
      const error = Object.assign(new Error('Forbidden'), { statusCode: 403 });
      const classified = classifyCartesiaError(error);

      expect(classified.type).toBe(TTSErrorType.AUTH);
      expect(classified.retryable).toBe(false);
      expect(classified.statusCode).toBe(403);
    });

    it('should classify 429 as RATE_LIMIT error', () => {
      const error = Object.assign(new Error('Too Many Requests'), { statusCode: 429 });
      const classified = classifyCartesiaError(error);

      expect(classified.type).toBe(TTSErrorType.RATE_LIMIT);
      expect(classified.retryable).toBe(true);
      expect(classified.statusCode).toBe(429);
      expect(classified.retryAfter).toBe(5);
    });

    it('should classify 400-499 as FATAL errors', () => {
      const error = Object.assign(new Error('Bad Request'), { statusCode: 400 });
      const classified = classifyCartesiaError(error);

      expect(classified.type).toBe(TTSErrorType.FATAL);
      expect(classified.retryable).toBe(false);
      expect(classified.statusCode).toBe(400);
    });

    it('should classify 500-599 as TRANSIENT errors', () => {
      const error = Object.assign(new Error('Internal Server Error'), { statusCode: 500 });
      const classified = classifyCartesiaError(error);

      expect(classified.type).toBe(TTSErrorType.TRANSIENT);
      expect(classified.retryable).toBe(true);
      expect(classified.statusCode).toBe(500);
    });

    it('should handle statusCode via code property', () => {
      const error = Object.assign(new Error('Error'), { code: 401 });
      const classified = classifyCartesiaError(error);

      expect(classified.type).toBe(TTSErrorType.AUTH);
    });
  });

  describe('Message-Based Classification', () => {
    it('should classify timeout errors', () => {
      const error = new Error('Request timeout');
      const classified = classifyCartesiaError(error);

      expect(classified.type).toBe(TTSErrorType.TIMEOUT);
      expect(classified.retryable).toBe(true);
    });

    it('should classify "timed out" errors', () => {
      const error = new Error('Operation timed out');
      const classified = classifyCartesiaError(error);

      expect(classified.type).toBe(TTSErrorType.TIMEOUT);
      expect(classified.retryable).toBe(true);
    });

    it('should classify connection errors', () => {
      const error = new Error('Connection refused');
      const classified = classifyCartesiaError(error);

      expect(classified.type).toBe(TTSErrorType.CONNECTION);
      expect(classified.retryable).toBe(true);
    });

    it('should classify ECONNREFUSED errors', () => {
      const error = new Error('ECONNREFUSED');
      const classified = classifyCartesiaError(error);

      expect(classified.type).toBe(TTSErrorType.CONNECTION);
      expect(classified.retryable).toBe(true);
    });

    it('should classify ENOTFOUND errors', () => {
      const error = new Error('ENOTFOUND api.cartesia.ai');
      const classified = classifyCartesiaError(error);

      expect(classified.type).toBe(TTSErrorType.CONNECTION);
      expect(classified.retryable).toBe(true);
    });

    it('should classify network errors', () => {
      const error = new Error('Network error');
      const classified = classifyCartesiaError(error);

      expect(classified.type).toBe(TTSErrorType.CONNECTION);
      expect(classified.retryable).toBe(true);
    });

    it('should classify synthesis errors', () => {
      const error = new Error('Synthesis failed');
      const classified = classifyCartesiaError(error);

      expect(classified.type).toBe(TTSErrorType.SYNTHESIS);
      expect(classified.retryable).toBe(true);
    });

    it('should classify voice errors', () => {
      const error = new Error('Voice not found');
      const classified = classifyCartesiaError(error);

      expect(classified.type).toBe(TTSErrorType.SYNTHESIS);
      expect(classified.retryable).toBe(true);
    });

    it('should classify audio errors', () => {
      const error = new Error('Audio encoding error');
      const classified = classifyCartesiaError(error);

      expect(classified.type).toBe(TTSErrorType.SYNTHESIS);
      expect(classified.retryable).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null error', () => {
      const classified = classifyCartesiaError(null);

      expect(classified.type).toBe(TTSErrorType.TRANSIENT);
      expect(classified.retryable).toBe(true);
      expect(classified.message).toBe('Unknown error');
    });

    it('should handle undefined error', () => {
      const classified = classifyCartesiaError(undefined);

      expect(classified.type).toBe(TTSErrorType.TRANSIENT);
      expect(classified.retryable).toBe(true);
    });

    it('should handle error without message', () => {
      const error = {} as Error;
      const classified = classifyCartesiaError(error);

      expect(classified.type).toBe(TTSErrorType.TRANSIENT);
      expect(classified.message).toBe('Unknown error');
    });

    it('should handle unknown error type', () => {
      const error = new Error('Some random error');
      const classified = classifyCartesiaError(error);

      expect(classified.type).toBe(TTSErrorType.TRANSIENT);
      expect(classified.retryable).toBe(true);
    });

    it('should be case-insensitive for message matching', () => {
      const error1 = new Error('CONNECTION ERROR');
      const error2 = new Error('Connection Error');
      const error3 = new Error('connection error');

      expect(classifyCartesiaError(error1).type).toBe(TTSErrorType.CONNECTION);
      expect(classifyCartesiaError(error2).type).toBe(TTSErrorType.CONNECTION);
      expect(classifyCartesiaError(error3).type).toBe(TTSErrorType.CONNECTION);
    });
  });

  describe('Complex Error Objects', () => {
    it('should handle Cartesia error with all properties', () => {
      const error = {
        code: 500,
        type: 'server_error',
        message: 'Internal error',
        statusCode: 500,
      };

      const classified = classifyCartesiaError(error);

      expect(classified.type).toBe(TTSErrorType.TRANSIENT);
      expect(classified.statusCode).toBe(500);
      expect(classified.retryable).toBe(true);
    });

    it('should prioritize statusCode over message classification', () => {
      // Error has both 401 status and "timeout" in message
      // Status code should take precedence
      const error = Object.assign(new Error('Request timeout'), { statusCode: 401 });
      const classified = classifyCartesiaError(error);

      expect(classified.type).toBe(TTSErrorType.AUTH);
      expect(classified.retryable).toBe(false);
    });
  });
});

describe('isFatalError', () => {
  it('should return true for FATAL errors', () => {
    const error = { type: TTSErrorType.FATAL, message: 'Fatal', retryable: false };
    expect(isFatalError(error)).toBe(true);
  });

  it('should return true for AUTH errors', () => {
    const error = { type: TTSErrorType.AUTH, message: 'Auth', retryable: false };
    expect(isFatalError(error)).toBe(true);
  });

  it('should return false for CONNECTION errors', () => {
    const error = { type: TTSErrorType.CONNECTION, message: 'Connection', retryable: true };
    expect(isFatalError(error)).toBe(false);
  });

  it('should return false for TRANSIENT errors', () => {
    const error = { type: TTSErrorType.TRANSIENT, message: 'Transient', retryable: true };
    expect(isFatalError(error)).toBe(false);
  });

  it('should return false for RATE_LIMIT errors', () => {
    const error = { type: TTSErrorType.RATE_LIMIT, message: 'Rate limit', retryable: true };
    expect(isFatalError(error)).toBe(false);
  });

  it('should return false for TIMEOUT errors', () => {
    const error = { type: TTSErrorType.TIMEOUT, message: 'Timeout', retryable: true };
    expect(isFatalError(error)).toBe(false);
  });

  it('should return false for SYNTHESIS errors', () => {
    const error = { type: TTSErrorType.SYNTHESIS, message: 'Synthesis', retryable: true };
    expect(isFatalError(error)).toBe(false);
  });
});

describe('getRetryDelay', () => {
  it('should calculate exponential backoff', () => {
    const baseDelay = 1000;

    expect(getRetryDelay(0, baseDelay)).toBe(1000); // 1000 * 2^0
    expect(getRetryDelay(1, baseDelay)).toBe(2000); // 1000 * 2^1
    expect(getRetryDelay(2, baseDelay)).toBe(4000); // 1000 * 2^2
    expect(getRetryDelay(3, baseDelay)).toBe(8000); // 1000 * 2^3 (capped at maxDelay)
  });

  it('should respect max delay cap', () => {
    const baseDelay = 1000;
    const maxDelay = 8000;

    expect(getRetryDelay(4, baseDelay, maxDelay)).toBe(8000); // Would be 16000, capped at 8000
    expect(getRetryDelay(5, baseDelay, maxDelay)).toBe(8000); // Would be 32000, capped at 8000
    expect(getRetryDelay(10, baseDelay, maxDelay)).toBe(8000); // Would be 1024000, capped at 8000
  });

  it('should use default values when not provided', () => {
    expect(getRetryDelay(0)).toBe(1000); // Default baseDelay: 1000
    expect(getRetryDelay(1)).toBe(2000);
    expect(getRetryDelay(2)).toBe(4000);
    expect(getRetryDelay(3)).toBe(8000);
    expect(getRetryDelay(4)).toBe(8000); // Capped at default maxDelay: 8000
  });

  it('should handle custom base delay', () => {
    const baseDelay = 500;

    expect(getRetryDelay(0, baseDelay)).toBe(500);
    expect(getRetryDelay(1, baseDelay)).toBe(1000);
    expect(getRetryDelay(2, baseDelay)).toBe(2000);
    expect(getRetryDelay(3, baseDelay)).toBe(4000);
  });

  it('should handle custom max delay', () => {
    const baseDelay = 1000;
    const maxDelay = 5000;

    expect(getRetryDelay(0, baseDelay, maxDelay)).toBe(1000);
    expect(getRetryDelay(1, baseDelay, maxDelay)).toBe(2000);
    expect(getRetryDelay(2, baseDelay, maxDelay)).toBe(4000);
    expect(getRetryDelay(3, baseDelay, maxDelay)).toBe(5000); // Capped at 5000
    expect(getRetryDelay(4, baseDelay, maxDelay)).toBe(5000); // Still capped
  });

  it('should handle attempt number 0', () => {
    expect(getRetryDelay(0)).toBe(1000);
  });

  it('should handle large attempt numbers', () => {
    const maxDelay = 8000;
    expect(getRetryDelay(100, 1000, maxDelay)).toBe(maxDelay);
  });
});
