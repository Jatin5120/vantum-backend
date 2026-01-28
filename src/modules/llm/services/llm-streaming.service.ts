/**
 * LLM Streaming Service
 * Handles semantic chunking and progressive TTS delivery
 *
 * Architecture:
 * - Buffers LLM tokens until ||BREAK|| marker found
 * - Extracts semantic chunks from buffer
 * - Sends each chunk to TTS sequentially
 * - Falls back to sentence splitting if no markers
 * - Forces chunk if buffer exceeds safety limit
 *
 * See: docs/architecture/semantic-streaming.md
 */

import { logger } from '@/shared/utils';
import { ttsController } from '@/modules/tts';
import { streamingConfig } from '../config/streaming.config';
import { SemanticChunk, ChunkingResult, StreamingMetrics } from '../types';
import { sessionService } from '@/modules/socket/services';

/**
 * LLM Streaming Service
 * Processes LLM token stream with semantic chunking for progressive TTS
 */
export class LLMStreamingServiceClass {
  // Per-stream counter (reset at start of each processStream call)
  // Tracks chunks extracted via ||BREAK|| markers in current stream
  private markerChunksProcessed = 0;

  // Global metrics (accumulate across all sessions for monitoring)
  // These track aggregate performance over the service lifetime
  // Call resetMetrics() to clear if needed (e.g., after deployment, for testing)
  private totalChunksStreamed = 0;
  private chunkSizes: number[] = []; // Track all chunk sizes for metrics
  private fallbackCount = 0; // Track sentence fallback usage

  /**
   * Process LLM token stream and send chunks to TTS progressively
   * Handles marker-based chunking with fallbacks
   *
   * @param sessionId - Session ID for TTS
   * @param stream - Async iterable of tokens from LLM
   * @throws Error if TTS fails
   */
  async processStream(sessionId: string, stream: AsyncIterable<string>): Promise<void> {
    let buffer = '';
    this.markerChunksProcessed = 0;
    let ttsErrorOccurred = false;

    try {
      // Stream tokens from LLM
      for await (const token of stream) {
        buffer += token;

        // Check for marker
        if (buffer.includes(streamingConfig.breakMarker)) {
          const result = this.extractChunksWithMarker(buffer);
          const { chunks, remaining } = result;

          // Send complete chunks to TTS sequentially
          for (const chunk of chunks) {
            try {
              await this.sendChunkToTTS(sessionId, chunk);
            } catch (ttsError) {
              ttsErrorOccurred = true;
              throw ttsError;
            }
          }

          // Keep remaining text (after last marker) in buffer
          buffer = remaining;
        }

        // Safety: Force chunk if buffer too large
        if (buffer.length > streamingConfig.maxBufferSize) {
          logger.warn('Buffer size exceeded, forcing chunk', {
            sessionId,
            bufferSize: buffer.length,
            limit: streamingConfig.maxBufferSize,
          });

          const chunk = this.createChunk(buffer, this.markerChunksProcessed + 1);
          try {
            await this.sendChunkToTTS(sessionId, chunk);
          } catch (ttsError) {
            ttsErrorOccurred = true;
            throw ttsError;
          }
          buffer = '';
        }
      }

      // Flush remaining buffer as final chunk
      if (buffer.trim().length > 0) {
        // Check if we've processed any marker-based chunks
        if (this.markerChunksProcessed === 0) {
          // No markers were found in entire response - use sentence fallback
          this.fallbackCount++;
          logger.info('No markers found, falling back to sentence chunking', {
            sessionId,
            bufferSize: buffer.length,
            reason: 'no_markers_found',
          });

          const sentenceChunks = this.extractChunksBySentence(buffer.trim());

          for (const chunk of sentenceChunks) {
            try {
              await this.sendChunkToTTS(sessionId, chunk);
            } catch (ttsError) {
              ttsErrorOccurred = true;
              throw ttsError;
            }
          }
        } else {
          // We found markers, just flush the remaining text after last marker
          logger.debug('Flushing remaining buffer', {
            sessionId,
            bufferSize: buffer.length,
            reason: 'text_after_last_marker',
          });

          const finalChunk = this.createChunk(buffer.trim(), this.markerChunksProcessed + 1);
          try {
            await this.sendChunkToTTS(sessionId, finalChunk);
          } catch (ttsError) {
            ttsErrorOccurred = true;
            throw ttsError;
          }
        }
      }

      logger.info('Semantic streaming complete', {
        sessionId,
        markerChunksProcessed: this.markerChunksProcessed,
      });
    } catch (error) {
      logger.error('Error processing LLM stream', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback: Send remaining buffer if not empty
      // Only attempt fallback if error was NOT from TTS (if TTS is broken, retrying won't help)
      // For stream errors, we want to salvage the buffered content
      if (buffer.trim().length > 0 && !ttsErrorOccurred) {
        try {
          logger.warn('Sending fallback buffer to TTS', {
            sessionId,
            bufferSize: buffer.length,
            reason: 'stream_error_recovery',
          });
          const fallbackChunk = this.createChunk(buffer.trim(), this.markerChunksProcessed + 1);
          await this.sendChunkToTTS(sessionId, fallbackChunk);
        } catch (fallbackError) {
          logger.error('Failed to send fallback buffer', {
            sessionId,
            fallbackError:
              fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          });
        }
      }

      throw error;
    }
  }

  /**
   * Extract chunks from buffer using ||BREAK|| marker
   * Primary strategy: marker-based chunking
   *
   * Regex: /\|\|BREAK\|\|/g
   * Escapes:
   * - \| = literal pipe (| is special in regex)
   * - BREAK = literal text
   * - /g = global (all occurrences)
   *
   * @param buffer - Text buffer potentially containing markers
   * @returns Chunks and remaining text
   */
  private extractChunksWithMarker(buffer: string): ChunkingResult {
    // Split on ||BREAK|| marker
    const parts = buffer.split(/\|\|BREAK\|\|/g);

    const chunks: SemanticChunk[] = [];
    let chunkNum = this.markerChunksProcessed;

    // Process all but last part as complete chunks
    for (let i = 0; i < parts.length - 1; i++) {
      const text = parts[i].trim();
      if (text.length > 0) {
        chunkNum++;
        chunks.push(this.createChunk(text, chunkNum));
      }
    }

    this.markerChunksProcessed = chunkNum;

    // Last part is remainder (incomplete chunk)
    const remaining = parts[parts.length - 1] || '';

    return { chunks, remaining };
  }

  /**
   * Extract chunks using sentence boundaries
   * Secondary fallback: when no markers found
   *
   * @param buffer - Text buffer
   * @returns Chunks from sentence splitting
   */
  private extractChunksBySentence(buffer: string): SemanticChunk[] {
    // Split on sentence boundaries: . ! ? followed by space
    const sentences = buffer
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const chunks: SemanticChunk[] = [];

    // Group sentences into chunks
    let currentChunk = '';
    for (const sentence of sentences) {
      const testChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;

      // Check if adding this sentence exceeds limits
      const wordCount = testChunk.split(/\s+/).length;
      const charCount = testChunk.length;

      if (
        wordCount <= streamingConfig.maxChunkWords &&
        charCount <= streamingConfig.maxChunkChars
      ) {
        currentChunk = testChunk;
      } else {
        // Current chunk full, save it and start new
        if (currentChunk.length > 0) {
          this.markerChunksProcessed++;
          chunks.push(this.createChunk(currentChunk, this.markerChunksProcessed));
        }
        currentChunk = sentence;
      }
    }

    // Add final chunk
    if (currentChunk.length > 0) {
      this.markerChunksProcessed++;
      chunks.push(this.createChunk(currentChunk, this.markerChunksProcessed));
    }

    return chunks;
  }

  /**
   * Create SemanticChunk object
   *
   * @param text - Chunk text
   * @param chunkNumber - Sequential chunk number
   * @returns SemanticChunk
   */
  private createChunk(text: string, chunkNumber: number): SemanticChunk {
    const trimmed = text.trim();
    const wordCount = trimmed.split(/\s+/).length;
    const charCount = trimmed.length;

    return {
      text: trimmed,
      wordCount,
      charCount,
      chunkNumber,
    };
  }

  /**
   * Send single chunk to TTS (sequential delivery with playback delay)
   * Awaits TTS transmission completion, then waits for audio playback to complete
   *
   * @param sessionId - Session ID
   * @param chunk - Semantic chunk to send
   * @throws Error if TTS fails
   */
  private async sendChunkToTTS(sessionId: string, chunk: SemanticChunk): Promise<void> {
    try {
      logger.debug('Sending chunk to TTS', {
        sessionId,
        chunkNumber: chunk.chunkNumber,
        wordCount: chunk.wordCount,
        charCount: chunk.charCount,
        preview:
          chunk.text.substring(0, streamingConfig.logPreviewLength) +
          (chunk.text.length > streamingConfig.logPreviewLength ? '...' : ''),
      });

      // Get voiceId from session metadata (if set by audio.start)
      const session = sessionService.getSessionBySessionId(sessionId);
      const voiceId = session?.metadata?.voiceId as string | undefined;

      // Sequential delivery: await TTS transmission completion and get audio duration
      const audioDurationMs = await ttsController.synthesize(sessionId, chunk.text, {
        voiceId,
      });

      // Track chunk size for metrics
      this.chunkSizes.push(chunk.charCount);

      logger.info('Chunk TTS transmission complete, waiting for playback', {
        sessionId,
        chunkNumber: chunk.chunkNumber,
        charCount: chunk.charCount,
        audioDurationMs,
      });

      // Wait for audio playback to complete before sending next chunk
      // This prevents overlapping audio when there's no frontend queueing
      if (audioDurationMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, audioDurationMs));
        logger.debug('Playback delay complete', {
          sessionId,
          chunkNumber: chunk.chunkNumber,
          delayMs: audioDurationMs,
        });
      }

      this.totalChunksStreamed++;
    } catch (error) {
      logger.error('Error sending chunk to TTS', {
        sessionId,
        chunkNumber: chunk.chunkNumber,
        text: chunk.text.substring(0, 100),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get streaming metrics
   * @returns Current streaming statistics
   */
  getMetrics(): StreamingMetrics {
    const avgSize =
      this.chunkSizes.length > 0
        ? Math.round(this.chunkSizes.reduce((sum, s) => sum + s, 0) / this.chunkSizes.length)
        : 0;
    const maxSize = this.chunkSizes.length > 0 ? Math.max(...this.chunkSizes) : 0;

    return {
      totalChunksStreamed: this.totalChunksStreamed,
      totalChunksToTTS: this.totalChunksStreamed,
      averageChunkSize: avgSize,
      maxChunkSize: maxSize,
      fallbacksUsed: this.fallbackCount,
      markerChunksProcessed: this.markerChunksProcessed,
    };
  }

  /**
   * Reset metrics
   * Use this for testing or after deployment to clear accumulated stats
   * In production, these metrics accumulate across all sessions for monitoring
   */
  resetMetrics(): void {
    this.totalChunksStreamed = 0;
    this.markerChunksProcessed = 0;
    this.chunkSizes = [];
    this.fallbackCount = 0;
  }
}

/**
 * Export singleton instance
 */
export const llmStreamingService = new LLMStreamingServiceClass();
