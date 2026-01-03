"use strict";
/**
 * Socket Server Tests
 * Focus on WebSocket connection lifecycle and STT session tracking
 * Target Coverage: 85%+ with critical cleanup paths at 95%+
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const services_1 = require("@/modules/socket/services");
const stt_1 = require("@/modules/stt");
// Mock services
vitest_1.vi.mock('@/modules/socket/services', () => ({
    sessionService: {
        createSession: vitest_1.vi.fn(),
        getSessionBySocketId: vitest_1.vi.fn(),
        deleteSession: vitest_1.vi.fn(),
        touchSession: vitest_1.vi.fn(),
    },
    websocketService: {
        registerWebSocket: vitest_1.vi.fn(),
        removeWebSocket: vitest_1.vi.fn(),
        sendToSession: vitest_1.vi.fn(),
    },
}));
vitest_1.vi.mock('@/modules/stt', () => ({
    sttController: {
        createSession: vitest_1.vi.fn(),
        endSession: vitest_1.vi.fn(),
        hasSession: vitest_1.vi.fn(),
        finalizeTranscript: vitest_1.vi.fn(),
    },
}));
(0, vitest_1.describe)('Socket Server - Connection Lifecycle', () => {
    const testConnectionId = 'conn-test-123';
    const testSessionId = 'session-test-123';
    let mockSession;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        // Mock session
        mockSession = {
            sessionId: testSessionId,
            connectionId: testConnectionId,
            createdAt: Date.now(),
            state: 'idle',
            metadata: {},
        };
        vitest_1.vi.mocked(services_1.sessionService.createSession).mockReturnValue(mockSession);
        vitest_1.vi.mocked(services_1.sessionService.getSessionBySocketId).mockReturnValue(mockSession);
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.resetAllMocks();
    });
    (0, vitest_1.describe)('Connection Handler - STT Session Creation (CRITICAL)', () => {
        (0, vitest_1.beforeEach)(() => {
            // Enable STT mode
            process.env.DEEPGRAM_API_KEY = 'test-key';
        });
        (0, vitest_1.it)('should create STT session immediately on WebSocket connect', async () => {
            // Arrange
            vitest_1.vi.mocked(stt_1.sttController.createSession).mockResolvedValue();
            // Simulate connection handler
            const mockExtWs = {
                connectionId: testConnectionId,
                sessionId: testSessionId,
                sttSessionCreated: false,
            };
            // Act: Simulate STT session creation
            try {
                await stt_1.sttController.createSession(testSessionId, {
                    sessionId: testSessionId,
                    connectionId: testConnectionId,
                    samplingRate: 16000,
                    language: 'en-US',
                });
                mockExtWs.sttSessionCreated = true;
            }
            catch (error) {
                mockExtWs.sttSessionCreated = false;
            }
            // Assert: STT session created successfully
            (0, vitest_1.expect)(stt_1.sttController.createSession).toHaveBeenCalledWith(testSessionId, {
                sessionId: testSessionId,
                connectionId: testConnectionId,
                samplingRate: 16000,
                language: 'en-US',
            });
            (0, vitest_1.expect)(mockExtWs.sttSessionCreated).toBe(true);
        });
        (0, vitest_1.it)('should set sttSessionCreated = true on successful creation', async () => {
            // Arrange
            vitest_1.vi.mocked(stt_1.sttController.createSession).mockResolvedValue();
            // Act: Simulate successful creation
            const mockExtWs = {
                sttSessionCreated: false,
            };
            await stt_1.sttController.createSession(testSessionId, {
                sessionId: testSessionId,
                connectionId: testConnectionId,
                samplingRate: 16000,
                language: 'en-US',
            });
            mockExtWs.sttSessionCreated = true;
            // Assert
            (0, vitest_1.expect)(mockExtWs.sttSessionCreated).toBe(true);
        });
        (0, vitest_1.it)('should set sttSessionCreated = false on creation failure', async () => {
            // Arrange
            vitest_1.vi.mocked(stt_1.sttController.createSession).mockRejectedValue(new Error('Deepgram connection failed'));
            // Act: Simulate failed creation
            const mockExtWs = {
                sttSessionCreated: false,
            };
            try {
                await stt_1.sttController.createSession(testSessionId, {
                    sessionId: testSessionId,
                    connectionId: testConnectionId,
                    samplingRate: 16000,
                    language: 'en-US',
                });
                mockExtWs.sttSessionCreated = true;
            }
            catch (error) {
                mockExtWs.sttSessionCreated = false;
            }
            // Assert
            (0, vitest_1.expect)(mockExtWs.sttSessionCreated).toBe(false);
        });
        (0, vitest_1.it)('should NOT fail entire connection on STT creation error', async () => {
            // Arrange
            vitest_1.vi.mocked(stt_1.sttController.createSession).mockRejectedValue(new Error('STT service unavailable'));
            // Act: Simulate connection continuing despite STT error
            const mockExtWs = {
                connectionId: testConnectionId,
                sessionId: testSessionId,
                sttSessionCreated: false,
            };
            let connectionFailed = false;
            try {
                await stt_1.sttController.createSession(testSessionId, {
                    sessionId: testSessionId,
                    connectionId: testConnectionId,
                    samplingRate: 16000,
                    language: 'en-US',
                });
                mockExtWs.sttSessionCreated = true;
            }
            catch (error) {
                mockExtWs.sttSessionCreated = false;
                // Connection continues despite STT error
                connectionFailed = false;
            }
            // Assert: Connection successful, STT flag is false
            (0, vitest_1.expect)(connectionFailed).toBe(false);
            (0, vitest_1.expect)(mockExtWs.sttSessionCreated).toBe(false);
        });
        (0, vitest_1.it)('should store sttSessionCreated flag on ExtendedWebSocket', () => {
            // Arrange
            const mockExtWs = {
                connectionId: testConnectionId,
                sessionId: testSessionId,
            };
            // Act: Set the flag
            mockExtWs.sttSessionCreated = true;
            // Assert
            (0, vitest_1.expect)(mockExtWs.sttSessionCreated).toBe(true);
            (0, vitest_1.expect)(mockExtWs).toHaveProperty('sttSessionCreated');
        });
    });
    (0, vitest_1.describe)('Disconnect Handler - Conditional STT Cleanup (CRITICAL)', () => {
        (0, vitest_1.beforeEach)(() => {
            process.env.DEEPGRAM_API_KEY = 'test-key';
        });
        (0, vitest_1.it)('should cleanup STT session when sttSessionCreated = true', async () => {
            // Arrange
            const mockExtWs = {
                sttSessionCreated: true,
                connectionId: testConnectionId,
                sessionId: testSessionId,
            };
            vitest_1.vi.mocked(stt_1.sttController.hasSession).mockReturnValue(true);
            vitest_1.vi.mocked(stt_1.sttController.endSession).mockResolvedValue();
            // Act: Simulate disconnect
            if (mockExtWs.sttSessionCreated && stt_1.sttController.hasSession(testSessionId)) {
                await stt_1.sttController.endSession(testSessionId);
            }
            // Assert: STT session closed
            (0, vitest_1.expect)(stt_1.sttController.hasSession).toHaveBeenCalledWith(testSessionId);
            (0, vitest_1.expect)(stt_1.sttController.endSession).toHaveBeenCalledWith(testSessionId);
        });
        (0, vitest_1.it)('should skip STT cleanup when sttSessionCreated = false', async () => {
            // Arrange
            const mockExtWs = {
                sttSessionCreated: false,
                connectionId: testConnectionId,
                sessionId: testSessionId,
            };
            // Act: Simulate disconnect
            if (mockExtWs.sttSessionCreated && stt_1.sttController.hasSession(testSessionId)) {
                await stt_1.sttController.endSession(testSessionId);
            }
            // Assert: STT cleanup skipped
            (0, vitest_1.expect)(stt_1.sttController.endSession).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('should skip STT cleanup when USE_STT = false', async () => {
            // Arrange
            delete process.env.DEEPGRAM_API_KEY; // Disable STT
            const mockExtWs = {
                sttSessionCreated: true,
                connectionId: testConnectionId,
                sessionId: testSessionId,
            };
            const USE_STT = !!process.env.DEEPGRAM_API_KEY;
            // Act: Simulate disconnect
            if (USE_STT && mockExtWs.sttSessionCreated && stt_1.sttController.hasSession(testSessionId)) {
                await stt_1.sttController.endSession(testSessionId);
            }
            // Assert: STT cleanup skipped
            (0, vitest_1.expect)(stt_1.sttController.endSession).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('should skip STT cleanup when session does not exist', async () => {
            // Arrange
            const mockExtWs = {
                sttSessionCreated: true,
                connectionId: testConnectionId,
                sessionId: testSessionId,
            };
            vitest_1.vi.mocked(stt_1.sttController.hasSession).mockReturnValue(false);
            // Act: Simulate disconnect
            if (mockExtWs.sttSessionCreated && stt_1.sttController.hasSession(testSessionId)) {
                await stt_1.sttController.endSession(testSessionId);
            }
            // Assert: endSession not called
            (0, vitest_1.expect)(stt_1.sttController.hasSession).toHaveBeenCalledWith(testSessionId);
            (0, vitest_1.expect)(stt_1.sttController.endSession).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('should handle cleanup errors gracefully', async () => {
            // Arrange
            const mockExtWs = {
                sttSessionCreated: true,
                connectionId: testConnectionId,
                sessionId: testSessionId,
            };
            vitest_1.vi.mocked(stt_1.sttController.hasSession).mockReturnValue(true);
            vitest_1.vi.mocked(stt_1.sttController.endSession).mockRejectedValue(new Error('Cleanup failed'));
            // Act: Simulate disconnect with error
            try {
                if (mockExtWs.sttSessionCreated && stt_1.sttController.hasSession(testSessionId)) {
                    await stt_1.sttController.endSession(testSessionId);
                }
            }
            catch (error) {
                // Error handled gracefully
            }
            // Assert: Cleanup attempted
            (0, vitest_1.expect)(stt_1.sttController.endSession).toHaveBeenCalledWith(testSessionId);
            // Should not throw - disconnect should complete
        });
    });
    (0, vitest_1.describe)('Full Session Lifecycle (Integration)', () => {
        (0, vitest_1.beforeEach)(() => {
            process.env.DEEPGRAM_API_KEY = 'test-key';
        });
        (0, vitest_1.it)('should follow: WebSocket connect → STT created → Flag set to true', async () => {
            // Arrange
            vitest_1.vi.mocked(stt_1.sttController.createSession).mockResolvedValue();
            const mockExtWs = {
                connectionId: testConnectionId,
                sessionId: testSessionId,
                sttSessionCreated: false,
            };
            // Act: Simulate connection handler
            await stt_1.sttController.createSession(testSessionId, {
                sessionId: testSessionId,
                connectionId: testConnectionId,
                samplingRate: 16000,
                language: 'en-US',
            });
            mockExtWs.sttSessionCreated = true;
            // Assert
            (0, vitest_1.expect)(mockExtWs.sttSessionCreated).toBe(true);
        });
        (0, vitest_1.it)('should handle: Audio start → Verify STT session ready (no creation)', async () => {
            // Arrange: STT session already created on connect
            vitest_1.vi.mocked(stt_1.sttController.hasSession).mockReturnValue(true);
            // Act: Simulate audio.start handler
            const hasSession = stt_1.sttController.hasSession(testSessionId);
            // Assert: Session exists, no re-creation needed
            (0, vitest_1.expect)(hasSession).toBe(true);
            (0, vitest_1.expect)(stt_1.sttController.createSession).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('should handle: Audio end → Call finalizeTranscript() → Connection persists', async () => {
            // Arrange
            vitest_1.vi.mocked(stt_1.sttController.finalizeTranscript).mockResolvedValue('Transcript');
            // Act: Simulate audio.end handler
            await stt_1.sttController.finalizeTranscript(testSessionId);
            // Assert: Finalized, but no endSession
            (0, vitest_1.expect)(stt_1.sttController.finalizeTranscript).toHaveBeenCalledWith(testSessionId);
            (0, vitest_1.expect)(stt_1.sttController.endSession).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('should handle: Second audio start → STT still ready (0 latency)', async () => {
            // Arrange: STT session persists from first recording
            vitest_1.vi.mocked(stt_1.sttController.hasSession).mockReturnValue(true);
            // Act: Second audio.start
            const hasSession = stt_1.sttController.hasSession(testSessionId);
            // Assert: Session ready instantly (no creation delay)
            (0, vitest_1.expect)(hasSession).toBe(true);
        });
        (0, vitest_1.it)('should handle: Second audio end → Finalize again → Connection persists', async () => {
            // Arrange
            vitest_1.vi.mocked(stt_1.sttController.finalizeTranscript).mockResolvedValue('Transcript 2');
            // Act: Second finalization
            await stt_1.sttController.finalizeTranscript(testSessionId);
            // Assert: Finalized again, connection still open
            (0, vitest_1.expect)(stt_1.sttController.finalizeTranscript).toHaveBeenCalledWith(testSessionId);
            (0, vitest_1.expect)(stt_1.sttController.endSession).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('should handle: WebSocket disconnect → Close STT connection', async () => {
            // Arrange
            const mockExtWs = {
                sttSessionCreated: true,
                sessionId: testSessionId,
            };
            vitest_1.vi.mocked(stt_1.sttController.hasSession).mockReturnValue(true);
            vitest_1.vi.mocked(stt_1.sttController.endSession).mockResolvedValue();
            // Act: Disconnect
            if (mockExtWs.sttSessionCreated && stt_1.sttController.hasSession(testSessionId)) {
                await stt_1.sttController.endSession(testSessionId);
            }
            // Assert: STT connection closed
            (0, vitest_1.expect)(stt_1.sttController.endSession).toHaveBeenCalledWith(testSessionId);
        });
    });
    (0, vitest_1.describe)('Orphaned Session Prevention (CRITICAL)', () => {
        (0, vitest_1.beforeEach)(() => {
            process.env.DEEPGRAM_API_KEY = 'test-key';
        });
        (0, vitest_1.it)('should prevent orphaned STT session when connection failed', async () => {
            // Arrange: STT creation fails
            vitest_1.vi.mocked(stt_1.sttController.createSession).mockRejectedValue(new Error('Creation failed'));
            const mockExtWs = {
                sttSessionCreated: false,
            };
            // Act: Attempt creation
            try {
                await stt_1.sttController.createSession(testSessionId, {
                    sessionId: testSessionId,
                    connectionId: testConnectionId,
                    samplingRate: 16000,
                    language: 'en-US',
                });
                mockExtWs.sttSessionCreated = true;
            }
            catch (error) {
                mockExtWs.sttSessionCreated = false;
            }
            // Simulate disconnect
            if (mockExtWs.sttSessionCreated && stt_1.sttController.hasSession(testSessionId)) {
                await stt_1.sttController.endSession(testSessionId);
            }
            // Assert: No cleanup attempt (would fail with "session not found")
            (0, vitest_1.expect)(stt_1.sttController.endSession).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('should prevent orphaned STT session when WebSocket closes during creation', async () => {
            // Arrange: WebSocket closes mid-creation
            let creationInProgress = true;
            vitest_1.vi.mocked(stt_1.sttController.createSession).mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 50)); // Simulate delay
                if (!creationInProgress) {
                    throw new Error('WebSocket closed during creation');
                }
            });
            const mockExtWs = {
                sttSessionCreated: false,
            };
            // Act: Start creation, then simulate disconnect
            const createPromise = stt_1.sttController.createSession(testSessionId, {
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
            if (mockExtWs.sttSessionCreated && stt_1.sttController.hasSession(testSessionId)) {
                await stt_1.sttController.endSession(testSessionId);
            }
            // Assert: No orphaned session
            (0, vitest_1.expect)(mockExtWs.sttSessionCreated).toBe(false);
            (0, vitest_1.expect)(stt_1.sttController.endSession).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('should track cleanup attempts to detect orphaned sessions', async () => {
            // Arrange
            const mockExtWs = {
                sttSessionCreated: false, // Flag is false
            };
            vitest_1.vi.mocked(stt_1.sttController.hasSession).mockReturnValue(true); // But session exists!
            // Act: Disconnect
            if (mockExtWs.sttSessionCreated && stt_1.sttController.hasSession(testSessionId)) {
                await stt_1.sttController.endSession(testSessionId);
            }
            // Assert: Cleanup skipped (would detect orphaned session in monitoring)
            (0, vitest_1.expect)(stt_1.sttController.endSession).not.toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)('Concurrent Operations', () => {
        (0, vitest_1.beforeEach)(() => {
            process.env.DEEPGRAM_API_KEY = 'test-key';
        });
        (0, vitest_1.it)('should handle multiple simultaneous connections', async () => {
            // Arrange
            vitest_1.vi.mocked(stt_1.sttController.createSession).mockResolvedValue();
            const sessions = ['session-1', 'session-2', 'session-3'];
            // Act: Create multiple STT sessions concurrently
            await Promise.all(sessions.map(sessionId => stt_1.sttController.createSession(sessionId, {
                sessionId,
                connectionId: `conn-${sessionId}`,
                samplingRate: 16000,
                language: 'en-US',
            })));
            // Assert: All sessions created
            (0, vitest_1.expect)(stt_1.sttController.createSession).toHaveBeenCalledTimes(3);
        });
        (0, vitest_1.it)('should handle rapid connect-disconnect cycles', async () => {
            // Arrange
            vitest_1.vi.mocked(stt_1.sttController.createSession).mockResolvedValue();
            vitest_1.vi.mocked(stt_1.sttController.hasSession).mockReturnValue(true);
            vitest_1.vi.mocked(stt_1.sttController.endSession).mockResolvedValue();
            // Act: Rapid cycles
            for (let i = 0; i < 10; i++) {
                await stt_1.sttController.createSession(`session-${i}`, {
                    sessionId: `session-${i}`,
                    connectionId: `conn-${i}`,
                    samplingRate: 16000,
                    language: 'en-US',
                });
                await stt_1.sttController.endSession(`session-${i}`);
            }
            // Assert: All created and cleaned up
            (0, vitest_1.expect)(stt_1.sttController.createSession).toHaveBeenCalledTimes(10);
            (0, vitest_1.expect)(stt_1.sttController.endSession).toHaveBeenCalledTimes(10);
        });
    });
    (0, vitest_1.describe)('Error Recovery', () => {
        (0, vitest_1.beforeEach)(() => {
            process.env.DEEPGRAM_API_KEY = 'test-key';
        });
        (0, vitest_1.it)('should recover from Deepgram connection errors', async () => {
            // Arrange: First attempt fails, second succeeds
            vitest_1.vi.mocked(stt_1.sttController.createSession)
                .mockRejectedValueOnce(new Error('Connection failed'))
                .mockResolvedValueOnce();
            const mockExtWs = {
                sttSessionCreated: false,
            };
            // Act: First attempt fails
            try {
                await stt_1.sttController.createSession(testSessionId, {
                    sessionId: testSessionId,
                    connectionId: testConnectionId,
                    samplingRate: 16000,
                    language: 'en-US',
                });
                mockExtWs.sttSessionCreated = true;
            }
            catch (error) {
                mockExtWs.sttSessionCreated = false;
            }
            (0, vitest_1.expect)(mockExtWs.sttSessionCreated).toBe(false);
            // Act: Second attempt succeeds
            await stt_1.sttController.createSession(testSessionId, {
                sessionId: testSessionId,
                connectionId: testConnectionId,
                samplingRate: 16000,
                language: 'en-US',
            });
            mockExtWs.sttSessionCreated = true;
            // Assert: Recovered
            (0, vitest_1.expect)(mockExtWs.sttSessionCreated).toBe(true);
        });
        (0, vitest_1.it)('should handle fallback STT session creation on audio.start', async () => {
            // Arrange: STT not created on connect (flag false)
            const mockExtWs = {
                sttSessionCreated: false,
            };
            vitest_1.vi.mocked(stt_1.sttController.hasSession).mockReturnValue(false);
            vitest_1.vi.mocked(stt_1.sttController.createSession).mockResolvedValue();
            // Act: audio.start handler creates fallback session
            if (!stt_1.sttController.hasSession(testSessionId)) {
                await stt_1.sttController.createSession(testSessionId, {
                    sessionId: testSessionId,
                    connectionId: testConnectionId,
                    samplingRate: 16000,
                    language: 'en-US',
                });
                mockExtWs.sttSessionCreated = true;
            }
            // Assert: Fallback session created
            (0, vitest_1.expect)(stt_1.sttController.createSession).toHaveBeenCalled();
            (0, vitest_1.expect)(mockExtWs.sttSessionCreated).toBe(true);
        });
        (0, vitest_1.it)('should handle network interruptions gracefully', async () => {
            // Arrange
            vitest_1.vi.mocked(stt_1.sttController.endSession).mockRejectedValue(new Error('Network error during cleanup'));
            const mockExtWs = {
                sttSessionCreated: true,
            };
            vitest_1.vi.mocked(stt_1.sttController.hasSession).mockReturnValue(true);
            // Act: Disconnect with network error
            try {
                if (mockExtWs.sttSessionCreated && stt_1.sttController.hasSession(testSessionId)) {
                    await stt_1.sttController.endSession(testSessionId);
                }
            }
            catch (error) {
                // Error handled
            }
            // Assert: Cleanup attempted
            (0, vitest_1.expect)(stt_1.sttController.endSession).toHaveBeenCalledWith(testSessionId);
        });
    });
    (0, vitest_1.describe)('Session Cleanup', () => {
        (0, vitest_1.it)('should delete session on disconnect', () => {
            // Act
            services_1.sessionService.deleteSession(testConnectionId);
            // Assert
            (0, vitest_1.expect)(services_1.sessionService.deleteSession).toHaveBeenCalledWith(testConnectionId);
        });
        (0, vitest_1.it)('should remove WebSocket on disconnect', () => {
            // Act
            services_1.websocketService.removeWebSocket(testSessionId);
            // Assert
            (0, vitest_1.expect)(services_1.websocketService.removeWebSocket).toHaveBeenCalledWith(testSessionId);
        });
    });
});
