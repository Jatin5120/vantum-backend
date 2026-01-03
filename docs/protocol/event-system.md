# Event System Specification

**Version**: 2.0.0
**Last Updated**: 2024-12-27
**Status**: Active - Replaces Legacy VOICECHAT_EVENTS

---

## Overview

This document specifies the **single unified EVENTS object** that replaces the legacy flat `VOICECHAT_EVENTS` structure. The new event system uses a hierarchical `domain.category.action` naming convention for better organization, scalability, and standards compliance.

**Key Improvement**: All event types are organized in **ONE** unified object (not multiple separate objects), using hierarchical structure for clarity and discoverability.

---

## Table of Contents

1. [Event System Architecture](#event-system-architecture)
2. [Event Naming Convention](#event-naming-convention)
3. [Complete Event Reference](#complete-event-reference)
4. [Event Metadata Registry](#event-metadata-registry)
5. [Helper Functions](#helper-functions)
6. [TypeScript Implementation](#typescript-implementation)
7. [Migration Guide](#migration-guide)
8. [Usage Examples](#usage-examples)

---

## Event System Architecture

### Design Principles

**Single Unified Entity** (ADR-013):
- ALL events in ONE `EVENTS` object
- Hierarchical structure: `domain.category.action`
- Type-safe with TypeScript `as const`
- Discoverable via IDE autocomplete

**Scalability**:
- Supports 100+ event types without confusion
- Easy to add new domains/categories
- Clear organization and navigation

**Standards-Compliant**:
- Follows CloudEvents naming patterns
- Industry-standard hierarchical structure
- Compatible with event-driven architectures

### Structure Overview

```
EVENTS (single object)
├── connection
│   ├── lifecycle { ACK, HEARTBEAT, DISCONNECT }
│   └── error { GENERAL, TIMEOUT, AUTH_FAILED }
├── audio
│   ├── input { START, CHUNK, STOP }
│   ├── output { CHUNK, START, COMPLETE, CANCEL }
│   └── error { INVALID_FORMAT, UNSUPPORTED_RATE, BUFFER_OVERFLOW }
├── transcript
│   ├── interim { RESULT }
│   ├── final { RESULT }
│   └── error { LOW_CONFIDENCE, STT_FAILED }
├── conversation
│   ├── state { CHANGED, INTERRUPTED }
│   ├── response { START, TOKEN, COMPLETE }
│   └── error { LLM_TIMEOUT, LLM_FAILED, CONTEXT_TOO_LONG }
├── user
│   ├── action { INTERRUPT, END_CALL, MUTE, UNMUTE }
│   └── feedback { SENTIMENT }
├── system
│   ├── status { READY, BUSY, MAINTENANCE }
│   └── notification { RATE_LIMIT_WARNING, QUOTA_EXCEEDED }
└── error
    ├── general { UNKNOWN, INTERNAL_SERVER_ERROR }
    └── service { STT_UNAVAILABLE, LLM_UNAVAILABLE, TTS_UNAVAILABLE, TELEPHONY_UNAVAILABLE }
```

---

## Event Naming Convention

### Format

```
EVENTS.{domain}.{category}.{ACTION}
```

**Examples**:
- `EVENTS.connection.lifecycle.ack` → `"connection.lifecycle.ack"`
- `EVENTS.audio.input.start` → `"audio.input.start"`
- `EVENTS.transcript.final.result` → `"transcript.final.result"`
- `EVENTS.conversation.state.changed` → `"conversation.state.changed"`

### Domain Definitions

| Domain | Purpose | Example Events |
|--------|---------|----------------|
| **connection** | WebSocket connection lifecycle | ack, heartbeat, disconnect |
| **audio** | Audio streaming (input/output) | chunk, start, stop |
| **transcript** | STT transcription results | interim, final |
| **conversation** | LLM conversation management | state changed, response token |
| **user** | User-initiated actions | interrupt, end call, mute |
| **system** | System status and notifications | ready, maintenance, rate limit |
| **error** | Error reporting | STT failed, LLM timeout |

### Category Definitions

**Examples by Domain**:

**connection**:
- `lifecycle`: Connection state changes (ack, disconnect)
- `error`: Connection errors (timeout, auth failed)

**audio**:
- `input`: Client-to-server audio (start, chunk, stop)
- `output`: Server-to-client audio (chunk, complete)
- `error`: Audio processing errors (invalid format)

**transcript**:
- `interim`: Partial transcripts (real-time)
- `final`: Complete transcripts (utterance ended)
- `error`: Transcription errors (low confidence)

**conversation**:
- `state`: Conversation state changes (LISTENING → THINKING)
- `response`: LLM response streaming (token, complete)
- `error`: Conversation errors (LLM timeout)

---

## Complete Event Reference

### 1. Connection Events

#### connection.lifecycle

**connection.lifecycle.ack**
- **Direction**: Server → Client
- **Priority**: Critical
- **Description**: Acknowledges successful WebSocket connection, provides server-generated sessionId
- **Payload**: `{ success: boolean, sessionId: string }`

**connection.lifecycle.heartbeat**
- **Direction**: Bidirectional
- **Priority**: High
- **Description**: Keep-alive ping to detect connection health
- **Payload**: `{ timestamp: number }`

**connection.lifecycle.disconnect**
- **Direction**: Bidirectional
- **Priority**: High
- **Description**: Graceful connection termination
- **Payload**: `{ reason: string, code?: number }`

#### connection.error

**connection.error.general**
- **Direction**: Server → Client
- **Priority**: High
- **Description**: Generic connection error
- **Payload**: `ErrorPayload`

**connection.error.timeout**
- **Direction**: Server → Client
- **Priority**: High
- **Description**: Connection timeout (no heartbeat)
- **Payload**: `ErrorPayload`

**connection.error.auth_failed**
- **Direction**: Server → Client
- **Priority**: Critical
- **Description**: Authentication failure
- **Payload**: `ErrorPayload`

---

### 2. Audio Events

#### audio.input (Client → Server)

**audio.input.start**
- **Direction**: Client → Server
- **Priority**: High
- **Description**: Client begins audio capture
- **Payload**: `{ samplingRate: number, language?: string }`

**audio.input.chunk**
- **Direction**: Client → Server
- **Priority**: Normal
- **Description**: Audio data chunk (PCM 16-bit)
- **Payload**: `{ audio: Buffer, timestamp: number }`

**audio.input.stop**
- **Direction**: Client → Server
- **Priority**: High
- **Description**: Client stops audio capture
- **Payload**: `{ reason?: string }`

#### audio.output (Server → Client)

**audio.output.start**
- **Direction**: Server → Client
- **Priority**: High
- **Description**: Server begins audio playback
- **Payload**: `{ samplingRate: number }`

**audio.output.chunk**
- **Direction**: Server → Client
- **Priority**: Normal
- **Description**: Audio data chunk for playback
- **Payload**: `{ audio: Buffer, timestamp: number }`

**audio.output.complete**
- **Direction**: Server → Client
- **Priority**: Normal
- **Description**: Audio playback complete
- **Payload**: `{ duration: number }`

**audio.output.cancel**
- **Direction**: Server → Client
- **Priority**: High
- **Description**: Cancel current audio playback (interruption)
- **Payload**: `{ reason: string }`

#### audio.error

**audio.error.invalid_format**
- **Direction**: Server → Client
- **Priority**: High
- **Description**: Unsupported audio format
- **Payload**: `ErrorPayload`

**audio.error.unsupported_rate**
- **Direction**: Server → Client
- **Priority**: High
- **Description**: Unsupported sampling rate
- **Payload**: `ErrorPayload`

**audio.error.buffer_overflow**
- **Direction**: Server → Client
- **Priority**: High
- **Description**: Audio buffer full (backpressure)
- **Payload**: `ErrorPayload`

---

### 3. Transcript Events

#### transcript.interim

**transcript.interim.result**
- **Direction**: Server → Client
- **Priority**: Normal
- **Description**: Partial transcript (real-time, updates continuously)
- **Payload**: `{ text: string, confidence: number, isFinal: false }`

#### transcript.final

**transcript.final.result**
- **Direction**: Server → Client
- **Priority**: High
- **Description**: Complete transcript (utterance ended)
- **Payload**: `{ text: string, confidence: number, isFinal: true, duration: number }`

#### transcript.error

**transcript.error.low_confidence**
- **Direction**: Server → Client
- **Priority**: Normal
- **Description**: Transcript confidence below threshold
- **Payload**: `ErrorPayload & { confidence: number }`

**transcript.error.stt_failed**
- **Direction**: Server → Client
- **Priority**: High
- **Description**: STT service failure
- **Payload**: `ErrorPayload`

---

### 4. Conversation Events

#### conversation.state

**conversation.state.changed**
- **Direction**: Server → Client
- **Priority**: High
- **Description**: Conversation state transition
- **Payload**: `{ from: ConversationState, to: ConversationState, timestamp: number }`

**conversation.state.interrupted**
- **Direction**: Server → Client
- **Priority**: High
- **Description**: User interrupted during RESPONDING state
- **Payload**: `{ partialResponse: string, timestamp: number }`

#### conversation.response

**conversation.response.start**
- **Direction**: Server → Client
- **Priority**: High
- **Description**: LLM response generation started
- **Payload**: `{ timestamp: number }`

**conversation.response.token**
- **Direction**: Server → Client
- **Priority**: Normal
- **Description**: LLM token streamed (real-time response)
- **Payload**: `{ token: string, index: number }`

**conversation.response.complete**
- **Direction**: Server → Client
- **Priority**: High
- **Description**: LLM response generation complete
- **Payload**: `{ fullResponse: string, tokenCount: number, duration: number }`

#### conversation.error

**conversation.error.llm_timeout**
- **Direction**: Server → Client
- **Priority**: High
- **Description**: LLM request timeout
- **Payload**: `ErrorPayload`

**conversation.error.llm_failed**
- **Direction**: Server → Client
- **Priority**: High
- **Description**: LLM service failure
- **Payload**: `ErrorPayload`

**conversation.error.context_too_long**
- **Direction**: Server → Client
- **Priority**: High
- **Description**: Conversation history exceeds token limit
- **Payload**: `ErrorPayload`

---

### 5. User Events

#### user.action

**user.action.interrupt**
- **Direction**: Client → Server
- **Priority**: High
- **Description**: User explicitly interrupts AI response
- **Payload**: `{ timestamp: number }`

**user.action.end_call**
- **Direction**: Client → Server
- **Priority**: Critical
- **Description**: User ends call
- **Payload**: `{ reason?: string }`

**user.action.mute**
- **Direction**: Client → Server
- **Priority**: Normal
- **Description**: User mutes microphone
- **Payload**: `{ timestamp: number }`

**user.action.unmute**
- **Direction**: Client → Server
- **Priority**: Normal
- **Description**: User unmutes microphone
- **Payload**: `{ timestamp: number }`

#### user.feedback

**user.feedback.sentiment**
- **Direction**: Client → Server
- **Priority**: Low
- **Description**: User sentiment during call (future feature)
- **Payload**: `{ sentiment: 'positive' | 'neutral' | 'negative', timestamp: number }`

---

### 6. System Events

#### system.status

**system.status.ready**
- **Direction**: Server → Client
- **Priority**: High
- **Description**: System ready to accept calls
- **Payload**: `{ timestamp: number }`

**system.status.busy**
- **Direction**: Server → Client
- **Priority**: Normal
- **Description**: System at capacity
- **Payload**: `{ activeSessions: number, maxSessions: number }`

**system.status.maintenance**
- **Direction**: Server → Client
- **Priority**: Critical
- **Description**: System entering maintenance mode
- **Payload**: `{ estimatedDowntime: number }`

#### system.notification

**system.notification.rate_limit_warning**
- **Direction**: Server → Client
- **Priority**: Normal
- **Description**: Approaching API rate limit
- **Payload**: `{ service: string, remainingQuota: number }`

**system.notification.quota_exceeded**
- **Direction**: Server → Client
- **Priority**: High
- **Description**: API quota exceeded
- **Payload**: `{ service: string, resetAt: number }`

---

### 7. Error Events

#### error.general

**error.general.unknown**
- **Direction**: Server → Client
- **Priority**: High
- **Description**: Unknown error occurred
- **Payload**: `ErrorPayload`

**error.general.internal_server_error**
- **Direction**: Server → Client
- **Priority**: Critical
- **Description**: Internal server error
- **Payload**: `ErrorPayload`

#### error.service

**error.service.stt_unavailable**
- **Direction**: Server → Client
- **Priority**: Critical
- **Description**: Deepgram STT service unavailable
- **Payload**: `ErrorPayload`

**error.service.llm_unavailable**
- **Direction**: Server → Client
- **Priority**: Critical
- **Description**: OpenAI LLM service unavailable
- **Payload**: `ErrorPayload`

**error.service.tts_unavailable**
- **Direction**: Server → Client
- **Priority**: Critical
- **Description**: Cartesia TTS service unavailable
- **Payload**: `ErrorPayload`

**error.service.telephony_unavailable**
- **Direction**: Server → Client
- **Priority**: Critical
- **Description**: Twilio telephony service unavailable
- **Payload**: `ErrorPayload`

---

## Event Metadata Registry

### Structure

```typescript
interface EventMetadata {
  direction: 'client-to-server' | 'server-to-client' | 'bidirectional';
  priority: 'critical' | 'high' | 'normal' | 'low';
  description: string;
  payloadType: string;
  version: string;
}

export const EVENT_METADATA: Record<string, EventMetadata> = {
  // Example entries (full registry in implementation)
  'connection.lifecycle.ack': {
    direction: 'server-to-client',
    priority: 'critical',
    description: 'Acknowledges successful connection with sessionId',
    payloadType: 'ConnectionAckPayload',
    version: '1.0.0'
  },
  'audio.input.chunk': {
    direction: 'client-to-server',
    priority: 'normal',
    description: 'Audio data chunk from client',
    payloadType: 'AudioChunkPayload',
    version: '1.0.0'
  },
  // ... (all ~50 events)
};
```

### Usage

```typescript
// Get event metadata
const metadata = EVENT_METADATA[EVENTS.audio.input.start];
console.log(metadata.direction);  // 'client-to-server'
console.log(metadata.priority);   // 'high'
```

---

## Helper Functions

### Domain Extraction

```typescript
/**
 * Extract domain from event type
 * @example getEventDomain('audio.input.start') → 'audio'
 */
export function getEventDomain(eventType: string): string {
  return eventType.split('.')[0];
}
```

### Category Extraction

```typescript
/**
 * Extract category from event type
 * @example getEventCategory('audio.input.start') → 'input'
 */
export function getEventCategory(eventType: string): string {
  return eventType.split('.')[1];
}
```

### Action Extraction

```typescript
/**
 * Extract action from event type
 * @example getEventAction('audio.input.start') → 'start'
 */
export function getEventAction(eventType: string): string {
  const parts = eventType.split('.');
  return parts[parts.length - 1];
}
```

### Direction Filters

```typescript
/**
 * Check if event is client-to-server
 */
export function isClientEvent(eventType: string): boolean {
  return EVENT_METADATA[eventType]?.direction === 'client-to-server';
}

/**
 * Check if event is server-to-client
 */
export function isServerEvent(eventType: string): boolean {
  return EVENT_METADATA[eventType]?.direction === 'server-to-client';
}

/**
 * Check if event is bidirectional
 */
export function isBidirectionalEvent(eventType: string): boolean {
  return EVENT_METADATA[eventType]?.direction === 'bidirectional';
}
```

### Priority Filters

```typescript
/**
 * Check if event is critical priority
 */
export function isCriticalEvent(eventType: string): boolean {
  return EVENT_METADATA[eventType]?.priority === 'critical';
}
```

### Event Enumeration

```typescript
/**
 * Get all events for a specific domain
 */
export function getEventsForDomain(domain: string): string[] {
  return Object.keys(EVENT_METADATA).filter(
    eventType => getEventDomain(eventType) === domain
  );
}

/**
 * Get all client-to-server events
 */
export function getAllClientEvents(): string[] {
  return Object.keys(EVENT_METADATA).filter(isClientEvent);
}

/**
 * Get all server-to-client events
 */
export function getAllServerEvents(): string[] {
  return Object.keys(EVENT_METADATA).filter(isServerEvent);
}
```

---

## TypeScript Implementation

### Complete EVENTS Object

```typescript
// vantum-shared/src/events/index.ts

/**
 * Single unified EVENTS object with hierarchical structure
 *
 * Naming convention: domain.category.action
 *
 * @example
 * EVENTS.connection.lifecycle.ack → 'connection.lifecycle.ack'
 * EVENTS.audio.input.start → 'audio.input.start'
 */
export const EVENTS = {
  connection: {
    lifecycle: {
      ACK: 'connection.lifecycle.ack',
      HEARTBEAT: 'connection.lifecycle.heartbeat',
      DISCONNECT: 'connection.lifecycle.disconnect',
    },
    error: {
      GENERAL: 'connection.error.general',
      TIMEOUT: 'connection.error.timeout',
      AUTH_FAILED: 'connection.error.auth_failed',
    },
  },
  audio: {
    input: {
      START: 'audio.input.start',
      CHUNK: 'audio.input.chunk',
      STOP: 'audio.input.stop',
    },
    output: {
      START: 'audio.output.start',
      CHUNK: 'audio.output.chunk',
      COMPLETE: 'audio.output.complete',
      CANCEL: 'audio.output.cancel',
    },
    error: {
      INVALID_FORMAT: 'audio.error.invalid_format',
      UNSUPPORTED_RATE: 'audio.error.unsupported_rate',
      BUFFER_OVERFLOW: 'audio.error.buffer_overflow',
    },
  },
  transcript: {
    interim: {
      RESULT: 'transcript.interim.result',
    },
    final: {
      RESULT: 'transcript.final.result',
    },
    error: {
      LOW_CONFIDENCE: 'transcript.error.low_confidence',
      STT_FAILED: 'transcript.error.stt_failed',
    },
  },
  conversation: {
    state: {
      CHANGED: 'conversation.state.changed',
      INTERRUPTED: 'conversation.state.interrupted',
    },
    response: {
      START: 'conversation.response.start',
      TOKEN: 'conversation.response.token',
      COMPLETE: 'conversation.response.complete',
    },
    error: {
      LLM_TIMEOUT: 'conversation.error.llm_timeout',
      LLM_FAILED: 'conversation.error.llm_failed',
      CONTEXT_TOO_LONG: 'conversation.error.context_too_long',
    },
  },
  user: {
    action: {
      INTERRUPT: 'user.action.interrupt',
      END_CALL: 'user.action.end_call',
      MUTE: 'user.action.mute',
      UNMUTE: 'user.action.unmute',
    },
    feedback: {
      SENTIMENT: 'user.feedback.sentiment',
    },
  },
  system: {
    status: {
      READY: 'system.status.ready',
      BUSY: 'system.status.busy',
      MAINTENANCE: 'system.status.maintenance',
    },
    notification: {
      RATE_LIMIT_WARNING: 'system.notification.rate_limit_warning',
      QUOTA_EXCEEDED: 'system.notification.quota_exceeded',
    },
  },
  error: {
    general: {
      UNKNOWN: 'error.general.unknown',
      INTERNAL_SERVER_ERROR: 'error.general.internal_server_error',
    },
    service: {
      STT_UNAVAILABLE: 'error.service.stt_unavailable',
      LLM_UNAVAILABLE: 'error.service.llm_unavailable',
      TTS_UNAVAILABLE: 'error.service.tts_unavailable',
      TELEPHONY_UNAVAILABLE: 'error.service.telephony_unavailable',
    },
  },
} as const;

// Export type for type safety
export type EventType = typeof EVENTS;
```

### Type Safety

```typescript
// Extract all possible event type strings
export type EventTypeString =
  | typeof EVENTS.connection.lifecycle[keyof typeof EVENTS.connection.lifecycle]
  | typeof EVENTS.connection.error[keyof typeof EVENTS.connection.error]
  | typeof EVENTS.audio.input[keyof typeof EVENTS.audio.input]
  | typeof EVENTS.audio.output[keyof typeof EVENTS.audio.output]
  | typeof EVENTS.audio.error[keyof typeof EVENTS.audio.error]
  | typeof EVENTS.transcript.interim[keyof typeof EVENTS.transcript.interim]
  | typeof EVENTS.transcript.final[keyof typeof EVENTS.transcript.final]
  | typeof EVENTS.transcript.error[keyof typeof EVENTS.transcript.error]
  | typeof EVENTS.conversation.state[keyof typeof EVENTS.conversation.state]
  | typeof EVENTS.conversation.response[keyof typeof EVENTS.conversation.response]
  | typeof EVENTS.conversation.error[keyof typeof EVENTS.conversation.error]
  | typeof EVENTS.user.action[keyof typeof EVENTS.user.action]
  | typeof EVENTS.user.feedback[keyof typeof EVENTS.user.feedback]
  | typeof EVENTS.system.status[keyof typeof EVENTS.system.status]
  | typeof EVENTS.system.notification[keyof typeof EVENTS.system.notification]
  | typeof EVENTS.error.general[keyof typeof EVENTS.error.general]
  | typeof EVENTS.error.service[keyof typeof EVENTS.error.service];

// Use in event message
interface EventMessage {
  eventType: EventTypeString;
  eventId: string;
  sessionId: string;
  payload: unknown;
  timestamp: number;
}
```

---

## Migration Guide

### From Legacy VOICECHAT_EVENTS

**Legacy Structure** (DEPRECATED):
```typescript
export const VOICECHAT_EVENTS = {
  CONNECTION_ESTABLISHED: 'voicechat.connection.established',
  AUDIO_CHUNK: 'voicechat.audio.chunk',
  TRANSCRIPT_FINAL: 'voicechat.transcript.final',
  // ... flat structure
};
```

**New Structure** (CURRENT):
```typescript
export const EVENTS = {
  connection: {
    lifecycle: { ACK: 'connection.lifecycle.ack', ... }
  },
  audio: {
    input: { CHUNK: 'audio.input.chunk', ... }
  },
  transcript: {
    final: { RESULT: 'transcript.final.result', ... }
  }
};
```

### Migration Steps

**Step 1: Install Updated vantum-shared**
```bash
pnpm add @Jatin5120/vantum-shared@latest
```

**Step 2: Update Imports**
```typescript
// Before
import { VOICECHAT_EVENTS } from '@Jatin5120/vantum-shared';

// After
import { EVENTS } from '@Jatin5120/vantum-shared';
```

**Step 3: Update Event References**
```typescript
// Before
if (message.eventType === VOICECHAT_EVENTS.AUDIO_CHUNK) { }

// After
if (message.eventType === EVENTS.audio.input.chunk) { }
```

### Backward Compatibility (Temporary)

For gradual migration, legacy VOICECHAT_EVENTS can map to new structure:

```typescript
// vantum-shared/src/events/legacy.ts
import { EVENTS } from './index';

/**
 * @deprecated Use EVENTS instead
 */
export const VOICECHAT_EVENTS = {
  CONNECTION_ESTABLISHED: EVENTS.connection.lifecycle.ack,
  AUDIO_CHUNK: EVENTS.audio.input.chunk,
  TRANSCRIPT_FINAL: EVENTS.transcript.final.result,
  // ... map all legacy events
} as const;
```

---

## Usage Examples

### Backend: Send Event

```typescript
import { EVENTS } from '@Jatin5120/vantum-shared';
import { sendMessage } from '@/shared/utils/websocket';

// Send connection acknowledgment
sendMessage(ws, {
  eventType: EVENTS.connection.lifecycle.ack,
  eventId: uuidv7(),
  sessionId: sessionId,
  payload: { success: true },
  timestamp: Date.now()
});

// Send audio output
sendMessage(ws, {
  eventType: EVENTS.audio.output.chunk,
  eventId: uuidv7(),
  sessionId: sessionId,
  payload: { audio: audioBuffer },
  timestamp: Date.now()
});
```

### Backend: Handle Event

```typescript
import { EVENTS } from '@Jatin5120/vantum-shared';

// Route message to handler
function routeMessage(message: EventMessage): void {
  const { eventType, payload, sessionId } = message;

  switch (eventType) {
    case EVENTS.audio.input.start:
      await handleAudioInputStart(payload, sessionId);
      break;

    case EVENTS.audio.input.chunk:
      await handleAudioInputChunk(payload, sessionId);
      break;

    case EVENTS.user.action.interrupt:
      await handleUserInterrupt(payload, sessionId);
      break;

    default:
      logger.warn('Unknown event type', { eventType });
  }
}
```

### Frontend: Listen for Event

```typescript
import { EVENTS } from '@Jatin5120/vantum-shared';

// Register event listener
socketManager.on(EVENTS.audio.output.chunk, (payload) => {
  // Play audio chunk
  audioPlaybackService.enqueue(payload.audio);
});

socketManager.on(EVENTS.transcript.final.result, (payload) => {
  // Display final transcript
  console.log('Final transcript:', payload.text);
  updateUI(payload.text);
});

socketManager.on(EVENTS.conversation.state.changed, (payload) => {
  // Update conversation state UI
  console.log(`State: ${payload.from} → ${payload.to}`);
  updateStateIndicator(payload.to);
});
```

### Frontend: Send Event

```typescript
import { EVENTS } from '@Jatin5120/vantum-shared';

// Start audio input
socketManager.send({
  eventType: EVENTS.audio.input.start,
  payload: { samplingRate: 48000, language: 'en-US' }
});

// Send audio chunk
socketManager.send({
  eventType: EVENTS.audio.input.chunk,
  payload: { audio: audioBuffer }
});

// User interrupts
socketManager.send({
  eventType: EVENTS.user.action.interrupt,
  payload: { timestamp: Date.now() }
});
```

---

## Related Documents

- [WebSocket Protocol](/docs/protocol/websocket-protocol.md) - Protocol specification
- [ADR-013: Single Unified EVENTS Object](/docs/architecture/decisions.md#adr-013-single-unified-events-object)
- [Architecture Overview](/docs/architecture/architecture.md)
- [Data Models](/docs/architecture/data-models.md)

---

**Last Updated**: 2024-12-27
**Maintainer**: Architect Agent
**Status**: Active - Replaces legacy VOICECHAT_EVENTS
