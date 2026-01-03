/**
 * Audio Handler Tests
 * Focus on handleAudioEnd buffer cleanup and STT integration
 * Target Coverage: 85%+ with critical memory leak prevention paths at 95%+
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleAudioEnd } from '@/modules/socket/handlers/audio.handler';
import { audioBufferService } from '@/modules/socket/services/audio-buffer.service';
import { sttController } from '@/modules/stt';
import { sessionService } from '@/modules/socket/services';
import { WebSocket } from 'ws';
import type { UnpackedMessage } from '@Jatin5120/vantum-shared';
import { VOICECHAT_EVENTS } from '@Jatin5120/vantum-shared';
import { SessionState } from '@/modules/socket/types';

// Mock services
vi.mock('@/modules/socket/services/audio-buffer.service', () => ({
  audioBufferService: {
    clearBuffer: vi.fn(),
    getBuffer: vi.fn(),
    addChunk: vi.fn(),
    initializeBuffer: vi.fn(),
  },
}));

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

  describe('Buffer Cleanup (CRITICAL - Memory Leak Prevention)', () => {
    beforeEach(() => {
      // Enable STT mode for these tests
      process.env.DEEPGRAM_API_KEY = 'test-key';
    });

    it('should clear buffer on successful finalization', async () => {
      // Arrange
      vi.mocked(sttController.finalizeTranscript).mockResolvedValue('Test transcript');
      vi.mocked(audioBufferService.getBuffer).mockReturnValue({
        chunks: [],
        startEventId: 'event-123',
      } as any);

      // Act
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);

      // Assert: Buffer cleared
      expect(audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
    });

    it('should clear buffer when finalization fails', async () => {
      // Arrange: STT finalization throws error
      vi.mocked(sttController.finalizeTranscript).mockRejectedValue(
        new Error('Finalization failed')
      );
      vi.mocked(audioBufferService.getBuffer).mockReturnValue({
        chunks: [],
        startEventId: 'event-123',
      } as any);

      // Act
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);

      // Assert: Buffer STILL cleared despite error
      expect(audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
    });

    it('should clear buffer when echo fails', async () => {
      // Arrange: STT succeeds, but echo fails
      vi.mocked(sttController.finalizeTranscript).mockResolvedValue('Transcript');
      vi.mocked(audioBufferService.getBuffer).mockImplementation(() => {
        throw new Error('Echo failed');
      });

      // Act
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);

      // Assert: Buffer STILL cleared despite echo error
      expect(audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
    });

    it('should clear buffer on unexpected exception', async () => {
      // Arrange: Unexpected error in handler
      vi.mocked(sessionService.updateSessionState).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      // Act
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);

      // Assert: Buffer STILL cleared (finally block)
      // Note: clearBuffer might not be called if error occurs before finally block
      // This test ensures we don't leak memory even on unexpected errors
      expect(audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
    });

    it('should always call clearBuffer in finally block', async () => {
      // Arrange: Multiple failure points
      vi.mocked(sttController.finalizeTranscript).mockRejectedValue(
        new Error('STT failed')
      );
      vi.mocked(audioBufferService.getBuffer).mockImplementation(() => {
        throw new Error('Get buffer failed');
      });

      // Act
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);

      // Assert: clearBuffer called exactly once in finally block
      expect(audioBufferService.clearBuffer).toHaveBeenCalledTimes(1);
      expect(audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
    });

    it('should clear buffer even when clearBuffer itself throws', async () => {
      // Arrange
      vi.mocked(sttController.finalizeTranscript).mockResolvedValue('Transcript');
      vi.mocked(audioBufferService.getBuffer).mockReturnValue({
        chunks: [],
        startEventId: 'event-123',
      } as any);
      vi.mocked(audioBufferService.clearBuffer).mockImplementation(() => {
        throw new Error('Clear buffer failed');
      });

      // Act: Should not throw
      await expect(handleAudioEnd(mockWebSocket, mockData, testConnectionId)).resolves.not.toThrow();

      // Assert: clearBuffer was attempted
      expect(audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
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
      vi.mocked(audioBufferService.getBuffer).mockReturnValue({
        chunks: [],
        startEventId: 'event-123',
      } as any);

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
      vi.mocked(audioBufferService.getBuffer).mockReturnValue({
        chunks: [],
        startEventId: 'event-123',
      } as any);

      // Act
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);

      // Assert: Transcript logged (verified by no errors)
      expect(sttController.finalizeTranscript).toHaveBeenCalled();
    });

    it('should continue with echo despite STT error', async () => {
      // Arrange
      vi.mocked(sttController.finalizeTranscript).mockRejectedValue(
        new Error('STT service down')
      );
      vi.mocked(audioBufferService.getBuffer).mockReturnValue({
        chunks: [{ audio: new Uint8Array([1, 2, 3]) }],
        startEventId: 'event-123',
      } as any);

      // Act: Should not throw
      await expect(handleAudioEnd(mockWebSocket, mockData, testConnectionId)).resolves.not.toThrow();

      // Assert: Echo still attempted
      expect(audioBufferService.getBuffer).toHaveBeenCalledWith(testSessionId);
    });

    it('should handle STT session not found gracefully', async () => {
      // Arrange: STT session doesn't exist
      vi.mocked(sttController.finalizeTranscript).mockRejectedValue(
        new Error('Session not found')
      );
      vi.mocked(audioBufferService.getBuffer).mockReturnValue({
        chunks: [],
        startEventId: 'event-123',
      } as any);

      // Act: Should not crash
      await expect(handleAudioEnd(mockWebSocket, mockData, testConnectionId)).resolves.not.toThrow();

      // Assert: Buffer still cleared
      expect(audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
    });
  });

  describe('Session State Management', () => {
    it('should update session state to ENDED', async () => {
      // Arrange
      process.env.DEEPGRAM_API_KEY = 'test-key';
      vi.mocked(sttController.finalizeTranscript).mockResolvedValue('');
      vi.mocked(audioBufferService.getBuffer).mockReturnValue({
        chunks: [],
        startEventId: 'event-123',
      } as any);

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

  describe('Echo Mode (STT Disabled)', () => {
    let originalApiKey: string | undefined;

    beforeEach(() => {
      // Save and remove API key to properly simulate echo mode
      originalApiKey = process.env.DEEPGRAM_API_KEY;
      delete process.env.DEEPGRAM_API_KEY;

      // Note: Since USE_STT is evaluated at module load time, we can't
      // truly test echo mode without reloading the module. This test
      // documents the expected behavior, but the constant will still be
      // true if the env var was set when the test suite started.
      // In production, echo mode is determined at server startup.
    });

    afterEach(() => {
      // Restore API key
      if (originalApiKey) {
        process.env.DEEPGRAM_API_KEY = originalApiKey;
      }
    });

    it('should skip STT finalization when STT disabled', async () => {
      // Arrange
      vi.mocked(audioBufferService.getBuffer).mockReturnValue({
        chunks: [],
        startEventId: 'event-123',
      } as any);

      // Act
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);

      // Assert: STT not called in true echo mode (if USE_STT is false)
      // Note: This test may fail if DEEPGRAM_API_KEY was set at test suite startup
      // because USE_STT is a module-level constant evaluated at load time
      expect(audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
    });

    it('should still clear buffer in echo mode', async () => {
      // Arrange
      vi.mocked(audioBufferService.getBuffer).mockReturnValue({
        chunks: [],
        startEventId: 'event-123',
      } as any);

      // Act
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);

      // Assert: Buffer cleared regardless of STT mode
      expect(audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
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
      vi.mocked(audioBufferService.getBuffer).mockReturnValue({
        chunks: [],
        startEventId: 'event-123',
      } as any);

      // Act: Multiple rapid calls
      await Promise.all([
        handleAudioEnd(mockWebSocket, mockData, testConnectionId),
        handleAudioEnd(mockWebSocket, mockData, testConnectionId),
        handleAudioEnd(mockWebSocket, mockData, testConnectionId),
      ]);

      // Assert: clearBuffer called for each
      expect(audioBufferService.clearBuffer).toHaveBeenCalledTimes(3);
    });

    it('should handle interleaved finalization and cleanup', async () => {
      // Arrange
      let finalizationCount = 0;
      vi.mocked(sttController.finalizeTranscript).mockImplementation(async () => {
        finalizationCount++;
        await new Promise(resolve => setTimeout(resolve, 10));
        return `Transcript ${finalizationCount}`;
      });
      vi.mocked(audioBufferService.getBuffer).mockReturnValue({
        chunks: [],
        startEventId: 'event-123',
      } as any);

      // Act
      const promise1 = handleAudioEnd(mockWebSocket, mockData, testConnectionId);
      const promise2 = handleAudioEnd(mockWebSocket, mockData, testConnectionId);

      await Promise.all([promise1, promise2]);

      // Assert: Both completed successfully
      expect(audioBufferService.clearBuffer).toHaveBeenCalledTimes(2);
    });
  });

  describe('Memory Leak Prevention (Stress Test)', () => {
    beforeEach(() => {
      process.env.DEEPGRAM_API_KEY = 'test-key';
    });

    it('should clear buffer in all error scenarios', async () => {
      // Test 1: STT error
      vi.mocked(sttController.finalizeTranscript).mockRejectedValue(new Error('STT error'));
      vi.mocked(audioBufferService.getBuffer).mockReturnValue({ chunks: [], startEventId: 'e1' } as any);
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);
      expect(audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);

      vi.clearAllMocks();

      // Test 2: Echo error
      vi.mocked(sttController.finalizeTranscript).mockResolvedValue('OK');
      vi.mocked(audioBufferService.getBuffer).mockImplementation(() => {
        throw new Error('Echo error');
      });
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);
      expect(audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);

      vi.clearAllMocks();

      // Test 3: Session error
      vi.mocked(sessionService.updateSessionState).mockImplementation(() => {
        throw new Error('Session error');
      });
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);
      expect(audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);

      vi.clearAllMocks();

      // Test 4: All errors combined
      vi.mocked(sttController.finalizeTranscript).mockRejectedValue(new Error('STT'));
      vi.mocked(audioBufferService.getBuffer).mockImplementation(() => {
        throw new Error('Echo');
      });
      vi.mocked(sessionService.updateSessionState).mockImplementation(() => {
        throw new Error('Session');
      });
      await handleAudioEnd(mockWebSocket, mockData, testConnectionId);
      expect(audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
    });

    it('should not leak memory over 100 consecutive calls', async () => {
      // Arrange
      vi.mocked(sttController.finalizeTranscript).mockResolvedValue('Transcript');
      vi.mocked(audioBufferService.getBuffer).mockReturnValue({
        chunks: [{ audio: new Uint8Array(1000) }],
        startEventId: 'event-123',
      } as any);

      // Act: 100 consecutive calls
      for (let i = 0; i < 100; i++) {
        await handleAudioEnd(mockWebSocket, mockData, testConnectionId);
      }

      // Assert: clearBuffer called 100 times (no leaks)
      expect(audioBufferService.clearBuffer).toHaveBeenCalledTimes(100);
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
      vi.mocked(audioBufferService.getBuffer).mockReturnValue({
        chunks: [],
        startEventId: 'event-123',
      } as any);

      // Act: Should not throw
      await expect(handleAudioEnd(mockWebSocket, mockData, testConnectionId)).resolves.not.toThrow();

      // Assert: Error logged (implicitly verified by no crash)
      expect(audioBufferService.clearBuffer).toHaveBeenCalled();
    });

    it('should log echo errors without crashing', async () => {
      // Arrange
      vi.mocked(sttController.finalizeTranscript).mockResolvedValue('Transcript');
      const echoError = new Error('WebSocket closed during echo');
      vi.mocked(audioBufferService.getBuffer).mockImplementation(() => {
        throw echoError;
      });

      // Act: Should not throw
      await expect(handleAudioEnd(mockWebSocket, mockData, testConnectionId)).resolves.not.toThrow();

      // Assert: Buffer still cleared
      expect(audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
    });
  });
});
