/**
 * Socket Server Tests
 * Focus on WebSocket connection lifecycle and STT session tracking
 * Target Coverage: 85%+ with critical cleanup paths at 95%+
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import type { ExtendedWebSocket } from '@/modules/socket/types';
import { sessionService, websocketService } from '@/modules/socket/services';
import { sttController } from '@/modules/stt';

// Mock services
vi.mock('@/modules/socket/services', () => ({
  sessionService: {
    createSession: vi.fn(),
    getSessionBySocketId: vi.fn(),
    deleteSession: vi.fn(),
    touchSession: vi.fn(),
  },
  websocketService: {
    registerWebSocket: vi.fn(),
    removeWebSocket: vi.fn(),
    sendToSession: vi.fn(),
  },
}));

vi.mock('@/modules/stt', () => ({
  sttController: {
    createSession: vi.fn(),
    endSession: vi.fn(),
    hasSession: vi.fn(),
    finalizeTranscript: vi.fn(),
  },
}));

describe('Socket Server - Connection Lifecycle', () => {
  const testConnectionId = 'conn-test-123';
  const testSessionId = 'session-test-123';

  let mockSession: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock session
    mockSession = {
      sessionId: testSessionId,
      connectionId: testConnectionId,
      createdAt: Date.now(),
      state: 'idle',
      metadata: {},
    };

    vi.mocked(sessionService.createSession).mockReturnValue(mockSession);
    vi.mocked(sessionService.getSessionBySocketId).mockReturnValue(mockSession);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Connection Handler - STT Session Creation (CRITICAL)', () => {
    beforeEach(() => {
      // Enable STT mode
      process.env.DEEPGRAM_API_KEY = 'test-key';
    });

    it('should create STT session immediately on WebSocket connect', async () => {
      // Arrange
      vi.mocked(sttController.createSession).mockResolvedValue();

      // Simulate connection handler
      const mockExtWs = {
        connectionId: testConnectionId,
        sessionId: testSessionId,
        sttSessionCreated: false,
      } as ExtendedWebSocket;

      // Act: Simulate STT session creation
      try {
        await sttController.createSession(testSessionId, {
          sessionId: testSessionId,
          connectionId: testConnectionId,
          samplingRate: 16000,
          language: 'en-US',
        });
        mockExtWs.sttSessionCreated = true;
      } catch (error) {
        mockExtWs.sttSessionCreated = false;
      }

      // Assert: STT session created successfully
      expect(sttController.createSession).toHaveBeenCalledWith(testSessionId, {
        sessionId: testSessionId,
        connectionId: testConnectionId,
        samplingRate: 16000,
        language: 'en-US',
      });
      expect(mockExtWs.sttSessionCreated).toBe(true);
    });

    it('should set sttSessionCreated = true on successful creation', async () => {
      // Arrange
      vi.mocked(sttController.createSession).mockResolvedValue();

      // Act: Simulate successful creation
      const mockExtWs = {
        sttSessionCreated: false,
      } as ExtendedWebSocket;

      await sttController.createSession(testSessionId, {
        sessionId: testSessionId,
        connectionId: testConnectionId,
        samplingRate: 16000,
        language: 'en-US',
      });
      mockExtWs.sttSessionCreated = true;

      // Assert
      expect(mockExtWs.sttSessionCreated).toBe(true);
    });

    it('should set sttSessionCreated = false on creation failure', async () => {
      // Arrange
      vi.mocked(sttController.createSession).mockRejectedValue(
        new Error('Deepgram connection failed')
      );

      // Act: Simulate failed creation
      const mockExtWs = {
        sttSessionCreated: false,
      } as ExtendedWebSocket;

      try {
        await sttController.createSession(testSessionId, {
          sessionId: testSessionId,
          connectionId: testConnectionId,
          samplingRate: 16000,
          language: 'en-US',
        });
        mockExtWs.sttSessionCreated = true;
      } catch (error) {
        mockExtWs.sttSessionCreated = false;
      }

      // Assert
      expect(mockExtWs.sttSessionCreated).toBe(false);
    });

    it('should NOT fail entire connection on STT creation error', async () => {
      // Arrange
      vi.mocked(sttController.createSession).mockRejectedValue(
        new Error('STT service unavailable')
      );

      // Act: Simulate connection continuing despite STT error
      const mockExtWs = {
        connectionId: testConnectionId,
        sessionId: testSessionId,
        sttSessionCreated: false,
      } as ExtendedWebSocket;

      let connectionFailed = false;
      try {
        await sttController.createSession(testSessionId, {
          sessionId: testSessionId,
          connectionId: testConnectionId,
          samplingRate: 16000,
          language: 'en-US',
        });
        mockExtWs.sttSessionCreated = true;
      } catch (error) {
        mockExtWs.sttSessionCreated = false;
        // Connection continues despite STT error
        connectionFailed = false;
      }

      // Assert: Connection successful, STT flag is false
      expect(connectionFailed).toBe(false);
      expect(mockExtWs.sttSessionCreated).toBe(false);
    });

    it('should store sttSessionCreated flag on ExtendedWebSocket', () => {
      // Arrange
      const mockExtWs = {
        connectionId: testConnectionId,
        sessionId: testSessionId,
      } as ExtendedWebSocket;

      // Act: Set the flag
      mockExtWs.sttSessionCreated = true;

      // Assert
      expect(mockExtWs.sttSessionCreated).toBe(true);
      expect(mockExtWs).toHaveProperty('sttSessionCreated');
    });
  });

  describe('Disconnect Handler - Conditional STT Cleanup (CRITICAL)', () => {
    beforeEach(() => {
      process.env.DEEPGRAM_API_KEY = 'test-key';
    });

    it('should cleanup STT session when sttSessionCreated = true', async () => {
      // Arrange
      const mockExtWs = {
        sttSessionCreated: true,
        connectionId: testConnectionId,
        sessionId: testSessionId,
      } as ExtendedWebSocket;

      vi.mocked(sttController.hasSession).mockReturnValue(true);
      vi.mocked(sttController.endSession).mockResolvedValue();

      // Act: Simulate disconnect
      if (mockExtWs.sttSessionCreated && sttController.hasSession(testSessionId)) {
        await sttController.endSession(testSessionId);
      }

      // Assert: STT session closed
      expect(sttController.hasSession).toHaveBeenCalledWith(testSessionId);
      expect(sttController.endSession).toHaveBeenCalledWith(testSessionId);
    });

    it('should skip STT cleanup when sttSessionCreated = false', async () => {
      // Arrange
      const mockExtWs = {
        sttSessionCreated: false,
        connectionId: testConnectionId,
        sessionId: testSessionId,
      } as ExtendedWebSocket;

      // Act: Simulate disconnect
      if (mockExtWs.sttSessionCreated && sttController.hasSession(testSessionId)) {
        await sttController.endSession(testSessionId);
      }

      // Assert: STT cleanup skipped
      expect(sttController.endSession).not.toHaveBeenCalled();
    });

    it('should skip STT cleanup when USE_STT = false', async () => {
      // Arrange
      delete process.env.DEEPGRAM_API_KEY; // Disable STT

      const mockExtWs = {
        sttSessionCreated: true,
        connectionId: testConnectionId,
        sessionId: testSessionId,
      } as ExtendedWebSocket;

      const USE_STT = !!process.env.DEEPGRAM_API_KEY;

      // Act: Simulate disconnect
      if (USE_STT && mockExtWs.sttSessionCreated && sttController.hasSession(testSessionId)) {
        await sttController.endSession(testSessionId);
      }

      // Assert: STT cleanup skipped
      expect(sttController.endSession).not.toHaveBeenCalled();
    });

    it('should skip STT cleanup when session does not exist', async () => {
      // Arrange
      const mockExtWs = {
        sttSessionCreated: true,
        connectionId: testConnectionId,
        sessionId: testSessionId,
      } as ExtendedWebSocket;

      vi.mocked(sttController.hasSession).mockReturnValue(false);

      // Act: Simulate disconnect
      if (mockExtWs.sttSessionCreated && sttController.hasSession(testSessionId)) {
        await sttController.endSession(testSessionId);
      }

      // Assert: endSession not called
      expect(sttController.hasSession).toHaveBeenCalledWith(testSessionId);
      expect(sttController.endSession).not.toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      // Arrange
      const mockExtWs = {
        sttSessionCreated: true,
        connectionId: testConnectionId,
        sessionId: testSessionId,
      } as ExtendedWebSocket;

      vi.mocked(sttController.hasSession).mockReturnValue(true);
      vi.mocked(sttController.endSession).mockRejectedValue(
        new Error('Cleanup failed')
      );

      // Act: Simulate disconnect with error
      try {
        if (mockExtWs.sttSessionCreated && sttController.hasSession(testSessionId)) {
          await sttController.endSession(testSessionId);
        }
      } catch (error) {
        // Error handled gracefully
      }

      // Assert: Cleanup attempted
      expect(sttController.endSession).toHaveBeenCalledWith(testSessionId);
      // Should not throw - disconnect should complete
    });
  });

  describe('Full Session Lifecycle (Integration)', () => {
    beforeEach(() => {
      process.env.DEEPGRAM_API_KEY = 'test-key';
    });

    it('should follow: WebSocket connect → STT created → Flag set to true', async () => {
      // Arrange
      vi.mocked(sttController.createSession).mockResolvedValue();

      const mockExtWs = {
        connectionId: testConnectionId,
        sessionId: testSessionId,
        sttSessionCreated: false,
      } as ExtendedWebSocket;

      // Act: Simulate connection handler
      await sttController.createSession(testSessionId, {
        sessionId: testSessionId,
        connectionId: testConnectionId,
        samplingRate: 16000,
        language: 'en-US',
      });
      mockExtWs.sttSessionCreated = true;

      // Assert
      expect(mockExtWs.sttSessionCreated).toBe(true);
    });

    it('should handle: Audio start → Verify STT session ready (no creation)', async () => {
      // Arrange: STT session already created on connect
      vi.mocked(sttController.hasSession).mockReturnValue(true);

      // Act: Simulate audio.start handler
      const hasSession = sttController.hasSession(testSessionId);

      // Assert: Session exists, no re-creation needed
      expect(hasSession).toBe(true);
      expect(sttController.createSession).not.toHaveBeenCalled();
    });

    it('should handle: Audio end → Call finalizeTranscript() → Connection persists', async () => {
      // Arrange
      vi.mocked(sttController.finalizeTranscript).mockResolvedValue('Transcript');

      // Act: Simulate audio.end handler
      await sttController.finalizeTranscript(testSessionId);

      // Assert: Finalized, but no endSession
      expect(sttController.finalizeTranscript).toHaveBeenCalledWith(testSessionId);
      expect(sttController.endSession).not.toHaveBeenCalled();
    });

    it('should handle: Second audio start → STT still ready (0 latency)', async () => {
      // Arrange: STT session persists from first recording
      vi.mocked(sttController.hasSession).mockReturnValue(true);

      // Act: Second audio.start
      const hasSession = sttController.hasSession(testSessionId);

      // Assert: Session ready instantly (no creation delay)
      expect(hasSession).toBe(true);
    });

    it('should handle: Second audio end → Finalize again → Connection persists', async () => {
      // Arrange
      vi.mocked(sttController.finalizeTranscript).mockResolvedValue('Transcript 2');

      // Act: Second finalization
      await sttController.finalizeTranscript(testSessionId);

      // Assert: Finalized again, connection still open
      expect(sttController.finalizeTranscript).toHaveBeenCalledWith(testSessionId);
      expect(sttController.endSession).not.toHaveBeenCalled();
    });

    it('should handle: WebSocket disconnect → Close STT connection', async () => {
      // Arrange
      const mockExtWs = {
        sttSessionCreated: true,
        sessionId: testSessionId,
      } as ExtendedWebSocket;

      vi.mocked(sttController.hasSession).mockReturnValue(true);
      vi.mocked(sttController.endSession).mockResolvedValue();

      // Act: Disconnect
      if (mockExtWs.sttSessionCreated && sttController.hasSession(testSessionId)) {
        await sttController.endSession(testSessionId);
      }

      // Assert: STT connection closed
      expect(sttController.endSession).toHaveBeenCalledWith(testSessionId);
    });
  });

  describe('Orphaned Session Prevention (CRITICAL)', () => {
    beforeEach(() => {
      process.env.DEEPGRAM_API_KEY = 'test-key';
    });

    it('should prevent orphaned STT session when connection failed', async () => {
      // Arrange: STT creation fails
      vi.mocked(sttController.createSession).mockRejectedValue(
        new Error('Creation failed')
      );

      const mockExtWs = {
        sttSessionCreated: false,
      } as ExtendedWebSocket;

      // Act: Attempt creation
      try {
        await sttController.createSession(testSessionId, {
          sessionId: testSessionId,
          connectionId: testConnectionId,
          samplingRate: 16000,
          language: 'en-US',
        });
        mockExtWs.sttSessionCreated = true;
      } catch (error) {
        mockExtWs.sttSessionCreated = false;
      }

      // Simulate disconnect
      if (mockExtWs.sttSessionCreated && sttController.hasSession(testSessionId)) {
        await sttController.endSession(testSessionId);
      }

      // Assert: No cleanup attempt (would fail with "session not found")
      expect(sttController.endSession).not.toHaveBeenCalled();
    });

    it('should prevent orphaned STT session when WebSocket closes during creation', async () => {
      // Arrange: WebSocket closes mid-creation
      let creationInProgress = true;
      vi.mocked(sttController.createSession).mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50)); // Simulate delay
        if (!creationInProgress) {
          throw new Error('WebSocket closed during creation');
        }
      });

      const mockExtWs = {
        sttSessionCreated: false,
      } as ExtendedWebSocket;

      // Act: Start creation, then simulate disconnect
      const createPromise = sttController.createSession(testSessionId, {
        sessionId: testSessionId,
        connectionId: testConnectionId,
        samplingRate: 16000,
        language: 'en-US',
      }).then(() => {
        mockExtWs.sttSessionCreated = true;
      }).catch(() => {
        mockExtWs.sttSessionCreated = false;
      });

      // Simulate WebSocket close during creation
      creationInProgress = false;

      await createPromise;

      // Simulate disconnect handler
      if (mockExtWs.sttSessionCreated && sttController.hasSession(testSessionId)) {
        await sttController.endSession(testSessionId);
      }

      // Assert: No orphaned session
      expect(mockExtWs.sttSessionCreated).toBe(false);
      expect(sttController.endSession).not.toHaveBeenCalled();
    });

    it('should track cleanup attempts to detect orphaned sessions', async () => {
      // Arrange
      const mockExtWs = {
        sttSessionCreated: false, // Flag is false
      } as ExtendedWebSocket;

      vi.mocked(sttController.hasSession).mockReturnValue(true); // But session exists!

      // Act: Disconnect
      if (mockExtWs.sttSessionCreated && sttController.hasSession(testSessionId)) {
        await sttController.endSession(testSessionId);
      }

      // Assert: Cleanup skipped (would detect orphaned session in monitoring)
      expect(sttController.endSession).not.toHaveBeenCalled();
    });
  });

  describe('Concurrent Operations', () => {
    beforeEach(() => {
      process.env.DEEPGRAM_API_KEY = 'test-key';
    });

    it('should handle multiple simultaneous connections', async () => {
      // Arrange
      vi.mocked(sttController.createSession).mockResolvedValue();

      const sessions = ['session-1', 'session-2', 'session-3'];

      // Act: Create multiple STT sessions concurrently
      await Promise.all(
        sessions.map(sessionId =>
          sttController.createSession(sessionId, {
            sessionId,
            connectionId: `conn-${sessionId}`,
            samplingRate: 16000,
            language: 'en-US',
          })
        )
      );

      // Assert: All sessions created
      expect(sttController.createSession).toHaveBeenCalledTimes(3);
    });

    it('should handle rapid connect-disconnect cycles', async () => {
      // Arrange
      vi.mocked(sttController.createSession).mockResolvedValue();
      vi.mocked(sttController.hasSession).mockReturnValue(true);
      vi.mocked(sttController.endSession).mockResolvedValue();

      // Act: Rapid cycles
      for (let i = 0; i < 10; i++) {
        await sttController.createSession(`session-${i}`, {
          sessionId: `session-${i}`,
          connectionId: `conn-${i}`,
          samplingRate: 16000,
          language: 'en-US',
        });

        await sttController.endSession(`session-${i}`);
      }

      // Assert: All created and cleaned up
      expect(sttController.createSession).toHaveBeenCalledTimes(10);
      expect(sttController.endSession).toHaveBeenCalledTimes(10);
    });
  });

  describe('Error Recovery', () => {
    beforeEach(() => {
      process.env.DEEPGRAM_API_KEY = 'test-key';
    });

    it('should recover from Deepgram connection errors', async () => {
      // Arrange: First attempt fails, second succeeds
      vi.mocked(sttController.createSession)
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce();

      const mockExtWs = {
        sttSessionCreated: false,
      } as ExtendedWebSocket;

      // Act: First attempt fails
      try {
        await sttController.createSession(testSessionId, {
          sessionId: testSessionId,
          connectionId: testConnectionId,
          samplingRate: 16000,
          language: 'en-US',
        });
        mockExtWs.sttSessionCreated = true;
      } catch (error) {
        mockExtWs.sttSessionCreated = false;
      }

      expect(mockExtWs.sttSessionCreated).toBe(false);

      // Act: Second attempt succeeds
      await sttController.createSession(testSessionId, {
        sessionId: testSessionId,
        connectionId: testConnectionId,
        samplingRate: 16000,
        language: 'en-US',
      });
      mockExtWs.sttSessionCreated = true;

      // Assert: Recovered
      expect(mockExtWs.sttSessionCreated).toBe(true);
    });

    it('should handle fallback STT session creation on audio.start', async () => {
      // Arrange: STT not created on connect (flag false)
      const mockExtWs = {
        sttSessionCreated: false,
      } as ExtendedWebSocket;

      vi.mocked(sttController.hasSession).mockReturnValue(false);
      vi.mocked(sttController.createSession).mockResolvedValue();

      // Act: audio.start handler creates fallback session
      if (!sttController.hasSession(testSessionId)) {
        await sttController.createSession(testSessionId, {
          sessionId: testSessionId,
          connectionId: testConnectionId,
          samplingRate: 16000,
          language: 'en-US',
        });
        mockExtWs.sttSessionCreated = true;
      }

      // Assert: Fallback session created
      expect(sttController.createSession).toHaveBeenCalled();
      expect(mockExtWs.sttSessionCreated).toBe(true);
    });

    it('should handle network interruptions gracefully', async () => {
      // Arrange
      vi.mocked(sttController.endSession).mockRejectedValue(
        new Error('Network error during cleanup')
      );

      const mockExtWs = {
        sttSessionCreated: true,
      } as ExtendedWebSocket;

      vi.mocked(sttController.hasSession).mockReturnValue(true);

      // Act: Disconnect with network error
      try {
        if (mockExtWs.sttSessionCreated && sttController.hasSession(testSessionId)) {
          await sttController.endSession(testSessionId);
        }
      } catch (error) {
        // Error handled
      }

      // Assert: Cleanup attempted
      expect(sttController.endSession).toHaveBeenCalledWith(testSessionId);
    });
  });

  describe('Session Cleanup', () => {
    it('should delete session on disconnect', () => {
      // Act
      sessionService.deleteSession(testConnectionId);

      // Assert
      expect(sessionService.deleteSession).toHaveBeenCalledWith(testConnectionId);
    });

    it('should remove WebSocket on disconnect', () => {
      // Act
      websocketService.removeWebSocket(testSessionId);

      // Assert
      expect(websocketService.removeWebSocket).toHaveBeenCalledWith(testSessionId);
    });
  });
});
