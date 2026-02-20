/**
 * TTS Constants
 */

export const TTS_CONSTANTS = {
  // Audio format
  SAMPLE_RATE: 16000, // Hz (Cartesia output)
  CHANNELS: 1, // Mono
  BIT_DEPTH: 16, // 16-bit PCM

  // Chunk sizes
  CHUNK_DURATION_MS: 100, // 100ms chunks
  EXPECTED_CHUNK_SAMPLES: 1600, // 16000 Hz * 0.1s
  EXPECTED_CHUNK_BYTES: 3200, // 1600 samples * 2 bytes

  // Buffer limits
  MAX_TEXT_LENGTH: 5000, // Maximum text length for TTS synthesis (Cartesia API limit)
  MAX_BUFFER_SIZE: 1048576, // 1MB reconnection buffer

  // Logging
  CHUNK_LOG_FREQUENCY: 100, // Log every 100 chunks

  // KeepAlive
  KEEPALIVE_INTERVAL_MS: 8000, // 8 seconds (Cartesia recommended)

  // Finalization
  FINALIZATION_RESET_DELAY_MS: 500, // 500ms delay before resetting flag
  METADATA_EVENT_TIMEOUT_MS: 3000, // 3s timeout for metadata event
} as const;
