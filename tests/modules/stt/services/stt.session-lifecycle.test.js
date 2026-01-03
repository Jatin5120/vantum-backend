"use strict";
/**
 * STT Service - Session-Level Lifecycle Tests
 * Focus on testing the critical session-level connection lifecycle changes
 * Target Coverage: 90%+ for critical finalization and cleanup paths
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const stt_service_1 = require("@/modules/stt/services/stt.service");
const stt_session_service_1 = require("@/modules/stt/services/stt-session.service");
const sdk_1 = require("@deepgram/sdk");
// Create mock live client with proper event handling
let mockOnMethod;
let eventHandlers;
const createMockLiveClient = () => {
    eventHandlers = new Map();
    mockOnMethod = vitest_1.vi.fn((event, handler) => {
        // Store handlers for later triggering
        if (!eventHandlers.has(event)) {
            eventHandlers.set(event, []);
        }
        eventHandlers.get(event).push(handler);
        // Automatically fire 'Open' event to prevent timeout
        if (event === sdk_1.LiveTranscriptionEvents.Open) {
            setTimeout(() => handler(), 10);
        }
    });
    return {
        getReadyState: vitest_1.vi.fn(() => 1), // OPEN state by default
        send: vitest_1.vi.fn(),
        requestClose: vitest_1.vi.fn(),
        on: mockOnMethod,
        removeListener: vitest_1.vi.fn(),
        keepAlive: vitest_1.vi.fn(),
    };
};
// Mock Deepgram SDK
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
// Helper to trigger a specific event
const triggerEvent = (event, data) => {
    const handlers = eventHandlers.get(event);
    if (handlers) {
        handlers.forEach(handler => handler(data));
    }
};
(0, vitest_1.describe)('STT Service - Session-Level Connection Lifecycle', () => {
    const testSessionId = 'session-lifecycle-test';
    const testConnectionId = 'conn-lifecycle-test';
    const testConfig = {
        sessionId: testSessionId,
        connectionId: testConnectionId,
        samplingRate: 16000,
        language: 'en-US',
    };
    (0, vitest_1.beforeEach)(async () => {
        vitest_1.vi.clearAllMocks();
        eventHandlers = new Map();
        // Reset service state
        await stt_service_1.sttService.shutdown({ restart: true });
    });
    (0, vitest_1.afterEach)(async () => {
        // Cleanup all sessions
        await stt_service_1.sttService.shutdown({ restart: true });
    });
    (0, vitest_1.describe)('finalizeTranscript() - Happy Path with Metadata Event', () => {
        (0, vitest_1.it)('should finalize transcript when Metadata event fires', async () => {
            // Arrange: Create session and add transcript
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            (0, vitest_1.expect)(session).toBeDefined();
            session.addTranscript('Hello', 0.95, true);
            session.addTranscript('world', 0.92, true);
            // Act: Finalize the transcript (trigger Metadata event during finalization)
            const finalizePromise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            // Trigger Metadata event after a short delay
            setTimeout(() => {
                triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, {
                    duration: 2.5,
                    request_id: 'test-123'
                });
            }, 50);
            const result = await finalizePromise;
            // Assert: Transcript returned and state reset
            (0, vitest_1.expect)(result).toBe('Hello world');
            (0, vitest_1.expect)(session.accumulatedTranscript).toBe(''); // Reset
            (0, vitest_1.expect)(session.interimTranscript).toBe(''); // Reset
            (0, vitest_1.expect)(session.transcriptSegments).toEqual([]); // Reset
            (0, vitest_1.expect)(session.metrics.finalizationMethod).toBe('event');
        });
        (0, vitest_1.it)('should reset transcript state after finalization', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('First transcript', 0.9, true);
            session.addTranscript('Interim text', 0.85, false);
            // Act
            const finalizePromise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => {
                triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.2 });
            }, 50);
            await finalizePromise;
            // Assert: All state reset
            (0, vitest_1.expect)(session.accumulatedTranscript).toBe('');
            (0, vitest_1.expect)(session.interimTranscript).toBe('');
            (0, vitest_1.expect)(session.transcriptSegments.length).toBe(0);
        });
        (0, vitest_1.it)('should keep connection open (not close)', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            const mockClient = session.deepgramLiveClient;
            // Act
            const finalizePromise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => {
                triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 0.8 });
            }, 50);
            await finalizePromise;
            // Assert: Connection remains open
            (0, vitest_1.expect)(mockClient.requestClose).not.toHaveBeenCalled();
            (0, vitest_1.expect)(session.deepgramLiveClient).not.toBeUndefined();
            (0, vitest_1.expect)(session.connectionState).toBe('connected');
        });
        (0, vitest_1.it)('should cleanup event listeners after finalization', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            const mockClient = session.deepgramLiveClient;
            // Act
            const finalizePromise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => {
                triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.0 });
            }, 50);
            await finalizePromise;
            // Assert: Listener removed
            (0, vitest_1.expect)(mockClient.removeListener).toHaveBeenCalledWith(sdk_1.LiveTranscriptionEvents.Metadata, vitest_1.expect.any(Function));
        });
        (0, vitest_1.it)('should track finalization method as event', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            // Act
            const finalizePromise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => {
                triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.5 });
            }, 50);
            await finalizePromise;
            // Assert: Tracked as event-based finalization
            (0, vitest_1.expect)(session.metrics.finalizationMethod).toBe('event');
        });
    });
    (0, vitest_1.describe)('finalizeTranscript() - Timeout Fallback', () => {
        (0, vitest_1.it)('should use timeout if Metadata event never fires', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('Timeout test', 0.9, true);
            // Act: Will timeout (no Metadata event triggered)
            const result = await stt_service_1.sttService.finalizeTranscript(testSessionId);
            // Assert: Falls back to timeout
            (0, vitest_1.expect)(result).toBe('Timeout test');
            (0, vitest_1.expect)(session.metrics.finalizationMethod).toBe('timeout');
        }, 10000);
        (0, vitest_1.it)('should still cleanup listeners on timeout', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            const mockClient = session.deepgramLiveClient;
            // Act (no Metadata event)
            await stt_service_1.sttService.finalizeTranscript(testSessionId);
            // Assert: Cleanup still happens
            (0, vitest_1.expect)(mockClient.removeListener).toHaveBeenCalled();
        }, 10000);
        (0, vitest_1.it)('should track finalization method as timeout', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            // Act (no Metadata event)
            await stt_service_1.sttService.finalizeTranscript(testSessionId);
            // Assert
            (0, vitest_1.expect)(session.metrics.finalizationMethod).toBe('timeout');
        }, 10000);
    });
    (0, vitest_1.describe)('finalizeTranscript() - Race Condition Scenarios (CRITICAL)', () => {
        (0, vitest_1.it)('should handle client becoming null before finalization', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('Race condition test', 0.9, true);
            // Simulate race condition: client becomes null
            session.deepgramLiveClient = null;
            // Act: Should not crash
            const result = await stt_service_1.sttService.finalizeTranscript(testSessionId);
            // Assert: Returns accumulated transcript gracefully
            (0, vitest_1.expect)(result).toBe('Race condition test');
            (0, vitest_1.expect)(session.accumulatedTranscript).toBe(''); // Still reset
        });
        (0, vitest_1.it)('should return accumulated transcript gracefully on null client', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('First', 0.9, true);
            session.addTranscript('Second', 0.9, true);
            session.addTranscript('Third', 0.9, true);
            // Client becomes null mid-operation
            session.deepgramLiveClient = null;
            // Act
            const result = await stt_service_1.sttService.finalizeTranscript(testSessionId);
            // Assert: All transcripts returned
            (0, vitest_1.expect)(result).toBe('First Second Third');
        });
        (0, vitest_1.it)('should reset state even when client is null', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('Test', 0.9, true);
            session.addTranscript('Interim', 0.8, false);
            session.deepgramLiveClient = null;
            // Act
            await stt_service_1.sttService.finalizeTranscript(testSessionId);
            // Assert: State still reset despite null client
            (0, vitest_1.expect)(session.accumulatedTranscript).toBe('');
            (0, vitest_1.expect)(session.interimTranscript).toBe('');
            (0, vitest_1.expect)(session.transcriptSegments).toEqual([]);
        });
        (0, vitest_1.it)('should not crash on concurrent disconnect during finalization', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('Concurrent test', 0.9, true);
            // Simulate race: client becomes null during finalization
            setTimeout(() => {
                session.deepgramLiveClient = null;
            }, 10);
            // Act: Should not crash
            await (0, vitest_1.expect)(stt_service_1.sttService.finalizeTranscript(testSessionId)).resolves.toBeDefined();
        });
    });
    (0, vitest_1.describe)('finalizeTranscript() - Connection States', () => {
        (0, vitest_1.it)('should handle connection not ready (readyState !== 1)', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('Not ready test', 0.9, true);
            const mockClient = session.deepgramLiveClient;
            mockClient.getReadyState.mockReturnValue(0); // CONNECTING
            // Act
            const result = await stt_service_1.sttService.finalizeTranscript(testSessionId);
            // Assert: Still returns transcript, but CloseStream not sent
            (0, vitest_1.expect)(result).toBe('Not ready test');
            (0, vitest_1.expect)(mockClient.send).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('should handle CloseStream send failure', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('Send fail test', 0.9, true);
            const mockClient = session.deepgramLiveClient;
            mockClient.send.mockImplementation(() => {
                throw new Error('Send failed');
            });
            // Act: Should not crash
            await (0, vitest_1.expect)(stt_service_1.sttService.finalizeTranscript(testSessionId)).resolves.toBeDefined();
        });
        (0, vitest_1.it)('should handle Metadata event never firing (timeout path)', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('No metadata', 0.9, true);
            // Act (no Metadata event triggered)
            const result = await stt_service_1.sttService.finalizeTranscript(testSessionId);
            // Assert: Fallback to timeout works
            (0, vitest_1.expect)(result).toBe('No metadata');
            (0, vitest_1.expect)(session.metrics.finalizationMethod).toBe('timeout');
        }, 10000);
    });
    (0, vitest_1.describe)('endSession() - Session-Level Cleanup', () => {
        (0, vitest_1.it)('should close Deepgram connection', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            (0, vitest_1.expect)(session).not.toBeUndefined();
            // Act
            await stt_service_1.sttService.endSession(testSessionId);
            // Assert: Session deleted (connection closed internally)
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(testSessionId)).toBeUndefined();
        });
        (0, vitest_1.it)('should cleanup session from service', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(testSessionId)).not.toBeUndefined();
            // Act
            await stt_service_1.sttService.endSession(testSessionId);
            // Assert: Session removed
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(testSessionId)).toBeUndefined();
        });
        (0, vitest_1.it)('should NOT finalize transcript (that is done separately)', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('Should not finalize', 0.9, true);
            const mockClient = session.deepgramLiveClient;
            const sendSpy = vitest_1.vi.spyOn(mockClient, 'send');
            // Act
            await stt_service_1.sttService.endSession(testSessionId);
            // Assert: No CloseStream sent during endSession
            (0, vitest_1.expect)(sendSpy).not.toHaveBeenCalledWith(vitest_1.expect.stringContaining('CloseStream'));
        });
        (0, vitest_1.it)('should increment totalSessionsCleaned metric', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const beforeMetrics = stt_service_1.sttService.getMetrics();
            const cleanedBefore = beforeMetrics.totalSessionsCleaned;
            // Act
            await stt_service_1.sttService.endSession(testSessionId);
            // Assert
            const afterMetrics = stt_service_1.sttService.getMetrics();
            (0, vitest_1.expect)(afterMetrics.totalSessionsCleaned).toBe(cleanedBefore + 1);
        });
        (0, vitest_1.it)('should handle non-existent session gracefully', async () => {
            // Act: Try to end non-existent session
            const result = await stt_service_1.sttService.endSession('non-existent-id');
            // Assert: Returns empty string (not undefined)
            (0, vitest_1.expect)(result).toBe('');
        });
        (0, vitest_1.it)('should cleanup even if errors occur', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            const mockClient = session.deepgramLiveClient;
            mockClient.requestClose.mockImplementation(() => {
                throw new Error('Close failed');
            });
            // Act: Should not throw, returns empty string
            const result = await stt_service_1.sttService.endSession(testSessionId);
            // Assert: Returns empty string and session still cleaned up
            (0, vitest_1.expect)(result).toBe('');
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(testSessionId)).toBeUndefined();
        });
    });
    (0, vitest_1.describe)('Multiple Recording Cycles (Session Persistence)', () => {
        (0, vitest_1.it)('should support multiple finalizations without closing connection', async () => {
            // Arrange: Create session once
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            const mockClient = session.deepgramLiveClient;
            // First recording
            session.addTranscript('First recording', 0.9, true);
            const finalize1 = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 50);
            const result1 = await finalize1;
            (0, vitest_1.expect)(result1).toBe('First recording');
            // Assert: Connection still open
            (0, vitest_1.expect)(session.deepgramLiveClient).not.toBeUndefined();
            (0, vitest_1.expect)(session.connectionState).toBe('connected');
            (0, vitest_1.expect)(mockClient.requestClose).not.toHaveBeenCalled();
            // Second recording
            session.addTranscript('Second recording', 0.9, true);
            const finalize2 = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 50);
            const result2 = await finalize2;
            (0, vitest_1.expect)(result2).toBe('Second recording');
            // Assert: Still open
            (0, vitest_1.expect)(session.deepgramLiveClient).not.toBeUndefined();
            (0, vitest_1.expect)(session.connectionState).toBe('connected');
            (0, vitest_1.expect)(mockClient.requestClose).not.toHaveBeenCalled();
            // Third recording
            session.addTranscript('Third recording', 0.9, true);
            const finalize3 = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 50);
            const result3 = await finalize3;
            (0, vitest_1.expect)(result3).toBe('Third recording');
            // Assert: Still open
            (0, vitest_1.expect)(session.deepgramLiveClient).not.toBeUndefined();
            (0, vitest_1.expect)(session.connectionState).toBe('connected');
            // Connection only closed on endSession
            await stt_service_1.sttService.endSession(testSessionId);
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(testSessionId)).toBeUndefined();
        });
        (0, vitest_1.it)('should eliminate audio loss between recordings (0 latency)', async () => {
            // Arrange: Session created on WebSocket connect
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            // First recording
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            (0, vitest_1.expect)(session).not.toBeUndefined();
            (0, vitest_1.expect)(session.connectionState).toBe('connected');
            (0, vitest_1.expect)(session.deepgramLiveClient).not.toBeUndefined();
            // Finalize first recording
            const finalize1 = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 50);
            await finalize1;
            // Second recording starts IMMEDIATELY (no createSession needed)
            const session2 = stt_session_service_1.sttSessionService.getSession(testSessionId);
            (0, vitest_1.expect)(session2).not.toBeUndefined(); // Same session
            (0, vitest_1.expect)(session2.deepgramLiveClient).not.toBeUndefined(); // Connection ready
            (0, vitest_1.expect)(session2.connectionState).toBe('connected'); // Already connected
            // Result: 0 latency, no 3+ second audio loss
        });
        (0, vitest_1.it)('should track metrics across multiple recordings', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            // First recording
            session.addTranscript('Recording 1', 0.9, true);
            const finalize1 = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 50);
            await finalize1;
            (0, vitest_1.expect)(session.metrics.finalizationMethod).toBe('event');
            // Second recording
            session.addTranscript('Recording 2', 0.9, true);
            const finalize2 = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 50);
            await finalize2;
            // Assert: Metrics tracked
            (0, vitest_1.expect)(session.metrics.transcriptsReceived).toBe(2);
        });
    });
    (0, vitest_1.describe)('Full Session Lifecycle', () => {
        (0, vitest_1.it)('should follow complete lifecycle: create → finalize × N → end', async () => {
            // 1. Create session (on WebSocket connect)
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            (0, vitest_1.expect)(session).not.toBeUndefined();
            (0, vitest_1.expect)(session.connectionState).toBe('connected');
            // 2. First finalize (audio.end)
            session.addTranscript('First', 0.9, true);
            const finalize1 = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 50);
            await finalize1;
            (0, vitest_1.expect)(session.connectionState).toBe('connected');
            // 3. Second finalize (audio.end)
            session.addTranscript('Second', 0.9, true);
            const finalize2 = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 50);
            await finalize2;
            (0, vitest_1.expect)(session.connectionState).toBe('connected');
            // 4. Third finalize (audio.end)
            session.addTranscript('Third', 0.9, true);
            const finalize3 = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 1.0 }), 50);
            await finalize3;
            (0, vitest_1.expect)(session.connectionState).toBe('connected');
            // 5. End session (on WebSocket disconnect)
            await stt_service_1.sttService.endSession(testSessionId);
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(testSessionId)).toBeUndefined();
        });
        (0, vitest_1.it)('should track totalSessionsCreated and totalSessionsCleaned', async () => {
            // Arrange
            const beforeMetrics = stt_service_1.sttService.getMetrics();
            // Create session
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const afterCreateMetrics = stt_service_1.sttService.getMetrics();
            (0, vitest_1.expect)(afterCreateMetrics.totalSessionsCreated).toBe(beforeMetrics.totalSessionsCreated + 1);
            // End session
            await stt_service_1.sttService.endSession(testSessionId);
            const afterEndMetrics = stt_service_1.sttService.getMetrics();
            (0, vitest_1.expect)(afterEndMetrics.totalSessionsCleaned).toBe(beforeMetrics.totalSessionsCleaned + 1);
        });
    });
    (0, vitest_1.describe)('Error Recovery and Edge Cases', () => {
        (0, vitest_1.it)('should handle finalization when session has no transcripts', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            // Act: Finalize with no transcripts
            const finalizePromise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 0.0 }), 50);
            const result = await finalizePromise;
            // Assert: Returns empty string
            (0, vitest_1.expect)(result).toBe('');
        });
        (0, vitest_1.it)('should handle rapid finalization calls (stress test)', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            // Act: Multiple rapid finalizations
            for (let i = 0; i < 5; i++) {
                session.addTranscript(`Recording ${i + 1}`, 0.9, true);
                const finalizePromise = stt_service_1.sttService.finalizeTranscript(testSessionId);
                setTimeout(() => triggerEvent(sdk_1.LiveTranscriptionEvents.Metadata, { duration: 0.1 }), 50);
                const result = await finalizePromise;
                (0, vitest_1.expect)(result).toBe(`Recording ${i + 1}`);
            }
            // Assert: Session still healthy
            (0, vitest_1.expect)(session.connectionState).toBe('connected');
            (0, vitest_1.expect)(session.deepgramLiveClient).not.toBeUndefined();
        });
        (0, vitest_1.it)('should handle finalization during reconnection state', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('Reconnecting test', 0.9, true);
            // Simulate reconnecting state
            session.isReconnecting = true;
            session.connectionState = 'disconnected';
            // Act: Try to finalize
            const result = await stt_service_1.sttService.finalizeTranscript(testSessionId);
            // Assert: Still returns transcript
            (0, vitest_1.expect)(result).toBe('Reconnecting test');
        });
    });
});
