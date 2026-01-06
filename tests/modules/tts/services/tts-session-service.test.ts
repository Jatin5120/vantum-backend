/**
 * TTS Session Service Unit Tests
 * Tests for TTSSession class and TTSSessionService
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ttsSessionService, TTSSession } from '@/modules/tts/services/tts-session.service';
import { TTSState } from '@/modules/tts/types';
import { TTS_CONSTANTS } from '@/modules/tts/config';

// Mock logger
vi.mock('@/shared/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('TTSSession', () => {
  let session: TTSSession;
  const sessionId = 'test-session-id';
  const connectionId = 'test-connection-id';
  const config = {
    sessionId,
    connectionId,
    voiceId: 'test-voice-id',
    language: 'en',
    speed: 1.0,
  };

  beforeEach(() => {
    session = new TTSSession(sessionId, connectionId, config);
  });

  afterEach(() => {
    if (session.keepAliveInterval) {
      clearInterval(session.keepAliveInterval);
    }
  });

  describe('Initialization', () => {
    it('should initialize with correct properties', () => {
      expect(session.sessionId).toBe(sessionId);
      expect(session.connectionId).toBe(connectionId);
      expect(session.config).toEqual(config);
      expect(session.ttsState).toBe(TTSState.IDLE);
      expect(session.connectionState).toBe('disconnected');
      expect(session.isActive).toBe(true);
    });

    it('should initialize with empty buffers', () => {
      expect(session.textBuffer).toBe('');
      expect(session.reconnectionBuffer).toHaveLength(0);
      expect(session.currentUtteranceId).toBeNull();
    });

    it('should initialize metrics to zero', () => {
      expect(session.metrics.textsSynthesized).toBe(0);
      expect(session.metrics.chunksGenerated).toBe(0);
      expect(session.metrics.chunksSent).toBe(0);
      expect(session.metrics.errors).toBe(0);
      expect(session.metrics.synthesisErrors).toBe(0);
      expect(session.metrics.connectionErrors).toBe(0);
      expect(session.metrics.reconnections).toBe(0);
      expect(session.metrics.successfulReconnections).toBe(0);
      expect(session.metrics.failedReconnections).toBe(0);
      expect(session.metrics.totalDowntimeMs).toBe(0);
      expect(session.metrics.bufferedTextsDuringReconnection).toBe(0);
      expect(session.metrics.averageSynthesisTimeMs).toBe(0);
      expect(session.metrics.totalSynthesisTimeMs).toBe(0);
    });

    it('should set creation timestamp', () => {
      expect(session.createdAt).toBeGreaterThan(0);
      expect(session.lastActivityAt).toBeGreaterThan(0);
      expect(session.createdAt).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('Activity Tracking', () => {
    it('should update last activity timestamp', () => {
      const initialTimestamp = session.lastActivityAt;

      // Wait a bit
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);

      session.touch();

      expect(session.lastActivityAt).toBeGreaterThan(initialTimestamp);

      vi.useRealTimers();
    });

    it('should calculate session duration', () => {
      vi.useFakeTimers();

      const startTime = Date.now();
      const testSession = new TTSSession(sessionId, connectionId, config);

      // Advance time by 5 seconds
      vi.advanceTimersByTime(5000);

      const duration = testSession.getDuration();
      expect(duration).toBeGreaterThanOrEqual(5000);

      vi.useRealTimers();
    });
  });

  describe('State Management', () => {
    it('should allow valid state transitions', () => {
      expect(session.ttsState).toBe(TTSState.IDLE);

      session.transitionTo(TTSState.GENERATING);
      expect(session.ttsState).toBe(TTSState.GENERATING);

      session.transitionTo(TTSState.STREAMING);
      expect(session.ttsState).toBe(TTSState.STREAMING);

      session.transitionTo(TTSState.COMPLETED);
      expect(session.ttsState).toBe(TTSState.COMPLETED);

      session.transitionTo(TTSState.IDLE);
      expect(session.ttsState).toBe(TTSState.IDLE);
    });

    it('should reject invalid state transitions', () => {
      expect(session.ttsState).toBe(TTSState.IDLE);

      // Cannot go from IDLE to COMPLETED
      session.transitionTo(TTSState.COMPLETED);
      expect(session.ttsState).toBe(TTSState.IDLE); // Should stay IDLE
    });

    it('should allow error transition from any state', () => {
      session.transitionTo(TTSState.GENERATING);
      session.transitionTo(TTSState.ERROR);
      expect(session.ttsState).toBe(TTSState.ERROR);

      // Can transition back to IDLE from ERROR
      session.transitionTo(TTSState.IDLE);
      expect(session.ttsState).toBe(TTSState.IDLE);
    });

    it('should allow cancellation during generation/streaming', () => {
      session.transitionTo(TTSState.GENERATING);
      session.transitionTo(TTSState.CANCELLED);
      expect(session.ttsState).toBe(TTSState.CANCELLED);

      session.transitionTo(TTSState.IDLE);
      session.transitionTo(TTSState.GENERATING);
      session.transitionTo(TTSState.STREAMING);
      session.transitionTo(TTSState.CANCELLED);
      expect(session.ttsState).toBe(TTSState.CANCELLED);
    });
  });

  describe('Synthesis Control', () => {
    it('should allow synthesis in IDLE state when connected', () => {
      session.ttsState = TTSState.IDLE;
      session.connectionState = 'connected';

      expect(session.canSynthesize()).toBe(true);
    });

    it('should not allow synthesis when not in IDLE state', () => {
      session.ttsState = TTSState.GENERATING;
      session.connectionState = 'connected';

      expect(session.canSynthesize()).toBe(false);
    });

    it('should not allow synthesis when not connected', () => {
      session.ttsState = TTSState.IDLE;
      session.connectionState = 'disconnected';

      expect(session.canSynthesize()).toBe(false);
    });

    it('should allow cancellation during generation', () => {
      session.transitionTo(TTSState.GENERATING);
      expect(session.canCancel()).toBe(true);
    });

    it('should allow cancellation during streaming', () => {
      session.transitionTo(TTSState.GENERATING);
      session.transitionTo(TTSState.STREAMING);
      expect(session.canCancel()).toBe(true);
    });

    it('should not allow cancellation in IDLE state', () => {
      expect(session.canCancel()).toBe(false);
    });
  });

  describe('Reconnection Buffer', () => {
    it('should add text to reconnection buffer', () => {
      const text = 'Buffered text';
      session.addToReconnectionBuffer(text);

      expect(session.reconnectionBuffer).toContain(text);
      expect(session.metrics.bufferedTextsDuringReconnection).toBe(1);
    });

    it('should buffer multiple texts', () => {
      session.addToReconnectionBuffer('Text 1');
      session.addToReconnectionBuffer('Text 2');
      session.addToReconnectionBuffer('Text 3');

      expect(session.reconnectionBuffer).toHaveLength(3);
      expect(session.metrics.bufferedTextsDuringReconnection).toBe(3);
    });

    it('should calculate buffer size in bytes', () => {
      const text = 'Hello'; // 5 chars * 2 bytes = 10 bytes
      session.addToReconnectionBuffer(text);

      const bufferSize = session.getReconnectionBufferSize();
      expect(bufferSize).toBe(10);
    });

    it('should reject text when buffer is full', () => {
      // Create large text to fill buffer
      const largeText = 'a'.repeat(TTS_CONSTANTS.MAX_BUFFER_SIZE / 2 + 1);
      session.addToReconnectionBuffer(largeText);

      const initialLength = session.reconnectionBuffer.length;

      // Try to add more (should be rejected)
      session.addToReconnectionBuffer('More text');

      expect(session.reconnectionBuffer.length).toBe(initialLength);
    });

    it('should clear reconnection buffer', () => {
      session.addToReconnectionBuffer('Text 1');
      session.addToReconnectionBuffer('Text 2');

      expect(session.reconnectionBuffer).toHaveLength(2);

      session.clearReconnectionBuffer();

      expect(session.reconnectionBuffer).toHaveLength(0);
    });
  });

  describe('Cleanup', () => {
    it('should clear keepAlive interval', async () => {
      session.keepAliveInterval = setInterval(() => {}, 1000);
      const intervalId = session.keepAliveInterval;

      await session.cleanup();

      expect(session.keepAliveInterval).toBeUndefined();
    });

    it('should remove connection event listeners', async () => {
      const mockConnectionEvents = {
        off: vi.fn(),
      };
      session.connectionEvents = mockConnectionEvents;

      await session.cleanup();

      expect(mockConnectionEvents.off).toHaveBeenCalledWith('open');
      expect(mockConnectionEvents.off).toHaveBeenCalledWith('close');
      expect(session.connectionEvents).toBeNull();
    });

    it('should disconnect Cartesia client', async () => {
      const mockCartesiaClient = {
        disconnect: vi.fn(),
      };
      session.cartesiaClient = mockCartesiaClient;

      await session.cleanup();

      expect(mockCartesiaClient.disconnect).toHaveBeenCalled();
      expect(session.cartesiaClient).toBeNull();
    });

    it('should clear all buffers', async () => {
      session.textBuffer = 'some text';
      session.reconnectionBuffer = ['text 1', 'text 2'];

      await session.cleanup();

      expect(session.textBuffer).toBe('');
      expect(session.reconnectionBuffer).toHaveLength(0);
    });

    it('should mark session as inactive', async () => {
      expect(session.isActive).toBe(true);

      await session.cleanup();

      expect(session.isActive).toBe(false);
    });

    it('should handle cleanup errors gracefully', async () => {
      const mockCartesiaClient = {
        disconnect: vi.fn().mockImplementation(() => {
          throw new Error('Disconnect error');
        }),
      };
      session.cartesiaClient = mockCartesiaClient;

      await expect(session.cleanup()).resolves.not.toThrow();

      expect(session.isActive).toBe(false);
    });

    it('should handle missing connectionEvents gracefully', async () => {
      session.connectionEvents = null;

      await expect(session.cleanup()).resolves.not.toThrow();
    });

    it('should handle connectionEvents without off method', async () => {
      session.connectionEvents = {}; // No off method

      await expect(session.cleanup()).resolves.not.toThrow();
    });
  });
});

describe('TTSSessionService', () => {
  const sessionId = 'test-session-id';
  const connectionId = 'test-connection-id';
  const config = {
    sessionId,
    connectionId,
    voiceId: 'test-voice-id',
    language: 'en',
    speed: 1.0,
  };

  beforeEach(() => {
    ttsSessionService.clearAllSessions();
  });

  afterEach(() => {
    ttsSessionService.clearAllSessions();
  });

  describe('Session Creation', () => {
    it('should create new session', () => {
      const session = ttsSessionService.createSession(sessionId, connectionId, config);

      expect(session).toBeDefined();
      expect(session.sessionId).toBe(sessionId);
      expect(session.connectionId).toBe(connectionId);
      expect(ttsSessionService.hasSession(sessionId)).toBe(true);
    });

    it('should replace existing session', () => {
      const session1 = ttsSessionService.createSession(sessionId, connectionId, config);
      const session2 = ttsSessionService.createSession(sessionId, connectionId, config);

      expect(session2).toBeDefined();
      expect(session1).not.toBe(session2); // New instance
      expect(ttsSessionService.getSessionCount()).toBe(1); // Only one session
    });

    it('should cleanup old session when replacing', () => {
      const session1 = ttsSessionService.createSession(sessionId, connectionId, config);
      const cleanupSpy = vi.spyOn(session1, 'cleanup');

      ttsSessionService.createSession(sessionId, connectionId, config);

      expect(cleanupSpy).toHaveBeenCalled();
    });
  });

  describe('Session Retrieval', () => {
    it('should get session by ID', () => {
      const created = ttsSessionService.createSession(sessionId, connectionId, config);
      const retrieved = ttsSessionService.getSession(sessionId);

      expect(retrieved).toBe(created);
    });

    it('should return undefined for non-existent session', () => {
      const session = ttsSessionService.getSession('non-existent-id');
      expect(session).toBeUndefined();
    });

    it('should check session existence', async () => {
      expect(ttsSessionService.hasSession(sessionId)).toBe(false);

      ttsSessionService.createSession(sessionId, connectionId, config);
      expect(ttsSessionService.hasSession(sessionId)).toBe(true);

      await ttsSessionService.deleteSession(sessionId);
      expect(ttsSessionService.hasSession(sessionId)).toBe(false);
    });
  });

  describe('Session Deletion', () => {
    it('should delete session', async () => {
      ttsSessionService.createSession(sessionId, connectionId, config);
      expect(ttsSessionService.hasSession(sessionId)).toBe(true);

      await ttsSessionService.deleteSession(sessionId);

      expect(ttsSessionService.hasSession(sessionId)).toBe(false);
    });

    it('should cleanup session on deletion', async () => {
      const session = ttsSessionService.createSession(sessionId, connectionId, config);
      const cleanupSpy = vi.spyOn(session, 'cleanup');

      await ttsSessionService.deleteSession(sessionId);

      expect(cleanupSpy).toHaveBeenCalled();
    });

    it('should handle deletion of non-existent session', async () => {
      await expect(ttsSessionService.deleteSession('non-existent-id')).resolves.not.toThrow();
    });
  });

  describe('Session Listing', () => {
    it('should get all sessions', () => {
      ttsSessionService.createSession('session-1', 'conn-1', {
        ...config,
        sessionId: 'session-1',
      });
      ttsSessionService.createSession('session-2', 'conn-2', {
        ...config,
        sessionId: 'session-2',
      });
      ttsSessionService.createSession('session-3', 'conn-3', {
        ...config,
        sessionId: 'session-3',
      });

      const sessions = ttsSessionService.getAllSessions();

      expect(sessions).toHaveLength(3);
      expect(sessions.map((s) => s.sessionId)).toContain('session-1');
      expect(sessions.map((s) => s.sessionId)).toContain('session-2');
      expect(sessions.map((s) => s.sessionId)).toContain('session-3');
    });

    it('should return empty array when no sessions', () => {
      const sessions = ttsSessionService.getAllSessions();
      expect(sessions).toHaveLength(0);
    });

    it('should get session count', async () => {
      expect(ttsSessionService.getSessionCount()).toBe(0);

      ttsSessionService.createSession('session-1', 'conn-1', {
        ...config,
        sessionId: 'session-1',
      });
      expect(ttsSessionService.getSessionCount()).toBe(1);

      ttsSessionService.createSession('session-2', 'conn-2', {
        ...config,
        sessionId: 'session-2',
      });
      expect(ttsSessionService.getSessionCount()).toBe(2);

      await ttsSessionService.deleteSession('session-1');
      expect(ttsSessionService.getSessionCount()).toBe(1);
    });
  });

  describe('Clear All Sessions', () => {
    it('should clear all sessions', () => {
      ttsSessionService.createSession('session-1', 'conn-1', {
        ...config,
        sessionId: 'session-1',
      });
      ttsSessionService.createSession('session-2', 'conn-2', {
        ...config,
        sessionId: 'session-2',
      });

      expect(ttsSessionService.getSessionCount()).toBe(2);

      ttsSessionService.clearAllSessions();

      expect(ttsSessionService.getSessionCount()).toBe(0);
    });

    it('should cleanup all sessions when clearing', () => {
      const session1 = ttsSessionService.createSession('session-1', 'conn-1', {
        ...config,
        sessionId: 'session-1',
      });
      const session2 = ttsSessionService.createSession('session-2', 'conn-2', {
        ...config,
        sessionId: 'session-2',
      });

      const cleanup1 = vi.spyOn(session1, 'cleanup');
      const cleanup2 = vi.spyOn(session2, 'cleanup');

      ttsSessionService.clearAllSessions();

      expect(cleanup1).toHaveBeenCalled();
      expect(cleanup2).toHaveBeenCalled();
    });
  });
});
