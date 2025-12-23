/**
 * MessagePack Helper
 * Static utility methods for packing WebSocket messages
 * Following thine's pattern - no sequence_number in wire format
 */

import { pack } from 'msgpackr';
import { VOICECHAT_EVENTS, toErrorEventType } from '@Jatin5120/vantum-shared';
import { generateId } from '@/shared/utils';

export class MessagePackHelper {
  /**
   * Pack audio chunk for streaming
   * Uses utteranceId for ordering (unique per chunk, time-ordered UUIDv7)
   * CRITICAL: All chunks for same response must use the SAME eventId (from original request)
   * @param audio - Audio data
   * @param sampleRate - Audio sample rate
   * @param utteranceId - Unique ID per chunk (time-ordered UUIDv7 for ordering)
   * @param eventId - SAME eventId for all chunks (from original request)
   * @param sessionId - Session ID (same as request)
   */
  static packChunk(
    audio: Uint8Array,
    sampleRate: number,
    utteranceId: string,
    eventId: string,
    sessionId?: string
  ): Uint8Array {
    return pack({
      eventType: VOICECHAT_EVENTS.RESPONSE_CHUNK,
      eventId: eventId,
      sessionId: sessionId,
      payload: {
        audio,
        utteranceId,
        sampleRate,
      },
    });
  }

  /**
   * Pack interrupt event
   */
  static packInterrupt(utteranceId: string, timestamp: number, sessionId?: string): Uint8Array {
    return pack({
      eventType: VOICECHAT_EVENTS.RESPONSE_INTERRUPT,
      eventId: generateId(),
      sessionId: sessionId,
      payload: {
        utteranceId,
        timestamp,
      },
    });
  }

  /**
   * Pack response start event
   */
  static packResponseStart(utteranceId: string, timestamp: number, sessionId?: string): Uint8Array {
    return pack({
      eventType: VOICECHAT_EVENTS.RESPONSE_START,
      eventId: generateId(),
      sessionId: sessionId,
      payload: {
        utteranceId,
        timestamp,
      },
    });
  }

  /**
   * Pack response complete event
   */
  static packComplete(utteranceId: string, sessionId?: string): Uint8Array {
    return pack({
      eventType: VOICECHAT_EVENTS.RESPONSE_COMPLETE,
      eventId: generateId(),
      sessionId: sessionId,
      payload: { utteranceId },
    });
  }

  /**
   * Pack response stop event (used to stop playback when user interrupts / cancels)
   */
  static packStop(utteranceId: string, timestamp: number, sessionId?: string): Uint8Array {
    return pack({
      eventType: VOICECHAT_EVENTS.RESPONSE_STOP,
      eventId: generateId(),
      sessionId: sessionId,
      payload: {
        utteranceId,
        timestamp,
      },
    });
  }

  /**
   * Pack acknowledgment response
   * Response format: same eventType, same eventId, same sessionId as request, payload with response data
   * @param requestType - The original request event type
   * @param requestEventId - The original request eventId (will be echoed back)
   * @param success - Whether the operation succeeded
   * @param sessionId - Session ID (same as request)
   */
  static packAck(
    requestType: string,
    requestEventId: string,
    success: boolean,
    sessionId?: string
  ): Uint8Array {
    return pack({
      eventType: requestType, // ACK uses same eventType as request
      eventId: requestEventId, // ACK uses same eventId as request
      sessionId: sessionId, // Same sessionId as request
      payload: {
        success: success,
      },
    });
  }

  /**
   * Pack error response
   * Error format: eventType converted using toErrorEventType, same eventId as request, same sessionId,
   * requestType at top level, payload contains only message
   * @param requestType - The original request event type (e.g., "voicechat.response.start", "chat.message.send")
   * @param message - Error message
   * @param code - Error code (for logging, not sent to client)
   * @param sessionId - Session ID (same as request)
   * @param requestEventId - Request eventId (same as request, echoed back)
   */
  static packError(
    requestType: string,
    message: string,
    code: string,
    sessionId?: string,
    requestEventId?: string
  ): Uint8Array {
    // Convert request type to error type, fallback to generic error if conversion fails
    let errorEventType: string;
    try {
      errorEventType = toErrorEventType(requestType);
    } catch (error) {
      // If requestType is invalid, use generic error type
      errorEventType = 'error.unknown';
    }
    
    return pack({
      eventType: errorEventType, // e.g., "voicechat.response.error", "chat.message.error"
      eventId: requestEventId || generateId(), // Same eventId as request
      sessionId: sessionId, // Same sessionId as request
      requestType: requestType, // Original eventType from request (at top level)
      payload: {
        message: message, // Only message in payload
      },
    });
  }
}

