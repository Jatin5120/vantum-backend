/**
 * WebSocket-related type definitions
 */

import { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { UnpackedMessage } from '@Jatin5120/vantum-shared';

/**
 * Extended WebSocket with connection metadata
 * These properties are always set during connection initialization
 */
export interface ExtendedWebSocket extends WebSocket {
  connectionId: string;
  sessionId: string;
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

// Re-export UnpackedMessage from shared package for convenience
export type { UnpackedMessage } from '@Jatin5120/vantum-shared';

