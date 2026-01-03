/**
 * STT Integration Test: Complete Flow
 * Tests the end-to-end STT flow: create → forward → end
 * Target Coverage: 80%+
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sttController } from '@/modules/stt/controllers/stt.controller';
import { sttService } from '@/modules/stt/services/stt.service';
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

// Helper to trigger events manually
const triggerEvent = (event: string, data?: any) => {
  const handlers = eventHandlers.get(event);
  if (handlers) {
    handlers.forEach((handler) => handler(data));
  }
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

describe('STT Integration: Complete Flow', () => {
  const mockSessionId = 'integration-test-session';
  const mockConfig: STTConfig = {
    sessionId: mockSessionId,
    connectionId: 'integration-test-connection',
    samplingRate: 16000,
    language: 'en-US',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure clean state
    sttSessionService.cleanup();
  });

  afterEach(async () => {
    // Cleanup
    try {
      await sttController.endSession(mockSessionId);
    } catch (error) {
      // Ignore cleanup errors
    }
    sttSessionService.cleanup();
  });

  it('should complete full STT flow: create → forward → end', async () => {
    // Step 1: Create session
    await sttController.createSession(mockSessionId, mockConfig);

    // Verify session created
    const session = sttSessionService.getSession(mockSessionId);
    expect(session).toBeDefined();
    expect(session!.sessionId).toBe(mockSessionId);
    expect(session!.connectionState).toBe('connected');

    // Step 2: Forward audio chunks
    const audioChunk1 = new Uint8Array(1024).fill(128);
    const audioChunk2 = new Uint8Array(1024).fill(130);
    const audioChunk3 = new Uint8Array(1024).fill(132);

    await sttController.forwardChunk(mockSessionId, audioChunk1);
    await sttController.forwardChunk(mockSessionId, audioChunk2);
    await sttController.forwardChunk(mockSessionId, audioChunk3);

    // Simulate transcript responses
    triggerEvent(LiveTranscriptionEvents.Transcript, {
      channel: {
        alternatives: [{ transcript: 'Hello world', confidence: 0.95 }],
      },
      is_final: true,
    });

    // Verify chunks were received
    const sessionAfterChunks = sttSessionService.getSession(mockSessionId);
    expect(sessionAfterChunks).toBeDefined();
    expect(sessionAfterChunks!.metrics.chunksReceived).toBeGreaterThan(0);
    expect(sessionAfterChunks!.metrics.chunksForwarded).toBeGreaterThan(0);

    // Step 3: End session and get transcript
    const finalTranscript = await sttController.endSession(mockSessionId);

    expect(finalTranscript).toBeDefined();
    expect(typeof finalTranscript).toBe('string');

    // Verify session cleaned up
    const sessionAfterEnd = sttSessionService.getSession(mockSessionId);
    expect(sessionAfterEnd).toBeUndefined();
  }, 10000);

  it('should handle multiple audio chunks with varying sizes', async () => {
    await sttController.createSession(mockSessionId, mockConfig);

    // Forward different sized chunks
    const chunks = [
      new Uint8Array(512).fill(100),
      new Uint8Array(2048).fill(110),
      new Uint8Array(1024).fill(120),
      new Uint8Array(4096).fill(130),
      new Uint8Array(256).fill(140),
    ];

    for (const chunk of chunks) {
      await sttController.forwardChunk(mockSessionId, chunk);
    }

    const session = sttSessionService.getSession(mockSessionId);
    expect(session!.metrics.chunksReceived).toBe(5);

    const transcript = await sttController.endSession(mockSessionId);
    expect(transcript).toBeDefined();
  }, 10000);

  it('should accumulate transcripts over time', async () => {
    await sttController.createSession(mockSessionId, mockConfig);

    // Send chunks and simulate transcripts
    for (let i = 0; i < 10; i++) {
      const chunk = new Uint8Array(1024).fill(128 + i);
      await sttController.forwardChunk(mockSessionId, chunk);

      // Simulate transcript for each chunk
      triggerEvent(LiveTranscriptionEvents.Transcript, {
        channel: {
          alternatives: [{ transcript: `Word ${i}`, confidence: 0.9 + i * 0.01 }],
        },
        is_final: true,
      });
    }

    const session = sttSessionService.getSession(mockSessionId);
    expect(session!.metrics.transcriptsReceived).toBeGreaterThan(0);

    const transcript = await sttController.endSession(mockSessionId);
    expect(transcript.length).toBeGreaterThan(0);
  }, 10000);

  it('should maintain metrics throughout session lifecycle', async () => {
    await sttController.createSession(mockSessionId, mockConfig);

    // Get initial metrics
    const initialMetrics = sttController.getSessionMetrics(mockSessionId);
    expect(initialMetrics).toBeDefined();
    expect(initialMetrics!.chunksForwarded).toBe(0);
    expect(initialMetrics!.transcriptsReceived).toBe(0);

    // Forward audio
    const chunk = new Uint8Array(1024).fill(128);
    await sttController.forwardChunk(mockSessionId, chunk);
    await sttController.forwardChunk(mockSessionId, chunk);
    await sttController.forwardChunk(mockSessionId, chunk);

    // Get metrics after forwarding
    const midMetrics = sttController.getSessionMetrics(mockSessionId);
    expect(midMetrics).toBeDefined();
    expect(midMetrics!.chunksForwarded).toBeGreaterThan(0);
    expect(midMetrics!.duration).toBeGreaterThan(0);

    // End session
    await sttController.endSession(mockSessionId);

    // Metrics should no longer be available
    const endMetrics = sttController.getSessionMetrics(mockSessionId);
    expect(endMetrics).toBeUndefined();
  }, 10000);

  it('should handle rapid chunk forwarding without errors', async () => {
    await sttController.createSession(mockSessionId, mockConfig);

    // Rapidly forward many chunks
    const promises = [];
    for (let i = 0; i < 50; i++) {
      const chunk = new Uint8Array(512).fill(128);
      promises.push(sttController.forwardChunk(mockSessionId, chunk));
    }

    await Promise.all(promises);

    const session = sttSessionService.getSession(mockSessionId);
    expect(session!.metrics.chunksReceived).toBe(50);
    expect(session!.metrics.errors).toBe(0);

    await sttController.endSession(mockSessionId);
  }, 10000);

  it('should support session recreation after ending', async () => {
    // First session
    await sttController.createSession(mockSessionId, mockConfig);
    const chunk = new Uint8Array(1024).fill(128);
    await sttController.forwardChunk(mockSessionId, chunk);
    const transcript1 = await sttController.endSession(mockSessionId);

    expect(transcript1).toBeDefined();
    expect(sttSessionService.getSession(mockSessionId)).toBeUndefined();

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Second session with same ID
    await sttController.createSession(mockSessionId, mockConfig);
    await sttController.forwardChunk(mockSessionId, chunk);
    const transcript2 = await sttController.endSession(mockSessionId);

    expect(transcript2).toBeDefined();
    expect(sttSessionService.getSession(mockSessionId)).toBeUndefined();
  }, 10000);

  it('should handle empty audio session (no chunks forwarded)', async () => {
    await sttController.createSession(mockSessionId, mockConfig);

    // End immediately without forwarding chunks
    const transcript = await sttController.endSession(mockSessionId);

    expect(transcript).toBeDefined();
    expect(typeof transcript).toBe('string');
    expect(sttSessionService.getSession(mockSessionId)).toBeUndefined();
  }, 10000);

  it('should update service-level metrics across session lifecycle', async () => {
    const initialServiceMetrics = sttController.getMetrics();
    const initialCount = initialServiceMetrics.activeSessions;

    // Create session
    await sttController.createSession(mockSessionId, mockConfig);

    const afterCreateMetrics = sttController.getMetrics();
    expect(afterCreateMetrics.activeSessions).toBe(initialCount + 1);

    // Forward chunks
    const chunk = new Uint8Array(1024).fill(128);
    await sttController.forwardChunk(mockSessionId, chunk);
    await sttController.forwardChunk(mockSessionId, chunk);

    const afterForwardMetrics = sttController.getMetrics();
    expect(afterForwardMetrics.totalChunksForwarded).toBeGreaterThan(
      initialServiceMetrics.totalChunksForwarded
    );

    // End session
    await sttController.endSession(mockSessionId);

    const afterEndMetrics = sttController.getMetrics();
    expect(afterEndMetrics.activeSessions).toBe(initialCount);
  }, 10000);

  it('should maintain session isolation with unique IDs', async () => {
    const sessionId1 = 'session-1';
    const sessionId2 = 'session-2';
    const config1: STTConfig = { ...mockConfig, sessionId: sessionId1 };
    const config2: STTConfig = { ...mockConfig, sessionId: sessionId2 };

    // Create both sessions
    await sttController.createSession(sessionId1, config1);
    await sttController.createSession(sessionId2, config2);

    const metrics1Before = sttController.getSessionMetrics(sessionId1);
    const metrics2Before = sttController.getSessionMetrics(sessionId2);

    expect(metrics1Before).toBeDefined();
    expect(metrics2Before).toBeDefined();
    expect(metrics1Before!.sessionId).not.toBe(metrics2Before!.sessionId);

    // Forward to session 1 only
    const chunk = new Uint8Array(1024).fill(128);
    await sttController.forwardChunk(sessionId1, chunk);
    await sttController.forwardChunk(sessionId1, chunk);

    const metrics1After = sttController.getSessionMetrics(sessionId1);
    const metrics2After = sttController.getSessionMetrics(sessionId2);

    expect(metrics1After!.chunksForwarded).toBeGreaterThan(0);
    expect(metrics2After!.chunksForwarded).toBe(0); // Session 2 should be unchanged

    // Cleanup
    await sttController.endSession(sessionId1);
    await sttController.endSession(sessionId2);
  }, 10000);
});
