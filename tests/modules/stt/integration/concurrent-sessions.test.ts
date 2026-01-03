/**
 * STT Integration Test: Concurrent Sessions
 * Tests multiple parallel STT sessions to verify isolation and resource management
 * Target Coverage: 80%+
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sttController } from '@/modules/stt/controllers/stt.controller';
import { sttSessionService } from '@/modules/stt/services/stt-session.service';
import type { STTConfig } from '@/modules/stt/types';
import { LiveTranscriptionEvents } from '@deepgram/sdk';

// ============================================================================
// MOCK SETUP - Factory Pattern (Each session gets unique client)
// ============================================================================

let mockOnMethod: any;
let eventHandlers: Map<string, Function[]>;

const createMockLiveClient = () => {
  // Each client gets its own event handlers map
  const localHandlers = new Map<string, Function[]>();

  mockOnMethod = vi.fn((event: string, handler: Function) => {
    if (!localHandlers.has(event)) {
      localHandlers.set(event, []);
    }
    localHandlers.get(event)!.push(handler);

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
    _localHandlers: localHandlers, // Store reference for triggering
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

describe('STT Integration: Concurrent Sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sttSessionService.cleanup();
  });

  afterEach(async () => {
    // Cleanup all test sessions
    const sessions = sttSessionService.getAllSessions();
    for (const session of sessions) {
      try {
        await sttController.endSession(session.sessionId);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    sttSessionService.cleanup();
  });

  describe('Multiple Session Creation', () => {
    it('should create 3 concurrent sessions successfully', async () => {
      const sessionIds = ['session-1', 'session-2', 'session-3'];
      const configs: STTConfig[] = sessionIds.map((id) => ({
        sessionId: id,
        connectionId: `conn-${id}`,
        samplingRate: 16000,
        language: 'en-US',
      }));

      // Create all sessions concurrently
      await Promise.all(
        configs.map((config, idx) => sttController.createSession(sessionIds[idx], config))
      );

      expect(sttSessionService.getSessionCount()).toBe(3);

      // Verify each session exists
      sessionIds.forEach((id) => {
        const session = sttSessionService.getSession(id);
        expect(session).toBeDefined();
        expect(session!.sessionId).toBe(id);
      });

      // Cleanup
      await Promise.all(sessionIds.map((id) => sttController.endSession(id)));
    });

    it('should create 10 concurrent sessions successfully', async () => {
      const sessionIds = Array.from({ length: 10 }, (_, i) => `session-${i}`);
      const configs: STTConfig[] = sessionIds.map((id) => ({
        sessionId: id,
        connectionId: `conn-${id}`,
        samplingRate: 16000,
        language: 'en-US',
      }));

      await Promise.all(
        configs.map((config, idx) => sttController.createSession(sessionIds[idx], config))
      );

      expect(sttSessionService.getSessionCount()).toBe(10);

      // Cleanup
      await Promise.all(sessionIds.map((id) => sttController.endSession(id)));
    }, 15000);

    it('should handle sessions with different sampling rates', async () => {
      const sessions = [
        { id: 'session-8k', rate: 8000 },
        { id: 'session-16k', rate: 16000 },
        { id: 'session-24k', rate: 24000 },
        { id: 'session-48k', rate: 48000 },
      ];

      await Promise.all(
        sessions.map(({ id, rate }) =>
          sttController.createSession(id, {
            sessionId: id,
            connectionId: `conn-${id}`,
            samplingRate: rate,
            language: 'en-US',
          })
        )
      );

      expect(sttSessionService.getSessionCount()).toBe(4);

      // Verify each has correct config
      sessions.forEach(({ id, rate }) => {
        const session = sttSessionService.getSession(id);
        expect(session!.config.samplingRate).toBe(rate);
      });

      // Cleanup
      await Promise.all(sessions.map(({ id }) => sttController.endSession(id)));
    });

    it('should handle sessions with different languages', async () => {
      const sessions = [
        { id: 'session-en', lang: 'en-US' },
        { id: 'session-es', lang: 'es-ES' },
        { id: 'session-fr', lang: 'fr-FR' },
        { id: 'session-de', lang: 'de-DE' },
      ];

      await Promise.all(
        sessions.map(({ id, lang }) =>
          sttController.createSession(id, {
            sessionId: id,
            connectionId: `conn-${id}`,
            samplingRate: 16000,
            language: lang,
          })
        )
      );

      // Verify languages
      sessions.forEach(({ id, lang }) => {
        const session = sttSessionService.getSession(id);
        expect(session!.config.language).toBe(lang);
      });

      // Cleanup
      await Promise.all(sessions.map(({ id }) => sttController.endSession(id)));
    });
  });

  describe('Concurrent Audio Forwarding', () => {
    it('should forward audio to multiple sessions without interference', async () => {
      const sessionIds = ['session-1', 'session-2', 'session-3'];

      // Create sessions
      await Promise.all(
        sessionIds.map((id) =>
          sttController.createSession(id, {
            sessionId: id,
            connectionId: `conn-${id}`,
            samplingRate: 16000,
            language: 'en-US',
          })
        )
      );

      // Forward different amounts of audio to each
      const chunk = new Uint8Array(1024).fill(128);

      await sttController.forwardChunk(sessionIds[0], chunk); // 2 chunks
      await sttController.forwardChunk(sessionIds[0], chunk);

      await sttController.forwardChunk(sessionIds[1], chunk); // 3 chunks
      await sttController.forwardChunk(sessionIds[1], chunk);
      await sttController.forwardChunk(sessionIds[1], chunk);

      await sttController.forwardChunk(sessionIds[2], chunk); // 4 chunks
      await sttController.forwardChunk(sessionIds[2], chunk);
      await sttController.forwardChunk(sessionIds[2], chunk);
      await sttController.forwardChunk(sessionIds[2], chunk);

      // Verify each session has correct count
      expect(sttSessionService.getSession(sessionIds[0])!.metrics.chunksReceived).toBe(2);
      expect(sttSessionService.getSession(sessionIds[1])!.metrics.chunksReceived).toBe(3);
      expect(sttSessionService.getSession(sessionIds[2])!.metrics.chunksReceived).toBe(4);

      // Cleanup
      await Promise.all(sessionIds.map((id) => sttController.endSession(id)));
    });

    it('should handle parallel forwarding to same session', async () => {
      const sessionId = 'parallel-session';

      await sttController.createSession(sessionId, {
        sessionId,
        connectionId: 'conn-parallel',
        samplingRate: 16000,
        language: 'en-US',
      });

      const chunk = new Uint8Array(512).fill(128);
      const promises = [];

      // Forward 50 chunks in parallel
      for (let i = 0; i < 50; i++) {
        promises.push(sttController.forwardChunk(sessionId, chunk));
      }

      await Promise.all(promises);

      const session = sttSessionService.getSession(sessionId);
      expect(session!.metrics.chunksReceived).toBe(50);

      await sttController.endSession(sessionId);
    });

    it('should handle parallel forwarding to multiple sessions', async () => {
      const sessionIds = ['session-1', 'session-2', 'session-3'];

      // Create all sessions
      await Promise.all(
        sessionIds.map((id) =>
          sttController.createSession(id, {
            sessionId: id,
            connectionId: `conn-${id}`,
            samplingRate: 16000,
            language: 'en-US',
          })
        )
      );

      const chunk = new Uint8Array(1024).fill(128);
      const promises = [];

      // Forward to all sessions in parallel
      for (const sessionId of sessionIds) {
        for (let i = 0; i < 10; i++) {
          promises.push(sttController.forwardChunk(sessionId, chunk));
        }
      }

      await Promise.all(promises);

      // Each session should have 10 chunks
      sessionIds.forEach((id) => {
        const session = sttSessionService.getSession(id);
        expect(session!.metrics.chunksReceived).toBe(10);
      });

      // Cleanup
      await Promise.all(sessionIds.map((id) => sttController.endSession(id)));
    });
  });

  describe('Session Isolation', () => {
    it('should maintain independent transcripts across sessions', async () => {
      const sessionIds = ['session-A', 'session-B', 'session-C'];

      await Promise.all(
        sessionIds.map((id) =>
          sttController.createSession(id, {
            sessionId: id,
            connectionId: `conn-${id}`,
            samplingRate: 16000,
            language: 'en-US',
          })
        )
      );

      // Add unique transcripts to each
      const sessionA = sttSessionService.getSession(sessionIds[0])!;
      const sessionB = sttSessionService.getSession(sessionIds[1])!;
      const sessionC = sttSessionService.getSession(sessionIds[2])!;

      sessionA.addTranscript('Transcript A', 0.95, true);
      sessionB.addTranscript('Transcript B', 0.93, true);
      sessionC.addTranscript('Transcript C', 0.97, true);

      // Verify isolation
      expect(sessionA.getFinalTranscript()).toBe('Transcript A');
      expect(sessionB.getFinalTranscript()).toBe('Transcript B');
      expect(sessionC.getFinalTranscript()).toBe('Transcript C');

      // Cleanup
      await Promise.all(sessionIds.map((id) => sttController.endSession(id)));
    });

    it('should maintain independent metrics across sessions', async () => {
      const sessionIds = ['session-1', 'session-2'];

      await Promise.all(
        sessionIds.map((id) =>
          sttController.createSession(id, {
            sessionId: id,
            connectionId: `conn-${id}`,
            samplingRate: 16000,
            language: 'en-US',
          })
        )
      );

      const session1 = sttSessionService.getSession(sessionIds[0])!;
      const session2 = sttSessionService.getSession(sessionIds[1])!;

      // Set different metrics
      session1.metrics.errors = 5;
      session2.metrics.errors = 2;

      session1.metrics.chunksReceived = 100;
      session2.metrics.chunksReceived = 50;

      // Verify isolation
      expect(session1.metrics.errors).toBe(5);
      expect(session2.metrics.errors).toBe(2);
      expect(session1.metrics.chunksReceived).toBe(100);
      expect(session2.metrics.chunksReceived).toBe(50);

      // Cleanup
      await Promise.all(sessionIds.map((id) => sttController.endSession(id)));
    });

    it('should not affect other sessions when one is deleted', async () => {
      const sessionIds = ['session-1', 'session-2', 'session-3'];

      await Promise.all(
        sessionIds.map((id) =>
          sttController.createSession(id, {
            sessionId: id,
            connectionId: `conn-${id}`,
            samplingRate: 16000,
            language: 'en-US',
          })
        )
      );

      expect(sttSessionService.getSessionCount()).toBe(3);

      // Delete middle session
      await sttController.endSession(sessionIds[1]);

      expect(sttSessionService.getSessionCount()).toBe(2);
      expect(sttSessionService.getSession(sessionIds[0])).toBeDefined();
      expect(sttSessionService.getSession(sessionIds[1])).toBeUndefined();
      expect(sttSessionService.getSession(sessionIds[2])).toBeDefined();

      // Cleanup remaining
      await sttController.endSession(sessionIds[0]);
      await sttController.endSession(sessionIds[2]);
    });
  });

  describe('Service-Level Metrics Aggregation', () => {
    it('should aggregate metrics across all active sessions', async () => {
      const sessionIds = ['session-1', 'session-2', 'session-3'];

      await Promise.all(
        sessionIds.map((id) =>
          sttController.createSession(id, {
            sessionId: id,
            connectionId: `conn-${id}`,
            samplingRate: 16000,
            language: 'en-US',
          })
        )
      );

      // Set metrics for each session
      sttSessionService.getSession(sessionIds[0])!.metrics.chunksForwarded = 100;
      sttSessionService.getSession(sessionIds[0])!.metrics.transcriptsReceived = 10;
      sttSessionService.getSession(sessionIds[0])!.metrics.errors = 1;

      sttSessionService.getSession(sessionIds[1])!.metrics.chunksForwarded = 200;
      sttSessionService.getSession(sessionIds[1])!.metrics.transcriptsReceived = 20;
      sttSessionService.getSession(sessionIds[1])!.metrics.errors = 2;

      sttSessionService.getSession(sessionIds[2])!.metrics.chunksForwarded = 150;
      sttSessionService.getSession(sessionIds[2])!.metrics.transcriptsReceived = 15;
      sttSessionService.getSession(sessionIds[2])!.metrics.errors = 0;

      const serviceMetrics = sttController.getMetrics();

      expect(serviceMetrics.activeSessions).toBe(3);
      expect(serviceMetrics.totalChunksForwarded).toBe(450);
      expect(serviceMetrics.totalTranscriptsReceived).toBe(45);
      expect(serviceMetrics.totalErrors).toBe(3);

      // Cleanup
      await Promise.all(sessionIds.map((id) => sttController.endSession(id)));
    });

    it('should update metrics as sessions are added/removed', async () => {
      // Initial state
      let metrics = sttController.getMetrics();
      const initialCount = metrics.activeSessions;

      // Add 3 sessions
      const sessionIds = ['session-1', 'session-2', 'session-3'];
      await Promise.all(
        sessionIds.map((id) =>
          sttController.createSession(id, {
            sessionId: id,
            connectionId: `conn-${id}`,
            samplingRate: 16000,
            language: 'en-US',
          })
        )
      );

      metrics = sttController.getMetrics();
      expect(metrics.activeSessions).toBe(initialCount + 3);

      // Remove 2 sessions
      await sttController.endSession(sessionIds[0]);
      await sttController.endSession(sessionIds[1]);

      metrics = sttController.getMetrics();
      expect(metrics.activeSessions).toBe(initialCount + 1);

      // Remove last session
      await sttController.endSession(sessionIds[2]);

      metrics = sttController.getMetrics();
      expect(metrics.activeSessions).toBe(initialCount);
    });
  });

  describe('Stress Testing', () => {
    it('should handle 20 concurrent sessions', async () => {
      const sessionIds = Array.from({ length: 20 }, (_, i) => `stress-session-${i}`);

      // Create all sessions
      await Promise.all(
        sessionIds.map((id) =>
          sttController.createSession(id, {
            sessionId: id,
            connectionId: `conn-${id}`,
            samplingRate: 16000,
            language: 'en-US',
          })
        )
      );

      expect(sttSessionService.getSessionCount()).toBe(20);

      // Forward audio to all
      const chunk = new Uint8Array(1024).fill(128);
      const promises = [];

      for (const sessionId of sessionIds) {
        for (let i = 0; i < 5; i++) {
          promises.push(sttController.forwardChunk(sessionId, chunk));
        }
      }

      await Promise.all(promises);

      // Verify all sessions processed audio
      sessionIds.forEach((id) => {
        const session = sttSessionService.getSession(id);
        expect(session!.metrics.chunksReceived).toBe(5);
      });

      // Cleanup all
      await Promise.all(sessionIds.map((id) => sttController.endSession(id)));

      expect(sttSessionService.getSessionCount()).toBe(0);
    }, 20000);

    it('should handle rapid session lifecycle (create → forward → end)', async () => {
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        const sessionId = `rapid-${i}`;

        await sttController.createSession(sessionId, {
          sessionId,
          connectionId: `conn-${i}`,
          samplingRate: 16000,
          language: 'en-US',
        });

        const chunk = new Uint8Array(512).fill(128);
        await sttController.forwardChunk(sessionId, chunk);
        await sttController.forwardChunk(sessionId, chunk);

        await sttController.endSession(sessionId);

        expect(sttSessionService.getSession(sessionId)).toBeUndefined();
      }

      expect(sttSessionService.getSessionCount()).toBe(0);
    }, 15000);
  });
});
