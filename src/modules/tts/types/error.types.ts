/**
 * TTS Error Types
 */

export enum TTSErrorType {
  CONNECTION = 'connection',
  SYNTHESIS = 'synthesis',
  TIMEOUT = 'timeout',
  RATE_LIMIT = 'rate_limit',
  AUTH = 'auth',
  FATAL = 'fatal',
  TRANSIENT = 'transient',
}

export interface ClassifiedError {
  type: TTSErrorType;
  message: string;
  statusCode?: number;
  retryable: boolean;
  retryAfter?: number; // Seconds (for rate limiting)
}

export interface CartesiaError {
  code?: number;
  type?: string;
  message: string;
  statusCode?: number;
}
