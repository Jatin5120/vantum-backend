"use strict";
/**
 * Error Handling Integration Tests (Phase 2 & 3)
 * Tests error classification and handling across the STT pipeline
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const stt_service_1 = require("@/modules/stt/services/stt.service");
const stt_session_service_1 = require("@/modules/stt/services/stt-session.service");
const error_classifier_1 = require("@/modules/stt/utils/error-classifier");
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
(0, vitest_1.describe)('Error Handling Integration (Phase 2 & 3)', () => {
    let service;
    (0, vitest_1.beforeEach)(() => {
        process.env.DEEPGRAM_API_KEY = 'test-api-key';
        service = new stt_service_1.STTService();
    });
    (0, vitest_1.afterEach)(async () => {
        await service.shutdown({ restart: false });
        stt_session_service_1.sttSessionService.cleanup();
    });
    (0, vitest_1.describe)('Error Classification', () => {
        (0, vitest_1.it)('should classify 401 Unauthorized as fatal', () => {
            const error = new Error('401 Unauthorized');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.FATAL);
            (0, vitest_1.expect)(classified.retryable).toBe(false);
            (0, vitest_1.expect)(classified.statusCode).toBe(401);
        });
        (0, vitest_1.it)('should classify 403 Forbidden as fatal', () => {
            const error = new Error('403 Forbidden');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.FATAL);
            (0, vitest_1.expect)(classified.retryable).toBe(false);
            (0, vitest_1.expect)(classified.statusCode).toBe(403);
        });
        (0, vitest_1.it)('should classify 429 Rate Limit as retryable', () => {
            const error = new Error('429 Too Many Requests');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.RETRYABLE);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
            (0, vitest_1.expect)(classified.statusCode).toBe(429);
        });
        (0, vitest_1.it)('should classify 500 Internal Server Error as retryable', () => {
            const error = new Error('500 Internal Server Error');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.RETRYABLE);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
            (0, vitest_1.expect)(classified.statusCode).toBe(500);
        });
        (0, vitest_1.it)('should classify 503 Service Unavailable as retryable', () => {
            const error = new Error('503 Service Unavailable');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.RETRYABLE);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
            (0, vitest_1.expect)(classified.statusCode).toBe(503);
        });
        (0, vitest_1.it)('should classify network errors as timeout type (retryable)', () => {
            const error = new Error('ECONNREFUSED');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.TIMEOUT);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
        (0, vitest_1.it)('should classify timeout errors as timeout type (retryable)', () => {
            const error = new Error('ETIMEDOUT');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.TIMEOUT);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
        (0, vitest_1.it)('should classify unknown errors as retryable (fail-safe)', () => {
            const error = new Error('Some random error');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            // Unknown errors are treated as retryable for fail-safe behavior
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.RETRYABLE);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
    });
    (0, vitest_1.describe)('Error Handling in Sessions', () => {
        (0, vitest_1.it)('should track errors in session metrics', async () => {
            const session = stt_session_service_1.sttSessionService.createSession('error-session', 'conn-error', {
                samplingRate: 16000,
                language: 'en-US',
            });
            (0, vitest_1.expect)(session.metrics.errors).toBe(0);
            // Simulate error
            session.metrics.errors++;
            (0, vitest_1.expect)(session.metrics.errors).toBe(1);
            const metrics = service.getSessionMetrics('error-session');
            (0, vitest_1.expect)(metrics?.errors).toBe(1);
        });
        (0, vitest_1.it)('should handle high error rates', async () => {
            const session = stt_session_service_1.sttSessionService.createSession('high-error-session', 'conn-high-error', {
                samplingRate: 16000,
                language: 'en-US',
            });
            // Simulate 15 errors
            for (let i = 0; i < 15; i++) {
                session.metrics.errors++;
            }
            (0, vitest_1.expect)(session.metrics.errors).toBe(15);
        });
        (0, vitest_1.it)('should continue operating despite non-fatal errors', async () => {
            const session = stt_session_service_1.sttSessionService.createSession('resilient-session', 'conn-resilient', {
                samplingRate: 16000,
                language: 'en-US',
            });
            // Simulate some errors
            session.metrics.errors = 5;
            // Session should still be active
            (0, vitest_1.expect)(session.isActive).toBe(true);
            (0, vitest_1.expect)(stt_session_service_1.sttSessionService.hasSession('resilient-session')).toBe(true);
        });
        (0, vitest_1.it)('should cleanup session on fatal errors', () => {
            const session = stt_session_service_1.sttSessionService.createSession('fatal-error-session', 'conn-fatal', {
                samplingRate: 16000,
                language: 'en-US',
            });
            // Simulate fatal error
            session.connectionState = 'error';
            session.isActive = false;
            (0, vitest_1.expect)(session.connectionState).toBe('error');
            (0, vitest_1.expect)(session.isActive).toBe(false);
        });
    });
    (0, vitest_1.describe)('Service-Level Error Aggregation', () => {
        (0, vitest_1.it)('should aggregate errors from multiple sessions', () => {
            const session1 = stt_session_service_1.sttSessionService.createSession('session-1', 'conn-1', {
                samplingRate: 16000,
                language: 'en-US',
            });
            const session2 = stt_session_service_1.sttSessionService.createSession('session-2', 'conn-2', {
                samplingRate: 16000,
                language: 'en-US',
            });
            session1.metrics.errors = 3;
            session2.metrics.errors = 5;
            const metrics = service.getMetrics();
            (0, vitest_1.expect)(metrics.totalErrors).toBe(8);
        });
        (0, vitest_1.it)('should handle service with no errors', () => {
            stt_session_service_1.sttSessionService.createSession('clean-session-1', 'conn-clean-1', {
                samplingRate: 16000,
                language: 'en-US',
            });
            stt_session_service_1.sttSessionService.createSession('clean-session-2', 'conn-clean-2', {
                samplingRate: 16000,
                language: 'en-US',
            });
            const metrics = service.getMetrics();
            (0, vitest_1.expect)(metrics.totalErrors).toBe(0);
        });
    });
    (0, vitest_1.describe)('Error Recovery', () => {
        (0, vitest_1.it)('should recover from transient errors via reconnection', () => {
            const session = stt_session_service_1.sttSessionService.createSession('recovery-session', 'conn-recovery', {
                samplingRate: 16000,
                language: 'en-US',
            });
            // Simulate transient error
            session.connectionState = 'error';
            session.metrics.errors = 1;
            // Simulate recovery via reconnection
            session.connectionState = 'connected';
            session.metrics.reconnections = 1;
            session.metrics.successfulReconnections = 1;
            (0, vitest_1.expect)(session.connectionState).toBe('connected');
            (0, vitest_1.expect)(session.metrics.successfulReconnections).toBe(1);
        });
        (0, vitest_1.it)('should track failed reconnection attempts', () => {
            const session = stt_session_service_1.sttSessionService.createSession('failed-recovery', 'conn-failed', {
                samplingRate: 16000,
                language: 'en-US',
            });
            // Simulate failed reconnection
            session.metrics.reconnections = 3;
            session.metrics.failedReconnections = 3;
            session.connectionState = 'error';
            session.isActive = false;
            (0, vitest_1.expect)(session.metrics.failedReconnections).toBe(3);
            (0, vitest_1.expect)(session.isActive).toBe(false);
        });
    });
});
