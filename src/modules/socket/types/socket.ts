/**
 * WebSocket-related type definitions
 */

import { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';

/**
 * Extended WebSocket with connection metadata
 * These properties are always set during connection initialization
 */
export interface ExtendedWebSocket extends WebSocket {
  connectionId: string;
  sessionId: string;
  sttSessionCreated?: boolean; // Track if STT session was successfully created
  ttsSessionCreated?: boolean; // Track if TTS session was successfully created
}

/**
 * WebSocket upgrade request
 * Extends IncomingMessage with required properties for WebSocket upgrade
 */
export interface WebSocketUpgradeRequest extends IncomingMessage {
  socket: IncomingMessage['socket'] & {
    remoteAddress?: string;
  };
}
