/**
 * LLM Streaming Service Tests
 * Comprehensive test coverage for semantic chunking and progressive TTS delivery
 *
 * Test Structure:
 * 1. Marker-based chunking (9 tests)
 * 2. Fallback strategy (2 tests - NEW)
 * 3. Buffer safety and size limits (4 tests)
 * 4. Sequential TTS delivery (3 tests)
 * 5. Error handling and resilience (5 tests)
 * 6. Metrics and monitoring (4 tests - UPDATED)
 * 7. Integration and real-world scenarios (4 tests)
 *
 * Total: 31 tests targeting 85%+ coverage
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { llmStreamingService } from '@/modules/llm/services/llm-streaming.service';
import { streamingConfig } from '@/modules/llm/config/streaming.config';
import { ttsController } from '@/modules/tts';
import { v7 as uuidv7 } from 'uuid';

// Mock TTS controller
vi.mock('@/modules/tts', () => ({
  ttsController: {
    synthesize: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('LLMStreamingService', () => {
  let sessionId: string;

  beforeEach(() => {
    sessionId = uuidv7();
    vi.clearAllMocks();
    llmStreamingService.resetMetrics();
  });

  // ============================================================================
  // SUITE 1: Marker-Based Chunking (Primary Strategy)
  // ============================================================================

  describe('Marker-Based Chunking', () => {
    it('should extract chunks with single ||BREAK|| marker', async () => {
      const stream = createMockStream(['Hello ||BREAK|| World']);

      await llmStreamingService.processStream(sessionId, stream);

      expect(ttsController.synthesize).toHaveBeenCalledTimes(2);
      expect(ttsController.synthesize).toHaveBeenNthCalledWith(1, sessionId, 'Hello');
      expect(ttsController.synthesize).toHaveBeenNthCalledWith(2, sessionId, 'World');
    });

    it('should extract chunks with multiple ||BREAK|| markers', async () => {
      const stream = createMockStream(['First ||BREAK|| Second ||BREAK|| Third']);

      await llmStreamingService.processStream(sessionId, stream);

      expect(ttsController.synthesize).toHaveBeenCalledTimes(3);
      expect(ttsController.synthesize).toHaveBeenNthCalledWith(1, sessionId, 'First');
      expect(ttsController.synthesize).toHaveBeenNthCalledWith(2, sessionId, 'Second');
      expect(ttsController.synthesize).toHaveBeenNthCalledWith(3, sessionId, 'Third');
    });

    it('should trim whitespace around extracted chunks', async () => {
      const stream = createMockStream(['  Hello  ||BREAK||   World  ']);

      await llmStreamingService.processStream(sessionId, stream);

      expect(ttsController.synthesize).toHaveBeenNthCalledWith(1, sessionId, 'Hello');
      expect(ttsController.synthesize).toHaveBeenNthCalledWith(2, sessionId, 'World');
    });

    it('should filter out empty chunks', async () => {
      const stream = createMockStream(['Hello ||BREAK|| ||BREAK|| World']);

      await llmStreamingService.processStream(sessionId, stream);

      expect(ttsController.synthesize).toHaveBeenCalledTimes(2);
      expect(ttsController.synthesize).toHaveBeenNthCalledWith(1, sessionId, 'Hello');
      expect(ttsController.synthesize).toHaveBeenNthCalledWith(2, sessionId, 'World');
    });

    it('should handle marker at start of response', async () => {
      const stream = createMockStream(['||BREAK|| Hello World']);

      await llmStreamingService.processStream(sessionId, stream);

      expect(ttsController.synthesize).toHaveBeenCalledTimes(1);
      expect(ttsController.synthesize).toHaveBeenCalledWith(sessionId, 'Hello World');
    });

    it('should handle marker at end of response', async () => {
      const stream = createMockStream(['Hello World ||BREAK||']);

      await llmStreamingService.processStream(sessionId, stream);

      expect(ttsController.synthesize).toHaveBeenCalledTimes(1);
      expect(ttsController.synthesize).toHaveBeenCalledWith(sessionId, 'Hello World');
    });

    it('should handle consecutive markers', async () => {
      const stream = createMockStream(['A ||BREAK|| ||BREAK|| B']);

      await llmStreamingService.processStream(sessionId, stream);

      expect(ttsController.synthesize).toHaveBeenCalledTimes(2);
      expect(ttsController.synthesize).toHaveBeenNthCalledWith(1, sessionId, 'A');
      expect(ttsController.synthesize).toHaveBeenNthCalledWith(2, sessionId, 'B');
    });

    it('should handle real conversation example with markers', async () => {
      const stream = createMockStream([
        'Hi, this is Alex from Vantum. ||BREAK|| I noticed your company recently expanded. Do you have a moment to chat? ||BREAK|| I promise to keep it brief.',
      ]);

      await llmStreamingService.processStream(sessionId, stream);

      expect(ttsController.synthesize).toHaveBeenCalledTimes(3);
      expect(ttsController.synthesize).toHaveBeenNthCalledWith(
        1,
        sessionId,
        'Hi, this is Alex from Vantum.'
      );
    });

    it('should preserve text exactly as written', async () => {
      const complexText = 'What are "your rates"? ||BREAK|| We charge $99/month.';
      const stream = createMockStream([complexText]);

      await llmStreamingService.processStream(sessionId, stream);

      expect(ttsController.synthesize).toHaveBeenNthCalledWith(
        1,
        sessionId,
        'What are "your rates"?'
      );
      expect(ttsController.synthesize).toHaveBeenNthCalledWith(
        2,
        sessionId,
        'We charge $99/month.'
      );
    });
  });

  // ============================================================================
  // SUITE 2: Fallback Strategy (NEW)
  // ============================================================================

  describe('Fallback Strategy', () => {
    it('should fall back to sentence chunking when no markers found', async () => {
      // Create sentences long enough to exceed chunk limits when combined
      const sentence1 =
        'This is the first sentence that contains enough words to be meaningful and test the chunking behavior properly.';
      const sentence2 =
        'Here is another complete sentence with sufficient length to ensure proper testing of the sentence fallback functionality.';
      const sentence3 =
        'And finally a third sentence to complete the test case and verify the chunking works as expected for multiple sentences.';
      const response = `${sentence1} ${sentence2} ${sentence3}`; // No markers

      const stream = createMockStream([response]);
      await llmStreamingService.processStream(sessionId, stream);

      // Should split by sentences (may be grouped based on chunk limits)
      expect(ttsController.synthesize).toHaveBeenCalled();
      expect(ttsController.synthesize).toHaveBeenCalledWith(
        sessionId,
        expect.stringContaining('first sentence')
      );

      // Verify metrics tracked fallback
      const metrics = llmStreamingService.getMetrics();
      expect(metrics.fallbacksUsed).toBe(1);
    });

    it('should NOT use fallback when markers are present', async () => {
      const response = 'Hello world. ||BREAK|| How are you? I am fine.';

      const stream = createMockStream([response]);
      await llmStreamingService.processStream(sessionId, stream);

      // Should use marker-based chunking (2 chunks)
      expect(ttsController.synthesize).toHaveBeenCalledTimes(2);
      expect(ttsController.synthesize).toHaveBeenNthCalledWith(1, sessionId, 'Hello world.');
      expect(ttsController.synthesize).toHaveBeenNthCalledWith(
        2,
        sessionId,
        'How are you? I am fine.'
      );

      // Verify NO fallback was used
      const metrics = llmStreamingService.getMetrics();
      expect(metrics.fallbacksUsed).toBe(0);
    });
  });

  // ============================================================================
  // SUITE 3: Buffer Safety and Size Limits
  // ============================================================================

  describe('Buffer Safety and Size Limits', () => {
    it('should force chunk when buffer exceeds maxBufferSize', async () => {
      // Create text that exceeds buffer limit + additional data
      const largeChunk = 'A'.repeat(streamingConfig.maxBufferSize + 50);
      const additionalText = ' More text after limit';
      const stream = createMockStream([largeChunk + additionalText]);

      await llmStreamingService.processStream(sessionId, stream);

      // Should send one forced chunk due to size limit
      expect(ttsController.synthesize).toHaveBeenCalled();
    });

    it('should flush remaining buffer at stream end', async () => {
      const stream = createMockStream(['Chunk 1 ||BREAK|| Chunk 2']);

      await llmStreamingService.processStream(sessionId, stream);

      // Should send "Chunk 1" from marker, then "Chunk 2" at end
      expect(ttsController.synthesize).toHaveBeenCalledTimes(2);
      expect(ttsController.synthesize).toHaveBeenLastCalledWith(sessionId, 'Chunk 2');
    });

    it('should not send empty chunks', async () => {
      const stream = createMockStream(['   ||BREAK||   ']);

      await llmStreamingService.processStream(sessionId, stream);

      expect(ttsController.synthesize).not.toHaveBeenCalled();
    });

    it('should handle exactly maxBufferSize', async () => {
      const exactSize = 'X'.repeat(streamingConfig.maxBufferSize);
      const stream = createMockStream([exactSize]);

      await llmStreamingService.processStream(sessionId, stream);

      // Should not force chunk at exactly the limit
      expect(ttsController.synthesize).toHaveBeenCalledTimes(1);
      expect(ttsController.synthesize).toHaveBeenCalledWith(sessionId, exactSize);
    });
  });

  // ============================================================================
  // SUITE 4: Sequential TTS Delivery
  // ============================================================================

  describe('Sequential TTS Delivery', () => {
    it('should await each TTS call before sending next', async () => {
      const calls: number[] = [];

      (ttsController.synthesize as any).mockImplementation(async () => {
        calls.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const stream = createMockStream(['A ||BREAK|| B ||BREAK|| C']);

      await llmStreamingService.processStream(sessionId, stream);

      // Verify all chunks were called
      expect(calls.length).toBe(3);
      // Verify sequential (each call should be at least 50ms apart)
      if (calls.length >= 2) {
        expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(50);
      }
    });

    it('should send all chunks without skipping', async () => {
      const stream = createMockStream(['One ||BREAK|| Two ||BREAK|| Three']);

      await llmStreamingService.processStream(sessionId, stream);

      expect(ttsController.synthesize).toHaveBeenCalledTimes(3);
    });

    it('should maintain order of chunks', async () => {
      const stream = createMockStream(['First ||BREAK|| Second ||BREAK|| Third']);

      await llmStreamingService.processStream(sessionId, stream);

      const calls = (ttsController.synthesize as any).mock.calls;
      expect(calls[0][1]).toBe('First');
      expect(calls[1][1]).toBe('Second');
      expect(calls[2][1]).toBe('Third');
    });
  });

  // ============================================================================
  // SUITE 5: Error Handling and Resilience
  // ============================================================================

  describe('Error Handling and Resilience', () => {
    it('should throw if TTS fails on first chunk', async () => {
      (ttsController.synthesize as any).mockRejectedValue(new Error('TTS failed'));
      const stream = createMockStream(['Hello ||BREAK|| World']);

      await expect(llmStreamingService.processStream(sessionId, stream)).rejects.toThrow(
        'TTS failed'
      );
    });

    it('should stop processing on TTS error', async () => {
      let callCount = 0;
      (ttsController.synthesize as any).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('First chunk failed');
        }
      });

      const stream = createMockStream(['A ||BREAK|| B ||BREAK|| C']);

      await expect(llmStreamingService.processStream(sessionId, stream)).rejects.toThrow();
      expect(callCount).toBe(1); // Should stop after first error
    });

    it('should handle empty stream gracefully', async () => {
      const stream = createMockStream([]);

      await expect(llmStreamingService.processStream(sessionId, stream)).resolves.not.toThrow();

      expect(ttsController.synthesize).not.toHaveBeenCalled();
    });

    it('should handle stream with only whitespace', async () => {
      const stream = createMockStream(['   \n  \t  ']);

      await expect(llmStreamingService.processStream(sessionId, stream)).resolves.not.toThrow();

      expect(ttsController.synthesize).not.toHaveBeenCalled();
    });

    it('should handle stream error with fallback buffer', async () => {
      const stream = createAsyncIterableWithError(['Hello ', 'world', new Error('Stream error')]);

      await expect(llmStreamingService.processStream(sessionId, stream)).rejects.toThrow();

      // Should have attempted to send something
      expect(ttsController.synthesize).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // SUITE 6: Metrics and Monitoring (UPDATED)
  // ============================================================================

  describe('Metrics and Monitoring', () => {
    it('should track total chunks streamed', async () => {
      const stream = createMockStream(['A ||BREAK|| B ||BREAK|| C']);

      await llmStreamingService.processStream(sessionId, stream);

      const metrics = llmStreamingService.getMetrics();
      expect(metrics.totalChunksStreamed).toBe(3);
    });

    it('should accumulate metrics across streams', async () => {
      const stream1 = createMockStream(['A ||BREAK|| B']);
      await llmStreamingService.processStream(sessionId, stream1);

      const stream2 = createMockStream(['C ||BREAK|| D']);
      await llmStreamingService.processStream(sessionId + '-2', stream2);

      const metrics = llmStreamingService.getMetrics();
      expect(metrics.totalChunksStreamed).toBe(4);
    });

    it('should reset metrics on demand', async () => {
      const stream = createMockStream(['A ||BREAK|| B']);

      await llmStreamingService.processStream(sessionId, stream);

      let metrics = llmStreamingService.getMetrics();
      expect(metrics.totalChunksStreamed).toBe(2);

      llmStreamingService.resetMetrics();

      metrics = llmStreamingService.getMetrics();
      expect(metrics.totalChunksStreamed).toBe(0);
    });

    it('should track complete metrics including sizes and fallbacks', async () => {
      const response = 'Short||BREAK||Longer chunk here||BREAK||Medium';

      const stream = createMockStream([response]);
      await llmStreamingService.processStream(sessionId, stream);

      const metrics = llmStreamingService.getMetrics();
      expect(metrics.totalChunksStreamed).toBe(3);
      expect(metrics.totalChunksToTTS).toBe(3);
      expect(metrics.averageChunkSize).toBeGreaterThan(0);
      expect(metrics.maxChunkSize).toBeGreaterThan(0);
      expect(metrics.fallbacksUsed).toBe(0); // No fallback with markers
    });
  });

  // ============================================================================
  // SUITE 7: Integration and Real-World Scenarios
  // ============================================================================

  describe('Integration and Real-World Scenarios', () => {
    it('should handle sales pitch with natural breaks', async () => {
      const salesPitch = `Hi, this is Alex from Vantum. ||BREAK|| I noticed your company recently expanded. Do you have a moment to chat? ||BREAK|| I promise to keep it brief.`;

      const stream = createMockStream([salesPitch]);

      await llmStreamingService.processStream(sessionId, stream);

      expect(ttsController.synthesize).toHaveBeenCalledTimes(3);
    });

    it('should handle streaming tokens arriving gradually', async () => {
      const stream = createMockStream([
        'Hello ',
        'there ',
        '||BREAK|| ',
        'How ',
        'are ',
        'you',
        '?',
      ]);

      await llmStreamingService.processStream(sessionId, stream);

      expect(ttsController.synthesize).toHaveBeenCalledTimes(2);
      expect(ttsController.synthesize).toHaveBeenNthCalledWith(1, sessionId, 'Hello there');
      expect(ttsController.synthesize).toHaveBeenNthCalledWith(2, sessionId, 'How are you?');
    });

    it('should handle mixed case markers (case-sensitive)', async () => {
      // Markers are case-sensitive - lowercase 'break' should not split
      const stream = createMockStream(['Hello ||break|| World']);

      await llmStreamingService.processStream(sessionId, stream);

      // Should not split on lowercase 'break'
      expect(ttsController.synthesize).toHaveBeenCalledTimes(1);
      expect(ttsController.synthesize).toHaveBeenCalledWith(sessionId, 'Hello ||break|| World');
    });

    it('should handle very long conversation with many chunks', async () => {
      let text = '';
      for (let i = 0; i < 10; i++) {
        text += `Chunk ${i}. ||BREAK|| `;
      }

      const stream = createMockStream([text]);

      await llmStreamingService.processStream(sessionId, stream);

      expect(ttsController.synthesize).toHaveBeenCalledTimes(10);
    });
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a mock async iterable from an array of strings
 */
function createMockStream(tokens: string[]): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const token of tokens) {
        yield token;
      }
    },
  };
}

/**
 * Create an async iterable that errors after some tokens
 */
function createAsyncIterableWithError(items: (string | Error)[]): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const item of items) {
        if (item instanceof Error) {
          throw item;
        }
        yield item;
      }
    },
  };
}
