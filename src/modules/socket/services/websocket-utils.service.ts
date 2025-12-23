/**
 * WebSocket Utils Service
 * Provides safe WebSocket operations with error handling
 * Following thine's pattern
 */

import { WebSocket } from 'ws';
import { logger } from '@/shared/utils';

/**
 * WebSocket Utils Service Class
 * Encapsulates WebSocket utility operations
 */
export class WebSocketUtilsService {
  /**
   * Safely close a WebSocket connection with error handling
   */
  safeClose(ws: WebSocket | undefined, label: string): void {
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
  canSend(ws: WebSocket | undefined): boolean {
    return ws !== undefined && ws.readyState === WebSocket.OPEN;
  }

  /**
   * Safely send data over WebSocket with error handling
   */
  safeSend(
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

// Export singleton instance
export const websocketUtilsService = new WebSocketUtilsService();

