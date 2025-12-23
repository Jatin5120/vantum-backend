/**
 * Handler Utilities Class
 * Encapsulated utilities for WebSocket message handlers
 * Following thine's pattern of encapsulation over distribution
 */

import type { Session } from '../types';
import { ErrorCode } from '@Jatin5120/vantum-shared';
import { sessionService } from '../services';
import { MessagePackHelper, WebSocketUtils } from '../utils';
import { WebSocket } from 'ws';
import { sendError } from './error.handler';
import { generateId, logger } from '@/shared/utils';

/**
 * Handler Utilities Class
 * Encapsulates common handler operations
 */
export class HandlerUtils {
  /**
   * Fetch a session for a connection, otherwise send a standardized error and return undefined.
   * @param handlerContext - Context string for logging (e.g., 'handleAudioStart')
   */
  getSessionOrError(
    ws: WebSocket,
    connectionId: string,
    message = 'Session not found',
    handlerContext?: string,
    requestType: string = 'error.unknown'
  ): Session | undefined {
    const session = sessionService.getSessionBySocketId(connectionId);
    if (!session) {
      logger.warn('Session lookup failed', {
        connectionId,
        handlerContext,
        message,
      });
      sendError(ws, ErrorCode.SESSION_ERROR, message, requestType);
      return undefined;
    }
    return session;
  }

  /**
   * Send an ack message (thin wrapper over MessagePackHelper + WebSocketUtils).
   * ACK must use the same event_id as the request.
   * @param requestType - The request event type
   * @param requestEventId - The request event_id (required - ACK echoes it back)
   * @param sessionId - Session ID from request
   * @param label - Label for logging
   */
  sendAck(
    ws: WebSocket,
    requestType: string,
    requestEventId: string,
    sessionId: string | undefined,
    label: string
  ): boolean {
    const ack = MessagePackHelper.packAck(
      requestType,
      requestEventId, // Must use same event_id as request
      true,
      sessionId
    );
    return WebSocketUtils.safeSend(ws, ack, label);
  }

  /**
   * Convert unknown "audio" payload into a Uint8Array.
   * MessagePack may decode binary as Buffer/Uint8Array/ArrayBuffer depending on environment.
   * Following thine's pattern: they use `new Uint8Array(data.payload.audio)` directly.
   */
  decodeBinaryToUint8Array(data: unknown): Uint8Array | undefined {
    if (!data) return undefined;

    if (data instanceof Uint8Array) {
      return data;
    }

    // Node.js Buffer (avoid referencing `Buffer` symbol when node types aren't installed)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maybeBuffer = (globalThis as any).Buffer;
    if (maybeBuffer?.isBuffer?.(data)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new Uint8Array(data as any);
    }

    // ArrayBuffer
    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }

    // TypedArray / DataView
    if (ArrayBuffer.isView(data)) {
      const view = data as ArrayBufferView;
      return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    }

    return undefined;
  }
}

// Export singleton instance (encapsulated, not distributed)
export const handlerUtils = new HandlerUtils();


