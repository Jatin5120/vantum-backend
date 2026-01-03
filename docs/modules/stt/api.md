# STT Module API Documentation

**Version**: 1.0.0
**Last Updated**: 2024-12-24
**Status**: Phase 1 Complete (Basic Integration)

---

## Overview

The STT (Speech-to-Text) module provides Deepgram integration for real-time audio transcription. It is completely independent from the socket module with clean API boundaries.

**Module Location**: `/src/modules/stt/`

**Key Features**:
- Real-time audio streaming to Deepgram
- Session-based transcript accumulation
- Automatic connection management
- Clean separation from socket module
- Type-safe public API

---

## Architecture

### Module Structure

```
src/modules/stt/
├── controllers/          # Public API (exposed to other modules)
│   └── stt.controller.ts
├── services/            # Internal business logic
│   ├── stt.service.ts
│   └── stt-session.service.ts
├── config/              # Configuration
│   ├── deepgram.config.ts
│   ├── retry.config.ts
│   └── timeout.config.ts
├── types/               # Type definitions
│   ├── stt-session.types.ts
│   ├── transcript.types.ts
│   └── error.types.ts
└── index.ts             # Public module exports
```

### Module Boundaries

**Clean Separation**:
- **socket module** → imports from `@/modules/stt` (public API only)
- **stt module** → never imports from socket module (no reverse dependency)
- Coordinated via `sessionId` (shared identifier)

**Import Pattern**:
```typescript
// ✅ CORRECT: Socket module imports from public API
import { sttController } from '@/modules/stt';

// ❌ WRONG: Never import from internal stt files
import { STTService } from '@/modules/stt/services/stt.service';
```

---

## Public API

### STTController

The `STTController` class provides the public API gateway for the STT module.

**Import**:
```typescript
import { sttController } from '@/modules/stt';
```

**Singleton Instance**: Yes (exported as `sttController`)

---

### Methods

#### `createSession(sessionId: string, config: STTConfig): Promise<void>`

Creates a new STT session and establishes Deepgram WebSocket connection.

**Parameters**:
- `sessionId` (string): Unique session identifier (from socket module)
- `config` (STTConfig): Session configuration

**STTConfig Interface**:
```typescript
interface STTConfig {
  sessionId: string;       // Session identifier
  connectionId: string;    // WebSocket connection ID
  samplingRate: number;    // Audio sample rate (8000-48000)
  language?: string;       // Language code (default: 'en-US')
}
```

**Returns**: `Promise<void>`

**Throws**: Error if Deepgram connection fails or invalid config

**Example**:
```typescript
try {
  await sttController.createSession(session.sessionId, {
    sessionId: session.sessionId,
    connectionId,
    samplingRate: 16000,
    language: 'en-US',
  });
  logger.info('STT session initialized');
} catch (error) {
  logger.error('Failed to initialize STT', { error });
  // Handle error (send to client, etc.)
}
```

---

#### `forwardChunk(sessionId: string, audioChunk: Uint8Array): Promise<void>`

Forwards an audio chunk to Deepgram for transcription.

**Parameters**:
- `sessionId` (string): Session identifier
- `audioChunk` (Uint8Array): Raw audio data (Int16 PCM)

**Returns**: `Promise<void>`

**Behavior**:
- Non-blocking (fire-and-forget)
- Validates session exists
- Updates session activity timestamp
- Converts Uint8Array to ArrayBuffer for Deepgram

**Example**:
```typescript
// In audio.handler.ts
if (!isMuted) {
  await sttController.forwardChunk(session.sessionId, audioChunk);
}
```

---

#### `endSession(sessionId: string): Promise<string>`

Ends an STT session and returns the final accumulated transcript.

**Parameters**:
- `sessionId` (string): Session identifier

**Returns**: `Promise<string>` - Final accumulated transcript (trimmed)

**Behavior**:
- Closes Deepgram WebSocket connection
- Retrieves final transcript
- Cleans up session state
- Returns empty string on error (graceful degradation)

**Example**:
```typescript
const finalTranscript = await sttController.endSession(session.sessionId);
logger.info('STT session ended', {
  sessionId,
  transcriptLength: finalTranscript.length,
  transcript: finalTranscript.substring(0, 100), // First 100 chars
});
// TODO: Store transcript for LLM (Phase 5)
```

---

#### `getMetrics(): STTServiceMetrics`

Returns service-level metrics for monitoring.

**Returns**: `STTServiceMetrics`

**STTServiceMetrics Interface**:
```typescript
interface STTServiceMetrics {
  activeSessions: number;           // Current active sessions
  totalChunksForwarded: number;     // Total audio chunks sent
  totalTranscriptsReceived: number; // Total transcripts received
  totalErrors: number;              // Total errors encountered
  totalReconnections: number;       // Total reconnections attempted
}
```

**Example**:
```typescript
const metrics = sttController.getMetrics();
logger.info('STT service metrics', metrics);
```

---

#### `getSessionMetrics(sessionId: string): STTSessionMetrics | undefined`

Returns session-level metrics for a specific session.

**Parameters**:
- `sessionId` (string): Session identifier

**Returns**: `STTSessionMetrics | undefined` (undefined if session not found)

**STTSessionMetrics Interface**:
```typescript
interface STTSessionMetrics {
  sessionId: string;
  duration: number;                // Session duration (ms)
  chunksForwarded: number;         // Audio chunks sent
  transcriptsReceived: number;     // Transcripts received
  reconnections: number;           // Reconnection attempts
  errors: number;                  // Errors encountered
  finalTranscriptLength: number;   // Accumulated transcript length
  connectionState: ConnectionState; // Current connection state
}

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';
```

**Example**:
```typescript
const metrics = sttController.getSessionMetrics(sessionId);
if (metrics) {
  logger.debug('Session metrics', metrics);
}
```

---

#### `isHealthy(): boolean`

Health check for STT service.

**Returns**: `boolean` - true if Deepgram API key is configured

**Example**:
```typescript
if (!sttController.isHealthy()) {
  logger.warn('STT service not healthy (missing API key)');
}
```

---

#### `shutdown(): Promise<void>`

Gracefully shuts down the STT service.

**Returns**: `Promise<void>`

**Behavior**:
- Closes all active Deepgram connections
- Clears all session state
- Stops cleanup timer

**Example**:
```typescript
// In main server shutdown
await sttController.shutdown();
```

---

## Integration with Socket Module

### Audio Start Handler

```typescript
// In socket/handlers/audio.handler.ts
import { sttController } from '@/modules/stt';

const USE_STT = !!process.env.DEEPGRAM_API_KEY;

export async function handleAudioStart(ws: WebSocket, data: UnpackedMessage, connectionId: string) {
  // ... session validation ...

  if (USE_STT) {
    // NEW: Initialize STT session
    try {
      await sttController.createSession(session.sessionId, {
        sessionId: session.sessionId,
        connectionId,
        samplingRate,
        language: payload.language || 'en-US',
      });
      logger.info('STT session initialized', { sessionId: session.sessionId });
    } catch (error) {
      logger.error('Failed to initialize STT', { sessionId, error });
      sendError(ws, ErrorCode.INTERNAL_ERROR, 'Failed to initialize transcription', VOICECHAT_EVENTS.AUDIO_START, session.sessionId, data.eventId);
      return;
    }
  } else {
    // LEGACY: Echo testing
    audioBufferService.initializeBuffer(session.sessionId, samplingRate, startEventId);
  }

  // ... send ACK ...
}
```

### Audio Chunk Handler

```typescript
export async function handleAudioChunk(ws: WebSocket, data: UnpackedMessage, connectionId: string) {
  // ... session validation, payload extraction ...

  if (USE_STT) {
    // NEW: Forward to STT
    if (!isMuted) {
      await sttController.forwardChunk(session.sessionId, audioChunk);
    }
  } else {
    // LEGACY: Buffer for echo
    if (!isMuted) {
      audioBufferService.addChunk(session.sessionId, audioChunk);
    }
  }
}
```

### Audio End Handler

```typescript
export async function handleAudioEnd(ws: WebSocket, data: UnpackedMessage, connectionId: string) {
  // ... session state update ...

  if (USE_STT) {
    // NEW: End STT session and get transcript
    const finalTranscript = await sttController.endSession(session.sessionId);
    logger.info('STT session ended', {
      sessionId: session.sessionId,
      transcriptLength: finalTranscript.length,
      transcript: finalTranscript.substring(0, 100),
    });
    // TODO: Store transcript for LLM (Phase 5)
  } else {
    // LEGACY: Echo audio
    await streamEchoedAudio(session.sessionId, samplingRate);
    audioBufferService.clearBuffer(session.sessionId);
  }

  // ... send ACK, cleanup WebSocket ...
}
```

---

## Configuration

### Environment Variables

```bash
# Required for STT module to function
DEEPGRAM_API_KEY=your_deepgram_api_key

# Optional (with defaults in config)
STT_MODEL=nova-2
STT_LANGUAGE=en-US
```

### Deepgram Configuration

**File**: `/src/modules/stt/config/deepgram.config.ts`

```typescript
export const DEEPGRAM_CONFIG = {
  model: 'nova-2',
  language: 'en-US',
  smart_format: true,
  interim_results: true,
  encoding: 'linear16',
  sample_rate: 16000,
  channels: 1,
  punctuate: true,
};
```

---

## Type Definitions

### Exported Types

```typescript
// Available via `import type { ... } from '@/modules/stt'`

interface STTConfig {
  sessionId: string;
  connectionId: string;
  samplingRate: number;
  language?: string;
}

interface STTServiceMetrics {
  activeSessions: number;
  totalChunksForwarded: number;
  totalTranscriptsReceived: number;
  totalErrors: number;
  totalReconnections: number;
}

interface STTSessionMetrics {
  sessionId: string;
  duration: number;
  chunksForwarded: number;
  transcriptsReceived: number;
  reconnections: number;
  errors: number;
  finalTranscriptLength: number;
  connectionState: ConnectionState;
}

interface TranscriptSegment {
  text: string;
  timestamp: number;
  confidence: number;
  isFinal: boolean;
}

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';
```

---

## Error Handling

### Error Propagation

**Fatal Errors** (propagated to caller):
- Invalid configuration
- Deepgram API authentication failure (401, 403)
- Deepgram API not found (404)

**Non-Fatal Errors** (handled internally):
- Deepgram connection timeout (retried)
- Mid-stream disconnection (reconnected)
- Network errors (retried)
- Transcript parsing errors (logged, skipped)

### Error Handling Pattern

```typescript
try {
  await sttController.createSession(sessionId, config);
} catch (error) {
  // Fatal error - session creation failed
  logger.error('STT session creation failed', { sessionId, error });
  sendError(ws, ErrorCode.INTERNAL_ERROR, 'Failed to initialize transcription', eventType, sessionId, eventId);
  return; // Stop processing
}

// Non-fatal errors (audio chunk forwarding)
await sttController.forwardChunk(sessionId, audioChunk);
// Errors logged internally, no exception thrown
```

---

## Logging

All STT operations are logged with structured context:

```typescript
logger.info('STT session created', { sessionId, samplingRate, language });
logger.debug('Audio chunk forwarded', { sessionId, chunkSize });
logger.info('Final transcript segment', { sessionId, text, confidence, totalLength });
logger.error('Deepgram error', { sessionId, error });
```

---

## Testing

### Manual Testing

**Without STT (Echo Mode)**:
```bash
unset DEEPGRAM_API_KEY
pnpm dev
# Socket module uses echo testing
```

**With STT (Real Deepgram)**:
```bash
export DEEPGRAM_API_KEY=your_key_here
pnpm dev
# Socket module uses STT module
```

### Verification Checklist

- [ ] STT module structure created (all files)
- [ ] Barrel exports configured correctly
- [ ] Socket module imports only from `@/modules/stt`
- [ ] No circular dependencies
- [ ] Service starts without errors
- [ ] Session created on audio.start
- [ ] Audio chunks forwarded to Deepgram
- [ ] Transcripts logged to console
- [ ] Session cleaned up on audio.end
- [ ] Echo mode still works (without API key)

---

## Next Steps (Phase 2 & 3)

**Phase 2 - Error Handling & Retry Logic** (Week 2):
- Hybrid retry strategy (fast then slow)
- Transparent reconnection
- Error classification
- Comprehensive logging

**Phase 3 - Memory Management & Testing** (Weeks 2-3):
- Cleanup timer (stale session removal)
- Graceful shutdown
- Unit tests (80%+ coverage)
- Integration tests

**Phase 5 - LLM Integration**:
- Store transcripts for LLM processing
- Create LLM module (similar structure)
- Coordinate STT → LLM → TTS pipeline

---

## API Version History

**v1.0.0** (2024-12-24) - Phase 1 Complete:
- Initial STT module implementation
- Basic Deepgram integration
- Session-based transcription
- Socket module integration
- Clean module boundaries

---

**End of STT Module API Documentation**
