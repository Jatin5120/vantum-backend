/**
 * P1-4 FIX: OpenAI Error Classifier
 * Classifies OpenAI API errors for intelligent retry decisions
 */

import { logger } from '@/shared/utils';

export enum LLMErrorType {
  FATAL = 'FATAL',
  AUTH = 'AUTH',
  RATE_LIMIT = 'RATE_LIMIT',
  NETWORK = 'NETWORK',
  RETRYABLE = 'RETRYABLE',
  UNKNOWN = 'UNKNOWN',
}

export interface ClassifiedLLMError {
  type: LLMErrorType;
  message: string;
  isRetryable: boolean;
  originalError: Error;
}

/**
 * Classify LLM error for retry strategy
 * @param error - Error from OpenAI API
 * @returns Classified error with retry guidance
 */
export function classifyLLMError(error: Error): ClassifiedLLMError {
  const errorMessage = error.message.toLowerCase();
  const errorString = error.toString().toLowerCase();

  // Authentication errors
  if (
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('invalid api key') ||
    errorMessage.includes('authentication')
  ) {
    return {
      type: LLMErrorType.AUTH,
      message: 'Authentication failed with OpenAI',
      isRetryable: false,
      originalError: error,
    };
  }

  // Rate limit errors
  if (
    errorMessage.includes('rate limit') ||
    errorMessage.includes('too many requests') ||
    errorString.includes('429')
  ) {
    return {
      type: LLMErrorType.RATE_LIMIT,
      message: 'OpenAI rate limit exceeded',
      isRetryable: true,
      originalError: error,
    };
  }

  // Network errors
  if (
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('enotfound') ||
    errorMessage.includes('network') ||
    errorMessage.includes('timeout')
  ) {
    return {
      type: LLMErrorType.NETWORK,
      message: 'Network error connecting to OpenAI',
      isRetryable: true,
      originalError: error,
    };
  }

  // Fatal errors (context length, invalid request)
  if (
    errorMessage.includes('maximum context length') ||
    errorMessage.includes('invalid request') ||
    errorMessage.includes('model not found')
  ) {
    return {
      type: LLMErrorType.FATAL,
      message: 'Fatal OpenAI API error',
      isRetryable: false,
      originalError: error,
    };
  }

  // Default to retryable unknown
  return {
    type: LLMErrorType.UNKNOWN,
    message: 'Unknown OpenAI error',
    isRetryable: true,
    originalError: error,
  };
}

/**
 * Type guard for LLM errors
 * @param error - Unknown error object
 * @returns True if error is Error instance
 */
export function isLLMError(error: unknown): error is Error {
  return error instanceof Error;
}
