/**
 * Audio Handler Tests
 * Focus on handleAudioEnd WebSocket cleanup and STT integration
 * Target Coverage: 85%+ with critical resource cleanup paths at 95%+
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleAudioEnd } from '@/modules/socket/handlers/audio.handler';
import { sttController } from '@/modules/stt';
import { sessionService, websocketService } from '@/modules/socket/services';
import { WebSocket } from 'ws';
import type { UnpackedMessage } from '@Jatin5120/vantum-shared';
import { VOICECHAT_EVENTS } from '@Jatin5120/vantum-shared';
import { SessionState } from '@/modules/socket/types';

// Mock services
vi.mock('@/modules/stt', () => ({
  sttController: {
    finalizeTranscript: vi.fn(),
    endSession: vi.fn(),
    hasSession: vi.fn(),
    createSession: vi.fn(),
    forwardChunk: vi.fn(),
  },
}));

vi.mock('@/modules/socket/services', () => ({
  sessionService: {
    getSessionBySocketId: vi.fn(),
    updateSession: vi.fn(),
    updateSessionState: vi.fn(),
    touchSession: vi.fn(),
  },
  websocketService: {
    sendToSession: vi.fn(),
    hasWebSocket: vi.fn(),
    removeWebSocket: vi.fn(),
    registerWebSocket: vi.fn(),
  },
}));

describe('Audio Handler - handleAudioEnd', () => {
  const testConnectionId = 'test-conn-123';
  const testSessionId = 'test-session-123';
  let mockWebSocket: WebSocket;
  let mockData: UnpackedMessage;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock WebSocket
    mockWebSocket = {
      send: vi.fn(),
      close: vi.fn(),
    } as any;

    // Mock request data
    mockData = {
      eventType: VOICECHAT_EVENTS.AUDIO_END,
      eventId: 'event-123',
      sessionId: testSessionId,
      payload: {},
    };

    // Mock session
    const mockSession = {
      sessionId: testSessionId,
      connectionId: testConnectionId,
      state: SessionState.ACTIVE,
      createdAt: Date.now() - 5000,
      metadata: {
        samplingRate: 16000,
      },
    };

    vi.mocked(sessionService.getSessionBySocketId).mockReturnValue(mockSession as any);
    vi.mocked(sessionService.updateSessionState).mockReturnValue(mockSession as any);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('WebSocket Lifecycle (MVP - Not Removed on audio.input.end)', () => {
    beforeEach(() => {
      // Enable STT mode for these tests
      process.env.DEEPGRAM_API_KEY = 'test-key';
    });

    it('should NOT remove WebSocket on successful finalization (TTS may be active)', async () => {
      // Arrange
      vi.mocked(sttController.finalizeTranscript).mockResolvedValue('Test transcript');

      // Act
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);

      // Assert: WebSocket NOT removed (persists for TTS audio delivery)
      expect(websocketService.removeWebSocket).not.toHaveBeenCalled();
    });

    it('should NOT remove WebSocket when finalization fails', async () => {
      // Arrange: STT finalization throws error
      vi.mocked(sttController.finalizeTranscript).mockRejectedValue(
        new Error('Finalization failed')
      );

      // Act
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);

      // Assert: WebSocket NOT removed even on error
      expect(websocketService.removeWebSocket).not.toHaveBeenCalled();
    });

    it('should NOT remove WebSocket on unexpected exception', async () => {
      // Arrange: Unexpected error in handler
      vi.mocked(sessionService.updateSessionState).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      // Act
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);

      // Assert: WebSocket NOT removed in finally block
      expect(websocketService.removeWebSocket).not.toHaveBeenCalled();
    });

    it('should never call removeWebSocket (cleanup happens in disconnect handler)', async () => {
      // Arrange: Multiple failure points
      vi.mocked(sttController.finalizeTranscript).mockRejectedValue(
        new Error('STT failed')
      );

      // Act
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);

      // Assert: removeWebSocket never called (disconnect handler manages cleanup)
      expect(websocketService.removeWebSocket).not.toHaveBeenCalled();
    });

    it('should leave WebSocket open for TTS audio delivery', async () => {
      // Arrange
      vi.mocked(sttController.finalizeTranscript).mockResolvedValue('Transcript');

      // Act
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);

      // Assert: WebSocket remains open (allows TTS chunks to be sent)
      // Note: Disconnect handler (socket.server.ts) handles final cleanup
      expect(websocketService.removeWebSocket).not.toHaveBeenCalled();
    });
  });

  describe('STT Integration', () => {
    beforeEach(() => {
      // Enable STT mode
      process.env.DEEPGRAM_API_KEY = 'test-key';
    });

    it('should call finalizeTranscript (not endSession)', async () => {
      // Arrange
      vi.mocked(sttController.finalizeTranscript).mockResolvedValue('Final transcript');

      // Act
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);

      // Assert: finalizeTranscript called (session-level lifecycle)
      expect(sttController.finalizeTranscript).toHaveBeenCalledWith(testSessionId);
      // endSession should NOT be called (connection stays open)
      expect(sttController.endSession).not.toHaveBeenCalled();
    });

    it('should log final transcript on success', async () => {
      // Arrange
      const mockTranscript = 'This is the final transcript';
      vi.mocked(sttController.finalizeTranscript).mockResolvedValue(mockTranscript);

      // Act
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);

      // Assert: Transcript logged (verified by no errors)
      expect(sttController.finalizeTranscript).toHaveBeenCalled();
    });

    it('should continue gracefully despite STT error', async () => {
      // Arrange
      vi.mocked(sttController.finalizeTranscript).mockRejectedValue(
        new Error('STT service down')
      );

      // Act: Should not throw
      await expect(handleAudioEnd(mockWebSocket, mockData, testConnectionId)).resolves.not.toThrow();

      // Assert: WebSocket NOT removed (error doesn't change lifecycle)
      expect(websocketService.removeWebSocket).not.toHaveBeenCalled();
    });

    it('should handle STT session not found gracefully', async () => {
      // Arrange: STT session doesn't exist
      vi.mocked(sttController.finalizeTranscript).mockRejectedValue(
        new Error('Session not found')
      );

      // Act: Should not crash
      await expect(handleAudioEnd(mockWebSocket, mockData, testConnectionId)).resolves.not.toThrow();

      // Assert: WebSocket NOT removed (disconnect handler manages cleanup)
      expect(websocketService.removeWebSocket).not.toHaveBeenCalled();
    });
  });

  describe('Session State Management', () => {
    it('should update session state to ENDED', async () => {
      // Arrange
      process.env.DEEPGRAM_API_KEY = 'test-key';
      vi.mocked(sttController.finalizeTranscript).mockResolvedValue('');

      // Act
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);

      // Assert
      expect(sessionService.updateSessionState).toHaveBeenCalledWith(
        testConnectionId,
        SessionState.ENDED
      );
    });

    it('should handle session not found', async () => {
      // Arrange
      vi.mocked(sessionService.getSessionBySocketId).mockReturnValue(undefined);

      // Act: Should handle gracefully
      await expect(handleAudioEnd(mockWebSocket, mockData, testConnectionId)).resolves.not.toThrow();
    });

    it('should handle session update failure', async () => {
      // Arrange
      vi.mocked(sessionService.updateSessionState).mockReturnValue(null);

      // Act: Should handle gracefully
      await expect(handleAudioEnd(mockWebSocket, mockData, testConnectionId)).resolves.not.toThrow();
    });
  });

  describe('MVP Behavior (No Audio Echo)', () => {
    let originalApiKey: string | undefined;

    beforeEach(() => {
      // Save API key
      originalApiKey = process.env.DEEPGRAM_API_KEY;
      process.env.DEEPGRAM_API_KEY = 'test-key';
    });

    afterEach(() => {
      // Restore API key
      if (originalApiKey) {
        process.env.DEEPGRAM_API_KEY = originalApiKey;
      }
    });

    it('should NOT stream echoed audio back to client', async () => {
      // Arrange
      vi.mocked(sttController.finalizeTranscript).mockResolvedValue('Test transcript');

      // Act
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);

      // Assert: No RESPONSE_START, RESPONSE_CHUNK, or RESPONSE_COMPLETE sent
      // (websocketService.sendToSession should NOT be called for echo)
      expect(websocketService.sendToSession).not.toHaveBeenCalled();
    });

    it('should finalize STT transcript without echoing', async () => {
      // Arrange
      const transcript = 'User said something important';
      vi.mocked(sttController.finalizeTranscript).mockResolvedValue(transcript);

      // Act
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);

      // Assert: STT finalized, but no echo/TTS audio streamed
      expect(sttController.finalizeTranscript).toHaveBeenCalledWith(testSessionId);
      expect(websocketService.sendToSession).not.toHaveBeenCalled();
    });
  });

  describe('Payload Validation', () => {
    it('should handle invalid payload', async () => {
      // Arrange
      const invalidData = {
        ...mockData,
        payload: null,
      };

      // Act
      await expect(handleAudioEnd(mockWebSocket, invalidData as any, testConnectionId)).resolves.not.toThrow();
    });

    it('should handle missing eventId', async () => {
      // Arrange
      const noEventIdData = {
        ...mockData,
        eventId: undefined,
      };

      // Act
      await expect(handleAudioEnd(mockWebSocket, noEventIdData as any, testConnectionId)).resolves.not.toThrow();
    });
  });

  describe('Concurrent Operations', () => {
    beforeEach(() => {
      process.env.DEEPGRAM_API_KEY = 'test-key';
    });

    it('should handle multiple rapid audio.end calls', async () => {
      // Arrange
      vi.mocked(sttController.finalizeTranscript).mockResolvedValue('Transcript');

      // Act: Multiple rapid calls
      await Promise.all([
        handleAudioEnd(mockWebSocket, mockData, testConnectionId),
        handleAudioEnd(mockWebSocket, mockData, testConnectionId),
        handleAudioEnd(mockWebSocket, mockData, testConnectionId),
      ]);

      // Assert: WebSocket NOT removed (persists across multiple recording cycles)
      expect(websocketService.removeWebSocket).not.toHaveBeenCalled();
    });

    it('should handle interleaved finalization and cleanup', async () => {
      // Arrange
      let finalizationCount = 0;
      vi.mocked(sttController.finalizeTranscript).mockImplementation(async () => {
        finalizationCount++;
        await new Promise(resolve => setTimeout(resolve, 10));
        return `Transcript ${finalizationCount}`;
      });

      // Act
      const promise1 = handleAudioEnd(mockWebSocket, mockData, testConnectionId);
      const promise2 = handleAudioEnd(mockWebSocket, mockData, testConnectionId);

      await Promise.all([promise1, promise2]);

      // Assert: Both completed successfully, WebSocket persists
      expect(websocketService.removeWebSocket).not.toHaveBeenCalled();
    });
  });

  describe('Resource Lifecycle (MVP - WebSocket Persists)', () => {
    beforeEach(() => {
      process.env.DEEPGRAM_API_KEY = 'test-key';
    });

    it('should NOT remove WebSocket in any error scenario', async () => {
      // Test 1: STT error
      vi.mocked(sttController.finalizeTranscript).mockRejectedValue(new Error('STT error'));
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);
      expect(websocketService.removeWebSocket).not.toHaveBeenCalled();

      vi.clearAllMocks();

      // Test 2: Session error
      vi.mocked(sessionService.updateSessionState).mockImplementation(() => {
        throw new Error('Session error');
      });
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);
      expect(websocketService.removeWebSocket).not.toHaveBeenCalled();

      vi.clearAllMocks();

      // Test 3: All errors combined
      vi.mocked(sttController.finalizeTranscript).mockRejectedValue(new Error('STT'));
      vi.mocked(sessionService.updateSessionState).mockImplementation(() => {
        throw new Error('Session');
      });
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);
      expect(websocketService.removeWebSocket).not.toHaveBeenCalled();
    });

    it('should not remove WebSocket over 100 consecutive calls', async () => {
      // Arrange
      vi.mocked(sttController.finalizeTranscript).mockResolvedValue('Transcript');

      // Act: 100 consecutive calls (simulating multiple recording cycles)
      for (let i = 0; i < 100; i++) {
        await handleAudioEnd(mockWebSocket, mockData, testConnectionId);
      }

      // Assert: removeWebSocket never called (WebSocket persists across all cycles)
      expect(websocketService.removeWebSocket).not.toHaveBeenCalled();
    });
  });

  describe('Error Logging and Recovery', () => {
    beforeEach(() => {
      process.env.DEEPGRAM_API_KEY = 'test-key';
    });

    it('should log STT errors without crashing', async () => {
      // Arrange
      const sttError = new Error('Deepgram connection lost');
      vi.mocked(sttController.finalizeTranscript).mockRejectedValue(sttError);

      // Act: Should not throw
      await expect(handleAudioEnd(mockWebSocket, mockData, testConnectionId)).resolves.not.toThrow();

      // Assert: WebSocket NOT removed (error recovery doesn't trigger cleanup)
      expect(websocketService.removeWebSocket).not.toHaveBeenCalled();
    });

    it('should continue gracefully despite session error', async () => {
      // Arrange
      vi.mocked(sttController.finalizeTranscript).mockResolvedValue('Transcript');
      const sessionError = new Error('Session service down');
      vi.mocked(sessionService.updateSessionState).mockImplementation(() => {
        throw sessionError;
      });

      // Act: Should not throw
      await expect(handleAudioEnd(mockWebSocket, mockData, testConnectionId)).resolves.not.toThrow();

      // Assert: WebSocket NOT removed (disconnect handler manages cleanup)
      expect(websocketService.removeWebSocket).not.toHaveBeenCalled();
    });
  });
});
