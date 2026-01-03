"use strict";
/**
 * STTController Unit Tests
 * Tests the public API gateway for STT module
 * Target Coverage: 90%+
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const stt_controller_1 = require("@/modules/stt/controllers/stt.controller");
const stt_service_1 = require("@/modules/stt/services/stt.service");
// Mock the STT service
vitest_1.vi.mock('@/modules/stt/services/stt.service', () => ({
    sttService: {
        createSession: vitest_1.vi.fn(),
        forwardAudioChunk: vitest_1.vi.fn(),
        endSession: vitest_1.vi.fn(),
        getMetrics: vitest_1.vi.fn(),
        getSessionMetrics: vitest_1.vi.fn(),
        isHealthy: vitest_1.vi.fn(),
        shutdown: vitest_1.vi.fn(),
    },
}));
(0, vitest_1.describe)('STTController', () => {
    const mockSessionId = 'test-session-123';
    const mockConfig = {
        sessionId: mockSessionId,
        connectionId: 'test-connection-456',
        samplingRate: 16000,
        language: 'en-US',
    };
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.resetAllMocks();
    });
    (0, vitest_1.describe)('createSession', () => {
        (0, vitest_1.it)('should create STT session with valid config', async () => {
            vitest_1.vi.mocked(stt_service_1.sttService.createSession).mockResolvedValue(undefined);
            await (0, vitest_1.expect)(stt_controller_1.sttController.createSession(mockSessionId, mockConfig)).resolves.toBeUndefined();
            (0, vitest_1.expect)(stt_service_1.sttService.createSession).toHaveBeenCalledWith(mockSessionId, mockConfig);
            (0, vitest_1.expect)(stt_service_1.sttService.createSession).toHaveBeenCalledTimes(1);
        });
        (0, vitest_1.it)('should throw error when sessionId is missing', async () => {
            await (0, vitest_1.expect)(stt_controller_1.sttController.createSession('', mockConfig)).rejects.toThrow('Invalid input: sessionId and config are required');
            (0, vitest_1.expect)(stt_service_1.sttService.createSession).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('should throw error when config is missing', async () => {
            await (0, vitest_1.expect)(stt_controller_1.sttController.createSession(mockSessionId, null)).rejects.toThrow('Invalid input: sessionId and config are required');
            (0, vitest_1.expect)(stt_service_1.sttService.createSession).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('should throw error when samplingRate is too low', async () => {
            const invalidConfig = { ...mockConfig, samplingRate: 7999 };
            await (0, vitest_1.expect)(stt_controller_1.sttController.createSession(mockSessionId, invalidConfig)).rejects.toThrow('Invalid samplingRate: 7999. Must be between 8000 and 48000 Hz');
            (0, vitest_1.expect)(stt_service_1.sttService.createSession).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('should throw error when samplingRate is too high', async () => {
            const invalidConfig = { ...mockConfig, samplingRate: 48001 };
            await (0, vitest_1.expect)(stt_controller_1.sttController.createSession(mockSessionId, invalidConfig)).rejects.toThrow('Invalid samplingRate: 48001. Must be between 8000 and 48000 Hz');
            (0, vitest_1.expect)(stt_service_1.sttService.createSession).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('should accept samplingRate at lower boundary (8000)', async () => {
            vitest_1.vi.mocked(stt_service_1.sttService.createSession).mockResolvedValue(undefined);
            const validConfig = { ...mockConfig, samplingRate: 8000 };
            await (0, vitest_1.expect)(stt_controller_1.sttController.createSession(mockSessionId, validConfig)).resolves.toBeUndefined();
            (0, vitest_1.expect)(stt_service_1.sttService.createSession).toHaveBeenCalledWith(mockSessionId, validConfig);
        });
        (0, vitest_1.it)('should accept samplingRate at upper boundary (48000)', async () => {
            vitest_1.vi.mocked(stt_service_1.sttService.createSession).mockResolvedValue(undefined);
            const validConfig = { ...mockConfig, samplingRate: 48000 };
            await (0, vitest_1.expect)(stt_controller_1.sttController.createSession(mockSessionId, validConfig)).resolves.toBeUndefined();
            (0, vitest_1.expect)(stt_service_1.sttService.createSession).toHaveBeenCalledWith(mockSessionId, validConfig);
        });
        (0, vitest_1.it)('should propagate service errors to caller', async () => {
            const serviceError = new Error('Deepgram connection failed');
            vitest_1.vi.mocked(stt_service_1.sttService.createSession).mockRejectedValue(serviceError);
            await (0, vitest_1.expect)(stt_controller_1.sttController.createSession(mockSessionId, mockConfig)).rejects.toThrow('Deepgram connection failed');
            (0, vitest_1.expect)(stt_service_1.sttService.createSession).toHaveBeenCalledWith(mockSessionId, mockConfig);
        });
    });
    (0, vitest_1.describe)('forwardChunk', () => {
        (0, vitest_1.it)('should forward audio chunk to service', async () => {
            const mockChunk = new Uint8Array([1, 2, 3, 4, 5]);
            vitest_1.vi.mocked(stt_service_1.sttService.forwardAudioChunk).mockResolvedValue(undefined);
            await (0, vitest_1.expect)(stt_controller_1.sttController.forwardChunk(mockSessionId, mockChunk)).resolves.toBeUndefined();
            (0, vitest_1.expect)(stt_service_1.sttService.forwardAudioChunk).toHaveBeenCalledWith(mockSessionId, mockChunk);
            (0, vitest_1.expect)(stt_service_1.sttService.forwardAudioChunk).toHaveBeenCalledTimes(1);
        });
        (0, vitest_1.it)('should not call service when sessionId is missing', async () => {
            const mockChunk = new Uint8Array([1, 2, 3]);
            await stt_controller_1.sttController.forwardChunk('', mockChunk);
            (0, vitest_1.expect)(stt_service_1.sttService.forwardAudioChunk).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('should not call service when audioChunk is null', async () => {
            await stt_controller_1.sttController.forwardChunk(mockSessionId, null);
            (0, vitest_1.expect)(stt_service_1.sttService.forwardAudioChunk).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('should not call service when audioChunk is empty', async () => {
            const emptyChunk = new Uint8Array([]);
            await stt_controller_1.sttController.forwardChunk(mockSessionId, emptyChunk);
            (0, vitest_1.expect)(stt_service_1.sttService.forwardAudioChunk).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('should handle service errors gracefully (non-blocking)', async () => {
            const mockChunk = new Uint8Array([1, 2, 3]);
            vitest_1.vi.mocked(stt_service_1.sttService.forwardAudioChunk).mockRejectedValue(new Error('Network error'));
            // Should not throw
            await (0, vitest_1.expect)(stt_controller_1.sttController.forwardChunk(mockSessionId, mockChunk)).rejects.toThrow('Network error');
            (0, vitest_1.expect)(stt_service_1.sttService.forwardAudioChunk).toHaveBeenCalled();
        });
        (0, vitest_1.it)('should handle large audio chunks', async () => {
            const largeChunk = new Uint8Array(65536); // 64KB chunk
            vitest_1.vi.mocked(stt_service_1.sttService.forwardAudioChunk).mockResolvedValue(undefined);
            await stt_controller_1.sttController.forwardChunk(mockSessionId, largeChunk);
            (0, vitest_1.expect)(stt_service_1.sttService.forwardAudioChunk).toHaveBeenCalledWith(mockSessionId, largeChunk);
        });
    });
    (0, vitest_1.describe)('endSession', () => {
        (0, vitest_1.it)('should end session and return final transcript', async () => {
            const mockTranscript = 'Hello world, this is a test transcript';
            vitest_1.vi.mocked(stt_service_1.sttService.endSession).mockResolvedValue(mockTranscript);
            const result = await stt_controller_1.sttController.endSession(mockSessionId);
            (0, vitest_1.expect)(result).toBe(mockTranscript);
            (0, vitest_1.expect)(stt_service_1.sttService.endSession).toHaveBeenCalledWith(mockSessionId);
            (0, vitest_1.expect)(stt_service_1.sttService.endSession).toHaveBeenCalledTimes(1);
        });
        (0, vitest_1.it)('should return empty string when session not found', async () => {
            vitest_1.vi.mocked(stt_service_1.sttService.endSession).mockResolvedValue('');
            const result = await stt_controller_1.sttController.endSession('non-existent-session');
            (0, vitest_1.expect)(result).toBe('');
            (0, vitest_1.expect)(stt_service_1.sttService.endSession).toHaveBeenCalledWith('non-existent-session');
        });
        (0, vitest_1.it)('should return empty string on service error (graceful degradation)', async () => {
            vitest_1.vi.mocked(stt_service_1.sttService.endSession).mockRejectedValue(new Error('Service error'));
            const result = await stt_controller_1.sttController.endSession(mockSessionId);
            (0, vitest_1.expect)(result).toBe('');
            (0, vitest_1.expect)(stt_service_1.sttService.endSession).toHaveBeenCalledWith(mockSessionId);
        });
        (0, vitest_1.it)('should handle empty transcript from service', async () => {
            vitest_1.vi.mocked(stt_service_1.sttService.endSession).mockResolvedValue('');
            const result = await stt_controller_1.sttController.endSession(mockSessionId);
            (0, vitest_1.expect)(result).toBe('');
        });
        (0, vitest_1.it)('should handle long transcripts', async () => {
            const longTranscript = 'word '.repeat(5000); // ~25KB transcript
            vitest_1.vi.mocked(stt_service_1.sttService.endSession).mockResolvedValue(longTranscript);
            const result = await stt_controller_1.sttController.endSession(mockSessionId);
            (0, vitest_1.expect)(result).toBe(longTranscript);
            (0, vitest_1.expect)(result.length).toBeGreaterThanOrEqual(25000);
        });
    });
    (0, vitest_1.describe)('getMetrics', () => {
        (0, vitest_1.it)('should return service-level metrics', () => {
            const mockMetrics = {
                activeSessions: 3,
                totalChunksForwarded: 1500,
                totalTranscriptsReceived: 45,
                totalErrors: 2,
                totalReconnections: 1,
            };
            vitest_1.vi.mocked(stt_service_1.sttService.getMetrics).mockReturnValue(mockMetrics);
            const result = stt_controller_1.sttController.getMetrics();
            (0, vitest_1.expect)(result).toEqual(mockMetrics);
            (0, vitest_1.expect)(stt_service_1.sttService.getMetrics).toHaveBeenCalledTimes(1);
        });
        (0, vitest_1.it)('should return zero metrics when no sessions active', () => {
            const emptyMetrics = {
                activeSessions: 0,
                totalChunksForwarded: 0,
                totalTranscriptsReceived: 0,
                totalErrors: 0,
                totalReconnections: 0,
            };
            vitest_1.vi.mocked(stt_service_1.sttService.getMetrics).mockReturnValue(emptyMetrics);
            const result = stt_controller_1.sttController.getMetrics();
            (0, vitest_1.expect)(result).toEqual(emptyMetrics);
            (0, vitest_1.expect)(result.activeSessions).toBe(0);
        });
        (0, vitest_1.it)('should handle metrics with high numbers', () => {
            const highMetrics = {
                activeSessions: 100,
                totalChunksForwarded: 1000000,
                totalTranscriptsReceived: 50000,
                totalErrors: 150,
                totalReconnections: 25,
            };
            vitest_1.vi.mocked(stt_service_1.sttService.getMetrics).mockReturnValue(highMetrics);
            const result = stt_controller_1.sttController.getMetrics();
            (0, vitest_1.expect)(result).toEqual(highMetrics);
        });
    });
    (0, vitest_1.describe)('getSessionMetrics', () => {
        (0, vitest_1.it)('should return session-specific metrics when session exists', () => {
            const mockSessionMetrics = {
                sessionId: mockSessionId,
                duration: 45000,
                chunksForwarded: 500,
                transcriptsReceived: 15,
                reconnections: 0,
                errors: 1,
                finalTranscriptLength: 256,
                connectionState: 'connected',
            };
            vitest_1.vi.mocked(stt_service_1.sttService.getSessionMetrics).mockReturnValue(mockSessionMetrics);
            const result = stt_controller_1.sttController.getSessionMetrics(mockSessionId);
            (0, vitest_1.expect)(result).toEqual(mockSessionMetrics);
            (0, vitest_1.expect)(stt_service_1.sttService.getSessionMetrics).toHaveBeenCalledWith(mockSessionId);
        });
        (0, vitest_1.it)('should return undefined when session not found', () => {
            vitest_1.vi.mocked(stt_service_1.sttService.getSessionMetrics).mockReturnValue(undefined);
            const result = stt_controller_1.sttController.getSessionMetrics('non-existent-session');
            (0, vitest_1.expect)(result).toBeUndefined();
            (0, vitest_1.expect)(stt_service_1.sttService.getSessionMetrics).toHaveBeenCalledWith('non-existent-session');
        });
        (0, vitest_1.it)('should return metrics for session with errors', () => {
            const errorMetrics = {
                sessionId: mockSessionId,
                duration: 10000,
                chunksForwarded: 100,
                transcriptsReceived: 5,
                reconnections: 3,
                errors: 25,
                finalTranscriptLength: 50,
                connectionState: 'error',
            };
            vitest_1.vi.mocked(stt_service_1.sttService.getSessionMetrics).mockReturnValue(errorMetrics);
            const result = stt_controller_1.sttController.getSessionMetrics(mockSessionId);
            (0, vitest_1.expect)(result).toEqual(errorMetrics);
            (0, vitest_1.expect)(result?.errors).toBe(25);
            (0, vitest_1.expect)(result?.connectionState).toBe('error');
        });
        (0, vitest_1.it)('should return metrics for disconnected session', () => {
            const disconnectedMetrics = {
                sessionId: mockSessionId,
                duration: 30000,
                chunksForwarded: 300,
                transcriptsReceived: 10,
                reconnections: 0,
                errors: 0,
                finalTranscriptLength: 150,
                connectionState: 'disconnected',
            };
            vitest_1.vi.mocked(stt_service_1.sttService.getSessionMetrics).mockReturnValue(disconnectedMetrics);
            const result = stt_controller_1.sttController.getSessionMetrics(mockSessionId);
            (0, vitest_1.expect)(result?.connectionState).toBe('disconnected');
        });
    });
    (0, vitest_1.describe)('isHealthy', () => {
        (0, vitest_1.it)('should return true when service is healthy', () => {
            vitest_1.vi.mocked(stt_service_1.sttService.isHealthy).mockReturnValue(true);
            const result = stt_controller_1.sttController.isHealthy();
            (0, vitest_1.expect)(result).toBe(true);
            (0, vitest_1.expect)(stt_service_1.sttService.isHealthy).toHaveBeenCalledTimes(1);
        });
        (0, vitest_1.it)('should return false when service is unhealthy', () => {
            vitest_1.vi.mocked(stt_service_1.sttService.isHealthy).mockReturnValue(false);
            const result = stt_controller_1.sttController.isHealthy();
            (0, vitest_1.expect)(result).toBe(false);
            (0, vitest_1.expect)(stt_service_1.sttService.isHealthy).toHaveBeenCalledTimes(1);
        });
        (0, vitest_1.it)('should be callable multiple times', () => {
            vitest_1.vi.mocked(stt_service_1.sttService.isHealthy).mockReturnValue(true);
            const result1 = stt_controller_1.sttController.isHealthy();
            const result2 = stt_controller_1.sttController.isHealthy();
            const result3 = stt_controller_1.sttController.isHealthy();
            (0, vitest_1.expect)(result1).toBe(true);
            (0, vitest_1.expect)(result2).toBe(true);
            (0, vitest_1.expect)(result3).toBe(true);
            (0, vitest_1.expect)(stt_service_1.sttService.isHealthy).toHaveBeenCalledTimes(3);
        });
    });
    (0, vitest_1.describe)('shutdown', () => {
        (0, vitest_1.it)('should shutdown service gracefully with restart option', async () => {
            vitest_1.vi.mocked(stt_service_1.sttService.shutdown).mockResolvedValue(undefined);
            await (0, vitest_1.expect)(stt_controller_1.sttController.shutdown({ restart: true })).resolves.toBeUndefined();
            (0, vitest_1.expect)(stt_service_1.sttService.shutdown).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(stt_service_1.sttService.shutdown).toHaveBeenCalledWith({ restart: true });
        });
        (0, vitest_1.it)('should shutdown service gracefully in production mode', async () => {
            vitest_1.vi.mocked(stt_service_1.sttService.shutdown).mockResolvedValue(undefined);
            await (0, vitest_1.expect)(stt_controller_1.sttController.shutdown()).resolves.toBeUndefined();
            (0, vitest_1.expect)(stt_service_1.sttService.shutdown).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(stt_service_1.sttService.shutdown).toHaveBeenCalledWith(undefined);
        });
        (0, vitest_1.it)('should handle shutdown errors', async () => {
            const shutdownError = new Error('Shutdown error');
            vitest_1.vi.mocked(stt_service_1.sttService.shutdown).mockRejectedValue(shutdownError);
            await (0, vitest_1.expect)(stt_controller_1.sttController.shutdown({ restart: true })).rejects.toThrow('Shutdown error');
            (0, vitest_1.expect)(stt_service_1.sttService.shutdown).toHaveBeenCalledTimes(1);
        });
        (0, vitest_1.it)('should be idempotent (callable multiple times)', async () => {
            vitest_1.vi.mocked(stt_service_1.sttService.shutdown).mockResolvedValue(undefined);
            await stt_controller_1.sttController.shutdown({ restart: true });
            await stt_controller_1.sttController.shutdown({ restart: true });
            await stt_controller_1.sttController.shutdown({ restart: true });
            (0, vitest_1.expect)(stt_service_1.sttService.shutdown).toHaveBeenCalledTimes(3);
        });
    });
    (0, vitest_1.describe)('Integration: Complete session lifecycle', () => {
        (0, vitest_1.it)('should handle complete lifecycle: create → forward → end', async () => {
            const mockChunk = new Uint8Array([1, 2, 3]);
            const mockTranscript = 'Complete transcript';
            vitest_1.vi.mocked(stt_service_1.sttService.createSession).mockResolvedValue(undefined);
            vitest_1.vi.mocked(stt_service_1.sttService.forwardAudioChunk).mockResolvedValue(undefined);
            vitest_1.vi.mocked(stt_service_1.sttService.endSession).mockResolvedValue(mockTranscript);
            // Create session
            await stt_controller_1.sttController.createSession(mockSessionId, mockConfig);
            (0, vitest_1.expect)(stt_service_1.sttService.createSession).toHaveBeenCalled();
            // Forward chunks
            await stt_controller_1.sttController.forwardChunk(mockSessionId, mockChunk);
            await stt_controller_1.sttController.forwardChunk(mockSessionId, mockChunk);
            (0, vitest_1.expect)(stt_service_1.sttService.forwardAudioChunk).toHaveBeenCalledTimes(2);
            // End session
            const transcript = await stt_controller_1.sttController.endSession(mockSessionId);
            (0, vitest_1.expect)(transcript).toBe(mockTranscript);
            (0, vitest_1.expect)(stt_service_1.sttService.endSession).toHaveBeenCalled();
        });
    });
});
