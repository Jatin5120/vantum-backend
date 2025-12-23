# Voice Mode Implementation Reference

**Version**: 1.0.0  
**Last Updated**: 2025-12-17  
**Status**: Active

**Source**: Foyer/thine project (feat/tpuf-multi-query branch)

> **Related Documents**: [WebSocket Protocol Specification](../protocol/websocket-protocol.md) - For current message format specification

> **⚠️ IMPORTANT**: This is a **conceptual reference only**. The reference code is not bug-free or production-quality. Use it to understand:
>
> - **WHAT** technologies are used (Soniox STT, Cartesia TTS, MessagePack, WebSocket)
> - **WHAT** the voice flow looks like (STT → LLM → TTS with speculative generation)
> - **WHAT** configurations work (sample rates, VAD thresholds)
> - **HOW** the pipeline processes audio (streaming, interruption, speculative generation)
>
> **DO NOT** copy the exact implementation patterns or code structure. We will design our own better implementation based on these core concepts.

---

## Core Voice Flow Architecture

```
Browser (Frontend)
    ↓ WebSocket (MessagePack/JSON)
Backend (Express + Socket.io)
    ├─ STT Service (Soniox WebSocket)
    ├─ LLM Service (OpenAI API)
    └─ TTS Service (Cartesia/ElevenLabs WebSocket)
```

---

## Complete Processing Flow

### High-Level Flow

```
1. Browser captures audio (MediaRecorder/AudioWorklet)
2. Audio chunks → WebSocket → Backend
3. Backend streams chunks → STT WebSocket (Soniox)
4. STT returns real-time transcripts
5. VAD detects silence → Trigger processing
6. Transcript → LLM (OpenAI streaming)
7. LLM text deltas → TTS WebSocket
8. TTS audio chunks → Backend → Browser
9. Browser plays audio
```

### Detailed Flow with Speculative Generation

```
┌─────────────────────────────────────────────────────────────┐
│ USER SPEAKS                                                 │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│ STT WebSocket: Stream audio chunks                          │
│ - Real-time transcription updates                           │
│ - Accumulate transcript text                                │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│ SOFT SILENCE DETECTED (500ms)                               │
│ - User paused for 500ms                                     │
│ - Start SPECULATIVE generation                              │
│   • LLM request (with abort controller)                     │
│   • TTS WebSocket connection                                │
│   • Buffer response (don't save to DB yet)                  │
└───────────────┬─────────────────────────────────────────────┘
                │
        ┌───────┴───────┐
        │               │
        ▼               ▼
┌───────────────┐  ┌──────────────────────────┐
│ User continues│  │ HARD SILENCE (2000ms)    │
│ speaking?     │  │ - Commit response        │
│               │  │ - Save to database       │
│ YES → ABORT   │  │ - Play audio             │
│               │  │ - Mark as final          │
└───────────────┘  └──────────────────────────┘
```

---

## Technologies & Services

### STT (Speech-to-Text)

**Options to Consider**:

#### Option 1: Deepgram (Originally Planned)

**WebSocket URL**: `wss://api.deepgram.com/v1/listen`

**Pros**:

- Well-documented API
- Good real-time streaming support
- Competitive pricing
- Good accuracy

**Cons**:

- May have slightly higher latency than Soniox

#### Option 2: Soniox (Used in Reference)

**WebSocket URL**: `wss://stt-rt.soniox.com/transcribe-websocket`

**Pros**:

- Very low latency
- Excellent real-time performance
- Used successfully in reference implementation
- Good for conversational AI

**Cons**:

- Less well-known, newer player
- Documentation may be less extensive

**Recommendation**: Test both and choose based on:

- Latency (Soniox may be faster)
- Accuracy (test with your use case)
- Pricing (compare costs)
- Documentation quality (Deepgram may be better)

**Configuration** (Both):

- Sample Rate: 16kHz (required)
- Encoding: PCM 16-bit signed little-endian
- Channels: Mono (1 channel)
- Format: Raw PCM audio chunks

**Input**: Stream `Uint8Array` audio chunks directly to WebSocket

**Output**: JSON messages with transcription updates

### TTS (Text-to-Speech)

**Options to Consider**:

#### Option 1: ElevenLabs (Originally Planned)

**WebSocket URL**: `wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream`

**Pros**:

- Excellent voice quality (most natural)
- Great for conversational AI
- Good streaming support
- Well-documented API

**Cons**:

- Higher cost
- May have slightly higher latency

#### Option 2: Cartesia Sonic (Used in Reference)

**WebSocket URL**: `wss://api.cartesia.ai/tts/websocket?api_key=...&cartesia_version=2025-04-16`

**Pros**:

- Very low latency
- Good streaming performance
- Used successfully in reference implementation
- Competitive pricing

**Cons**:

- Voice quality may be slightly less natural than ElevenLabs
- Less well-known

**Recommendation**: Test both and choose based on:

- Voice quality (ElevenLabs may sound more natural)
- Latency (Cartesia may be faster)
- Cost (Cartesia may be cheaper)
- Use case (B2B cold calls may prioritize naturalness → ElevenLabs)

**Configuration** (Both):

- Sample Rates: 8000, 16000, 22050, 24000, 44100, 48000 Hz
- Default: 16000 Hz
- Encoding: `pcm_s16le`
- Voice: Configurable voice ID

**Input**: JSON payloads with text and voice config

**Output**: Base64-encoded PCM audio chunks

### Communication Protocol

**WebSocket**: Real-time bidirectional communication

- Low latency for audio streaming
- Supports both text and binary data
- Socket.io for Node.js/Express

**MessagePack**: Binary serialization

- More efficient than JSON for audio data (smaller payloads)
- Faster serialization/deserialization
- Library: `msgpackr` (npm)
- **Compatible with Twilio**: Yes! (See explanation below)

### MessagePack + Twilio Compatibility

**Question**: Will MessagePack work with Twilio?

**Answer**: Yes, absolutely! Here's why:

1. **Separate Protocols**:

   - Our WebSocket (frontend ↔ backend) uses MessagePack
   - Twilio Media Streams use their own WebSocket protocol
   - These are **separate connections** that don't interfere

2. **Architecture**:

   ```
   Frontend ←→ Backend (MessagePack WebSocket)
                    ↓
              Twilio Media Streams (Twilio's protocol)
                    ↓
              Phone Call
   ```

3. **When We Integrate Twilio**:

   - Twilio sends audio via their Media Streams WebSocket (Twilio's format)
   - Backend converts Twilio audio → Our internal format
   - Backend processes using our MessagePack WebSocket protocol
   - Backend sends response back to Twilio via their protocol
   - **Our internal communication stays MessagePack**

4. **Benefits**:
   - MessagePack reduces bandwidth for our internal communication
   - Twilio integration is just an adapter layer
   - No conflicts between protocols
   - Can optimize our internal protocol independently

**Conclusion**: Use MessagePack from the start. It will work perfectly with Twilio when we add phone integration later.

---

## Voice Activity Detection (VAD)

### Two-Tier Silence Detection

The latest implementation uses **speculative generation** with two silence thresholds:

#### Soft Silence (500ms)

- **Purpose**: Start speculative AI response generation
- **Action**: Begin LLM + TTS processing
- **State**: `PROCESSING_SPECULATIVE`
- **Can be aborted**: Yes, if user continues speaking

#### Hard Silence (2000ms)

- **Purpose**: Confirm user is done speaking
- **Action**: Commit response to database
- **State**: `COMMITTED`
- **Can be aborted**: No, but can be interrupted

### VAD State Machine

```typescript
type VADState =
  | "LISTENING" // Waiting for speech or silence
  | "SOFT_SILENCE_DETECTED" // Soft silence met, preparing speculation
  | "PROCESSING_SPECULATIVE" // LLM/TTS streaming (can be aborted)
  | "COMMITTED"; // Hard silence confirmed (cannot abort, but can interrupt)
```

### Configuration

```typescript
export const VAD_CONFIG = {
  SOFT_SILENCE_DURATION_MS: 500, // Start speculative processing
  HARD_SILENCE_DURATION_MS: 2000, // Commit response
  SILENCE_CHECK_INTERVAL_MS: 20, // Polling frequency (reduced from 50ms)
  MIN_SPEECH_DURATION_MS: 50, // Minimum speech to be valid
  INTERRUPT_THRESHOLD_MS: 10, // Cancel AI response when user speaks
};
```

### How VAD Works

**1. Speech Detection**:

```typescript
// When STT receives transcript
if (transcriptText && transcriptText.trim().length > 0) {
  if (!this.hasReceivedSpeech) {
    this.firstSpeechTime = Date.now();
    this.hasReceivedSpeech = true;
    this.sendInterruptEvent(); // Cancel any ongoing AI response
  }
  this.lastTranscriptionTime = Date.now();
}
```

**2. Soft Silence Detection**:

```typescript
// Poll every 20ms
setInterval(() => {
  const silenceDuration = Date.now() - this.lastTranscriptionTime;

  if (this.hasReceivedSpeech && silenceDuration >= 500) {
    // Start speculative generation
    this.handleSoftSilence();
  }
}, 20);
```

**3. Hard Silence Detection**:

```typescript
// After soft silence, check for hard silence
if (silenceDuration >= 2000) {
  // Commit response to database
  this.handleHardSilence();
}
```

**4. Interrupt Detection**:

```typescript
// If user speaks while AI is responding
if (speechDuration >= 10) {
  this.sendInterruptEvent();
  // Cancel speculative generation
  this.abortSpeculativeGeneration();
}
```

---

## Speculative Generation Implementation

### What is Speculative Generation?

**Speculative generation** is a technique to reduce perceived latency by starting AI response generation **before** we're 100% sure the user is done speaking.

**The Problem**: If we wait until the user is completely done (e.g., 2 seconds of silence), the user has to wait for:

- Silence detection (2000ms)
- LLM processing (500-2000ms)
- TTS generation (500-1000ms)
- **Total: 3-5 seconds before hearing response**

**The Solution**: Start processing after just 500ms of silence, but keep it "speculative" (not saved to DB) until we confirm the user is done (2000ms total silence).

**The Flow**:

1. User pauses for 500ms → Start generating AI response (speculative)
2. If user continues speaking → **Abort** the speculative response (don't waste it)
3. If user stays silent for 2000ms total → **Commit** the response (save to DB, play audio)

**Benefits**:

- User hears response ~1.5 seconds faster
- No wasted resources if user continues speaking (we abort)
- No database pollution (only save confirmed responses)
- Feels more natural and responsive

### Concept

Start AI response generation early (after 500ms silence) but don't commit until confirmed (2000ms silence). This dramatically reduces perceived latency.

### State Management

```typescript
// Speculative state
private vadState: VADState = "LISTENING";
private speculativeUtteranceId: string | undefined;
private speculativeAbortController: AbortController | undefined;
private speculativeLLMReader: ReadableStreamDefaultReader | undefined;
private speculativeTTSWebSocket: WebSocket | undefined;

// Message buffer (don't save until committed)
private speculativeMessageBuffer: {
    utteranceId: string;
    userText: string;
    assistantContent: string;
    // ... metadata
} | undefined;
```

### Flow Implementation

**1. Soft Silence Triggered**:

```typescript
async handleSoftSilence() {
    this.vadState = "SOFT_SILENCE_DETECTED";
    this.speculativeUtteranceId = uuidv7();

    // Create abort controller
    this.speculativeAbortController = new AbortController();

    // Start speculative processing
    this.speculativeProcessingPromise = this.processSpeculativeUtterance();
}

async processSpeculativeUtterance() {
    this.vadState = "PROCESSING_SPECULATIVE";

    // 1. Get LLM response (with abort signal)
    const llmResponse = await this.llmService.process(
        this.accumulatedTranscription,
        { signal: this.speculativeAbortController.signal }
    );

    // 2. Stream to TTS
    const ttsWebSocket = await this.createTTSWebSocket();
    this.speculativeTTSWebSocket = ttsWebSocket;

    // 3. Stream LLM → TTS → Client (but don't save yet)
    await this.streamLLMToTTS(llmResponse, ttsWebSocket);

    // 4. Buffer message (not saved to DB)
    this.speculativeMessageBuffer = {
        utteranceId: this.speculativeUtteranceId,
        userText: this.accumulatedTranscription,
        assistantContent: llmResponse,
        // ...
    };
}
```

**2. Hard Silence (Commit)**:

```typescript
async handleHardSilence() {
    if (this.vadState === "PROCESSING_SPECULATIVE") {
        this.vadState = "COMMITTED";

        // Save to database
        if (this.speculativeMessageBuffer) {
            await this.dataplane.createMessage({
                message_id: this.speculativeMessageBuffer.userMessageId,
                content: this.speculativeMessageBuffer.userText,
                // ...
            });

            await this.dataplane.createMessage({
                message_id: this.speculativeMessageBuffer.assistantMessageId,
                content: this.speculativeMessageBuffer.assistantContent,
                // ...
            });
        }

        // Clear buffer
        this.speculativeMessageBuffer = undefined;
    }
}
```

**3. User Interrupts (Abort)**:

```typescript
async abortSpeculativeGeneration() {
    // Abort LLM request
    if (this.speculativeAbortController) {
        this.speculativeAbortController.abort();
    }

    // Cancel stream reader
    if (this.speculativeLLMReader) {
        await this.speculativeLLMReader.cancel();
    }

    // Close TTS WebSocket
    if (this.speculativeTTSWebSocket) {
        this.speculativeTTSWebSocket.close();
    }

    // Discard message buffer (don't save)
    this.speculativeMessageBuffer = undefined;

    // Reset state
    this.vadState = "LISTENING";
    this.speculativeUtteranceId = undefined;
}
```

---

## End-of-Sentence (EOS) Detection

### Concept

ML model that predicts if a sentence is complete, helping make smarter decisions about when to trigger processing.

**Model**: SmolLM2 End-of-Sentence (HuggingFace)  
**Deployment**: Google Cloud Run with BentoML (or any serverless platform)

### Configuration

```typescript
export const EOS_CONFIG = {
  TIMEOUT_MS: 800, // API call timeout
  CONFIDENCE_THRESHOLD: 0.5, // Minimum confidence
  ENABLED: true, // Feature flag
};
```

### Usage

```typescript
// Check if sentence is complete
const isComplete = await eosService.isCompleteSentence(
    "Hello, how are you?"  // → true
);

// API Request
POST {EOS_MODEL_URL}
{
    "request": {
        "text": "Hello, how are you?"
    }
}

// API Response
{
    "is_complete": true,
    "confidence": 0.92,
    "probabilities": {
        "incomplete": 0.08,
        "complete": 0.92
    }
}
```

### Integration with VAD

```typescript
// Before triggering soft silence, check EOS
if (this.eosService.isEnabled()) {
  const isComplete = await this.eosService.isCompleteSentence(
    this.accumulatedTranscription
  );

  if (isComplete && silenceDuration >= 500) {
    // More confident to start speculative generation
    this.handleSoftSilence();
  }
}
```

**Note**: EOS is optional optimization. Can start without it for POC.

---

## Audio Configuration

### Format Specifications

```typescript
export const AUDIO_CONFIG = {
  STT_SAMPLE_RATE: 16000, // 16 kHz (Soniox requirement)
  TTS_SAMPLE_RATE: 16000, // 16 kHz (configurable: 8-48 kHz)
  CHANNELS: 1, // Mono audio
  BIT_DEPTH: 16, // 16-bit audio
  FORMAT: "pcm", // Raw PCM format
  ENCODING: "pcm_s16le", // PCM signed 16-bit little-endian
};
```

### Supported Sample Rates

- **STT**: 16000 Hz only (fixed requirement)
- **TTS**: 8000, 16000, 22050, 24000, 44100, 48000 Hz (configurable)

### Audio Chunk Processing

**Browser → Backend**:

- Format: `Uint8Array` (binary PCM data)
- Sent via WebSocket (MessagePack or JSON)
- Continuous streaming, no chunk size limit

**Backend → Browser**:

- Format: Base64-encoded PCM → `Uint8Array`
- Includes metadata: `sampleRate`, `utteranceId`, `sequenceNumber`
- Streamed in real-time as TTS generates

---

## WebSocket Events

### Client → Server

```typescript
// Initialize voice session
VOICECHAT_AUDIO_START: "voicechat.audio.start";
// Payload: { samplingRate?, voiceId?, language?, vadConfig? }

// Stream audio chunk
VOICECHAT_AUDIO_CHUNK: "voicechat.audio.chunk";
// Payload: { audio: Uint8Array }

// End voice session
VOICECHAT_AUDIO_END: "voicechat.audio.end";
// Payload: {}
```

### Server → Client

```typescript
// AI about to respond
VOICECHAT_RESPONSE_START: "voicechat.response.start";
// Payload: { utteranceId, timestamp }

// TTS audio chunk
VOICECHAT_RESPONSE_CHUNK: "voicechat.response.chunk";
// Payload: { audio: Uint8Array, utteranceId, sampleRate, sequenceNumber }

// User interrupted AI
VOICECHAT_RESPONSE_INTERRUPT: "voicechat.response.interrupt";
// Payload: { utteranceId, timestamp }

// AI response complete
VOICECHAT_RESPONSE_COMPLETE: "voicechat.response.complete";
// Payload: { utteranceId }
```

### Message Format

> **Note**: This is a conceptual reference. For the current protocol specification, see [WebSocket Protocol Specification](../protocol/websocket-protocol.md#base-message-structure).

```typescript
{
  eventType: string; // "voicechat.audio.chunk"
  eventId: string; // UUIDv7
  sessionId: string; // UUIDv7 (same for one session)
  payload: {
    // Event-specific data
    // For response chunks: unique utteranceId per chunk (replaces sequence_number)
  }
}
```

**Current Protocol**: All field names use camelCase. No `sequence_number` field. See [protocol specification](../protocol/websocket-protocol.md) for complete details.

---

## Implementation Flow for Vantum

### Phase 1: POC with Speculative Generation

**Core Features**:

1. ✅ WebSocket connection (Native WebSocket with MessagePack)
2. ✅ Audio chunk streaming
3. ✅ STT integration (Deepgram or Soniox - TBD)
4. ✅ LLM integration (OpenAI streaming)
5. ✅ TTS integration (ElevenLabs or Cartesia - TBD)
6. ✅ **Speculative generation** with two-tier silence:
   - Soft silence (500ms) → Start speculative processing
   - Hard silence (2000ms) → Commit to database
7. ✅ Abort controllers for cancellation
8. ✅ Message buffering (don't save until committed)
9. ✅ Basic interruption handling

**Skip for Now**:

- ❌ EOS detection (optional optimization, add later)
- ❌ Session tracking (add later for analytics)
- ❌ Audio buffer storage (add later for debugging)

### Phase 2: Optimizations (Post-POC)

**Future enhancements**:

1. ✅ EOS detection integration (ML-based sentence completion)
2. ✅ Session tracking (analytics, call duration)
3. ✅ Audio buffer storage (replay, debugging)
4. ✅ Performance monitoring (latency metrics)
5. ✅ Advanced VAD tuning (per-user customization)
6. ✅ Twilio phone integration

---

## Key Implementation Patterns

### 1. Streaming Pipeline

```
Audio → STT (streaming) → Transcript → LLM (streaming) → Text → TTS (streaming) → Audio
```

All components stream data, no waiting for completion.

### 2. Interruption Handling

- Track utterances with unique IDs
- Cancel ongoing responses when user speaks
- Use AbortController for clean cancellation
- Reset state for next turn

### 3. Continuous Recording

- Keep audio stream active throughout session
- VAD determines utterance boundaries
- No stop/start between conversation turns
- Better UX: feels like natural conversation

### 4. Speculative Generation

- Start processing early (500ms)
- Don't commit until confirmed (2000ms)
- Abort if user continues speaking
- Reduces perceived latency significantly

### 5. Event-Driven Communication

- All messages follow event type pattern
- Structured payloads with metadata
- Sequence numbers for chunk ordering
- Error events with descriptive messages

---

## Configuration Reference

### VAD Configuration

```typescript
{
    SOFT_SILENCE_DURATION_MS: 500,     // Start speculation
    HARD_SILENCE_DURATION_MS: 2000,    // Commit response
    SILENCE_CHECK_INTERVAL_MS: 20,     // Polling frequency
    MIN_SPEECH_DURATION_MS: 50,        // Filter noise
    INTERRUPT_THRESHOLD_MS: 10,        // Quick interrupt
}
```

### Audio Configuration

```typescript
{
    STT_SAMPLE_RATE: 16000,    // Fixed
    TTS_SAMPLE_RATE: 16000,    // Configurable
    CHANNELS: 1,               // Mono
    BIT_DEPTH: 16,             // 16-bit
    ENCODING: "pcm_s16le",     // PCM format
}
```

### EOS Configuration (Optional)

```typescript
{
    TIMEOUT_MS: 800,
    CONFIDENCE_THRESHOLD: 0.5,
    ENABLED: true,
}
```

---

## What to Extract vs What to Ignore

### ✅ Extract These Concepts

**Technologies**:

- Soniox STT (or Deepgram for Vantum)
- Cartesia/ElevenLabs TTS
- WebSocket for real-time streaming
- MessagePack for efficiency (optional)

**Flow Patterns**:

- Speculative generation with soft/hard silence
- Streaming pipeline (STT → LLM → TTS)
- Interruption handling with abort controllers
- Continuous recording with VAD

**Configurations**:

- Sample rates (16kHz for STT, configurable for TTS)
- VAD thresholds (500ms soft, 2000ms hard)
- Audio format (PCM 16-bit mono)

**State Management**:

- VAD state machine
- Speculative message buffering
- Utterance ID tracking

### ❌ Ignore These Implementation Details

**Cloudflare-Specific**:

- Durable Objects architecture
- Worker patterns
- Cloudflare-specific APIs

**Code Quality Issues**:

- Specific error handling approaches
- TypeScript type definitions
- Function organization
- Helper method implementations

**Architecture Patterns**:

- Control-Plane routing layer
- Microservices separation
- Storage patterns

---

## Summary

The latest implementation introduces **speculative generation** as the major innovation:

1. **Two-tier silence detection**: Soft (500ms) for speculation, Hard (2000ms) for commit
2. **Smart abortion**: Cancel speculative generation if user continues speaking
3. **Message buffering**: Don't save to DB until confirmed
4. **EOS detection**: Optional ML-based sentence completion (can skip for POC)

**For Vantum POC**:

- ✅ Implement speculative generation from the start (two-tier silence)
- ✅ Use MessagePack for WebSocket communication
- ✅ Skip EOS detection (add later as optimization)
- ✅ Choose STT/TTS providers based on testing (Deepgram vs Soniox, ElevenLabs vs Cartesia)
- ✅ Focus on getting core pipeline working with speculative generation

**Key Takeaway**: Extract the proven concepts (technologies, flow patterns, configurations) but implement with your own clean architecture and better code quality.

---

## Implementation Decisions Summary

### ✅ 1. Speculative Generation in POC

**Decision**: Implement speculative generation from the start in POC.

**Why**:

- Major UX improvement (reduces perceived latency by ~1.5 seconds)
- Core feature that differentiates the product
- Reference implementation shows it works well
- Can be built incrementally (soft silence → hard silence → abort handling)

**Implementation**:

- Two-tier silence detection (500ms soft, 2000ms hard)
- Abort controllers for cancellation
- Message buffering (don't save until committed)
- State machine (LISTENING → SOFT_SILENCE → PROCESSING_SPECULATIVE → COMMITTED)

### 🤔 2. STT/TTS Provider Discussion

**STT Options**: Deepgram vs Soniox

**Decision Needed**: Test both and choose based on:

- **Latency**: Soniox may be faster (used in reference)
- **Accuracy**: Test with your specific use case
- **Pricing**: Compare costs for your volume
- **Documentation**: Deepgram may have better docs

**TTS Options**: ElevenLabs vs Cartesia

**Decision Needed**: Test both and choose based on:

- **Voice Quality**: ElevenLabs may sound more natural (important for B2B)
- **Latency**: Cartesia may be faster
- **Cost**: Cartesia may be cheaper
- **Use Case**: Cold calls may prioritize naturalness → ElevenLabs

**Recommendation**:

- Start with Deepgram + ElevenLabs (originally planned, well-documented)
- Test Soniox + Cartesia in parallel
- Switch if they perform significantly better

### ❌ 3. EOS Detection

**Decision**: Skip for POC, add later as optimization.

**Why**:

- Adds complexity (ML model deployment)
- Not critical for basic functionality
- Can improve with simple silence thresholds first
- Add once core flow is stable

### 📚 4. What is Speculative Generation?

**Simple Explanation**:

Instead of waiting 2 seconds of silence before starting AI response, we:

1. **Start early** (after 500ms silence) → Begin generating response
2. **Keep it speculative** → Don't save to database yet
3. **If user continues** → Abort the response (no waste)
4. **If user stays silent** → Commit after 2000ms (save to DB, play audio)

**Analogy**: Like a waiter starting to prepare your order when you pause mid-sentence, but only bringing it if you actually finish ordering.

**Benefits**:

- User hears response ~1.5 seconds faster
- No wasted resources if user continues speaking
- No database pollution (only save confirmed responses)
- Feels more natural and responsive

### ✅ 5. MessagePack with Twilio

**Decision**: Use MessagePack from the start.

**Why It Works**:

- **Separate protocols**: Our WebSocket (MessagePack) ≠ Twilio Media Streams (Twilio protocol)
- **No conflicts**: They're different connections that don't interfere
- **Adapter pattern**: When we add Twilio, we'll convert between protocols
- **Benefits**: Smaller payloads, faster serialization, better performance

**Architecture**:

```
Frontend ←→ Backend (MessagePack WebSocket) ←→ STT/TTS/LLM
                    ↓
         Twilio Adapter (converts protocols)
                    ↓
         Twilio Media Streams (Twilio protocol)
                    ↓
              Phone Call
```

**Conclusion**: MessagePack is the right choice. It will work perfectly with Twilio when we add phone integration.
