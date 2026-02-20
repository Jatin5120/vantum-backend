# Architecture Documentation

**Version**: 1.4.0
**Last Updated**: 2026-02-20
**Status**: Active

> **Note**: For detailed information about the folder structure and module organization, see [Folder Structure Documentation](../code/folder-structure.md).
> **For complete WebSocket protocol specification, see [WebSocket Protocol Specification](../protocol/websocket-protocol.md)**.
> **For MVP audio pipeline details, see [MVP Audio Pipeline Documentation](./mvp-audio-pipeline.md)**.

## System Architecture

### Overview

Vantum backend uses a **native WebSocket (`ws`) server + MessagePack** protocol for real-time bidirectional audio communication between clients and the AI processing pipeline.

At a high level:

- The **frontend** connects to `ws://<host>:<port>/ws` using the browser `WebSocket` API (development only).
- The **backend** uses a `WebSocketServer` from the `ws` library, initialized in the `socket` module.
- **Production uses Twilio phone calls** (not browser audio).
- All messages are **binary MessagePack frames** following a shared envelope (see [WebSocket Protocol Specification](../protocol/websocket-protocol.md#base-message-structure)):
  - `eventType: string` (from unified `EVENTS` object)
  - `eventId: string` (UUIDv7)
  - `sessionId: string` (UUIDv7, server-generated)
  - `payload: object`

```
┌─────────────────────┐         ┌─────────────────────┐
│ Browser (Dev Only)  │         │ Twilio (Production) │
└──────────┬──────────┘         └──────────┬──────────┘
           │                               │
           │ 48kHz PCM                     │ 8kHz μ-law
           │                               │
           ▼                               ▼
┌─────────────────────────────────────────────────────┐
│  Node.js Backend (ws server @ /ws)                  │
│                                                     │
│  ┌──────────────────────────────────┐             │
│  │   Socket Module (modules/socket) │             │
│  │   - SessionService               │             │
│  │   - WebSocketService              │             │
│  │   - MessagePack serialization    │             │
│  └──────────┬───────────────────────┘             │
│             │                                      │
│             ▼                                      │
│  ┌──────────────────────────────────┐             │
│  │   Audio Module (modules/audio)   │             │
│  │   ✅ IMPLEMENTED (Layer 1)       │             │
│  │   - AudioResamplerService        │             │
│  │   - Bidirectional resampling     │             │
│  │   - 48kHz/8kHz → 16kHz           │             │
│  └──────────┬───────────────────────┘             │
│             │                                      │
│             ▼ 16kHz PCM                            │
│  ┌──────────────────────────────────┐             │
│  │   STT Module (modules/stt)       │             │
│  │   ✅ COMPLETE (Layer 1)          │             │
│  │   - Deepgram WebSocket client    │             │
│  │   - Real-time transcription      │             │
│  │   - Session management           │             │
│  │   - Error handling & reconnection│             │
│  │   - 85%+ test coverage           │             │
│  └──────────┬───────────────────────┘             │
│             │                                      │
│             ▼ Transcripts                          │
│  ┌──────────────────────────────────┐             │
│  │  LLM Module (modules/llm)        │             │
│  │  ✅ COMPLETE (Layer 2)           │             │
│  │  - OpenAI GPT-4.1 streaming      │             │
│  │  - Semantic chunking (||BREAK||) │             │
│  │  - Conversation context mgmt     │             │
│  │  - Error classification & retry  │             │
│  │  - 90%+ test coverage            │             │
│  └──────────┬───────────────────────┘             │
│             │                                      │
│             ▼ Semantic text chunks                 │
│  ┌──────────────────────────────────┐             │
│  │  TTS Module (modules/tts)        │             │
│  │  ✅ COMPLETE (Layer 2)           │             │
│  │  - Cartesia WebSocket client     │             │
│  │  - Real-time TTS synthesis       │             │
│  │  - Sequential audio playback     │             │
│  │  - State machine + cleanup       │             │
│  │  - 90%+ test coverage            │             │
│  └──────────────────────────────────┘             │
└─────────────────────────────────────────────────────┘
```

**Implementation Status**:

- ✅ **Layer 1 COMPLETE** (Grade A - 95.25%): Socket layer, audio resampling, STT integration
  - Socket infrastructure: Production-ready
  - Audio resampling: Production-ready with 85%+ test coverage
  - STT integration: Production-ready with 85%+ test coverage
  - 20+ test files, comprehensive integration tests
- ✅ **Layer 2 COMPLETE** (Grade A - 95/100): Full AI pipeline — STT → LLM → TTS
  - STT integration: Complete (Deepgram, 85%+ coverage)
  - LLM integration: Complete (OpenAI GPT-4.1, 90%+ coverage, semantic streaming)
  - TTS integration: Complete (Cartesia, 90%+ coverage, state machine)
  - Full pipeline: Complete (audio.end → transcript → LLM → TTS → client)
  - Memory leak prevention: Complete (P0/P1/P2 fixes, 42+ regression tests)
  - Overall test coverage: 96.5%+ (949+ tests, 33 test files)
- ⏳ **Layer 3 FUTURE**: Telephony gateway (Twilio), authentication, database integration

### Module Responsibilities

#### Socket Module

The `socket` module (`src/modules/socket`) owns:

- **WebSocket server** initialization and graceful shutdown.
- **Connection lifecycle**: new connections, disconnections, error handling.
- **Session management** (`SessionService`): create/update/delete sessions, track state and metadata.
- **WebSocket routing** (`message.handler.ts`): decode MessagePack frames and dispatch by event.
- **Audio control events** (`audio.handler.ts`): handle audio start/chunk/end events.
- **Message packing** (`MessagePackHelper`): static utility class for packing server → client events into MessagePack.
- **Safe WebSocket operations** (`WebSocketUtils`): static utility class with `safeSend`, `safeClose` with logging.

See [WebSocket Protocol Specification](../protocol/websocket-protocol.md) for complete message format details.

#### Audio Module

**Status**: ✅ **FULLY IMPLEMENTED (Layer 1)**

The `audio` module (`src/modules/audio`) owns:

- **Audio resampling** (`AudioResamplerService`): stateless service for sample rate conversion
- **Sample rate conversion**: Bidirectional resampling (48kHz/8kHz ↔ 16kHz)
  - Browser: 48kHz → 16kHz (Deepgram optimal)
  - Twilio: 8kHz → 16kHz (Deepgram optimal) → 8kHz (output)
- **Pure JavaScript implementation**: wave-resampler library (no native compilation)
- **Real-time processing**: <1ms latency per 100ms audio chunk
- **Production-ready**: 85%+ test coverage, comprehensive unit and integration tests

**Key Design Decisions**:

- Stateless service (no session state, follows Handler + Service pattern)
- Graceful degradation (returns original audio on error)
- Passthrough optimization (skips resampling if source == target rate)
- Zero native dependencies (pure JavaScript, simple deployment)

See [Audio Resampling Architecture](../audio/audio-resampling.md) for detailed design and [Sample Rate Handling Guide](../audio/sample-rate-handling.md) for different source configurations.

#### STT Module

**Status**: ✅ **FULLY IMPLEMENTED (Layer 1)**

The `stt` module (`src/modules/stt`) provides:

- **Deepgram integration**: WebSocket connection to Deepgram API
- **Real-time transcription**: streaming audio → text conversion
- **Transcript accumulation**: maintain conversation context for LLM (future)
- **Session management**: 1:1 mapping between Vantum sessions and Deepgram connections
- **Error handling**: Hybrid retry strategy with transparent reconnection
- **Resource cleanup**: Automatic cleanup on disconnect
- **Production-ready**: 85%+ test coverage with comprehensive integration tests

**Key Features**:

- Session-level persistent Deepgram connections (ADR-003)
- Transparent mid-stream reconnection (user-invisible)
- Voice Activity Detection (VAD) for speech start/end
- Interim and final transcript support
- Comprehensive error classification and handling
- Graceful degradation on connection failures

See [Deepgram STT Integration Design](../design/deepgram-stt-integration-design.md) for complete specification.

#### LLM Module

**Status**: ✅ **COMPLETE (Layer 2)**

The `llm` module (`src/modules/llm`) provides:

- **OpenAI GPT-4.1 integration**: Streaming conversation AI
- **Semantic chunking**: `||BREAK||` marker extraction for progressive TTS delivery
- **Conversation context management**: Full session history, auto-prune at 50 messages
- **Request queueing**: Per-session queue (max 10), never rejects mid-conversation
- **Error classification**: AUTH, RATE_LIMIT, NETWORK, FATAL with intelligent retry decisions
- **3-tier fallback messages**: Maintains conversation coherence on failures
- **Session cleanup**: Existence checks prevent unnecessary cleanup (P1-7 fix)
- **Production-ready**: 90%+ test coverage, P0 memory leak fixes validated

**Pipeline Position**: Transcript arrives from STT → LLM generates response → Semantic chunks sent to TTS

See [OpenAI Integration Guide](../integrations/openai.md) for setup and operational details.

#### TTS Module

**Status**: ✅ **COMPLETE (Layer 2)**

The `tts` module (`src/modules/tts`) provides:

- **Cartesia integration**: WebSocket connection to Cartesia API
- **Real-time TTS synthesis**: text → audio conversion with streaming
- **Sequential audio playback**: Chunks queued with duration-based delays (no overlap)
- **State machine**: IDLE → CONNECTING → GENERATING → PLAYING → CLOSED lifecycle
- **Session management**: 1:1 mapping between Vantum sessions and Cartesia connections
- **Audio resampling**: 16kHz (Cartesia) → 48kHz (browser) via AudioResamplerService
- **Event listener cleanup**: finally-block cleanup prevents listener accumulation (P0-2 fix)
- **Production-ready**: 90%+ test coverage

**Pipeline Position**: Receives semantic text chunks from LLM → synthesizes → streams audio to client

**Future Enhancements** (Planned):

- Interruption handling (cancel TTS if user speaks during response)
- Speculative generation (start TTS before user finishes speaking)

See [TTS Service Documentation](../services/tts-service.md) for API details.

## Communication Flow

### 1. Connection Establishment

```
Client → WebSocket connect (ws://.../ws)
Server → generates sessionId (UUIDv7)
Server → sends connection.ack with sessionId
Client → uses sessionId in all subsequent messages
```

**Important**: Session ID is **always generated by the server**, not the client. See [Session ID Generation](../protocol/websocket-protocol.md#session-id-generation) for details.

### 2. Current Audio Flow (Full AI Pipeline — Implemented)

The current implementation provides a **complete STT → LLM → TTS pipeline** triggered on `audio.end`:

1. Client connects via WebSocket (browser in dev, Twilio in production).
2. Server sends `connection.ack` with server-generated `sessionId`.
3. Client sends `AUDIO_START` (MessagePack) with audio configuration (sampling rate, language, voiceId) using the sessionId from step 2.
4. Server:
   - Validates payload, registers the WebSocket for the session.
   - Creates Deepgram WebSocket connection (STT).
   - Creates Cartesia WebSocket connection (TTS).
   - Initializes LLM session (conversation context).
   - Updates session state to `ACTIVE`. Sends ACK back to client.
5. Client streams `AUDIO_CHUNK` events with raw PCM audio.
6. Server:
   - Resamples audio (48kHz/8kHz → 16kHz). Forwards to Deepgram (no buffering).
   - Receives interim and final transcripts. Sends to client via WebSocket.
7. Client sends `AUDIO_END` (user stops speaking / "Stop recording").
8. Server:
   - Finalizes Deepgram transcript (accumulated text).
   - Sends transcript to LLM (`llmController.generateResponse()`).
   - LLM streams response, `LLMStreamingService` extracts semantic chunks via `||BREAK||` markers.
   - Each chunk is sent to TTS (`ttsController.synthesize()`).
   - Cartesia generates audio (16kHz) → resampled (48kHz) → sent to client as `RESPONSE_CHUNK` events.
9. Client plays ONLY Cartesia-synthesized audio (no echo of original).

**Key Points**:

- ✅ Full STT → LLM → TTS pipeline implemented
- ✅ Semantic streaming: LLM responses split at `||BREAK||` for low-latency TTS delivery
- ✅ WebSocket stays open after `AUDIO_END` (client receives TTS audio chunks asynchronously)
- ✅ Client hears only Cartesia voice (no original audio echoed)

See [MVP Audio Pipeline Documentation](./mvp-audio-pipeline.md) for detailed flow diagrams.

### 3. Future Enhancements (Layer 3+)

The pipeline is complete. Remaining enhancements are UX/capability improvements:

```
Current:  audio.end (manual) → STT finalize → LLM → TTS
Future 1: VAD silence (auto)  → STT finalize → LLM → TTS
Future 2: VAD + interruption handling (cancel TTS on user speech)
Future 3: Speculative generation (start LLM on interim transcripts)
```

- Automatic trigger on VAD silence (no manual "Stop" button required)
- Interruption handling (cancel TTS if user speaks during response)
- Debouncing for partial transcripts (handle natural speech pauses)
- Speculative generation for near-zero latency responses

## WebSocket Events & Message Envelope

All WebSocket messages share the same top-level envelope. **For complete protocol specification, see [WebSocket Protocol Specification](../protocol/websocket-protocol.md#base-message-structure)**.

```ts
{
  eventType: string; // e.g. "audio.input.start"
  eventId: string; // UUIDv7 (time-ordered)
  sessionId: string; // UUIDv7 (server-generated)
  payload: object; // Event-specific payload
}
```

**Key Points**:

- All field names use **camelCase** (not snake_case)
- `sessionId` is **server-generated** and sent to client in `connection.ack`
- `eventId` is generated per-event (client generates for requests, server generates for responses)
- No `sequence_number` field (removed from protocol)
- For response chunks, ordering is handled via unique `utteranceId` in payload

**Event System**: See [Event System Architecture](../protocol/event-system.md) for complete event reference using the unified `EVENTS` object.

### Client → Server Events (Implemented)

- `audio.input.start` (AUDIO_START)
  - Starts an audio session for a given WebSocket connection.
  - Payload includes audio configuration (e.g. `samplingRate`, `language`).
- `audio.input.chunk` (AUDIO_CHUNK)
  - Sends a `Uint8Array` of raw PCM audio (48kHz or 8kHz, 16-bit, mono).
- `audio.input.end` (AUDIO_END)
  - Signals end of user speech for the current turn.
  - **MVP**: Triggers TTS synthesis with accumulated transcript.

### Server → Client Events (Fully Implemented for MVP)

These events are **fully wired for MVP** (STT + TTS):

- `connection.lifecycle.ack` (CONNECTION_ACK) ✅ Implemented
- `transcript.interim` / `transcript.final` ✅ Implemented (STT)
- `audio.output.start` (RESPONSE_START) ✅ Implemented (TTS)
- `audio.output.chunk` (RESPONSE_CHUNK) ✅ Implemented (TTS)
- `audio.output.complete` (RESPONSE_COMPLETE) ✅ Implemented (TTS)
- `conversation.response.start` (RESPONSE_START) 📝 Planned (LLM)
- `conversation.response.complete` (RESPONSE_COMPLETE) 📝 Planned (LLM)
- `audio.output.cancel` (RESPONSE_INTERRUPT / RESPONSE_STOP) 📝 Planned
- `error.system.*` (ERROR events) ✅ Implemented

The exact payload shapes are defined in `@Jatin5120/vantum-shared` package and mirrored in both backend and frontend.

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

### LLM Provider: OpenAI GPT-4.1

**Decision**: Use OpenAI GPT-4.1 for conversation intelligence.

**Status**: ✅ COMPLETE (Layer 2 - Production-ready, 90%+ test coverage)

**Rationale**:

- High-quality conversational AI
- Good API documentation and support
- Reliable performance
- Context management capabilities
- Streaming support for real-time responses

**References**:

- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)
- [OpenAI GPT-4 Guide](https://platform.openai.com/docs/guides/gpt)

### STT Provider: Deepgram

**Decision**: Use Deepgram for Speech-to-Text conversion.

**Status**: ✅ IMPLEMENTED (Layer 1 - Production-ready)

**Rationale**:

- Real-time streaming transcription
- Low latency (50-200ms)
- High accuracy
- WebSocket support for streaming
- Excellent documentation
- Session-level persistent connections (no reconnection overhead)

**Alternative Considered**: Google Speech-to-Text

**References**:

- [Deepgram API Documentation](https://developers.deepgram.com/)
- [Deepgram Streaming](https://developers.deepgram.com/docs/streaming)

### TTS Provider: Cartesia

**Decision**: Use **Cartesia** for Text-to-Speech conversion.

**Status**: ✅ IMPLEMENTED (Layer 2 - MVP with manual trigger)

**Rationale**:

- High-quality, natural-sounding voices
- Low latency streaming
- Real-time audio generation
- Optimized for conversational AI
- Cost-effective pricing

**Alternative Considered**: ElevenLabs, Google Cloud Text-to-Speech

**References**:

- [Cartesia API Documentation](https://cartesia.ai/docs)
- [Cartesia Streaming TTS](https://cartesia.ai/docs/api-reference/tts)

**See Also**: [Architecture Decision Records](./decisions.md) for complete rationale and alternatives considered.

## Data Flow

### Audio Processing Pipeline (MVP)

**Browser to Backend (Development)**:

```
Browser (48kHz PCM) → WebSocket → Backend AudioHandler (48kHz)
    ↓
AudioResamplerService (wave-resampler) ✅ COMPLETE
    ↓ (downsample 48kHz → 16kHz)
STTService (16kHz PCM) → Deepgram API ✅ COMPLETE
    ↓ (transcription, on audio.end finalize)
Accumulated Transcript → LLMService ✅ COMPLETE
    ↓ (streaming response with ||BREAK|| semantic chunks)
LLMStreamingService chunks → TTSService ✅ COMPLETE
    ↓
Cartesia API → Audio Chunks (16kHz) ✅ COMPLETE
    ↓
AudioResamplerService (16kHz → 48kHz) ✅ COMPLETE
    ↓
Client (48kHz PCM) → Audio Playback ✅ COMPLETE
```

**Twilio to Backend (Production - Future)**:

```
Twilio (8kHz μ-law) → Telephony Gateway 📝 PLANNED
    ↓
AudioResamplerService (8kHz → 16kHz) ✅ COMPLETE (ready for Twilio)
    ↓
STTService (16kHz PCM) → Deepgram API ✅ COMPLETE
    ↓
LLM Service → OpenAI GPT-4.1 ✅ COMPLETE
    ↓
TTS Service → Cartesia ✅ COMPLETE
    ↓
AudioResamplerService (16kHz → 8kHz) ✅ COMPLETE (ready for Twilio)
    ↓
Telephony Gateway → Twilio (8kHz μ-law) 📝 PLANNED
```

### Audio Format Specifications

**Frontend Audio Capture** (Development):

- **Capture Format**: PCM, 48kHz (browser default), 16-bit, mono
- **WebSocket Transmission**: Binary MessagePack frames with audio chunks
- **Chunk Size**: 100ms chunks (~9.6KB at 48kHz)

**Twilio Audio** (Production):

- **Format**: μ-law, 8kHz, 8-bit, mono
- **Transmission**: Twilio Media Streams (WebSocket)
- **Chunk Size**: 20ms chunks (standard telephony)

**Backend Audio Resampling** (✅ Implemented):

- **Input**: PCM, 48kHz or 8kHz, 16-bit, mono
- **Process**: Linear interpolation resampling (wave-resampler library)
- **Output**: PCM, 16kHz, 16-bit, mono
- **Resampled Chunk**: ~3.2KB (after downsampling from 48kHz)
- **Latency**: <1ms per chunk (negligible overhead)
- **Status**: Production-ready, fully tested, bidirectional support

**STT Processing (Deepgram)** (✅ Implemented):

- **Input Format**: PCM, 16kHz, 16-bit, mono (optimal for Deepgram)
- **Buffer Strategy**: Stream chunks immediately (no batching)
- **Transcription Latency**: 50-200ms (measured)
- **Connection**: Session-level persistent WebSocket
- **Reconnection**: Transparent mid-stream reconnection (user-invisible)

**TTS Output (Cartesia)** (✅ Implemented - MVP):

- **Output Format**: PCM, 16kHz (Cartesia native)
- **Chunk Size**: 100-200ms chunks for low latency
- **Resampling**: 16kHz → 48kHz (browser) or 8kHz (Twilio) via AudioResamplerService
- **Trigger**: Manual "Stop recording" button (audio.input.end)
- **Future**: Automatic VAD-based trigger

## Session Management

Each WebSocket connection represents a call session:

- **Session ID**: Server-generated UUID v7, sent to client in `connection.ack`
- **Conversation context**: Maintained per session
- **Session state**: `idle`, `active`, `ended`
- **Automatic cleanup**: On disconnect or timeout
- **Deepgram connection**: 1:1 mapping per session (persistent, with transparent reconnection)
- **Cartesia connection**: 1:1 mapping per session (persistent, with reconnection support)

See [Data Models](./data-models.md) for complete session model structure.

## Error Handling

- **Connection failures**: Graceful error messages to client
- **API failures**: Retry logic with exponential backoff (STT/LLM/TTS)
  - STT: Transparent reconnection (user-invisible)
  - TTS: Retry with backoff (implemented)
  - LLM: Retry with backoff (planned)
- **Audio processing errors**: Graceful degradation, fallback mechanisms
- **Rate limiting**: Queue management for API calls
- **Transparent reconnection**: Mid-stream STT and TTS reconnection implemented and tested

See [External Services Integration](../integrations/external-services.md) for service-specific error handling strategies.

## Quality Assurance

**Test Coverage**: 96.5%+ overall (949+ tests, 33 test files)

**Test Infrastructure**:

- Framework: Vitest 4.0.16
- 33+ test files (unit, integration, E2E, memory-leak regression)
- Comprehensive mocking for all external APIs (Deepgram, OpenAI, Cartesia)
- Real-time flow testing with WebSocket clients

**Test Categories**:

- **Unit Tests**: Services, handlers, utilities
- **Integration Tests**: Complete audio → STT → TTS flow
- **Error Scenario Tests**: Connection failures, reconnection, resource cleanup
- **Concurrent Session Tests**: Multi-session handling

**Quality Metrics**:

- Grade A (95.25%) code quality
- Handler + Service pattern compliance
- Comprehensive error handling
- Resource cleanup verification (no memory leaks)

## Scalability Considerations

**Current Capacity**: 10 concurrent users at launch
**Target Capacity**: 50-100 concurrent users per instance

- **Horizontal scaling**: Native WebSocket with Redis adapter for multi-server (Layer 3)
- **Load balancing**: Stateless design, session management in memory (Redis planned for Layer 3)
- **API rate limiting**: Queue system for LLM/STT/TTS calls
- **Audio buffering**: REMOVED (no echo, no unnecessary buffering)
- **Connection pooling**: Session-level persistent connections for Deepgram and Cartesia (implemented)

See [Scalability Architecture](./scalability.md) for detailed scaling strategy.

## Future Enhancements

### Layer 2 Enhancements (Complete ✅)

- **LLM conversation** (OpenAI GPT-4.1) ✅ COMPLETE
- **Semantic streaming** (`||BREAK||` chunking for low-latency TTS) ✅ COMPLETE
- **Full pipeline** (STT → LLM → TTS, triggered on audio.end) ✅ COMPLETE
- **Interruption handling** (cancel TTS on user speech) 📝 PLANNED (future)
- **Automatic VAD trigger** (no manual "Stop" button) 📝 PLANNED (future)
- **Debouncing for partial transcripts** 📝 PLANNED (future)

### Layer 3 (Planned)

- Telephony integration (Twilio)
- Authentication & authorization
- Database integration
- Redis for distributed sessions

### Layer 4 (Future)

- Conversation recording and storage
- Sentiment analysis
- Multi-language support
- Custom voice models
- CRM integrations

## Related Documents

### Core Architecture

- **[MVP Audio Pipeline Documentation](./mvp-audio-pipeline.md)** - Current MVP flow and future roadmap
- [Data Models](./data-models.md) - Complete data model specifications
- [State Machine](./state-machine.md) - Conversation state machine
- [Architecture Decision Records](./decisions.md) - Key technical decisions
- [Scalability](./scalability.md) - Scaling strategy and bottlenecks

### Protocol & API

- [WebSocket Protocol Specification](../protocol/websocket-protocol.md) - Complete protocol specification (single source of truth)
- [Event System Architecture](../protocol/event-system.md) - Unified EVENTS object reference
- [WebSocket Quick Reference](../protocol/websocket-quick-reference.md) - Quick lookup guide
- [API Documentation](../api/api.md) - REST + WebSocket API overview

### Audio Processing

- [Audio Resampling Architecture](../audio/audio-resampling.md) - Audio resampling design and implementation
- [Sample Rate Handling Guide](../audio/sample-rate-handling.md) - Multi-source sample rate handling

### External Integrations

- [External Services](../integrations/external-services.md) - Deepgram, OpenAI, Cartesia, Twilio
- [Deepgram STT Integration Design](../design/deepgram-stt-integration-design.md) - STT module architecture
- [TTS Service Documentation](../services/tts-service.md) - Complete TTS service API
- [STT Provider Comparison](../reference/stt-provider-comparison.md) - Provider analysis

### Code Organization

- [Folder Structure Documentation](../code/folder-structure.md) - Detailed folder structure
- [Implementation Plan](../development/implementation-plan.md) - Development roadmap

## References

- [WebSocket Protocol (RFC 6455)](https://datatracker.ietf.org/doc/html/rfc6455)
- [Express.js Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)
- [Node.js Performance Best Practices](https://nodejs.org/en/docs/guides/simple-profiling/)
