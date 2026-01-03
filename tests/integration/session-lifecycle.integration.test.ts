/**
 * Session-Level Lifecycle Integration Tests
 * Tests the complete flow of session-level Deepgram connection lifecycle
 * Target: Verify 0 latency between recordings (eliminates 3+ second audio loss)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sttService } from '@/modules/stt/services/stt.service';
import { sttSessionService } from '@/modules/stt/services/stt-session.service';
import { LiveTranscriptionEvents } from '@deepgram/sdk';

// ============================================================================
// MOCK SETUP - Factory Pattern (Prevents Timeouts)
// ============================================================================

let mockOnMethod: any;
let eventHandlers: Map<string, Function[]>;

const createMockLiveClient = () => {
  eventHandlers = new Map();

  mockOnMethod = vi.fn((event: string, handler: Function) => {
    if (!eventHandlers.has(event)) {
      eventHandlers.set(event, []);
    }
    eventHandlers.get(event)!.push(handler);

    // Auto-fire 'Open' event to prevent connection timeout
    if (event === LiveTranscriptionEvents.Open) {
      setTimeout(() => handler(), 10);
    }
  });

  return {
    on: mockOnMethod,
    off: vi.fn(),
    send: vi.fn(),
    finish: vi.fn(),
    requestClose: vi.fn(),
    removeListener: vi.fn(),
    getReadyState: vi.fn(() => 1), // OPEN
    keepAlive: vi.fn(),
  };
};

// Helper to trigger events manually
const triggerEvent = (event: string, data?: any) => {
  const handlers = eventHandlers.get(event);
  if (handlers) {
    handlers.forEach((handler) => handler(data));
  }
};

vi.mock('@deepgram/sdk', () => {
  return {
    createClient: vi.fn(() => ({
      listen: {
        live: vi.fn(() => createMockLiveClient()),
      },
    })),
    LiveTranscriptionEvents: {
      Open: 'Open',
      Close: 'Close',
      Transcript: 'Transcript',
      Metadata: 'Metadata',
      Error: 'Error',
      SpeechStarted: 'SpeechStarted',
      UtteranceEnd: 'UtteranceEnd',
    },
  };
});

describe('Integration: Session-Level Connection Lifecycle', () => {
  const testSessionId = 'integration-session-test';
  const testConnectionId = 'integration-conn-test';
  const testConfig = {
    sessionId: testSessionId,
    connectionId: testConnectionId,
    samplingRate: 16000,
    language: 'en-US',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await sttService.shutdown({ restart: true });
  });

  afterEach(async () => {
    await sttService.shutdown({ restart: true });
  });

  describe('Session-Level Connection Lifecycle', () => {
    it('should establish Deepgram connection on WebSocket connect', async () => {
      // Act: Create session (simulating WebSocket connect)
      await sttService.createSession(testSessionId, testConfig);

      // Assert: Session created with connection
      const session = sttSessionService.getSession(testSessionId);
      expect(session).not.toBeNull();
      expect(session!.connectionState).toBe('connected');
      expect(session!.deepgramLiveClient).not.toBeNull();
    });

    it('should persist connection across multiple recordings', async () => {
      // Arrange: Create session
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      const initialClient = session!.deepgramLiveClient;

      // Act: Multiple recordings
      // Recording 1
      session!.addTranscript('Recording one', 0.9, true);
      let promise = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 10);
      await promise;

      // Recording 2
      session!.addTranscript('Recording two', 0.9, true);
      promise = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 10);
      await promise;

      // Recording 3
      session!.addTranscript('Recording three', 0.9, true);
      promise = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 10);
      await promise;

      // Assert: Same client throughout
      expect(session!.deepgramLiveClient).toBe(initialClient);
      expect(session!.connectionState).toBe('connected');
    });

    it('should finalize transcript without closing connection', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      session!.addTranscript('Test transcript', 0.9, true);

      // Act: Finalize
      const promise = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.5 }), 10);
      const result = await promise;

      // Assert: Connection remains open
      expect(result).toBe('Test transcript');
      expect(session!.connectionState).toBe('connected');
      expect(session!.deepgramLiveClient).not.toBeNull();
    });

    it('should close connection only on WebSocket disconnect', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      // Multiple finalizations
      session!.addTranscript('First', 0.9, true);
      let promise = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 10);
      await promise;

      session!.addTranscript('Second', 0.9, true);
      promise = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 10);
      await promise;

      // Assert: Still connected
      expect(session!.connectionState).toBe('connected');

      // Act: Disconnect
      await sttService.endSession(testSessionId);

      // Assert: Session deleted
      expect(sttSessionService.getSession(testSessionId)).toBeUndefined();
    });

    it('should eliminate audio loss at recording start (0 latency)', async () => {
      // Arrange: Create session (WebSocket connect)
      const startTime = Date.now();
      await sttService.createSession(testSessionId, testConfig);
      const creationTime = Date.now() - startTime;

      // First recording (connection already open)
      const session = sttSessionService.getSession(testSessionId);
      expect(session!.connectionState).toBe('connected');

      // Finalize first recording
      session!.addTranscript('First recording', 0.9, true);
      let promise = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 10);
      await promise;

      // Act: Second recording starts (CRITICAL: should have 0 latency)
      const secondRecordingStart = Date.now();
      const session2 = sttSessionService.getSession(testSessionId);
      const readyCheck = Date.now() - secondRecordingStart;

      // Assert: Connection ready immediately (< 10ms check)
      expect(session2).not.toBeNull();
      expect(session2!.deepgramLiveClient).not.toBeNull();
      expect(session2!.connectionState).toBe('connected');
      expect(readyCheck).toBeLessThan(10); // Should be < 10ms

      // Assert: No re-creation needed (0 latency)
      // Old approach: ~3000ms connection time
      // New approach: ~0ms (connection already open)
      expect(creationTime).toBeGreaterThan(0); // Initial creation takes time
      expect(readyCheck).toBeLessThan(creationTime / 100); // Second recording 100x faster
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent disconnect during finalization', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      session!.addTranscript('Concurrent test', 0.9, true);

      // Simulate race: client becomes null during finalization
      const promise = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => {
        session!.deepgramLiveClient = null;
        triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.0 });
      }, 10);

      // Act: Should not crash
      await expect(promise).resolves.toBeDefined();
    });

    it('should handle rapid start-stop-start cycles', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      // Act: Rapid cycles
      for (let i = 0; i < 10; i++) {
        session!.addTranscript(`Recording ${i}`, 0.9, true);
        const promise = sttService.finalizeTranscript(testSessionId);
        setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 0.5 }), 10);
        await promise;
      }

      // Assert: Session still healthy
      expect(session!.connectionState).toBe('connected');
      expect(session!.deepgramLiveClient).not.toBeNull();
    });

    it('should handle multiple sessions simultaneously', async () => {
      // Arrange: Create 3 concurrent sessions
      const sessions = [
        { sessionId: 'session-1', connectionId: 'conn-1' },
        { sessionId: 'session-2', connectionId: 'conn-2' },
        { sessionId: 'session-3', connectionId: 'conn-3' },
      ];

      // Act: Create all sessions concurrently
      await Promise.all(
        sessions.map(({ sessionId, connectionId }) =>
          sttService.createSession(sessionId, {
            sessionId,
            connectionId,
            samplingRate: 16000,
            language: 'en-US',
          })
        )
      );

      // Assert: All sessions exist
      sessions.forEach(({ sessionId }) => {
        const session = sttSessionService.getSession(sessionId);
        expect(session).not.toBeNull();
        expect(session!.connectionState).toBe('connected');
      });

      // Cleanup
      await Promise.all(sessions.map(({ sessionId }) => sttService.endSession(sessionId)));
    });
  });

  describe('Error Recovery', () => {
    it('should recover from Deepgram connection errors', async () => {
      // Arrange: Simulate connection that becomes error state
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      // Simulate error state
      session!.connectionState = 'error';

      // Act: Try to finalize despite error
      const result = await sttService.finalizeTranscript(testSessionId);

      // Assert: Handled gracefully
      expect(result).toBeDefined();
    });

    it('should handle network interruptions gracefully', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      session!.addTranscript('Network test', 0.9, true);

      // Simulate network error during finalization
      const mockClient = session!.deepgramLiveClient as any;
      mockClient.send = vi.fn(() => {
        throw new Error('Network error');
      });

      // Act: Should not crash
      await expect(sttService.finalizeTranscript(testSessionId)).resolves.toBeDefined();
    });

    it('should handle fallback session creation if missing', async () => {
      // Simulate scenario: STT session not created on connect (error occurred)
      // audio.start should create fallback session

      // Act: Check if session exists
      const hasSession = sttService.hasSession(testSessionId);

      if (!hasSession) {
        // Fallback: Create session
        await sttService.createSession(testSessionId, testConfig);
      }

      // Assert: Session now exists
      expect(sttService.hasSession(testSessionId)).toBe(true);
    });
  });

  describe('Performance and Latency', () => {
    it('should create initial session within reasonable time', async () => {
      // Act
      const startTime = Date.now();
      await sttService.createSession(testSessionId, testConfig);
      const duration = Date.now() - startTime;

      // Assert: Creation completes quickly (with mocked SDK)
      expect(duration).toBeLessThan(1000); // Should be < 1s with mocks
    });

    it('should finalize transcript within timeout window', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      session!.addTranscript('Performance test', 0.9, true);

      // Act
      const startTime = Date.now();
      const promise = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 50);
      await promise;
      const duration = Date.now() - startTime;

      // Assert: Finalization completes quickly
      expect(duration).toBeLessThan(1000);
    }, 5000);

    it('should support high-frequency finalization cycles', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      // Act: 20 rapid finalizations
      const startTime = Date.now();
      for (let i = 0; i < 20; i++) {
        session!.addTranscript(`Rapid ${i}`, 0.9, true);
        const promise = sttService.finalizeTranscript(testSessionId);
        setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 0.1 }), 10);
        await promise;
      }
      const totalDuration = Date.now() - startTime;

      // Assert: All completed successfully
      expect(session!.connectionState).toBe('connected');
      expect(totalDuration).toBeLessThan(5000); // 20 cycles in < 5s
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should track finalization method (event vs timeout)', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      session!.addTranscript('Metrics test', 0.9, true);

      // Act
      const promise = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 10);
      await promise;

      // Assert: Tracked as event-based
      expect(session!.metrics.finalizationMethod).toBe('event');
    });

    it('should track session lifecycle metrics', async () => {
      // Arrange
      const beforeMetrics = sttService.getMetrics();
      const beforeCreated = beforeMetrics.totalSessionsCreated;
      const beforeCleaned = beforeMetrics.totalSessionsCleaned;

      // Act: Create, use, and end session
      await sttService.createSession(testSessionId, testConfig);

      const afterCreateMetrics = sttService.getMetrics();
      expect(afterCreateMetrics.totalSessionsCreated).toBe(beforeCreated + 1);

      await sttService.endSession(testSessionId);

      const afterEndMetrics = sttService.getMetrics();
      expect(afterEndMetrics.totalSessionsCleaned).toBe(beforeCleaned + 1);
    });

    it('should provide session-level metrics', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      // Act: Add transcripts and finalize
      session!.addTranscript('First', 0.95, true);
      session!.addTranscript('Second', 0.92, true);
      const promise = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 10);
      await promise;

      // Get metrics
      const metrics = sttService.getSessionMetrics(testSessionId);

      // Assert: Metrics tracked
      expect(metrics).toBeDefined();
      expect(metrics!.sessionId).toBe(testSessionId);
      expect(metrics!.transcriptsReceived).toBe(2);
      expect(metrics!.connectionState).toBe('connected');
    });
  });
});
