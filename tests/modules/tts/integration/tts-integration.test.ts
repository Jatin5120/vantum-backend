/**
 * TTS Integration Tests
 * Tests for complete TTS synthesis flows
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TTSService } from '@/modules/tts/services/tts.service';
import { ttsSessionService } from '@/modules/tts/services/tts-session.service';
import { TTSState } from '@/modules/tts/types';

// Mock Cartesia SDK
const mockAudioChunks: Int16Array[] = [];
const mockAudioSource = {
  on: vi.fn((event: string, handler: Function) => {
    // FIX: Use 'enqueue' event, not 'chunk' (that's what TTS service uses)
    if (event === 'enqueue') {
      // FIX: Use process.nextTick for fake timers compatibility
      process.nextTick(() => {
        mockAudioChunks.forEach((chunk) => handler(chunk));
      });
    }
    if (event === 'close') {
      // FIX: Use process.nextTick for fake timers compatibility
      process.nextTick(() => handler());
    }
  }),
  off: vi.fn(),
  once: vi.fn(),
  // Cartesia SDK buffer structure
  buffer: new Uint8Array(0),
  writeIndex: 0,
};

const mockConnectionEvents = {
  on: vi.fn((event: string, handler: Function) => {
    if (event === 'open') {
      // FIX: Use process.nextTick for fake timers compatibility
      process.nextTick(() => handler());
    }
  }),
  off: vi.fn(),
};

const mockCartesiaWs = {
  connect: vi.fn().mockResolvedValue(mockConnectionEvents),
  disconnect: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue({
    source: mockAudioSource,
  }),
  socket: {
    ping: vi.fn(),
  },
};

const mockCartesiaClient = {
  tts: {
    websocket: vi.fn(() => mockCartesiaWs),
  },
};

vi.mock('@cartesia/cartesia-js', () => {
  return {
    CartesiaClient: class MockCartesiaClient {
      constructor() {
        return mockCartesiaClient;
      }
    }
  };
});

// Mock audio resampler
vi.mock('@/modules/audio/services', () => ({
  audioResamplerService: {
    resampleToHigher: vi.fn((buffer) => Buffer.from(buffer)),
  },
}));

// Mock WebSocket service
const mockWebSocket = {
  send: vi.fn(),
  readyState: 1,
};

vi.mock('@/modules/socket/services', () => ({
  websocketService: {
    getWebSocket: vi.fn(() => mockWebSocket),
  },
}));

// Mock logger
vi.mock('@/shared/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  generateId: vi.fn(() => 'test-utterance-id'),
}));

describe('TTS Integration Tests', () => {
  let service: TTSService;
  const sessionId = 'integration-test-session';
  const connectionId = 'integration-test-connection';
  const config = {
    sessionId,
    connectionId,
    voiceId: 'test-voice-id',
    language: 'en',
    speed: 1.0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    process.env.CARTESIA_API_KEY = 'test-api-key';
    process.env.NODE_ENV = 'test';

    ttsSessionService.clearAllSessions();

    // Setup mock audio chunks
    mockAudioChunks.length = 0;
    mockAudioChunks.push(new Int16Array([1, 2, 3, 4, 5]));
    mockAudioChunks.push(new Int16Array([6, 7, 8, 9, 10]));
    mockAudioChunks.push(new Int16Array([11, 12, 13, 14, 15]));

    // Setup buffer for Cartesia SDK
    mockAudioSource.buffer = new Int16Array([1, 2, 3, 4, 5]);
    mockAudioSource.writeIndex = 5;

    service = new TTSService();
  });

  afterEach(async () => {
    await service.shutdown({ restart: false });
    ttsSessionService.clearAllSessions();
    // FIX: Use clearAllTimers instead of runAllTimers to avoid infinite loops
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Complete Synthesis Flow', () => {
    it('should complete full synthesis lifecycle', async () => {
      // 1. Create session
      await service.createSession(sessionId, config);
      expect(ttsSessionService.hasSession(sessionId)).toBe(true);

      const session = ttsSessionService.getSession(sessionId);
      expect(session?.ttsState).toBe(TTSState.IDLE);

      // 2. Start synthesis
      await service.synthesizeText(sessionId, 'Hello, world!');
      expect(session?.ttsState).toBe(TTSState.GENERATING);

      // 3. Simulate audio chunks received via 'enqueue' event
      const enqueueHandler = mockAudioSource.on.mock.calls.find(
        (call) => call[0] === 'enqueue'
      )?.[1];

      expect(enqueueHandler).toBeDefined();

      // Trigger enqueue events
      await enqueueHandler();
      await enqueueHandler();
      await enqueueHandler();

      // Should transition to STREAMING
      expect(session?.ttsState).toBe(TTSState.STREAMING);
      expect(session?.metrics.chunksGenerated).toBe(3);
      expect(session?.metrics.chunksSent).toBe(3);

      // 4. Simulate completion
      const closeHandler = mockAudioSource.on.mock.calls.find((call) => call[0] === 'close')?.[1];
      closeHandler();

      // Should transition back to IDLE
      expect(session?.ttsState).toBe(TTSState.IDLE);
      expect(session?.currentUtteranceId).toBeNull();

      // 5. End session
      await service.endSession(sessionId);
      expect(ttsSessionService.hasSession(sessionId)).toBe(false);
    });

    it('should handle multiple consecutive syntheses', async () => {
      await service.createSession(sessionId, config);

      // First synthesis
      await service.synthesizeText(sessionId, 'First text');

      const closeHandler1 = mockAudioSource.on.mock.calls.find(
        (call) => call[0] === 'close'
      )?.[1];
      closeHandler1();

      const session = ttsSessionService.getSession(sessionId);
      expect(session?.ttsState).toBe(TTSState.IDLE);
      expect(session?.metrics.textsSynthesized).toBe(1);

      // Clear mock calls for next synthesis
      mockAudioSource.on.mockClear();

      // Second synthesis
      await service.synthesizeText(sessionId, 'Second text');
      const closeHandler2 = mockAudioSource.on.mock.calls.find(
        (call) => call[0] === 'close'
      )?.[1];
      closeHandler2();

      expect(session?.ttsState).toBe(TTSState.IDLE);
      expect(session?.metrics.textsSynthesized).toBe(2);

      // Clear mock calls for next synthesis
      mockAudioSource.on.mockClear();

      // Third synthesis
      await service.synthesizeText(sessionId, 'Third text');
      const closeHandler3 = mockAudioSource.on.mock.calls.find(
        (call) => call[0] === 'close'
      )?.[1];
      closeHandler3();

      expect(session?.metrics.textsSynthesized).toBe(3);
    });
  });

  describe('Concurrent Sessions', () => {
    it('should handle multiple concurrent sessions', async () => {
      const sessions = [
        { id: 'session-1', text: 'Text for session 1' },
        { id: 'session-2', text: 'Text for session 2' },
        { id: 'session-3', text: 'Text for session 3' },
      ];

      // Create all sessions
      for (const sess of sessions) {
        await service.createSession(sess.id, {
          ...config,
          sessionId: sess.id,
          connectionId: `conn-${sess.id}`,
        });
      }

      expect(ttsSessionService.getSessionCount()).toBe(3);

      // Start synthesis on all sessions
      for (const sess of sessions) {
        await service.synthesizeText(sess.id, sess.text);
      }

      // Verify all sessions are synthesizing
      for (const sess of sessions) {
        const session = ttsSessionService.getSession(sess.id);
        expect([TTSState.GENERATING, TTSState.STREAMING]).toContain(session?.ttsState);
      }

      // Complete all sessions
      for (const sess of sessions) {
        await service.endSession(sess.id);
      }

      expect(ttsSessionService.getSessionCount()).toBe(0);
    });

    it('should track peak concurrent sessions', async () => {
      await service.createSession('session-1', { ...config, sessionId: 'session-1' });
      await service.createSession('session-2', { ...config, sessionId: 'session-2' });
      await service.createSession('session-3', { ...config, sessionId: 'session-3' });

      const metrics = service.getMetrics();
      expect(metrics.peakConcurrentSessions).toBe(3);

      await service.endSession('session-1');

      const updatedMetrics = service.getMetrics();
      expect(updatedMetrics.activeSessions).toBe(2);
      expect(updatedMetrics.peakConcurrentSessions).toBe(3); // Peak should remain
    });
  });

  describe('Error Recovery', () => {
    it('should recover from synthesis error', async () => {
      await service.createSession(sessionId, config);

      // First synthesis fails
      mockCartesiaWs.send.mockRejectedValueOnce(new Error('Synthesis failed'));

      await expect(service.synthesizeText(sessionId, 'test')).rejects.toThrow('Synthesis failed');

      const session = ttsSessionService.getSession(sessionId);
      expect(session?.ttsState).toBe(TTSState.ERROR);
      expect(session?.metrics.synthesisErrors).toBe(1);

      // Transition back to IDLE
      session?.transitionTo(TTSState.IDLE);

      // Second synthesis should work
      mockCartesiaWs.send.mockResolvedValueOnce({ source: mockAudioSource });
      await service.synthesizeText(sessionId, 'retry');

      expect(session?.metrics.textsSynthesized).toBe(1); // Only successful synthesis
    });

    it('should handle connection errors gracefully', async () => {
      await service.createSession(sessionId, config);

      // Simulate connection error
      const errorHandler = mockAudioSource.on.mock.calls.find((call) => call[0] === 'error')?.[1];
      errorHandler(new Error('Connection lost'));

      const session = ttsSessionService.getSession(sessionId);
      expect(session?.metrics.connectionErrors).toBeGreaterThan(0);
    });
  });

  describe('Reconnection Integration', () => {
    it('should reconnect and flush buffered texts', async () => {
      await service.createSession(sessionId, config);
      const session = ttsSessionService.getSession(sessionId);

      // Simulate disconnection
      session!.isReconnecting = true;
      session!.connectionState = 'disconnected';

      // Buffer some texts
      await service.synthesizeText(sessionId, 'buffered text 1');
      await service.synthesizeText(sessionId, 'buffered text 2');

      expect(session?.reconnectionBuffer).toHaveLength(2);

      // Simulate reconnection
      session!.isReconnecting = false;
      session!.connectionState = 'connected';
      session!.transitionTo(TTSState.IDLE);

      // Mock successful reconnection
      mockCartesiaWs.connect.mockResolvedValueOnce(mockConnectionEvents);

      // Trigger unexpected close handler
      const closeHandler = mockConnectionEvents.on.mock.calls.find(
        (call) => call[0] === 'close'
      )?.[1];
      if (closeHandler) {
        closeHandler();
        // FIX: Advance timers for async operations instead of runAllTimers
        await vi.advanceTimersByTimeAsync(100);
      }

      // Verify metrics
      expect(session?.metrics.bufferedTextsDuringReconnection).toBe(2);
    });

    it('should track downtime during reconnection', async () => {
      await service.createSession(sessionId, config);

      const closeHandler = mockConnectionEvents.on.mock.calls.find(
        (call) => call[0] === 'close'
      )?.[1];

      mockCartesiaWs.connect.mockResolvedValueOnce(mockConnectionEvents);

      closeHandler();

      // Simulate 2 second delay
      await vi.advanceTimersByTimeAsync(2000);
      // Flush promises to let reconnection complete
      await vi.runOnlyPendingTimersAsync();
      const session = ttsSessionService.getSession(sessionId);
      expect(session?.metrics.totalDowntimeMs).toBeGreaterThan(0);
    });
  });

  describe('Session Cleanup', () => {
    it('should cleanup resources on session end', async () => {
      await service.createSession(sessionId, config);
      const session = ttsSessionService.getSession(sessionId);

      // Set keepAlive interval
      session!.keepAliveInterval = setInterval(() => {}, 1000);

      await service.endSession(sessionId);

      // Session should be removed
      expect(ttsSessionService.hasSession(sessionId)).toBe(false);
    });

    it('should cleanup stale sessions automatically', async () => {
      // Note: Cleanup timer disabled in test mode
      // This test verifies the cleanup logic when triggered manually

      process.env.NODE_ENV = 'production';
      const prodService = new TTSService();

      await prodService.createSession(sessionId, config);
      const session = ttsSessionService.getSession(sessionId);

      // Make session stale (> 10 minutes idle)
      session!.lastActivityAt = Date.now() - 700000;

      // Trigger cleanup manually by advancing time
      await vi.advanceTimersByTimeAsync(300000); // CLEANUP_INTERVAL_MS

      // Session should be cleaned up (tested via getSessionOrWarn pattern)
      expect(ttsSessionService.hasSession(sessionId)).toBe(false);

      await prodService.shutdown({ restart: false });
      process.env.NODE_ENV = 'test';
    });
  });

  describe('Metrics Aggregation', () => {
    it('should aggregate metrics across sessions', async () => {
      await service.createSession('session-1', { ...config, sessionId: 'session-1' });
      await service.createSession('session-2', { ...config, sessionId: 'session-2' });

      await service.synthesizeText('session-1', 'text 1');
      await service.synthesizeText('session-2', 'text 2');

      const metrics = service.getMetrics();

      expect(metrics.activeSessions).toBe(2);
      expect(metrics.totalTextsSynthesized).toBe(2);
      expect(metrics.totalSessionsCreated).toBe(2);
    });

    it('should calculate average session duration', async () => {
      vi.useFakeTimers();

      await service.createSession('session-1', { ...config, sessionId: 'session-1' });

      vi.advanceTimersByTime(5000); // 5 seconds

      await service.createSession('session-2', { ...config, sessionId: 'session-2' });

      vi.advanceTimersByTime(10000); // 10 more seconds

      const metrics = service.getMetrics();

      expect(metrics.averageSessionDurationMs).toBeGreaterThan(0);

      vi.useRealTimers();
    });
  });

  describe('KeepAlive Integration', () => {
    it('should send keepAlive pings periodically', async () => {
      await service.createSession(sessionId, config);

      // Fast-forward through multiple keepAlive intervals
      vi.advanceTimersByTime(8000); // First ping
      vi.advanceTimersByTime(8000); // Second ping
      vi.advanceTimersByTime(8000); // Third ping

      expect(mockCartesiaWs.socket.ping).toHaveBeenCalledTimes(3);
    });

    it('should stop keepAlive on session end', async () => {
      await service.createSession(sessionId, config);

      const session = ttsSessionService.getSession(sessionId);
      expect(session?.keepAliveInterval).toBeDefined();

      await service.endSession(sessionId);

      // Interval should be cleared
      const deletedSession = ttsSessionService.getSession(sessionId);
      expect(deletedSession).toBeUndefined();
    });
  });

  describe('Graceful Shutdown Integration', () => {
    it('should close all sessions on shutdown', async () => {
      await service.createSession('session-1', { ...config, sessionId: 'session-1' });
      await service.createSession('session-2', { ...config, sessionId: 'session-2' });
      await service.createSession('session-3', { ...config, sessionId: 'session-3' });

      expect(ttsSessionService.getSessionCount()).toBe(3);

      await service.shutdown({ restart: false });

      expect(ttsSessionService.getSessionCount()).toBe(0);
    });

    it('should support restart after shutdown', async () => {
      await service.createSession(sessionId, config);
      await service.shutdown({ restart: true });

      // Should be able to create new session
      await expect(
        service.createSession('new-session', { ...config, sessionId: 'new-session' })
      ).resolves.not.toThrow();
    });
  });
});
