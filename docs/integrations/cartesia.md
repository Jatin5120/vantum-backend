# Cartesia TTS Integration Guide

**Version**: 1.2.0
**Last Updated**: January 4, 2026
**Status**: Active (Complete)

**🔒 AUTHORITATIVE REFERENCE**: This document is the official guide for Cartesia integration in Vantum.

**Naming Convention**: USE CAMELCASE
- TypeScript SDK API: `modelId`, `outputFormat`, `sampleRate` ✅
- Wire Protocol: `model_id`, `output_format`, `sample_rate` (automatic SDK conversion)

**If you find conflicting information in other documents, THIS document is correct.**

---

## Overview

This document provides comprehensive guidance for integrating **Cartesia's real-time Text-to-Speech (TTS) API** with the Vantum platform. Cartesia provides ultra-realistic voice synthesis with low latency and streaming capabilities.

**Integration Status**: ✅ **COMPLETE** (January 2026)

---

## Table of Contents

1. [Authentication Setup](#authentication-setup)
2. [Configuration](#configuration)
3. [WebSocket Connection](#websocket-connection)
4. [Audio Format](#audio-format)
5. [Error Handling](#error-handling)
6. [Rate Limits](#rate-limits)
7. [Troubleshooting](#troubleshooting)
8. [Best Practices](#best-practices)

---

## Authentication Setup

### Step 1: Obtain API Key

1. Sign up for Cartesia account: https://cartesia.ai
2. Navigate to API Keys section
3. Generate a new API key
4. Copy the API key (format: `sk-...`)

### Step 2: Configure Environment Variable

Add API key to your environment configuration:

**Development (.env.development)**:
```bash
CARTESIA_API_KEY=sk-your-development-key-here
```

**Production (.env.production)**:
```bash
CARTESIA_API_KEY=sk-your-production-key-here
```

**CRITICAL**: NEVER commit API keys to version control. Use `.env.example` for templates.

### Step 3: Verify API Key in Code

The TTS service automatically loads the API key from environment:

```typescript
import { Cartesia } from '@cartesia/cartesia-js';

const apiKey = process.env.CARTESIA_API_KEY;
if (!apiKey) {
  throw new Error('CARTESIA_API_KEY not configured');
}

const cartesia = new Cartesia({ apiKey });
```

---

## Configuration

### Environment Variables

**Required**:
- `CARTESIA_API_KEY` (string): Your Cartesia API key

**Optional** (uses defaults from TTS config):
- `TTS_SAMPLE_RATE` (number): Sample rate (default: 16000 Hz)
- `TTS_MODEL` (string): Model ID (default: "sonic-english")
- `TTS_LANGUAGE` (string): Language code (default: "en")

### TTS Configuration

Located in `/vantum-backend/src/modules/tts/config/tts.config.ts`:

```typescript
export const TTS_CONFIG = {
  SAMPLE_RATE: parseInt(process.env.TTS_SAMPLE_RATE || '16000', 10),
  MODEL: process.env.TTS_MODEL || 'sonic-english',
  LANGUAGE: process.env.TTS_LANGUAGE || 'en',
  OUTPUT_FORMAT: {
    container: 'raw',
    encoding: 'pcm_s16le',
    sampleRate: 16000,
  },
};
```

### Voice Configuration

Voices are configured per-session when creating TTS session:

```typescript
const voiceConfig = {
  voiceId: '694f9389-aac1-45b6-b726-9d9369183238', // Barbershop Man voice
  language: 'en',
  speed: 1.0, // Normal speed
};
```

**Available Voices**: See [Cartesia Voice Library](https://docs.cartesia.ai/voices)

---

## WebSocket Connection

### SDK Connection Management

We use the official `@cartesia/cartesia-js` SDK (v2.2.9) for WebSocket connections.

**Why SDK over Raw WebSocket**: See [ADR-014: Cartesia SDK vs Raw WebSocket](/docs/architecture/decisions.md#adr-014-cartesia-sdk-vs-raw-websocket)

### Connection Lifecycle

```typescript
import { Cartesia } from '@cartesia/cartesia-js';

// 1. Create Cartesia client
const cartesia = new Cartesia({ apiKey: process.env.CARTESIA_API_KEY });

// 2. Create WebSocket connection
const websocket = cartesia.tts.websocket({
  container: 'raw',
  encoding: 'pcm_s16le',
  sampleRate: 16000,
});

// 3. Listen for events
websocket.on('message', (message) => {
  if (message.type === 'chunk') {
    // Handle audio chunk
    const audioData = message.data;
  } else if (message.type === 'done') {
    // Synthesis complete
  }
});

websocket.on('error', (error) => {
  // Handle error
});

websocket.on('close', (code, reason) => {
  // Handle close
});

// 4. Send text to synthesize
await websocket.send({
  modelId: 'sonic-english',
  voice: { id: voiceId, mode: 'id' },
  transcript: 'Hello, how can I help you today?',
  language: 'en',
});

// 5. Close connection when done
websocket.close();
```

### Session-Level Persistent Connections

Each user session maintains one persistent WebSocket connection to Cartesia:

- **Creation**: When TTS session is created
- **Lifetime**: Throughout entire call/session
- **Closure**: When session ends

**Rationale**: Persistent connections eliminate connection overhead and reduce latency.

### KeepAlive Mechanism

To prevent idle timeouts, we send periodic keepalive pings:

```typescript
const KEEPALIVE_INTERVAL_MS = 30000; // 30 seconds

const keepAliveInterval = setInterval(() => {
  if (websocket.readyState === WebSocket.OPEN) {
    // SDK handles keepalive automatically
    logger.debug('KeepAlive ping sent', { sessionId });
  }
}, KEEPALIVE_INTERVAL_MS);

// Clear interval on session end
clearInterval(keepAliveInterval);
```

### Reconnection Logic

Automatic reconnection is implemented for transient failures:

**Triggers**:
- Unexpected WebSocket close
- Network errors
- Retryable errors (5xx)

**Behavior**:
1. Mark session as reconnecting
2. Buffer texts received during downtime (max 1MB)
3. Attempt reconnection to Cartesia
4. On success: Flush buffered texts
5. On failure: Drop buffers, session remains disconnected

**Buffer Limits**:
- Max buffer size: 1MB
- Texts exceeding buffer are dropped with warning

---

## Audio Format

### Input Format (to Cartesia)

Cartesia accepts text input:

```typescript
{
  modelId: 'sonic-english',
  voice: { id: voiceId, mode: 'id' },
  transcript: 'Text to synthesize',
  language: 'en',
}
```

### Output Format (from Cartesia)

Cartesia outputs PCM audio:

**Audio Specifications**:
- **Format**: PCM (Pulse Code Modulation)
- **Encoding**: `pcm_s16le` (16-bit signed little-endian)
- **Sample Rate**: 16000 Hz (16kHz)
- **Channels**: 1 (mono)
- **Bit Depth**: 16 bits per sample

**Example Audio Chunk**:
```typescript
{
  type: 'chunk',
  data: Uint8Array, // Raw PCM audio data
  stepTime: number, // Timestamp in ms
}
```

### Audio Resampling

Cartesia outputs 16kHz audio, but browsers expect 48kHz. We use the Audio Resampler service:

```typescript
import { audioResampler } from '@/modules/audio/services/audio-resampler.service';

// Resample 16kHz → 48kHz
const resampled48kHz = await audioResampler.resample(
  audio16kHz,
  16000, // source sample rate
  48000  // target sample rate
);
```

**Resampling Performance**: <1ms per 100ms audio chunk (negligible latency)

---

## Error Handling

### Error Types

Defined in `TTSErrorType` enum:

```typescript
enum TTSErrorType {
  NETWORK = 'network',           // Network connectivity issue
  TIMEOUT = 'timeout',           // Request timeout
  RATE_LIMIT = 'rate_limit',     // Rate limit hit
  AUTH = 'auth',                 // Invalid API key
  INVALID_REQUEST = 'invalid_request', // Bad request
  FATAL = 'fatal',               // Unrecoverable error
  UNKNOWN = 'unknown',           // Unknown error
}
```

### Error Classification

Cartesia errors are classified using `classifyCartesiaError()`:

```typescript
function classifyCartesiaError(error: any): {
  type: TTSErrorType;
  message: string;
  retryable: boolean;
} {
  // Network errors (retryable)
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    return { type: TTSErrorType.NETWORK, message: error.message, retryable: true };
  }

  // Rate limit (retryable after delay)
  if (error.statusCode === 429) {
    return { type: TTSErrorType.RATE_LIMIT, message: 'Rate limit exceeded', retryable: true };
  }

  // Auth error (NOT retryable)
  if (error.statusCode === 401 || error.statusCode === 403) {
    return { type: TTSErrorType.AUTH, message: 'Invalid API key', retryable: false };
  }

  // Invalid request (NOT retryable)
  if (error.statusCode >= 400 && error.statusCode < 500) {
    return { type: TTSErrorType.INVALID_REQUEST, message: error.message, retryable: false };
  }

  // Server error (retryable)
  if (error.statusCode >= 500) {
    return { type: TTSErrorType.FATAL, message: error.message, retryable: true };
  }

  // Unknown error (retryable)
  return { type: TTSErrorType.UNKNOWN, message: error.message, retryable: true };
}
```

### Retry Logic

For retryable errors, implement exponential backoff:

```typescript
async function sendWithRetry(
  websocket: WebSocket,
  data: any,
  maxRetries = 3
): Promise<void> {
  let retries = 0;
  const backoffMs = [1000, 2000, 4000]; // 1s, 2s, 4s

  while (retries < maxRetries) {
    try {
      await websocket.send(data);
      return; // Success
    } catch (error) {
      const classified = classifyCartesiaError(error);

      if (!classified.retryable) {
        throw error; // Don't retry non-retryable errors
      }

      retries++;
      if (retries >= maxRetries) {
        throw error; // Max retries exceeded
      }

      const delay = backoffMs[retries - 1];
      logger.warn('Retrying after error', { error: classified.message, retries, delay });
      await sleep(delay);
    }
  }
}
```

### Circuit Breaker

For repeated failures, implement circuit breaker to prevent cascading failures:

```typescript
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold = 5;
  private readonly cooldownMs = 60000; // 60 seconds

  async call<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.isOpen()) {
      throw new Error('Circuit breaker is open');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private isOpen(): boolean {
    const now = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      if (now - this.lastFailureTime < this.cooldownMs) {
        return true; // Circuit is open
      } else {
        this.reset(); // Cooldown period passed, try again
      }
    }
    return false;
  }

  private onSuccess(): void {
    this.failureCount = 0;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
  }

  private reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}
```

---

## Rate Limits

### Cartesia Rate Limits

Cartesia enforces rate limits:

- **Requests per minute**: Varies by plan
- **Concurrent connections**: Varies by plan
- **Characters per request**: 5000 max

**Response when rate limited**:
- HTTP Status: `429 Too Many Requests`
- Header: `Retry-After: <seconds>`

### Rate Limit Handling

When rate limited:

1. **Respect `Retry-After` header**: Wait specified duration before retrying
2. **Exponential backoff**: If no header, start at 2s and double each retry
3. **Notify client**: Send error event with `retryable: true`
4. **Don't spam API**: Max 3 retries, then fail

```typescript
async function handleRateLimit(error: any): Promise<void> {
  const retryAfter = error.headers?.['retry-after'];
  const delayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000;

  logger.warn('Rate limit hit, waiting before retry', { delayMs });
  await sleep(delayMs);
}
```

---

## Troubleshooting

### Issue: Connection Timeout

**Symptoms**: WebSocket connection never opens, timeout error.

**Possible Causes**:
1. Invalid API key
2. Network connectivity issue
3. Firewall blocking WebSocket

**Solution**:
- Verify API key is correct
- Check network connectivity
- Ensure WebSocket port is open (usually 443)

---

### Issue: Audio Playback Garbled

**Symptoms**: Audio plays but sounds distorted or choppy.

**Possible Causes**:
1. Wrong sample rate (not resampled to 48kHz)
2. Incorrect audio format (not PCM s16le)
3. Audio chunks out of order

**Solution**:
- Verify resampling is applied (16kHz → 48kHz)
- Check audio format matches browser expectations
- Ensure chunks are queued by `utteranceId`

---

### Issue: High Latency

**Symptoms**: Delay between text submission and audio playback.

**Possible Causes**:
1. Network latency to Cartesia API
2. Resampling bottleneck
3. Too many concurrent sessions

**Solution**:
- Monitor network latency
- Check resampling performance
- Reduce concurrent sessions if needed

---

### Issue: Frequent Disconnections

**Symptoms**: WebSocket frequently closes unexpectedly.

**Possible Causes**:
1. Idle timeout (no keepalive)
2. Network instability
3. Cartesia API issues

**Solution**:
- Ensure keepalive mechanism is active
- Check network stability
- Monitor Cartesia API status

---

## Best Practices

### 1. Use SDK, Not Raw WebSocket

Always use `@cartesia/cartesia-js` SDK:
- Handles protocol automatically
- Built-in error handling
- TypeScript support
- Maintained by Cartesia

**See**: [ADR-014: Cartesia SDK vs Raw WebSocket](/docs/architecture/decisions.md#adr-014-cartesia-sdk-vs-raw-websocket)

### 2. Persistent Connections

Maintain one connection per session:
- Create connection on session start
- Reuse for all synthesis requests
- Close on session end

### 3. Implement KeepAlive

Send keepalive pings every 30 seconds:
- Prevents idle timeouts
- Detects dead connections early

### 4. Handle Reconnection

Implement automatic reconnection:
- Buffer texts during downtime
- Flush on reconnect success
- Drop buffers if reconnect fails

### 5. Validate Text Input

Before sending to Cartesia:
- Max 5000 characters (truncate if longer)
- Non-empty text (skip if empty)

### 6. Monitor Metrics

Track key metrics:
- Active sessions
- Error rate
- Reconnection frequency
- Average synthesis time

### 7. Implement Circuit Breaker

Prevent cascading failures:
- Stop calling API after N failures (e.g., 5)
- Wait cooldown period (e.g., 60s)
- Attempt recovery after cooldown

---

## Related Documentation

- **TTS Service API**: `/docs/services/tts-service.md`
- **WebSocket Protocol**: `/docs/protocol/websocket-protocol.md`
- **Audio Resampler**: `/docs/services/audio-resampler-service.md`
- **Error Handling**: `/docs/architecture/error-handling.md`
- **SDK Decision**: `/docs/architecture/cartesia-sdk-decision.md` (camelCase vs snake_case)

---

**Last Updated**: January 4, 2026
**Version**: 1.2.0
**Cartesia SDK Version**: @cartesia/cartesia-js 2.2.9
**Maintained By**: Backend Development Team
