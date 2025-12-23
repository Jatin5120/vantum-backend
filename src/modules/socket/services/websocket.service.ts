/**
 * WebSocket Service
 * Tracks active WebSocket connections per session
 */

import { WebSocket } from 'ws';
import { logger } from '@/shared/utils';
import { WebSocketUtils } from '../utils';

/**
 * WebSocket Service Class
 * Manages active WebSocket connections for sending responses
 */
export class WebSocketService {
  private activeWebSockets: Map<string, WebSocket> = new Map();

  /**
   * Register active WebSocket for a session
   */
  registerWebSocket(sessionId: string, ws: WebSocket): void {
    // Close any existing WebSocket for this session
    const existing = this.activeWebSockets.get(sessionId);
    if (existing) {
      // If it's the same socket (e.g. duplicate AUDIO_START), do not close it.
      if (existing === ws) {
        logger.debug('WebSocket already registered for session', { sessionId });
        return;
      }
      logger.warn('Replacing existing WebSocket for session', { sessionId });
      WebSocketUtils.safeClose(existing, 'replaced by new connection');
    }

    this.activeWebSockets.set(sessionId, ws);
    logger.debug('WebSocket registered for session', { sessionId });
  }

  /**
   * Get active WebSocket for a session
   */
  getWebSocket(sessionId: string): WebSocket | undefined {
    return this.activeWebSockets.get(sessionId);
  }

  /**
   * Remove WebSocket for a session
   */
  removeWebSocket(sessionId: string): void {
    const ws = this.activeWebSockets.get(sessionId);
    if (ws) {
      this.activeWebSockets.delete(sessionId);
      logger.debug('WebSocket removed for session', { sessionId });
    }
  }

  /**
   * Check if session has active WebSocket
   */
  hasWebSocket(sessionId: string): boolean {
    const ws = this.activeWebSockets.get(sessionId);
    return ws !== undefined && WebSocketUtils.canSend(ws);
  }

  /**
   * Get all active WebSocket count
   */
  getActiveCount(): number {
    return this.activeWebSockets.size;
  }

  /**
   * Cleanup all WebSockets (for graceful shutdown)
   */
  cleanup(): void {
    logger.info('Cleaning up all active WebSockets', {
      count: this.activeWebSockets.size,
    });

    this.activeWebSockets.forEach((ws, sessionId) => {
      WebSocketUtils.safeClose(ws, `cleanup for ${sessionId}`);
    });

    this.activeWebSockets.clear();
  }

  /**
   * Send data to specific session
   * Checks WebSocket state immediately before sending to avoid race conditions
   */
  sendToSession(
    sessionId: string,
    data: Uint8Array,
    label: string
  ): boolean {
    const ws = this.getWebSocket(sessionId);
    if (!ws) {
      logger.warn('No active WebSocket for session', { sessionId });
      return false;
    }

    // Check state immediately before sending to avoid race conditions
    if (!WebSocketUtils.canSend(ws)) {
      logger.warn('WebSocket not ready for session', { sessionId });
      return false;
    }

    return WebSocketUtils.safeSend(ws, data, label);
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();

