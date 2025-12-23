/**
 * Session Service
 * Handles session lifecycle, state management, and cleanup
 */

import { generateId, logger } from '@/shared/utils';
import {
  Session,
  SessionState,
  SessionMetadata,
  SessionConfig,
  DEFAULT_SESSION_CONFIG,
} from '../types';

/**
 * Session Service Class
 * Manages all active sessions with memory-safe storage and cleanup
 */
export class SessionService {
  private sessions: Map<string, Session> = new Map();
  private sessionIdIndex: Map<string, string> = new Map(); // sessionId -> socketId for O(1) lookup
  private config: SessionConfig;
  private cleanupIntervalId?: NodeJS.Timeout;

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
    this.startCleanupInterval();
  }

  /**
   * Create a new session
   */
  createSession(socketId: string, metadata: Partial<SessionMetadata> = {}): Session {
    // Check if session already exists
    const existing = this.getSessionBySocketId(socketId);
    if (existing) {
      logger.warn('Session already exists for socket', { socketId });
      return existing;
    }

    const now = Date.now();
    const session: Session = {
      socketId,
      sessionId: generateId(),
      state: SessionState.IDLE,
      createdAt: now,
      lastActivity: now,
      metadata: {
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        samplingRate: metadata.samplingRate || 16000,
        voiceId: metadata.voiceId,
        language: metadata.language || 'en-US',
      },
    };

    this.sessions.set(socketId, session);
    this.sessionIdIndex.set(session.sessionId, socketId);
    logger.info('Session created', {
      socketId,
      sessionId: session.sessionId,
      state: session.state,
    });

    return session;
  }

  /**
   * Get session by socket ID
   */
  getSessionBySocketId(socketId: string): Session | undefined {
    return this.sessions.get(socketId);
  }

  /**
   * Get session by session ID (O(1) lookup using reverse index)
   */
  getSessionBySessionId(sessionId: string): Session | undefined {
    const socketId = this.sessionIdIndex.get(sessionId);
    if (!socketId) {
      return undefined;
    }
    return this.sessions.get(socketId);
  }

  /**
   * Update session (atomic operation to prevent race conditions)
   */
  updateSession(socketId: string, updates: Partial<Session>): Session | undefined {
    const session = this.sessions.get(socketId);
    if (!session) {
      logger.warn('Session not found for update', { socketId });
      return undefined;
    }

    // Atomic update: read, modify, write in one operation
    const updated: Session = {
      ...session,
      ...updates,
      lastActivity: Date.now(),
      // Ensure metadata is properly merged
      metadata: updates.metadata
        ? { ...session.metadata, ...updates.metadata }
        : session.metadata,
    };

    // Update both maps atomically
    this.sessions.set(socketId, updated);
    
    // Update reverse index if sessionId changed (shouldn't happen, but be safe)
    if (updates.sessionId && updates.sessionId !== session.sessionId) {
      this.sessionIdIndex.delete(session.sessionId);
      this.sessionIdIndex.set(updates.sessionId, socketId);
    }

    logger.debug('Session updated', {
      socketId,
      sessionId: session.sessionId,
      updates: Object.keys(updates),
    });

    return updated;
  }

  /**
   * Update session state
   */
  updateSessionState(socketId: string, state: SessionState): Session | undefined {
    return this.updateSession(socketId, { state });
  }

  /**
   * Update last activity timestamp
   */
  touchSession(socketId: string): void {
    const session = this.sessions.get(socketId);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  /**
   * Delete session
   */
  deleteSession(socketId: string): boolean {
    const session = this.sessions.get(socketId);
    if (session) {
      this.sessions.delete(socketId);
      this.sessionIdIndex.delete(session.sessionId);
      logger.info('Session deleted', {
        socketId,
        sessionId: session.sessionId,
        duration: Date.now() - session.createdAt,
      });
      return true;
    }
    return false;
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get sessions by state
   */
  getSessionsByState(state: SessionState): Session[] {
    return this.getAllSessions().filter((session) => session.state === state);
  }

  /**
   * Check if session is expired
   */
  private isSessionExpired(session: Session): boolean {
    const now = Date.now();
    const age = now - session.createdAt;
    const idleTime = now - session.lastActivity;

    // Check max duration
    if (age > this.config.maxSessionDuration) {
      return true;
    }

    // Check idle timeout
    if (idleTime > this.config.idleTimeout) {
      return true;
    }

    return false;
  }

  /**
   * Cleanup expired sessions
   */
  cleanupExpiredSessions(): number {
    const expiredSessions: string[] = [];

    for (const [socketId, session] of this.sessions.entries()) {
      if (this.isSessionExpired(session)) {
        expiredSessions.push(socketId);
      }
    }

    expiredSessions.forEach((socketId) => {
      this.deleteSession(socketId);
    });

    if (expiredSessions.length > 0) {
      logger.info('Cleaned up expired sessions', {
        count: expiredSessions.length,
      });
    }

    return expiredSessions.length;
  }

  /**
   * Start automatic cleanup interval
   */
  private startCleanupInterval(): void {
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.config.cleanupInterval);

    logger.debug('Session cleanup interval started', {
      interval: this.config.cleanupInterval,
    });
  }

  /**
   * Stop cleanup interval
   */
  stopCleanupInterval(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = undefined;
      logger.debug('Session cleanup interval stopped');
    }
  }

  /**
   * Cleanup all sessions (for graceful shutdown)
   */
  cleanup(): void {
    try {
      this.stopCleanupInterval();
      const count = this.sessions.size;
      this.sessions.clear();
      this.sessionIdIndex.clear();
      logger.info('All sessions cleared', { count });
    } catch (error) {
      logger.error('Error during session cleanup', { error });
      // Ensure cleanup even on error
      this.sessions.clear();
      this.sessionIdIndex.clear();
      if (this.cleanupIntervalId) {
        clearInterval(this.cleanupIntervalId);
        this.cleanupIntervalId = undefined;
      }
    }
  }

  /**
   * Get session statistics
   */
  getStats(): {
    total: number;
    idle: number;
    active: number;
    ended: number;
    avgDuration: number;
  } {
    const sessions = this.getAllSessions();
    const now = Date.now();

    const stats = {
      total: sessions.length,
      idle: 0,
      active: 0,
      ended: 0,
      avgDuration: 0,
    };

    if (sessions.length === 0) {
      return stats;
    }

    let totalDuration = 0;

    sessions.forEach((session) => {
      // Count by state
      switch (session.state) {
        case SessionState.IDLE:
          stats.idle++;
          break;
        case SessionState.ACTIVE:
          stats.active++;
          break;
        case SessionState.ENDED:
          stats.ended++;
          break;
      }

      // Calculate duration
      totalDuration += now - session.createdAt;
    });

    stats.avgDuration = Math.floor(totalDuration / sessions.length);

    return stats;
  }
}

// Export singleton instance
export const sessionService = new SessionService();

