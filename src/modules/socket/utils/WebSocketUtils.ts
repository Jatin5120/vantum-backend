/**
 * WebSocket utility functions for safe operations
 * Following thine's pattern with static methods
 */

import { WebSocket } from 'ws';
import { logger } from '@/shared/utils';

export class WebSocketUtils {
  /**
   * Safely close a WebSocket connection with error handling
   */
  static safeClose(ws: WebSocket | undefined, label: string): void {
    if (!ws) return;

    try {
      ws.close();
    } catch (error) {
      logger.warn(`Error closing ${label} WebSocket`, { error });
    }
  }

  /**
   * Check if WebSocket is in a state where it can send messages
   */
  static canSend(ws: WebSocket | undefined): boolean {
    return ws !== undefined && ws.readyState === WebSocket.OPEN;
  }

  /**
   * Safely send data over WebSocket with error handling
   */
  static safeSend(
    ws: WebSocket | undefined,
    data: string | ArrayBuffer | Uint8Array | Buffer,
    label: string
  ): boolean {
    if (!this.canSend(ws)) {
      logger.warn(`Cannot send to ${label} WebSocket - not open`);
      return false;
    }

    if (!ws) {
      return false;
    }

    try {
      ws.send(data);
      return true;
    } catch (error) {
      logger.error(`Error sending to ${label} WebSocket`, { error });
      return false;
    }
  }
}

