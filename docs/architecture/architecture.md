# Architecture Documentation

**Version**: 1.0.0  
**Last Updated**: 2025-12-17  
**Status**: Active

> **Note**: For detailed information about the folder structure and module organization, see [Folder Structure Documentation](../code/folder-structure.md).  
> **For complete WebSocket protocol specification, see [WebSocket Protocol Specification](../protocol/websocket-protocol.md)**.

## System Architecture

### Overview

Vantum backend uses a **native WebSocket (`ws`) server + MessagePack** protocol for real-time bidirectional audio communication between clients and the AI processing pipeline.

At a high level:

- The **frontend** connects to `ws://<host>:<port>/ws` using the browser `WebSocket` API.
- The **backend** uses a `WebSocketServer` from the `ws` library, initialized in the `socket` module.
- All messages are **binary MessagePack frames** following a shared envelope (see [WebSocket Protocol Specification](../protocol/websocket-protocol.md#base-message-structure)):
  - `eventType: string` (from `VOICECHAT_EVENTS`)
  - `eventId: string` (UUIDv7)
  - `sessionId: string` (UUIDv7, same for one session)
  - `payload: object`

```
┌─────────────────────┐
│ Browser (Frontend)  │
└──────────┬──────────┘
           │
           │ WebSocket (MessagePack)
           │ ws://host:port/ws
           ▼
┌─────────────────────────────────────┐
│  Node.js Backend (ws server @ /ws)  │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│   Socket Module (modules/socket)    │
│                                      │
│  ┌──────────────────────────────┐   │
│  │   SessionService             │   │
│  │   - Session lifecycle        │   │
│  │   - State management         │   │
│  └──────────────────────────────┘   │
│                                      │
│  ┌──────────────────────────────┐   │
│  │   WebSocketService            │   │
│  │   - Connection tracking       │   │
│  │   - Message routing           │   │
│  └──────────────────────────────┘   │
│                                      │
│  ┌──────────────────────────────┐   │
│  │   MessagePackHelper          │   │
│  │   - Static utility class     │   │
│  │   - Message packing          │   │
│  └──────────────────────────────┘   │
│                                      │
│  ┌──────────────────────────────┐   │
│  │   WebSocketUtils             │   │
│  │   - Static utility class     │   │
│  │   - Safe operations          │   │
│  └──────────────────────────────┘   │
└──────────┬───────────────────────────┘
           │
           │ (Planned)
           ▼
┌──────────────────────────────────────┐
│  Future STT/LLM/TTS Services        │
│  (To be implemented)                │
└──────────────────────────────────────┘
```

The **socket layer is fully implemented today**; STT/LLM/TTS services are planned and will plug into this module as separate feature modules.

### Socket Module Responsibilities

The `socket` module (`src/modules/socket`) owns:

- **WebSocket server** initialization and graceful shutdown.
- **Connection lifecycle**: new connections, disconnections, error handling.
- **Session management** (`SessionService`): create/update/delete sessions, track state and metadata.
- **WebSocket routing** (`message.handler.ts`): decode MessagePack frames and dispatch by event.
- **Audio control events** (`audio.handler.ts`): handle audio start/chunk/end events.
- **Message packing** (`MessagePackHelper`): static utility class for packing server → client events into MessagePack.
- **Safe WebSocket operations** (`WebSocketUtils`): static utility class with `safeSend`, `safeClose` with logging.

See [WebSocket Protocol Specification](../protocol/websocket-protocol.md) for complete message format details.

## Communication Flow

### 1. Connection Establishment

```
Client → WebSocket connect (ws://.../ws)
Server → assigns connectionId + creates session
Server → sends connection/ACK events (planned)
```

### 2. Audio Control Flow (Current Socket Layer)

The current implementation focuses on **audio control events** between frontend and backend:

1. Client connects via WebSocket.
2. Client sends `VOICECHAT_AUDIO_START` (MessagePack) with audio configuration (sampling rate, language, etc.).
3. Server:
   - Validates payload.
   - Registers the WebSocket for the session.
   - Updates session state to `ACTIVE`.
   - Sends an ACK back to the client.
4. Client streams `VOICECHAT_AUDIO_CHUNK` events with raw PCM audio in the payload.
5. Client sends `VOICECHAT_AUDIO_END` when done speaking.

In the current codebase, **the socket layer is responsible for validation, session tracking, and acknowledgements**. The actual STT/LLM/TTS pipeline will be attached behind this interface.

### 3. Future End-to-End Voice Flow (Target Architecture)

Once STT/LLM/TTS modules are implemented, the full flow will look like:

```
Client → VOICECHAT_AUDIO_START/CHUNK/END (MessagePack) → Socket Module
Socket Module → stream audio → STT Service
STT Service → transcripts → LLM Service
LLM Service → response text → TTS Service
TTS Service → audio chunks → Socket Module
Socket Module → VOICECHAT_RESPONSE_* events → Client
Client → play audio
```

The full flow and speculative generation behavior are described in more detail in [Voice Mode Implementation Reference](../reference/voice-mode-implementation.md). That doc is conceptual; **this document reflects the concrete implementation of the socket layer**.

## WebSocket Events & Message Envelope

All WebSocket messages share the same top-level envelope. **For complete protocol specification, see [WebSocket Protocol Specification](../protocol/websocket-protocol.md#base-message-structure)**.

```ts
{
  eventType: string; // e.g. "voicechat.audio.start"
  eventId: string; // UUIDv7 (time-ordered)
  sessionId: string; // UUIDv7 (same for one session)
  payload: object; // Event-specific payload
}
```

**Key Points**:

- All field names use **camelCase** (not snake_case)
- `sessionId` is required and must be the same for all events in a session
- No `sequence_number` field (removed from protocol)
- For response chunks, ordering is handled via unique `utteranceId` in payload

### Client → Server Events (Implemented)

- `VOICECHAT_AUDIO_START` (`"voicechat.audio.start"`)
  - Starts an audio session for a given WebSocket connection.
  - Payload includes audio configuration (e.g. `samplingRate`, `language`, `voiceId`).
- `VOICECHAT_AUDIO_CHUNK` (`"voicechat.audio.chunk"`)
  - Sends a `Uint8Array` of raw PCM audio (16kHz, 16-bit, mono).
- `VOICECHAT_AUDIO_END` (`"voicechat.audio.end"`)
  - Signals end of user speech for the current turn.

### Server → Client Events (Socket Layer Implemented, Pipeline Planned)

These events are **partially wired at the socket/message-pack layer** and will be fully utilized once STT/LLM/TTS services are implemented:

- `VOICECHAT_RESPONSE_START`
- `VOICECHAT_RESPONSE_CHUNK`
- `VOICECHAT_RESPONSE_COMPLETE`
- `VOICECHAT_RESPONSE_INTERRUPT`
- `VOICECHAT_RESPONSE_STOP`
- `VOICECHAT_ERROR` (error frames encapsulating structured error payloads)

The exact payload shapes are defined in [`src/modules/socket/types/events.ts`](../src/modules/socket/types/events.ts) and mirrored in the frontend.

## Technology Decisions

### WebSockets over WebRTC

**Decision**: Use **native WebSockets** (via the `ws` library) for real-time communication, with a **custom MessagePack protocol**.

**Rationale**:

- Simple, battle-tested transport (RFC 6455).
- Full control over protocol (MessagePack envelope + custom events).
- Efficient binary format for audio and metadata.
- Easy to mirror the protocol on the frontend and in future integrations (e.g. Twilio adapters).

**References**:

- [WebSocket Protocol RFC 6455](https://datatracker.ietf.org/doc/html/rfc6455)
- [ws GitHub Repository](https://github.com/websockets/ws)

### LLM Provider: OpenAI GPT-4

**Decision**: Use OpenAI GPT-4 for conversation intelligence.

**Rationale**:

- High-quality conversational AI
- Good API documentation and support
- Reliable performance
- Context management capabilities

**References**:

- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)
- [OpenAI GPT-4 Guide](https://platform.openai.com/docs/guides/gpt)

### STT Provider: Deepgram

**Decision**: Use Deepgram for Speech-to-Text conversion.

**Rationale**:

- Real-time streaming transcription
- Low latency
- Good accuracy
- WebSocket support for streaming

**Alternative**: Google Speech-to-Text

**References**:

- [Deepgram API Documentation](https://developers.deepgram.com/)
- [Deepgram Streaming](https://developers.deepgram.com/docs/streaming)

### TTS Provider: ElevenLabs

**Decision**: Use ElevenLabs for Text-to-Speech conversion.

**Rationale**:

- High-quality, natural-sounding voices
- Low latency
- Good API for streaming

**Alternative**: Google Cloud Text-to-Speech

**References**:

- [ElevenLabs API Documentation](https://elevenlabs.io/docs/api-reference)
- [ElevenLabs Streaming](https://elevenlabs.io/docs/api-reference/text-to-speech)

## Data Flow

### Audio Format Specifications

- **Input Format**: PCM, 16kHz, 16-bit, mono
- **Output Format**: MP3 or Opus (configurable)
- **Chunk Size**: 100-200ms chunks for low latency
- **Buffer Size**: 1-2 seconds before STT processing

### Message Types

#### Client → Server

```typescript
{
  type: 'audio_chunk',
  data: string, // base64 encoded audio
  sessionId: string,
  timestamp: number
}

{
  type: 'start_call',
  sessionId: string
}

{
  type: 'end_call',
  sessionId: string
}
```

#### Server → Client

```typescript
{
  type: 'audio_response',
  data: string, // base64 encoded audio
  sessionId: string,
  timestamp: number
}

{
  type: 'transcript',
  text: string,
  speaker: 'user' | 'ai',
  sessionId: string,
  timestamp: number
}

{
  type: 'error',
  message: string,
  code: string
}
```

## Session Management

Each WebSocket connection represents a call session:

- Unique session ID per connection
- Conversation context maintained per session
- Session state: `idle`, `active`, `ended`
- Automatic cleanup on disconnect

## Error Handling

- Connection failures: Automatic reconnection with exponential backoff
- API failures: Graceful degradation, error messages to client
- Audio processing errors: Retry logic, fallback mechanisms
- Rate limiting: Queue management for API calls

## Scalability Considerations

- Horizontal scaling: Native WebSocket with Redis adapter for multi-server (future)
- Load balancing: Stateless design, session management in memory (Redis planned)
- API rate limiting: Queue system for LLM/STT/TTS calls
- Audio buffering: Efficient memory management for audio chunks

## Future Enhancements

- Phone integration via Twilio
- Conversation recording and storage
- Sentiment analysis in real-time
- Multi-language support
- Custom voice models
- CRM integrations

## Related Documents

- [WebSocket Protocol Specification](../protocol/websocket-protocol.md) - Complete protocol specification (single source of truth)
- [WebSocket Quick Reference](../protocol/websocket-quick-reference.md) - Quick lookup guide
- [API Documentation](../api/api.md) - REST + WebSocket API overview
- [Folder Structure Documentation](../code/folder-structure.md) - Detailed folder structure

## References

- [WebSocket Protocol (RFC 6455)](https://datatracker.ietf.org/doc/html/rfc6455)
- [Express.js Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)
- [Node.js Performance Best Practices](https://nodejs.org/en/docs/guides/simple-profiling/)
