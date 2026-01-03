"use strict";
/**
 * STT Integration Test: Concurrent Sessions
 * Tests multiple parallel STT sessions to verify isolation and resource management
 * Target Coverage: 80%+
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const stt_controller_1 = require("@/modules/stt/controllers/stt.controller");
const stt_session_service_1 = require("@/modules/stt/services/stt-session.service");
const sdk_1 = require("@deepgram/sdk");
// ============================================================================
// MOCK SETUP - Factory Pattern (Each session gets unique client)
// ============================================================================
let mockOnMethod;
let eventHandlers;
const createMockLiveClient = () => {
    // Each client gets its own event handlers map
    const localHandlers = new Map();
    mockOnMethod = vitest_1.vi.fn((event, handler) => {
        if (!localHandlers.has(event)) {
            localHandlers.set(event, []);
        }
        localHandlers.get(event).push(handler);
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
        _localHandlers: localHandlers, // Store reference for triggering
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
(0, vitest_1.describe)('STT Integration: Concurrent Sessions', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        stt_session_service_1.sttSessionService.cleanup();
    });
    (0, vitest_1.afterEach)(async () => {
        // Cleanup all test sessions
        const sessions = stt_session_service_1.sttSessionService.getAllSessions();
        for (const session of sessions) {
            try {
                await stt_controller_1.sttController.endSession(session.sessionId);
            }
            catch (error) {
                // Ignore cleanup errors
            }
        }
        stt_session_service_1.sttSessionService.cleanup();
    });
    (0, vitest_1.describe)('Multiple Session Creation', () => {
        (0, vitest_1.it)('should create 3 concurrent sessions successfully', async () => {
            const sessionIds = ['session-1', 'session-2', 'session-3'];
            const configs = sessionIds.map((id) => ({
                sessionId: id,
                connectionId: `conn-${id}`,
                samplingRate: 16000,
                language: 'en-US',
            }));
            // Create all sessions concurrently
            await Promise.all(configs.map((config, idx) => stt_controller_1.sttController.createSession(sessionIds[idx], config)));
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSessionCount()).toBe(3);
            // Verify each session exists
            sessionIds.forEach((id) => {
                const session = stt_session_service_1.sttSessionService.getSession(id);
                (0, vitest_1.expect)(session).toBeDefined();
                (0, vitest_1.expect)(session.sessionId).toBe(id);
            });
            // Cleanup
            await Promise.all(sessionIds.map((id) => stt_controller_1.sttController.endSession(id)));
        });
        (0, vitest_1.it)('should create 10 concurrent sessions successfully', async () => {
            const sessionIds = Array.from({ length: 10 }, (_, i) => `session-${i}`);
            const configs = sessionIds.map((id) => ({
                sessionId: id,
                connectionId: `conn-${id}`,
                samplingRate: 16000,
                language: 'en-US',
            }));
            await Promise.all(configs.map((config, idx) => stt_controller_1.sttController.createSession(sessionIds[idx], config)));
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSessionCount()).toBe(10);
            // Cleanup
            await Promise.all(sessionIds.map((id) => stt_controller_1.sttController.endSession(id)));
        }, 15000);
        (0, vitest_1.it)('should handle sessions with different sampling rates', async () => {
            const sessions = [
                { id: 'session-8k', rate: 8000 },
                { id: 'session-16k', rate: 16000 },
                { id: 'session-24k', rate: 24000 },
                { id: 'session-48k', rate: 48000 },
            ];
            await Promise.all(sessions.map(({ id, rate }) => stt_controller_1.sttController.createSession(id, {
                sessionId: id,
                connectionId: `conn-${id}`,
                samplingRate: rate,
                language: 'en-US',
            })));
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSessionCount()).toBe(4);
            // Verify each has correct config
            sessions.forEach(({ id, rate }) => {
                const session = stt_session_service_1.sttSessionService.getSession(id);
                (0, vitest_1.expect)(session.config.samplingRate).toBe(rate);
            });
            // Cleanup
            await Promise.all(sessions.map(({ id }) => stt_controller_1.sttController.endSession(id)));
        });
        (0, vitest_1.it)('should handle sessions with different languages', async () => {
            const sessions = [
                { id: 'session-en', lang: 'en-US' },
                { id: 'session-es', lang: 'es-ES' },
                { id: 'session-fr', lang: 'fr-FR' },
                { id: 'session-de', lang: 'de-DE' },
            ];
            await Promise.all(sessions.map(({ id, lang }) => stt_controller_1.sttController.createSession(id, {
                sessionId: id,
                connectionId: `conn-${id}`,
                samplingRate: 16000,
                language: lang,
            })));
            // Verify languages
            sessions.forEach(({ id, lang }) => {
                const session = stt_session_service_1.sttSessionService.getSession(id);
                (0, vitest_1.expect)(session.config.language).toBe(lang);
            });
            // Cleanup
            await Promise.all(sessions.map(({ id }) => stt_controller_1.sttController.endSession(id)));
        });
    });
    (0, vitest_1.describe)('Concurrent Audio Forwarding', () => {
        (0, vitest_1.it)('should forward audio to multiple sessions without interference', async () => {
            const sessionIds = ['session-1', 'session-2', 'session-3'];
            // Create sessions
            await Promise.all(sessionIds.map((id) => stt_controller_1.sttController.createSession(id, {
                sessionId: id,
                connectionId: `conn-${id}`,
                samplingRate: 16000,
                language: 'en-US',
            })));
            // Forward different amounts of audio to each
            const chunk = new Uint8Array(1024).fill(128);
            await stt_controller_1.sttController.forwardChunk(sessionIds[0], chunk); // 2 chunks
            await stt_controller_1.sttController.forwardChunk(sessionIds[0], chunk);
            await stt_controller_1.sttController.forwardChunk(sessionIds[1], chunk); // 3 chunks
            await stt_controller_1.sttController.forwardChunk(sessionIds[1], chunk);
            await stt_controller_1.sttController.forwardChunk(sessionIds[1], chunk);
            await stt_controller_1.sttController.forwardChunk(sessionIds[2], chunk); // 4 chunks
            await stt_controller_1.sttController.forwardChunk(sessionIds[2], chunk);
            await stt_controller_1.sttController.forwardChunk(sessionIds[2], chunk);
            await stt_controller_1.sttController.forwardChunk(sessionIds[2], chunk);
            // Verify each session has correct count
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(sessionIds[0]).metrics.chunksReceived).toBe(2);
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(sessionIds[1]).metrics.chunksReceived).toBe(3);
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(sessionIds[2]).metrics.chunksReceived).toBe(4);
            // Cleanup
            await Promise.all(sessionIds.map((id) => stt_controller_1.sttController.endSession(id)));
        });
        (0, vitest_1.it)('should handle parallel forwarding to same session', async () => {
            const sessionId = 'parallel-session';
            await stt_controller_1.sttController.createSession(sessionId, {
                sessionId,
                connectionId: 'conn-parallel',
                samplingRate: 16000,
                language: 'en-US',
            });
            const chunk = new Uint8Array(512).fill(128);
            const promises = [];
            // Forward 50 chunks in parallel
            for (let i = 0; i < 50; i++) {
                promises.push(stt_controller_1.sttController.forwardChunk(sessionId, chunk));
            }
            await Promise.all(promises);
            const session = stt_session_service_1.sttSessionService.getSession(sessionId);
            (0, vitest_1.expect)(session.metrics.chunksReceived).toBe(50);
            await stt_controller_1.sttController.endSession(sessionId);
        });
        (0, vitest_1.it)('should handle parallel forwarding to multiple sessions', async () => {
            const sessionIds = ['session-1', 'session-2', 'session-3'];
            // Create all sessions
            await Promise.all(sessionIds.map((id) => stt_controller_1.sttController.createSession(id, {
                sessionId: id,
                connectionId: `conn-${id}`,
                samplingRate: 16000,
                language: 'en-US',
            })));
            const chunk = new Uint8Array(1024).fill(128);
            const promises = [];
            // Forward to all sessions in parallel
            for (const sessionId of sessionIds) {
                for (let i = 0; i < 10; i++) {
                    promises.push(stt_controller_1.sttController.forwardChunk(sessionId, chunk));
                }
            }
            await Promise.all(promises);
            // Each session should have 10 chunks
            sessionIds.forEach((id) => {
                const session = stt_session_service_1.sttSessionService.getSession(id);
                (0, vitest_1.expect)(session.metrics.chunksReceived).toBe(10);
            });
            // Cleanup
            await Promise.all(sessionIds.map((id) => stt_controller_1.sttController.endSession(id)));
        });
    });
    (0, vitest_1.describe)('Session Isolation', () => {
        (0, vitest_1.it)('should maintain independent transcripts across sessions', async () => {
            const sessionIds = ['session-A', 'session-B', 'session-C'];
            await Promise.all(sessionIds.map((id) => stt_controller_1.sttController.createSession(id, {
                sessionId: id,
                connectionId: `conn-${id}`,
                samplingRate: 16000,
                language: 'en-US',
            })));
            // Add unique transcripts to each
            const sessionA = stt_session_service_1.sttSessionService.getSession(sessionIds[0]);
            const sessionB = stt_session_service_1.sttSessionService.getSession(sessionIds[1]);
            const sessionC = stt_session_service_1.sttSessionService.getSession(sessionIds[2]);
            sessionA.addTranscript('Transcript A', 0.95, true);
            sessionB.addTranscript('Transcript B', 0.93, true);
            sessionC.addTranscript('Transcript C', 0.97, true);
            // Verify isolation
            (0, vitest_1.expect)(sessionA.getFinalTranscript()).toBe('Transcript A');
            (0, vitest_1.expect)(sessionB.getFinalTranscript()).toBe('Transcript B');
            (0, vitest_1.expect)(sessionC.getFinalTranscript()).toBe('Transcript C');
            // Cleanup
            await Promise.all(sessionIds.map((id) => stt_controller_1.sttController.endSession(id)));
        });
        (0, vitest_1.it)('should maintain independent metrics across sessions', async () => {
            const sessionIds = ['session-1', 'session-2'];
            await Promise.all(sessionIds.map((id) => stt_controller_1.sttController.createSession(id, {
                sessionId: id,
                connectionId: `conn-${id}`,
                samplingRate: 16000,
                language: 'en-US',
            })));
            const session1 = stt_session_service_1.sttSessionService.getSession(sessionIds[0]);
            const session2 = stt_session_service_1.sttSessionService.getSession(sessionIds[1]);
            // Set different metrics
            session1.metrics.errors = 5;
            session2.metrics.errors = 2;
            session1.metrics.chunksReceived = 100;
            session2.metrics.chunksReceived = 50;
            // Verify isolation
            (0, vitest_1.expect)(session1.metrics.errors).toBe(5);
            (0, vitest_1.expect)(session2.metrics.errors).toBe(2);
            (0, vitest_1.expect)(session1.metrics.chunksReceived).toBe(100);
            (0, vitest_1.expect)(session2.metrics.chunksReceived).toBe(50);
            // Cleanup
            await Promise.all(sessionIds.map((id) => stt_controller_1.sttController.endSession(id)));
        });
        (0, vitest_1.it)('should not affect other sessions when one is deleted', async () => {
            const sessionIds = ['session-1', 'session-2', 'session-3'];
            await Promise.all(sessionIds.map((id) => stt_controller_1.sttController.createSession(id, {
                sessionId: id,
                connectionId: `conn-${id}`,
                samplingRate: 16000,
                language: 'en-US',
            })));
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSessionCount()).toBe(3);
            // Delete middle session
            await stt_controller_1.sttController.endSession(sessionIds[1]);
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSessionCount()).toBe(2);
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(sessionIds[0])).toBeDefined();
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(sessionIds[1])).toBeUndefined();
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(sessionIds[2])).toBeDefined();
            // Cleanup remaining
            await stt_controller_1.sttController.endSession(sessionIds[0]);
            await stt_controller_1.sttController.endSession(sessionIds[2]);
        });
    });
    (0, vitest_1.describe)('Service-Level Metrics Aggregation', () => {
        (0, vitest_1.it)('should aggregate metrics across all active sessions', async () => {
            const sessionIds = ['session-1', 'session-2', 'session-3'];
            await Promise.all(sessionIds.map((id) => stt_controller_1.sttController.createSession(id, {
                sessionId: id,
                connectionId: `conn-${id}`,
                samplingRate: 16000,
                language: 'en-US',
            })));
            // Set metrics for each session
            stt_session_service_1.sttSessionService.getSession(sessionIds[0]).metrics.chunksForwarded = 100;
            stt_session_service_1.sttSessionService.getSession(sessionIds[0]).metrics.transcriptsReceived = 10;
            stt_session_service_1.sttSessionService.getSession(sessionIds[0]).metrics.errors = 1;
            stt_session_service_1.sttSessionService.getSession(sessionIds[1]).metrics.chunksForwarded = 200;
            stt_session_service_1.sttSessionService.getSession(sessionIds[1]).metrics.transcriptsReceived = 20;
            stt_session_service_1.sttSessionService.getSession(sessionIds[1]).metrics.errors = 2;
            stt_session_service_1.sttSessionService.getSession(sessionIds[2]).metrics.chunksForwarded = 150;
            stt_session_service_1.sttSessionService.getSession(sessionIds[2]).metrics.transcriptsReceived = 15;
            stt_session_service_1.sttSessionService.getSession(sessionIds[2]).metrics.errors = 0;
            const serviceMetrics = stt_controller_1.sttController.getMetrics();
            (0, vitest_1.expect)(serviceMetrics.activeSessions).toBe(3);
            (0, vitest_1.expect)(serviceMetrics.totalChunksForwarded).toBe(450);
            (0, vitest_1.expect)(serviceMetrics.totalTranscriptsReceived).toBe(45);
            (0, vitest_1.expect)(serviceMetrics.totalErrors).toBe(3);
            // Cleanup
            await Promise.all(sessionIds.map((id) => stt_controller_1.sttController.endSession(id)));
        });
        (0, vitest_1.it)('should update metrics as sessions are added/removed', async () => {
            // Initial state
            let metrics = stt_controller_1.sttController.getMetrics();
            const initialCount = metrics.activeSessions;
            // Add 3 sessions
            const sessionIds = ['session-1', 'session-2', 'session-3'];
            await Promise.all(sessionIds.map((id) => stt_controller_1.sttController.createSession(id, {
                sessionId: id,
                connectionId: `conn-${id}`,
                samplingRate: 16000,
                language: 'en-US',
            })));
            metrics = stt_controller_1.sttController.getMetrics();
            (0, vitest_1.expect)(metrics.activeSessions).toBe(initialCount + 3);
            // Remove 2 sessions
            await stt_controller_1.sttController.endSession(sessionIds[0]);
            await stt_controller_1.sttController.endSession(sessionIds[1]);
            metrics = stt_controller_1.sttController.getMetrics();
            (0, vitest_1.expect)(metrics.activeSessions).toBe(initialCount + 1);
            // Remove last session
            await stt_controller_1.sttController.endSession(sessionIds[2]);
            metrics = stt_controller_1.sttController.getMetrics();
            (0, vitest_1.expect)(metrics.activeSessions).toBe(initialCount);
        });
    });
    (0, vitest_1.describe)('Stress Testing', () => {
        (0, vitest_1.it)('should handle 20 concurrent sessions', async () => {
            const sessionIds = Array.from({ length: 20 }, (_, i) => `stress-session-${i}`);
            // Create all sessions
            await Promise.all(sessionIds.map((id) => stt_controller_1.sttController.createSession(id, {
                sessionId: id,
                connectionId: `conn-${id}`,
                samplingRate: 16000,
                language: 'en-US',
            })));
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSessionCount()).toBe(20);
            // Forward audio to all
            const chunk = new Uint8Array(1024).fill(128);
            const promises = [];
            for (const sessionId of sessionIds) {
                for (let i = 0; i < 5; i++) {
                    promises.push(stt_controller_1.sttController.forwardChunk(sessionId, chunk));
                }
            }
            await Promise.all(promises);
            // Verify all sessions processed audio
            sessionIds.forEach((id) => {
                const session = stt_session_service_1.sttSessionService.getSession(id);
                (0, vitest_1.expect)(session.metrics.chunksReceived).toBe(5);
            });
            // Cleanup all
            await Promise.all(sessionIds.map((id) => stt_controller_1.sttController.endSession(id)));
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSessionCount()).toBe(0);
        }, 20000);
        (0, vitest_1.it)('should handle rapid session lifecycle (create → forward → end)', async () => {
            const iterations = 10;
            for (let i = 0; i < iterations; i++) {
                const sessionId = `rapid-${i}`;
                await stt_controller_1.sttController.createSession(sessionId, {
                    sessionId,
                    connectionId: `conn-${i}`,
                    samplingRate: 16000,
                    language: 'en-US',
                });
                const chunk = new Uint8Array(512).fill(128);
                await stt_controller_1.sttController.forwardChunk(sessionId, chunk);
                await stt_controller_1.sttController.forwardChunk(sessionId, chunk);
                await stt_controller_1.sttController.endSession(sessionId);
                (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(sessionId)).toBeUndefined();
            }
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSessionCount()).toBe(0);
        }, 15000);
    });
});
