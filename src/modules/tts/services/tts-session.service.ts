/**
 * TTS Session Service
 * Stateful singleton managing all TTS sessions
 */

import { logger } from '@/shared/utils';
import {
  TTSConfig,
  TTSSessionData,
  TTSState,
  TTSConnectionState,
  TTSSessionMetrics,
} from '../types';
import { TTS_CONSTANTS } from '../config';

/**
 * TTSSession class - represents a single TTS session
 */
export class TTSSession implements TTSSessionData {
  // Core identifiers
  readonly sessionId: string;
  readonly connectionId: string;

  // Connection state
  connectionState: TTSConnectionState = 'disconnected';
  cartesiaClient: unknown = null; // Cartesia WebSocket client (type unknown for flexibility)
  connectionEvents: unknown = null; // Connection event emitter from Cartesia SDK (for cleanup)
  isReconnecting = false;

  // Synthesis state
  ttsState: TTSState = TTSState.IDLE;
  currentUtteranceId: string | null = null;
  textBuffer = '';
  synthesisMutex = false; // P1-3: Initialize synthesis mutex

  // Configuration
  config: TTSConfig;

  // Reconnection buffering
  reconnectionBuffer: string[] = [];
  lastReconnectionTime: number | null = null;

  // KeepAlive management
  keepAliveInterval?: NodeJS.Timeout;

  // Lifecycle
  readonly createdAt: number;
  lastActivityAt: number;
  isActive = true;

  // Metrics
  metrics: TTSSessionMetrics = {
    textsSynthesized: 0,
    chunksGenerated: 0,
    chunksSent: 0,
    errors: 0,
    synthesisErrors: 0,
    connectionErrors: 0,
    reconnections: 0,
    successfulReconnections: 0,
    failedReconnections: 0,
    totalDowntimeMs: 0,
    bufferedTextsDuringReconnection: 0,
    averageSynthesisTimeMs: 0,
    totalSynthesisTimeMs: 0,
  };

  // Retry state
  retryCount = 0;
  lastRetryTime = 0;

  constructor(sessionId: string, connectionId: string, config: TTSConfig) {
    this.sessionId = sessionId;
    this.connectionId = connectionId;
    this.config = config;
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();
  }

  /**
   * Update last activity timestamp
   */
  touch(): void {
    this.lastActivityAt = Date.now();
  }

  /**
   * Get session duration in milliseconds
   */
  getDuration(): number {
    return Date.now() - this.createdAt;
  }

  /**
   * Check if session can synthesize
   */
  canSynthesize(): boolean {
    return this.ttsState === TTSState.IDLE && this.connectionState === 'connected';
  }

  /**
   * Check if synthesis can be cancelled
   */
  canCancel(): boolean {
    return [TTSState.GENERATING, TTSState.STREAMING].includes(this.ttsState);
  }

  /**
   * Transition to new TTS state
   */
  transitionTo(newState: TTSState): void {
    const validTransitions: Record<TTSState, TTSState[]> = {
      [TTSState.IDLE]: [TTSState.GENERATING],
      [TTSState.GENERATING]: [TTSState.STREAMING, TTSState.ERROR, TTSState.CANCELLED],
      [TTSState.STREAMING]: [TTSState.COMPLETED, TTSState.ERROR, TTSState.CANCELLED],
      [TTSState.COMPLETED]: [TTSState.IDLE],
      [TTSState.ERROR]: [TTSState.IDLE],
      [TTSState.CANCELLED]: [TTSState.IDLE],
    };

    const allowed = validTransitions[this.ttsState] || [];
    if (!allowed.includes(newState)) {
      logger.warn('Invalid TTS state transition', {
        sessionId: this.sessionId,
        from: this.ttsState,
        to: newState,
      });
      return;
    }

    logger.info('TTS state transition', {
      sessionId: this.sessionId,
      from: this.ttsState,
      to: newState,
    });

    this.ttsState = newState;
  }

  /**
   * Add text to reconnection buffer
   */
  addToReconnectionBuffer(text: string): void {
    if (this.getReconnectionBufferSize() < TTS_CONSTANTS.MAX_BUFFER_SIZE) {
      this.reconnectionBuffer.push(text);
      this.metrics.bufferedTextsDuringReconnection++;
      logger.debug('Text buffered during reconnection', {
        sessionId: this.sessionId,
        textLength: text.length,
        bufferSize: this.reconnectionBuffer.length,
      });
    } else {
      logger.warn('Reconnection buffer full, dropping text', {
        sessionId: this.sessionId,
        bufferSize: this.getReconnectionBufferSize(),
      });
    }
  }

  /**
   * Get reconnection buffer size in bytes
   */
  getReconnectionBufferSize(): number {
    return this.reconnectionBuffer.reduce((sum, text) => sum + text.length * 2, 0); // ~2 bytes per char
  }

  /**
   * Clear reconnection buffer
   */
  clearReconnectionBuffer(): void {
    this.reconnectionBuffer = [];
  }

  /**
   * Cleanup session resources
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up TTS session', { sessionId: this.sessionId });

    // Clear keepAlive interval
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = undefined;
    }

    // Remove connection event listeners (prevent memory leak)
    if (this.connectionEvents) {
      try {
        const events = this.connectionEvents as any;
        if (events && typeof events.off === 'function') {
          // Emittery pattern: remove all listeners
          events.off('open');
          events.off('close');
          logger.debug('Removed connection event listeners', { sessionId: this.sessionId });
        }
      } catch (error) {
        logger.error('Error removing connection event listeners', { sessionId: this.sessionId, error });
      }
      this.connectionEvents = null;
    }

    // Close Cartesia connection
    if (this.cartesiaClient) {
      try {
        const cartesiaWs = this.cartesiaClient as any;
        if (cartesiaWs && typeof cartesiaWs.disconnect === 'function') {
          cartesiaWs.disconnect();
          logger.debug('Closed Cartesia connection', { sessionId: this.sessionId });
        }
      } catch (error) {
        logger.error('Error closing Cartesia connection', { sessionId: this.sessionId, error });
      }
      this.cartesiaClient = null;
    }

    // Clear buffers
    this.clearReconnectionBuffer();
    this.textBuffer = '';

    // Mark as inactive
    this.isActive = false;

    logger.info('TTS session cleanup complete', {
      sessionId: this.sessionId,
      duration: this.getDuration(),
      metrics: this.metrics,
    });
  }
}

/**
 * TTSSessionService - singleton managing all TTS sessions
 */
class TTSSessionServiceClass {
  private sessions = new Map<string, TTSSession>();

  /**
   * Create new TTS session
   */
  createSession(sessionId: string, connectionId: string, config: TTSConfig): TTSSession {
    // Check if session already exists
    if (this.sessions.has(sessionId)) {
      logger.warn('TTS session already exists, replacing', { sessionId });
      const existingSession = this.sessions.get(sessionId);
      if (existingSession) {
        existingSession.cleanup();
      }
    }

    const session = new TTSSession(sessionId, connectionId, config);
    this.sessions.set(sessionId, session);

    logger.info('TTS session created', { sessionId, connectionId });

    return session;
  }

  /**
   * Get TTS session by ID
   */
  getSession(sessionId: string): TTSSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Check if session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Delete TTS session (async to ensure cleanup completes)
   */
  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.cleanup();
      this.sessions.delete(sessionId);
      logger.info('TTS session deleted', { sessionId });
    }
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): TTSSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Clear all sessions (for testing)
   */
  clearAllSessions(): void {
    const sessions = Array.from(this.sessions.values());
    for (const session of sessions) {
      session.cleanup();
    }
    this.sessions.clear();
    logger.info('All TTS sessions cleared');
  }
}

// Export singleton instance
export const ttsSessionService = new TTSSessionServiceClass();
