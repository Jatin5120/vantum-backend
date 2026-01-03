# Architecture Decision Records (ADR)

**Version**: 1.0.0
**Last Updated**: 2024-12-27
**Status**: Active

Complete record of architectural decisions with rationale, alternatives considered, and trade-offs.

## Overview

This document records all significant architectural decisions made during the development of the Vantum backend. Each decision is documented in ADR format (Architecture Decision Record) to maintain transparency and provide context for future development.

**ADR Format**:
- **Context**: Why was this decision needed?
- **Decision**: What did we decide?
- **Rationale**: Why is this the best choice?
- **Alternatives Considered**: What other options did we evaluate?
- **Consequences**: Impact and trade-offs
- **Status**: Accepted, Rejected, Superseded, Deprecated

---

## ADR Index

1. [Same Pipeline for Dev and Production](#adr-001-same-pipeline-for-dev-and-production)
2. [Bidirectional Audio Resampling](#adr-002-bidirectional-audio-resampling)
3. [Session-Level Persistent Connections](#adr-003-session-level-persistent-connections)
4. [Handler + Service Separation](#adr-004-handler--service-separation)
5. [Service-Oriented Module Structure](#adr-005-service-oriented-module-structure)
6. [UUID v7 for Session IDs](#adr-006-uuid-v7-for-session-ids)
7. [Interruption Handling Strategy](#adr-007-interruption-handling-strategy)
8. [Streaming for LLM and TTS](#adr-008-streaming-for-llm-and-tts)
9. [MessagePack for WebSocket Protocol](#adr-009-messagepack-for-websocket-protocol)
10. [No Development/Production Flag](#adr-010-no-developmentproduction-flag)
11. [TTS Provider Selection (Cartesia)](#adr-011-tts-provider-selection-cartesia)
12. [Server-Generated Session IDs](#adr-012-server-generated-session-ids)
13. [Single Unified EVENTS Object](#adr-013-single-unified-events-object)

---

## ADR-001: Same Pipeline for Dev and Production

**Date**: 2024-11-15
**Status**: ✅ Accepted

### Context

We need to support two client types:
- Development: Browser (Web Audio API, 48kHz)
- Production: Twilio phone calls (μ-law, 8kHz)

Should we have separate code paths for dev vs production, or use the same pipeline?

### Decision

**Use identical audio processing pipeline for both browser (dev) and Twilio (production)**

After the audio reaches the backend and is resampled, the pipeline is identical:
```
Browser (48kHz) ──┐
                  ├──> Resample to 16kHz ──> STT → LLM → TTS ──> Resample back
Twilio (8kHz) ───┘
```

### Rationale

- **Accuracy**: Dev environment accurately reflects production behavior
- **Simplicity**: No separate dev/prod code paths to maintain
- **Testing**: What works in dev works in production
- **Debugging**: Issues can be reproduced locally
- **Maintenance**: Single codebase, no divergence risk

### Alternatives Considered

**Option A**: Separate dev/prod codepaths
- ❌ Pros: Could optimize each path independently
- ❌ Cons: Code drift, maintenance burden, different bugs in each environment

**Option B**: Production-only pipeline (no local dev)
- ❌ Pros: Simpler codebase
- ❌ Cons: Makes local development impossible, slow iteration

### Consequences

**Positive**:
- Fast local development with production parity
- Confidence that dev testing validates production
- Single set of tests covers both environments

**Negative**:
- Must support both audio formats (minor complexity)
- Resampling overhead (but negligible: <1ms per chunk)

**Trade-offs Accepted**: Small resampling overhead is worth dev/prod parity

---

## ADR-002: Bidirectional Audio Resampling

**Date**: 2024-11-20
**Status**: ✅ Accepted

### Context

Different components operate at different sample rates:
- Browser: 48kHz (Web Audio API standard)
- Twilio: 8kHz (telephony standard)
- Deepgram (STT): 16kHz optimal
- Cartesia (TTS): 16kHz output

How do we handle these mismatched sample rates?

### Decision

**Implement bidirectional audio resampling**

**Input Pipeline**:
- Browser: 48kHz → 16kHz (downsample)
- Twilio: 8kHz → 16kHz (upsample)

**Output Pipeline**:
- TTS: 16kHz → 48kHz (browser, upsample)
- TTS: 16kHz → 8kHz (Twilio, downsample)

**Library**: `wave-resampler` (pure JavaScript, no native dependencies)

### Rationale

- **STT Quality**: Deepgram performs best at 16kHz
- **TTS Quality**: Cartesia generates high-quality 16kHz audio
- **Compatibility**: Browser requires 48kHz, Twilio requires 8kHz
- **Performance**: <1ms latency per 100ms chunk (negligible)
- **Deployment**: No native dependencies (simple deployment)

### Alternatives Considered

**Option A**: Use 8kHz for all components
- ❌ Pros: No resampling needed
- ❌ Cons: Poor STT accuracy, degraded TTS quality

**Option B**: Force Deepgram to use 8kHz
- ❌ Pros: No input resampling
- ❌ Cons: Degrades transcript quality significantly

**Option C**: Use native resampling library (libsamplerate)
- ❌ Pros: Higher quality resampling
- ❌ Cons: Requires CMake, native compilation, deployment complexity

### Consequences

**Positive**:
- Optimal quality for all components
- Fast, pure JavaScript implementation
- Simple deployment (no native deps)

**Negative**:
- Small CPU overhead (<1% per session)
- Additional code complexity (minimal)

**Trade-offs Accepted**: Minor CPU overhead is worth quality improvement

---

## ADR-003: Session-Level Persistent Connections

**Date**: 2024-11-22
**Status**: ✅ Accepted

### Context

Should we create a new Deepgram connection for each user utterance, or maintain one persistent connection per session?

### Decision

**One persistent Deepgram WebSocket connection per session (call)**

Connection lifecycle:
- Open: When audio session starts
- Keep-alive: Throughout entire call
- Close: When call ends

### Rationale

- **Latency**: Eliminates 3s connection overhead per utterance
- **Context**: Deepgram maintains acoustic context across utterances
- **Simplicity**: Simpler state management (1:1 session-to-connection mapping)
- **Reliability**: Transparent reconnection if connection drops mid-call

### Alternatives Considered

**Option A**: New connection per utterance
- ❌ Pros: Simpler resource management
- ❌ Cons: 3s latency per utterance, loses acoustic context

**Option B**: Connection pooling
- ❌ Pros: Reuses connections across sessions
- ❌ Cons: Added complexity, no clear benefit, loses per-session context

### Consequences

**Positive**:
- Real-time transcription (<200ms from audio to transcript)
- Better accuracy (acoustic context preserved)
- Simple state management

**Negative**:
- More memory per session (WebSocket + buffers)
- Must handle reconnection on mid-call disconnect

**Trade-offs Accepted**: Memory overhead is minimal (<1MB per session)

---

## ADR-004: Handler + Service Separation

**Date**: 2024-10-10
**Status**: ✅ Accepted

### Context

How should we organize business logic in the WebSocket server? Should handlers be stateless or stateful?

### Decision

**Handlers are stateless pure functions; Services are stateful singletons**

**Pattern**:
```typescript
// Handler: Stateless, routes to service
export async function handleAudioChunk(payload: AudioChunkPayload, sessionId: string) {
  await AudioService.processChunk(sessionId, payload.audio);
}

// Service: Stateful, manages resources
class AudioServiceClass {
  private buffers = new Map<string, Buffer[]>();
  async processChunk(sessionId: string, audio: Buffer) { /* ... */ }
}
```

### Rationale

- **Testability**: Pure functions are trivial to test
- **Clarity**: Clear separation of routing vs business logic
- **Industry Standard**: NestJS, Spring MVC, etc. use this pattern
- **Maintainability**: Easy to reason about data flow

### Alternatives Considered

**Option A**: Single-file handlers with embedded state
- ❌ Pros: Fewer files
- ❌ Cons: Poor testability, tight coupling, hard to reuse logic

**Option B**: Class-based handlers
- ❌ Pros: Object-oriented
- ❌ Cons: Unnecessary complexity, state unclear

### Consequences

**Positive**:
- Highly testable code
- Clear responsibilities
- Easy to add new functionality

**Negative**:
- More files (handlers/ and services/ directories)
- Must understand pattern to contribute

**Trade-offs Accepted**: Slightly more boilerplate is worth maintainability

**Non-negotiable**: This pattern is mandatory for all modules

---

## ADR-005: Service-Oriented Module Structure

**Date**: 2024-10-12
**Status**: ✅ Accepted

### Context

How should we organize the codebase as it grows? By feature, by layer, or by service domain?

### Decision

**Organize by service domain (audio, socket, stt, llm, tts, conversation, telephony)**

**Structure**:
```
src/modules/
├── socket/        # WebSocket connections
├── audio/         # Audio resampling
├── stt/           # Speech-to-Text
├── llm/           # LLM conversation (future)
├── tts/           # Text-to-Speech (future)
├── conversation/  # Orchestration (future)
└── telephony/     # Twilio integration (future)
```

Each module is self-contained with its own:
- `handlers/` - Event handlers
- `services/` - Business logic
- `types/` - Type definitions
- `utils/` - Helper functions
- `config/` - Configuration

### Rationale

- **Clear Boundaries**: Each module has defined responsibilities
- **Scalability**: Easy to add new modules as features grow
- **Independence**: Modules can be tested in isolation
- **Understandability**: Easy to navigate codebase

### Alternatives Considered

**Option A**: Feature-oriented (by call flow steps)
- ❌ Pros: Groups related functionality
- ❌ Cons: Tight coupling, unclear boundaries, hard to reuse

**Option B**: Monolithic (single module)
- ❌ Pros: Simplest initially
- ❌ Cons: Doesn't scale, becomes unmaintainable

### Consequences

**Positive**:
- Easy to find code (clear module boundaries)
- Can develop modules independently
- Scales well to large team

**Negative**:
- More directories
- Must understand module boundaries

**Trade-offs Accepted**: Directory structure complexity is worth long-term maintainability

---

## ADR-006: UUID v7 for Session IDs

**Date**: 2024-10-15
**Status**: ✅ Accepted

### Context

What format should session identifiers use? Random strings, auto-increment IDs, or UUIDs?

### Decision

**Use UUID v7 for session identifiers**

### Rationale

- **Time-Ordered**: Sortable by creation time (better than UUID v4)
- **Globally Unique**: No collision risk across servers
- **Standard**: Works with databases, logs, monitoring tools
- **Debugging**: Can determine session age from ID alone
- **Future-Proof**: Supports distributed systems (no coordination needed)

**Library**: `uuid` v11.0.3 (supports UUID v7)

### Alternatives Considered

**Option A**: UUID v4 (random)
- ❌ Pros: Standard, widely used
- ❌ Cons: Not time-ordered, harder to debug

**Option B**: Auto-increment IDs
- ❌ Pros: Simple, short
- ❌ Cons: Requires coordination, not globally unique, hard to scale

**Option C**: Nanoid
- ❌ Pros: Shorter strings
- ❌ Cons: Non-standard, no time-ordering

### Consequences

**Positive**:
- Easy debugging (sessions sorted by time)
- No collision risk
- Database-friendly (indexed UUID)

**Negative**:
- Slightly longer strings than Nanoid
- Clients must parse UUID (minor)

**Trade-offs Accepted**: Standardization is worth slightly longer IDs

---

## ADR-007: Interruption Handling Strategy

**Date**: 2024-11-25
**Status**: ✅ Accepted

### Context

How should we handle user interruptions when AI is speaking? Ignore, queue, or cancel?

### Decision

**Cancel TTS immediately, preserve interrupted message in history, return to LISTENING**

**Flow**:
1. Detect user speech during RESPONDING state (VAD threshold)
2. Cancel TTS generation and playback immediately
3. Transition to INTERRUPTED state (<100ms)
4. Keep interrupted message in conversation history with `interrupted: true` flag
5. Transition to LISTENING state
6. Process new user input normally

### Rationale

- **Responsive UX**: User feels in control, immediate feedback
- **Natural Conversation**: Mimics human conversation (people interrupt each other)
- **Context Preservation**: AI knows it was interrupted, can reference it
- **User Satisfaction**: Users prefer responsive systems

### Alternatives Considered

**Option A**: Queue interruption, finish current response
- ❌ Pros: Simpler implementation
- ❌ Cons: Poor UX (user must wait), feels unresponsive

**Option B**: Discard interrupted message from history
- ❌ Pros: Cleaner history
- ❌ Cons: Loses context, AI can't reference what it was saying

**Option C**: Ignore interruptions entirely
- ❌ Pros: Simplest
- ❌ Cons: Terrible UX, users feel powerless

### Consequences

**Positive**:
- Excellent UX (immediate response to interruption)
- Natural conversation flow
- Maintains conversation coherence

**Negative**:
- More complex state machine (INTERRUPTED state)
- Must implement VAD threshold tuning
- Wasted LLM/TTS tokens on interrupted responses

**Trade-offs Accepted**: Wasted tokens are worth UX improvement

**Example**:
```typescript
// Conversation history after interruption
[
  { role: 'user', content: 'What are your features?' },
  { role: 'assistant', content: 'We have three main—', interrupted: true },
  { role: 'user', content: 'Just tell me the price.' },
  { role: 'assistant', content: 'Pricing starts at $99/month.' }
]
```

---

## ADR-008: Streaming for LLM and TTS

**Date**: 2024-11-18
**Status**: ✅ Accepted

### Context

Should we wait for complete LLM response before generating TTS, or stream both?

### Decision

**Use streaming APIs for both LLM (OpenAI) and TTS (Cartesia)**

**Flow**:
1. LLM streams tokens as they're generated
2. Buffer first few tokens (for TTS sentence boundary)
3. Start TTS generation on first complete sentence
4. Stream TTS audio chunks to client as they're generated
5. User hears AI speaking before LLM finishes generating full response

### Rationale

- **Latency**: Reduces time-to-first-audio by 2-5 seconds
- **Natural Feel**: Mimics human speech (people think while talking)
- **Industry Standard**: All modern voice AI uses streaming
- **User Experience**: Feels significantly more responsive

### Alternatives Considered

**Option A**: Wait for complete LLM response
- ❌ Pros: Simpler implementation
- ❌ Cons: 5-10s delay before AI starts speaking (terrible UX)

**Option B**: Batch processing (process in chunks)
- ❌ Pros: Some latency reduction
- ❌ Cons: Still not real-time, choppy experience

### Consequences

**Positive**:
- Real-time conversation feel
- 2-5s latency reduction
- Better user engagement

**Negative**:
- More complex implementation (streaming buffers)
- Must handle streaming errors
- Harder to test

**Trade-offs Accepted**: Implementation complexity is worth UX improvement

**Performance Target**: <500ms from user stops speaking to AI starts speaking

---

## ADR-009: MessagePack for WebSocket Protocol

**Date**: 2024-10-08
**Status**: ✅ Accepted

### Context

What serialization format should we use for WebSocket messages? JSON, MessagePack, or Protobuf?

### Decision

**Use MessagePack binary serialization for all WebSocket messages**

**Library**: `msgpackr` (fast, TypeScript-friendly)

### Rationale

- **Size**: 30-50% smaller than JSON (critical for audio streaming)
- **Speed**: Faster serialization/deserialization than JSON
- **Binary Support**: Native binary (no base64 encoding for audio)
- **Proven**: Used by Redis, RabbitMQ, gRPC
- **Type-Safe**: Works well with TypeScript

### Alternatives Considered

**Option A**: JSON
- ❌ Pros: Human-readable, standard
- ❌ Cons: Larger messages, must base64-encode audio (33% overhead)

**Option B**: Protobuf
- ❌ Pros: Smallest size, schema validation
- ❌ Cons: Requires compilation step, more complex, overkill for this use case

### Consequences

**Positive**:
- 30-50% bandwidth savings
- No base64 overhead for audio
- Faster message processing

**Negative**:
- Not human-readable (must use tools to inspect)
- Less common (some developers unfamiliar)

**Trade-offs Accepted**: Non-human-readable is worth performance gain

**Measurement**: 100ms audio chunk at 48kHz
- JSON (base64): ~13KB
- MessagePack (binary): ~9.6KB (26% reduction)

---

## ADR-010: No Development/Production Flag

**Date**: 2024-11-10
**Status**: ✅ Accepted

### Context

Should we have explicit `NODE_ENV` or `IS_PRODUCTION` flags that change behavior?

### Decision

**No explicit dev/prod flag; same code runs in both environments**

**Differentiation**:
- Client type detected from connection (browser vs Twilio)
- External API keys from environment variables
- No code branching on `NODE_ENV`

### Rationale

- **No Code Drift**: Dev and prod run identical code
- **Confidence**: Testing in dev validates prod
- **Simplicity**: No environment-specific branches
- **Fewer Bugs**: Can't have prod-only bugs

### Alternatives Considered

**Option A**: `NODE_ENV`-based branching
- ❌ Pros: Can optimize differently per environment
- ❌ Cons: Code drift risk, prod-only bugs

**Option B**: Separate dev/prod builds
- ❌ Pros: Maximum optimization per environment
- ❌ Cons: High maintenance burden, divergence risk

### Consequences

**Positive**:
- Dev accurately reflects prod
- No prod-only bugs
- Simpler codebase

**Negative**:
- Can't optimize differently per environment
- Must support both client types always

**Trade-offs Accepted**: Slight code complexity is worth dev/prod parity

---

## ADR-011: TTS Provider Selection (Cartesia)

**Date**: 2024-12-15
**Status**: ✅ Accepted

### Context

Which Text-to-Speech provider should we use? ElevenLabs, Google, AWS Polly, or Cartesia?

### Decision

**Use Cartesia for Text-to-Speech generation**

### Rationale

- **Quality**: High-quality, natural-sounding voices
- **Latency**: Low-latency streaming optimized for real-time
- **Real-Time Optimized**: Designed specifically for conversational AI
- **Cost-Effective**: Competitive pricing for high-volume usage
- **Streaming**: Native streaming support (critical for low latency)
- **Reliability**: Good uptime and API stability

### Alternatives Considered

**Option A**: ElevenLabs
- ✅ Pros: Excellent voice quality, wide voice selection
- ❌ Cons: Higher cost, slightly higher latency

**Option B**: Google Cloud Text-to-Speech
- ✅ Pros: Reliable, good quality, widely used
- ❌ Cons: Not optimized for real-time conversations, higher latency

**Option C**: AWS Polly
- ✅ Pros: Highly reliable, good AWS integration
- ❌ Cons: Less natural-sounding, not optimized for streaming

### Consequences

**Positive**:
- Low latency streaming (critical for real-time UX)
- Cost-effective at scale
- Natural conversation feel

**Negative**:
- Newer provider (less battle-tested than Google/AWS)
- Smaller voice selection than ElevenLabs

**Trade-offs Accepted**: Newer provider risk is worth latency and cost benefits

**Integration Details**:
- Output format: 16kHz PCM
- Streaming: Yes (chunk-by-chunk)
- Voice selection: Configured per-session

---

## ADR-012: Server-Generated Session IDs

**Date**: 2024-12-27
**Status**: ✅ Accepted

### Context

Should the client or server generate session IDs? Who controls session lifecycle?

### Decision

**Server generates session IDs (UUIDv7) and sends to client in `connection.ack`**

**Flow**:
1. Client connects to WebSocket
2. Server generates sessionId (UUIDv7)
3. Server sends `connection.ack` with sessionId
4. Client uses that sessionId in all subsequent messages

### Rationale

- **Server Control**: Server is source of truth for sessions
- **No Collisions**: Server prevents duplicate session IDs
- **Security**: Client can't forge or predict session IDs
- **Simplicity**: Client doesn't need UUID generation
- **Auditability**: Server logs all session creation

### Alternatives Considered

**Option A**: Client-generated session IDs
- ❌ Pros: Client has ID before first message
- ❌ Cons: Collision risk, security issue, server can't validate

**Option B**: Shared ID generation (client and server coordinate)
- ❌ Pros: Distributed control
- ❌ Cons: Complex, no clear benefit

### Consequences

**Positive**:
- Server has full control over sessions
- No collision risk
- Simpler client implementation
- Better security

**Negative**:
- Client must wait for `connection.ack` before sending messages
- Slightly more complex connection flow

**Trade-offs Accepted**: Connection flow complexity is worth security and control

**CRITICAL**: This was a bug in the original protocol specification (claimed client-generated). Fixed in v1.1.0.

---

## ADR-013: Single Unified EVENTS Object

**Date**: 2024-12-27
**Status**: ✅ Accepted

### Context

How should we organize event type constants? Multiple objects by domain, or single unified object?

### Decision

**Single unified EVENTS object with hierarchical structure**

**Structure**:
```typescript
export const EVENTS = {
  connection: {
    lifecycle: { ACK: 'connection.lifecycle.ack', ... },
    error: { GENERAL: 'connection.error.general', ... }
  },
  audio: {
    input: { START: 'audio.input.start', ... },
    output: { CHUNK: 'audio.output.chunk', ... }
  },
  // ... all other domains
}
```

**Usage**:
```typescript
import { EVENTS } from '@Jatin5120/vantum-shared';
EVENTS.audio.input.START  // 'audio.input.start'
```

### Rationale

- **Single Import**: Only need to import one object
- **Discoverability**: Autocomplete shows all events
- **Organization**: Hierarchical structure is self-documenting
- **Type-Safe**: Full TypeScript support
- **Easy to Iterate**: Can enumerate all events programmatically
- **Standards-Compliant**: Follows CloudEvents patterns

### Alternatives Considered

**Option A**: Multiple objects by domain
- ❌ Pros: Can import only what you need
- ❌ Cons: Must import 7+ objects, hard to discover all events

**Option B**: Flat object with all events
- ❌ Pros: Simplest
- ❌ Cons: No organization, hundreds of top-level keys

### Consequences

**Positive**:
- Single import for all events
- Excellent IDE autocomplete
- Self-documenting structure
- Easy to add new domains

**Negative**:
- Large object (but tree-shakeable)
- Must understand hierarchical structure

**Trade-offs Accepted**: Structure complexity is worth usability

**Migration**: Legacy `VOICECHAT_EVENTS` maintained for backward compatibility, maps to new structure

---

## Summary

### Decision Categories

**Infrastructure**: ADR-001, ADR-003, ADR-009, ADR-012, ADR-013
**Architecture**: ADR-004, ADR-005, ADR-006
**Audio Processing**: ADR-002
**User Experience**: ADR-007, ADR-008
**External Services**: ADR-011
**Development Process**: ADR-010

### Status Overview

- ✅ **Accepted**: All 13 decisions
- ❌ **Rejected**: 0
- 🔄 **Superseded**: 0
- ⚠️ **Deprecated**: 0

---

## Related Documents

- [Architecture Overview](./architecture.md) - System architecture
- [State Machine](./state-machine.md) - Conversation state flow
- [Data Models](./data-models.md) - Data structures
- [External Services](../integrations/external-services.md) - API integrations
- [WebSocket Protocol](../protocol/websocket-protocol.md) - Protocol specification

---

**This document is the single source of truth for architectural decisions in the Vantum project. All major technical decisions must be documented here.**
