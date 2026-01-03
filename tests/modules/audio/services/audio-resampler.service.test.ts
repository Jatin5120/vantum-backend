/**
 * AudioResamplerService Unit Tests
 * Comprehensive test coverage for audio resampling functionality
 *
 * Test Coverage Target: 90%+
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { audioResamplerService } from '@/modules/audio/services';
import { OUTPUT_SAMPLE_RATE } from '@/modules/audio/constants/audio.constants';

/**
 * Generate test audio buffer with sine wave pattern
 * @param sampleRate - Sample rate (Hz)
 * @param durationMs - Duration in milliseconds
 * @param frequency - Frequency of sine wave (Hz)
 * @returns Int16 PCM buffer
 */
function generateTestAudio(
  sampleRate: number,
  durationMs: number,
  frequency: number = 440
): Buffer {
  const sampleCount = Math.floor((sampleRate * durationMs) / 1000);
  const buffer = Buffer.alloc(sampleCount * 2); // Int16 = 2 bytes per sample
  const int16View = new Int16Array(
    buffer.buffer,
    buffer.byteOffset,
    sampleCount
  );

  // Generate sine wave
  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t);
    // Convert to Int16 range [-32768, 32767]
    int16View[i] = Math.round(sample * 32767);
  }

  return buffer;
}

/**
 * Validate buffer is valid Int16 PCM
 * @param buffer - Buffer to validate
 * @returns true if valid
 */
function isValidInt16PCM(buffer: Buffer): boolean {
  // Must be even length (2 bytes per sample)
  if (buffer.length % 2 !== 0) return false;

  const int16View = new Int16Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.length / 2
  );

  // Check all samples are in valid Int16 range
  for (let i = 0; i < int16View.length; i++) {
    if (int16View[i] < -32768 || int16View[i] > 32767) {
      return false;
    }
  }

  return true;
}

describe('AudioResamplerService', () => {
  describe('resample()', () => {
    it('should downsample 48kHz to 16kHz correctly', async () => {
      // Generate 100ms of test audio at 48kHz
      const sampleCount = 4800; // 48000 Hz * 0.1s
      const testBuffer = generateTestAudio(48000, 100);

      expect(testBuffer.length).toBe(sampleCount * 2); // Int16 = 2 bytes

      const result = await audioResamplerService.resample(
        'test-session-downsample',
        testBuffer,
        48000
      );

      // Output should be 1/3 size (16kHz vs 48kHz)
      const expectedSamples = 1600; // 16000 Hz * 0.1s
      const expectedBytes = expectedSamples * 2; // Int16

      expect(result.length).toBe(expectedBytes);

      // Output should be valid Int16 PCM
      expect(isValidInt16PCM(result)).toBe(true);
    });

    it('should upsample 8kHz to 16kHz correctly', async () => {
      // Generate 100ms of test audio at 8kHz (Twilio use case)
      const sampleCount = 800; // 8000 Hz * 0.1s
      const testBuffer = generateTestAudio(8000, 100);

      expect(testBuffer.length).toBe(sampleCount * 2); // Int16 = 2 bytes

      const result = await audioResamplerService.resample(
        'test-session-upsample',
        testBuffer,
        8000
      );

      // Output should be 2x size (16kHz vs 8kHz)
      const expectedSamples = 1600; // 16000 Hz * 0.1s
      const expectedBytes = expectedSamples * 2; // Int16

      expect(result.length).toBe(expectedBytes);

      // Output should be valid Int16 PCM
      expect(isValidInt16PCM(result)).toBe(true);
    });

    it('should handle passthrough when source equals target rate', async () => {
      // Generate 100ms of test audio at 16kHz
      const testBuffer = generateTestAudio(16000, 100);

      const result = await audioResamplerService.resample(
        'test-session-passthrough',
        testBuffer,
        16000
      );

      // Should return the exact same buffer (passthrough optimization)
      expect(result).toBe(testBuffer);
      expect(result.length).toBe(testBuffer.length);
    });

    it('should handle empty audio buffer gracefully', async () => {
      const emptyBuffer = Buffer.alloc(0);

      const result = await audioResamplerService.resample(
        'test-session-empty',
        emptyBuffer,
        48000
      );

      expect(result.length).toBe(0);
    });

    it('should handle invalid sample rate gracefully', async () => {
      const testBuffer = generateTestAudio(48000, 100);

      // Test invalid low sample rate (below 8kHz)
      const resultLow = await audioResamplerService.resample(
        'test-session-invalid-low',
        testBuffer,
        4000
      );

      // Should return original buffer (graceful degradation)
      expect(resultLow).toBe(testBuffer);

      // Test invalid high sample rate (above 48kHz)
      const resultHigh = await audioResamplerService.resample(
        'test-session-invalid-high',
        testBuffer,
        96000
      );

      // Should return original buffer (graceful degradation)
      expect(resultHigh).toBe(testBuffer);
    });

    it('should handle null/undefined input gracefully', async () => {
      // @ts-expect-error Testing runtime error handling
      const resultNull = await audioResamplerService.resample(
        'test-session-null',
        null,
        48000
      );

      // Should return empty buffer (graceful degradation)
      expect(resultNull.length).toBe(0);
    });

    it('should preserve audio characteristics after resampling', async () => {
      // Generate 100ms of 440Hz sine wave at 48kHz
      const testBuffer = generateTestAudio(48000, 100, 440);

      const result = await audioResamplerService.resample(
        'test-session-sine',
        testBuffer,
        48000
      );

      // Check that output is valid
      expect(isValidInt16PCM(result)).toBe(true);

      // Check that output has expected duration (100ms at 16kHz = 1600 samples)
      const outputSamples = result.length / 2;
      expect(outputSamples).toBe(1600);

      // Check that output has non-zero samples (not silent)
      const int16View = new Int16Array(
        result.buffer,
        result.byteOffset,
        outputSamples
      );
      const hasNonZeroSamples = Array.from(int16View).some((s) => s !== 0);
      expect(hasNonZeroSamples).toBe(true);
    });

    it('should handle various common sample rates', async () => {
      const testCases = [
        { from: 48000, to: OUTPUT_SAMPLE_RATE, label: 'Browser audio' },
        { from: 44100, to: OUTPUT_SAMPLE_RATE, label: 'CD quality' },
        { from: 24000, to: OUTPUT_SAMPLE_RATE, label: 'Wideband' },
        { from: 16000, to: OUTPUT_SAMPLE_RATE, label: 'Narrowband (passthrough)' },
        { from: 8000, to: OUTPUT_SAMPLE_RATE, label: 'Telephony' },
      ];

      for (const testCase of testCases) {
        const testBuffer = generateTestAudio(testCase.from, 100);

        const result = await audioResamplerService.resample(
          `test-${testCase.label}`,
          testBuffer,
          testCase.from
        );

        // All should produce 100ms at 16kHz (1600 samples = 3200 bytes)
        expect(result.length).toBe(3200);
        expect(isValidInt16PCM(result)).toBe(true);
      }
    });

    it('should handle large audio buffers (1 second)', async () => {
      // Generate 1 second of audio at 48kHz
      const testBuffer = generateTestAudio(48000, 1000);

      const result = await audioResamplerService.resample(
        'test-session-large',
        testBuffer,
        48000
      );

      // Output should be 1 second at 16kHz (16000 samples = 32000 bytes)
      expect(result.length).toBe(32000);
      expect(isValidInt16PCM(result)).toBe(true);
    });

    it('should be performant for real-time processing', async () => {
      // Generate 100ms chunk (typical real-time chunk size)
      const testBuffer = generateTestAudio(48000, 100);

      const start = performance.now();
      await audioResamplerService.resample(
        'test-session-performance',
        testBuffer,
        48000
      );
      const duration = performance.now() - start;

      // Should process 100ms chunk in <2ms (target from spec)
      expect(duration).toBeLessThan(2);
    });

    it('should handle concurrent resampling calls', async () => {
      // Simulate concurrent sessions
      const promises = [];
      for (let i = 0; i < 100; i++) {
        const buffer = generateTestAudio(48000, 100);
        promises.push(
          audioResamplerService.resample(`test-session-${i}`, buffer, 48000)
        );
      }

      const results = await Promise.all(promises);

      // All should succeed
      expect(results.length).toBe(100);

      // All should have correct size
      results.forEach((result) => {
        expect(result.length).toBe(3200); // 100ms at 16kHz
        expect(isValidInt16PCM(result)).toBe(true);
      });
    });

    it('should handle odd-sized buffers gracefully', async () => {
      // Create buffer with odd byte count (invalid for Int16)
      const oddBuffer = Buffer.alloc(1001); // Odd number

      const result = await audioResamplerService.resample(
        'test-session-odd',
        oddBuffer,
        48000
      );

      // Should still process (may return original or throw, but shouldn't crash)
      expect(result).toBeDefined();
    });
  });

  describe('getExpectedOutputSize()', () => {
    it('should calculate correct output size for downsampling', () => {
      // 48kHz → 16kHz (1/3 ratio)
      const inputSize = 9600; // 48kHz, 100ms, Int16 (4800 samples * 2 bytes)
      const expectedSize = audioResamplerService.getExpectedOutputSize(
        inputSize,
        48000,
        16000
      );

      expect(expectedSize).toBe(3200); // 16kHz, 100ms, Int16 (1600 samples * 2 bytes)
    });

    it('should calculate correct output size for upsampling', () => {
      // 8kHz → 16kHz (2x ratio)
      const inputSize = 1600; // 8kHz, 100ms, Int16 (800 samples * 2 bytes)
      const expectedSize = audioResamplerService.getExpectedOutputSize(
        inputSize,
        8000,
        16000
      );

      expect(expectedSize).toBe(3200); // 16kHz, 100ms, Int16 (1600 samples * 2 bytes)
    });

    it('should calculate correct output size for passthrough', () => {
      // 16kHz → 16kHz (1:1 ratio)
      const inputSize = 3200; // 16kHz, 100ms, Int16
      const expectedSize = audioResamplerService.getExpectedOutputSize(
        inputSize,
        16000,
        16000
      );

      expect(expectedSize).toBe(3200); // Same size
    });

    it('should use OUTPUT_SAMPLE_RATE as default target', () => {
      const inputSize = 9600; // 48kHz, 100ms
      const expectedSize = audioResamplerService.getExpectedOutputSize(
        inputSize,
        48000
        // No third parameter - should default to OUTPUT_SAMPLE_RATE
      );

      expect(expectedSize).toBe(3200); // 16kHz, 100ms
    });

    it('should handle zero input size', () => {
      const expectedSize = audioResamplerService.getExpectedOutputSize(
        0,
        48000,
        16000
      );

      expect(expectedSize).toBe(0);
    });

    it('should handle various sample rate ratios', () => {
      const testCases = [
        { from: 48000, to: 16000, inputSize: 9600, expectedOutput: 3200 },
        { from: 44100, to: 16000, inputSize: 8820, expectedOutput: 3200 },
        { from: 24000, to: 16000, inputSize: 4800, expectedOutput: 3200 },
        { from: 8000, to: 16000, inputSize: 1600, expectedOutput: 3200 },
      ];

      testCases.forEach(({ from, to, inputSize, expectedOutput }) => {
        const result = audioResamplerService.getExpectedOutputSize(
          inputSize,
          from,
          to
        );
        expect(result).toBe(expectedOutput);
      });
    });
  });

  describe('Memory and Resource Management', () => {
    it('should not leak memory with many resample operations', async () => {
      // Run 1000 iterations and check memory doesn't grow unbounded
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 1000; i++) {
        const buffer = generateTestAudio(48000, 100);
        await audioResamplerService.resample(`test-leak-${i}`, buffer, 48000);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;

      // Memory growth should be minimal (<10MB for 1000 operations)
      // Note: This is a rough check, may need adjustment based on environment
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024); // 10MB
    });

    it('should handle rapid successive calls on same session', async () => {
      const sessionId = 'test-session-rapid';
      const promises = [];

      // Simulate rapid chunks from same session
      for (let i = 0; i < 50; i++) {
        const buffer = generateTestAudio(48000, 100);
        promises.push(
          audioResamplerService.resample(sessionId, buffer, 48000)
        );
      }

      const results = await Promise.all(promises);

      // All should succeed
      expect(results.length).toBe(50);
      results.forEach((result) => {
        expect(result.length).toBe(3200);
        expect(isValidInt16PCM(result)).toBe(true);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle minimum valid buffer size', async () => {
      // Minimum: 2 bytes (1 Int16 sample)
      const minBuffer = Buffer.alloc(2);
      const int16View = new Int16Array(minBuffer.buffer);
      int16View[0] = 1000;

      const result = await audioResamplerService.resample(
        'test-min-buffer',
        minBuffer,
        48000
      );

      // Should process without crashing
      expect(result).toBeDefined();
      expect(isValidInt16PCM(result)).toBe(true);
    });

    it('should handle maximum practical buffer size (10 seconds)', async () => {
      // 10 seconds at 48kHz = 480000 samples = 960KB
      const maxBuffer = generateTestAudio(48000, 10000);

      const result = await audioResamplerService.resample(
        'test-max-buffer',
        maxBuffer,
        48000
      );

      // Should produce 10 seconds at 16kHz
      expect(result.length).toBe(320000); // 160000 samples * 2 bytes
      expect(isValidInt16PCM(result)).toBe(true);
    });

    it('should handle silent audio (all zeros)', async () => {
      const silentBuffer = Buffer.alloc(9600); // 100ms at 48kHz, all zeros

      const result = await audioResamplerService.resample(
        'test-silent',
        silentBuffer,
        48000
      );

      // Should produce silent output (all zeros)
      expect(result.length).toBe(3200);
      const int16View = new Int16Array(
        result.buffer,
        result.byteOffset,
        result.length / 2
      );
      const allZeros = Array.from(int16View).every((s) => s === 0);
      expect(allZeros).toBe(true);
    });

    it('should handle maximum amplitude audio (clipping)', async () => {
      // Create buffer with maximum amplitude
      const maxBuffer = Buffer.alloc(9600);
      const int16View = new Int16Array(
        maxBuffer.buffer,
        maxBuffer.byteOffset,
        4800
      );

      // Fill with maximum positive/negative values
      for (let i = 0; i < int16View.length; i++) {
        int16View[i] = i % 2 === 0 ? 32767 : -32768;
      }

      const result = await audioResamplerService.resample(
        'test-clipping',
        maxBuffer,
        48000
      );

      // Should handle without crashing and produce valid output
      expect(result.length).toBe(3200);
      expect(isValidInt16PCM(result)).toBe(true);
    });
  });
});
