/**
 * Centralized Error Handling for WebSocket Events
 * Updated for native WebSocket (following thine's pattern)
 */

import { WebSocket } from 'ws';
import { ErrorCode } from '@Jatin5120/vantum-shared';
import { ExtendedWebSocket } from '../types';
import { logger } from '@/shared/utils';
import { MessagePackHelper, WebSocketUtils } from '../utils';

/**
 * Send error event to client
 * @param ws - WebSocket connection
 * @param code - Error code
 * @param message - Error message
 * @param requestType - The original request event type (e.g., "voicechat.audio.start")
 * @param sessionId - Optional session ID
 * @param requestEventId - Optional request event_id for correlation
 */
export function sendError(
  ws: WebSocket,
  code: ErrorCode,
  message: string,
  requestType: string,
  sessionId?: string,
  requestEventId?: string
): void {
  const errorMessage = MessagePackHelper.packError(
    requestType,
    message,
    code,
    sessionId,
    requestEventId
  );
  WebSocketUtils.safeSend(ws, errorMessage, 'error');

  // Log the error
  logger.error('Error sent to client', {
    connectionId: (ws as ExtendedWebSocket).connectionId,
    sessionId,
    code,
    message,
    requestType,
  });
}

/**
 * Handle connection errors
 */
export function handleConnectionError(
  ws: WebSocket,
  error: Error,
  requestType: string = 'error.connection',
  sessionId?: string
): void {
  logger.error('Connection error', {
    connectionId: (ws as ExtendedWebSocket).connectionId,
    sessionId,
    error: error.message,
    stack: error.stack,
  });

  sendError(
    ws,
    ErrorCode.CONNECTION_ERROR,
    'Connection error occurred',
    requestType,
    sessionId
  );
}

/**
 * Handle invalid payload errors
 * @param ws - WebSocket connection
 * @param eventType - The request event type
 * @param reason - Error reason
 * @param requestMessage - The original request message (to extract sessionId and eventId)
 */
export function handleInvalidPayload(
  ws: WebSocket,
  eventType: string,
  reason: string,
  requestMessage?: { sessionId?: string; eventId?: string }
): void {
  const sessionId = requestMessage?.sessionId;
  const requestEventId = requestMessage?.eventId;

  logger.warn('Invalid payload received', {
    connectionId: (ws as ExtendedWebSocket).connectionId,
    sessionId,
    eventType,
    reason,
  });

  sendError(
    ws,
    ErrorCode.INVALID_PAYLOAD,
    `Invalid payload for ${eventType}: ${reason}`,
    eventType,
    sessionId,
    requestEventId
  );
}

/**
 * Handle session errors
 * @param ws - WebSocket connection
 * @param message - Error message
 * @param requestType - The request event type
 * @param requestMessage - The original request message (to extract sessionId and eventId)
 */
export function handleSessionError(
  ws: WebSocket,
  message: string,
  requestType: string,
  requestMessage?: { sessionId?: string; eventId?: string }
): void {
  const sessionId = requestMessage?.sessionId;
  const requestEventId = requestMessage?.eventId;

  logger.error('Session error', {
    connectionId: (ws as ExtendedWebSocket).connectionId,
    sessionId,
    message,
    requestType,
  });

  sendError(ws, ErrorCode.SESSION_ERROR, message, requestType, sessionId, requestEventId);
}

/**
 * Handle audio processing errors
 */
export function handleAudioError(
  ws: WebSocket,
  error: Error,
  requestType: string,
  sessionId?: string
): void {
  logger.error('Audio processing error', {
    connectionId: (ws as ExtendedWebSocket).connectionId,
    sessionId,
    error: error.message,
    requestType,
  });

  sendError(
    ws,
    ErrorCode.AUDIO_ERROR,
    'Audio processing error occurred',
    requestType,
    sessionId
  );
}

/**
 * Handle STT service errors
 */
export function handleSTTError(
  ws: WebSocket,
  error: Error,
  requestType: string,
  sessionId?: string
): void {
  logger.error('STT service error', {
    connectionId: (ws as ExtendedWebSocket).connectionId,
    sessionId,
    error: error.message,
    requestType,
  });

  sendError(
    ws,
    ErrorCode.STT_ERROR,
    'Speech-to-text service error',
    requestType,
    sessionId
  );
}

/**
 * Handle LLM service errors
 */
export function handleLLMError(
  ws: WebSocket,
  error: Error,
  requestType: string,
  sessionId?: string
): void {
  logger.error('LLM service error', {
    connectionId: (ws as ExtendedWebSocket).connectionId,
    sessionId,
    error: error.message,
    requestType,
  });

  sendError(
    ws,
    ErrorCode.LLM_ERROR,
    'Language model service error',
    requestType,
    sessionId
  );
}

/**
 * Handle TTS service errors
 */
export function handleTTSError(
  ws: WebSocket,
  error: Error,
  requestType: string,
  sessionId?: string
): void {
  logger.error('TTS service error', {
    connectionId: (ws as ExtendedWebSocket).connectionId,
    sessionId,
    error: error.message,
    requestType,
  });

  sendError(
    ws,
    ErrorCode.TTS_ERROR,
    'Text-to-speech service error',
    requestType,
    sessionId
  );
}

/**
 * Handle internal errors
 */
export function handleInternalError(
  ws: WebSocket,
  error: Error,
  requestType: string,
  sessionId?: string
): void {
  logger.error('Internal error', {
    connectionId: (ws as ExtendedWebSocket).connectionId,
    sessionId,
    error: error.message,
    stack: error.stack,
    requestType,
  });

  sendError(
    ws,
    ErrorCode.INTERNAL_ERROR,
    'An internal error occurred',
    requestType,
    sessionId
  );
}

/**
 * Wrap handler function with error handling
 * Note: Not used in native WebSocket approach, but kept for compatibility
 */
export function withErrorHandling<T extends unknown[]>(
  handler: (...args: T) => void | Promise<void>
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await handler(...args);
    } catch (error) {
      logger.error('Unhandled error in handler', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  };
}

