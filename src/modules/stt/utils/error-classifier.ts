/**
 * Error Classification Utility
 * Classifies Deepgram errors as fatal vs retryable
 */

import { logger } from '@/shared/utils';

export enum ErrorType {
  FATAL = 'fatal',
  RETRYABLE = 'retryable',
  TIMEOUT = 'timeout',
}

export interface ClassifiedError {
  type: ErrorType;
  originalError: Error;
  statusCode?: number;
  message: string;
  retryable: boolean;
}

/**
 * Interface for HTTP errors with status code
 */
interface HTTPError extends Error {
  status?: number;
  code?: number;
}

/**
 * Extract HTTP status code from error message or object
 */
function extractStatusCode(error: Error | HTTPError): number | undefined {
  // Check if error has status property
  if ('status' in error && typeof error.status === 'number') {
    return error.status;
  }

  // Check if error has code property (might be HTTP code)
  if ('code' in error && typeof error.code === 'number') {
    return error.code;
  }

  // Try to extract from error message (e.g., "HTTP 401: Unauthorized")
  const statusMatch = error.message.match(/(?:HTTP\s)?(\d{3})(?:\s|:)/i);
  if (statusMatch) {
    return parseInt(statusMatch[1], 10);
  }

  return undefined;
}

/**
 * Check if error is a network/timeout error
 */
function isNetworkError(error: Error): boolean {
  const message = error.message.toLowerCase();
  const networkKeywords = [
    'network',
    'timeout',
    'econnrefused',
    'econnreset',
    'etimedout',
    'socket',
    'connect',
    'closed',
    'aborted',
  ];

  return networkKeywords.some((keyword) => message.includes(keyword));
}

/**
 * Check if error is a connection closed error
 */
function isConnectionClosedError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('connection closed') ||
    message.includes('socket closed') ||
    message.includes('websocket closed')
  );
}

/**
 * Classify Deepgram error for retry strategy
 */
export function classifyDeepgramError(error: Error): ClassifiedError {
  const statusCode = extractStatusCode(error);
  const message = error.message;

  logger.debug('Classifying Deepgram error', { message, statusCode });

  // Fatal errors (don't retry)
  if (statusCode) {
    switch (statusCode) {
      case 401: // Unauthorized - invalid API key
        return {
          type: ErrorType.FATAL,
          originalError: error,
          statusCode,
          message: 'Invalid API key',
          retryable: false,
        };

      case 403: // Forbidden - no access
        return {
          type: ErrorType.FATAL,
          originalError: error,
          statusCode,
          message: 'Access forbidden',
          retryable: false,
        };

      case 404: // Not Found - invalid endpoint
        return {
          type: ErrorType.FATAL,
          originalError: error,
          statusCode,
          message: 'Endpoint not found',
          retryable: false,
        };

      case 400: // Bad Request - invalid config
        return {
          type: ErrorType.FATAL,
          originalError: error,
          statusCode,
          message: 'Invalid request configuration',
          retryable: false,
        };

      // Retryable errors
      case 429: // Rate Limit
        return {
          type: ErrorType.RETRYABLE,
          originalError: error,
          statusCode,
          message: 'Rate limit exceeded',
          retryable: true,
        };

      case 500: // Internal Server Error
        return {
          type: ErrorType.RETRYABLE,
          originalError: error,
          statusCode,
          message: 'Server error',
          retryable: true,
        };

      case 502: // Bad Gateway
        return {
          type: ErrorType.RETRYABLE,
          originalError: error,
          statusCode,
          message: 'Bad gateway',
          retryable: true,
        };

      case 503: // Service Unavailable
        return {
          type: ErrorType.RETRYABLE,
          originalError: error,
          statusCode,
          message: 'Service unavailable',
          retryable: true,
        };

      case 504: // Gateway Timeout
        return {
          type: ErrorType.RETRYABLE,
          originalError: error,
          statusCode,
          message: 'Gateway timeout',
          retryable: true,
        };

      default:
        // Unknown HTTP error - retry if 5xx, fatal if 4xx
        if (statusCode >= 500) {
          return {
            type: ErrorType.RETRYABLE,
            originalError: error,
            statusCode,
            message: `Server error ${statusCode}`,
            retryable: true,
          };
        } else if (statusCode >= 400) {
          return {
            type: ErrorType.FATAL,
            originalError: error,
            statusCode,
            message: `Client error ${statusCode}`,
            retryable: false,
          };
        }
    }
  }

  // Check for network/timeout errors (retryable)
  if (isNetworkError(error)) {
    return {
      type: ErrorType.TIMEOUT,
      originalError: error,
      message: 'Network or timeout error',
      retryable: true,
    };
  }

  // Check for connection closed (could be retryable)
  if (isConnectionClosedError(error)) {
    return {
      type: ErrorType.RETRYABLE,
      originalError: error,
      message: 'Connection closed unexpectedly',
      retryable: true,
    };
  }

  // Unknown error - treat as retryable (fail-safe)
  logger.warn('Unknown error type, treating as retryable', { message });
  return {
    type: ErrorType.RETRYABLE,
    originalError: error,
    message: error.message || 'Unknown error',
    retryable: true,
  };
}

/**
 * Check if error should trigger immediate failure
 */
export function isFatalError(error: Error): boolean {
  const classified = classifyDeepgramError(error);
  return classified.type === ErrorType.FATAL;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: Error): boolean {
  const classified = classifyDeepgramError(error);
  return classified.retryable;
}
