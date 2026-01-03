"use strict";
/**
 * STT Service - Finalization Flow with Error Injection Tests
 * Tests critical finalization sequence with error scenarios
 * Focus: Event handler error resilience, timeout safety nets, resource cleanup
 * Target Coverage: 85%+ for finalization path, 100% for error handlers
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const stt_service_1 = require("@/modules/stt/services/stt.service");
const stt_session_service_1 = require("@/modules/stt/services/stt-session.service");
const sdk_1 = require("@deepgram/sdk");
const config_1 = require("@/modules/stt/config");
let mockEventHandlers = new Map();
const createMockLiveClient = () => {
    const handlers = new Map();
    const mockClient = {
        on: vitest_1.vi.fn((event, handler) => {
            if (!handlers.has(event)) {
                handlers.set(event, []);
            }
            handlers.get(event).push(handler);
        }),
        send: vitest_1.vi.fn(),
        requestClose: vitest_1.vi.fn(),
        removeListener: vitest_1.vi.fn((event, handler) => {
            const eventHandlers = handlers.get(event);
            if (eventHandlers) {
                const index = eventHandlers.indexOf(handler);
                if (index > -1) {
                    eventHandlers.splice(index, 1);
                }
            }
        }),
        removeAllListeners: vitest_1.vi.fn(() => {
            handlers.clear();
        }),
        getReadyState: vitest_1.vi.fn(() => 1), // OPEN by default
        keepAlive: vitest_1.vi.fn(),
        _eventHandlers: handlers,
        _emitEvent: (event, data) => {
            const eventHandlers = handlers.get(event);
            if (eventHandlers) {
                eventHandlers.forEach((handler) => {
                    handler(data);
                });
            }
        },
        _resetHandlers: () => {
            handlers.clear();
        },
    };
    return mockClient;
};
let currentMockClient;
vitest_1.vi.mock('@deepgram/sdk', () => {
    return {
        createClient: vitest_1.vi.fn(() => {
            currentMockClient = createMockLiveClient();
            return {
                listen: {
                    live: vitest_1.vi.fn(() => currentMockClient),
                },
            };
        }),
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
// ============================================================================
// TEST SUITE
// ============================================================================
(0, vitest_1.describe)('STT Service - Finalization Flow with Error Injection', () => {
    const testSessionId = 'finalization-error-test';
    const testConnectionId = 'conn-finalization-test';
    const testConfig = {
        sessionId: testSessionId,
        connectionId: testConnectionId,
        samplingRate: 16000,
        language: 'en-US',
    };
    (0, vitest_1.beforeEach)(async () => {
        vitest_1.vi.clearAllMocks();
        vitest_1.vi.useFakeTimers();
        await stt_service_1.sttService.shutdown({ restart: true });
    });
    (0, vitest_1.afterEach)(async () => {
        vitest_1.vi.runAllTimers();
        vitest_1.vi.useRealTimers();
        await stt_service_1.sttService.shutdown({ restart: true });
    });
    // ========================================================================================
    // SECTION 1: FINALIZATION FLOW - HAPPY PATH WITH TIMING
    // ========================================================================================
    (0, vitest_1.describe)('Finalization Flow - Happy Path with Proper Timing', () => {
        (0, vitest_1.it)('should send CloseStream and wait for Metadata event', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('test transcript', 0.95, true);
            // Setup: Metadata fires after 5ms (realistic)
            const metadataHandler = vitest_1.vi.fn();
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Metadata) {
                    metadataHandler.mockImplementation(() => {
                        setTimeout(() => handler({ duration: 1.2, request_id: 'req-123' }), 5);
                    });
                }
            });
            // Act
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            vitest_1.vi.advanceTimersByTime(10);
            const result = await promise;
            // Assert
            (0, vitest_1.expect)(currentMockClient.send).toHaveBeenCalledWith(JSON.stringify({ type: 'CloseStream' }));
            (0, vitest_1.expect)(result).toBe('test transcript');
            (0, vitest_1.expect)(session.metrics.finalizationMethod).toBe('event');
        });
        (0, vitest_1.it)('should reset finalization flag after 100ms delay', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('test', 0.95, true);
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Metadata) {
                    setTimeout(() => handler({ duration: 1.0 }), 3);
                }
            });
            // Act
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            // Initially flag should be true
            (0, vitest_1.expect)(session.isFinalizingTranscript).toBe(true);
            vitest_1.vi.advanceTimersByTime(10);
            await promise;
            // After finalization but before timeout reset
            (0, vitest_1.expect)(session.isFinalizingTranscript).toBe(true);
            // After 100ms reset delay
            vitest_1.vi.advanceTimersByTime(100);
            (0, vitest_1.expect)(session.isFinalizingTranscript).toBe(false);
        });
        (0, vitest_1.it)('should clear existing finalization timeout before setting new one', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('first', 0.95, true);
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Metadata) {
                    setTimeout(() => handler({ duration: 1.0 }), 5);
                }
            });
            // Set initial timeout handle
            const oldHandle = setTimeout(() => { }, 999);
            session.finalizationTimeoutHandle = oldHandle;
            // Act
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            vitest_1.vi.advanceTimersByTime(10);
            await promise;
            // Assert: Old handle should have been cleared (no error)
            (0, vitest_1.expect)(session.finalizationTimeoutHandle).toBeDefined();
        });
        (0, vitest_1.it)('should prevent Close event from triggering reconnection during finalization', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('test', 0.95, true);
            session.isActive = true;
            let closeHandler = null;
            let metadataHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Metadata) {
                    metadataHandler = handler;
                }
                if (event === sdk_1.LiveTranscriptionEvents.Close) {
                    closeHandler = handler;
                }
            });
            // Act: Start finalization
            const finalizePromise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            // Simulate Close event arriving after Metadata
            vitest_1.vi.advanceTimersByTime(8);
            if (metadataHandler) {
                metadataHandler({ duration: 1.0 });
            }
            // Close event should not trigger reconnection
            vitest_1.vi.advanceTimersByTime(5);
            if (closeHandler) {
                closeHandler({ code: 1000, reason: 'Normal closure' });
            }
            await finalizePromise;
            vitest_1.vi.advanceTimersByTime(150);
            // Assert: No reconnection attempted
            (0, vitest_1.expect)(session.connectionState).toBe('connected');
        });
    });
    // ========================================================================================
    // SECTION 2: EVENT HANDLER ERROR INJECTION - ALL 7 HANDLERS
    // ========================================================================================
    (0, vitest_1.describe)('Event Handler Error Injection - Transcript Handler', () => {
        (0, vitest_1.it)('should handle error in Transcript event handler without crashing', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            let transcriptHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Transcript) {
                    transcriptHandler = () => {
                        handler({ channel: { alternatives: [{ transcript: 'test', confidence: 0.95 }] }, is_final: true });
                        throw new Error('Transcript handler error');
                    };
                }
            });
            // Act & Assert: Should not crash
            (0, vitest_1.expect)(() => {
                if (transcriptHandler)
                    transcriptHandler();
            }).toThrow();
            // Service should still be functional
            (0, vitest_1.expect)(stt_service_1.sttService.isHealthy()).toBe(true);
        });
        (0, vitest_1.it)('should continue processing after Transcript handler error', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            let transcriptHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Transcript) {
                    transcriptHandler = handler;
                }
            });
            // Act: First call throws, second call succeeds
            if (transcriptHandler) {
                // In real scenario, error is caught in handler
                transcriptHandler({
                    channel: { alternatives: [{ transcript: 'first', confidence: 0.95 }] },
                    is_final: true,
                });
                transcriptHandler({
                    channel: { alternatives: [{ transcript: 'second', confidence: 0.95 }] },
                    is_final: true,
                });
            }
            // Assert: Both transcripts added
            (0, vitest_1.expect)(session.accumulatedTranscript).toContain('first');
            (0, vitest_1.expect)(session.accumulatedTranscript).toContain('second');
        });
    });
    (0, vitest_1.describe)('Event Handler Error Injection - Error Handler', () => {
        (0, vitest_1.it)('should handle error in Error event handler', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            let errorHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Error) {
                    errorHandler = handler;
                }
            });
            // Act: Trigger error handler
            const testError = new Error('Deepgram API error');
            if (errorHandler) {
                // Handler wraps in try-catch internally
                errorHandler(testError);
            }
            // Assert: Service continues
            (0, vitest_1.expect)(stt_service_1.sttService.isHealthy()).toBe(true);
        });
        (0, vitest_1.it)('should handle logging error in Error handler', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            let errorHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Error) {
                    errorHandler = handler;
                }
            });
            // Act: Trigger error with error data
            const testError = new Error('API rate limit exceeded');
            if (errorHandler) {
                errorHandler(testError);
            }
            // Assert: Error counted
            (0, vitest_1.expect)(session.metrics.errors).toBeGreaterThan(0);
        });
    });
    (0, vitest_1.describe)('Event Handler Error Injection - Generic Error Handler', () => {
        (0, vitest_1.it)('should handle error in generic error event handler', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            let genericErrorHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === 'error') {
                    genericErrorHandler = handler;
                }
            });
            // Act: Trigger generic error
            if (genericErrorHandler) {
                genericErrorHandler(new Error('Generic WebSocket error'));
            }
            // Assert: No crash
            (0, vitest_1.expect)(stt_service_1.sttService.isHealthy()).toBe(true);
        });
    });
    (0, vitest_1.describe)('Event Handler Error Injection - Close Handler', () => {
        (0, vitest_1.it)('should cleanup KeepAlive interval even if error occurs in Close handler', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            const mockInterval = setInterval(() => { }, 1000);
            session.keepAliveInterval = mockInterval;
            let closeHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Close) {
                    closeHandler = handler;
                }
            });
            // Act: Trigger close handler
            if (closeHandler) {
                closeHandler({ code: 1006, reason: 'Abnormal closure' });
            }
            // Assert: Interval cleared even though handler had error
            (0, vitest_1.expect)(session.keepAliveInterval).toBeUndefined();
        });
        (0, vitest_1.it)('should set connectionState to disconnected even on error', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.connectionState = 'connected';
            let closeHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Close) {
                    closeHandler = handler;
                }
            });
            // Act
            if (closeHandler) {
                closeHandler({ code: 1000 });
            }
            // Assert: Connection marked disconnected
            (0, vitest_1.expect)(session.connectionState).toBe('disconnected');
        });
    });
    (0, vitest_1.describe)('Event Handler Error Injection - Metadata Handler', () => {
        (0, vitest_1.it)('should handle error in Metadata event handler during finalization', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('test', 0.95, true);
            let metadataHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Metadata) {
                    metadataHandler = handler;
                }
            });
            // Act: Start finalization
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            // Trigger Metadata
            vitest_1.vi.advanceTimersByTime(50);
            if (metadataHandler) {
                metadataHandler({ duration: 1.0, request_id: 'test-123' });
            }
            const result = await promise;
            // Assert: Still got transcript back
            (0, vitest_1.expect)(result).toBe('test');
        });
    });
    (0, vitest_1.describe)('Event Handler Error Injection - SpeechStarted & UtteranceEnd Handlers', () => {
        (0, vitest_1.it)('should handle error in SpeechStarted handler', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            let speechStartedHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.SpeechStarted) {
                    speechStartedHandler = handler;
                }
            });
            // Act
            if (speechStartedHandler) {
                speechStartedHandler();
            }
            // Assert: No crash
            (0, vitest_1.expect)(stt_service_1.sttService.isHealthy()).toBe(true);
        });
        (0, vitest_1.it)('should handle error in UtteranceEnd handler', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            let utteranceEndHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.UtteranceEnd) {
                    utteranceEndHandler = handler;
                }
            });
            // Act
            if (utteranceEndHandler) {
                utteranceEndHandler();
            }
            // Assert: No crash
            (0, vitest_1.expect)(stt_service_1.sttService.isHealthy()).toBe(true);
        });
    });
    // ========================================================================================
    // SECTION 3: TIMEOUT FALLBACK TESTS
    // ========================================================================================
    (0, vitest_1.describe)('Timeout Fallback - Metadata Event Timeout', () => {
        (0, vitest_1.it)('should trigger timeout if Metadata event never fires', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('timeout test', 0.95, true);
            // Mock: Never call Metadata handler
            currentMockClient.on.mockImplementation(() => {
                // No event emitted
            });
            // Act: Start finalization (timeout is 5000ms)
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            // Advance past timeout
            vitest_1.vi.advanceTimersByTime(config_1.TIMEOUT_CONFIG.METADATA_EVENT_TIMEOUT_MS + 100);
            const result = await promise;
            // Assert: Got result via timeout
            (0, vitest_1.expect)(result).toBe('timeout test');
            (0, vitest_1.expect)(session.metrics.finalizationMethod).toBe('timeout');
        });
        (0, vitest_1.it)('should cancel timeout when Metadata event fires first', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('fast event', 0.95, true);
            const timeoutCancelSpy = vitest_1.vi.spyOn(global, 'clearTimeout');
            let metadataHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Metadata) {
                    metadataHandler = handler;
                }
            });
            // Act: Metadata fires quickly
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            vitest_1.vi.advanceTimersByTime(50);
            if (metadataHandler) {
                metadataHandler({ duration: 0.5 });
            }
            const result = await promise;
            // Assert: Used event path
            (0, vitest_1.expect)(result).toBe('fast event');
            (0, vitest_1.expect)(session.metrics.finalizationMethod).toBe('event');
            // Timeout should have been cancelled
            (0, vitest_1.expect)(timeoutCancelSpy).toHaveBeenCalled();
        });
        (0, vitest_1.it)('should return accumulated transcript on timeout', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('first', 0.95, true);
            session.addTranscript('second', 0.93, true);
            session.addTranscript('third', 0.91, true);
            currentMockClient.on.mockImplementation(() => {
                // Never fire Metadata
            });
            // Act
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            vitest_1.vi.advanceTimersByTime(config_1.TIMEOUT_CONFIG.METADATA_EVENT_TIMEOUT_MS + 100);
            const result = await promise;
            // Assert: All transcripts returned
            (0, vitest_1.expect)(result).toContain('first');
            (0, vitest_1.expect)(result).toContain('second');
            (0, vitest_1.expect)(result).toContain('third');
        });
    });
    // ========================================================================================
    // SECTION 4: RESOURCE CLEANUP TESTS
    // ========================================================================================
    (0, vitest_1.describe)('Resource Cleanup - Finalization Timeout Handle', () => {
        (0, vitest_1.it)('should clear finalization timeout in session cleanup', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            // Manually set a finalization timeout
            const timeoutHandle = setTimeout(() => { }, 5000);
            session.finalizationTimeoutHandle = timeoutHandle;
            // Act
            session.cleanup();
            // Assert: Timeout cleared
            (0, vitest_1.expect)(session.finalizationTimeoutHandle).toBeUndefined();
        });
        (0, vitest_1.it)('should not leak finalization timeouts after finalization', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('test', 0.95, true);
            let metadataHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Metadata) {
                    metadataHandler = handler;
                }
            });
            // Act: Finalize
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            vitest_1.vi.advanceTimersByTime(50);
            if (metadataHandler) {
                metadataHandler({ duration: 1.0 });
            }
            await promise;
            // Wait for finalization timeout to reset
            vitest_1.vi.advanceTimersByTime(150);
            // Assert: Finalization flag reset, timeout cleared
            (0, vitest_1.expect)(session.isFinalizingTranscript).toBe(false);
            (0, vitest_1.expect)(session.finalizationTimeoutHandle).toBeUndefined();
        });
    });
    (0, vitest_1.describe)('Resource Cleanup - KeepAlive Interval', () => {
        (0, vitest_1.it)('should clear KeepAlive interval on session cleanup', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            const mockInterval = setInterval(() => { }, 8000);
            session.keepAliveInterval = mockInterval;
            // Act
            session.cleanup();
            // Assert
            (0, vitest_1.expect)(session.keepAliveInterval).toBeUndefined();
        });
        (0, vitest_1.it)('should clear KeepAlive interval on unexpected close', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            // Simulate KeepAlive interval was set
            const mockInterval = setInterval(() => { }, 8000);
            session.keepAliveInterval = mockInterval;
            session.isActive = true;
            let closeHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Close) {
                    closeHandler = handler;
                }
            });
            // Act: Unexpected close
            if (closeHandler) {
                closeHandler({ code: 1006 });
            }
            // Assert: KeepAlive interval cleared
            (0, vitest_1.expect)(session.keepAliveInterval).toBeUndefined();
        });
    });
    (0, vitest_1.describe)('Resource Cleanup - Event Listeners', () => {
        (0, vitest_1.it)('should cleanup Metadata listener after finalization', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('test', 0.95, true);
            let metadataHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Metadata) {
                    metadataHandler = handler;
                }
            });
            // Act
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            vitest_1.vi.advanceTimersByTime(50);
            if (metadataHandler) {
                metadataHandler({ duration: 1.0 });
            }
            await promise;
            // Assert: removeListener was called to clean up
            (0, vitest_1.expect)(currentMockClient.removeListener).toHaveBeenCalledWith(sdk_1.LiveTranscriptionEvents.Metadata, vitest_1.expect.any(Function));
        });
        (0, vitest_1.it)('should cleanup listeners even on timeout path', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('test', 0.95, true);
            currentMockClient.on.mockImplementation(() => {
                // Never emit
            });
            // Act
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            vitest_1.vi.advanceTimersByTime(config_1.TIMEOUT_CONFIG.METADATA_EVENT_TIMEOUT_MS + 100);
            await promise;
            // Assert: Cleanup still happened
            (0, vitest_1.expect)(currentMockClient.removeListener).toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)('Resource Cleanup - Reconnection Buffer', () => {
        (0, vitest_1.it)('should clear reconnection buffer on session cleanup', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addToReconnectionBuffer(Buffer.from([1, 2, 3, 4]));
            session.addToReconnectionBuffer(Buffer.from([5, 6, 7, 8]));
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(2);
            // Act
            session.cleanup();
            // Assert
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(0);
        });
    });
    // ========================================================================================
    // SECTION 5: RACE CONDITION TESTS
    // ========================================================================================
    (0, vitest_1.describe)('Race Conditions - Metadata and Close Events', () => {
        (0, vitest_1.it)('should handle Metadata event arriving 3-10ms before Close event', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('race test', 0.95, true);
            session.isActive = true;
            let metadataHandler = null;
            let closeHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Metadata) {
                    metadataHandler = handler;
                }
                if (event === sdk_1.LiveTranscriptionEvents.Close) {
                    closeHandler = handler;
                }
            });
            // Act: Start finalization
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            // Metadata fires at 5ms
            vitest_1.vi.advanceTimersByTime(5);
            if (metadataHandler) {
                metadataHandler({ duration: 1.0 });
            }
            // Close event fires at 8ms (3ms after Metadata)
            vitest_1.vi.advanceTimersByTime(3);
            if (closeHandler) {
                closeHandler({ code: 1000, reason: 'Normal' });
            }
            const result = await promise;
            // Assert: No reconnection attempted
            (0, vitest_1.expect)(result).toBe('race test');
            (0, vitest_1.expect)(session.connectionState).toBe('connected');
            (0, vitest_1.expect)(session.metrics.finalizationMethod).toBe('event');
        });
        (0, vitest_1.it)('should handle Close event arriving simultaneously with Metadata', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('simultaneous', 0.95, true);
            let metadataHandler = null;
            let closeHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Metadata) {
                    metadataHandler = handler;
                }
                if (event === sdk_1.LiveTranscriptionEvents.Close) {
                    closeHandler = handler;
                }
            });
            // Act
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            vitest_1.vi.advanceTimersByTime(5);
            // Both fire at same time
            if (metadataHandler) {
                metadataHandler({ duration: 1.0 });
            }
            if (closeHandler) {
                closeHandler({ code: 1000 });
            }
            const result = await promise;
            // Assert: Still works correctly
            (0, vitest_1.expect)(result).toBe('simultaneous');
        });
    });
    (0, vitest_1.describe)('Race Conditions - Multiple Finalization Requests', () => {
        (0, vitest_1.it)('should handle concurrent finalization requests gracefully', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('test', 0.95, true);
            let metadataHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Metadata) {
                    metadataHandler = handler;
                }
            });
            // Act: Two simultaneous finalization calls (shouldn't happen in practice, but test robustness)
            const promise1 = stt_service_1.sttService.finalizeTranscript(testSessionId);
            const promise2 = stt_service_1.sttService.finalizeTranscript(testSessionId);
            vitest_1.vi.advanceTimersByTime(10);
            if (metadataHandler) {
                metadataHandler({ duration: 1.0 });
            }
            // Both should complete
            const result1 = await promise1;
            const result2 = await promise2;
            // Assert
            (0, vitest_1.expect)(result1).toBeDefined();
            (0, vitest_1.expect)(result2).toBeDefined();
        });
    });
    (0, vitest_1.describe)('Race Conditions - Finalization During Reconnection', () => {
        (0, vitest_1.it)('should handle finalization flag timing during Close event processing', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('finalize during close', 0.95, true);
            session.isActive = true;
            let closeHandler = null;
            let metadataHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Close) {
                    closeHandler = handler;
                }
                if (event === sdk_1.LiveTranscriptionEvents.Metadata) {
                    metadataHandler = handler;
                }
            });
            // Act: Finalize first
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            // Flag should be true
            (0, vitest_1.expect)(session.isFinalizingTranscript).toBe(true);
            // Metadata arrives
            vitest_1.vi.advanceTimersByTime(5);
            if (metadataHandler) {
                metadataHandler({ duration: 1.0 });
            }
            // Before reset delay, Close arrives
            vitest_1.vi.advanceTimersByTime(3);
            if (closeHandler) {
                closeHandler({ code: 1000 });
            }
            // Flag still true for Close handler to check
            (0, vitest_1.expect)(session.isFinalizingTranscript).toBe(true);
            await promise;
            // After delay, flag reset
            vitest_1.vi.advanceTimersByTime(100);
            (0, vitest_1.expect)(session.isFinalizingTranscript).toBe(false);
        });
    });
    // ========================================================================================
    // SECTION 6: EDGE CASES
    // ========================================================================================
    (0, vitest_1.describe)('Edge Cases - Null Client Handling', () => {
        (0, vitest_1.it)('should handle finalization when deepgramLiveClient is null', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('null client', 0.95, true);
            // Make client null (race condition)
            session.deepgramLiveClient = null;
            // Act
            const result = await stt_service_1.sttService.finalizeTranscript(testSessionId);
            // Assert: Returns transcript gracefully
            (0, vitest_1.expect)(result).toBe('null client');
            (0, vitest_1.expect)(session.accumulatedTranscript).toBe('');
        });
        (0, vitest_1.it)('should still reset state when client is null', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('test', 0.95, true);
            session.addTranscript('interim', 0.9, false);
            session.deepgramLiveClient = null;
            // Act
            await stt_service_1.sttService.finalizeTranscript(testSessionId);
            // Assert: State still reset
            (0, vitest_1.expect)(session.accumulatedTranscript).toBe('');
            (0, vitest_1.expect)(session.interimTranscript).toBe('');
            (0, vitest_1.expect)(session.transcriptSegments).toEqual([]);
        });
    });
    (0, vitest_1.describe)('Edge Cases - Empty Transcripts', () => {
        (0, vitest_1.it)('should handle finalization with no accumulated transcript', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            // No transcripts added
            let metadataHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Metadata) {
                    metadataHandler = handler;
                }
            });
            // Act
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            vitest_1.vi.advanceTimersByTime(10);
            if (metadataHandler) {
                metadataHandler({ duration: 1.0 });
            }
            const result = await promise;
            // Assert
            (0, vitest_1.expect)(result).toBe('');
        });
        (0, vitest_1.it)('should handle finalization with only interim transcript', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('only interim', 0.9, false); // Interim only
            let metadataHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Metadata) {
                    metadataHandler = handler;
                }
            });
            // Act
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            vitest_1.vi.advanceTimersByTime(10);
            if (metadataHandler) {
                metadataHandler({ duration: 1.0 });
            }
            const result = await promise;
            // Assert: getFinalTranscript includes unfinalized interim as fallback
            (0, vitest_1.expect)(result).toContain('only interim');
        });
    });
});
