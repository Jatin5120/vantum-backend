/**
 * Memory Leak Prevention - Integration Tests
 * High-level tests verifying no memory leaks in production scenarios
 *
 * Tests cover:
 * 1. LLM: High-volume requests with shutdown (P0-1)
 * 2. TTS: High-volume synthesis without listener accumulation (P0-2)
 * 3. Full pipeline: Memory stability across complete flows
 * 4. Session cleanup: Proper resource cleanup after session end
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock OpenAI module properly
vi.mock('openai', () => {
  const OpenAIMock = vi.fn(function (this: any) {
    this.chat = {
      completions: {
        create: vi.fn(),
      },
    };
  });

  return {
    default: OpenAIMock,
  };
});

// Mock Cartesia with listener tracking
let totalListenersCreated = 0;
let totalListenersRemoved = 0;
let activeListeners = 0;

const createMockAudioSource = () => {
  return {
    on: vi.fn((event: string, handler: Function) => {
      totalListenersCreated++;
      activeListeners++;

      if (event === 'close') {
        setImmediate(() => handler());
      }
    }),
    off: vi.fn(() => {
      totalListenersRemoved++;
      activeListeners = Math.max(0, activeListeners - 1);
    }),
    buffer: new Int16Array([1, 2, 3, 4, 5]),
    writeIndex: 5,
  };
};

const mockConnectionEvents = {
  on: vi.fn(),
  off: vi.fn(),
};

const mockCartesiaWs = {
  connect: vi.fn().mockResolvedValue(mockConnectionEvents),
  disconnect: vi.fn().mockResolvedValue(undefined),
  send: vi.fn(),
  socket: {
    ping: vi.fn(),
  },
};

const mockCartesiaClient = {
  tts: {
    websocket: vi.fn(() => mockCartesiaWs),
  },
};

vi.mock('@cartesia/cartesia-js', () => {
  return {
    CartesiaClient: class MockCartesiaClient {
      constructor() {
        return mockCartesiaClient;
      }
    },
  };
});

vi.mock('@/modules/audio/services', () => ({
  audioResamplerService: {
    resampleToHigher: vi.fn((buffer) => Buffer.from(buffer)),
  },
}));

const mockWebSocket = {
  send: vi.fn(),
  readyState: 1,
};

vi.mock('@/modules/socket/services', () => ({
  websocketService: {
    getWebSocket: vi.fn(() => mockWebSocket),
  },
}));

vi.mock('@/shared/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  generateId: vi.fn(() => 'test-id-' + Math.random()),
}));

describe('Memory Leak Prevention - Integration Tests', () => {
  let mockOpenAI: any;
  let ttsService: TTSService;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CARTESIA_API_KEY = 'test-api-key';
    process.env.NODE_ENV = 'test';

    // Reset listener tracking
    totalListenersCreated = 0;
    totalListenersRemoved = 0;
    activeListeners = 0;

    // Reset audio source mock
    mockCartesiaWs.send.mockImplementation(() => {
      return Promise.resolve({ source: createMockAudioSource() });
    });

    llmSessionService.cleanup();
    ttsSessionService.clearAllSessions();

    mockOpenAI = new (OpenAI as any)();
    ttsService = new TTSService();
  });

  afterEach(async () => {
    llmSessionService.cleanup();
    await ttsService.shutdown({ restart: false });
    ttsSessionService.clearAllSessions();
  });

  describe('LLM High-Volume Shutdown (P0-1 Validation)', () => {
    it('should handle high-volume LLM requests with shutdown gracefully', async () => {
      const sessionIds = Array.from({ length: 50 }, (_, i) => `session-${i}`);

      // Initialize multiple sessions
      await Promise.all(sessionIds.map((id) => llmController.initializeSession(id)));

      expect(llmSessionService.getSessionCount()).toBe(50);

      // Mock delayed OpenAI responses
      mockOpenAI.chat.completions.create.mockImplementation(
        () =>
          new Promise(() => {
            // Never resolves - simulates slow API
          })
      );

      // Generate requests (some will queue)
      const requests = sessionIds.flatMap((id) => [
        llmController.generateResponse(id, 'message 1'),
        llmController.generateResponse(id, 'message 2'),
      ]);

      // Wait for requests to queue
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Shutdown while requests pending
      await llmService.shutdown();

      // All should reject
      const results = await Promise.allSettled(requests);
      const rejectedCount = results.filter((r) => r.status === 'rejected').length;

      expect(rejectedCount).toBeGreaterThan(0);
      expect(llmSessionService.getSessionCount()).toBe(0);
    }, 30000);

    it('should not leak memory with repeated shutdown cycles', async () => {
      const sessionId = 'leak-test-session';

      for (let cycle = 0; cycle < 5; cycle++) {
        // Create session
        await llmController.initializeSession(sessionId);

        // Mock slow response
        mockOpenAI.chat.completions.create.mockImplementation(
          () =>
            new Promise(() => {
              // Never resolves
            })
        );

        // Queue request
        const request = llmController.generateResponse(sessionId, `message-${cycle}`);
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Shutdown
        await llmService.shutdown();

        // Wait for rejection
        await expect(request).rejects.toThrow();

        // Verify cleanup
        expect(llmSessionService.getSessionCount()).toBe(0);
      }

      // After 5 cycles, metrics should be stable
      const metrics = llmService.getMetrics();
      expect(metrics.activeSessions).toBe(0);
    }, 30000);

    it('should properly cleanup with mixed success and failure requests', async () => {
      const sessionIds = ['session-1', 'session-2', 'session-3'];

      await Promise.all(sessionIds.map((id) => llmController.initializeSession(id)));

      // Mock: first request succeeds, rest fail
      let callCount = 0;
      mockOpenAI.chat.completions.create.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            [Symbol.asyncIterator]: async function* () {
              yield { choices: [{ delta: { content: 'success' } }] };
            },
          });
        }
        return new Promise(() => {
          // Never resolves
        });
      });

      const requests = sessionIds.map((id) => llmController.generateResponse(id, 'message'));

      await new Promise((resolve) => setTimeout(resolve, 100));
      await llmService.shutdown();

      await Promise.allSettled(requests);

      expect(llmSessionService.getSessionCount()).toBe(0);
    }, 30000);
  });

  describe('TTS High-Volume Synthesis (P0-2 Validation)', () => {
    it('should handle high-volume TTS synthesis without listener accumulation', async () => {
      const sessionId = 'tts-volume-test';

      await ttsController.initializeSession(sessionId, {
        connectionId: 'conn-volume',
        voiceId: 'test-voice',
        language: 'en',
      });

      // Initial listener state
      const initialCreated = totalListenersCreated;
      const initialRemoved = totalListenersRemoved;

      // Simulate 100 synthesis calls
      const synthesisCalls = Array.from({ length: 100 }, (_, i) =>
        ttsController.synthesize(sessionId, `Message ${i}`)
      );

      await Promise.all(synthesisCalls);

      // Verify listener cleanup
      const listenersCreated = totalListenersCreated - initialCreated;
      const listenersRemoved = totalListenersRemoved - initialRemoved;

      // Each synthesis creates 3 listeners (enqueue, close, error)
      expect(listenersCreated).toBe(300); // 100 * 3

      // All should be removed (P0-2 fix validation)
      expect(listenersRemoved).toBe(300);

      // No active listeners should remain
      expect(activeListeners).toBe(0);

      await ttsController.endSession(sessionId);
    }, 30000);

    it('should maintain stable memory footprint over 50 TTS cycles', async () => {
      const sessionId = 'tts-stability-test';

      await ttsController.initializeSession(sessionId, {
        connectionId: 'conn-stability',
        voiceId: 'test-voice',
        language: 'en',
      });

      const activeListenerSamples: number[] = [];

      for (let i = 0; i < 50; i++) {
        await ttsController.synthesize(sessionId, `Message ${i}`);

        // Sample active listeners every 10 cycles
        if (i % 10 === 0) {
          activeListenerSamples.push(activeListeners);
        }
      }

      // All samples should show 0 active listeners (fully cleaned up)
      expect(activeListenerSamples.every((count) => count === 0)).toBe(true);

      await ttsController.endSession(sessionId);
    }, 30000);

    it('should handle rapid-fire TTS synthesis without leaks', async () => {
      const sessionId = 'tts-rapid-test';

      await ttsController.initializeSession(sessionId, {
        connectionId: 'conn-rapid',
        voiceId: 'test-voice',
        language: 'en',
      });

      const startListeners = activeListeners;

      // Rapid-fire 30 synthesis calls
      const promises = Array.from({ length: 30 }, (_, i) =>
        ttsController.synthesize(sessionId, `Rapid ${i}`)
      );

      await Promise.all(promises);

      const endListeners = activeListeners;

      // No net increase in active listeners
      expect(endListeners).toBe(startListeners);

      await ttsController.endSession(sessionId);
    }, 30000);
  });

  describe('Full Pipeline Memory Stability', () => {
    it('should verify memory cleanup after complete conversation flow', async () => {
      const sessionId = 'pipeline-test';

      // Initialize both services
      await llmController.initializeSession(sessionId);
      await ttsController.initializeSession(sessionId, {
        connectionId: 'conn-pipeline',
        voiceId: 'test-voice',
        language: 'en',
      });

      // Mock successful LLM response
      mockOpenAI.chat.completions.create.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'AI response' } }] };
        },
      });

      // Simulate conversation
      await llmController.generateResponse(sessionId, 'User message 1');
      await ttsController.synthesize(sessionId, 'AI response 1');

      await llmController.generateResponse(sessionId, 'User message 2');
      await ttsController.synthesize(sessionId, 'AI response 2');

      // End sessions
      await llmController.endSession(sessionId);
      await ttsController.endSession(sessionId);

      // Verify complete cleanup
      expect(llmController.hasSession(sessionId)).toBe(false);
      expect(ttsController.hasSession(sessionId)).toBe(false);
      expect(activeListeners).toBe(0);
    });

    it('should handle multiple concurrent sessions without cross-contamination', async () => {
      const sessionIds = ['session-1', 'session-2', 'session-3'];

      // Initialize all sessions
      for (const id of sessionIds) {
        await llmController.initializeSession(id);
        await ttsController.initializeSession(id, {
          connectionId: `conn-${id}`,
          voiceId: 'test-voice',
          language: 'en',
        });
      }

      // Mock LLM responses
      mockOpenAI.chat.completions.create.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'response' } }] };
        },
      });

      // Parallel operations
      const operations = sessionIds.flatMap((id) => [
        llmController.generateResponse(id, `message-${id}`),
        ttsController.synthesize(id, `audio-${id}`),
      ]);

      await Promise.all(operations);

      // Cleanup all sessions
      for (const id of sessionIds) {
        await llmController.endSession(id);
        await ttsController.endSession(id);
      }

      // Verify complete cleanup
      expect(llmSessionService.getSessionCount()).toBe(0);
      expect(ttsSessionService.getSessionCount()).toBe(0);
      expect(activeListeners).toBe(0);
    }, 30000);

    it('should recover from errors without memory leaks', async () => {
      const sessionId = 'error-recovery-test';

      await llmController.initializeSession(sessionId);
      await ttsController.initializeSession(sessionId, {
        connectionId: 'conn-error',
        voiceId: 'test-voice',
        language: 'en',
      });

      // Mock LLM to fail
      mockOpenAI.chat.completions.create.mockRejectedValueOnce(new Error('LLM API error'));

      // LLM request fails
      try {
        await llmController.generateResponse(sessionId, 'message');
      } catch {
        // Expected
      }

      // TTS should still work
      await ttsController.synthesize(sessionId, 'fallback message');

      // Cleanup
      await llmController.endSession(sessionId);
      await ttsController.endSession(sessionId);

      // No leaks despite error
      expect(llmSessionService.getSessionCount()).toBe(0);
      expect(ttsSessionService.getSessionCount()).toBe(0);
      expect(activeListeners).toBe(0);
    });
  });

  describe('Session Lifecycle Memory Management', () => {
    it('should cleanup all resources on session end', async () => {
      const sessionId = 'lifecycle-test';

      // Initialize
      await llmController.initializeSession(sessionId);
      await ttsController.initializeSession(sessionId, {
        connectionId: 'conn-lifecycle',
        voiceId: 'test-voice',
        language: 'en',
      });

      // Use services
      mockOpenAI.chat.completions.create.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'response' } }] };
        },
      });

      await llmController.generateResponse(sessionId, 'test message');
      await ttsController.synthesize(sessionId, 'test audio');

      const beforeListeners = activeListeners;

      // End sessions
      await llmController.endSession(sessionId);
      await ttsController.endSession(sessionId);

      // Verify cleanup
      expect(llmController.hasSession(sessionId)).toBe(false);
      expect(ttsController.hasSession(sessionId)).toBe(false);
      expect(activeListeners).toBe(0);
    });

    it('should handle repeated session create/destroy cycles', async () => {
      const sessionId = 'cycle-test';

      for (let i = 0; i < 10; i++) {
        // Create
        await llmController.initializeSession(sessionId);
        await ttsController.initializeSession(sessionId, {
          connectionId: `conn-${i}`,
          voiceId: 'test-voice',
          language: 'en',
        });

        // Use
        mockOpenAI.chat.completions.create.mockResolvedValue({
          [Symbol.asyncIterator]: async function* () {
            yield { choices: [{ delta: { content: 'response' } }] };
          },
        });

        await llmController.generateResponse(sessionId, `message-${i}`);
        await ttsController.synthesize(sessionId, `audio-${i}`);

        // Destroy
        await llmController.endSession(sessionId);
        await ttsController.endSession(sessionId);

        // Verify cleanup after each cycle
        expect(llmSessionService.getSessionCount()).toBe(0);
        expect(ttsSessionService.getSessionCount()).toBe(0);
      }

      // Final verification
      expect(activeListeners).toBe(0);
    }, 30000);
  });

  describe('Service Metrics Validation', () => {
    it('should maintain accurate metrics despite memory cleanup', async () => {
      const sessionIds = ['m-session-1', 'm-session-2', 'm-session-3'];

      // Initialize sessions
      for (const id of sessionIds) {
        await llmController.initializeSession(id);
        await ttsController.initializeSession(id, {
          connectionId: `conn-${id}`,
          voiceId: 'test-voice',
          language: 'en',
        });
      }

      // Mock responses
      mockOpenAI.chat.completions.create.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'response' } }] };
        },
      });

      // Generate activity
      for (const id of sessionIds) {
        await llmController.generateResponse(id, 'message');
        await ttsController.synthesize(id, 'audio');
      }

      const llmMetrics = llmController.getMetrics();
      const ttsMetrics = ttsController.getMetrics();

      expect(llmMetrics.activeSessions).toBe(3);
      expect(llmMetrics.totalRequests).toBeGreaterThanOrEqual(3);
      expect(ttsMetrics.activeSessions).toBe(3);

      // Cleanup
      for (const id of sessionIds) {
        await llmController.endSession(id);
        await ttsController.endSession(id);
      }

      const finalLlmMetrics = llmController.getMetrics();
      const finalTtsMetrics = ttsController.getMetrics();

      // Active sessions should be 0
      expect(finalLlmMetrics.activeSessions).toBe(0);
      expect(finalTtsMetrics.activeSessions).toBe(0);

      // Historical metrics should be preserved
      expect(finalLlmMetrics.totalRequests).toBeGreaterThanOrEqual(3);
      expect(finalTtsMetrics.totalTextsSynthesized).toBeGreaterThanOrEqual(3);
    });
  });
});
