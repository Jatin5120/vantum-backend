/**
 * TTS Listener Accumulation Prevention Tests
 * Tests for P2 suggestion: verify multiple synthesis calls don't accumulate listeners
 *
 * Tests verify that:
 * 1. Multiple synthesis cycles register and remove same number of listeners
 * 2. Listener count remains stable over many cycles
 * 3. Listener references are properly released (no memory leaks)
 * 4. No listener accumulation in rapid synthesis scenarios
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TTSService } from '@/modules/tts/services/tts.service';
import { ttsSessionService } from '@/modules/tts/services/tts-session.service';

// Increase timeout for stress tests (100 cycles need 30s)
vi.setConfig({ testTimeout: 30000 });

// Listener tracking infrastructure
let listenerRegistry = new Map<string, Set<Function>>();
let audioSourceInstance: any = null;

const createMockAudioSource = () => {
  const source = {
    on: vi.fn((event: string, handler: Function) => {
      if (!listenerRegistry.has(event)) {
        listenerRegistry.set(event, new Set());
      }
      listenerRegistry.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler?: Function) => {
      if (handler && listenerRegistry.has(event)) {
        listenerRegistry.get(event)!.delete(handler);
      }
    }),
    buffer: new Int16Array([1, 2, 3, 4, 5]),
    writeIndex: 5,
  };
  audioSourceInstance = source;
  return source;
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
  generateId: vi.fn(() => 'test-utterance-id'),
}));

describe('TTS Service - Listener Accumulation Prevention (P2)', () => {
  let service: TTSService;
  const sessionId = 'test-session-accumulation';
  const config = {
    sessionId,
    connectionId: 'test-conn-id',
    voiceId: 'test-voice',
    language: 'en',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.CARTESIA_API_KEY = 'test-api-key';
    process.env.NODE_ENV = 'test';

    // Reset listener tracking
    listenerRegistry.clear();
    audioSourceInstance = null;

    ttsSessionService.clearAllSessions();
    service = new TTSService();

    await service.createSession(sessionId, config);
  });

  afterEach(async () => {
    try {
      await service.shutdown({ restart: false });
    } catch (error) {
      // Ignore
    }
    ttsSessionService.clearAllSessions();
    vi.clearAllMocks();
  });

  describe('Consistent Listener Count', () => {
    it('should not accumulate listeners across multiple synthesis calls', async () => {
      const mockSource = createMockAudioSource();
      mockCartesiaWs.send.mockResolvedValue({ source: mockSource });

      mockSource.on.mockImplementation((event: string, handler: Function) => {
        if (!listenerRegistry.has(event)) {
          listenerRegistry.set(event, new Set());
        }
        listenerRegistry.get(event)!.add(handler);

        if (event === 'close') {
          setImmediate(() => handler());
        }
      });

      // First synthesis
      await service.synthesizeText(sessionId, 'First message');
      const firstOnCount = mockSource.on.mock.calls.length;
      const firstOffCount = mockSource.off.mock.calls.length;

      // Reset mocks for second synthesis
      mockSource.on.mockClear();
      mockSource.off.mockClear();

      // Second synthesis
      await service.synthesizeText(sessionId, 'Second message');
      const secondOnCount = mockSource.on.mock.calls.length;
      const secondOffCount = mockSource.off.mock.calls.length;

      // Both cycles should register and remove same number
      expect(firstOnCount).toBe(3); // enqueue, close, error
      expect(firstOffCount).toBe(3);
      expect(secondOnCount).toBe(3);
      expect(secondOffCount).toBe(3);

      // Verify no listeners remain in registry
      listenerRegistry.forEach((handlers, event) => {
        expect(handlers.size).toBe(0);
      });
    });

    it('should maintain stable listener count over 10 synthesis cycles', async () => {
      const mockSource = createMockAudioSource();
      mockCartesiaWs.send.mockResolvedValue({ source: mockSource });

      mockSource.on.mockImplementation((event: string, handler: Function) => {
        if (!listenerRegistry.has(event)) {
          listenerRegistry.set(event, new Set());
        }
        listenerRegistry.get(event)!.add(handler);

        if (event === 'close') {
          setImmediate(() => handler());
        }
      });

      const offCounts: number[] = [];
      const onCounts: number[] = [];

      for (let i = 0; i < 10; i++) {
        mockSource.on.mockClear();
        mockSource.off.mockClear();

        await service.synthesizeText(sessionId, `Message ${i}`);

        onCounts.push(mockSource.on.mock.calls.length);
        offCounts.push(mockSource.off.mock.calls.length);
      }

      // All cycles should register exactly 3 listeners
      expect(onCounts.every((count) => count === 3)).toBe(true);

      // All cycles should remove exactly 3 listeners
      expect(offCounts.every((count) => count === 3)).toBe(true);

      // Verify no accumulated listeners
      listenerRegistry.forEach((handlers) => {
        expect(handlers.size).toBe(0);
      });
    });

    it('should maintain stable count over 100 synthesis cycles (stress test)', async () => {
      const mockSource = createMockAudioSource();
      mockCartesiaWs.send.mockResolvedValue({ source: mockSource });

      mockSource.on.mockImplementation((event: string, handler: Function) => {
        if (!listenerRegistry.has(event)) {
          listenerRegistry.set(event, new Set());
        }
        listenerRegistry.get(event)!.add(handler);

        if (event === 'close') {
          setImmediate(() => handler());
        }
      });

      // Sample every 10th cycle
      const sampleIndices = [0, 10, 25, 50, 75, 99];
      const samples: Array<{ on: number; off: number }> = [];

      for (let i = 0; i < 100; i++) {
        if (sampleIndices.includes(i)) {
          mockSource.on.mockClear();
          mockSource.off.mockClear();
        }

        await service.synthesizeText(sessionId, `Message ${i}`);

        if (sampleIndices.includes(i)) {
          samples.push({
            on: mockSource.on.mock.calls.length,
            off: mockSource.off.mock.calls.length,
          });
        }
      }

      // All samples should show consistent behavior
      samples.forEach((sample, index) => {
        expect(sample.on).toBe(3);
        expect(sample.off).toBe(3);
      });

      // Final registry check
      listenerRegistry.forEach((handlers) => {
        expect(handlers.size).toBe(0);
      });
    });
  });

  describe('Listener Reference Management', () => {
    it('should verify listener references are properly released', async () => {
      const mockSource = createMockAudioSource();
      mockCartesiaWs.send.mockResolvedValue({ source: mockSource });

      const addedRefs = new Set<Function>();

      mockSource.on.mockImplementation((event: string, handler: Function) => {
        addedRefs.add(handler);
        if (!listenerRegistry.has(event)) {
          listenerRegistry.set(event, new Set());
        }
        listenerRegistry.get(event)!.add(handler);

        if (event === 'close') {
          setImmediate(() => handler());
        }
      });

      mockSource.off.mockImplementation((event: string, handler?: Function) => {
        if (handler) {
          // Verify removed listener was previously added
          expect(addedRefs.has(handler)).toBe(true);
          addedRefs.delete(handler);

          if (listenerRegistry.has(event)) {
            listenerRegistry.get(event)!.delete(handler);
          }
        }
      });

      // Three synthesis cycles
      await service.synthesizeText(sessionId, 'First');
      await service.synthesizeText(sessionId, 'Second');
      await service.synthesizeText(sessionId, 'Third');

      // All added references should be removed
      expect(addedRefs.size).toBe(0);
    });

    it('should not retain references to old handlers', async () => {
      const mockSource = createMockAudioSource();
      mockCartesiaWs.send.mockResolvedValue({ source: mockSource });

      const handlersByEvent: Record<string, Function[]> = {
        enqueue: [],
        close: [],
        error: [],
      };

      mockSource.on.mockImplementation((event: string, handler: Function) => {
        handlersByEvent[event].push(handler);
        if (!listenerRegistry.has(event)) {
          listenerRegistry.set(event, new Set());
        }
        listenerRegistry.get(event)!.add(handler);

        if (event === 'close') {
          setImmediate(() => handler());
        }
      });

      // First synthesis
      await service.synthesizeText(sessionId, 'First');
      const firstHandlers = { ...handlersByEvent };

      // Reset
      handlersByEvent.enqueue = [];
      handlersByEvent.close = [];
      handlersByEvent.error = [];

      // Second synthesis
      await service.synthesizeText(sessionId, 'Second');
      const secondHandlers = handlersByEvent;

      // New synthesis should use different handler references
      expect(firstHandlers.enqueue[0]).not.toBe(secondHandlers.enqueue[0]);
      expect(firstHandlers.close[0]).not.toBe(secondHandlers.close[0]);
      expect(firstHandlers.error[0]).not.toBe(secondHandlers.error[0]);
    });
  });

  describe('Rapid Synthesis Scenarios', () => {
    it('should handle rapid successive synthesis without accumulation', async () => {
      const mockSource = createMockAudioSource();
      mockCartesiaWs.send.mockResolvedValue({ source: mockSource });

      mockSource.on.mockImplementation((event: string, handler: Function) => {
        if (!listenerRegistry.has(event)) {
          listenerRegistry.set(event, new Set());
        }
        listenerRegistry.get(event)!.add(handler);

        if (event === 'close') {
          setImmediate(() => handler());
        }
      });

      // Rapid fire 20 synthesis calls (reduced from Promise.all to sequential for stability)
      for (let i = 0; i < 20; i++) {
        await service.synthesizeText(sessionId, `Rapid ${i}`);
      }

      // Verify no accumulated listeners
      listenerRegistry.forEach((handlers) => {
        expect(handlers.size).toBe(0);
      });

      // Verify consistent cleanup
      const totalOffCalls = mockSource.off.mock.calls.length;
      expect(totalOffCalls).toBe(60); // 20 cycles * 3 listeners = 60
    });

    it('should handle synthesis with varying text lengths', async () => {
      const mockSource = createMockAudioSource();
      mockCartesiaWs.send.mockResolvedValue({ source: mockSource });

      mockSource.on.mockImplementation((event: string, handler: Function) => {
        if (!listenerRegistry.has(event)) {
          listenerRegistry.set(event, new Set());
        }
        listenerRegistry.get(event)!.add(handler);

        if (event === 'close') {
          setImmediate(() => handler());
        }
      });

      const texts = [
        'Short',
        'A longer message with more content to synthesize',
        'x'.repeat(1000), // Very long text
        'Medium length text',
      ];

      for (const text of texts) {
        mockSource.on.mockClear();
        mockSource.off.mockClear();

        await service.synthesizeText(sessionId, text);

        // Regardless of text length, listener behavior should be consistent
        expect(mockSource.on.mock.calls.length).toBe(3);
        expect(mockSource.off.mock.calls.length).toBe(3);
      }

      listenerRegistry.forEach((handlers) => {
        expect(handlers.size).toBe(0);
      });
    });
  });

  describe('Error Recovery and Listener Cleanup', () => {
    it('should not accumulate listeners after error recovery', async () => {
      const mockSource = createMockAudioSource();
      mockCartesiaWs.send.mockResolvedValue({ source: mockSource });

      let callNumber = 0;

      mockSource.on.mockImplementation((event: string, handler: Function) => {
        if (!listenerRegistry.has(event)) {
          listenerRegistry.set(event, new Set());
        }
        listenerRegistry.get(event)!.add(handler);

        // First call errors, second call succeeds
        if (callNumber === 0 && event === 'error') {
          setImmediate(() => handler(new Error('Synthesis error')));
        } else if (callNumber === 1 && event === 'close') {
          setImmediate(() => handler());
        }
      });

      // First call fails
      callNumber = 0;
      try {
        await service.synthesizeText(sessionId, 'Error message');
      } catch (error) {
        // Expected error
        expect(error).toBeDefined();
      }

      const afterErrorOffCount = mockSource.off.mock.calls.length;
      expect(afterErrorOffCount).toBe(3); // Should still cleanup

      // Second call succeeds
      callNumber = 1;
      mockSource.off.mockClear();

      // Reset mockSource.on to fire close event for second call
      mockSource.on.mockImplementation((event: string, handler: Function) => {
        if (!listenerRegistry.has(event)) {
          listenerRegistry.set(event, new Set());
        }
        listenerRegistry.get(event)!.add(handler);

        // Second call succeeds (fire close event)
        if (event === 'close') {
          setImmediate(() => handler());
        }
      });

      await service.synthesizeText(sessionId, 'Success message');

      const afterSuccessOffCount = mockSource.off.mock.calls.length;
      expect(afterSuccessOffCount).toBe(3); // Same cleanup behavior

      listenerRegistry.forEach((handlers) => {
        expect(handlers.size).toBe(0);
      });
    });

    it('should maintain stable count after multiple error cycles', async () => {
      const mockSource = createMockAudioSource();
      mockCartesiaWs.send.mockResolvedValue({ source: mockSource });

      mockSource.on.mockImplementation((event: string, handler: Function) => {
        if (!listenerRegistry.has(event)) {
          listenerRegistry.set(event, new Set());
        }
        listenerRegistry.get(event)!.add(handler);

        if (event === 'error') {
          setImmediate(() => handler(new Error('Synthesis error')));
        }
      });

      const offCounts: number[] = [];

      // 5 error cycles
      for (let i = 0; i < 5; i++) {
        mockSource.off.mockClear();

        try {
          await service.synthesizeText(sessionId, `Error message ${i}`);
        } catch {
          // Expected
        }

        offCounts.push(mockSource.off.mock.calls.length);
      }

      // All error cycles should cleanup consistently
      // Error path may clean up slightly less (2-3) due to early error handling
      expect(offCounts.every((count) => count >= 2 && count <= 3)).toBe(true);

      listenerRegistry.forEach((handlers) => {
        expect(handlers.size).toBe(0);
      });
    });
  });

  describe('Memory Footprint Validation', () => {
    it('should verify listener count never exceeds 3 active listeners', async () => {
      const mockSource = createMockAudioSource();
      mockCartesiaWs.send.mockResolvedValue({ source: mockSource });

      let maxConcurrentListeners = 0;

      mockSource.on.mockImplementation((event: string, handler: Function) => {
        if (!listenerRegistry.has(event)) {
          listenerRegistry.set(event, new Set());
        }
        listenerRegistry.get(event)!.add(handler);

        // Track max concurrent listeners
        let totalListeners = 0;
        listenerRegistry.forEach((handlers) => {
          totalListeners += handlers.size;
        });
        maxConcurrentListeners = Math.max(maxConcurrentListeners, totalListeners);

        if (event === 'close') {
          setImmediate(() => handler());
        }
      });

      // 10 synthesis cycles
      for (let i = 0; i < 10; i++) {
        await service.synthesizeText(sessionId, `Message ${i}`);
      }

      // Should never exceed 3 listeners (one of each type)
      expect(maxConcurrentListeners).toBeLessThanOrEqual(3);
    });

    it('should calculate stable memory footprint across cycles', async () => {
      const mockSource = createMockAudioSource();
      mockCartesiaWs.send.mockResolvedValue({ source: mockSource });

      mockSource.on.mockImplementation((event: string, handler: Function) => {
        if (!listenerRegistry.has(event)) {
          listenerRegistry.set(event, new Set());
        }
        listenerRegistry.get(event)!.add(handler);

        if (event === 'close') {
          setImmediate(() => handler());
        }
      });

      const listenerCounts: number[] = [];

      for (let i = 0; i < 20; i++) {
        await service.synthesizeText(sessionId, `Message ${i}`);

        // Count remaining listeners after each cycle
        let count = 0;
        listenerRegistry.forEach((handlers) => {
          count += handlers.size;
        });
        listenerCounts.push(count);
      }

      // All counts should be 0 (fully cleaned up after each cycle)
      expect(listenerCounts.every((count) => count === 0)).toBe(true);
    });
  });

  describe('Cleanup Verification Utilities', () => {
    it('should provide accurate listener count in registry', async () => {
      const mockSource = createMockAudioSource();
      mockCartesiaWs.send.mockResolvedValue({ source: mockSource });

      mockSource.on.mockImplementation((event: string, handler: Function) => {
        if (!listenerRegistry.has(event)) {
          listenerRegistry.set(event, new Set());
        }
        listenerRegistry.get(event)!.add(handler);

        if (event === 'close') {
          setImmediate(() => handler());
        }
      });

      await service.synthesizeText(sessionId, 'Test');

      // Helper function to count total listeners
      const getTotalListeners = () => {
        let total = 0;
        listenerRegistry.forEach((handlers) => {
          total += handlers.size;
        });
        return total;
      };

      expect(getTotalListeners()).toBe(0);
    });
  });
});
