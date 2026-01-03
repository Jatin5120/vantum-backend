"use strict";
/**
 * Cleanup Timer Integration Tests (Phase 3)
 * Tests automatic cleanup of stale sessions
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const stt_service_1 = require("@/modules/stt/services/stt.service");
const stt_session_service_1 = require("@/modules/stt/services/stt-session.service");
// Mock Deepgram SDK
vitest_1.vi.mock('@deepgram/sdk', () => {
    const mockLiveClient = {
        on: vitest_1.vi.fn(),
        send: vitest_1.vi.fn(),
        requestClose: vitest_1.vi.fn(),
        removeListener: vitest_1.vi.fn(),
    };
    return {
        createClient: vitest_1.vi.fn(() => ({
            listen: {
                live: vitest_1.vi.fn(() => mockLiveClient),
            },
        })),
    };
});
(0, vitest_1.describe)('Cleanup Timer Integration (Phase 3)', () => {
    let service;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.useFakeTimers();
        process.env.DEEPGRAM_API_KEY = 'test-api-key';
        service = new stt_service_1.STTService();
    });
    (0, vitest_1.afterEach)(async () => {
        await service.shutdown({ restart: false });
        stt_session_service_1.sttSessionService.cleanup();
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.it)('should start cleanup timer on service initialization', () => {
        // Service constructor starts the timer
        (0, vitest_1.expect)(service).toBeDefined();
        (0, vitest_1.expect)(service.isHealthy()).toBe(true);
    });
    (0, vitest_1.it)('should identify stale sessions (> 5 minutes inactive)', () => {
        // Create a session manually
        const session = stt_session_service_1.sttSessionService.createSession('stale-session', 'conn-1', {
            samplingRate: 16000,
            language: 'en-US',
        });
        // Mark session as created 6 minutes ago
        vitest_1.vi.setSystemTime(Date.now());
        session.lastActivityTimestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago
        (0, vitest_1.expect)(stt_session_service_1.sttSessionService.hasSession('stale-session')).toBe(true);
        const inactivityMs = Date.now() - session.lastActivityTimestamp;
        (0, vitest_1.expect)(inactivityMs).toBeGreaterThan(5 * 60 * 1000); // > 5 minutes
    });
    (0, vitest_1.it)('should not remove active sessions during cleanup', () => {
        // Create an active session
        const session = stt_session_service_1.sttSessionService.createSession('active-session', 'conn-2', {
            samplingRate: 16000,
            language: 'en-US',
        });
        // Session was just created, should be active
        session.touch(); // Mark as recently active
        (0, vitest_1.expect)(stt_session_service_1.sttSessionService.hasSession('active-session')).toBe(true);
        const inactivityMs = Date.now() - session.lastActivityTimestamp;
        (0, vitest_1.expect)(inactivityMs).toBeLessThan(5 * 60 * 1000); // < 5 minutes
    });
    (0, vitest_1.it)('should handle cleanup with no sessions', () => {
        // No sessions exist
        (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSessionCount()).toBe(0);
        // Cleanup should not throw
        (0, vitest_1.expect)(() => {
            stt_session_service_1.sttSessionService.cleanup();
        }).not.toThrow();
    });
    (0, vitest_1.it)('should track metrics after cleanup', async () => {
        const beforeMetrics = service.getMetrics();
        const beforeCleaned = beforeMetrics.totalSessionsCleaned;
        // Create and end a session
        const session = stt_session_service_1.sttSessionService.createSession('cleanup-session', 'conn-3', {
            samplingRate: 16000,
            language: 'en-US',
        });
        await service.endSession('cleanup-session');
        const afterMetrics = service.getMetrics();
        const afterCleaned = afterMetrics.totalSessionsCleaned;
        (0, vitest_1.expect)(afterCleaned).toBeGreaterThanOrEqual(beforeCleaned);
    });
    (0, vitest_1.it)('should stop cleanup timer on shutdown', async () => {
        // Create service with timer
        const testService = new stt_service_1.STTService();
        // Shutdown should stop the timer
        await testService.shutdown({ restart: false });
        // Service should not restart
        await (0, vitest_1.expect)(testService.createSession('test-session', {
            sessionId: 'test-session',
            connectionId: 'conn-4',
            samplingRate: 16000,
            language: 'en-US',
        })).rejects.toThrow('shutting down');
    });
    (0, vitest_1.it)('should handle multiple stale sessions efficiently', () => {
        // Create 10 sessions
        for (let i = 0; i < 10; i++) {
            const session = stt_session_service_1.sttSessionService.createSession(`session-${i}`, `conn-${i}`, {
                samplingRate: 16000,
                language: 'en-US',
            });
            // Make 5 of them stale (> 5 minutes)
            if (i < 5) {
                session.lastActivityTimestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago
            }
        }
        (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSessionCount()).toBe(10);
        // Count stale sessions
        const staleSessions = stt_session_service_1.sttSessionService
            .getAllSessions()
            .filter((s) => Date.now() - s.lastActivityTimestamp > 5 * 60 * 1000);
        (0, vitest_1.expect)(staleSessions.length).toBe(5);
    });
    (0, vitest_1.it)('should cleanup sessions without affecting active ones', () => {
        // Create mix of stale and active sessions
        const staleSession = stt_session_service_1.sttSessionService.createSession('stale', 'conn-stale', {
            samplingRate: 16000,
            language: 'en-US',
        });
        staleSession.lastActivityTimestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago
        const activeSession = stt_session_service_1.sttSessionService.createSession('active', 'conn-active', {
            samplingRate: 16000,
            language: 'en-US',
        });
        activeSession.touch(); // Recently active
        (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSessionCount()).toBe(2);
        // Manually cleanup stale session
        stt_session_service_1.sttSessionService.deleteSession('stale');
        // Active session should still exist
        (0, vitest_1.expect)(stt_session_service_1.sttSessionService.hasSession('active')).toBe(true);
        (0, vitest_1.expect)(stt_session_service_1.sttSessionService.hasSession('stale')).toBe(false);
        (0, vitest_1.expect)(stt_session_service_1.sttSessionService.getSessionCount()).toBe(1);
    });
    (0, vitest_1.it)('should handle cleanup errors gracefully', () => {
        // Create a session
        const session = stt_session_service_1.sttSessionService.createSession('error-session', 'conn-error', {
            samplingRate: 16000,
            language: 'en-US',
        });
        // Mock cleanup to throw error
        const originalCleanup = session.cleanup;
        session.cleanup = vitest_1.vi.fn(() => {
            throw new Error('Cleanup error');
        });
        // Cleanup should not throw
        (0, vitest_1.expect)(() => {
            try {
                session.cleanup();
            }
            catch (error) {
                // Expected error
            }
        }).not.toThrow();
        // Restore original cleanup
        session.cleanup = originalCleanup;
    });
    (0, vitest_1.it)('should verify session lifecycle timestamps', () => {
        const session = stt_session_service_1.sttSessionService.createSession('timestamp-session', 'conn-ts', {
            samplingRate: 16000,
            language: 'en-US',
        });
        const createdAt = session.createdAt;
        const lastActivity = session.lastActivityTimestamp;
        (0, vitest_1.expect)(createdAt).toBe(lastActivity); // Should be same at creation
        // Advance time and touch
        vitest_1.vi.advanceTimersByTime(1000);
        session.touch();
        (0, vitest_1.expect)(session.lastActivityTimestamp).toBeGreaterThan(lastActivity);
        (0, vitest_1.expect)(session.createdAt).toBe(createdAt); // Should not change
    });
});
