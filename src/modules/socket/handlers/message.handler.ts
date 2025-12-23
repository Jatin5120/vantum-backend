/**
 * WebSocket Message Handler
 * Handles incoming MessagePack messages (following thine's pattern)
 */

import { WebSocket } from 'ws';
import { unpack } from 'msgpackr';
import { logger } from '@/shared/utils';
import {
  VOICECHAT_EVENTS,
  ErrorCode,
  UnpackedMessage,
} from '@Jatin5120/vantum-shared';
import { handleAudioStart, handleAudioChunk, handleAudioEnd } from './audio.handler';
import { sendError } from './error.handler';

/**
 * Validate that unpacked message has correct structure
 */
function isValidUnpackedMessage(data: unknown): data is UnpackedMessage {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  
  const msg = data as Record<string, unknown>;
  
  // eventType should be a string
  if (msg.eventType !== undefined && typeof msg.eventType !== 'string') {
    return false;
  }
  
  // eventId should be a string if present (recommended for correlation)
  if (msg.eventId !== undefined && typeof msg.eventId !== 'string') {
    return false;
  }
  
  // sessionId should be a string if present
  if (msg.sessionId !== undefined && typeof msg.sessionId !== 'string') {
    return false;
  }
  
  // payload can be anything (will be validated by specific handlers)
  return true;
}

export async function handleWebSocketMessage(
  ws: WebSocket,
  message: Buffer | string,
  connectionId: string
): Promise<void> {
  // Guard: Check readyState before processing (following thine's pattern)
  if (ws.readyState !== WebSocket.OPEN) {
    logger.warn('WebSocket not open, skipping message', {
      connectionId,
      readyState: ws.readyState,
    });
    return;
  }

  // Following thine's pattern: let data = undefined, then assign from unpack
  // MessagePack unpack() returns `any`, so we type it as unknown and validate
  let data: UnpackedMessage | undefined;

  try {
    // Skip string messages (not MessagePack)
    if (typeof message === 'string') {
      logger.warn('Received string message (expected binary MessagePack)', {
        connectionId,
      });
      return;
    }

    // Unpack MessagePack data (following thine's pattern)
    // unpack() returns `any` - we validate structure at runtime
    const unpacked = unpack(new Uint8Array(message)) as unknown;
    
    // Validate message structure
    if (!isValidUnpackedMessage(unpacked)) {
      logger.warn('Invalid message structure', {
        connectionId,
        message: unpacked,
      });
      // Use generic error type for malformed messages (no eventType available)
      // Try to extract sessionId from unpacked data if available
      const sessionId = (unpacked as Record<string, unknown>)?.sessionId as string | undefined;
      sendError(ws, ErrorCode.INVALID_PAYLOAD, 'Invalid message structure', 'error.unknown', sessionId);
      return;
    }
    
    data = unpacked;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to unpack MessagePack data', {
      connectionId,
      error: errorMsg,
    });

    // Client sent invalid / non-decodable messagepack (no event_type available)
    sendError(ws, ErrorCode.INVALID_PAYLOAD, 'Invalid message format', 'error.unknown', undefined);
    return;
  }

  try {
    // Route to appropriate handler based on eventType
    switch (data.eventType) {
      case VOICECHAT_EVENTS.AUDIO_START: {
        await handleAudioStart(ws, data, connectionId);
        break;
      }

      case VOICECHAT_EVENTS.AUDIO_CHUNK: {
        await handleAudioChunk(ws, data, connectionId);
        break;
      }

      case VOICECHAT_EVENTS.AUDIO_END: {
        await handleAudioEnd(ws, data, connectionId);
        break;
      }

      default: {
        logger.warn('Unknown event type', {
          connectionId,
          eventType: data.eventType,
        });
        // Use the actual eventType if available, otherwise generic error
        const requestType = data.eventType || 'error.unknown';
        const sessionId = data.sessionId;
        sendError(
          ws,
          ErrorCode.INVALID_PAYLOAD,
          `Unknown event type: ${String(data.eventType)}`,
          requestType,
          sessionId,
          data.eventId
        );
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error handling WebSocket message', {
      connectionId,
      error: errorMsg,
      eventType: data?.eventType,
    });

    // Use the actual eventType if available, otherwise generic error
    const requestType = data?.eventType || 'error.unknown';
    const sessionId = data?.sessionId;
    sendError(
      ws,
      ErrorCode.INTERNAL_ERROR,
      'Internal error',
      requestType,
      sessionId,
      data?.eventId
    );
  }
}

