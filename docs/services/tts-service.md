# TTS Service Documentation

**Version**: 1.0.0
**Last Updated**: January 4, 2026
**Status**: Active

## Overview

The **TTS Service** (`TTSService`) provides text-to-speech synthesis capabilities for the Vantum platform using Cartesia's real-time streaming API. It manages WebSocket connections to Cartesia, handles audio resampling (16kHz → 48kHz), and streams synthesized audio chunks to clients via WebSocket.

**Key Features:**
- Real-time streaming TTS synthesis via Cartesia WebSocket
- Audio resampling from 16kHz (Cartesia) to 48kHz (browser playback)
- Persistent WebSocket connections per session
- Automatic reconnection with buffering during downtime
- State machine for synthesis lifecycle management
- Comprehensive error handling and retry logic
- KeepAlive mechanism for connection stability
- Graceful cleanup and resource management

---

## Architecture

### Integration Flow

```
Client (Browser)
    ↓ (transcript via WebSocket)
Vantum Backend
    ↓ (text to synthesize)
Cartesia WebSocket API
    ↓ (16kHz PCM audio chunks)
Audio Resampler (16kHz → 48kHz)
    ↓ (48kHz PCM audio chunks)
Client WebSocket (audio playback)
```

### Session Lifecycle

```
1. createSession(sessionId, config)
   - Creates TTSSession object
   - Connects to Cartesia WebSocket
   - Starts keepAlive mechanism
   - Registers event listeners

2. synthesizeText(sessionId, text, options?)
   - Validates text
   - Generates utteranceId (unique per synthesis)
   - Sends text to Cartesia
   - Streams audio chunks to client
   - Handles completion/errors

3. endSession(sessionId)
   - Closes Cartesia connection
   - Clears buffers
   - Cleans up resources
```

---

## Public API

### Controller Methods

#### `createSession(sessionId: string, config: TTSConfig): Promise<void>`

Creates a new TTS session and establishes WebSocket connection to Cartesia.

**Parameters:**
- `sessionId` (string): Unique session identifier (UUID v7)
- `config` (TTSConfig):
  - `sessionId` (string): Session ID
  - `connectionId` (string): Connection ID
  - `voiceId` (string): Cartesia voice ID (e.g., "694f9389-aac1-45b6-b726-9d9369183238")
  - `language` (string): Language code (e.g., "en")
  - `speed?` (number): Optional speech speed multiplier (default: 1.0)

**Returns:** `Promise<void>` (resolves when connected)

**Throws:**
- `Error` if service is shutting down
- `Error` if Cartesia connection fails
- `Error` if API key is invalid

**Example:**
```typescript
await ttsService.createSession('session-123', {
  sessionId: 'session-123',
  connectionId: 'conn-456',
  voiceId: '694f9389-aac1-45b6-b726-9d9369183238',
  language: 'en',
  speed: 1.0
});
```

---

#### `synthesizeText(sessionId: string, text: string, options?: SynthesisOptions): Promise<void>`

Synthesizes text to speech and streams audio chunks to client.

**Parameters:**
- `sessionId` (string): Session identifier
- `text` (string): Text to synthesize (max 5000 characters)
- `options?` (SynthesisOptions):
  - `voiceId?` (string): Override voice ID for this synthesis
  - `speed?` (number): Override speech speed
  - `language?` (string): Override language

**Returns:** `Promise<void>` (resolves when synthesis starts, NOT when complete)

**Behavior:**
1. Generates unique `utteranceId` for this synthesis (used for all chunks)
2. Validates text (max 5000 chars, auto-truncates)
3. Transitions state: IDLE → GENERATING
4. Sends text to Cartesia
5. Streams audio chunks as they arrive:
   - First chunk: Sends `RESPONSE_START` event
   - Each chunk: Resamples 16kHz → 48kHz, sends `RESPONSE_CHUNK` event
   - Last chunk: Sends `RESPONSE_COMPLETE` event
6. Transitions state: STREAMING → COMPLETED → IDLE

**Events Sent to Client:**
- `RESPONSE_START` - Synthesis started (includes utteranceId, timestamp)
- `RESPONSE_CHUNK` - Audio chunk (includes audio buffer, utteranceId, sampleRate)
- `RESPONSE_COMPLETE` - Synthesis complete (includes utteranceId)
- `ERROR` - Synthesis failed (includes errorType, message, retryable)

**Error Handling:**
- Empty text: Logs warning, returns silently
- Text too long: Auto-truncates to 5000 chars
- Session not found: Logs warning, returns silently
- Session cannot synthesize (wrong state): Buffers text if reconnecting
- Cartesia error: Transitions to ERROR state, sends error event to client

**Example:**
```typescript
await ttsService.synthesizeText('session-123', 'Hello, how can I help you today?');
```

---

#### `cancelSynthesis(sessionId: string): Promise<void>`

Cancels ongoing synthesis (if any).

**Parameters:**
- `sessionId` (string): Session identifier

**Returns:** `Promise<void>`

**Behavior:**
- Only works if state is GENERATING or STREAMING
- Transitions state: GENERATING/STREAMING → CANCELLED → IDLE
- Does NOT send `RESPONSE_COMPLETE` (client should detect cancellation)

**Example:**
```typescript
await ttsService.cancelSynthesis('session-123');
```

---

#### `endSession(sessionId: string): Promise<void>`

Ends TTS session and cleans up all resources.

**Parameters:**
- `sessionId` (string): Session identifier

**Returns:** `Promise<void>`

**Cleanup Actions:**
1. Closes Cartesia WebSocket connection
2. Clears keepAlive interval
3. Clears text buffers
4. Clears reconnection buffer
5. Removes session from registry

**Example:**
```typescript
await ttsService.endSession('session-123');
```

---

#### `hasSession(sessionId: string): boolean`

Check if session exists.

**Parameters:**
- `sessionId` (string): Session identifier

**Returns:** `boolean` - True if session exists

**Example:**
```typescript
if (ttsService.hasSession('session-123')) {
  // Session exists
}
```

---

#### `getMetrics(): TTSServiceMetrics`

Get service-level aggregated metrics.

**Returns:** `TTSServiceMetrics` object containing:
- `activeSessions` (number): Current active sessions
- `totalTextsSynthesized` (number): Total texts synthesized across all sessions
- `totalChunksGenerated` (number): Total audio chunks generated
- `totalChunksSent` (number): Total audio chunks sent to clients
- `totalErrors` (number): Total errors across all sessions
- `totalReconnections` (number): Total reconnection attempts
- `totalSuccessfulReconnections` (number): Successful reconnections
- `totalFailedReconnections` (number): Failed reconnections
- `peakConcurrentSessions` (number): Peak concurrent sessions since start
- `totalSessionsCreated` (number): Total sessions created
- `totalSessionsCleaned` (number): Total sessions cleaned up
- `averageSessionDurationMs` (number): Average session duration
- `memoryUsageEstimateMB` (number): Estimated memory usage

**Example:**
```typescript
const metrics = ttsService.getMetrics();
console.log(`Active sessions: ${metrics.activeSessions}`);
console.log(`Texts synthesized: ${metrics.totalTextsSynthesized}`);
```

---

#### `getSessionMetrics(sessionId: string): TTSSessionMetrics | undefined`

Get session-specific metrics.

**Returns:** `TTSSessionMetrics` object or `undefined` if session not found

**Example:**
```typescript
const metrics = ttsService.getSessionMetrics('session-123');
if (metrics) {
  console.log(`Texts synthesized: ${metrics.textsSynthesized}`);
  console.log(`Errors: ${metrics.errors}`);
}
```

---

#### `isHealthy(): boolean`

Health check for TTS service.

**Returns:** `boolean` - True if API key is configured

---

#### `shutdown(options?: { restart?: boolean }): Promise<void>`

Gracefully shut down TTS service.

**Parameters:**
- `options.restart?` (boolean): If true, restarts service after shutdown (for tests)

**Behavior:**
1. Marks service as shutting down (no new sessions)
2. Stops cleanup timer
3. Closes all active sessions (with timeout per session)
4. Force cleans up any remaining sessions
5. Optionally restarts service

---

## Events Sent to Client

### `RESPONSE_START` (audio.output.start)

Sent when TTS synthesis starts (first audio chunk).

**Payload:**
```typescript
{
  utteranceId: string;  // Unique ID for this synthesis (same for all chunks)
  timestamp: number;    // Unix timestamp (ms)
}
```

---

### `RESPONSE_CHUNK` (audio.output.chunk)

Sent for each audio chunk (multiple per synthesis).

**Payload:**
```typescript
{
  audio: Uint8Array;    // PCM 16-bit audio data
  utteranceId: string;  // SAME utteranceId for all chunks of same response
  sampleRate: number;   // 48000 (browser playback rate)
}
```

**CRITICAL:** All chunks for the same synthesis response share the **SAME utteranceId**. This allows the frontend to:
- Correlate chunks belonging to the same response
- Detect interruptions (new utteranceId = new response)
- Queue audio chunks in correct order

---

### `RESPONSE_COMPLETE` (audio.output.complete)

Sent when TTS synthesis completes (last chunk sent).

**Payload:**
```typescript
{
  utteranceId: string;  // Matches utteranceId from START and CHUNKs
}
```

---

### `ERROR` (error.tts)

Sent when TTS synthesis fails.

**Payload:**
```typescript
{
  errorType: string;    // Error type (see Error Handling section)
  message: string;      // Human-readable error message
  retryable: boolean;   // Can client retry?
}
```

---

## Error Handling

### Error Types

Defined in `TTSErrorType` enum:

- **`NETWORK`**: Network connectivity issue (retryable)
- **`TIMEOUT`**: Request timeout (retryable)
- **`RATE_LIMIT`**: Cartesia rate limit hit (retryable after delay)
- **`AUTH`**: Invalid API key (NOT retryable)
- **`INVALID_REQUEST`**: Bad request (NOT retryable)
- **`FATAL`**: Unrecoverable error (NOT retryable)
- **`UNKNOWN`**: Unknown error (retryable)

### Error Classification

Errors from Cartesia are classified using `classifyCartesiaError()`:

```typescript
{
  type: TTSErrorType;   // Error type enum
  message: string;      // Error message
  retryable: boolean;   // Can retry?
}
```

### Automatic Reconnection

**Triggers:**
- Unexpected Cartesia WebSocket close
- Retryable errors (NETWORK, TIMEOUT, RATE_LIMIT)

**Behavior:**
1. Marks session as reconnecting
2. Buffers texts received during downtime (max 1MB buffer)
3. Attempts reconnection to Cartesia
4. On success:
   - Flushes buffered texts
   - Resumes normal operation
5. On failure:
   - Clears Cartesia client
   - Drops buffered texts (data loss)
   - Session remains disconnected

**Buffering Limits:**
- Max buffer size: 1MB (configurable via `TTS_CONSTANTS.MAX_BUFFER_SIZE`)
- Texts exceeding buffer are dropped with warning

---

## State Machine

### TTSState Enum

States for synthesis lifecycle:

```typescript
enum TTSState {
  IDLE = 'idle',           // Ready for new synthesis
  GENERATING = 'generating', // Waiting for first chunk from Cartesia
  STREAMING = 'streaming',   // Streaming audio chunks to client
  COMPLETED = 'completed',   // Synthesis complete (transitions to IDLE)
  CANCELLED = 'cancelled',   // Synthesis cancelled (transitions to IDLE)
  ERROR = 'error',          // Error occurred (transitions to IDLE)
}
```

### Valid Transitions

```
IDLE → GENERATING
GENERATING → STREAMING | ERROR | CANCELLED
STREAMING → COMPLETED | ERROR | CANCELLED
COMPLETED → IDLE
ERROR → IDLE
CANCELLED → IDLE
```

### State Transition Rules

- **IDLE**: Can start new synthesis
- **GENERATING**: Waiting for first audio chunk from Cartesia
- **STREAMING**: Actively streaming audio chunks to client
- **COMPLETED**: Synthesis finished successfully
- **CANCELLED**: Synthesis cancelled by user
- **ERROR**: Error occurred during synthesis

Invalid transitions are logged as warnings and ignored.

---

## Configuration

### Environment Variables

**Required:**
- `CARTESIA_API_KEY` (string): Cartesia API key

**Optional (uses defaults from config):**
- `TTS_SAMPLE_RATE` (number): Cartesia sample rate (default: 16000 Hz)
- `TTS_MODEL` (string): Cartesia model ID (default: "sonic-english")
- `TTS_LANGUAGE` (string): Default language (default: "en")

### TTS Constants

Defined in `TTS_CONSTANTS`:

```typescript
{
  MAX_TEXT_LENGTH: 5000,        // Max characters per synthesis
  MAX_BUFFER_SIZE: 1048576,     // Max reconnection buffer (1MB)
  KEEPALIVE_INTERVAL_MS: 30000, // KeepAlive ping interval (30s)
}
```

### Timeout Configuration

Defined in `ttsTimeoutConfig`:

```typescript
{
  sessionIdleTimeout: 300000,           // 5 minutes idle → cleanup
  sessionTimeout: 3600000,              // 1 hour max → cleanup
  cleanupInterval: 60000,               // Cleanup check every 60s
  shutdownTimeoutPerSession: 5000,      // 5s timeout per session on shutdown
  maxSessions: 100,                     // Max concurrent sessions (warning)
}
```

---

## Performance & SLAs

### Expected Performance

- **Synthesis Latency**: < 500ms (first chunk)
- **Streaming Latency**: < 100ms (chunk-to-chunk)
- **Reconnection Time**: < 2s (typical)

### Resource Usage

- **Memory per session**: ~50 KB (typical)
- **Peak concurrent sessions**: 100 (configurable)
- **Cleanup frequency**: Every 60 seconds

### Monitoring Metrics

Key metrics to monitor:

1. **`activeSessions`**: Current active sessions
2. **`totalErrors`**: Error rate
3. **`totalReconnections`**: Reconnection frequency
4. **`averageSynthesisTimeMs`**: Synthesis performance
5. **`memoryUsageEstimateMB`**: Memory consumption

**Alerts:**
- `activeSessions > 100`: High load
- `totalErrors / totalTextsSynthesized > 0.05`: High error rate (5%)
- `failedReconnections / reconnections > 0.3`: Connection instability (30%)

---

## Best Practices

### 1. Text Validation

Always validate text before synthesis:
- Max 5000 characters (auto-truncated)
- Non-empty text (silently returns if empty)

### 2. Session Management

- Create session once per user call
- Reuse session for multiple synthesis requests
- End session when call ends

### 3. Error Handling

- Check `retryable` flag in error events
- Implement exponential backoff for retries
- Handle rate limits gracefully (wait before retry)

### 4. Resource Cleanup

- Always call `endSession()` when done
- Don't rely on automatic cleanup (idle timeout)

### 5. Reconnection Handling

- Text sent during reconnection is buffered (max 1MB)
- Buffer overflows are logged and text is dropped
- Client should implement timeout for synthesis

---

## Common Issues & Troubleshooting

### Issue: No audio playback on client

**Symptoms:** `RESPONSE_START` and `RESPONSE_CHUNK` events sent, but no audio heard.

**Possible Causes:**
1. **Wrong sample rate**: Verify frontend expects 48kHz PCM
2. **Audio format mismatch**: Ensure PCM s16le format
3. **Incorrect utteranceId handling**: All chunks must share same utteranceId

**Solution:**
- Check frontend audio playback implementation
- Verify `utteranceId` is consistent across chunks (fixed in P0-1)
- Check browser console for audio decoding errors

---

### Issue: Synthesis timeout

**Symptoms:** `RESPONSE_START` sent, but no chunks arrive.

**Possible Causes:**
1. **Cartesia API slow**: Network latency or API overload
2. **Resampling bottleneck**: Audio resampler service slow
3. **WebSocket congestion**: Too many concurrent sessions

**Solution:**
- Check Cartesia API status
- Monitor `averageSynthesisTimeMs` metric
- Reduce concurrent sessions if needed

---

### Issue: Frequent reconnections

**Symptoms:** High `totalReconnections` metric.

**Possible Causes:**
1. **Network instability**: Poor connection to Cartesia
2. **Cartesia API issues**: Upstream problems
3. **KeepAlive failures**: Ping not reaching Cartesia

**Solution:**
- Check network connectivity
- Monitor Cartesia API status
- Increase `KEEPALIVE_INTERVAL_MS` if needed

---

### Issue: Memory leak

**Symptoms:** `memoryUsageEstimateMB` continuously increasing.

**Possible Causes:**
1. **Sessions not cleaned up**: `endSession()` not called
2. **Reconnection buffer not cleared**: Buffers accumulating
3. **Event listeners not removed**: Memory leak in event handlers

**Solution:**
- Ensure `endSession()` is called on disconnect
- Monitor `totalSessionsCleaned` vs `totalSessionsCreated`
- Check for orphaned sessions in metrics

---

## Testing

### Unit Tests

Test TTS service in isolation:
- Mock Cartesia SDK
- Mock WebSocket connections
- Mock audio resampler

### Integration Tests

Test end-to-end flow:
- Create session → Synthesize text → Verify events sent
- Test reconnection logic
- Test error handling

### E2E Tests

Test with real Cartesia API:
- Verify audio quality
- Measure latency
- Test under load

---

## Related Documentation

- **WebSocket Protocol**: `/docs/protocol/websocket-protocol.md`
- **Cartesia Integration**: `/docs/integrations/cartesia.md`
- **Audio Resampler Service**: `/docs/services/audio-resampler-service.md`
- **Architecture Overview**: `/docs/architecture/architecture.md`

---

**Last Updated:** January 4, 2026
**Version:** 1.0.0
**Maintained By:** Backend Development Team
