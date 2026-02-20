/**
 * Cartesia Configuration Tests
 * Tests for TTS configuration validation and hardcoded production values
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Cartesia Configuration', () => {
  let originalEnv: typeof process.env;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;

    // Clear module cache to reload config
    vi.resetModules();
  });

  describe('Hardcoded Production Values', () => {
    it('should have hardcoded production values (not from env)', async () => {
      // Clear ALL env vars to prove they're not used
      delete process.env.CARTESIA_API_KEY;
      delete process.env.CARTESIA_MODEL_VERSION;
      delete process.env.CARTESIA_VOICE_ID;
      delete process.env.TTS_SAMPLE_RATE;
      delete process.env.TTS_ENCODING;
      delete process.env.TTS_LANGUAGE;
      delete process.env.TTS_SPEED;

      // Reload config
      vi.resetModules();
      const { cartesiaConfig } = await import('@/modules/tts/config/cartesia.config');

      // API key comes from env (empty if not set)
      expect(cartesiaConfig.apiKey).toBe('');

      // All other values are HARDCODED (production-ready)
      expect(cartesiaConfig.model).toBe('sonic-english');
      expect(cartesiaConfig.voiceId).toBe('a0e99841-438c-4a64-b679-ae501e7d6091'); // Production voice
      expect(cartesiaConfig.sampleRate).toBe(16000);
      expect(cartesiaConfig.encoding).toBe('pcm_s16le');
      expect(cartesiaConfig.language).toBe('en');
      expect(cartesiaConfig.speed).toBe(1.0);
    });

    it('should use hardcoded WebSocket URL (not from env)', async () => {
      vi.resetModules();
      const { cartesiaConfig } = await import('@/modules/tts/config/cartesia.config');

      expect(cartesiaConfig.wsUrl).toBe('wss://api.cartesia.ai/tts/websocket');
    });

    it('should have hardcoded session settings (not from env)', async () => {
      vi.resetModules();
      const { cartesiaConfig } = await import('@/modules/tts/config/cartesia.config');

      expect(cartesiaConfig.maxSessionDuration).toBe(3600000); // 1 hour
      expect(cartesiaConfig.keepaliveInterval).toBe(8000); // 8 seconds
      expect(cartesiaConfig.connectionTimeout).toBe(5000); // 5 seconds
      expect(cartesiaConfig.maxConcurrentSessions).toBe(50);
    });
  });

  describe('API Key (Only Value From Environment)', () => {
    it('should load API key from CARTESIA_API_KEY env var', async () => {
      process.env.CARTESIA_API_KEY = 'test-api-key-123';

      vi.resetModules();
      const { cartesiaConfig } = await import('@/modules/tts/config/cartesia.config');

      expect(cartesiaConfig.apiKey).toBe('test-api-key-123');
    });

    it('should use empty string when CARTESIA_API_KEY not set', async () => {
      delete process.env.CARTESIA_API_KEY;

      vi.resetModules();
      const { cartesiaConfig } = await import('@/modules/tts/config/cartesia.config');

      expect(cartesiaConfig.apiKey).toBe('');
    });
  });

  describe('Environment Variables Ignored (Hardcoded Config Pattern)', () => {
    it('should ignore CARTESIA_MODEL_VERSION env var', async () => {
      process.env.CARTESIA_MODEL_VERSION = 'sonic-multilingual';

      vi.resetModules();
      const { cartesiaConfig } = await import('@/modules/tts/config/cartesia.config');

      // Config is hardcoded, env var ignored
      expect(cartesiaConfig.model).toBe('sonic-english');
    });

    it('should ignore CARTESIA_VOICE_ID env var', async () => {
      process.env.CARTESIA_VOICE_ID = 'custom-voice-123';

      vi.resetModules();
      const { cartesiaConfig } = await import('@/modules/tts/config/cartesia.config');

      // Config is hardcoded, env var ignored
      expect(cartesiaConfig.voiceId).toBe('a0e99841-438c-4a64-b679-ae501e7d6091');
    });

    it('should ignore TTS_SAMPLE_RATE env var', async () => {
      process.env.TTS_SAMPLE_RATE = '24000';

      vi.resetModules();
      const { cartesiaConfig } = await import('@/modules/tts/config/cartesia.config');

      // Config is hardcoded, env var ignored
      expect(cartesiaConfig.sampleRate).toBe(16000);
    });

    it('should ignore TTS_ENCODING env var', async () => {
      process.env.TTS_ENCODING = 'opus';

      vi.resetModules();
      const { cartesiaConfig } = await import('@/modules/tts/config/cartesia.config');

      // Config is hardcoded, env var ignored
      expect(cartesiaConfig.encoding).toBe('pcm_s16le');
    });

    it('should ignore TTS_LANGUAGE env var', async () => {
      process.env.TTS_LANGUAGE = 'es';

      vi.resetModules();
      const { cartesiaConfig } = await import('@/modules/tts/config/cartesia.config');

      // Config is hardcoded, env var ignored
      expect(cartesiaConfig.language).toBe('en');
    });

    it('should ignore TTS_SPEED env var', async () => {
      process.env.TTS_SPEED = '1.5';

      vi.resetModules();
      const { cartesiaConfig } = await import('@/modules/tts/config/cartesia.config');

      // Config is hardcoded, env var ignored
      expect(cartesiaConfig.speed).toBe(1.0);
    });

    it('should ignore TTS_KEEPALIVE_INTERVAL_MS env var', async () => {
      process.env.TTS_KEEPALIVE_INTERVAL_MS = '10000';

      vi.resetModules();
      const { cartesiaConfig } = await import('@/modules/tts/config/cartesia.config');

      // Config is hardcoded, env var ignored
      expect(cartesiaConfig.keepaliveInterval).toBe(8000);
    });

    it('should ignore TTS_CONNECTION_TIMEOUT_MS env var', async () => {
      process.env.TTS_CONNECTION_TIMEOUT_MS = '10000';

      vi.resetModules();
      const { cartesiaConfig } = await import('@/modules/tts/config/cartesia.config');

      // Config is hardcoded, env var ignored
      expect(cartesiaConfig.connectionTimeout).toBe(5000);
    });

    it('should ignore TTS_MAX_CONCURRENT_SESSIONS env var', async () => {
      process.env.TTS_MAX_CONCURRENT_SESSIONS = '100';

      vi.resetModules();
      const { cartesiaConfig } = await import('@/modules/tts/config/cartesia.config');

      // Config is hardcoded, env var ignored
      expect(cartesiaConfig.maxConcurrentSessions).toBe(50);
    });
  });

  describe('Type Safety', () => {
    it('should have correct types for all values', async () => {
      vi.resetModules();
      const { cartesiaConfig } = await import('@/modules/tts/config/cartesia.config');

      expect(typeof cartesiaConfig.apiKey).toBe('string');
      expect(typeof cartesiaConfig.wsUrl).toBe('string');
      expect(typeof cartesiaConfig.model).toBe('string');
      expect(typeof cartesiaConfig.voiceId).toBe('string');
      expect(typeof cartesiaConfig.sampleRate).toBe('number');
      expect(typeof cartesiaConfig.encoding).toBe('string');
      expect(typeof cartesiaConfig.language).toBe('string');
      expect(typeof cartesiaConfig.speed).toBe('number');
      expect(typeof cartesiaConfig.maxSessionDuration).toBe('number');
      expect(typeof cartesiaConfig.keepaliveInterval).toBe('number');
      expect(typeof cartesiaConfig.connectionTimeout).toBe('number');
      expect(typeof cartesiaConfig.maxConcurrentSessions).toBe('number');
    });

    it('should have numeric values in expected ranges', async () => {
      vi.resetModules();
      const { cartesiaConfig } = await import('@/modules/tts/config/cartesia.config');

      // Sample rate
      expect(cartesiaConfig.sampleRate).toBeGreaterThan(0);
      expect(cartesiaConfig.sampleRate).toBe(16000);

      // Speed
      expect(cartesiaConfig.speed).toBeGreaterThan(0);
      expect(cartesiaConfig.speed).toBeLessThanOrEqual(2.0);

      // Timeouts
      expect(cartesiaConfig.connectionTimeout).toBeGreaterThan(0);
      expect(cartesiaConfig.keepaliveInterval).toBeGreaterThan(0);
      expect(cartesiaConfig.maxSessionDuration).toBeGreaterThan(0);

      // Concurrent sessions
      expect(cartesiaConfig.maxConcurrentSessions).toBeGreaterThan(0);
    });

    it('should export config with const assertion (compile-time immutability)', async () => {
      vi.resetModules();
      const { cartesiaConfig } = await import('@/modules/tts/config/cartesia.config');

      // TypeScript enforces const assertion at compile time (not runtime)
      // At runtime in JavaScript, const assertion doesn't freeze the object
      // But the type system ensures TypeScript treats properties as readonly
      expect(cartesiaConfig).toBeDefined();

      // Verify all expected properties exist
      expect(cartesiaConfig).toHaveProperty('apiKey');
      expect(cartesiaConfig).toHaveProperty('wsUrl');
      expect(cartesiaConfig).toHaveProperty('model');
      expect(cartesiaConfig).toHaveProperty('voiceId');
      expect(cartesiaConfig).toHaveProperty('sampleRate');
      expect(cartesiaConfig).toHaveProperty('encoding');
    });
  });

  describe('Production Readiness', () => {
    it('should have production-grade voice ID', async () => {
      vi.resetModules();
      const { cartesiaConfig } = await import('@/modules/tts/config/cartesia.config');

      // Voice ID should be a valid UUID format
      expect(cartesiaConfig.voiceId).toMatch(
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
      );
    });

    it('should use production API endpoint', async () => {
      vi.resetModules();
      const { cartesiaConfig } = await import('@/modules/tts/config/cartesia.config');

      expect(cartesiaConfig.wsUrl).toContain('api.cartesia.ai');
      expect(cartesiaConfig.wsUrl).toMatch(/^wss:\/\//); // Secure WebSocket
    });

    it('should have consistent audio format with Deepgram STT', async () => {
      vi.resetModules();
      const { cartesiaConfig } = await import('@/modules/tts/config/cartesia.config');

      // TTS should match Deepgram's 16kHz sample rate
      expect(cartesiaConfig.sampleRate).toBe(16000);
      expect(cartesiaConfig.encoding).toBe('pcm_s16le'); // PCM 16-bit
    });

    it('should have reasonable session limits', async () => {
      vi.resetModules();
      const { cartesiaConfig } = await import('@/modules/tts/config/cartesia.config');

      // 1 hour max session
      expect(cartesiaConfig.maxSessionDuration).toBe(3600000);

      // 50 concurrent sessions (scalable but not excessive)
      expect(cartesiaConfig.maxConcurrentSessions).toBe(50);

      // 8 second keepalive (prevents idle disconnect)
      expect(cartesiaConfig.keepaliveInterval).toBe(8000);
    });
  });
});

describe('TTS Constants', () => {
  it('should export TTS_CONSTANTS', async () => {
    const { TTS_CONSTANTS } = await import('@/modules/tts/config/tts.constants');

    expect(TTS_CONSTANTS).toBeDefined();
    expect(TTS_CONSTANTS.SAMPLE_RATE).toBe(16000);
    expect(TTS_CONSTANTS.CHANNELS).toBe(1);
    expect(TTS_CONSTANTS.BIT_DEPTH).toBe(16);
  });

  it('should have correct audio format constants', async () => {
    const { TTS_CONSTANTS } = await import('@/modules/tts/config/tts.constants');

    expect(TTS_CONSTANTS.CHUNK_DURATION_MS).toBe(100);
    expect(TTS_CONSTANTS.EXPECTED_CHUNK_SAMPLES).toBe(1600);
    expect(TTS_CONSTANTS.EXPECTED_CHUNK_BYTES).toBe(3200);
  });

  it('should have buffer limits', async () => {
    const { TTS_CONSTANTS } = await import('@/modules/tts/config/tts.constants');

    expect(TTS_CONSTANTS.MAX_TEXT_LENGTH).toBe(5000);
    expect(TTS_CONSTANTS.MAX_BUFFER_SIZE).toBe(1048576); // 1MB
  });

  it('should have keepalive interval', async () => {
    const { TTS_CONSTANTS } = await import('@/modules/tts/config/tts.constants');

    expect(TTS_CONSTANTS.KEEPALIVE_INTERVAL_MS).toBe(8000);
  });
});

describe('TTS Retry Configuration', () => {
  it('should export retry config', async () => {
    const { ttsRetryConfig } = await import('@/modules/tts/config/retry.config');

    expect(ttsRetryConfig).toBeDefined();
    expect(ttsRetryConfig.maxRetries).toBe(3);
  });

  it('should have exponential backoff settings', async () => {
    const { ttsRetryConfig } = await import('@/modules/tts/config/retry.config');

    expect(ttsRetryConfig.baseDelay).toBe(1000);
    expect(ttsRetryConfig.maxDelay).toBe(8000);
    expect(ttsRetryConfig.backoffMultiplier).toBe(2);
  });

  it('should define retryable status codes', async () => {
    const { ttsRetryConfig } = await import('@/modules/tts/config/retry.config');

    expect(ttsRetryConfig.retryableStatusCodes).toEqual([500, 502, 503, 504]);
  });

  it('should have connection retry delays', async () => {
    const { ttsRetryConfig } = await import('@/modules/tts/config/retry.config');

    expect(ttsRetryConfig.connectionRetryDelays).toEqual([1000, 2000, 4000]);
    expect(ttsRetryConfig.reconnectionRetryDelays).toEqual([500, 1000, 2000]);
  });
});

describe('TTS Timeout Configuration', () => {
  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it('should export timeout config with defaults', async () => {
    delete process.env.TTS_SYNTHESIS_TIMEOUT_MS;
    delete process.env.TTS_CONNECTION_TIMEOUT_MS;

    vi.resetModules();
    const { ttsTimeoutConfig } = await import('@/modules/tts/config/timeout.config');

    expect(ttsTimeoutConfig.synthesisTimeout).toBe(5000);
    expect(ttsTimeoutConfig.connectionTimeout).toBe(5000);
    expect(ttsTimeoutConfig.reconnectionTimeout).toBe(3000);
  });

  it('should use environment variables for timeouts', async () => {
    process.env.TTS_SYNTHESIS_TIMEOUT_MS = '10000';
    process.env.TTS_CONNECTION_TIMEOUT_MS = '8000';

    vi.resetModules();
    const { ttsTimeoutConfig } = await import('@/modules/tts/config/timeout.config');

    expect(ttsTimeoutConfig.synthesisTimeout).toBe(10000);
    expect(ttsTimeoutConfig.connectionTimeout).toBe(8000);
  });

  it('should have shutdown timeouts', async () => {
    const { ttsTimeoutConfig } = await import('@/modules/tts/config/timeout.config');

    expect(ttsTimeoutConfig.shutdownTimeout).toBe(10000);
    expect(ttsTimeoutConfig.shutdownTimeoutPerSession).toBe(2000);
  });

  it('should have cleanup intervals', async () => {
    delete process.env.TTS_CLEANUP_INTERVAL_MS;
    delete process.env.TTS_SESSION_IDLE_TIMEOUT_MS;
    delete process.env.TTS_SESSION_TIMEOUT_MS;

    vi.resetModules();
    const { ttsTimeoutConfig } = await import('@/modules/tts/config/timeout.config');

    expect(ttsTimeoutConfig.cleanupInterval).toBe(300000); // 5 minutes
    expect(ttsTimeoutConfig.sessionIdleTimeout).toBe(600000); // 10 minutes
    expect(ttsTimeoutConfig.sessionTimeout).toBe(1800000); // 30 minutes
  });

  it('should use environment variables for cleanup', async () => {
    process.env.TTS_CLEANUP_INTERVAL_MS = '60000';
    process.env.TTS_SESSION_IDLE_TIMEOUT_MS = '120000';
    process.env.TTS_SESSION_TIMEOUT_MS = '600000';

    vi.resetModules();
    const { ttsTimeoutConfig } = await import('@/modules/tts/config/timeout.config');

    expect(ttsTimeoutConfig.cleanupInterval).toBe(60000);
    expect(ttsTimeoutConfig.sessionIdleTimeout).toBe(120000);
    expect(ttsTimeoutConfig.sessionTimeout).toBe(600000);
  });

  it('should have max sessions limit', async () => {
    delete process.env.TTS_MAX_CONCURRENT_SESSIONS;

    vi.resetModules();
    const { ttsTimeoutConfig } = await import('@/modules/tts/config/timeout.config');

    expect(ttsTimeoutConfig.maxSessions).toBe(50);
  });
});
