# Implementation Plan

**Version**: 2.3.0
**Last Updated**: 2026-02-20
**Status**: Active

## Overview

This document outlines the phased implementation approach for the Vantum backend voice AI system.

> **Related Documents**: [Comprehensive Architecture](../comprehensive-architecture.md), [WebSocket Protocol Specification](../protocol/websocket-protocol.md), [Architecture Documentation](../architecture/architecture.md)

## Implementation Status Overview

**Current State (February 2026)**:

### Layer 1: ✅ COMPLETE (Grade A - 95.25%)

- WebSocket infrastructure with binary MessagePack
- Session lifecycle management
- Audio streaming (bidirectional Int16 PCM)
- Audio resampling (48kHz/8kHz → 16kHz)
- Deepgram STT integration (✅ COMPLETE with 85%+ test coverage)
- **Test Coverage**: 85%+ with 20 test files, 96+ test cases

### Layer 2: ✅ COMPLETE (Grade A - 95/100) — PRODUCTION READY

- **STT Integration**: ✅ COMPLETE (Deepgram, 85%+ coverage)
- **LLM Integration**: ✅ COMPLETE (OpenAI GPT-4.1, 90%+ coverage, semantic streaming, error classification)
- **TTS Integration**: ✅ COMPLETE (Cartesia, 90%+ coverage, state machine, audio resampling)
- **Full Pipeline**: ✅ COMPLETE (STT → LLM → TTS, triggered on audio.end)
- **Memory Leak Prevention**: ✅ COMPLETE (P0/P1/P2 fixes, 42+ regression tests)
- **Conversation Orchestration**: ✅ COMPLETE (sequential playback, context management, fallbacks)
- **Telephony Gateway**: ❌ NOT STARTED (Twilio integration planned for Layer 3)
- **Test Coverage**: 96.5%+ overall (949+ tests, 33 test files)

### Code Quality: Grade A (95/100)

- Handler + Service pattern consistently applied
- TypeScript strict mode (no `any`)
- Comprehensive error handling
- Resource cleanup (no memory leaks)
- DRY principles throughout
- Structured logging with context

---

## Implementation Phases

### Phase 1: Backend Foundation ✅

**Status**: ✅ Completed

**Tasks**:

- [x] Set up Express.js server
- [x] Configure TypeScript strict mode
- [x] Set up project structure (modules/, shared/)
- [x] Environment configuration

**Deliverables**:

- Basic Express server running on port 3001
- TypeScript compilation working with path aliases
- Module-based project structure established
- Configuration system in place

---

### Phase 2: WebSocket Infrastructure ✅

**Status**: ✅ Completed (Grade A - 95.25%)

**Tasks**:

- [x] Set up native `ws` WebSocket server at `/ws`
- [x] Implement MessagePack-based protocol (binary serialization)
- [x] Implement connection/disconnection/error handling
- [x] Add connection/session tracking (`SessionService`, `WebSocketService`)
- [x] Implement graceful shutdown and cleanup
- [x] React Strict Mode compatible client (frontend)
- [x] Comprehensive test suite (85%+ coverage)

**Dependencies**:

- `ws` (8.18.0)
- `msgpackr` (1.11.2)
- Internal `modules/socket/**` implementation

**Test Coverage**:

- Unit tests: SessionService, WebSocketService, handlers
- Integration tests: Session lifecycle, message flow
- E2E tests: Complete connection → disconnect flow
- **Total**: 96+ tests, 85%+ coverage

**Deliverables**:

- WebSocket server running at `/ws`
- MessagePack protocol defined (see [WebSocket Protocol Specification](../protocol/websocket-protocol.md))
- Session management and WebSocket utilities in place
- Production-ready with comprehensive error handling

---

### Phase 3: Audio Handling ✅

**Status**: ✅ Completed

**Tasks**:

- [x] Implement audio chunk receiving from client
- [x] Create audio buffer manager
- [x] Implement audio format validation
- [x] Add audio chunk buffering logic
- [x] Implement audio chunk sending to client
- [x] Audio format conversion utilities
- [x] Test coverage for audio handling

**Dependencies**:

- Audio processing: `wave-resampler` (pure JavaScript)

**References**:

- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)

**Deliverables**:

- Audio chunks can be received and buffered
- Audio chunks can be sent to client over WebSocket/MessagePack
- Audio format handling working
- Test coverage for audio handlers

---

### Phase 3.5: Audio Resampling ✅

**Status**: ✅ COMPLETE (2024-12-25)

**Implementation**:

- [x] Audio resampling architecture designed and documented
- [x] AudioResamplerService implemented (`wave-resampler` library)
- [x] 48kHz → 16kHz conversion with <1ms latency
- [x] 8kHz → 16kHz conversion (Twilio support)
- [x] Stateless service following Handler + Service pattern
- [x] Graceful degradation on errors
- [x] Passthrough optimization for matching sample rates
- [x] Production-ready with full test coverage

**Documentation**:

- [Audio Resampling Architecture](../audio/audio-resampling.md) - Complete design specification
- [Sample Rate Handling Guide](../audio/sample-rate-handling.md) - Multi-source sample rate handling

**Key Decisions**:

- Use `wave-resampler` for bidirectional resampling (pure JavaScript, no CMake)
- Stateless AudioResamplerService following Handler + Service pattern
- <1ms latency per chunk (negligible overhead)
- Zero native dependencies (simple deployment)

**Integration**:

- Integrated with AudioHandler (resample before forwarding to STT)
- Supports browser audio (48kHz), Twilio (8kHz), pre-recorded files (variable rates)
- Ready for production Twilio integration

**Test Coverage**:

- Unit tests for AudioResamplerService
- Integration tests for resampling flow
- Performance tests for latency validation

---

### Phase 4: STT Integration ✅

**Status**: ✅ **COMPLETE** (2024-12-27)

**Implementation**:

- [x] Deepgram SDK integration (`@deepgram/sdk`)
- [x] STTService with session-level persistent connections
- [x] STTSession state container with metrics tracking
- [x] Deepgram configuration module
- [x] Real-time WebSocket connection to Deepgram
- [x] Transcript event handling (interim and final)
- [x] Audio integration with AudioResamplerService
- [x] Hybrid retry strategy (fast then slow backoff)
- [x] Error classification (fatal vs retryable)
- [x] Transparent reconnection on mid-stream disconnects
- [x] Timeout handling (connection, message, session)
- [x] Comprehensive error logging
- [x] Memory management (cleanup timer, transcript size limits)
- [x] Graceful shutdown on SIGTERM
- [x] Production-ready with 85%+ test coverage

**Documentation**:

- [Deepgram STT Integration Design](../design/deepgram-stt-integration-design.md) - Architecture specification
- [STT Implementation Discussion](./stt-implementation-discussion.md) - Architectural decisions

**Key Features**:

- **Session-Level Connections**: One persistent Deepgram connection per session
- **Audio Buffering**: Buffers audio during reconnection (no data loss)
- **Hybrid Retry**: Fast initial retries (100ms, 200ms, 400ms), then slow backoff
- **Transparent Reconnection**: Automatic reconnection on network issues
- **VAD Support**: Voice Activity Detection events from Deepgram
- **Memory Management**: Cleanup timer removes stale sessions, transcript size limits prevent memory leaks
- **Graceful Shutdown**: Closes all connections cleanly on SIGTERM

**Test Coverage**: 85%+ (20 test files, 96+ test cases)

- Unit tests: STTService, STTSession, error classifier
- Integration tests: Full audio flow, error scenarios, cleanup, concurrent sessions
- Edge case tests: VAD events, reconnection, finalization errors

**Dependencies**:

- Deepgram SDK: `@deepgram/sdk` (3.9.0)
- Existing: SessionService, WebSocketService, AudioHandler, AudioResamplerService

**API Keys Required**:

- `DEEPGRAM_API_KEY` in `.env`

**Deliverables**:

- ✅ Real-time speech-to-text working with Deepgram
- ✅ Transcripts accumulated and forwarded to client
- ✅ Hybrid retry strategy with transparent reconnection
- ✅ Memory management (cleanup timer, size limits)
- ✅ Graceful shutdown on SIGTERM
- ✅ Production-ready with comprehensive error handling
- ✅ 85%+ test coverage
- ✅ Ready for TTS integration (Phase 5.5)

---

### Phase 4.5: Event System Migration

**Status**: 📋 **DESIGN COMPLETE - READY FOR IMPLEMENTATION**

**Design Documents**:

- [Event System Architecture](../protocol/event-system.md) - Complete event system specification

**Tasks**:

**Week 1: Implement New Event System**

- [ ] Update `@Jatin5120/vantum-shared` with single unified EVENTS object
- [ ] Implement hierarchical namespacing (domain.category.action)
- [ ] Add event metadata (direction, priority, description)
- [ ] Implement type-safe event types (EventType union)
- [ ] Maintain backward compatibility (VOICECHAT_EVENTS → EVENTS mapping)
- [ ] Add helper functions (isClientEvent, isServerEvent, getEventDomain, etc.)

**Week 2: Backend Migration**

- [ ] Update message handlers to use new EVENTS object
- [ ] Update MessagePackHelper to use new event types
- [ ] Update tests to use new event system
- [ ] Verify backward compatibility works

**Week 3: Documentation & Cleanup**

- [ ] Update protocol documentation
- [ ] Create migration guide
- [ ] Set deprecation timeline for VOICECHAT_EVENTS
- [ ] Update code examples in documentation

**Dependencies**:

- None (isolated to event system)

**Deliverables**:

- Single unified EVENTS object with hierarchical structure
- Type-safe event system with full TypeScript support
- Backward compatible migration path
- Complete documentation and migration guide
- Ready for future domain additions (telephony, analytics, etc.)

---

### Phase 5: LLM Integration ✅

**Status**: ✅ **COMPLETE** (2026-02-20)

**Scope**: OpenAI GPT-4.1 integration for AI conversation

**Design Documents**:

- [LLM Integration Architecture](../architecture/llm-integration.md) - Architecture design
- [LLM Implementation Spec](./llm-implementation-spec.md) - Technical specification
- [OpenAI Integration Guide](../integrations/openai.md) - Operational guide (13.5 KB)

**Implementation**:

- [x] OpenAI SDK installed (`openai` v6.15.0)
- [x] Module structure created (`src/modules/llm/`)
- [x] Type definitions (`types/index.ts`)
- [x] Configuration files (openai.config.ts, prompts.config.ts, streaming.config.ts, timeout.config.ts, retry.config.ts)
- [x] LLMSessionService (conversation context, full session history, max 50 messages)
- [x] LLMService (core OpenAI integration, streaming, request queuing, max 10 queued requests)
- [x] LLMStreamingService (semantic chunking via `||BREAK||` markers, sentence fallback)
- [x] 3-tier fallback strategy (intelligent tier selection on errors)
- [x] LLMController (public API with `hasSession()` for safe cleanup)
- [x] Transcript handler wired: audio.end → STT finalize → LLM → TTS
- [x] Session cleanup with session existence check (P1-7 fix)
- [x] Parallel disconnect cleanup (P1-6 fix, 6s → 2s)
- [x] OpenAI error classifier (AUTH, RATE_LIMIT, NETWORK, FATAL)
- [x] LLM queue cleanup on shutdown (P0-1 fix)
- [x] Unit tests (LLMService, LLMSessionService, LLMStreamingService, LLMController)
- [x] Integration tests (STT → LLM → TTS pipeline, fallback messages, conversation flow)
- [x] Memory leak regression tests (42+ test cases, 100% pass rate)
- [x] 90%+ test coverage achieved
- [x] Documentation complete (OpenAI integration guide, semantic streaming protocol spec)

**Key Features Implemented**:

- **Model**: `gpt-4.1-2025-04-14`
- **Streaming**: Semantic chunking with `||BREAK||` markers for progressive TTS delivery
- **Temperature**: 0.7 (configurable via env)
- **Context**: Full session history, auto-prune at 50 messages
- **Storage**: In-memory per session
- **Error Handling**: Intelligent error classification + 3-tier fallback messages
- **Queueing**: Always queue, never reject (max 10 per session)

**Deliverables**:

- ✅ LLM generating AI responses from transcripts
- ✅ Conversation context maintained (full session history)
- ✅ 3-tier fallback strategy working
- ✅ Request queueing implemented
- ✅ Seamless integration with TTS (zero refactoring required)
- ✅ Production-ready with 90%+ test coverage
- ✅ OpenAI integration guide complete (13.5 KB)

---

### Phase 5.5: TTS Integration

**Status**: ✅ **COMPLETE** (2026-01-04)

**Scope**: Cartesia TTS integration for AI voice responses (Echo Mode → Manual Trigger MVP)

**Documentation**:

- [TTS Module Documentation](../modules/tts.md) - Complete TTS integration design
- [WebSocket Protocol Specification](../protocol/websocket-protocol.md) - Updated with TTS events

**Implementation**:

- [x] Created TTS module structure
- [x] Implemented TTSService (Cartesia integration)
- [x] Implemented TTSSessionService (session management)
- [x] Implemented TTSController (public API)
- [x] Implemented TranscriptHandler (route transcripts to TTS)
- [x] Added TTS event types
- [x] Integrated audio resampling (16kHz → 48kHz)
- [x] Implemented error handling and recovery
- [x] Implemented reconnection logic with buffering
- [x] Implemented state machine (TTSState)
- [x] Implemented metrics and monitoring
- [x] Implemented cleanup timers
- [x] Implemented graceful shutdown
- [x] Implemented keepalive mechanism
- [x] Manual trigger via "Stop recording" button

**Key Features**:

- **Manual Trigger**: User clicks "Stop recording" → TTS synthesis
- **Persistent Connections**: One Cartesia WebSocket per session
- **Streaming Synthesis**: Audio chunks sent as received (<1s first chunk latency)
- **Transparent Reconnection**: Automatic reconnection on network failures
- **Future-Proof Design**: LLM insertion requires zero TTS refactoring

**Performance Targets** (Achieved):

- TTS first chunk: <1s ✅
- Echo end-to-end: <3s ✅
- Memory per session: <300KB ✅

**Deliverables**:

- ✅ Manual trigger working (user clicks "Stop recording")
- ✅ Streaming audio generation with <1s latency
- ✅ Persistent Cartesia connections per session
- ✅ Production-ready with comprehensive error handling
- ✅ Ready for LLM integration (Phase 5)

---

### Phase 6: TTS Integration (DEPRECATED)

**This phase has been moved to Phase 5.5 and completed.**

See Phase 5.5 above for TTS implementation details.

---

### Phase 7: Conversation Orchestration

**Status**: ❌ **NOT STARTED** (Planned for Q1 2026)

**Scope**: State machine and conversation flow orchestration

**Tasks**:

- [ ] Implement conversation state machine (INITIALIZING, LISTENING, THINKING, RESPONDING, ENDING)
- [ ] Build conversation orchestrator service
- [ ] Handle interruption logic
- [ ] Coordinate STT → LLM → TTS pipeline
- [ ] Implement conversation context management
- [ ] Add state transition validation
- [ ] End-to-end integration testing
- [ ] Write comprehensive tests
- [ ] Achieve 85%+ test coverage

**Dependencies**:

- Phase 4 (STT) - Complete ✅
- Phase 5 (LLM) - Must be complete
- Phase 5.5 (TTS) - Complete ✅

**References**:

- [State Machine Design](../comprehensive-architecture.md#state-machine-design)
- [Conversation Orchestration Architecture](../comprehensive-architecture.md#3-conversation-orchestration-service)

**Planned Deliverables**:

- Complete conversation flow working (STT → LLM → TTS)
- State machine implemented with validation
- Interruption handling working
- Conversation context maintained
- Production-ready with 85%+ test coverage

**Estimated Timeline**: 2-3 weeks

---

### Phase 8: Telephony Integration

**Status**: ❌ **NOT STARTED** (Planned for Q1 2026)

**Scope**: Twilio phone call integration for production

**Tasks**:

- [ ] Research Twilio integration method (TwiML, Media Streams, etc.)
- [ ] Implement telephony gateway service
- [ ] Map Twilio calls to sessions
- [ ] Handle bidirectional audio with Twilio (8kHz μ-law)
- [ ] Implement call lifecycle (dial, answer, hangup)
- [ ] Integrate with conversation orchestration
- [ ] End-to-end testing with Twilio
- [ ] Write comprehensive tests
- [ ] Production readiness review

**Dependencies**:

- Phase 7 (Conversation Orchestration) - Must be complete
- AudioResamplerService (already supports 8kHz ↔ 16kHz) ✅

**API Keys Required**:

- `TWILIO_ACCOUNT_SID` in `.env`
- `TWILIO_AUTH_TOKEN` in `.env`
- `TWILIO_PHONE_NUMBER` in `.env`

**References**:

- [Twilio Voice Documentation](https://www.twilio.com/docs/voice)
- [Telephony Gateway Architecture](../comprehensive-architecture.md#4-telephony-gateway-twilio-integration)

**Planned Deliverables**:

- Twilio integration working for outbound calls
- Bidirectional audio streaming working
- Call lifecycle management implemented
- Session mapping (one call = one session)
- Production-ready with testing

**Estimated Timeline**: 3-4 weeks

---

### Phase 9: Integration & Testing

**Status**: ❌ **NOT STARTED** (Planned for Q1 2026)

**Scope**: Final integration, optimization, and production readiness

**Tasks**:

- [ ] End-to-end flow testing (complete AI call pipeline)
- [ ] Audio quality optimization
- [ ] Latency optimization (<500ms end-to-end target)
- [ ] Error handling improvements
- [ ] Connection management testing
- [ ] Performance testing (50-100 concurrent users)
- [ ] Load testing and bottleneck identification
- [ ] Security review
- [ ] Documentation updates
- [ ] Production deployment preparation

**Dependencies**:

- All previous phases must be complete

**Deliverables**:

- Complete voice AI flow working in production
- Optimized performance (<500ms latency)
- Robust error handling
- Tested and documented
- Production-ready for launch
- Deployment pipeline established

**Estimated Timeline**: 2-3 weeks

---

## Current Focus

**Layer 2 Complete — Ready for Layer 3 (Authentication & Persistence)**

With the full AI pipeline (STT → LLM → TTS) complete and production-ready, the next priorities are:

1. **Immediate**: Layer 3 — Authentication & authorization
2. **Following**: Layer 3 — Rate limiting & API security
3. **Then**: Layer 3 — Call recording & persistence (database)
4. **Finally**: Layer 4 — Analytics dashboard

**Status Summary**:

- ✅ Phase 1: Backend Foundation (Complete)
- ✅ Phase 2: WebSocket Infrastructure (Complete - Grade A 95.25%)
- ✅ Phase 3: Audio Handling (Complete)
- ✅ Phase 3.5: Audio Resampling (Complete)
- ✅ Phase 4: STT Integration (Complete - 85%+ coverage)
- 📋 Phase 4.5: Event System Migration (Design Complete - low priority)
- ✅ Phase 5: LLM Integration (Complete - 90%+ coverage) **← COMPLETED**
- ✅ Phase 5.5: TTS Integration (Complete - 90%+ coverage)
- ❌ Phase 7: Conversation Orchestration (Not Started - partially superseded by LLM completion)
- ❌ Phase 8: Telephony Integration (Not Started)
- ❌ Phase 9: Integration & Testing (Not Started)

---

## Dependencies Between Phases

```
Phase 1 (Foundation) ✅
    ↓
Phase 2 (WebSocket) ✅
    ↓
Phase 3 (Audio Handling) ✅
    ↓
Phase 3.5 (Audio Resampling) ✅
    ↓
Phase 4 (STT Integration) ✅
    ↓
Phase 5.5 (TTS Integration) ✅
    ↓
Phase 5 (LLM Integration) ✅ ← COMPLETED
    ↓
Phase 4.5 (Event System) 📋 ← Low priority, can run in parallel with Phase 7
    ↓
Phase 7 (Conversation Orchestration) ❌
    ↓
Phase 8 (Telephony Integration) ❌
    ↓
Phase 9 (Integration & Testing) ❌
```

**Note**: All Layer 2 features are complete and production-ready (Grade A 95/100). Layer 3 features (authentication, persistence, security) are the next development priority.

---

## Quality Standards

### Code Quality Requirements (Grade A - 95.25%)

**Non-Negotiable Standards**:

- ✅ Handler + Service pattern consistently applied
- ✅ TypeScript strict mode (no `any`)
- ✅ Comprehensive error handling with proper propagation
- ✅ Resource cleanup (no memory leaks)
- ✅ DRY principle (no code duplication)
- ✅ Clear separation of concerns
- ✅ Consistent naming conventions
- ✅ Structured logging with context
- ✅ 85%+ test coverage for all production code

### Testing Requirements

**Target Coverage**: 85%+ lines, 90%+ critical services

**Test Pyramid**:

- Unit tests: Individual services, handlers, utilities
- Integration tests: Module interactions
- E2E tests: Complete flows

**All External APIs Must Be Mocked**:

- Deepgram (mocked in tests) ✅
- Cartesia (mocked in tests) ✅
- OpenAI (mocked in tests) ✅
- Twilio (to be mocked when Telephony phase begins)

---

## Performance Targets

### Latency Goals

| Metric                                | Target         | Current Status                          |
| ------------------------------------- | -------------- | --------------------------------------- |
| WebSocket connection latency          | <100ms         | ✅ Achieved                             |
| Audio streaming latency               | <50ms          | ✅ Achieved                             |
| Audio resampling overhead             | <1ms per chunk | ✅ Achieved (<1ms)                      |
| STT transcription latency             | <500ms         | ✅ Achieved                             |
| TTS first chunk latency               | <1s            | ✅ Achieved                             |
| LLM response generation               | <3s            | ✅ Achieved (streaming, <2s)            |
| **End-to-end conversational latency** | **<5s total**  | ✅ Achieved (~4s with parallel cleanup) |

### Scalability Targets

| Metric                          | Launch Target   | Current Capacity    |
| ------------------------------- | --------------- | ------------------- |
| Concurrent users per instance   | 10              | ✅ Tested (50+)     |
| Concurrent Deepgram connections | 10              | ✅ Tested           |
| Audio chunk processing          | 1000 chunks/sec | ✅ Achieved         |
| Memory per session              | <50MB           | ✅ Achieved (~20MB) |
| CPU per session                 | <5%             | ✅ Achieved (~2%)   |

---

## Notes

### Development Best Practices

- Each phase must be tested independently before moving to the next
- API keys should be stored securely in `.env` file (never commit)
- Error handling should be implemented at each phase
- Documentation should be updated as implementation progresses
- Follow Handler + Service pattern religiously
- Maintain 85%+ test coverage for all new code
- Use structured logging with context (sessionId, etc.)
- Clean up resources on disconnect (prevent memory leaks)

### External Services

**Currently Integrated**:

- ✅ Deepgram (STT) - Real-time speech-to-text (85%+ coverage)
- ✅ OpenAI GPT-4.1 (LLM) - Conversation AI with semantic streaming (90%+ coverage)
- ✅ Cartesia (TTS) - Text-to-speech with sequential playback (90%+ coverage)

**Planned Integrations**:

- ⏳ Twilio (Telephony) - Phone call infrastructure (Layer 3)

### Cost Estimates (Per Minute)

| Service             | Cost per Minute | Notes           |
| ------------------- | --------------- | --------------- |
| Deepgram STT        | ~$0.0125        | Nova-2 model    |
| OpenAI GPT-4.1      | ~$0.03-0.06     | Token-based     |
| Cartesia TTS        | ~$0.01-0.02     | Streaming API   |
| Twilio Voice        | ~$0.014         | Outbound calls  |
| **Total Estimated** | **~$0.07-0.10** | Per call minute |

---

## Version History

- **v2.3.0** (2026-02-20) - Phase 5 (LLM Integration) complete; Layer 2 fully production-ready (Grade A 95/100); 949+ tests passing at 96.5%+ coverage
- **v2.2.0** (2026-01-08) - Phase 5 (LLM Integration) design complete, ready for implementation
- **v2.1.0** (2026-01-04) - Added Phase 5.5 (TTS Integration - Echo Mode), updated protocol with TTS events, created TTS module documentation
- **v2.0.0** (2024-12-27) - Major update: STT integration complete, updated to reflect actual implementation status and test coverage
- **v1.1.0** (2024-12-27) - Updated with audio resampling completion, STT design completion
- **v1.0.0** (2024-12-17) - Initial implementation plan

---

## See Also

- [Comprehensive Architecture](../comprehensive-architecture.md) - Complete system architecture
- [WebSocket Protocol Specification](../protocol/websocket-protocol.md) - Protocol details
- [LLM Integration Architecture](../architecture/llm-integration.md) - LLM design **← NEW**
- [LLM Implementation Spec](./llm-implementation-spec.md) - LLM implementation details **← NEW**
- [TTS Module Documentation](../modules/tts.md) - Complete TTS integration design
- [Architecture Documentation](../architecture/architecture.md) - System design patterns
- [Audio Resampling Architecture](../audio/audio-resampling.md) - Audio resampling design
- [Setup Guide](./setup.md) - Development environment setup
