/**
 * Audio Resampler Service
 * Handles audio sample rate conversion using wave-resampler
 *
 * This is a stateless service - each resample() call is independent
 * Follows the Handler + Service pattern (no session state management)
 *
 * Architecture Doc: /docs/audio/audio-resampling.md
 */

import { resample } from 'wave-resampler';
import { logger } from '@/shared/utils/logger';
import { OUTPUT_SAMPLE_RATE } from '@/modules/audio/constants/audio.constants';

/**
 * AudioResamplerService
 * Converts audio from various sample rates to OUTPUT_SAMPLE_RATE (16kHz) for Deepgram STT
 *
 * Key Features:
 * - Stateless design (no session state)
 * - Passthrough optimization for matching sample rates
 * - Graceful degradation on errors
 * - Comprehensive logging with sessionId context
 */
class AudioResamplerServiceClass {
  /**
   * Resample audio to OUTPUT_SAMPLE_RATE (16kHz)
   *
   * Algorithm: Uses wave-resampler's linear interpolation
   * - Fast enough for real-time STT (<2ms per 100ms chunk)
   * - Good quality for speech (telephony-grade)
   * - Pure JavaScript (no native compilation)
   *
   * @param sessionId - Session identifier for logging/correlation
   * @param audioData - Int16 PCM audio buffer
   * @param sourceSampleRate - Original sample rate (8000, 16000, 48000, etc.)
   * @returns Resampled Int16 PCM buffer at OUTPUT_SAMPLE_RATE
   *
   * @example
   * // Browser audio (48kHz → 16kHz)
   * const resampled = await audioResamplerService.resample(
   *   sessionId,
   *   Buffer.from(audioChunk),
   *   48000
   * );
   *
   * @example
   * // Twilio audio (8kHz → 16kHz)
   * const resampled = await audioResamplerService.resample(
   *   sessionId,
   *   twilioBuffer,
   *   8000
   * );
   */
  async resample(
    sessionId: string,
    audioData: Buffer,
    sourceSampleRate: number
  ): Promise<Buffer> {
    try {
      // Validate inputs
      if (!audioData || audioData.length === 0) {
        logger.warn('Empty audio data provided for resampling', {
          sessionId,
          sourceSampleRate,
        });
        return Buffer.alloc(0);
      }

      // Validate sample rate range (8kHz - 48kHz)
      if (sourceSampleRate < 8000 || sourceSampleRate > 48000) {
        logger.error('Invalid sample rate for resampling', {
          sessionId,
          sourceSampleRate,
          validRange: '8000-48000 Hz',
        });
        // Graceful degradation: return original audio
        return audioData;
      }

      // Passthrough optimization: skip resampling if already at target rate
      if (sourceSampleRate === OUTPUT_SAMPLE_RATE) {
        logger.debug('Audio already at target sample rate, passthrough', {
          sessionId,
          sampleRate: OUTPUT_SAMPLE_RATE,
        });
        return audioData;
      }

      // Convert Buffer to Int16Array for wave-resampler
      const inputSamples = new Int16Array(
        audioData.buffer,
        audioData.byteOffset,
        audioData.length / 2
      );

      logger.debug('Starting resampling', {
        sessionId,
        sourceSampleRate,
        targetSampleRate: OUTPUT_SAMPLE_RATE,
        inputSamples: inputSamples.length,
        inputBytes: audioData.length,
      });

      // Resample using wave-resampler
      // Note: wave-resampler returns Float64Array by default
      // We use linear interpolation (fast, good for speech, no LPF)
      const float64Output = resample(
        inputSamples,
        sourceSampleRate,
        OUTPUT_SAMPLE_RATE,
        { method: 'linear', LPF: false } // Fast method for real-time STT
      ) as Float64Array;

      // Convert Float64Array back to Int16Array
      const outputSamples = new Int16Array(float64Output.length);
      for (let i = 0; i < float64Output.length; i++) {
        // Clamp to Int16 range and convert
        const sample = Math.max(-32768, Math.min(32767, Math.round(float64Output[i])));
        outputSamples[i] = sample;
      }

      // Convert Int16Array to Buffer
      const outputBuffer = Buffer.from(
        outputSamples.buffer,
        outputSamples.byteOffset,
        outputSamples.byteLength
      );

      logger.debug('Resampling complete', {
        sessionId,
        inputSize: audioData.length,
        outputSize: outputBuffer.length,
        ratio: (outputBuffer.length / audioData.length).toFixed(2),
        outputSamples: outputSamples.length,
      });

      return outputBuffer;
    } catch (error) {
      // Graceful degradation: log error and return original audio
      // This prevents breaking the STT pipeline due to resampling failures
      // Deepgram can handle 48kHz (suboptimal, but works)
      logger.error('Audio resampling failed, returning original audio', {
        sessionId,
        sourceSampleRate,
        targetSampleRate: OUTPUT_SAMPLE_RATE,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return audioData;
    }
  }

  /**
   * Calculate expected output size after resampling
   * Useful for buffer pre-allocation or validation
   *
   * @param inputSize - Input buffer size in bytes
   * @param sourceSampleRate - Source sample rate
   * @param targetSampleRate - Target sample rate (default: OUTPUT_SAMPLE_RATE)
   * @returns Expected output size in bytes
   *
   * @example
   * const expectedSize = audioResamplerService.getExpectedOutputSize(
   *   9600,  // 48kHz, 100ms, Int16
   *   48000,
   *   16000
   * );
   * // Returns: 3200 (16kHz, 100ms, Int16)
   */
  getExpectedOutputSize(
    inputSize: number,
    sourceSampleRate: number,
    targetSampleRate: number = OUTPUT_SAMPLE_RATE
  ): number {
    const ratio = targetSampleRate / sourceSampleRate;
    return Math.floor(inputSize * ratio);
  }
}

// Export singleton instance
export const audioResamplerService = new AudioResamplerServiceClass();
