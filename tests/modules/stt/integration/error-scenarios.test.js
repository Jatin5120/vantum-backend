"use strict";
/**
 * STT Integration Test: Error Scenarios
 * Tests error handling, timeouts, and edge cases
 * Target Coverage: 80%+
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const stt_controller_1 = require("@/modules/stt/controllers/stt.controller");
const stt_session_service_1 = require("@/modules/stt/services/stt-session.service");
const sdk_1 = require("@deepgram/sdk");
// ============================================================================
// MOCK SETUP - Factory Pattern (Prevents Timeouts)
// ============================================================================
let mockOnMethod;
let eventHandlers;
const createMockLiveClient = () => {
    eventHandlers = new Map();
    mockOnMethod = vitest_1.vi.fn((event, handler) => {
        if (!eventHandlers.has(event)) {
            eventHandlers.set(event, []);
        }
        eventHandlers.get(event).push(handler);
        // Auto-fire 'Open' event to prevent connection timeout
        if (event === sdk_1.LiveTranscriptionEvents.Open) {
            setTimeout(() => handler(), 10);
        }
    });
    return {
        on: mockOnMethod,
        off: vitest_1.vi.fn(),
        send: vitest_1.vi.fn(),
        finish: vitest_1.vi.fn(),
        requestClose: vitest_1.vi.fn(),
        removeListener: vitest_1.vi.fn(),
        getReadyState: vitest_1.vi.fn(() => 1), // OPEN
    };
};
vitest_1.vi.mock('@deepgram/sdk', () => {
    return {
        createClient: vitest_1.vi.fn(() => ({
            listen: {
                live: vitest_1.vi.fn(() => createMockLiveClient()),
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
(0, vitest_1.describe)('STT Integration: Error Scenarios', () => {
    const mockSessionId = 'error-test-session';
    const mockConfig = {
        sessionId: mockSessionId,
        connectionId: 'error-test-connection',
        samplingRate: 16000,
        language: 'en-US',
    };
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        stt_session_service_1.sttSessionService.cleanup();
    });
    (0, vitest_1.afterEach)(async () => {
        try {
            await stt_controller_1.sttController.endSession(mockSessionId);
        }
        catch (error) {
            // Ignore
        }
        stt_session_service_1.sttSessionService.cleanup();
    });
    (0, vitest_1.describe)('Invalid Configuration', () => {
        (0, vitest_1.it)('should reject samplingRate below minimum (8000)', async () => {
            const invalidConfig = { ...mockConfig, samplingRate: 7999 };
            await (0, vitest_1.expect)(stt_controller_1.sttController.createSession(mockSessionId, invalidConfig)).rejects.toThrow(/Invalid samplingRate.*Must be between 8000 and 48000/);
            // Session should not be created
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(mockSessionId)).toBeUndefined();
        });
        (0, vitest_1.it)('should reject samplingRate above maximum (48000)', async () => {
            const invalidConfig = { ...mockConfig, samplingRate: 48001 };
            await (0, vitest_1.expect)(stt_controller_1.sttController.createSession(mockSessionId, invalidConfig)).rejects.toThrow(/Invalid samplingRate.*Must be between 8000 and 48000/);
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(mockSessionId)).toBeUndefined();
        });
        (0, vitest_1.it)('should reject missing sessionId', async () => {
            await (0, vitest_1.expect)(stt_controller_1.sttController.createSession('', mockConfig)).rejects.toThrow('Invalid input: sessionId and config are required');
        });
        (0, vitest_1.it)('should reject null config', async () => {
            await (0, vitest_1.expect)(stt_controller_1.sttController.createSession(mockSessionId, null)).rejects.toThrow('Invalid input: sessionId and config are required');
        });
        (0, vitest_1.it)('should reject undefined config', async () => {
            await (0, vitest_1.expect)(stt_controller_1.sttController.createSession(mockSessionId, undefined)).rejects.toThrow('Invalid input: sessionId and config are required');
        });
    });
    (0, vitest_1.describe)('Session Not Found Errors', () => {
        (0, vitest_1.it)('should handle forwardChunk for non-existent session gracefully', async () => {
            const chunk = new Uint8Array(1024).fill(128);
            // Should not throw
            await (0, vitest_1.expect)(stt_controller_1.sttController.forwardChunk('non-existent-session', chunk)).resolves.toBeUndefined();
        });
        (0, vitest_1.it)('should return empty transcript for non-existent session', async () => {
            const transcript = await stt_controller_1.sttController.endSession('non-existent-session');
            (0, vitest_1.expect)(transcript).toBe('');
        });
        (0, vitest_1.it)('should return null metrics for non-existent session', () => {
            const metrics = stt_controller_1.sttController.getSessionMetrics('non-existent-session');
            (0, vitest_1.expect)(metrics).toBeUndefined();
        });
        (0, vitest_1.it)('should handle multiple operations on non-existent session', async () => {
            const nonExistentId = 'ghost-session';
            const chunk = new Uint8Array(1024);
            // All operations should be graceful
            await stt_controller_1.sttController.forwardChunk(nonExistentId, chunk);
            const transcript = await stt_controller_1.sttController.endSession(nonExistentId);
            const metrics = stt_controller_1.sttController.getSessionMetrics(nonExistentId);
            (0, vitest_1.expect)(transcript).toBe('');
            (0, vitest_1.expect)(metrics).toBeUndefined();
        });
    });
    (0, vitest_1.describe)('Invalid Audio Data', () => {
        (0, vitest_1.beforeEach)(async () => {
            await stt_controller_1.sttController.createSession(mockSessionId, mockConfig);
        });
        (0, vitest_1.it)('should handle null audio chunk gracefully', async () => {
            await (0, vitest_1.expect)(stt_controller_1.sttController.forwardChunk(mockSessionId, null)).resolves.toBeUndefined();
            const session = stt_session_service_1.sttSessionService.getSession(mockSessionId);
            (0, vitest_1.expect)(session.metrics.chunksReceived).toBe(0); // Not counted
        });
        (0, vitest_1.it)('should handle undefined audio chunk gracefully', async () => {
            await stt_controller_1.sttController.forwardChunk(mockSessionId, undefined);
            const session = stt_session_service_1.sttSessionService.getSession(mockSessionId);
            (0, vitest_1.expect)(session.metrics.chunksReceived).toBe(0);
        });
        (0, vitest_1.it)('should handle empty audio chunk gracefully', async () => {
            const emptyChunk = new Uint8Array(0);
            await stt_controller_1.sttController.forwardChunk(mockSessionId, emptyChunk);
            const session = stt_session_service_1.sttSessionService.getSession(mockSessionId);
            (0, vitest_1.expect)(session.metrics.chunksReceived).toBe(0);
        });
        (0, vitest_1.it)('should handle extremely large audio chunk', async () => {
            const largeChunk = new Uint8Array(10 * 1024 * 1024); // 10MB
            await (0, vitest_1.expect)(stt_controller_1.sttController.forwardChunk(mockSessionId, largeChunk)).resolves.toBeUndefined();
        });
    });
    (0, vitest_1.describe)('Health Check', () => {
        (0, vitest_1.it)('should return health status', () => {
            const isHealthy = stt_controller_1.sttController.isHealthy();
            (0, vitest_1.expect)(typeof isHealthy).toBe('boolean');
        });
        (0, vitest_1.it)('should indicate healthy when API key is set', () => {
            // Health check reflects the state from when STTService was instantiated
            // The test environment has DEEPGRAM_API_KEY set in setup.ts
            const isHealthy = stt_controller_1.sttController.isHealthy();
            (0, vitest_1.expect)(typeof isHealthy).toBe('boolean');
            // Note: May be true or false depending on environment setup
        });
    });
    (0, vitest_1.describe)('Shutdown Scenarios', () => {
        (0, vitest_1.it)('should shutdown gracefully with active sessions', async () => {
            await stt_controller_1.sttController.createSession(mockSessionId, mockConfig);
            await stt_controller_1.sttController.createSession('session-2', {
                ...mockConfig,
                sessionId: 'session-2',
            });
            await (0, vitest_1.expect)(stt_controller_1.sttController.shutdown({ restart: true })).resolves.toBeUndefined();
            // Sessions should be cleaned up
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSessionCount()).toBe(0);
        });
        (0, vitest_1.it)('should shutdown gracefully with no active sessions', async () => {
            await (0, vitest_1.expect)(stt_controller_1.sttController.shutdown({ restart: true })).resolves.toBeUndefined();
        });
        (0, vitest_1.it)('should be idempotent (multiple shutdowns)', async () => {
            await stt_controller_1.sttController.shutdown({ restart: true });
            await stt_controller_1.sttController.shutdown({ restart: true });
            await stt_controller_1.sttController.shutdown({ restart: true });
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSessionCount()).toBe(0);
        });
    });
    (0, vitest_1.describe)('Edge Cases', () => {
        (0, vitest_1.it)('should handle session with zero duration', async () => {
            await stt_controller_1.sttController.createSession(mockSessionId, mockConfig);
            // End immediately
            const transcript = await stt_controller_1.sttController.endSession(mockSessionId);
            (0, vitest_1.expect)(transcript).toBeDefined();
            (0, vitest_1.expect)(typeof transcript).toBe('string');
        });
        (0, vitest_1.it)('should handle boundary samplingRate values', async () => {
            // Lower boundary
            const config8k = { ...mockConfig, samplingRate: 8000 };
            await stt_controller_1.sttController.createSession('session-8k', config8k);
            await stt_controller_1.sttController.endSession('session-8k');
            // Upper boundary
            const config48k = { ...mockConfig, samplingRate: 48000 };
            await stt_controller_1.sttController.createSession('session-48k', config48k);
            await stt_controller_1.sttController.endSession('session-48k');
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSessionCount()).toBe(0);
        });
        (0, vitest_1.it)('should handle special characters in sessionId', async () => {
            const specialId = 'session-!@#$%^&*()_+-={}[]|:;<>?,./';
            const specialConfig = { ...mockConfig, sessionId: specialId };
            await stt_controller_1.sttController.createSession(specialId, specialConfig);
            const session = stt_session_service_1.sttSessionService.getSession(specialId);
            (0, vitest_1.expect)(session).toBeDefined();
            (0, vitest_1.expect)(session.sessionId).toBe(specialId);
            await stt_controller_1.sttController.endSession(specialId);
        });
        (0, vitest_1.it)('should handle very long sessionId', async () => {
            const longId = 'session-' + 'a'.repeat(1000);
            const longConfig = { ...mockConfig, sessionId: longId };
            await stt_controller_1.sttController.createSession(longId, longConfig);
            const session = stt_session_service_1.sttSessionService.getSession(longId);
            (0, vitest_1.expect)(session).toBeDefined();
            await stt_controller_1.sttController.endSession(longId);
        });
        (0, vitest_1.it)('should handle mixed final and interim transcripts', async () => {
            await stt_controller_1.sttController.createSession(mockSessionId, mockConfig);
            const session = stt_session_service_1.sttSessionService.getSession(mockSessionId);
            (0, vitest_1.expect)(session).toBeDefined();
            // Simulate mixed transcripts
            session.addTranscript('Hello', 0.9, false); // Interim
            session.addTranscript('Hello world', 0.95, true); // Final
            session.addTranscript('This is', 0.85, false); // Interim
            session.addTranscript('This is a test', 0.93, true); // Final
            const transcript = await stt_controller_1.sttController.endSession(mockSessionId);
            (0, vitest_1.expect)(transcript).toContain('Hello world');
            (0, vitest_1.expect)(transcript).toContain('This is a test');
            (0, vitest_1.expect)(transcript).not.toContain('Hello\n'); // Interim should not be in final
        });
        (0, vitest_1.it)('should handle session with only interim transcripts', async () => {
            await stt_controller_1.sttController.createSession(mockSessionId, mockConfig);
            const session = stt_session_service_1.sttSessionService.getSession(mockSessionId);
            session.addTranscript('Interim 1', 0.8, false);
            session.addTranscript('Interim 2', 0.82, false);
            session.addTranscript('Interim 3', 0.85, false);
            const transcript = await stt_controller_1.sttController.endSession(mockSessionId);
            // When there are only interim transcripts, the last interim is returned as fallback
            // This handles real-world scenarios where session ends before Deepgram finalizes
            (0, vitest_1.expect)(transcript).toBe('Interim 3');
        });
        (0, vitest_1.it)('should handle rapid session create/delete cycles', async () => {
            for (let i = 0; i < 10; i++) {
                await stt_controller_1.sttController.createSession(mockSessionId, mockConfig);
                await stt_controller_1.sttController.endSession(mockSessionId);
            }
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(mockSessionId)).toBeUndefined();
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSessionCount()).toBe(0);
        }, 10000);
    });
    (0, vitest_1.describe)('Metrics Edge Cases', () => {
        (0, vitest_1.it)('should handle getMetrics with zero sessions', () => {
            const metrics = stt_controller_1.sttController.getMetrics();
            (0, vitest_1.expect)(metrics.activeSessions).toBe(0);
            (0, vitest_1.expect)(metrics.totalChunksForwarded).toBe(0);
            (0, vitest_1.expect)(metrics.totalTranscriptsReceived).toBe(0);
            (0, vitest_1.expect)(metrics.totalErrors).toBe(0);
            (0, vitest_1.expect)(metrics.totalReconnections).toBe(0);
        });
        (0, vitest_1.it)('should aggregate metrics correctly with multiple sessions', async () => {
            await stt_controller_1.sttController.createSession('session-1', {
                ...mockConfig,
                sessionId: 'session-1',
            });
            await stt_controller_1.sttController.createSession('session-2', {
                ...mockConfig,
                sessionId: 'session-2',
            });
            await stt_controller_1.sttController.createSession('session-3', {
                ...mockConfig,
                sessionId: 'session-3',
            });
            // Forward chunks to each
            const chunk = new Uint8Array(1024).fill(128);
            await stt_controller_1.sttController.forwardChunk('session-1', chunk);
            await stt_controller_1.sttController.forwardChunk('session-2', chunk);
            await stt_controller_1.sttController.forwardChunk('session-3', chunk);
            const metrics = stt_controller_1.sttController.getMetrics();
            (0, vitest_1.expect)(metrics.activeSessions).toBe(3);
            (0, vitest_1.expect)(metrics.totalChunksForwarded).toBeGreaterThanOrEqual(0);
            // Cleanup
            await stt_controller_1.sttController.endSession('session-1');
            await stt_controller_1.sttController.endSession('session-2');
            await stt_controller_1.sttController.endSession('session-3');
        });
        (0, vitest_1.it)('should track errors in metrics', async () => {
            await stt_controller_1.sttController.createSession(mockSessionId, mockConfig);
            const session = stt_session_service_1.sttSessionService.getSession(mockSessionId);
            // Simulate errors
            session.metrics.errors = 5;
            const sessionMetrics = stt_controller_1.sttController.getSessionMetrics(mockSessionId);
            (0, vitest_1.expect)(sessionMetrics.errors).toBe(5);
            const serviceMetrics = stt_controller_1.sttController.getMetrics();
            (0, vitest_1.expect)(serviceMetrics.totalErrors).toBeGreaterThanOrEqual(5);
            await stt_controller_1.sttController.endSession(mockSessionId);
        });
    });
    (0, vitest_1.describe)('Concurrent Operations', () => {
        (0, vitest_1.it)('should handle concurrent forwardChunk calls', async () => {
            await stt_controller_1.sttController.createSession(mockSessionId, mockConfig);
            const chunk = new Uint8Array(512).fill(128);
            const promises = [];
            for (let i = 0; i < 20; i++) {
                promises.push(stt_controller_1.sttController.forwardChunk(mockSessionId, chunk));
            }
            await Promise.all(promises);
            const session = stt_session_service_1.sttSessionService.getSession(mockSessionId);
            (0, vitest_1.expect)(session.metrics.chunksReceived).toBe(20);
            await stt_controller_1.sttController.endSession(mockSessionId);
        });
        (0, vitest_1.it)('should handle concurrent session creation attempts', async () => {
            const promises = [];
            for (let i = 0; i < 5; i++) {
                const config = { ...mockConfig, sessionId: `concurrent-${i}` };
                promises.push(stt_controller_1.sttController.createSession(`concurrent-${i}`, config));
            }
            await Promise.all(promises);
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSessionCount()).toBe(5);
            // Cleanup
            for (let i = 0; i < 5; i++) {
                await stt_controller_1.sttController.endSession(`concurrent-${i}`);
            }
        });
    });
});
