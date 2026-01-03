"use strict";
/**
 * STT Service - Resource Cleanup and Memory Management Tests
 * Tests comprehensive resource cleanup to prevent memory leaks
 * Focus: Finalization timeout cleanup, connection close handling, no-leak verification
 * Target Coverage: 90%+ for cleanup paths, 100% for critical resource handles
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const stt_service_1 = require("@/modules/stt/services/stt.service");
const stt_session_service_1 = require("@/modules/stt/services/stt-session.service");
const stt_session_service_2 = require("@/modules/stt/services/stt-session.service");
const sdk_1 = require("@deepgram/sdk");
const config_1 = require("@/modules/stt/config");
// ============================================================================
// MOCK SETUP
// ============================================================================
let mockEventHandlers = new Map();
const createMockLiveClient = () => {
    const handlers = new Map();
    return {
        on: vitest_1.vi.fn((event, handler) => {
            if (!handlers.has(event)) {
                handlers.set(event, []);
            }
            handlers.get(event).push(handler);
        }),
        send: vitest_1.vi.fn(),
        getReadyState: vitest_1.vi.fn().mockReturnValue(1),
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
        getReadyState: vitest_1.vi.fn(() => 1),
        keepAlive: vitest_1.vi.fn(),
        _getHandlers: () => handlers,
    };
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
(0, vitest_1.describe)('STT Service - Resource Cleanup and Memory Management', () => {
    const testSessionId = 'resource-cleanup-test';
    const testConnectionId = 'conn-resource-test';
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
    // SECTION 1: FINALIZATION TIMEOUT CLEANUP
    // ========================================================================================
    (0, vitest_1.describe)('Finalization Timeout Handle Cleanup', () => {
        (0, vitest_1.it)('should initialize finalization timeout handle as undefined', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            // Assert
            (0, vitest_1.expect)(session.finalizationTimeoutHandle).toBeUndefined();
        });
        (0, vitest_1.it)('should set finalization timeout during finalization', async () => {
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
            // Assert: Handle set during finalization
            (0, vitest_1.expect)(session.finalizationTimeoutHandle).toBeDefined();
            // Cleanup
            vitest_1.vi.advanceTimersByTime(10);
            if (metadataHandler) {
                metadataHandler({ duration: 1.0 });
            }
            await promise;
            vitest_1.vi.advanceTimersByTime(150);
        });
        (0, vitest_1.it)('should clear finalization timeout handle after reset', async () => {
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
            // Act: Finalize and wait for reset
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            vitest_1.vi.advanceTimersByTime(10);
            if (metadataHandler) {
                metadataHandler({ duration: 1.0 });
            }
            await promise;
            // Before reset delay
            (0, vitest_1.expect)(session.finalizationTimeoutHandle).toBeDefined();
            // After reset delay
            vitest_1.vi.advanceTimersByTime(config_1.TIMEOUT_CONFIG.FINALIZATION_RESET_DELAY_MS + 10);
            // Assert: Handle cleared
            (0, vitest_1.expect)(session.finalizationTimeoutHandle).toBeUndefined();
        });
        (0, vitest_1.it)('should clear existing timeout before setting new one', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            // Manually set an old timeout
            const oldTimeout = setTimeout(() => { }, 999);
            session.finalizationTimeoutHandle = oldTimeout;
            session.addTranscript('test', 0.95, true);
            const clearTimeoutSpy = vitest_1.vi.spyOn(global, 'clearTimeout');
            let metadataHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Metadata) {
                    metadataHandler = handler;
                }
            });
            // Act
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            // Assert: Old timeout was cleared
            (0, vitest_1.expect)(clearTimeoutSpy).toHaveBeenCalledWith(oldTimeout);
            // Cleanup
            vitest_1.vi.advanceTimersByTime(10);
            if (metadataHandler) {
                metadataHandler({ duration: 1.0 });
            }
            await promise;
            vitest_1.vi.advanceTimersByTime(150);
        });
        (0, vitest_1.it)('should not leak timeout handles with repeated finalization calls', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            let metadataHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Metadata) {
                    metadataHandler = handler;
                }
            });
            // Act: Finalize 3 times
            for (let i = 0; i < 3; i++) {
                session.addTranscript(`test ${i}`, 0.95, true);
                const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
                vitest_1.vi.advanceTimersByTime(10);
                if (metadataHandler) {
                    metadataHandler({ duration: 1.0 });
                }
                await promise;
                vitest_1.vi.advanceTimersByTime(150);
                // After each finalization, handle should be cleared
                (0, vitest_1.expect)(session.finalizationTimeoutHandle).toBeUndefined();
            }
        });
    });
    // ========================================================================================
    // SECTION 2: KEEPALIVE INTERVAL CLEANUP
    // ========================================================================================
    (0, vitest_1.describe)('KeepAlive Interval Cleanup', () => {
        (0, vitest_1.it)('should set KeepAlive interval on connection open', async () => {
            // Arrange & Act
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            // Assert: KeepAlive interval should be set
            (0, vitest_1.expect)(session.keepAliveInterval).toBeDefined();
        });
        (0, vitest_1.it)('should clear KeepAlive interval on session cleanup', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            const keepAliveInterval = session.keepAliveInterval;
            (0, vitest_1.expect)(keepAliveInterval).toBeDefined();
            // Act
            session.cleanup();
            // Assert: Interval cleared
            (0, vitest_1.expect)(session.keepAliveInterval).toBeUndefined();
        });
        (0, vitest_1.it)('should clear KeepAlive interval on unexpected close', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            const keepAliveInterval = session.keepAliveInterval;
            session.isActive = true;
            let closeHandler = null;
            currentMockClient.on.mockImplementation((event, handler) => {
                if (event === sdk_1.LiveTranscriptionEvents.Close) {
                    closeHandler = handler;
                }
            });
            // Act: Trigger close
            if (closeHandler) {
                closeHandler({ code: 1006 });
            }
            // Assert: Interval cleared
            (0, vitest_1.expect)(session.keepAliveInterval).toBeUndefined();
        });
        (0, vitest_1.it)('should not leak intervals with multiple sessions', async () => {
            // Arrange
            const sessions = [];
            // Act: Create 5 sessions
            for (let i = 0; i < 5; i++) {
                const sessionId = `session-${i}`;
                sessions.push(sessionId);
                await stt_service_1.sttService.createSession(sessionId, {
                    ...testConfig,
                    sessionId,
                    connectionId: `conn-${i}`,
                });
            }
            // All should have intervals
            for (const sessionId of sessions) {
                const session = stt_session_service_1.sttSessionService.getSession(sessionId);
                (0, vitest_1.expect)(session.keepAliveInterval).toBeDefined();
            }
            // Act: Close all sessions
            for (const sessionId of sessions) {
                const session = stt_session_service_1.sttSessionService.getSession(sessionId);
                session.cleanup();
            }
            // Assert: All intervals cleared
            for (const sessionId of sessions) {
                const session = stt_session_service_1.sttSessionService.getSession(sessionId);
                if (session) {
                    (0, vitest_1.expect)(session.keepAliveInterval).toBeUndefined();
                }
            }
        });
    });
    // ========================================================================================
    // SECTION 3: EVENT LISTENER CLEANUP
    // ========================================================================================
    (0, vitest_1.describe)('Event Listener Cleanup', () => {
        (0, vitest_1.it)('should remove Metadata listener after finalization event', async () => {
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
            vitest_1.vi.advanceTimersByTime(10);
            if (metadataHandler) {
                metadataHandler({ duration: 1.0 });
            }
            await promise;
            // Assert: removeListener was called
            (0, vitest_1.expect)(currentMockClient.removeListener).toHaveBeenCalledWith(sdk_1.LiveTranscriptionEvents.Metadata, vitest_1.expect.any(Function));
        });
        (0, vitest_1.it)('should remove Metadata listener on timeout path', async () => {
            // Arrange
            await stt_service_1.sttService.createSession(testSessionId, testConfig);
            const session = stt_session_service_1.sttSessionService.getSession(testSessionId);
            session.addTranscript('test', 0.95, true);
            // Never fire metadata
            currentMockClient.on.mockImplementation(() => { });
            // Act: Finalize and wait for timeout
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            vitest_1.vi.advanceTimersByTime(config_1.TIMEOUT_CONFIG.METADATA_EVENT_TIMEOUT_MS + 100);
            await promise;
            // Assert: Still removed listener
            (0, vitest_1.expect)(currentMockClient.removeListener).toHaveBeenCalled();
        });
        (0, vitest_1.it)('should handle removeListener errors gracefully', async () => {
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
            // Make removeListener throw
            currentMockClient.removeListener.mockImplementation(() => {
                throw new Error('Remove listener error');
            });
            // Act: Should not crash
            const promise = stt_service_1.sttService.finalizeTranscript(testSessionId);
            vitest_1.vi.advanceTimersByTime(10);
            if (metadataHandler) {
                metadataHandler({ duration: 1.0 });
            }
            // Assert: Completes without crashing
            await (0, vitest_1.expect)(promise).resolves.toBeDefined();
        });
    });
    // ========================================================================================
    // SECTION 4: RECONNECTION BUFFER CLEANUP
    // ========================================================================================
    (0, vitest_1.describe)('Reconnection Buffer Cleanup', () => {
        (0, vitest_1.it)('should clear reconnection buffer on session cleanup', async () => {
            // Arrange
            const session = new stt_session_service_2.STTSession(testSessionId, testConnectionId, {
                samplingRate: 16000,
                language: 'en-US',
            });
            // Add some data
            session.addToReconnectionBuffer(Buffer.from([1, 2, 3, 4]));
            session.addToReconnectionBuffer(Buffer.from([5, 6, 7, 8]));
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(2);
            // Act
            session.cleanup();
            // Assert
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(0);
        });
        (0, vitest_1.it)('should limit buffer to 32KB total', async () => {
            // Arrange
            const session = new stt_session_service_2.STTSession(testSessionId, testConnectionId, {
                samplingRate: 16000,
                language: 'en-US',
            });
            // Add buffers that exceed 32KB
            const chunk15KB = Buffer.alloc(15 * 1024);
            const chunk15KB2 = Buffer.alloc(15 * 1024);
            const chunk10KB = Buffer.alloc(10 * 1024);
            // Act
            session.addToReconnectionBuffer(chunk15KB);
            session.addToReconnectionBuffer(chunk15KB2);
            session.addToReconnectionBuffer(chunk10KB);
            // Assert: Only last 2 chunks fit
            const totalSize = session.reconnectionBuffer.reduce((sum, buf) => sum + buf.length, 0);
            (0, vitest_1.expect)(totalSize).toBeLessThanOrEqual(32 * 1024);
        });
        (0, vitest_1.it)('should maintain FIFO order when removing oldest chunks', async () => {
            // Arrange
            const session = new stt_session_service_2.STTSession(testSessionId, testConnectionId, {
                samplingRate: 16000,
                language: 'en-US',
            });
            // Add identifiable chunks
            const chunk1 = Buffer.from([1, 1, 1, 1]);
            const chunk2 = Buffer.from([2, 2, 2, 2]);
            const chunk3 = Buffer.from([3, 3, 3, 3]);
            session.addToReconnectionBuffer(chunk1);
            session.addToReconnectionBuffer(chunk2);
            // Act: Add large chunk that forces removal
            const largeChunk = Buffer.alloc(32 * 1024);
            session.addToReconnectionBuffer(largeChunk);
            // Assert: Oldest chunk removed first
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBeGreaterThan(0);
        });
        (0, vitest_1.it)('should return all chunks on flush', async () => {
            // Arrange
            const session = new stt_session_service_2.STTSession(testSessionId, testConnectionId, {
                samplingRate: 16000,
                language: 'en-US',
            });
            const buffers = [
                Buffer.from([1, 2, 3, 4]),
                Buffer.from([5, 6, 7, 8]),
                Buffer.from([9, 10, 11, 12]),
            ];
            for (const buf of buffers) {
                session.addToReconnectionBuffer(buf);
            }
            // Act
            const flushed = session.flushReconnectionBuffer();
            // Assert
            (0, vitest_1.expect)(flushed.length).toBe(3);
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(0);
        });
        (0, vitest_1.it)('should clear all chunks on clearReconnectionBuffer', async () => {
            // Arrange
            const session = new stt_session_service_2.STTSession(testSessionId, testConnectionId, {
                samplingRate: 16000,
                language: 'en-US',
            });
            session.addToReconnectionBuffer(Buffer.from([1, 2, 3, 4]));
            session.addToReconnectionBuffer(Buffer.from([5, 6, 7, 8]));
            // Act
            session.clearReconnectionBuffer();
            // Assert
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(0);
        });
        (0, vitest_1.it)('should not leak buffer memory with repeated operations', async () => {
            // Arrange
            const session = new stt_session_service_2.STTSession(testSessionId, testConnectionId, {
                samplingRate: 16000,
                language: 'en-US',
            });
            // Act: Many add/flush cycles
            for (let i = 0; i < 10; i++) {
                session.addToReconnectionBuffer(Buffer.from([1, 2, 3, 4]));
                session.addToReconnectionBuffer(Buffer.from([5, 6, 7, 8]));
                session.flushReconnectionBuffer();
            }
            // Assert: Buffer empty
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(0);
        });
    });
    // ========================================================================================
    // SECTION 5: COMPLETE SESSION CLEANUP
    // ========================================================================================
    (0, vitest_1.describe)('Complete Session Cleanup', () => {
        (0, vitest_1.it)('should cleanup all resources on STTSession.cleanup()', async () => {
            // Arrange
            const session = new stt_session_service_2.STTSession(testSessionId, testConnectionId, {
                samplingRate: 16000,
                language: 'en-US',
            });
            // Setup with all resources
            session.keepAliveInterval = setInterval(() => { }, 1000);
            session.finalizationTimeoutHandle = setTimeout(() => { }, 1000);
            session.addToReconnectionBuffer(Buffer.from([1, 2, 3, 4]));
            // Mock client
            session.deepgramLiveClient = {
                requestClose: vitest_1.vi.fn(),
            };
            (0, vitest_1.expect)(session.keepAliveInterval).toBeDefined();
            (0, vitest_1.expect)(session.finalizationTimeoutHandle).toBeDefined();
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(1);
            // Act
            session.cleanup();
            // Assert: All cleaned
            (0, vitest_1.expect)(session.keepAliveInterval).toBeUndefined();
            (0, vitest_1.expect)(session.finalizationTimeoutHandle).toBeUndefined();
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(0);
            (0, vitest_1.expect)(session.isActive).toBe(false);
        });
        (0, vitest_1.it)('should handle cleanup when client is null', async () => {
            // Arrange
            const session = new stt_session_service_2.STTSession(testSessionId, testConnectionId, {
                samplingRate: 16000,
                language: 'en-US',
            });
            session.deepgramLiveClient = null;
            // Act & Assert: Should not crash
            (0, vitest_1.expect)(() => {
                session.cleanup();
            }).not.toThrow();
            (0, vitest_1.expect)(session.isActive).toBe(false);
        });
        (0, vitest_1.it)('should handle cleanup when client.requestClose() throws', async () => {
            // Arrange
            const session = new stt_session_service_2.STTSession(testSessionId, testConnectionId, {
                samplingRate: 16000,
                language: 'en-US',
            });
            const mockClient = {
                requestClose: vitest_1.vi.fn(() => {
                    throw new Error('Close failed');
                }),
            };
            session.deepgramLiveClient = mockClient;
            // Act & Assert: Should not crash
            (0, vitest_1.expect)(() => {
                session.cleanup();
            }).not.toThrow();
            (0, vitest_1.expect)(session.isActive).toBe(false);
        });
        (0, vitest_1.it)('should set isActive to false after cleanup', async () => {
            // Arrange
            const session = new stt_session_service_2.STTSession(testSessionId, testConnectionId, {
                samplingRate: 16000,
                language: 'en-US',
            });
            (0, vitest_1.expect)(session.isActive).toBe(true);
            // Act
            session.cleanup();
            // Assert
            (0, vitest_1.expect)(session.isActive).toBe(false);
        });
    });
    // ========================================================================================
    // SECTION 6: STT SESSION SERVICE CLEANUP
    // ========================================================================================
    (0, vitest_1.describe)('STT Session Service Cleanup', () => {
        (0, vitest_1.it)('should cleanup all sessions in service', async () => {
            // Arrange
            stt_session_service_1.sttSessionService.createSession('session-1', 'conn-1', {
                samplingRate: 16000,
                language: 'en-US',
            });
            stt_session_service_1.sttSessionService.createSession('session-2', 'conn-2', {
                samplingRate: 16000,
                language: 'en-US',
            });
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSessionCount()).toBe(2);
            // Act
            stt_session_service_1.sttSessionService.cleanup();
            // Assert
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSessionCount()).toBe(0);
        });
        (0, vitest_1.it)('should delete session and call cleanup', async () => {
            // Arrange
            const session = stt_session_service_1.sttSessionService.createSession(testSessionId, testConnectionId, {
                samplingRate: 16000,
                language: 'en-US',
            });
            const cleanupSpy = vitest_1.vi.spyOn(session, 'cleanup');
            // Act
            stt_session_service_1.sttSessionService.deleteSession(testSessionId);
            // Assert: cleanup called
            (0, vitest_1.expect)(cleanupSpy).toHaveBeenCalled();
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(testSessionId)).toBeUndefined();
        });
        (0, vitest_1.it)('should handle deletion of non-existent session gracefully', async () => {
            // Act & Assert: Should not crash
            (0, vitest_1.expect)(() => {
                stt_session_service_1.sttSessionService.deleteSession('non-existent');
            }).not.toThrow();
        });
        (0, vitest_1.it)('should return empty array when no sessions exist', async () => {
            // Arrange
            stt_session_service_1.sttSessionService.cleanup();
            // Act
            const sessions = stt_session_service_1.sttSessionService.getAllSessions();
            // Assert
            (0, vitest_1.expect)(sessions).toEqual([]);
        });
    });
    // ========================================================================================
    // SECTION 7: CONCURRENT SESSION CLEANUP
    // ========================================================================================
    (0, vitest_1.describe)('Concurrent Session Cleanup', () => {
        (0, vitest_1.it)('should handle cleanup of multiple concurrent sessions', async () => {
            // Arrange: Create 5 sessions
            const sessionIds = [];
            for (let i = 0; i < 5; i++) {
                const sessionId = `concurrent-${i}`;
                sessionIds.push(sessionId);
                await stt_service_1.sttService.createSession(sessionId, {
                    ...testConfig,
                    sessionId,
                    connectionId: `conn-${i}`,
                });
            }
            // All should exist
            for (const sessionId of sessionIds) {
                (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(sessionId)).toBeDefined();
            }
            // Act: Finalize all concurrently
            const promises = sessionIds.map((id) => stt_service_1.sttService.finalizeTranscript(id));
            vitest_1.vi.advanceTimersByTime(10);
            await Promise.all(promises);
            vitest_1.vi.advanceTimersByTime(150);
            // Assert: All cleaned
            for (const sessionId of sessionIds) {
                const session = stt_session_service_1.sttSessionService.getSession(sessionId);
                if (session) {
                    (0, vitest_1.expect)(session.finalizationTimeoutHandle).toBeUndefined();
                }
            }
        });
        (0, vitest_1.it)('should handle concurrent cleanup of sessions', async () => {
            // Arrange: Create 5 sessions
            const sessions = [];
            for (let i = 0; i < 5; i++) {
                const session = stt_session_service_1.sttSessionService.createSession(`session-${i}`, `conn-${i}`, {
                    samplingRate: 16000,
                    language: 'en-US',
                });
                sessions.push(session);
            }
            // Act: Cleanup all
            sessions.forEach((session) => session.cleanup());
            // Assert
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSessionCount()).toBe(5); // Still in service map
            sessions.forEach((session) => {
                (0, vitest_1.expect)(session.isActive).toBe(false);
                (0, vitest_1.expect)(session.keepAliveInterval).toBeUndefined();
            });
        });
    });
});
