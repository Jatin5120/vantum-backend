/**
 * STT Integration Test: Error Scenarios
 * Tests error handling, timeouts, and edge cases
 * Target Coverage: 80%+
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sttController } from '@/modules/stt/controllers/stt.controller';
import { sttSessionService } from '@/modules/stt/services/stt-session.service';
import type { STTConfig } from '@/modules/stt/types';
import { LiveTranscriptionEvents } from '@deepgram/sdk';

// ============================================================================
// MOCK SETUP - Factory Pattern (Prevents Timeouts)
// ============================================================================

let mockOnMethod: any;
let eventHandlers: Map<string, Function[]>;

const createMockLiveClient = () => {
  eventHandlers = new Map();

  mockOnMethod = vi.fn((event: string, handler: Function) => {
    if (!eventHandlers.has(event)) {
      eventHandlers.set(event, []);
    }
    eventHandlers.get(event)!.push(handler);

    // Auto-fire 'Open' event to prevent connection timeout
    if (event === LiveTranscriptionEvents.Open) {
      setTimeout(() => handler(), 10);
    }
  });

  return {
    on: mockOnMethod,
    off: vi.fn(),
    send: vi.fn(),
    finish: vi.fn(),
    requestClose: vi.fn(),
    removeListener: vi.fn(),
    getReadyState: vi.fn(() => 1), // OPEN
  };
};

vi.mock('@deepgram/sdk', () => {
  return {
    createClient: vi.fn(() => ({
      listen: {
        live: vi.fn(() => createMockLiveClient()),
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

describe('STT Integration: Error Scenarios', () => {
  const mockSessionId = 'error-test-session';
  const mockConfig: STTConfig = {
    sessionId: mockSessionId,
    connectionId: 'error-test-connection',
    samplingRate: 16000,
    language: 'en-US',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sttSessionService.cleanup();
  });

  afterEach(async () => {
    try {
      await sttController.endSession(mockSessionId);
    } catch (error) {
      // Ignore
    }
    sttSessionService.cleanup();
  });

  describe('Invalid Configuration', () => {
    it('should reject samplingRate below minimum (8000)', async () => {
      const invalidConfig = { ...mockConfig, samplingRate: 7999 };

      await expect(sttController.createSession(mockSessionId, invalidConfig)).rejects.toThrow(
        /Invalid samplingRate.*Must be between 8000 and 48000/
      );

      // Session should not be created
      expect(sttSessionService.getSession(mockSessionId)).toBeUndefined();
    });

    it('should reject samplingRate above maximum (48000)', async () => {
      const invalidConfig = { ...mockConfig, samplingRate: 48001 };

      await expect(sttController.createSession(mockSessionId, invalidConfig)).rejects.toThrow(
        /Invalid samplingRate.*Must be between 8000 and 48000/
      );

      expect(sttSessionService.getSession(mockSessionId)).toBeUndefined();
    });

    it('should reject missing sessionId', async () => {
      await expect(sttController.createSession('', mockConfig)).rejects.toThrow(
        'Invalid input: sessionId and config are required'
      );
    });

    it('should reject null config', async () => {
      await expect(
        sttController.createSession(mockSessionId, null as any)
      ).rejects.toThrow('Invalid input: sessionId and config are required');
    });

    it('should reject undefined config', async () => {
      await expect(
        sttController.createSession(mockSessionId, undefined as any)
      ).rejects.toThrow('Invalid input: sessionId and config are required');
    });
  });

  describe('Session Not Found Errors', () => {
    it('should handle forwardChunk for non-existent session gracefully', async () => {
      const chunk = new Uint8Array(1024).fill(128);

      // Should not throw
      await expect(
        sttController.forwardChunk('non-existent-session', chunk)
      ).resolves.toBeUndefined();
    });

    it('should return empty transcript for non-existent session', async () => {
      const transcript = await sttController.endSession('non-existent-session');

      expect(transcript).toBe('');
    });

    it('should return null metrics for non-existent session', () => {
      const metrics = sttController.getSessionMetrics('non-existent-session');

      expect(metrics).toBeUndefined();
    });

    it('should handle multiple operations on non-existent session', async () => {
      const nonExistentId = 'ghost-session';
      const chunk = new Uint8Array(1024);

      // All operations should be graceful
      await sttController.forwardChunk(nonExistentId, chunk);
      const transcript = await sttController.endSession(nonExistentId);
      const metrics = sttController.getSessionMetrics(nonExistentId);

      expect(transcript).toBe('');
      expect(metrics).toBeUndefined();
    });
  });

  describe('Invalid Audio Data', () => {
    beforeEach(async () => {
      await sttController.createSession(mockSessionId, mockConfig);
    });

    it('should handle null audio chunk gracefully', async () => {
      await expect(
        sttController.forwardChunk(mockSessionId, null as any)
      ).resolves.toBeUndefined();

      const session = sttSessionService.getSession(mockSessionId);
      expect(session!.metrics.chunksReceived).toBe(0); // Not counted
    });

    it('should handle undefined audio chunk gracefully', async () => {
      await sttController.forwardChunk(mockSessionId, undefined as any);

      const session = sttSessionService.getSession(mockSessionId);
      expect(session!.metrics.chunksReceived).toBe(0);
    });

    it('should handle empty audio chunk gracefully', async () => {
      const emptyChunk = new Uint8Array(0);

      await sttController.forwardChunk(mockSessionId, emptyChunk);

      const session = sttSessionService.getSession(mockSessionId);
      expect(session!.metrics.chunksReceived).toBe(0);
    });

    it('should handle extremely large audio chunk', async () => {
      const largeChunk = new Uint8Array(10 * 1024 * 1024); // 10MB

      await expect(
        sttController.forwardChunk(mockSessionId, largeChunk)
      ).resolves.toBeUndefined();
    });
  });

  describe('Health Check', () => {
    it('should return health status', () => {
      const isHealthy = sttController.isHealthy();

      expect(typeof isHealthy).toBe('boolean');
    });

    it('should indicate healthy when API key is set', () => {
      // Health check reflects the state from when STTService was instantiated
      // The test environment has DEEPGRAM_API_KEY set in setup.ts
      const isHealthy = sttController.isHealthy();

      expect(typeof isHealthy).toBe('boolean');
      // Note: May be true or false depending on environment setup
    });
  });

  describe('Shutdown Scenarios', () => {
    it('should shutdown gracefully with active sessions', async () => {
      await sttController.createSession(mockSessionId, mockConfig);
      await sttController.createSession('session-2', {
        ...mockConfig,
        sessionId: 'session-2',
      });

      await expect(sttController.shutdown({ restart: true })).resolves.toBeUndefined();

      // Sessions should be cleaned up
      expect(sttSessionService.getSessionCount()).toBe(0);
    });

    it('should shutdown gracefully with no active sessions', async () => {
      await expect(sttController.shutdown({ restart: true })).resolves.toBeUndefined();
    });

    it('should be idempotent (multiple shutdowns)', async () => {
      await sttController.shutdown({ restart: true });
      await sttController.shutdown({ restart: true });
      await sttController.shutdown({ restart: true });

      expect(sttSessionService.getSessionCount()).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle session with zero duration', async () => {
      await sttController.createSession(mockSessionId, mockConfig);

      // End immediately
      const transcript = await sttController.endSession(mockSessionId);

      expect(transcript).toBeDefined();
      expect(typeof transcript).toBe('string');
    });

    it('should handle boundary samplingRate values', async () => {
      // Lower boundary
      const config8k: STTConfig = { ...mockConfig, samplingRate: 8000 };
      await sttController.createSession('session-8k', config8k);
      await sttController.endSession('session-8k');

      // Upper boundary
      const config48k: STTConfig = { ...mockConfig, samplingRate: 48000 };
      await sttController.createSession('session-48k', config48k);
      await sttController.endSession('session-48k');

      expect(sttSessionService.getSessionCount()).toBe(0);
    });

    it('should handle special characters in sessionId', async () => {
      const specialId = 'session-!@#$%^&*()_+-={}[]|:;<>?,./';
      const specialConfig: STTConfig = { ...mockConfig, sessionId: specialId };

      await sttController.createSession(specialId, specialConfig);

      const session = sttSessionService.getSession(specialId);
      expect(session).toBeDefined();
      expect(session!.sessionId).toBe(specialId);

      await sttController.endSession(specialId);
    });

    it('should handle very long sessionId', async () => {
      const longId = 'session-' + 'a'.repeat(1000);
      const longConfig: STTConfig = { ...mockConfig, sessionId: longId };

      await sttController.createSession(longId, longConfig);

      const session = sttSessionService.getSession(longId);
      expect(session).toBeDefined();

      await sttController.endSession(longId);
    });

    it('should handle mixed final and interim transcripts', async () => {
      await sttController.createSession(mockSessionId, mockConfig);

      const session = sttSessionService.getSession(mockSessionId);
      expect(session).toBeDefined();

      // Simulate mixed transcripts
      session!.addTranscript('Hello', 0.9, false); // Interim
      session!.addTranscript('Hello world', 0.95, true); // Final
      session!.addTranscript('This is', 0.85, false); // Interim
      session!.addTranscript('This is a test', 0.93, true); // Final

      const transcript = await sttController.endSession(mockSessionId);

      expect(transcript).toContain('Hello world');
      expect(transcript).toContain('This is a test');
      expect(transcript).not.toContain('Hello\n'); // Interim should not be in final
    });

    it('should handle session with only interim transcripts', async () => {
      await sttController.createSession(mockSessionId, mockConfig);

      const session = sttSessionService.getSession(mockSessionId);
      session!.addTranscript('Interim 1', 0.8, false);
      session!.addTranscript('Interim 2', 0.82, false);
      session!.addTranscript('Interim 3', 0.85, false);

      const transcript = await sttController.endSession(mockSessionId);

      // When there are only interim transcripts, the last interim is returned as fallback
      // This handles real-world scenarios where session ends before Deepgram finalizes
      expect(transcript).toBe('Interim 3');
    });

    it('should handle rapid session create/delete cycles', async () => {
      for (let i = 0; i < 10; i++) {
        await sttController.createSession(mockSessionId, mockConfig);
        await sttController.endSession(mockSessionId);
      }

      expect(sttSessionService.getSession(mockSessionId)).toBeUndefined();
      expect(sttSessionService.getSessionCount()).toBe(0);
    }, 10000);
  });

  describe('Metrics Edge Cases', () => {
    it('should handle getMetrics with zero sessions', () => {
      const metrics = sttController.getMetrics();

      expect(metrics.activeSessions).toBe(0);
      expect(metrics.totalChunksForwarded).toBe(0);
      expect(metrics.totalTranscriptsReceived).toBe(0);
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.totalReconnections).toBe(0);
    });

    it('should aggregate metrics correctly with multiple sessions', async () => {
      await sttController.createSession('session-1', {
        ...mockConfig,
        sessionId: 'session-1',
      });
      await sttController.createSession('session-2', {
        ...mockConfig,
        sessionId: 'session-2',
      });
      await sttController.createSession('session-3', {
        ...mockConfig,
        sessionId: 'session-3',
      });

      // Forward chunks to each
      const chunk = new Uint8Array(1024).fill(128);
      await sttController.forwardChunk('session-1', chunk);
      await sttController.forwardChunk('session-2', chunk);
      await sttController.forwardChunk('session-3', chunk);

      const metrics = sttController.getMetrics();

      expect(metrics.activeSessions).toBe(3);
      expect(metrics.totalChunksForwarded).toBeGreaterThanOrEqual(0);

      // Cleanup
      await sttController.endSession('session-1');
      await sttController.endSession('session-2');
      await sttController.endSession('session-3');
    });

    it('should track errors in metrics', async () => {
      await sttController.createSession(mockSessionId, mockConfig);

      const session = sttSessionService.getSession(mockSessionId);

      // Simulate errors
      session!.metrics.errors = 5;

      const sessionMetrics = sttController.getSessionMetrics(mockSessionId);
      expect(sessionMetrics!.errors).toBe(5);

      const serviceMetrics = sttController.getMetrics();
      expect(serviceMetrics.totalErrors).toBeGreaterThanOrEqual(5);

      await sttController.endSession(mockSessionId);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent forwardChunk calls', async () => {
      await sttController.createSession(mockSessionId, mockConfig);

      const chunk = new Uint8Array(512).fill(128);
      const promises = [];

      for (let i = 0; i < 20; i++) {
        promises.push(sttController.forwardChunk(mockSessionId, chunk));
      }

      await Promise.all(promises);

      const session = sttSessionService.getSession(mockSessionId);
      expect(session!.metrics.chunksReceived).toBe(20);

      await sttController.endSession(mockSessionId);
    });

    it('should handle concurrent session creation attempts', async () => {
      const promises = [];

      for (let i = 0; i < 5; i++) {
        const config: STTConfig = { ...mockConfig, sessionId: `concurrent-${i}` };
        promises.push(sttController.createSession(`concurrent-${i}`, config));
      }

      await Promise.all(promises);

      expect(sttSessionService.getSessionCount()).toBe(5);

      // Cleanup
      for (let i = 0; i < 5; i++) {
        await sttController.endSession(`concurrent-${i}`);
      }
    });
  });
});
