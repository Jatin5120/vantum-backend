/**
 * Deepgram Type Definitions and Runtime Type Guards
 *
 * This file provides TypeScript type definitions and runtime validation
 * for Deepgram WebSocket API responses.
 */

/**
 * Deepgram transcript response structure
 */
export interface DeepgramTranscriptResponse {
  channel?: {
    alternatives?: Array<{
      transcript: string;
      confidence?: number;
    }>;
  };
  is_final?: boolean;
}

/**
 * Deepgram metadata response structure
 */
export interface DeepgramMetadataResponse {
  metadata?: {
    request_id?: string;
    model_info?: unknown;
    duration?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Runtime type guard for Deepgram transcript responses
 * Validates that the response has the expected structure before processing
 *
 * @param data - Potentially untrusted data from Deepgram WebSocket
 * @returns True if data matches DeepgramTranscriptResponse structure
 *
 * @example
 * ```typescript
 * client.on('Results', (data: any) => {
 *   if (!isValidTranscriptResponse(data)) {
 *     logger.warn('Invalid Deepgram transcript response', { data });
 *     return;
 *   }
 *   // Now safe to process transcript
 *   const transcript = data.channel.alternatives[0].transcript;
 * });
 * ```
 */
export function isValidTranscriptResponse(data: unknown): data is DeepgramTranscriptResponse {
  // Check if data is an object
  if (!data || typeof data !== 'object') {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Check if channel exists and is an object
  if (!obj.channel || typeof obj.channel !== 'object') {
    return false;
  }

  const channel = obj.channel as Record<string, unknown>;

  // Check if alternatives exists and is an array
  if (!Array.isArray(channel.alternatives)) {
    return false;
  }

  // Check if alternatives array has at least one element
  if (channel.alternatives.length === 0) {
    return false;
  }

  // Check if first alternative has transcript property
  const firstAlternative = channel.alternatives[0];
  if (!firstAlternative || typeof firstAlternative !== 'object') {
    return false;
  }

  const alternative = firstAlternative as Record<string, unknown>;

  // Validate transcript is a string
  if (typeof alternative.transcript !== 'string') {
    return false;
  }

  // All checks passed
  return true;
}

/**
 * Runtime type guard for Deepgram metadata responses
 * Validates that the response has the expected metadata structure
 *
 * @param data - Potentially untrusted data from Deepgram WebSocket
 * @returns True if data matches DeepgramMetadataResponse structure
 *
 * @example
 * ```typescript
 * client.on('Metadata', (data: any) => {
 *   if (!isValidMetadataResponse(data)) {
 *     logger.warn('Invalid Deepgram metadata response', { data });
 *     return;
 *   }
 *   // Now safe to process metadata
 *   const requestId = data.metadata?.request_id;
 * });
 * ```
 */
export function isValidMetadataResponse(data: unknown): data is DeepgramMetadataResponse {
  // Check if data is an object
  if (!data || typeof data !== 'object') {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Check if metadata exists and is an object
  if (!obj.metadata || typeof obj.metadata !== 'object') {
    return false;
  }

  // Metadata object exists with correct type
  return true;
}
