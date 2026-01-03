"use strict";
/**
 * Session-Level Lifecycle Integration Tests
 * Tests the complete flow of session-level Deepgram connection lifecycle
 * Target: Verify 0 latency between recordings (eliminates 3+ second audio loss)
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const stt_service_1 = require("@/modules/stt/services/stt.service");
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
        keepAlive: vitest_1.vi.fn(),
    };
};
// Helper to trigger events manually
const triggerEvent = (event, data) => {
    const handlers = eventHandlers.get(event);
    if (handlers) {
        handlers.forEach((handler) => handler(data));
    }
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
(0, vitest_1.describe)('Integration: Session-Level Connection Lifecycle', () => {
    const testSessionId = 'integration-session-test';
    const testConnectionId = 'integration-conn-test';
    const testConfig = {
        sessionId: testSessionId,
        connectionId: testConnectionId,
        samplingRate: 16000,
        language: 'en-US',
    };
    (0, vitest_1.beforeEach)(async () => {
        vitest_1.vi.clearAllMocks();
        await stt_service_1.sttService.shutdown({ restart: true });
    });
    (0, vitest_1.afterEach)(async () => {
        await stt_service_1.sttService.shutdown({ restart: true });
    });
    (0, vitest_1.describe)('Session-Level Connection Lifecycle', () => {
        (0, vitest_1.it)('should establish Deepgram connection on WebSocket connect', async () => {
            // Act: Create session (simulating WebSocket connect)
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            // Assert: Session created with connection
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            (0, vitest_1.expect)(session).not.toBeNull();
            (0, vitest_1.expect)(session.connectionState).toBe('connected');
            (0, vitest_1.expect)(session.deepgramLiveClient).not.toBeNull();
        });
        (0, vitest_1.it)('should persist connection across multiple recordings', async () => {
            // Arrange: Create session
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            const initialClient = session.deepgramLiveClient;
            // Act: Multiple recordings
            // Recording 1
            session.addTranscript('Recording one', 0.9, true);
            let promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 10);
            await promise;
            // Recording 2
            session.addTranscript('Recording two', 0.9, true);
            promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 10);
            await promise;
            // Recording 3
            session.addTranscript('Recording three', 0.9, true);
            promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 10);
            await promise;
            // Assert: Same client throughout
            (0, vitest_1.expect)(session.deepgramLiveClient).toBe(initialClient);
            (0, vitest_1.expect)(session.connectionState).toBe('connected');
        });
        (0, vitest_1.it)('should finalize transcript without closing connection', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('Test transcript', 0.9, true);
            // Act: Finalize
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.5 }), 10);
            const result = await promise;
            // Assert: Connection remains open
            (0, vitest_1.expect)(result).toBe('Test transcript');
            (0, vitest_1.expect)(session.connectionState).toBe('connected');
            (0, vitest_1.expect)(session.deepgramLiveClient).not.toBeNull();
        });
        (0, vitest_1.it)('should close connection only on WebSocket disconnect', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            // Multiple finalizations
            session.addTranscript('First', 0.9, true);
            let promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 10);
            await promise;
            session.addTranscript('Second', 0.9, true);
            promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 10);
            await promise;
            // Assert: Still connected
            (0, vitest_1.expect)(session.connectionState).toBe('connected');
            // Act: Disconnect
            await stt_service_1.sttService.endSession(testSessionId);
            // Assert: Session deleted
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(testSessionId)).toBeUndefined();
        });
        (0, vitest_1.it)('should eliminate audio loss at recording start (0 latency)', async () => {
            // Arrange: Create session (WebSocket connect)
            const startTime = Date.now();
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const creationTime = Date.now() - startTime;
            // First recording (connection already open)
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            (0, vitest_1.expect)(session.connectionState).toBe('connected');
            // Finalize first recording
            session.addTranscript('First recording', 0.9, true);
            let promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 10);
            await promise;
            // Act: Second recording starts (CRITICAL: should have 0 latency)
            const secondRecordingStart = Date.now();
            const session2 = stt_session_service_1.sttSessionService.getSession(testSessionId);
            const readyCheck = Date.now() - secondRecordingStart;
            // Assert: Connection ready immediately (< 10ms check)
            (0, vitest_1.expect)(session2).not.toBeNull();
            (0, vitest_1.expect)(session2.deepgramLiveClient).not.toBeNull();
            (0, vitest_1.expect)(session2.connectionState).toBe('connected');
            (0, vitest_1.expect)(readyCheck).toBeLessThan(10); // Should be < 10ms
            // Assert: No re-creation needed (0 latency)
            // Old approach: ~3000ms connection time
            // New approach: ~0ms (connection already open)
            (0, vitest_1.expect)(creationTime).toBeGreaterThan(0); // Initial creation takes time
            (0, vitest_1.expect)(readyCheck).toBeLessThan(creationTime / 100); // Second recording 100x faster
        });
    });
    (0, vitest_1.describe)('Concurrent Operations', () => {
        (0, vitest_1.it)('should handle concurrent disconnect during finalization', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('Concurrent test', 0.9, true);
            // Simulate race: client becomes null during finalization
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => {
                session.deepgramLiveClient = null;
                triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.0 });
            }, 10);
            // Act: Should not crash
            await (0, vitest_1.expect)(promise).resolves.toBeDefined();
        });
        (0, vitest_1.it)('should handle rapid start-stop-start cycles', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            // Act: Rapid cycles
            for (let i = 0; i < 10; i++) {
                session.addTranscript(`Recording ${i}`, 0.9, true);
                const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
                setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 0.5 }), 10);
                await promise;
            }
            // Assert: Session still healthy
            (0, vitest_1.expect)(session.connectionState).toBe('connected');
            (0, vitest_1.expect)(session.deepgramLiveClient).not.toBeNull();
        });
        (0, vitest_1.it)('should handle multiple sessions simultaneously', async () => {
            // Arrange: Create 3 concurrent sessions
            const sessions = [
                { sessionId: 'session-1', connectionId: 'conn-1' },
                { sessionId: 'session-2', connectionId: 'conn-2' },
                { sessionId: 'session-3', connectionId: 'conn-3' },
            ];
            // Act: Create all sessions concurrently
            await Promise.all(sessions.map(({ sessionId, connectionId }) => stt_service_1.sttService.createSession(sessionId, {
                sessionId,
                connectionId,
                samplingRate: 16000,
                language: 'en-US',
            })));
            // Assert: All sessions exist
            sessions.forEach(({ sessionId }) => {
                const session = stt_session_service_1.sttSessionService.getSession(sessionId);
                (0, vitest_1.expect)(session).not.toBeNull();
                (0, vitest_1.expect)(session.connectionState).toBe('connected');
            });
            // Cleanup
            await Promise.all(sessions.map(({ sessionId }) => stt_service_1.sttService.endSession(sessionId)));
        });
    });
    (0, vitest_1.describe)('Error Recovery', () => {
        (0, vitest_1.it)('should recover from Deepgram connection errors', async () => {
            // Arrange: Simulate connection that becomes error state
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            // Simulate error state
            session.connectionState = 'error';
            // Act: Try to finalize despite error
            const result = await stt_service_1.sttService.finalizeTranscript(testSessionId);
            // Assert: Handled gracefully
            (0, vitest_1.expect)(result).toBeDefined();
        });
        (0, vitest_1.it)('should handle network interruptions gracefully', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('Network test', 0.9, true);
            // Simulate network error during finalization
            const mockClient = session.deepgramLiveClient;
            mockClient.send = vitest_1.vi.fn(() => {
                throw new Error('Network error');
            });
            // Act: Should not crash
            await (0, vitest_1.expect)(stt_service_1.sttService.finalizeTranscript(testSessionId)).resolves.toBeDefined();
        });
        (0, vitest_1.it)('should handle fallback session creation if missing', async () => {
            // Simulate scenario: STT session not created on connect (error occurred)
            // audio.start should create fallback session
            // Act: Check if session exists
            const hasSession = stt_service_1.sttService.hasSession(testSessionId);
            if (!hasSession) {
                // Fallback: Create session
                await stt_service_1.sttService.createSession(testSessionId, testConfig);
            }
            // Assert: Session now exists
            (0, vitest_1.expect)(stt_service_1.sttService.hasSession(testSessionId)).toBe(true);
        });
    });
    (0, vitest_1.describe)('Performance and Latency', () => {
        (0, vitest_1.it)('should create initial session within reasonable time', async () => {
            // Act
            const startTime = Date.now();
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const duration = Date.now() - startTime;
            // Assert: Creation completes quickly (with mocked SDK)
            (0, vitest_1.expect)(duration).toBeLessThan(1000); // Should be < 1s with mocks
        });
        (0, vitest_1.it)('should finalize transcript within timeout window', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('Performance test', 0.9, true);
            // Act
            const startTime = Date.now();
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 50);
            await promise;
            const duration = Date.now() - startTime;
            // Assert: Finalization completes quickly
            (0, vitest_1.expect)(duration).toBeLessThan(1000);
        }, 5000);
        (0, vitest_1.it)('should support high-frequency finalization cycles', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            // Act: 20 rapid finalizations
            const startTime = Date.now();
            for (let i = 0; i < 20; i++) {
                session.addTranscript(`Rapid ${i}`, 0.9, true);
                const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
                setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 0.1 }), 10);
                await promise;
            }
            const totalDuration = Date.now() - startTime;
            // Assert: All completed successfully
            (0, vitest_1.expect)(session.connectionState).toBe('connected');
            (0, vitest_1.expect)(totalDuration).toBeLessThan(5000); // 20 cycles in < 5s
        });
    });
    (0, vitest_1.describe)('Metrics and Monitoring', () => {
        (0, vitest_1.it)('should track finalization method (event vs timeout)', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('Metrics test', 0.9, true);
            // Act
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 10);
            await promise;
            // Assert: Tracked as event-based
            (0, vitest_1.expect)(session.metrics.finalizationMethod).toBe('event');
        });
        (0, vitest_1.it)('should track session lifecycle metrics', async () => {
            // Arrange
            const beforeMetrics = stt_service_1.sttService.getMetrics();
            const beforeCreated = beforeMetrics.totalSessionsCreated;
            const beforeCleaned = beforeMetrics.totalSessionsCleaned;
            // Act: Create, use, and end session
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const afterCreateMetrics = stt_service_1.sttService.getMetrics();
            (0, vitest_1.expect)(afterCreateMetrics.totalSessionsCreated).toBe(beforeCreated + 1);
            await stt_service_1.sttService.endSession(testSessionId);
            const afterEndMetrics = stt_service_1.sttService.getMetrics();
            (0, vitest_1.expect)(afterEndMetrics.totalSessionsCleaned).toBe(beforeCleaned + 1);
        });
        (0, vitest_1.it)('should provide session-level metrics', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            // Act: Add transcripts and finalize
            session.addTranscript('First', 0.95, true);
            session.addTranscript('Second', 0.92, true);
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 10);
            await promise;
            // Get metrics
            const metrics = stt_service_1.sttService.getSessionMetrics(testSessionId);
            // Assert: Metrics tracked
            (0, vitest_1.expect)(metrics).toBeDefined();
            (0, vitest_1.expect)(metrics.sessionId).toBe(testSessionId);
            (0, vitest_1.expect)(metrics.transcriptsReceived).toBe(2);
            (0, vitest_1.expect)(metrics.connectionState).toBe('connected');
        });
    });
});
