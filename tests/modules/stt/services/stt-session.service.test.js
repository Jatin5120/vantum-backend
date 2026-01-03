"use strict";
/**
 * STTSessionService Unit Tests
 * Tests session state management
 * Target Coverage: 80%+
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const stt_session_service_1 = require("@/modules/stt/services/stt-session.service");
(0, vitest_1.describe)('STTSession', () => {
    const mockSessionId = 'test-session-123';
    const mockConnectionId = 'test-connection-456';
    const mockConfig = {
        samplingRate: 16000,
        language: 'en-US',
    };
    let session;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.useFakeTimers();
        vitest_1.vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
        session = new stt_session_service_1.STTSession(mockSessionId, mockConnectionId, mockConfig);
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.describe)('constructor', () => {
        (0, vitest_1.it)('should initialize with correct properties', () => {
            (0, vitest_1.expect)(session.sessionId).toBe(mockSessionId);
            (0, vitest_1.expect)(session.connectionId).toBe(mockConnectionId);
            (0, vitest_1.expect)(session.config.samplingRate).toBe(16000);
            (0, vitest_1.expect)(session.config.language).toBe('en-US');
            (0, vitest_1.expect)(session.config.model).toBe('nova-2');
            (0, vitest_1.expect)(session.deepgramLiveClient).toBeNull();
            (0, vitest_1.expect)(session.connectionState).toBe('connecting');
            (0, vitest_1.expect)(session.accumulatedTranscript).toBe('');
            (0, vitest_1.expect)(session.interimTranscript).toBe('');
            (0, vitest_1.expect)(session.isActive).toBe(true);
            (0, vitest_1.expect)(session.retryCount).toBe(0);
            (0, vitest_1.expect)(session.reconnectAttempts).toBe(0);
        });
        (0, vitest_1.it)('should initialize timestamps', () => {
            const expectedTime = new Date('2024-01-01T00:00:00Z').getTime();
            (0, vitest_1.expect)(session.createdAt).toBe(expectedTime);
            (0, vitest_1.expect)(session.lastActivityAt).toBe(expectedTime);
            (0, vitest_1.expect)(session.lastTranscriptTime).toBe(expectedTime);
        });
        (0, vitest_1.it)('should initialize metrics to zero', () => {
            (0, vitest_1.expect)(session.metrics.chunksReceived).toBe(0);
            (0, vitest_1.expect)(session.metrics.chunksForwarded).toBe(0);
            (0, vitest_1.expect)(session.metrics.transcriptsReceived).toBe(0);
            (0, vitest_1.expect)(session.metrics.errors).toBe(0);
            (0, vitest_1.expect)(session.metrics.reconnections).toBe(0);
        });
        (0, vitest_1.it)('should accept different sampling rates', () => {
            const session8k = new stt_session_service_1.STTSession(mockSessionId, mockConnectionId, {
                samplingRate: 8000,
                language: 'en-US',
            });
            (0, vitest_1.expect)(session8k.config.samplingRate).toBe(8000);
            const session48k = new stt_session_service_1.STTSession(mockSessionId, mockConnectionId, {
                samplingRate: 48000,
                language: 'en-US',
            });
            (0, vitest_1.expect)(session48k.config.samplingRate).toBe(48000);
        });
        (0, vitest_1.it)('should accept different languages', () => {
            const spanishSession = new stt_session_service_1.STTSession(mockSessionId, mockConnectionId, {
                samplingRate: 16000,
                language: 'es-ES',
            });
            (0, vitest_1.expect)(spanishSession.config.language).toBe('es-ES');
        });
    });
    (0, vitest_1.describe)('touch', () => {
        (0, vitest_1.it)('should update lastActivityAt timestamp', () => {
            const initialTime = session.lastActivityAt;
            vitest_1.vi.advanceTimersByTime(5000); // Advance 5 seconds
            session.touch();
            (0, vitest_1.expect)(session.lastActivityAt).toBeGreaterThan(initialTime);
            (0, vitest_1.expect)(session.lastActivityAt).toBe(initialTime + 5000);
        });
        (0, vitest_1.it)('should be callable multiple times', () => {
            const initialTime = session.lastActivityAt;
            vitest_1.vi.advanceTimersByTime(1000);
            session.touch();
            const time1 = session.lastActivityAt;
            vitest_1.vi.advanceTimersByTime(1000);
            session.touch();
            const time2 = session.lastActivityAt;
            (0, vitest_1.expect)(time1).toBe(initialTime + 1000);
            (0, vitest_1.expect)(time2).toBe(initialTime + 2000);
        });
    });
    (0, vitest_1.describe)('addTranscript', () => {
        (0, vitest_1.it)('should add final transcript to accumulated text', () => {
            session.addTranscript('Hello world', 0.95, true);
            (0, vitest_1.expect)(session.accumulatedTranscript).toBe('Hello world ');
            (0, vitest_1.expect)(session.interimTranscript).toBe('');
            (0, vitest_1.expect)(session.metrics.transcriptsReceived).toBe(1);
        });
        (0, vitest_1.it)('should set interim transcript for non-final results', () => {
            session.addTranscript('Hello', 0.85, false);
            (0, vitest_1.expect)(session.accumulatedTranscript).toBe('');
            (0, vitest_1.expect)(session.interimTranscript).toBe('Hello');
            (0, vitest_1.expect)(session.metrics.transcriptsReceived).toBe(1);
        });
        (0, vitest_1.it)('should accumulate multiple final transcripts', () => {
            session.addTranscript('Hello', 0.95, true);
            session.addTranscript('world', 0.93, true);
            session.addTranscript('from', 0.97, true);
            session.addTranscript('Vantum', 0.96, true);
            (0, vitest_1.expect)(session.accumulatedTranscript).toBe('Hello world from Vantum ');
            (0, vitest_1.expect)(session.metrics.transcriptsReceived).toBe(4);
        });
        (0, vitest_1.it)('should clear interim transcript when final transcript arrives', () => {
            session.addTranscript('Hel', 0.75, false);
            (0, vitest_1.expect)(session.interimTranscript).toBe('Hel');
            session.addTranscript('Hello', 0.95, true);
            (0, vitest_1.expect)(session.interimTranscript).toBe('');
            (0, vitest_1.expect)(session.accumulatedTranscript).toBe('Hello ');
        });
        (0, vitest_1.it)('should update transcript segment history', () => {
            const initialTime = Date.now();
            session.addTranscript('First', 0.95, true);
            vitest_1.vi.advanceTimersByTime(1000);
            session.addTranscript('Second', 0.93, false);
            (0, vitest_1.expect)(session.transcriptSegments).toHaveLength(2);
            (0, vitest_1.expect)(session.transcriptSegments[0].text).toBe('First');
            (0, vitest_1.expect)(session.transcriptSegments[0].confidence).toBe(0.95);
            (0, vitest_1.expect)(session.transcriptSegments[0].isFinal).toBe(true);
            (0, vitest_1.expect)(session.transcriptSegments[0].timestamp).toBe(initialTime);
            (0, vitest_1.expect)(session.transcriptSegments[1].text).toBe('Second');
            (0, vitest_1.expect)(session.transcriptSegments[1].confidence).toBe(0.93);
            (0, vitest_1.expect)(session.transcriptSegments[1].isFinal).toBe(false);
            (0, vitest_1.expect)(session.transcriptSegments[1].timestamp).toBe(initialTime + 1000);
        });
        (0, vitest_1.it)('should update lastTranscriptTime', () => {
            const initialTime = session.lastTranscriptTime;
            vitest_1.vi.advanceTimersByTime(2000);
            session.addTranscript('Test', 0.9, true);
            (0, vitest_1.expect)(session.lastTranscriptTime).toBe(initialTime + 2000);
        });
        (0, vitest_1.it)('should handle low confidence transcripts', () => {
            session.addTranscript('Uncertain text', 0.35, false);
            (0, vitest_1.expect)(session.interimTranscript).toBe('Uncertain text');
            (0, vitest_1.expect)(session.transcriptSegments[0].confidence).toBe(0.35);
        });
        (0, vitest_1.it)('should handle empty transcripts', () => {
            session.addTranscript('', 0.0, true);
            (0, vitest_1.expect)(session.accumulatedTranscript).toBe(' '); // Still adds space
            (0, vitest_1.expect)(session.metrics.transcriptsReceived).toBe(1);
        });
    });
    (0, vitest_1.describe)('getFinalTranscript', () => {
        (0, vitest_1.it)('should return trimmed accumulated transcript', () => {
            session.addTranscript('Hello', 0.95, true);
            session.addTranscript('world', 0.93, true);
            const result = session.getFinalTranscript();
            (0, vitest_1.expect)(result).toBe('Hello world');
            (0, vitest_1.expect)(result).not.toContain('  '); // No double spaces
        });
        (0, vitest_1.it)('should return empty string when no transcripts', () => {
            const result = session.getFinalTranscript();
            (0, vitest_1.expect)(result).toBe('');
        });
        (0, vitest_1.it)('should not include interim transcripts', () => {
            session.addTranscript('Final', 0.95, true);
            session.addTranscript('Interim', 0.85, false);
            const result = session.getFinalTranscript();
            (0, vitest_1.expect)(result).toBe('Final');
            (0, vitest_1.expect)(result).not.toContain('Interim');
        });
    });
    (0, vitest_1.describe)('getDuration', () => {
        (0, vitest_1.it)('should return session duration in milliseconds', () => {
            vitest_1.vi.advanceTimersByTime(45000); // 45 seconds
            const duration = session.getDuration();
            (0, vitest_1.expect)(duration).toBe(45000);
        });
        (0, vitest_1.it)('should return 0 immediately after creation', () => {
            const duration = session.getDuration();
            (0, vitest_1.expect)(duration).toBe(0);
        });
        (0, vitest_1.it)('should increase over time', () => {
            const duration1 = session.getDuration();
            vitest_1.vi.advanceTimersByTime(10000);
            const duration2 = session.getDuration();
            vitest_1.vi.advanceTimersByTime(20000);
            const duration3 = session.getDuration();
            (0, vitest_1.expect)(duration1).toBe(0);
            (0, vitest_1.expect)(duration2).toBe(10000);
            (0, vitest_1.expect)(duration3).toBe(30000);
        });
    });
    (0, vitest_1.describe)('getInactivityDuration', () => {
        (0, vitest_1.it)('should return time since last activity', () => {
            vitest_1.vi.advanceTimersByTime(5000);
            session.touch();
            vitest_1.vi.advanceTimersByTime(10000);
            const inactivity = session.getInactivityDuration();
            (0, vitest_1.expect)(inactivity).toBe(10000);
        });
        (0, vitest_1.it)('should return 0 immediately after touch', () => {
            session.touch();
            const inactivity = session.getInactivityDuration();
            (0, vitest_1.expect)(inactivity).toBe(0);
        });
        (0, vitest_1.it)('should reset when touched', () => {
            vitest_1.vi.advanceTimersByTime(15000);
            (0, vitest_1.expect)(session.getInactivityDuration()).toBe(15000);
            session.touch();
            (0, vitest_1.expect)(session.getInactivityDuration()).toBe(0);
            vitest_1.vi.advanceTimersByTime(5000);
            (0, vitest_1.expect)(session.getInactivityDuration()).toBe(5000);
        });
    });
    (0, vitest_1.describe)('cleanup', () => {
        (0, vitest_1.it)('should close Deepgram client if exists', () => {
            const mockClient = {
                requestClose: vitest_1.vi.fn(),
            };
            session.deepgramLiveClient = mockClient;
            session.cleanup();
            (0, vitest_1.expect)(mockClient.requestClose).toHaveBeenCalled();
            (0, vitest_1.expect)(session.deepgramLiveClient).toBeNull();
            (0, vitest_1.expect)(session.isActive).toBe(false);
        });
        (0, vitest_1.it)('should handle null Deepgram client', () => {
            session.deepgramLiveClient = null;
            (0, vitest_1.expect)(() => session.cleanup()).not.toThrow();
            (0, vitest_1.expect)(session.isActive).toBe(false);
        });
        (0, vitest_1.it)('should handle client close errors gracefully', () => {
            const mockClient = {
                requestClose: vitest_1.vi.fn(() => {
                    throw new Error('Close error');
                }),
            };
            session.deepgramLiveClient = mockClient;
            (0, vitest_1.expect)(() => session.cleanup()).not.toThrow();
            (0, vitest_1.expect)(session.deepgramLiveClient).toBeNull();
            (0, vitest_1.expect)(session.isActive).toBe(false);
        });
        (0, vitest_1.it)('should set isActive to false', () => {
            (0, vitest_1.expect)(session.isActive).toBe(true);
            session.cleanup();
            (0, vitest_1.expect)(session.isActive).toBe(false);
        });
        (0, vitest_1.it)('should clear reconnection buffer on cleanup', () => {
            // Add some chunks to buffer
            const chunk1 = Buffer.from([1, 2, 3]);
            const chunk2 = Buffer.from([4, 5, 6]);
            session.reconnectionBuffer.push(chunk1, chunk2);
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(2);
            session.cleanup();
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(0);
        });
    });
    (0, vitest_1.describe)('Reconnection Buffer Management (Phase 2)', () => {
        (0, vitest_1.it)('should add chunks to reconnection buffer', () => {
            const chunk1 = Buffer.from([1, 2, 3, 4]);
            const chunk2 = Buffer.from([5, 6, 7, 8]);
            session.addToReconnectionBuffer(chunk1);
            session.addToReconnectionBuffer(chunk2);
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(2);
            (0, vitest_1.expect)(session.metrics.bufferedChunksDuringReconnection).toBe(2);
        });
        (0, vitest_1.it)('should reject chunks larger than 32KB', () => {
            const MAX_BUFFER_SIZE = 32 * 1024; // 32KB
            const hugeChunk = Buffer.alloc(MAX_BUFFER_SIZE + 1);
            session.addToReconnectionBuffer(hugeChunk);
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(0);
            (0, vitest_1.expect)(session.metrics.bufferedChunksDuringReconnection).toBe(0);
        });
        (0, vitest_1.it)('should remove oldest chunks when buffer exceeds 32KB', () => {
            const MAX_BUFFER_SIZE = 32 * 1024; // 32KB
            // Add chunks totaling 31KB (should fit)
            const chunk1 = Buffer.alloc(15 * 1024); // 15KB
            const chunk2 = Buffer.alloc(15 * 1024); // 15KB
            session.addToReconnectionBuffer(chunk1);
            session.addToReconnectionBuffer(chunk2);
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(2);
            // Add chunk that would exceed max (2KB more)
            const chunk3 = Buffer.alloc(3 * 1024); // 3KB
            session.addToReconnectionBuffer(chunk3);
            // First chunk should be removed
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(2);
            (0, vitest_1.expect)(session.reconnectionBuffer[0]).toBe(chunk2);
            (0, vitest_1.expect)(session.reconnectionBuffer[1]).toBe(chunk3);
        });
        (0, vitest_1.it)('should not grow buffer beyond 32KB even with large chunks', () => {
            const MAX_BUFFER_SIZE = 32 * 1024; // 32KB
            // Add multiple 10KB chunks
            for (let i = 0; i < 5; i++) {
                const chunk = Buffer.alloc(10 * 1024); // 10KB each
                session.addToReconnectionBuffer(chunk);
            }
            // Calculate total buffer size
            const totalSize = session.reconnectionBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
            (0, vitest_1.expect)(totalSize).toBeLessThanOrEqual(MAX_BUFFER_SIZE);
        });
        (0, vitest_1.it)('should flush buffer and return all chunks', () => {
            const chunk1 = Buffer.from([1, 2, 3]);
            const chunk2 = Buffer.from([4, 5, 6]);
            const chunk3 = Buffer.from([7, 8, 9]);
            session.addToReconnectionBuffer(chunk1);
            session.addToReconnectionBuffer(chunk2);
            session.addToReconnectionBuffer(chunk3);
            const flushed = session.flushReconnectionBuffer();
            (0, vitest_1.expect)(flushed.length).toBe(3);
            (0, vitest_1.expect)(flushed[0]).toEqual(chunk1);
            (0, vitest_1.expect)(flushed[1]).toEqual(chunk2);
            (0, vitest_1.expect)(flushed[2]).toEqual(chunk3);
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(0);
        });
        (0, vitest_1.it)('should clear buffer and discard all chunks', () => {
            const chunk1 = Buffer.from([1, 2, 3]);
            const chunk2 = Buffer.from([4, 5, 6]);
            session.addToReconnectionBuffer(chunk1);
            session.addToReconnectionBuffer(chunk2);
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(2);
            session.clearReconnectionBuffer();
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(0);
        });
        (0, vitest_1.it)('should track bufferedChunksDuringReconnection metric', () => {
            (0, vitest_1.expect)(session.metrics.bufferedChunksDuringReconnection).toBe(0);
            const chunk1 = Buffer.from([1, 2, 3]);
            const chunk2 = Buffer.from([4, 5, 6]);
            const chunk3 = Buffer.from([7, 8, 9]);
            session.addToReconnectionBuffer(chunk1);
            (0, vitest_1.expect)(session.metrics.bufferedChunksDuringReconnection).toBe(1);
            session.addToReconnectionBuffer(chunk2);
            (0, vitest_1.expect)(session.metrics.bufferedChunksDuringReconnection).toBe(2);
            session.addToReconnectionBuffer(chunk3);
            (0, vitest_1.expect)(session.metrics.bufferedChunksDuringReconnection).toBe(3);
        });
        (0, vitest_1.it)('should handle adding chunk equal to MAX_BUFFER_SIZE', () => {
            const MAX_BUFFER_SIZE = 32 * 1024; // 32KB
            const exactMaxChunk = Buffer.alloc(MAX_BUFFER_SIZE);
            session.addToReconnectionBuffer(exactMaxChunk);
            // Chunk exactly at max size should be rejected (implementation rejects chunks >= MAX)
            // Looking at the code, it rejects chunks > MAX, so equal should be accepted
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(1);
        });
        (0, vitest_1.it)('should handle empty buffer flush', () => {
            const flushed = session.flushReconnectionBuffer();
            (0, vitest_1.expect)(flushed).toEqual([]);
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(0);
        });
        (0, vitest_1.it)('should handle multiple flushes', () => {
            const chunk1 = Buffer.from([1, 2, 3]);
            session.addToReconnectionBuffer(chunk1);
            const flushed1 = session.flushReconnectionBuffer();
            (0, vitest_1.expect)(flushed1.length).toBe(1);
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(0);
            const chunk2 = Buffer.from([4, 5, 6]);
            session.addToReconnectionBuffer(chunk2);
            const flushed2 = session.flushReconnectionBuffer();
            (0, vitest_1.expect)(flushed2.length).toBe(1);
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(0);
        });
        (0, vitest_1.it)('should handle buffer operations during edge case with exact boundary', () => {
            const MAX_BUFFER_SIZE = 32 * 1024; // 32KB
            // Add chunk just under max
            const chunk1 = Buffer.alloc(MAX_BUFFER_SIZE - 100);
            session.addToReconnectionBuffer(chunk1);
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(1);
            // Add small chunk that fits exactly
            const chunk2 = Buffer.alloc(50);
            session.addToReconnectionBuffer(chunk2);
            (0, vitest_1.expect)(session.reconnectionBuffer.length).toBe(2);
            (0, vitest_1.expect)(session.reconnectionBuffer[0]).toBe(chunk1);
            (0, vitest_1.expect)(session.reconnectionBuffer[1]).toBe(chunk2);
        });
    });
});
(0, vitest_1.describe)('STTSessionService', () => {
    let service;
    const mockSessionId = 'test-session-123';
    const mockConnectionId = 'test-connection-456';
    const mockConfig = {
        samplingRate: 16000,
        language: 'en-US',
    };
    (0, vitest_1.beforeEach)(() => {
        service = new stt_session_service_1.STTSessionService();
    });
    (0, vitest_1.afterEach)(() => {
        service.cleanup();
    });
    (0, vitest_1.describe)('createSession', () => {
        (0, vitest_1.it)('should create and store new session', () => {
            const session = service.createSession(mockSessionId, mockConnectionId, mockConfig);
            (0, vitest_1.expect)(session).toBeDefined();
            (0, vitest_1.expect)(session.sessionId).toBe(mockSessionId);
            (0, vitest_1.expect)(session.connectionId).toBe(mockConnectionId);
            (0, vitest_1.expect)(session.config.samplingRate).toBe(16000);
            (0, vitest_1.expect)(session.config.language).toBe('en-US');
        });
        (0, vitest_1.it)('should create multiple independent sessions', () => {
            const session1 = service.createSession('session-1', 'conn-1', mockConfig);
            const session2 = service.createSession('session-2', 'conn-2', mockConfig);
            const session3 = service.createSession('session-3', 'conn-3', mockConfig);
            (0, vitest_1.expect)(service.getSessionCount()).toBe(3);
            (0, vitest_1.expect)(session1.sessionId).not.toBe(session2.sessionId);
            (0, vitest_1.expect)(session2.sessionId).not.toBe(session3.sessionId);
        });
        (0, vitest_1.it)('should allow creating session with same ID after deletion', () => {
            service.createSession(mockSessionId, mockConnectionId, mockConfig);
            service.deleteSession(mockSessionId);
            const newSession = service.createSession(mockSessionId, 'new-conn', mockConfig);
            (0, vitest_1.expect)(newSession.sessionId).toBe(mockSessionId);
            (0, vitest_1.expect)(newSession.connectionId).toBe('new-conn');
        });
    });
    (0, vitest_1.describe)('getSession', () => {
        (0, vitest_1.it)('should retrieve existing session', () => {
            const created = service.createSession(mockSessionId, mockConnectionId, mockConfig);
            const retrieved = service.getSession(mockSessionId);
            (0, vitest_1.expect)(retrieved).toBeDefined();
            (0, vitest_1.expect)(retrieved).toBe(created); // Same instance
            (0, vitest_1.expect)(retrieved.sessionId).toBe(mockSessionId);
        });
        (0, vitest_1.it)('should return undefined for non-existent session', () => {
            const session = service.getSession('non-existent-id');
            (0, vitest_1.expect)(session).toBeUndefined();
        });
        (0, vitest_1.it)('should return undefined after session deletion', () => {
            service.createSession(mockSessionId, mockConnectionId, mockConfig);
            service.deleteSession(mockSessionId);
            const session = service.getSession(mockSessionId);
            (0, vitest_1.expect)(session).toBeUndefined();
        });
    });
    (0, vitest_1.describe)('hasSession', () => {
        (0, vitest_1.it)('should return true for existing session', () => {
            service.createSession(mockSessionId, mockConnectionId, mockConfig);
            (0, vitest_1.expect)(service.hasSession(mockSessionId)).toBe(true);
        });
        (0, vitest_1.it)('should return false for non-existent session', () => {
            (0, vitest_1.expect)(service.hasSession('non-existent-id')).toBe(false);
        });
        (0, vitest_1.it)('should return false after session deletion', () => {
            service.createSession(mockSessionId, mockConnectionId, mockConfig);
            service.deleteSession(mockSessionId);
            (0, vitest_1.expect)(service.hasSession(mockSessionId)).toBe(false);
        });
    });
    (0, vitest_1.describe)('deleteSession', () => {
        (0, vitest_1.it)('should delete existing session', () => {
            service.createSession(mockSessionId, mockConnectionId, mockConfig);
            service.deleteSession(mockSessionId);
            (0, vitest_1.expect)(service.getSession(mockSessionId)).toBeUndefined();
            (0, vitest_1.expect)(service.getSessionCount()).toBe(0);
        });
        (0, vitest_1.it)('should call cleanup on session before deletion', () => {
            const session = service.createSession(mockSessionId, mockConnectionId, mockConfig);
            const cleanupSpy = vitest_1.vi.spyOn(session, 'cleanup');
            service.deleteSession(mockSessionId);
            (0, vitest_1.expect)(cleanupSpy).toHaveBeenCalled();
        });
        (0, vitest_1.it)('should handle deleting non-existent session gracefully', () => {
            (0, vitest_1.expect)(() => service.deleteSession('non-existent-id')).not.toThrow();
        });
        (0, vitest_1.it)('should not affect other sessions', () => {
            service.createSession('session-1', 'conn-1', mockConfig);
            service.createSession('session-2', 'conn-2', mockConfig);
            service.createSession('session-3', 'conn-3', mockConfig);
            service.deleteSession('session-2');
            (0, vitest_1.expect)(service.getSessionCount()).toBe(2);
            (0, vitest_1.expect)(service.hasSession('session-1')).toBe(true);
            (0, vitest_1.expect)(service.hasSession('session-2')).toBe(false);
            (0, vitest_1.expect)(service.hasSession('session-3')).toBe(true);
        });
    });
    (0, vitest_1.describe)('getAllSessions', () => {
        (0, vitest_1.it)('should return all active sessions', () => {
            service.createSession('session-1', 'conn-1', mockConfig);
            service.createSession('session-2', 'conn-2', mockConfig);
            service.createSession('session-3', 'conn-3', mockConfig);
            const sessions = service.getAllSessions();
            (0, vitest_1.expect)(sessions).toHaveLength(3);
            (0, vitest_1.expect)(sessions.map((s) => s.sessionId)).toContain('session-1');
            (0, vitest_1.expect)(sessions.map((s) => s.sessionId)).toContain('session-2');
            (0, vitest_1.expect)(sessions.map((s) => s.sessionId)).toContain('session-3');
        });
        (0, vitest_1.it)('should return empty array when no sessions', () => {
            const sessions = service.getAllSessions();
            (0, vitest_1.expect)(sessions).toEqual([]);
            (0, vitest_1.expect)(sessions).toHaveLength(0);
        });
        (0, vitest_1.it)('should return array copy (not affecting internal state)', () => {
            service.createSession(mockSessionId, mockConnectionId, mockConfig);
            const sessions = service.getAllSessions();
            sessions.pop(); // Modify returned array
            (0, vitest_1.expect)(service.getSessionCount()).toBe(1); // Internal state unchanged
        });
    });
    (0, vitest_1.describe)('getSessionCount', () => {
        (0, vitest_1.it)('should return correct count of sessions', () => {
            (0, vitest_1.expect)(service.getSessionCount()).toBe(0);
            service.createSession('session-1', 'conn-1', mockConfig);
            (0, vitest_1.expect)(service.getSessionCount()).toBe(1);
            service.createSession('session-2', 'conn-2', mockConfig);
            (0, vitest_1.expect)(service.getSessionCount()).toBe(2);
            service.deleteSession('session-1');
            (0, vitest_1.expect)(service.getSessionCount()).toBe(1);
            service.deleteSession('session-2');
            (0, vitest_1.expect)(service.getSessionCount()).toBe(0);
        });
        (0, vitest_1.it)('should handle large number of sessions', () => {
            for (let i = 0; i < 100; i++) {
                service.createSession(`session-${i}`, `conn-${i}`, mockConfig);
            }
            (0, vitest_1.expect)(service.getSessionCount()).toBe(100);
        });
    });
    (0, vitest_1.describe)('cleanup', () => {
        (0, vitest_1.it)('should cleanup all sessions', () => {
            const session1 = service.createSession('session-1', 'conn-1', mockConfig);
            const session2 = service.createSession('session-2', 'conn-2', mockConfig);
            const session3 = service.createSession('session-3', 'conn-3', mockConfig);
            const cleanup1 = vitest_1.vi.spyOn(session1, 'cleanup');
            const cleanup2 = vitest_1.vi.spyOn(session2, 'cleanup');
            const cleanup3 = vitest_1.vi.spyOn(session3, 'cleanup');
            service.cleanup();
            (0, vitest_1.expect)(cleanup1).toHaveBeenCalled();
            (0, vitest_1.expect)(cleanup2).toHaveBeenCalled();
            (0, vitest_1.expect)(cleanup3).toHaveBeenCalled();
            (0, vitest_1.expect)(service.getSessionCount()).toBe(0);
        });
        (0, vitest_1.it)('should handle cleanup with no sessions', () => {
            (0, vitest_1.expect)(() => service.cleanup()).not.toThrow();
            (0, vitest_1.expect)(service.getSessionCount()).toBe(0);
        });
        (0, vitest_1.it)('should remove all sessions after cleanup', () => {
            service.createSession('session-1', 'conn-1', mockConfig);
            service.createSession('session-2', 'conn-2', mockConfig);
            service.cleanup();
            (0, vitest_1.expect)(service.getSessionCount()).toBe(0);
            (0, vitest_1.expect)(service.getAllSessions()).toEqual([]);
        });
    });
});
