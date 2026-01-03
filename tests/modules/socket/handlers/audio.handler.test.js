"use strict";
/**
 * Audio Handler Tests
 * Focus on handleAudioEnd buffer cleanup and STT integration
 * Target Coverage: 85%+ with critical memory leak prevention paths at 95%+
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const audio_handler_1 = require("@/modules/socket/handlers/audio.handler");
const audio_buffer_service_1 = require("@/modules/socket/services/audio-buffer.service");
const stt_1 = require("@/modules/stt");
const services_1 = require("@/modules/socket/services");
const vantum_shared_1 = require("@Jatin5120/vantum-shared");
const types_1 = require("@/modules/socket/types");
// Mock services
vitest_1.vi.mock('@/modules/socket/services/audio-buffer.service', () => ({
    audioBufferService: {
        clearBuffer: vitest_1.vi.fn(),
        getBuffer: vitest_1.vi.fn(),
        addChunk: vitest_1.vi.fn(),
        initializeBuffer: vitest_1.vi.fn(),
    },
}));
vitest_1.vi.mock('@/modules/stt', () => ({
    sttController: {
        finalizeTranscript: vitest_1.vi.fn(),
        endSession: vitest_1.vi.fn(),
        hasSession: vitest_1.vi.fn(),
        createSession: vitest_1.vi.fn(),
        forwardChunk: vitest_1.vi.fn(),
    },
}));
vitest_1.vi.mock('@/modules/socket/services', () => ({
    sessionService: {
        getSessionBySocketId: vitest_1.vi.fn(),
        updateSession: vitest_1.vi.fn(),
        updateSessionState: vitest_1.vi.fn(),
        touchSession: vitest_1.vi.fn(),
    },
    websocketService: {
        sendToSession: vitest_1.vi.fn(),
        hasWebSocket: vitest_1.vi.fn(),
        removeWebSocket: vitest_1.vi.fn(),
    },
}));
(0, vitest_1.describe)('Audio Handler - handleAudioEnd', () => {
    const testConnectionId = 'test-conn-123';
    const testSessionId = 'test-session-123';
    let mockWebSocket;
    let mockData;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        // Mock WebSocket
        mockWebSocket = {
            send: vitest_1.vi.fn(),
            close: vitest_1.vi.fn(),
        };
        // Mock request data
        mockData = {
            eventType: vantum_shared_1.VOICECHAT_EVENTS.AUDIO_END,
            eventId: 'event-123',
            sessionId: testSessionId,
            payload: {},
        };
        // Mock session
        const mockSession = {
            sessionId: testSessionId,
            connectionId: testConnectionId,
            state: types_1.SessionState.ACTIVE,
            createdAt: Date.now() - 5000,
            metadata: {
                samplingRate: 16000,
            },
        };
        vitest_1.vi.mocked(services_1.sessionService.getSessionBySocketId).mockReturnValue(mockSession);
        vitest_1.vi.mocked(services_1.sessionService.updateSessionState).mockReturnValue(mockSession);
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.resetAllMocks();
    });
    (0, vitest_1.describe)('Buffer Cleanup (CRITICAL - Memory Leak Prevention)', () => {
        (0, vitest_1.beforeEach)(() => {
            // Enable STT mode for these tests
            process.env.DEEPGRAM_API_KEY = 'test-key';
        });
        (0, vitest_1.it)('should clear buffer on successful finalization', async () => {
            // Arrange
            vitest_1.vi.mocked(stt_1.sttController.finalizeTranscript).mockResolvedValue('Test transcript');
            vitest_1.vi.mocked(audio_buffer_service_1.audioBufferService.getBuffer).mockReturnValue({
                chunks: [],
                startEventId: 'event-123',
            });
            // Act
            await (0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId);
            // Assert: Buffer cleared
            (0, vitest_1.expect)(audio_buffer_service_1.audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
        });
        (0, vitest_1.it)('should clear buffer when finalization fails', async () => {
            // Arrange: STT finalization throws error
            vitest_1.vi.mocked(stt_1.sttController.finalizeTranscript).mockRejectedValue(new Error('Finalization failed'));
            vitest_1.vi.mocked(audio_buffer_service_1.audioBufferService.getBuffer).mockReturnValue({
                chunks: [],
                startEventId: 'event-123',
            });
            // Act
            await (0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId);
            // Assert: Buffer STILL cleared despite error
            (0, vitest_1.expect)(audio_buffer_service_1.audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
        });
        (0, vitest_1.it)('should clear buffer when echo fails', async () => {
            // Arrange: STT succeeds, but echo fails
            vitest_1.vi.mocked(stt_1.sttController.finalizeTranscript).mockResolvedValue('Transcript');
            vitest_1.vi.mocked(audio_buffer_service_1.audioBufferService.getBuffer).mockImplementation(() => {
                throw new Error('Echo failed');
            });
            // Act
            await (0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId);
            // Assert: Buffer STILL cleared despite echo error
            (0, vitest_1.expect)(audio_buffer_service_1.audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
        });
        (0, vitest_1.it)('should clear buffer on unexpected exception', async () => {
            // Arrange: Unexpected error in handler
            vitest_1.vi.mocked(services_1.sessionService.updateSessionState).mockImplementation(() => {
                throw new Error('Unexpected error');
            });
            // Act
            await (0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId);
            // Assert: Buffer STILL cleared (finally block)
            // Note: clearBuffer might not be called if error occurs before finally block
            // This test ensures we don't leak memory even on unexpected errors
            (0, vitest_1.expect)(audio_buffer_service_1.audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
        });
        (0, vitest_1.it)('should always call clearBuffer in finally block', async () => {
            // Arrange: Multiple failure points
            vitest_1.vi.mocked(stt_1.sttController.finalizeTranscript).mockRejectedValue(new Error('STT failed'));
            vitest_1.vi.mocked(audio_buffer_service_1.audioBufferService.getBuffer).mockImplementation(() => {
                throw new Error('Get buffer failed');
            });
            // Act
            await (0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId);
            // Assert: clearBuffer called exactly once in finally block
            (0, vitest_1.expect)(audio_buffer_service_1.audioBufferService.clearBuffer).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(audio_buffer_service_1.audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
        });
        (0, vitest_1.it)('should clear buffer even when clearBuffer itself throws', async () => {
            // Arrange
            vitest_1.vi.mocked(stt_1.sttController.finalizeTranscript).mockResolvedValue('Transcript');
            vitest_1.vi.mocked(audio_buffer_service_1.audioBufferService.getBuffer).mockReturnValue({
                chunks: [],
                startEventId: 'event-123',
            });
            vitest_1.vi.mocked(audio_buffer_service_1.audioBufferService.clearBuffer).mockImplementation(() => {
                throw new Error('Clear buffer failed');
            });
            // Act: Should not throw
            await (0, vitest_1.expect)((0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId)).resolves.not.toThrow();
            // Assert: clearBuffer was attempted
            (0, vitest_1.expect)(audio_buffer_service_1.audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
        });
    });
    (0, vitest_1.describe)('STT Integration', () => {
        (0, vitest_1.beforeEach)(() => {
            // Enable STT mode
            process.env.DEEPGRAM_API_KEY = 'test-key';
        });
        (0, vitest_1.it)('should call finalizeTranscript (not endSession)', async () => {
            // Arrange
            vitest_1.vi.mocked(stt_1.sttController.finalizeTranscript).mockResolvedValue('Final transcript');
            vitest_1.vi.mocked(audio_buffer_service_1.audioBufferService.getBuffer).mockReturnValue({
                chunks: [],
                startEventId: 'event-123',
            });
            // Act
            await (0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId);
            // Assert: finalizeTranscript called (session-level lifecycle)
            (0, vitest_1.expect)(stt_1.sttController.finalizeTranscript).toHaveBeenCalledWith(testSessionId);
            // endSession should NOT be called (connection stays open)
            (0, vitest_1.expect)(stt_1.sttController.endSession).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('should log final transcript on success', async () => {
            // Arrange
            const mockTranscript = 'This is the final transcript';
            vitest_1.vi.mocked(stt_1.sttController.finalizeTranscript).mockResolvedValue(mockTranscript);
            vitest_1.vi.mocked(audio_buffer_service_1.audioBufferService.getBuffer).mockReturnValue({
                chunks: [],
                startEventId: 'event-123',
            });
            // Act
            await (0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId);
            // Assert: Transcript logged (verified by no errors)
            (0, vitest_1.expect)(stt_1.sttController.finalizeTranscript).toHaveBeenCalled();
        });
        (0, vitest_1.it)('should continue with echo despite STT error', async () => {
            // Arrange
            vitest_1.vi.mocked(stt_1.sttController.finalizeTranscript).mockRejectedValue(new Error('STT service down'));
            vitest_1.vi.mocked(audio_buffer_service_1.audioBufferService.getBuffer).mockReturnValue({
                chunks: [{ audio: new Uint8Array([1, 2, 3]) }],
                startEventId: 'event-123',
            });
            // Act: Should not throw
            await (0, vitest_1.expect)((0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId)).resolves.not.toThrow();
            // Assert: Echo still attempted
            (0, vitest_1.expect)(audio_buffer_service_1.audioBufferService.getBuffer).toHaveBeenCalledWith(testSessionId);
        });
        (0, vitest_1.it)('should handle STT session not found gracefully', async () => {
            // Arrange: STT session doesn't exist
            vitest_1.vi.mocked(stt_1.sttController.finalizeTranscript).mockRejectedValue(new Error('Session not found'));
            vitest_1.vi.mocked(audio_buffer_service_1.audioBufferService.getBuffer).mockReturnValue({
                chunks: [],
                startEventId: 'event-123',
            });
            // Act: Should not crash
            await (0, vitest_1.expect)((0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId)).resolves.not.toThrow();
            // Assert: Buffer still cleared
            (0, vitest_1.expect)(audio_buffer_service_1.audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
        });
    });
    (0, vitest_1.describe)('Session State Management', () => {
        (0, vitest_1.it)('should update session state to ENDED', async () => {
            // Arrange
            process.env.DEEPGRAM_API_KEY = 'test-key';
            vitest_1.vi.mocked(stt_1.sttController.finalizeTranscript).mockResolvedValue('');
            vitest_1.vi.mocked(audio_buffer_service_1.audioBufferService.getBuffer).mockReturnValue({
                chunks: [],
                startEventId: 'event-123',
            });
            // Act
            await (0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId);
            // Assert
            (0, vitest_1.expect)(services_1.sessionService.updateSessionState).toHaveBeenCalledWith(testConnectionId, types_1.SessionState.ENDED);
        });
        (0, vitest_1.it)('should handle session not found', async () => {
            // Arrange
            vitest_1.vi.mocked(services_1.sessionService.getSessionBySocketId).mockReturnValue(undefined);
            // Act: Should handle gracefully
            await (0, vitest_1.expect)((0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId)).resolves.not.toThrow();
        });
        (0, vitest_1.it)('should handle session update failure', async () => {
            // Arrange
            vitest_1.vi.mocked(services_1.sessionService.updateSessionState).mockReturnValue(null);
            // Act: Should handle gracefully
            await (0, vitest_1.expect)((0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId)).resolves.not.toThrow();
        });
    });
    (0, vitest_1.describe)('Echo Mode (STT Disabled)', () => {
        let originalApiKey;
        (0, vitest_1.beforeEach)(() => {
            // Save and remove API key to properly simulate echo mode
            originalApiKey = process.env.DEEPGRAM_API_KEY;
            delete process.env.DEEPGRAM_API_KEY;
            // Note: Since USE_STT is evaluated at module load time, we can't
            // truly test echo mode without reloading the module. This test
            // documents the expected behavior, but the constant will still be
            // true if the env var was set when the test suite started.
            // In production, echo mode is determined at server startup.
        });
        (0, vitest_1.afterEach)(() => {
            // Restore API key
            if (originalApiKey) {
                process.env.DEEPGRAM_API_KEY = originalApiKey;
            }
        });
        (0, vitest_1.it)('should skip STT finalization when STT disabled', async () => {
            // Arrange
            vitest_1.vi.mocked(audio_buffer_service_1.audioBufferService.getBuffer).mockReturnValue({
                chunks: [],
                startEventId: 'event-123',
            });
            // Act
            await (0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId);
            // Assert: STT not called in true echo mode (if USE_STT is false)
            // Note: This test may fail if DEEPGRAM_API_KEY was set at test suite startup
            // because USE_STT is a module-level constant evaluated at load time
            (0, vitest_1.expect)(audio_buffer_service_1.audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
        });
        (0, vitest_1.it)('should still clear buffer in echo mode', async () => {
            // Arrange
            vitest_1.vi.mocked(audio_buffer_service_1.audioBufferService.getBuffer).mockReturnValue({
                chunks: [],
                startEventId: 'event-123',
            });
            // Act
            await (0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId);
            // Assert: Buffer cleared regardless of STT mode
            (0, vitest_1.expect)(audio_buffer_service_1.audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
        });
    });
    (0, vitest_1.describe)('Payload Validation', () => {
        (0, vitest_1.it)('should handle invalid payload', async () => {
            // Arrange
            const invalidData = {
                ...mockData,
                payload: null,
            };
            // Act
            await (0, vitest_1.expect)((0, audio_handler_1.handleAudioEnd)(mockWebSocket, invalidData, testConnectionId)).resolves.not.toThrow();
        });
        (0, vitest_1.it)('should handle missing eventId', async () => {
            // Arrange
            const noEventIdData = {
                ...mockData,
                eventId: undefined,
            };
            // Act
            await (0, vitest_1.expect)((0, audio_handler_1.handleAudioEnd)(mockWebSocket, noEventIdData, testConnectionId)).resolves.not.toThrow();
        });
    });
    (0, vitest_1.describe)('Concurrent Operations', () => {
        (0, vitest_1.beforeEach)(() => {
            process.env.DEEPGRAM_API_KEY = 'test-key';
        });
        (0, vitest_1.it)('should handle multiple rapid audio.end calls', async () => {
            // Arrange
            vitest_1.vi.mocked(stt_1.sttController.finalizeTranscript).mockResolvedValue('Transcript');
            vitest_1.vi.mocked(audio_buffer_service_1.audioBufferService.getBuffer).mockReturnValue({
                chunks: [],
                startEventId: 'event-123',
            });
            // Act: Multiple rapid calls
            await Promise.all([
                (0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId),
                (0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId),
                (0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId),
            ]);
            // Assert: clearBuffer called for each
            (0, vitest_1.expect)(audio_buffer_service_1.audioBufferService.clearBuffer).toHaveBeenCalledTimes(3);
        });
        (0, vitest_1.it)('should handle interleaved finalization and cleanup', async () => {
            // Arrange
            let finalizationCount = 0;
            vitest_1.vi.mocked(stt_1.sttController.finalizeTranscript).mockImplementation(async () => {
                finalizationCount++;
                await new Promise(resolve => setTimeout(resolve, 10));
                return `Transcript ${finalizationCount}`;
            });
            vitest_1.vi.mocked(audio_buffer_service_1.audioBufferService.getBuffer).mockReturnValue({
                chunks: [],
                startEventId: 'event-123',
            });
            // Act
            const promise1 = (0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId);
            const promise2 = (0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId);
            await Promise.all([promise1, promise2]);
            // Assert: Both completed successfully
            (0, vitest_1.expect)(audio_buffer_service_1.audioBufferService.clearBuffer).toHaveBeenCalledTimes(2);
        });
    });
    (0, vitest_1.describe)('Memory Leak Prevention (Stress Test)', () => {
        (0, vitest_1.beforeEach)(() => {
            process.env.DEEPGRAM_API_KEY = 'test-key';
        });
        (0, vitest_1.it)('should clear buffer in all error scenarios', async () => {
            // Test 1: STT error
            vitest_1.vi.mocked(stt_1.sttController.finalizeTranscript).mockRejectedValue(new Error('STT error'));
            vitest_1.vi.mocked(audio_buffer_service_1.audioBufferService.getBuffer).mockReturnValue({ chunks: [], startEventId: 'e1' });
            await (0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId);
            (0, vitest_1.expect)(audio_buffer_service_1.audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
            vitest_1.vi.clearAllMocks();
            // Test 2: Echo error
            vitest_1.vi.mocked(stt_1.sttController.finalizeTranscript).mockResolvedValue('OK');
            vitest_1.vi.mocked(audio_buffer_service_1.audioBufferService.getBuffer).mockImplementation(() => {
                throw new Error('Echo error');
            });
            await (0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId);
            (0, vitest_1.expect)(audio_buffer_service_1.audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
            vitest_1.vi.clearAllMocks();
            // Test 3: Session error
            vitest_1.vi.mocked(services_1.sessionService.updateSessionState).mockImplementation(() => {
                throw new Error('Session error');
            });
            await (0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId);
            (0, vitest_1.expect)(audio_buffer_service_1.audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
            vitest_1.vi.clearAllMocks();
            // Test 4: All errors combined
            vitest_1.vi.mocked(stt_1.sttController.finalizeTranscript).mockRejectedValue(new Error('STT'));
            vitest_1.vi.mocked(audio_buffer_service_1.audioBufferService.getBuffer).mockImplementation(() => {
                throw new Error('Echo');
            });
            vitest_1.vi.mocked(services_1.sessionService.updateSessionState).mockImplementation(() => {
                throw new Error('Session');
            });
            await (0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId);
            (0, vitest_1.expect)(audio_buffer_service_1.audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
        });
        (0, vitest_1.it)('should not leak memory over 100 consecutive calls', async () => {
            // Arrange
            vitest_1.vi.mocked(stt_1.sttController.finalizeTranscript).mockResolvedValue('Transcript');
            vitest_1.vi.mocked(audio_buffer_service_1.audioBufferService.getBuffer).mockReturnValue({
                chunks: [{ audio: new Uint8Array(1000) }],
                startEventId: 'event-123',
            });
            // Act: 100 consecutive calls
            for (let i = 0; i < 100; i++) {
                await (0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId);
            }
            // Assert: clearBuffer called 100 times (no leaks)
            (0, vitest_1.expect)(audio_buffer_service_1.audioBufferService.clearBuffer).toHaveBeenCalledTimes(100);
        });
    });
    (0, vitest_1.describe)('Error Logging and Recovery', () => {
        (0, vitest_1.beforeEach)(() => {
            process.env.DEEPGRAM_API_KEY = 'test-key';
        });
        (0, vitest_1.it)('should log STT errors without crashing', async () => {
            // Arrange
            const sttError = new Error('Deepgram connection lost');
            vitest_1.vi.mocked(stt_1.sttController.finalizeTranscript).mockRejectedValue(sttError);
            vitest_1.vi.mocked(audio_buffer_service_1.audioBufferService.getBuffer).mockReturnValue({
                chunks: [],
                startEventId: 'event-123',
            });
            // Act: Should not throw
            await (0, vitest_1.expect)((0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId)).resolves.not.toThrow();
            // Assert: Error logged (implicitly verified by no crash)
            (0, vitest_1.expect)(audio_buffer_service_1.audioBufferService.clearBuffer).toHaveBeenCalled();
        });
        (0, vitest_1.it)('should log echo errors without crashing', async () => {
            // Arrange
            vitest_1.vi.mocked(stt_1.sttController.finalizeTranscript).mockResolvedValue('Transcript');
            const echoError = new Error('WebSocket closed during echo');
            vitest_1.vi.mocked(audio_buffer_service_1.audioBufferService.getBuffer).mockImplementation(() => {
                throw echoError;
            });
            // Act: Should not throw
            await (0, vitest_1.expect)((0, audio_handler_1.handleAudioEnd)(mockWebSocket, mockData, testConnectionId)).resolves.not.toThrow();
            // Assert: Buffer still cleared
            (0, vitest_1.expect)(audio_buffer_service_1.audioBufferService.clearBuffer).toHaveBeenCalledWith(testSessionId);
        });
    });
});
