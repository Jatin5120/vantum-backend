# Implementation Plan

**Version**: 1.0.0  
**Last Updated**: 2025-12-17  
**Status**: Active

## Overview

This document outlines the phased implementation approach for the Vantum backend voice AI system.

> **Related Documents**: [WebSocket Protocol Specification](../protocol/websocket-protocol.md), [Architecture Documentation](../architecture/architecture.md)

## Implementation Phases

### Phase 1: Backend Foundation ✅

**Status**: Completed

**Tasks**:

- [x] Set up Express.js server
- [x] Configure TypeScript
- [x] Set up project structure
- [x] Environment configuration

**Deliverables**:

- Basic Express server running
- TypeScript compilation working
- Project structure established

---

### Phase 2: WebSocket Infrastructure ✅

**Status**: Completed

**Tasks**:

- [x] Set up native `ws` WebSocket server at `/ws`
- [x] Implement MessagePack-based protocol (shared envelope)
- [x] Implement connection/disconnection/error handling
- [x] Add connection/session tracking (`SessionService`, `WebSocketService`)
- [x] Implement graceful shutdown and cleanup

**Dependencies**:

- `ws`
- `msgpackr`
- Internal `modules/socket/**` implementation

**Deliverables**:

- WebSocket server running at `/ws`
- MessagePack protocol defined (see [WebSocket Protocol Specification](../protocol/websocket-protocol.md#base-message-structure))
- Session management and WebSocket utilities in place

---

### Phase 3: Audio Handling

**Status**: Pending

**Tasks**:

- [ ] Implement audio chunk receiving from client
- [ ] Create audio buffer manager
- [ ] Implement audio format validation
- [ ] Add audio chunk buffering logic
- [ ] Implement audio chunk sending to client
- [ ] Add audio format conversion utilities (if needed)

**Dependencies**:

- Audio processing: `@ffmpeg/ffmpeg` or `node-wav` (if needed)

**References**:

- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)

**Deliverables**:

- Audio chunks can be received and buffered
- Audio chunks can be sent to client over existing WebSocket/MessagePack protocol
- Audio format handling working

---

### Phase 4: STT Integration

**Status**: Pending

**Tasks**:

- [ ] Set up Deepgram API client
- [ ] Implement audio streaming to Deepgram
- [ ] Handle real-time transcription responses
- [ ] Process and format transcripts
- [ ] Add error handling for STT service
- [ ] Implement retry logic

**Dependencies**:

- Deepgram SDK: `@deepgram/sdk`

**API Keys Required**:

- Deepgram API key

**References**:

- [Deepgram Node.js SDK](https://github.com/deepgram/deepgram-node-sdk)
- [Deepgram Streaming](https://developers.deepgram.com/docs/streaming)

**Deliverables**:

- Real-time speech-to-text working
- Transcripts being generated from audio
- Error handling in place

---

### Phase 5: LLM Integration

**Status**: Pending

**Tasks**:

- [ ] Set up OpenAI API client
- [ ] Implement conversation context management
- [ ] Create prompt engineering for cold outreach
- [ ] Handle LLM responses
- [ ] Add conversation state tracking
- [ ] Implement error handling and retries

**Dependencies**:

- OpenAI SDK: `openai`

**API Keys Required**:

- OpenAI API key

**References**:

- [OpenAI Node.js SDK](https://github.com/openai/openai-node)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [OpenAI Best Practices](https://platform.openai.com/docs/guides/prompt-engineering)

**Deliverables**:

- LLM generating responses from transcripts
- Conversation context maintained
- Error handling working

---

### Phase 6: TTS Integration

**Status**: Pending

**Tasks**:

- [ ] Set up ElevenLabs API client
- [ ] Implement text-to-speech conversion
- [ ] Handle audio streaming from TTS
- [ ] Add voice selection and configuration
- [ ] Implement error handling
- [ ] Add audio format conversion if needed

**Dependencies**:

- ElevenLabs SDK: `elevenlabs` (or REST API client)

**API Keys Required**:

- ElevenLabs API key

**References**:

- [ElevenLabs API Documentation](https://elevenlabs.io/docs/api-reference)
- [ElevenLabs Text-to-Speech](https://elevenlabs.io/docs/api-reference/text-to-speech)

**Deliverables**:

- Text-to-speech conversion working
- Audio responses being generated
- Audio streaming to client working

---

### Phase 7: Integration & Testing

**Status**: Pending

**Tasks**:

- [ ] End-to-end flow testing
- [ ] Audio quality optimization
- [ ] Latency optimization
- [ ] Error handling improvements
- [ ] Connection management testing
- [ ] Performance testing

**Deliverables**:

- Complete voice AI flow working
- Optimized performance
- Robust error handling
- Tested and documented

---

## Current Focus

**Phase 3: Audio Handling**

With the WebSocket infrastructure in place (Phase 2), the next focus is wiring audio capture/streaming through the existing MessagePack socket layer into future STT/LLM/TTS services.

## Dependencies Between Phases

```
Phase 1 (Foundation)
    ↓
Phase 2 (WebSocket) ✅
    ↓
Phase 3 (Audio Handling) ← Current Phase
    ↓
Phase 4 (STT) ──┐
    ↓            │
Phase 5 (LLM) ←─┼─ All depend on Phase 3
    ↓            │
Phase 6 (TTS) ──┘
    ↓
Phase 7 (Integration)
```

## Notes

- Each phase should be tested independently before moving to the next
- API keys should be stored securely in `.env` file
- Error handling should be implemented at each phase
- Documentation should be updated as implementation progresses
