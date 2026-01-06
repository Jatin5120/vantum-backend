/**
 * Cartesia Error Classifier
 * Classifies errors from Cartesia API for proper handling
 */

import { TTSErrorType, ClassifiedError, CartesiaError } from '../types';

/**
 * Classify Cartesia error for proper handling
 */
export function classifyCartesiaError(error: Error | CartesiaError | unknown): ClassifiedError {
  // Default classification
  const defaultError: ClassifiedError = {
    type: TTSErrorType.TRANSIENT,
    message: 'Unknown error',
    retryable: true,
  };

  // Handle null/undefined
  if (!error) {
    return defaultError;
  }

  // Extract error properties
  const err = error as CartesiaError;
  const message = err.message || 'Unknown error';
  const statusCode = err.statusCode || err.code;

  // Classify by status code
  if (statusCode) {
    // Authentication errors (401, 403)
    if (statusCode === 401 || statusCode === 403) {
      return {
        type: TTSErrorType.AUTH,
        message: 'Authentication failed',
        statusCode,
        retryable: false,
      };
    }

    // Rate limiting (429)
    if (statusCode === 429) {
      return {
        type: TTSErrorType.RATE_LIMIT,
        message: 'Rate limit exceeded',
        statusCode,
        retryable: true,
        retryAfter: 5, // Default 5 seconds
      };
    }

    // Client errors (400-499)
    if (statusCode >= 400 && statusCode < 500) {
      return {
        type: TTSErrorType.FATAL,
        message: `Client error: ${message}`,
        statusCode,
        retryable: false,
      };
    }

    // Server errors (500-599)
    if (statusCode >= 500 && statusCode < 600) {
      return {
        type: TTSErrorType.TRANSIENT,
        message: `Server error: ${message}`,
        statusCode,
        retryable: true,
      };
    }
  }

  // Classify by error message
  const lowerMessage = message.toLowerCase();

  // Timeout errors
  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return {
      type: TTSErrorType.TIMEOUT,
      message: 'Request timeout',
      retryable: true,
    };
  }

  // Connection errors
  if (
    lowerMessage.includes('connection') ||
    lowerMessage.includes('connect') ||
    lowerMessage.includes('network') ||
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('enotfound')
  ) {
    return {
      type: TTSErrorType.CONNECTION,
      message: 'Connection error',
      retryable: true,
    };
  }

  // Synthesis errors
  if (
    lowerMessage.includes('synthesis') ||
    lowerMessage.includes('voice') ||
    lowerMessage.includes('audio')
  ) {
    return {
      type: TTSErrorType.SYNTHESIS,
      message: `Synthesis error: ${message}`,
      retryable: true,
    };
  }

  // Default: transient error (retryable)
  return {
    type: TTSErrorType.TRANSIENT,
    message,
    retryable: true,
  };
}

/**
 * Check if error is fatal (should not retry)
 */
export function isFatalError(error: ClassifiedError): boolean {
  return error.type === TTSErrorType.FATAL || error.type === TTSErrorType.AUTH;
}

/**
 * Get retry delay for error (exponential backoff)
 */
export function getRetryDelay(
  attemptNumber: number,
  baseDelay = 1000,
  maxDelay = 8000
): number {
  const delay = Math.min(baseDelay * Math.pow(2, attemptNumber), maxDelay);
  return delay;
}
