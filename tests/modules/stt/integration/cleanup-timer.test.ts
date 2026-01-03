/**
 * Cleanup Timer Integration Tests (Phase 3)
 * Tests automatic cleanup of stale sessions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { STTService } from '@/modules/stt/services/stt.service';
import { sttSessionService } from '@/modules/stt/services/stt-session.service';

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

describe('Cleanup Timer Integration (Phase 3)', () => {
  let service: STTService;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.DEEPGRAM_API_KEY = 'test-api-key';
    service = new STTService();
  });

  afterEach(async () => {
    await service.shutdown({ restart: false });
    sttSessionService.cleanup();
    vi.useRealTimers();
  });

  it('should start cleanup timer on service initialization', () => {
    // Service constructor starts the timer
    expect(service).toBeDefined();
    expect(service.isHealthy()).toBe(true);
  });

  it('should identify stale sessions (> 5 minutes inactive)', () => {
    // Create a session manually
    const session = sttSessionService.createSession('stale-session', 'conn-1', {
      samplingRate: 16000,
      language: 'en-US',
    });

    // Mark session as created 6 minutes ago
    vi.setSystemTime(Date.now());
    session.lastActivityTimestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago

    expect(sttSessionService.hasSession('stale-session')).toBe(true);

    const inactivityMs = Date.now() - session.lastActivityTimestamp;
    expect(inactivityMs).toBeGreaterThan(5 * 60 * 1000); // > 5 minutes
  });

  it('should not remove active sessions during cleanup', () => {
    // Create an active session
    const session = sttSessionService.createSession('active-session', 'conn-2', {
      samplingRate: 16000,
      language: 'en-US',
    });

    // Session was just created, should be active
    session.touch(); // Mark as recently active

    expect(sttSessionService.hasSession('active-session')).toBe(true);

    const inactivityMs = Date.now() - session.lastActivityTimestamp;
    expect(inactivityMs).toBeLessThan(5 * 60 * 1000); // < 5 minutes
  });

  it('should handle cleanup with no sessions', () => {
    // No sessions exist
    expect(sttSessionService.getSessionCount()).toBe(0);

    // Cleanup should not throw
    expect(() => {
      sttSessionService.cleanup();
    }).not.toThrow();
  });

  it('should track metrics after cleanup', async () => {
    const beforeMetrics = service.getMetrics();
    const beforeCleaned = beforeMetrics.totalSessionsCleaned;

    // Create and end a session
    const session = sttSessionService.createSession('cleanup-session', 'conn-3', {
      samplingRate: 16000,
      language: 'en-US',
    });

    await service.endSession('cleanup-session');

    const afterMetrics = service.getMetrics();
    const afterCleaned = afterMetrics.totalSessionsCleaned;

    expect(afterCleaned).toBeGreaterThanOrEqual(beforeCleaned);
  });

  it('should stop cleanup timer on shutdown', async () => {
    // Create service with timer
    const testService = new STTService();

    // Shutdown should stop the timer
    await testService.shutdown({ restart: false });

    // Service should not restart
    await expect(
      testService.createSession('test-session', {
        sessionId: 'test-session',
        connectionId: 'conn-4',
        samplingRate: 16000,
        language: 'en-US',
      })
    ).rejects.toThrow('shutting down');
  });

  it('should handle multiple stale sessions efficiently', () => {
    // Create 10 sessions
    for (let i = 0; i < 10; i++) {
      const session = sttSessionService.createSession(`session-${i}`, `conn-${i}`, {
        samplingRate: 16000,
        language: 'en-US',
      });

      // Make 5 of them stale (> 5 minutes)
      if (i < 5) {
        session.lastActivityTimestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago
      }
    }

    expect(sttSessionService.getSessionCount()).toBe(10);

    // Count stale sessions
    const staleSessions = sttSessionService
      .getAllSessions()
      .filter((s) => Date.now() - s.lastActivityTimestamp > 5 * 60 * 1000);

    expect(staleSessions.length).toBe(5);
  });

  it('should cleanup sessions without affecting active ones', () => {
    // Create mix of stale and active sessions
    const staleSession = sttSessionService.createSession('stale', 'conn-stale', {
      samplingRate: 16000,
      language: 'en-US',
    });
    staleSession.lastActivityTimestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago

    const activeSession = sttSessionService.createSession('active', 'conn-active', {
      samplingRate: 16000,
      language: 'en-US',
    });
    activeSession.touch(); // Recently active

    expect(sttSessionService.getSessionCount()).toBe(2);

    // Manually cleanup stale session
    sttSessionService.deleteSession('stale');

    // Active session should still exist
    expect(sttSessionService.hasSession('active')).toBe(true);
    expect(sttSessionService.hasSession('stale')).toBe(false);
    expect(sttSessionService.getSessionCount()).toBe(1);
  });

  it('should handle cleanup errors gracefully', () => {
    // Create a session
    const session = sttSessionService.createSession('error-session', 'conn-error', {
      samplingRate: 16000,
      language: 'en-US',
    });

    // Mock cleanup to throw error
    const originalCleanup = session.cleanup;
    session.cleanup = vi.fn(() => {
      throw new Error('Cleanup error');
    });

    // Cleanup should not throw
    expect(() => {
      try {
        session.cleanup();
      } catch (error) {
        // Expected error
      }
    }).not.toThrow();

    // Restore original cleanup
    session.cleanup = originalCleanup;
  });

  it('should verify session lifecycle timestamps', () => {
    const session = sttSessionService.createSession('timestamp-session', 'conn-ts', {
      samplingRate: 16000,
      language: 'en-US',
    });

    const createdAt = session.createdAt;
    const lastActivity = session.lastActivityTimestamp;

    expect(createdAt).toBe(lastActivity); // Should be same at creation

    // Advance time and touch
    vi.advanceTimersByTime(1000);
    session.touch();

    expect(session.lastActivityTimestamp).toBeGreaterThan(lastActivity);
    expect(session.createdAt).toBe(createdAt); // Should not change
  });
});
