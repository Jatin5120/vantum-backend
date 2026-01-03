# Data Models

**Version**: 1.0.0
**Last Updated**: 2024-12-27
**Status**: Active

Complete data model specifications for all system entities in the Vantum backend.

## Overview

This document defines all data models used throughout the Vantum backend. These models are the foundation for:
- Session management
- Conversation state tracking
- STT/LLM/TTS integration
- Real-time audio streaming
- WebSocket protocol implementation

**Related Documents**:
- [State Machine](./state-machine.md) - Conversation state transitions
- [WebSocket Protocol](../protocol/websocket-protocol.md) - Message formats
- [STT Integration Design](../design/deepgram-stt-integration-design.md) - STT-specific models

---

## Core Models

### 1. Session Model

**Purpose**: Track WebSocket connections and call metadata

```typescript
interface Session {
  // Identity
  sessionId: string;              // UUIDv7 (server-generated, time-ordered)
  socketId: string;               // Internal WebSocket connection ID

  // State
  status: SessionStatus;          // 'idle' | 'active' | 'ended'
  state: ConversationState;       // Current conversation state (see State Machine)

  // Audio Configuration
  samplingRate: number;           // 8000, 16000, or 48000 Hz
  language: string;               // ISO 639-1 code (e.g., 'en-US')

  // Timestamps
  createdAt: number;              // Unix timestamp (ms)
  lastActivityAt: number;         // Unix timestamp (ms)
  endedAt?: number;               // Unix timestamp (ms), optional

  // Metadata
  metadata: {
    clientType: 'browser' | 'twilio';
    audioFormat: {
      sampleRate: number;         // Input sample rate (48kHz or 8kHz)
      channels: number;           // Mono (1) or Stereo (2)
      encoding: string;           // 'pcm' or 'ulaw'
    };
    userAgent?: string;           // Browser user agent (dev only)
  };
}

enum SessionStatus {
  IDLE = 'idle',                  // Session created, not yet active
  ACTIVE = 'active',              // Audio session active
  ENDED = 'ended',                // Session terminated
}
```

**Usage Example**:
```typescript
const session: Session = {
  sessionId: '01934567-89ab-cdef-0123-456789abcd00',
  socketId: 'conn-12345',
  status: SessionStatus.ACTIVE,
  state: ConversationState.LISTENING,
  samplingRate: 48000,
  language: 'en-US',
  createdAt: Date.now(),
  lastActivityAt: Date.now(),
  metadata: {
    clientType: 'browser',
    audioFormat: {
      sampleRate: 48000,
      channels: 1,
      encoding: 'pcm'
    }
  }
};
```

---

### 2. ConversationContext Model

**Purpose**: Maintain conversation history and configuration per session

```typescript
interface ConversationContext {
  // Identity
  sessionId: string;              // Links to Session

  // Conversation History
  messages: ConversationMessage[];

  // Call Details
  callDetails: {
    startedAt: number;            // Unix timestamp (ms)
    endedAt?: number;             // Unix timestamp (ms)
    duration?: number;            // Milliseconds
  };

  // Configuration
  config: {
    llm: {
      model: string;              // 'gpt-4'
      temperature: number;        // 0.7
      maxTokens: number;          // 150
      systemPrompt: string;       // AI personality and instructions
    };
    tts: {
      voiceId: string;            // Cartesia voice ID
      speed: number;              // 1.0 (normal speed)
    };
  };

  // Current State
  currentUtteranceId?: string;    // Active AI response ID
  isInterrupted: boolean;         // User interrupted AI

  // Metrics (future)
  metrics?: {
    transcriptLatency: number[];  // Per-message STT latency
    llmLatency: number[];         // Per-response LLM latency
    ttsLatency: number[];         // Per-response TTS latency
  };
}
```

**Usage Example**:
```typescript
const context: ConversationContext = {
  sessionId: '01934567-89ab-cdef-0123-456789abcd00',
  messages: [],
  callDetails: {
    startedAt: Date.now()
  },
  config: {
    llm: {
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 150,
      systemPrompt: 'You are a professional sales assistant...'
    },
    tts: {
      voiceId: 'default',
      speed: 1.0
    }
  },
  isInterrupted: false
};
```

---

### 3. ConversationMessage Model

**Purpose**: Represent individual messages in conversation history

```typescript
interface ConversationMessage {
  // Identity
  messageId: string;              // UUIDv7

  // Content
  role: 'system' | 'user' | 'assistant';
  content: string;                // Message text

  // Source
  source: 'stt' | 'llm' | 'system';

  // Timing
  timestamp: number;              // Unix timestamp (ms)

  // Metadata
  metadata?: {
    // STT-specific
    transcriptConfidence?: number;  // STT confidence (0-1)
    isFinal?: boolean;              // STT final transcript

    // LLM-specific
    tokenCount?: number;            // LLM token count

    // TTS-specific
    utteranceId?: string;           // TTS utterance ID (if assistant)
    duration?: number;              // Audio duration (ms)

    // Interruption
    interrupted?: boolean;          // Was this message interrupted?
  };
}
```

**Usage Example**:
```typescript
const userMessage: ConversationMessage = {
  messageId: '11111111-1111-1111-1111-111111111111',
  role: 'user',
  content: 'Hello, I'm interested in your product.',
  source: 'stt',
  timestamp: Date.now(),
  metadata: {
    transcriptConfidence: 0.95,
    isFinal: true
  }
};

const assistantMessage: ConversationMessage = {
  messageId: '22222222-2222-2222-2222-222222222222',
  role: 'assistant',
  content: 'Thank you for your interest! I'd be happy to tell you more.',
  source: 'llm',
  timestamp: Date.now(),
  metadata: {
    tokenCount: 45,
    utteranceId: '33333333-3333-3333-3333-333333333333',
    duration: 3500
  }
};
```

---

### 4. ConversationState Enum

**Purpose**: Track current state in conversation flow

```typescript
enum ConversationState {
  INITIALIZING = 'INITIALIZING',  // Setting up connections (STT/LLM/TTS)
  LISTENING = 'LISTENING',        // Waiting for user speech
  THINKING = 'THINKING',          // Processing user input (STT + LLM)
  RESPONDING = 'RESPONDING',      // Playing AI response (TTS)
  INTERRUPTED = 'INTERRUPTED',    // User interrupted AI response
  ENDED = 'ENDED'                 // Call has ended
}
```

**State Descriptions**:

- **INITIALIZING**: Session is being set up. Resources are being initialized (STT connection, LLM context, TTS client).
- **LISTENING**: System is actively listening for user speech. STT is running.
- **THINKING**: User has finished speaking. System is processing (STT finalization + LLM generation).
- **RESPONDING**: AI is speaking. TTS audio is being streamed to client.
- **INTERRUPTED**: User started speaking while AI was responding. TTS is cancelled.
- **ENDED**: Conversation has ended. Cleanup in progress.

**See Also**: [State Machine Documentation](./state-machine.md) for complete state transition rules.

---

### 5. STTSession Model (Future)

**Purpose**: STT-specific session state (when STT module is implemented)

```typescript
interface STTSession {
  // Identity
  sessionId: string;              // Links to Session
  connectionId: string;           // Deepgram connection ID

  // Deepgram Connection
  deepgramLiveClient: LiveTranscriptionEvents | null;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';

  // Transcript Accumulation
  accumulatedTranscript: string;  // Full transcript so far
  interimTranscript: string;      // Current interim transcript
  lastTranscriptTime: number;     // Last transcript received (timestamp)
  transcriptSegments: TranscriptSegment[];

  // Configuration
  config: {
    samplingRate: number;         // 16000 (Deepgram optimal)
    language: string;             // 'en-US'
    model: string;                // 'nova-2'
  };

  // Retry State
  retryCount: number;             // Number of retries attempted
  lastRetryTime: number;          // Last retry timestamp
  reconnectAttempts: number;      // Reconnection attempts

  // Lifecycle
  createdAt: number;              // Session creation time
  lastActivityAt: number;         // Last activity time
  isActive: boolean;              // Is session active?

  // Metrics
  metrics: {
    chunksReceived: number;       // Audio chunks received from client
    chunksForwarded: number;      // Audio chunks sent to Deepgram
    transcriptsReceived: number;  // Transcripts received from Deepgram
    errors: number;               // Number of errors
    reconnections: number;        // Number of successful reconnections
  };
}

interface TranscriptSegment {
  text: string;                   // Transcript text
  confidence: number;             // Confidence score (0-1)
  isFinal: boolean;               // Is this final or interim?
  timestamp: number;              // Unix timestamp (ms)
}
```

**See Also**: [Deepgram STT Integration Design](../design/deepgram-stt-integration-design.md) for complete STT module specification.

---

### 6. Event Message Models

**Purpose**: WebSocket event message structures

```typescript
interface EventMessage<T = unknown> {
  eventType: string;              // Event type (e.g., 'audio.input.start')
  eventId: string;                // UUIDv7 for this event
  sessionId: string;              // UUIDv7 (server-generated)
  payload: T;                     // Event-specific payload
}

interface ErrorMessage {
  eventType: string;              // Converted error type
  eventId: string;                // Same as original request
  sessionId: string;              // Same as original request
  requestType: string;            // Original request eventType (at top level)
  payload: {
    message: string;              // Error message
  };
}
```

**See Also**: [WebSocket Protocol Specification](../protocol/websocket-protocol.md) for complete message format details.

---

## Future Data Models

These models will be added in future phases (Layer 3+):

### Call Recording Model

```typescript
interface CallRecording {
  // Identity
  recordingId: string;            // UUIDv7
  sessionId: string;              // Links to Session

  // Storage
  audioUrl: string;               // S3/Cloud Storage URL
  transcript: string;             // Full conversation transcript

  // Metadata
  duration: number;               // Call duration (ms)
  createdAt: number;              // Recording timestamp
  format: string;                 // 'mp3' | 'wav' | 'opus'

  // Privacy
  isArchived: boolean;            // Archived for compliance?
  retentionUntil: number;         // Auto-delete timestamp
}
```

### Analytics Model

```typescript
interface CallAnalytics {
  // Identity
  analyticsId: string;            // UUIDv7
  sessionId: string;              // Links to Session

  // Sentiment Analysis
  sentiment: 'positive' | 'neutral' | 'negative';
  sentimentScore: number;         // -1 to 1

  // Engagement
  interestLevel: number;          // 0-100
  interruptionCount: number;      // How many times user interrupted

  // Topics
  keyTopics: string[];            // Extracted topics
  actionItems: string[];          // Follow-up actions

  // Outcome
  outcome: 'scheduled' | 'not-interested' | 'callback' | 'qualified' | 'other';
  nextAction?: string;            // Next step description

  // Timing
  analyzedAt: number;             // Analysis timestamp
}
```

### User Model

```typescript
interface User {
  // Identity
  userId: string;                 // UUIDv7
  organizationId: string;         // Organization UUID

  // Authentication
  email: string;
  passwordHash: string;           // bcrypt hash
  role: 'user' | 'admin';

  // Credits/Billing
  credits: number;                // Available credits
  plan: 'free' | 'pro' | 'enterprise';

  // Timestamps
  createdAt: number;
  lastLoginAt: number;
}
```

### Campaign Model

```typescript
interface Campaign {
  // Identity
  campaignId: string;             // UUIDv7
  organizationId: string;         // Organization UUID

  // Configuration
  name: string;
  phoneNumbers: string[];         // List of numbers to call
  scriptTemplate: string;         // LLM system prompt template

  // Schedule
  startDate: number;              // Campaign start time
  endDate: number;                // Campaign end time
  timezone: string;               // 'America/New_York'

  // Status
  status: 'draft' | 'active' | 'paused' | 'completed';
  callsMade: number;
  callsSuccessful: number;

  // Timestamps
  createdAt: number;
  updatedAt: number;
}
```

---

## Type Safety

All models are defined in TypeScript with **strict mode** enabled. Key principles:

### Strict Mode Enforcement

- **No `any` types** - Use `unknown` and type guards
- **Required vs Optional** - Clear distinction with `?` operator
- **Enums for constants** - Type-safe state values
- **Timestamps** - Always Unix milliseconds (`Date.now()`)
- **IDs** - Always UUIDv7 format (time-ordered)

### Runtime Validation

Use type guards for runtime validation:

```typescript
function isSession(data: unknown): data is Session {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const obj = data as Record<string, unknown>;

  return (
    typeof obj.sessionId === 'string' &&
    typeof obj.socketId === 'string' &&
    typeof obj.status === 'string' &&
    typeof obj.samplingRate === 'number' &&
    typeof obj.language === 'string' &&
    typeof obj.createdAt === 'number' &&
    typeof obj.lastActivityAt === 'number'
  );
}

// Usage
if (isSession(data)) {
  // TypeScript now knows data is Session
  console.log(data.sessionId);
}
```

### Discriminated Unions

Use discriminated unions for polymorphic types:

```typescript
type Message =
  | { type: 'user'; content: string; confidence: number }
  | { type: 'assistant'; content: string; tokenCount: number }
  | { type: 'system'; content: string };

function handleMessage(message: Message) {
  switch (message.type) {
    case 'user':
      // TypeScript knows message.confidence exists
      break;
    case 'assistant':
      // TypeScript knows message.tokenCount exists
      break;
    case 'system':
      // TypeScript knows only message.content exists
      break;
  }
}
```

---

## Validation Examples

### Session Validation

```typescript
import { v7 as uuidv7, validate as validateUUID } from 'uuid';

function validateSession(session: Session): string[] {
  const errors: string[] = [];

  // Validate UUIDs
  if (!validateUUID(session.sessionId)) {
    errors.push('sessionId must be valid UUIDv7');
  }

  // Validate sample rate
  const validRates = [8000, 16000, 48000];
  if (!validRates.includes(session.samplingRate)) {
    errors.push(`samplingRate must be one of: ${validRates.join(', ')}`);
  }

  // Validate language
  if (!session.language.match(/^[a-z]{2}-[A-Z]{2}$/)) {
    errors.push('language must be in format: en-US');
  }

  // Validate status
  const validStatuses: SessionStatus[] = ['idle', 'active', 'ended'];
  if (!validStatuses.includes(session.status)) {
    errors.push(`status must be one of: ${validStatuses.join(', ')}`);
  }

  return errors;
}
```

### Message Validation

```typescript
function validateConversationMessage(message: ConversationMessage): string[] {
  const errors: string[] = [];

  if (!validateUUID(message.messageId)) {
    errors.push('messageId must be valid UUIDv7');
  }

  const validRoles = ['system', 'user', 'assistant'];
  if (!validRoles.includes(message.role)) {
    errors.push(`role must be one of: ${validRoles.join(', ')}`);
  }

  if (typeof message.content !== 'string' || message.content.length === 0) {
    errors.push('content must be non-empty string');
  }

  if (message.metadata?.transcriptConfidence !== undefined) {
    if (message.metadata.transcriptConfidence < 0 || message.metadata.transcriptConfidence > 1) {
      errors.push('transcriptConfidence must be between 0 and 1');
    }
  }

  return errors;
}
```

---

## Related Documents

- [State Machine](./state-machine.md) - Complete state transition rules
- [WebSocket Protocol](../protocol/websocket-protocol.md) - Message formats
- [STT Integration Design](../design/deepgram-stt-integration-design.md) - STT module architecture
- [Architecture Overview](./architecture.md) - System architecture
- [Scalability](./scalability.md) - Scaling considerations

---

**This document is the single source of truth for data models in the Vantum project. All implementations must follow these specifications exactly.**
