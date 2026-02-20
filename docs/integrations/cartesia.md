# Cartesia TTS Integration Guide

**Version**: 1.3.0
**Last Updated**: January 28, 2026
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
5. [SSML Support](#ssml-support)
6. [Error Handling](#error-handling)
7. [Rate Limits](#rate-limits)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)

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

**Vantum Curated Voices** (Production-Ready):

| Voice              | Gender | ID                                     | Description                                        |
| ------------------ | ------ | -------------------------------------- | -------------------------------------------------- |
| **Kyle** (Default) | Male   | `c961b81c-a935-4c17-bfb3-ba2239de8c2f` | Approachable Friend - Natural, friendly male voice |
| **Tessa**          | Female | `6ccbfb76-1fc6-48f7-b71d-91ac6298247b` | Kind Companion - Warm, professional female voice   |

**Current Default**: Kyle (male voice)

**Switching Voices**:

To change the default voice, update `cartesia.config.ts`:

```typescript
// Use Kyle (male - default)
voiceId: 'c961b81c-a935-4c17-bfb3-ba2239de8c2f';

// OR use Tessa (female)
voiceId: '6ccbfb76-1fc6-48f7-b71d-91ac6298247b';
```

**Runtime Voice Override**:

You can override the voice per synthesis call:

```typescript
await ttsService.synthesizeText(sessionId, text, {
  voiceId: '6ccbfb76-1fc6-48f7-b71d-91ac6298247b', // Use Tessa instead
});
```

**Voice Selection Rationale**:

- Both voices excel at emotional expression
- Natural conversational tone suitable for cold calls
- Clear pronunciation and professional delivery
- Tested with various emotional contexts

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
  48000 // target sample rate
);
```

**Resampling Performance**: <1ms per 100ms audio chunk (negligible latency)

---

## SSML Support

**Status**: ✅ **ENABLED** (January 28, 2026)

### Overview

Cartesia Sonic-3 models support **SSML-like markup tags** for controlling emotion, pauses, speed, and volume directly in the text. This enables highly expressive, natural-sounding voice responses for cold outreach calls.

### Available SSML Tags

#### 1. Emotion Tags

Control emotional expression in speech:

```typescript
<emotion value="excited"/>I have great news!</emotion>
<emotion value="curious"/>How are you doing today?</emotion>
<emotion value="content"/>I understand your concern.</emotion>
```

**Supported Emotions** (60+ total):

- `excited` - High energy, enthusiasm
- `curious` - Inquisitive, interested
- `content` - Satisfied, understanding
- `sad` - Empathetic, somber
- `angry` - Frustrated, upset (use sparingly)
- `surprised` - Unexpected, amazed

**Best Practices**:

- Apply at sentence/phrase boundaries, not mid-sentence
- Don't overuse (sounds unnatural)
- Best with emotive voices (Kyle, Tessa)
- Always close with `</emotion>`

#### 2. Break/Pause Tags

Insert pauses for natural conversation rhythm:

```typescript
Hello. <break time="500ms"/> How can I help you?
Great question! <break time="800ms"/> Let me explain.
```

**Guidelines**:

- After questions: 400-600ms
- Topic transitions: 800ms-1s
- Thinking pauses: 300-500ms
- Between sentences: 200-400ms

**Units**: `ms` (milliseconds) or `s` (seconds)

#### 3. Speed Control

Adjust speaking rate:

```typescript
<speed ratio="1.2"/>I speak faster when excited!</speed>
<speed ratio="0.8"/>Slow down for emphasis.</speed>
```

**Range**: 0.6 to 1.5 (default: 1.0)

**Use Cases**:

- Important points: 0.8-0.9 (slower)
- Excitement: 1.1-1.2 (faster)
- Default: 1.0

#### 4. Volume Control

Adjust loudness:

```typescript
<volume ratio="0.8"/>I'll speak softly now.</volume>
<volume ratio="1.3"/>Important announcement!</volume>
```

**Range**: 0.5 to 2.0 (default: 1.0)

### Integration with ||BREAK|| Markers

Vantum uses **both** `||BREAK||` and SSML tags for different purposes:

| Feature                | Purpose                          | Example                                             |
| ---------------------- | -------------------------------- | --------------------------------------------------- | --- | --- | ---------------------------------------------- | -------- | --- | ----- | --- | -------------- |
| `                      |                                  | BREAK                                               |     | `   | Semantic chunk boundaries (LLM → TTS pipeline) | `"Hello. |     | BREAK |     | How are you?"` |
| `<break time="Xms"/>`  | Pauses within chunks (TTS audio) | `"Hello. <break time='500ms'/> How are you?"`       |
| `<emotion value="X"/>` | Emotional expression             | `"<emotion value='excited'/>Great news!</emotion>"` |

**Combined Example**:

```typescript
"<emotion value='content'/>Hi, this is Alex from Vantum. <break time='500ms'/> <emotion value='curious'/>Do you have a moment?||BREAK||<emotion value='excited'/>I have exciting news about your cold outreach!</emotion>";
```

### Character Limits

SSML tags **count toward** Cartesia's 5,000 character limit per request.

**Example**:

```typescript
text = "<emotion value='excited'/>Hello!</emotion>"; // 53 characters (includes markup)
```

**Tip**: Minimize spaces around tags to save characters.

### Performance Impact

- **Latency**: Negligible (~0ms overhead, parsing is Cartesia-side)
- **Token Cost**: SSML markup counts as characters
- **Memory**: ~30-50 bytes per emotion tag

### Limitations

- **Emotion changes**: Apply at natural boundaries, not mid-sentence
- **Token streaming**: Don't use token-by-token streaming with SSML (buffer complete sentences)
- **Validation**: Malformed SSML may cause synthesis errors

### Testing SSML

**Manual Test**:

```bash
# Test emotion tag
curl -X POST http://localhost:3001/api/tts/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session",
    "text": "<emotion value=\"excited\"/>Hello from Vantum!</emotion>"
  }'
```

### System Prompt Integration

The LLM system prompt in `/src/modules/llm/config/prompts.config.ts` now includes comprehensive SSML instructions. The LLM automatically generates emotional, expressive responses for cold outreach calls.

**Example LLM Output**:

```
<emotion value='content'/>Hi, this is Alex from Vantum. <break time='500ms'/> <emotion value='curious'/>Do you have a moment to chat?||BREAK||<emotion value='excited'/>I have exciting news about your cold outreach results!</emotion>
```

### References

- [Cartesia SSML Tags Documentation](https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags)
- [Cartesia Emotion Control Guide](https://docs.cartesia.ai/2024-11-13/build-with-cartesia/capability-guides/control-speed-and-emotion)

---

## Error Handling

### Error Types

Defined in `TTSErrorType` enum:

```typescript
enum TTSErrorType {
  NETWORK = 'network', // Network connectivity issue
  TIMEOUT = 'timeout', // Request timeout
  RATE_LIMIT = 'rate_limit', // Rate limit hit
  AUTH = 'auth', // Invalid API key
  INVALID_REQUEST = 'invalid_request', // Bad request
  FATAL = 'fatal', // Unrecoverable error
  UNKNOWN = 'unknown', // Unknown error
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
async function sendWithRetry(websocket: WebSocket, data: any, maxRetries = 3): Promise<void> {
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
- SSML tags count toward limit

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
- **LLM Prompts**: `/src/modules/llm/config/prompts.config.ts` (SSML instructions)

---

**Last Updated**: January 28, 2026
**Version**: 1.3.0
**Cartesia SDK Version**: @cartesia/cartesia-js 2.2.9
**Maintained By**: Backend Development Team
