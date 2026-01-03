"use strict";
/**
 * STT Integration Test: Complete Flow
 * Tests the end-to-end STT flow: create → forward → end
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
(0, vitest_1.describe)('STT Integration: Complete Flow', () => {
    const mockSessionId = 'integration-test-session';
    const mockConfig = {
        sessionId: mockSessionId,
        connectionId: 'integration-test-connection',
        samplingRate: 16000,
        language: 'en-US',
    };
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        // Ensure clean state
        stt_session_service_1.sttSessionService.cleanup();
    });
    (0, vitest_1.afterEach)(async () => {
        // Cleanup
        try {
            await stt_controller_1.sttController.endSession(mockSessionId);
        }
        catch (error) {
            // Ignore cleanup errors
        }
        stt_session_service_1.sttSessionService.cleanup();
    });
    (0, vitest_1.it)('should complete full STT flow: create → forward → end', async () => {
        // Step 1: Create session
        await stt_controller_1.sttController.createSession(mockSessionId, mockConfig);
        // Verify session created
        const session = stt_session_service_1.sttSessionService.getSession(mockSessionId);
        (0, vitest_1.expect)(session).toBeDefined();
        (0, vitest_1.expect)(session.sessionId).toBe(mockSessionId);
        (0, vitest_1.expect)(session.connectionState).toBe('connected');
        // Step 2: Forward audio chunks
        const audioChunk1 = new Uint8Array(1024).fill(128);
        const audioChunk2 = new Uint8Array(1024).fill(130);
        const audioChunk3 = new Uint8Array(1024).fill(132);
        await stt_controller_1.sttController.forwardChunk(mockSessionId, audioChunk1);
        await stt_controller_1.sttController.forwardChunk(mockSessionId, audioChunk2);
        await stt_controller_1.sttController.forwardChunk(mockSessionId, audioChunk3);
        // Simulate transcript responses
        triggerEvent(sdk_1.LiveTranscriptionEvents.Transcript, {
            channel: {
                alternatives: [{ transcript: 'Hello world', confidence: 0.95 }],
            },
            is_final: true,
        });
        // Verify chunks were received
        const sessionAfterChunks = stt_session_service_1.sttSessionService.getSession(mockSessionId);
        (0, vitest_1.expect)(sessionAfterChunks).toBeDefined();
        (0, vitest_1.expect)(sessionAfterChunks.metrics.chunksReceived).toBeGreaterThan(0);
        (0, vitest_1.expect)(sessionAfterChunks.metrics.chunksForwarded).toBeGreaterThan(0);
        // Step 3: End session and get transcript
        const finalTranscript = await stt_controller_1.sttController.endSession(mockSessionId);
        (0, vitest_1.expect)(finalTranscript).toBeDefined();
        (0, vitest_1.expect)(typeof finalTranscript).toBe('string');
        // Verify session cleaned up
        const sessionAfterEnd = stt_session_service_1.sttSessionService.getSession(mockSessionId);
        (0, vitest_1.expect)(sessionAfterEnd).toBeUndefined();
    }, 10000);
    (0, vitest_1.it)('should handle multiple audio chunks with varying sizes', async () => {
        await stt_controller_1.sttController.createSession(mockSessionId, mockConfig);
        // Forward different sized chunks
        const chunks = [
            new Uint8Array(512).fill(100),
            new Uint8Array(2048).fill(110),
            new Uint8Array(1024).fill(120),
            new Uint8Array(4096).fill(130),
            new Uint8Array(256).fill(140),
        ];
        for (const chunk of chunks) {
            await stt_controller_1.sttController.forwardChunk(mockSessionId, chunk);
        }
        const session = stt_session_service_1.sttSessionService.getSession(mockSessionId);
        (0, vitest_1.expect)(session.metrics.chunksReceived).toBe(5);
        const transcript = await stt_controller_1.sttController.endSession(mockSessionId);
        (0, vitest_1.expect)(transcript).toBeDefined();
    }, 10000);
    (0, vitest_1.it)('should accumulate transcripts over time', async () => {
        await stt_controller_1.sttController.createSession(mockSessionId, mockConfig);
        // Send chunks and simulate transcripts
        for (let i = 0; i < 10; i++) {
            const chunk = new Uint8Array(1024).fill(128 + i);
            await stt_controller_1.sttController.forwardChunk(mockSessionId, chunk);
            // Simulate transcript for each chunk
            triggerEvent(sdk_1.LiveTranscriptionEvents.Transcript, {
                channel: {
                    alternatives: [{ transcript: `Word ${i}`, confidence: 0.9 + i * 0.01 }],
                },
                is_final: true,
            });
        }
        const session = stt_session_service_1.sttSessionService.getSession(mockSessionId);
        (0, vitest_1.expect)(session.metrics.transcriptsReceived).toBeGreaterThan(0);
        const transcript = await stt_controller_1.sttController.endSession(mockSessionId);
        (0, vitest_1.expect)(transcript.length).toBeGreaterThan(0);
    }, 10000);
    (0, vitest_1.it)('should maintain metrics throughout session lifecycle', async () => {
        await stt_controller_1.sttController.createSession(mockSessionId, mockConfig);
        // Get initial metrics
        const initialMetrics = stt_controller_1.sttController.getSessionMetrics(mockSessionId);
        (0, vitest_1.expect)(initialMetrics).toBeDefined();
        (0, vitest_1.expect)(initialMetrics.chunksForwarded).toBe(0);
        (0, vitest_1.expect)(initialMetrics.transcriptsReceived).toBe(0);
        // Forward audio
        const chunk = new Uint8Array(1024).fill(128);
        await stt_controller_1.sttController.forwardChunk(mockSessionId, chunk);
        await stt_controller_1.sttController.forwardChunk(mockSessionId, chunk);
        await stt_controller_1.sttController.forwardChunk(mockSessionId, chunk);
        // Get metrics after forwarding
        const midMetrics = stt_controller_1.sttController.getSessionMetrics(mockSessionId);
        (0, vitest_1.expect)(midMetrics).toBeDefined();
        (0, vitest_1.expect)(midMetrics.chunksForwarded).toBeGreaterThan(0);
        (0, vitest_1.expect)(midMetrics.duration).toBeGreaterThan(0);
        // End session
        await stt_controller_1.sttController.endSession(mockSessionId);
        // Metrics should no longer be available
        const endMetrics = stt_controller_1.sttController.getSessionMetrics(mockSessionId);
        (0, vitest_1.expect)(endMetrics).toBeUndefined();
    }, 10000);
    (0, vitest_1.it)('should handle rapid chunk forwarding without errors', async () => {
        await stt_controller_1.sttController.createSession(mockSessionId, mockConfig);
        // Rapidly forward many chunks
        const promises = [];
        for (let i = 0; i < 50; i++) {
            const chunk = new Uint8Array(512).fill(128);
            promises.push(stt_controller_1.sttController.forwardChunk(mockSessionId, chunk));
        }
        await Promise.all(promises);
        const session = stt_session_service_1.sttSessionService.getSession(mockSessionId);
        (0, vitest_1.expect)(session.metrics.chunksReceived).toBe(50);
        (0, vitest_1.expect)(session.metrics.errors).toBe(0);
        await stt_controller_1.sttController.endSession(mockSessionId);
    }, 10000);
    (0, vitest_1.it)('should support session recreation after ending', async () => {
        // First session
        await stt_controller_1.sttController.createSession(mockSessionId, mockConfig);
        const chunk = new Uint8Array(1024).fill(128);
        await stt_controller_1.sttController.forwardChunk(mockSessionId, chunk);
        const transcript1 = await stt_controller_1.sttController.endSession(mockSessionId);
        (0, vitest_1.expect)(transcript1).toBeDefined();
        (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(mockSessionId)).toBeUndefined();
        // Wait a bit
        await new Promise((resolve) => setTimeout(resolve, 100));
        // Second session with same ID
        await stt_controller_1.sttController.createSession(mockSessionId, mockConfig);
        await stt_controller_1.sttController.forwardChunk(mockSessionId, chunk);
        const transcript2 = await stt_controller_1.sttController.endSession(mockSessionId);
        (0, vitest_1.expect)(transcript2).toBeDefined();
        (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(mockSessionId)).toBeUndefined();
    }, 10000);
    (0, vitest_1.it)('should handle empty audio session (no chunks forwarded)', async () => {
        await stt_controller_1.sttController.createSession(mockSessionId, mockConfig);
        // End immediately without forwarding chunks
        const transcript = await stt_controller_1.sttController.endSession(mockSessionId);
        (0, vitest_1.expect)(transcript).toBeDefined();
        (0, vitest_1.expect)(typeof transcript).toBe('string');
        (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSession(mockSessionId)).toBeUndefined();
    }, 10000);
    (0, vitest_1.it)('should update service-level metrics across session lifecycle', async () => {
        const initialServiceMetrics = stt_controller_1.sttController.getMetrics();
        const initialCount = initialServiceMetrics.activeSessions;
        // Create session
        await stt_controller_1.sttController.createSession(mockSessionId, mockConfig);
        const afterCreateMetrics = stt_controller_1.sttController.getMetrics();
        (0, vitest_1.expect)(afterCreateMetrics.activeSessions).toBe(initialCount + 1);
        // Forward chunks
        const chunk = new Uint8Array(1024).fill(128);
        await stt_controller_1.sttController.forwardChunk(mockSessionId, chunk);
        await stt_controller_1.sttController.forwardChunk(mockSessionId, chunk);
        const afterForwardMetrics = stt_controller_1.sttController.getMetrics();
        (0, vitest_1.expect)(afterForwardMetrics.totalChunksForwarded).toBeGreaterThan(initialServiceMetrics.totalChunksForwarded);
        // End session
        await stt_controller_1.sttController.endSession(mockSessionId);
        const afterEndMetrics = stt_controller_1.sttController.getMetrics();
        (0, vitest_1.expect)(afterEndMetrics.activeSessions).toBe(initialCount);
    }, 10000);
    (0, vitest_1.it)('should maintain session isolation with unique IDs', async () => {
        const sessionId1 = 'session-1';
        const sessionId2 = 'session-2';
        const config1 = { ...mockConfig, sessionId: sessionId1 };
        const config2 = { ...mockConfig, sessionId: sessionId2 };
        // Create both sessions
        await stt_controller_1.sttController.createSession(sessionId1, config1);
        await stt_controller_1.sttController.createSession(sessionId2, config2);
        const metrics1Before = stt_controller_1.sttController.getSessionMetrics(sessionId1);
        const metrics2Before = stt_controller_1.sttController.getSessionMetrics(sessionId2);
        (0, vitest_1.expect)(metrics1Before).toBeDefined();
        (0, vitest_1.expect)(metrics2Before).toBeDefined();
        (0, vitest_1.expect)(metrics1Before.sessionId).not.toBe(metrics2Before.sessionId);
        // Forward to session 1 only
        const chunk = new Uint8Array(1024).fill(128);
        await stt_controller_1.sttController.forwardChunk(sessionId1, chunk);
        await stt_controller_1.sttController.forwardChunk(sessionId1, chunk);
        const metrics1After = stt_controller_1.sttController.getSessionMetrics(sessionId1);
        const metrics2After = stt_controller_1.sttController.getSessionMetrics(sessionId2);
        (0, vitest_1.expect)(metrics1After.chunksForwarded).toBeGreaterThan(0);
        (0, vitest_1.expect)(metrics2After.chunksForwarded).toBe(0); // Session 2 should be unchanged
        // Cleanup
        await stt_controller_1.sttController.endSession(sessionId1);
        await stt_controller_1.sttController.endSession(sessionId2);
    }, 10000);
});
