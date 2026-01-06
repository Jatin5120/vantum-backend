/**
 * STT Service - Session-Level Lifecycle Tests
 * Focus on testing the critical session-level connection lifecycle changes
 * Target Coverage: 90%+ for critical finalization and cleanup paths
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sttService } from '@/modules/stt/services/stt.service';
import { sttSessionService } from '@/modules/stt/services/stt-session.service';
import { LiveTranscriptionEvents } from '@deepgram/sdk';

// Create mock live client with proper event handling
let mockOnMethod: any;
let eventHandlers: Map<string, Function[]>;

const createMockLiveClient = () => {
  eventHandlers = new Map();

  mockOnMethod = vi.fn((event: string, handler: Function) => {
    // Store handlers for later triggering
    if (!eventHandlers.has(event)) {
      eventHandlers.set(event, []);
    }
    eventHandlers.get(event)!.push(handler);

    // Automatically fire 'Open' event to prevent timeout
    if (event === LiveTranscriptionEvents.Open) {
      setTimeout(() => handler(), 10);
    }
  });

  return {
    getReadyState: vi.fn(() => 1), // OPEN state by default
    send: vi.fn(),
    requestClose: vi.fn(),
    on: mockOnMethod,
    removeListener: vi.fn(),
    keepAlive: vi.fn(),
  };
};

// Mock Deepgram SDK
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

// Helper to trigger a specific event
const triggerEvent = (event: string, data?: any) => {
  const handlers = eventHandlers.get(event);
  if (handlers) {
    handlers.forEach(handler => handler(data));
  }
};

describe('STT Service - Session-Level Connection Lifecycle', () => {
  const testSessionId = 'session-lifecycle-test';
  const testConnectionId = 'conn-lifecycle-test';
  const testConfig = {
    sessionId: testSessionId,
    connectionId: testConnectionId,
    samplingRate: 16000,
    language: 'en-US',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    eventHandlers = new Map();
    // Reset service state
    await sttService.shutdown({ restart: true });
  });

  afterEach(async () => {
    // Cleanup all sessions
    await sttService.shutdown({ restart: true });
  });

  describe('finalizeTranscript() - Happy Path with Metadata Event', () => {
    it('should finalize transcript when Metadata event fires', async () => {
      // Arrange: Create session and add transcript
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      expect(session).toBeDefined();
      session!.addTranscript('Hello', 0.95, true);
      session!.addTranscript('world', 0.92, true);

      // Act: Finalize the transcript (trigger Metadata event during finalization)
      const finalizePromise = sttService.finalizeTranscript(testSessionId);

      // Trigger Metadata event after a short delay
      setTimeout(() => {
        triggerEvent(LiveTranscriptionEvents.Metadata, {
          duration: 2.5,
          request_id: 'test-123'
        });
      }, 50);

      const result = await finalizePromise;

      // Assert: Transcript returned and state reset
      expect(result).toBe('Hello world');
      expect(session!.transcriptSegments).toEqual([]); // Reset
      expect(session!.interimTranscript).toBe(''); // Reset
      expect(session!.transcriptSegments).toEqual([]); // Reset
      expect(session!.metrics.finalizationMethod).toBe('event');
    });

    it('should reset transcript state after finalization', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      session!.addTranscript('First transcript', 0.9, true);
      session!.addTranscript('Interim text', 0.85, false);

      // Act
      const finalizePromise = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => {
        triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.2 });
      }, 50);
      await finalizePromise;

      // Assert: All state reset
      expect(session!.transcriptSegments).toEqual([]);
      expect(session!.interimTranscript).toBe('');
      expect(session!.transcriptSegments.length).toBe(0);
    });

    it('should keep connection open (not close)', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      const mockClient = session!.deepgramLiveClient as any;

      // Act
      const finalizePromise = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => {
        triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 0.8 });
      }, 50);
      await finalizePromise;

      // Assert: Connection remains open
      expect(mockClient.requestClose).not.toHaveBeenCalled();
      expect(session!.deepgramLiveClient).not.toBeUndefined();
      expect(session!.connectionState).toBe('connected');
    });

    it('should cleanup event listeners after finalization', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      const mockClient = session!.deepgramLiveClient as any;

      // Act
      const finalizePromise = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => {
        triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.0 });
      }, 50);
      await finalizePromise;

      // Assert: Listener removed
      expect(mockClient.removeListener).toHaveBeenCalledWith(
        LiveTranscriptionEvents.Metadata,
        expect.any(Function)
      );
    });

    it('should track finalization method as event', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      // Act
      const finalizePromise = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => {
        triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.5 });
      }, 50);
      await finalizePromise;

      // Assert: Tracked as event-based finalization
      expect(session!.metrics.finalizationMethod).toBe('event');
    });
  });

  describe('finalizeTranscript() - Timeout Fallback', () => {
    it('should use timeout if Metadata event never fires', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      session!.addTranscript('Timeout test', 0.9, true);

      // Act: Will timeout (no Metadata event triggered)
      const result = await sttService.finalizeTranscript(testSessionId);

      // Assert: Falls back to timeout
      expect(result).toBe('Timeout test');
      expect(session!.metrics.finalizationMethod).toBe('timeout');
    }, 10000);

    it('should still cleanup listeners on timeout', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      const mockClient = session!.deepgramLiveClient as any;

      // Act (no Metadata event)
      await sttService.finalizeTranscript(testSessionId);

      // Assert: Cleanup still happens
      expect(mockClient.removeListener).toHaveBeenCalled();
    }, 10000);

    it('should track finalization method as timeout', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      // Act (no Metadata event)
      await sttService.finalizeTranscript(testSessionId);

      // Assert
      expect(session!.metrics.finalizationMethod).toBe('timeout');
    }, 10000);
  });

  describe('finalizeTranscript() - Race Condition Scenarios (CRITICAL)', () => {
    it('should handle client becoming null before finalization', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      session!.addTranscript('Race condition test', 0.9, true);

      // Simulate race condition: client becomes null
      session!.deepgramLiveClient = null;

      // Act: Should not crash
      const result = await sttService.finalizeTranscript(testSessionId);

      // Assert: Returns accumulated transcript gracefully
      expect(result).toBe('Race condition test');
      expect(session!.transcriptSegments).toEqual([]); // Still reset
    });

    it('should return accumulated transcript gracefully on null client', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      session!.addTranscript('First', 0.9, true);
      session!.addTranscript('Second', 0.9, true);
      session!.addTranscript('Third', 0.9, true);

      // Client becomes null mid-operation
      session!.deepgramLiveClient = null;

      // Act
      const result = await sttService.finalizeTranscript(testSessionId);

      // Assert: All transcripts returned
      expect(result).toBe('First Second Third');
    });

    it('should reset state even when client is null', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      session!.addTranscript('Test', 0.9, true);
      session!.addTranscript('Interim', 0.8, false);
      session!.deepgramLiveClient = null;

      // Act
      await sttService.finalizeTranscript(testSessionId);

      // Assert: State still reset despite null client
      expect(session!.transcriptSegments).toEqual([]);
      expect(session!.interimTranscript).toBe('');
      expect(session!.transcriptSegments).toEqual([]);
    });

    it('should not crash on concurrent disconnect during finalization', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      session!.addTranscript('Concurrent test', 0.9, true);

      // Simulate race: client becomes null during finalization
      setTimeout(() => {
        session!.deepgramLiveClient = null;
      }, 10);

      // Act: Should not crash
      await expect(sttService.finalizeTranscript(testSessionId)).resolves.toBeDefined();
    });
  });

  describe('finalizeTranscript() - Connection States', () => {
    it('should handle connection not ready (readyState !== 1)', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      session!.addTranscript('Not ready test', 0.9, true);

      const mockClient = session!.deepgramLiveClient as any;
      mockClient.getReadyState.mockReturnValue(0); // CONNECTING

      // Act
      const result = await sttService.finalizeTranscript(testSessionId);

      // Assert: Still returns transcript, but CloseStream not sent
      expect(result).toBe('Not ready test');
      expect(mockClient.send).not.toHaveBeenCalled();
    });

    it('should handle CloseStream send failure', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      session!.addTranscript('Send fail test', 0.9, true);

      const mockClient = session!.deepgramLiveClient as any;
      mockClient.send.mockImplementation(() => {
        throw new Error('Send failed');
      });

      // Act: Should not crash
      await expect(sttService.finalizeTranscript(testSessionId)).resolves.toBeDefined();
    });

    it('should handle Metadata event never firing (timeout path)', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      session!.addTranscript('No metadata', 0.9, true);

      // Act (no Metadata event triggered)
      const result = await sttService.finalizeTranscript(testSessionId);

      // Assert: Fallback to timeout works
      expect(result).toBe('No metadata');
      expect(session!.metrics.finalizationMethod).toBe('timeout');
    }, 10000);
  });

  describe('endSession() - Session-Level Cleanup', () => {
    it('should close Deepgram connection', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      expect(session).not.toBeUndefined();

      // Act
      await sttService.endSession(testSessionId);

      // Assert: Session deleted (connection closed internally)
      expect(sttSessionService.getSession(testSessionId)).toBeUndefined();
    });

    it('should cleanup session from service', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      expect(sttSessionService.getSession(testSessionId)).not.toBeUndefined();

      // Act
      await sttService.endSession(testSessionId);

      // Assert: Session removed
      expect(sttSessionService.getSession(testSessionId)).toBeUndefined();
    });

    it('should NOT finalize transcript (that is done separately)', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      session!.addTranscript('Should not finalize', 0.9, true);

      const mockClient = session!.deepgramLiveClient as any;
      const sendSpy = vi.spyOn(mockClient, 'send');

      // Act
      await sttService.endSession(testSessionId);

      // Assert: No CloseStream sent during endSession
      expect(sendSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('CloseStream')
      );
    });

    it('should increment totalSessionsCleaned metric', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const beforeMetrics = sttService.getMetrics();
      const cleanedBefore = beforeMetrics.totalSessionsCleaned;

      // Act
      await sttService.endSession(testSessionId);

      // Assert
      const afterMetrics = sttService.getMetrics();
      expect(afterMetrics.totalSessionsCleaned).toBe(cleanedBefore + 1);
    });

    it('should handle non-existent session gracefully', async () => {
      // Act: Try to end non-existent session
      const result = await sttService.endSession('non-existent-id');

      // Assert: Returns empty string (not undefined)
      expect(result).toBe('');
    });

    it('should cleanup even if errors occur', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      const mockClient = session!.deepgramLiveClient as any;
      mockClient.requestClose.mockImplementation(() => {
        throw new Error('Close failed');
      });

      // Act: Should not throw, returns empty string
      const result = await sttService.endSession(testSessionId);

      // Assert: Returns empty string and session still cleaned up
      expect(result).toBe('');
      expect(sttSessionService.getSession(testSessionId)).toBeUndefined();
    });
  });

  describe('Multiple Recording Cycles (Session Persistence)', () => {
    it('should support multiple finalizations without closing connection', async () => {
      // Arrange: Create session once
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      const mockClient = session!.deepgramLiveClient as any;

      // First recording
      session!.addTranscript('First recording', 0.9, true);
      const finalize1 = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 50);
      const result1 = await finalize1;
      expect(result1).toBe('First recording');

      // Assert: Connection still open
      expect(session!.deepgramLiveClient).not.toBeUndefined();
      expect(session!.connectionState).toBe('connected');
      expect(mockClient.requestClose).not.toHaveBeenCalled();

      // Second recording
      session!.addTranscript('Second recording', 0.9, true);
      const finalize2 = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 50);
      const result2 = await finalize2;
      expect(result2).toBe('Second recording');

      // Assert: Still open
      expect(session!.deepgramLiveClient).not.toBeUndefined();
      expect(session!.connectionState).toBe('connected');
      expect(mockClient.requestClose).not.toHaveBeenCalled();

      // Third recording
      session!.addTranscript('Third recording', 0.9, true);
      const finalize3 = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 50);
      const result3 = await finalize3;
      expect(result3).toBe('Third recording');

      // Assert: Still open
      expect(session!.deepgramLiveClient).not.toBeUndefined();
      expect(session!.connectionState).toBe('connected');

      // Connection only closed on endSession
      await sttService.endSession(testSessionId);
      expect(sttSessionService.getSession(testSessionId)).toBeUndefined();
    });

    it('should eliminate audio loss between recordings (0 latency)', async () => {
      // Arrange: Session created on WebSocket connect
      await sttService.createSession(testSessionId, testConfig);

      // First recording
      const session = sttSessionService.getSession(testSessionId);
      expect(session).not.toBeUndefined();
      expect(session!.connectionState).toBe('connected');
      expect(session!.deepgramLiveClient).not.toBeUndefined();

      // Finalize first recording
      const finalize1 = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 50);
      await finalize1;

      // Second recording starts IMMEDIATELY (no createSession needed)
      const session2 = sttSessionService.getSession(testSessionId);
      expect(session2).not.toBeUndefined(); // Same session
      expect(session2!.deepgramLiveClient).not.toBeUndefined(); // Connection ready
      expect(session2!.connectionState).toBe('connected'); // Already connected

      // Result: 0 latency, no 3+ second audio loss
    });

    it('should track metrics across multiple recordings', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      // First recording
      session!.addTranscript('Recording 1', 0.9, true);
      const finalize1 = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 50);
      await finalize1;
      expect(session!.metrics.finalizationMethod).toBe('event');

      // Second recording
      session!.addTranscript('Recording 2', 0.9, true);
      const finalize2 = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 50);
      await finalize2;

      // Assert: Metrics tracked
      expect(session!.metrics.transcriptsReceived).toBe(2);
    });
  });

  describe('Full Session Lifecycle', () => {
    it('should follow complete lifecycle: create → finalize × N → end', async () => {
      // 1. Create session (on WebSocket connect)
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      expect(session).not.toBeUndefined();
      expect(session!.connectionState).toBe('connected');

      // 2. First finalize (audio.end)
      session!.addTranscript('First', 0.9, true);
      const finalize1 = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 50);
      await finalize1;
      expect(session!.connectionState).toBe('connected');

      // 3. Second finalize (audio.end)
      session!.addTranscript('Second', 0.9, true);
      const finalize2 = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 50);
      await finalize2;
      expect(session!.connectionState).toBe('connected');

      // 4. Third finalize (audio.end)
      session!.addTranscript('Third', 0.9, true);
      const finalize3 = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 50);
      await finalize3;
      expect(session!.connectionState).toBe('connected');

      // 5. End session (on WebSocket disconnect)
      await sttService.endSession(testSessionId);
      expect(sttSessionService.getSession(testSessionId)).toBeUndefined();
    });

    it('should track totalSessionsCreated and totalSessionsCleaned', async () => {
      // Arrange
      const beforeMetrics = sttService.getMetrics();

      // Create session
      await sttService.createSession(testSessionId, testConfig);
      const afterCreateMetrics = sttService.getMetrics();
      expect(afterCreateMetrics.totalSessionsCreated).toBe(
        beforeMetrics.totalSessionsCreated + 1
      );

      // End session
      await sttService.endSession(testSessionId);
      const afterEndMetrics = sttService.getMetrics();
      expect(afterEndMetrics.totalSessionsCleaned).toBe(beforeMetrics.totalSessionsCleaned + 1);
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    it('should handle finalization when session has no transcripts', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      // Act: Finalize with no transcripts
      const finalizePromise = sttService.finalizeTranscript(testSessionId);
      setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 0.0 }), 50);
      const result = await finalizePromise;

      // Assert: Returns empty string
      expect(result).toBe('');
    });

    it('should handle rapid finalization calls (stress test)', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      // Act: Multiple rapid finalizations
      for (let i = 0; i < 5; i++) {
        session!.addTranscript(`Recording ${i + 1}`, 0.9, true);
        const finalizePromise = sttService.finalizeTranscript(testSessionId);
        setTimeout(() => triggerEvent(LiveTranscriptionEvents.Metadata, { duration: 0.1 }), 50);
        const result = await finalizePromise;
        expect(result).toBe(`Recording ${i + 1}`);
      }

      // Assert: Session still healthy
      expect(session!.connectionState).toBe('connected');
      expect(session!.deepgramLiveClient).not.toBeUndefined();
    });

    it('should handle finalization during reconnection state', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      session!.addTranscript('Reconnecting test', 0.9, true);

      // Simulate reconnecting state
      session!.isReconnecting = true;
      session!.connectionState = 'disconnected';

      // Act: Try to finalize
      const result = await sttService.finalizeTranscript(testSessionId);

      // Assert: Still returns transcript
      expect(result).toBe('Reconnecting test');
    });
  });
});
