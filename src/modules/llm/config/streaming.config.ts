/**
 * Semantic Streaming Configuration
 *
 * This file is TRACKED in git (not environment variables) for consistency
 * across environments and easier testing.
 *
 * Controls semantic chunk streaming behavior for progressive TTS delivery.
 * See: docs/architecture/semantic-streaming.md
 */

export const streamingConfig = {
  /**
   * Break marker for prompt-guided chunking
   * LLM inserts this marker at natural pause points
   */
  breakMarker: '||BREAK||' as const,

  /**
   * Minimum words per chunk (prevents too-short chunks)
   */
  minChunkWords: 5,

  /**
   * Maximum words per chunk (prevents too-long chunks)
   */
  maxChunkWords: 50,

  /**
   * Maximum characters per chunk
   */
  maxChunkChars: 300,

  /**
   * Force chunk if buffer exceeds this (safety limit)
   */
  maxBufferSize: 400,

  /**
   * Sequential TTS delivery
   * true: Wait for each TTS chunk to complete before sending next
   * false: Send all chunks immediately (parallel)
   * MUST be true for in-order delivery
   */
  sequentialTTS: true,

  /**
   * Log preview length for chunk text (characters)
   */
  logPreviewLength: 50,

  /**
   * Enable fallback to sentence chunking
   */
  enableFallback: true,

  /**
   * Fallback mode when no markers found
   * 'sentence': Split on sentence boundaries (. ! ?)
   * 'complete': Send complete buffer as single chunk
   */
  fallbackMode: 'sentence' as const,
} as const;

/**
 * Streaming configuration type for TypeScript consumers
 */
export type StreamingConfig = typeof streamingConfig;
