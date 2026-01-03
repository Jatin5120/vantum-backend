/**
 * Timeout Configuration
 * Defines timeout values for various operations
 */

export const TIMEOUT_CONFIG = {
  CONNECTION_TIMEOUT_MS: 10000, // 10s to establish initial connection
  RECONNECTION_TIMEOUT_MS: 1000, // 1s for mid-stream reconnection
  CHUNK_FORWARD_TIMEOUT_MS: 5000, // 5s per audio chunk forward
  MESSAGE_TIMEOUT_MS: 5000, // 5s for Deepgram to respond
  SESSION_TIMEOUT_MS: 3600000, // 1 hour max session duration
  INACTIVITY_TIMEOUT_MS: 300000, // 5 minutes no audio = stale
  SESSION_IDLE_TIMEOUT_MS: 300000, // 5 minutes idle = cleanup (Phase 3)
  CLEANUP_INTERVAL_MS: 300000, // 5 minutes cleanup interval
  SHUTDOWN_TIMEOUT_PER_SESSION_MS: 5000, // 5s timeout per session during shutdown (Phase 3)
  MAX_SESSIONS: 1000, // Maximum concurrent sessions (Phase 3)
  METADATA_EVENT_TIMEOUT_MS: 5000, // Timeout fallback for Metadata event (safety net if event doesn't fire)

  /**
   * Delay after sending CloseStream before resetting finalization flag.
   *
   * The Deepgram Close event arrives ~3-10ms after the Metadata event.
   * This delay ensures the Close event handler sees isFinalizingTranscript=true
   * and doesn't attempt reconnection.
   *
   * @default 100ms (provides conservative buffer for network variability)
   */
  FINALIZATION_RESET_DELAY_MS: 100,
} as const;

/**
 * STT Service Constants
 *
 * Centralized configuration for all STT-related magic numbers
 */
export const STT_CONSTANTS = {
  /**
   * Maximum transcript length to prevent memory issues
   * Based on typical conversation length: ~50KB = ~25,000 words
   */
  MAX_TRANSCRIPT_LENGTH: 50000,

  /**
   * WebSocket ready state constants
   * Reference: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState
   */
  WEBSOCKET_STATE: {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  } as const,

  /**
   * Expected size of first audio chunk from frontend
   * 4096 samples × 2 bytes (Int16) = 8192 bytes
   * Used for diagnostic validation
   */
  EXPECTED_FIRST_CHUNK_BYTES: 8192,

  /**
   * KeepAlive interval for Deepgram WebSocket connection
   * Deepgram recommends 8-10 seconds
   * Reference: https://developers.deepgram.com/docs/keep-alive
   */
  KEEPALIVE_INTERVAL_MS: 8000,

  /**
   * Maximum reconnection buffer size (per session)
   * ~2 seconds of audio at 16kHz, 16-bit PCM = 32KB
   * Prevents unbounded memory growth during reconnection
   */
  MAX_RECONNECTION_BUFFER_BYTES: 32 * 1024,

  /**
   * Logging frequency for audio chunk forwarding
   * Log every Nth chunk to reduce verbosity in production
   */
  CHUNK_LOG_FREQUENCY: 100,
} as const;
