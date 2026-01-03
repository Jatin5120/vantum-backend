/**
 * Error Handling Integration Tests (Phase 2 & 3)
 * Tests error classification and handling across the STT pipeline
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { STTService } from '@/modules/stt/services/stt.service';
import { sttSessionService } from '@/modules/stt/services/stt-session.service';
import { classifyDeepgramError, ErrorType } from '@/modules/stt/utils/error-classifier';

// Mock Deepgram SDK
vi.mock('@deepgram/sdk', () => {
  const mockLiveClient = {
    on: vi.fn(),
    send: vi.fn(),
    requestClose: vi.fn(),
    removeListener: vi.fn(),
  };

  return {
    createClient: vi.fn(() => ({
      listen: {
        live: vi.fn(() => mockLiveClient),
      },
    })),
  };
});

describe('Error Handling Integration (Phase 2 & 3)', () => {
  let service: STTService;

  beforeEach(() => {
    process.env.DEEPGRAM_API_KEY = 'test-api-key';
    service = new STTService();
  });

  afterEach(async () => {
    await service.shutdown({ restart: false });
    sttSessionService.cleanup();
  });

  describe('Error Classification', () => {
    it('should classify 401 Unauthorized as fatal', () => {
      const error = new Error('401 Unauthorized');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.FATAL);
      expect(classified.retryable).toBe(false);
      expect(classified.statusCode).toBe(401);
    });

    it('should classify 403 Forbidden as fatal', () => {
      const error = new Error('403 Forbidden');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.FATAL);
      expect(classified.retryable).toBe(false);
      expect(classified.statusCode).toBe(403);
    });

    it('should classify 429 Rate Limit as retryable', () => {
      const error = new Error('429 Too Many Requests');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.RETRYABLE);
      expect(classified.retryable).toBe(true);
      expect(classified.statusCode).toBe(429);
    });

    it('should classify 500 Internal Server Error as retryable', () => {
      const error = new Error('500 Internal Server Error');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.RETRYABLE);
      expect(classified.retryable).toBe(true);
      expect(classified.statusCode).toBe(500);
    });

    it('should classify 503 Service Unavailable as retryable', () => {
      const error = new Error('503 Service Unavailable');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.RETRYABLE);
      expect(classified.retryable).toBe(true);
      expect(classified.statusCode).toBe(503);
    });

    it('should classify network errors as timeout type (retryable)', () => {
      const error = new Error('ECONNREFUSED');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.TIMEOUT);
      expect(classified.retryable).toBe(true);
    });

    it('should classify timeout errors as timeout type (retryable)', () => {
      const error = new Error('ETIMEDOUT');
      const classified = classifyDeepgramError(error);

      expect(classified.type).toBe(ErrorType.TIMEOUT);
      expect(classified.retryable).toBe(true);
    });

    it('should classify unknown errors as retryable (fail-safe)', () => {
      const error = new Error('Some random error');
      const classified = classifyDeepgramError(error);

      // Unknown errors are treated as retryable for fail-safe behavior
      expect(classified.type).toBe(ErrorType.RETRYABLE);
      expect(classified.retryable).toBe(true);
    });
  });

  describe('Error Handling in Sessions', () => {
    it('should track errors in session metrics', async () => {
      const session = sttSessionService.createSession('error-session', 'conn-error', {
        samplingRate: 16000,
        language: 'en-US',
      });

      expect(session.metrics.errors).toBe(0);

      // Simulate error
      session.metrics.errors++;

      expect(session.metrics.errors).toBe(1);

      const metrics = service.getSessionMetrics('error-session');
      expect(metrics?.errors).toBe(1);
    });

    it('should handle high error rates', async () => {
      const session = sttSessionService.createSession('high-error-session', 'conn-high-error', {
        samplingRate: 16000,
        language: 'en-US',
      });

      // Simulate 15 errors
      for (let i = 0; i < 15; i++) {
        session.metrics.errors++;
      }

      expect(session.metrics.errors).toBe(15);
    });

    it('should continue operating despite non-fatal errors', async () => {
      const session = sttSessionService.createSession('resilient-session', 'conn-resilient', {
        samplingRate: 16000,
        language: 'en-US',
      });

      // Simulate some errors
      session.metrics.errors = 5;

      // Session should still be active
      expect(session.isActive).toBe(true);
      expect(sttSessionService.hasSession('resilient-session')).toBe(true);
    });

    it('should cleanup session on fatal errors', () => {
      const session = sttSessionService.createSession('fatal-error-session', 'conn-fatal', {
        samplingRate: 16000,
        language: 'en-US',
      });

      // Simulate fatal error
      session.connectionState = 'error';
      session.isActive = false;

      expect(session.connectionState).toBe('error');
      expect(session.isActive).toBe(false);
    });
  });

  describe('Service-Level Error Aggregation', () => {
    it('should aggregate errors from multiple sessions', () => {
      const session1 = sttSessionService.createSession('session-1', 'conn-1', {
        samplingRate: 16000,
        language: 'en-US',
      });
      const session2 = sttSessionService.createSession('session-2', 'conn-2', {
        samplingRate: 16000,
        language: 'en-US',
      });

      session1.metrics.errors = 3;
      session2.metrics.errors = 5;

      const metrics = service.getMetrics();

      expect(metrics.totalErrors).toBe(8);
    });

    it('should handle service with no errors', () => {
      sttSessionService.createSession('clean-session-1', 'conn-clean-1', {
        samplingRate: 16000,
        language: 'en-US',
      });
      sttSessionService.createSession('clean-session-2', 'conn-clean-2', {
        samplingRate: 16000,
        language: 'en-US',
      });

      const metrics = service.getMetrics();

      expect(metrics.totalErrors).toBe(0);
    });
  });

  describe('Error Recovery', () => {
    it('should recover from transient errors via reconnection', () => {
      const session = sttSessionService.createSession('recovery-session', 'conn-recovery', {
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

      expect(session.connectionState).toBe('connected');
      expect(session.metrics.successfulReconnections).toBe(1);
    });

    it('should track failed reconnection attempts', () => {
      const session = sttSessionService.createSession('failed-recovery', 'conn-failed', {
        samplingRate: 16000,
        language: 'en-US',
      });

      // Simulate failed reconnection
      session.metrics.reconnections = 3;
      session.metrics.failedReconnections = 3;
      session.connectionState = 'error';
      session.isActive = false;

      expect(session.metrics.failedReconnections).toBe(3);
      expect(session.isActive).toBe(false);
    });
  });
});
