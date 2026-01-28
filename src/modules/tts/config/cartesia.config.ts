/**
 * Cartesia TTS Configuration
 *
 * Configuration values are hardcoded for production-ready operation.
 * Only API key is loaded from environment for security.
 */

export const cartesiaConfig = {
  // API credentials (ONLY from .env for security - never hardcode secrets)
  apiKey: process.env.CARTESIA_API_KEY || '',

  // WebSocket endpoint (hardcoded - production endpoint)
  wsUrl: 'wss://api.cartesia.ai/tts/websocket',

  // Model configuration (hardcoded - production values)
  model: 'sonic-english',

  // Voice configuration - Curated voices for Vantum
  // Kyle (male - default): c961b81c-a935-4c17-bfb3-ba2239de8c2f - Approachable Friend
  // Tessa (female): 6ccbfb76-1fc6-48f7-b71d-91ac6298247b - Kind Companion
  voiceId: 'c961b81c-a935-4c17-bfb3-ba2239de8c2f', // Kyle (male) - Default voice

  // Audio format (hardcoded - matches Vantum audio pipeline)
  sampleRate: 16000, // 16kHz - matches Deepgram STT sample rate
  encoding: 'pcm_s16le' as const, // PCM 16-bit little-endian
  language: 'en', // English
  speed: 1.0, // Normal speed

  // Session settings (hardcoded - operational limits)
  maxSessionDuration: 3600000, // 1 hour max per session
  keepaliveInterval: 8000, // 8 seconds keepalive ping
  connectionTimeout: 5000, // 5 seconds connection timeout
  maxConcurrentSessions: 50, // Maximum concurrent TTS sessions
} as const;
