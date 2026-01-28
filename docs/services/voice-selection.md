# Voice Selection Service

**Last Updated**: January 28, 2026
**Status**: Production-Ready
**Version**: 1.0.0

---

## Overview

The Voice Selection feature allows users to choose between different TTS voices (male or female) for AI responses during voice chat sessions. Voice selection is configured at the start of each audio session and persists throughout that session.

---

## Available Voices

Vantum offers two curated voices optimized for natural conversation:

| Voice Name         | Gender | Voice ID                               | Description                                        |
| ------------------ | ------ | -------------------------------------- | -------------------------------------------------- |
| **Kyle** (Default) | Male   | `c961b81c-a935-4c17-bfb3-ba2239de8c2f` | Approachable Friend - Natural, friendly male voice |
| **Tessa**          | Female | `6ccbfb76-1fc6-48f7-b71d-91ac6298247b` | Kind Companion - Warm, professional female voice   |

### Voice Characteristics

Both voices are selected from Cartesia's TTS library and have been tested for:

- Natural conversational tone
- Clear pronunciation
- Professional delivery
- Emotional expression capability
- Suitability for business communications

---

## Architecture

### Data Flow

```
┌─────────────┐
│   Frontend  │
│  (React UI) │
└──────┬──────┘
       │ 1. User selects voice (Kyle/Tessa)
       ↓
┌─────────────────────────────────────────────┐
│  audio.start payload                        │
│  {                                          │
│    samplingRate: 48000,                     │
│    language: "en-US",                       │
│    voiceId: "c961b81c-...f" // Kyle or Tessa│
│  }                                          │
└──────┬──────────────────────────────────────┘
       │ 2. WebSocket message
       ↓
┌─────────────┐
│   Backend   │
│ audio.handler│
└──────┬──────┘
       │ 3. Store in session metadata
       ↓
┌────────────────────────┐
│  Session Service       │
│  session.metadata = {  │
│    voiceId: "c961..." │
│  }                     │
└────────────────────────┘
       │
       │ 4. User speaks → STT → LLM generates response
       ↓
┌─────────────────┐
│  LLM Service    │
│  (streaming)    │
└──────┬──────────┘
       │ 5. Retrieve voiceId from session
       ↓
┌────────────────────────────────────┐
│  const session =                   │
│    sessionService.getSessionBySessionId()│
│  const voiceId =                   │
│    session?.metadata?.voiceId      │
└──────┬─────────────────────────────┘
       │ 6. Pass to TTS
       ↓
┌─────────────────────────────────────┐
│  TTS Service                        │
│  synthesize(sessionId, text, {      │
│    voiceId // Uses session voice    │
│  })                                 │
└──────┬──────────────────────────────┘
       │ 7. Cartesia TTS generates audio with selected voice
       ↓
┌─────────────┐
│   Frontend  │
│ Audio plays │
└─────────────┘
```

---

## Implementation Details

### Frontend (VoiceChat Component)

**File**: `/vantum-frontend/src/components/VoiceChat/VoiceChat.tsx`

**Key Components**:

1. **Voice State Management**:

   ```typescript
   const [selectedVoice, setSelectedVoice] = useState<'male' | 'female'>('male');

   const VOICE_IDS = {
     male: 'c961b81c-a935-4c17-bfb3-ba2239de8c2f', // Kyle
     female: '6ccbfb76-1fc6-48f7-b71d-91ac6298247b', // Tessa
   } as const;
   ```

2. **UI Controls**:
   - Two toggle buttons: "Male Voice (Kyle)" and "Female Voice (Tessa)"
   - Buttons disabled during recording (voice cannot change mid-session)
   - Active voice highlighted in blue
   - Inactive voices shown in gray with hover effects

3. **Payload Transmission**:
   ```typescript
   const { eventId } = packAudioStart(
     {
       samplingRate: actualSampleRate,
       language: AUDIO_CONSTANTS.DEFAULT_LANGUAGE,
       voiceId: VOICE_IDS[selectedVoice], // ← Sent to backend
     },
     sessionId
   );
   ```

### Backend (Session & LLM Services)

**File**: `/vantum-backend/src/modules/socket/handlers/audio.handler.ts`

**Session Metadata Storage**:

```typescript
// handleAudioStart() stores voiceId in session metadata
const updatedSession = sessionService.updateSession(connectionId, {
  state: SessionState.ACTIVE,
  metadata: {
    ...session.metadata,
    samplingRate,
    voiceId: payload.voiceId, // ← Stored for session
    language: payload.language || 'en-US',
  },
});
```

**File**: `/vantum-backend/src/modules/llm/services/llm-streaming.service.ts`

**Voice Retrieval for TTS**:

```typescript
// sendChunkToTTS() retrieves voiceId before synthesis
const session = sessionService.getSessionBySessionId(sessionId);
const voiceId = session?.metadata?.voiceId as string | undefined;

const audioDurationMs = await ttsController.synthesize(sessionId, chunk.text, {
  voiceId, // ← Passed to TTS service
});
```

**File**: `/vantum-backend/src/modules/llm/services/llm.service.ts`

**Fallback Voice Handling**:

```typescript
// Fallback response also uses session voice
const session = sessionService.getSessionBySessionId(sessionId);
const voiceId = session?.metadata?.voiceId as string | undefined;
await ttsController.synthesize(sessionId, fallback, { voiceId });
```

**File**: `/vantum-backend/src/modules/tts/services/tts.service.ts`

**Voice Override in TTS**:

```typescript
// synthesizeText() respects voiceId option
voice: {
  mode: 'id',
  id: options?.voiceId || session.config.voiceId, // ← Uses override or default
}
```

---

## Configuration

### Default Voice

The default voice is configured in `/vantum-backend/src/modules/tts/config/cartesia.config.ts`:

```typescript
export const cartesiaConfig = {
  voiceId: 'c961b81c-a935-4c17-bfb3-ba2239de8c2f', // Kyle (male) - Default
  // ...
} as const;
```

### Changing Default Voice

To change the system-wide default voice:

1. Open `/vantum-backend/src/modules/tts/config/cartesia.config.ts`
2. Update the `voiceId` field:
   ```typescript
   voiceId: '6ccbfb76-1fc6-48f7-b71d-91ac6298247b', // Tessa (female)
   ```
3. Restart the backend server

**Note**: This only affects sessions where the client doesn't specify a voiceId.

---

## Session Lifecycle

### Voice Selection Timeline

```
1. User opens voice chat interface
   ├─ Voice selector shows: "Male (Kyle)" and "Female (Tessa)"
   └─ Default: Male (Kyle) selected

2. User selects voice (optional)
   └─ Click "Female Voice (Tessa)" button

3. User clicks "Start Recording"
   ├─ VoiceId included in audio.start payload
   └─ Backend stores voiceId in session metadata

4. Recording session active
   ├─ Voice selector buttons DISABLED (no mid-session changes)
   └─ VoiceId persists in session metadata

5. User speaks → STT transcribes
   └─ Transcript sent to LLM

6. LLM generates response
   ├─ LLM service retrieves voiceId from session
   └─ Passes voiceId to TTS for each chunk

7. TTS synthesizes audio with selected voice
   └─ Audio chunks sent to frontend

8. User hears response in selected voice
   └─ Playback uses voice chosen in step 1/2

9. User clicks "Stop Recording"
   └─ Session ends, voiceId cleared from metadata

10. New recording session
    └─ User can select different voice
```

---

## API Reference

### AudioStartPayload Type

**File**: `@Jatin5120/vantum-shared/src/events/payloads.ts`

```typescript
export interface AudioStartPayload {
  samplingRate?: number; // Audio sample rate (default: 16000)
  voiceId?: string; // TTS voice ID (optional)
  language?: string; // Language code (e.g., 'en-US')
}
```

### SynthesisOptions Type

**File**: `/vantum-backend/src/modules/tts/types/tts-session.types.ts`

```typescript
export interface SynthesisOptions {
  voiceId?: string; // Override session voice for this synthesis
  speed?: number; // Playback speed multiplier
  language?: string; // Language code override
}
```

---

## Usage Examples

### Example 1: Default Voice (Kyle)

```typescript
// Frontend - No voice selection (uses default)
await sendMessagePackWithAck({
  eventType: VOICECHAT_EVENTS.AUDIO_START,
  eventId,
  sessionId,
  payload: {
    samplingRate: 48000,
    language: 'en-US',
    // voiceId not specified → backend uses Kyle (default)
  },
});
```

### Example 2: Female Voice (Tessa)

```typescript
// Frontend - User selects Tessa
const [selectedVoice, setSelectedVoice] = useState<'male' | 'female'>('female');

await sendMessagePackWithAck({
  eventType: VOICECHAT_EVENTS.AUDIO_START,
  eventId,
  sessionId,
  payload: {
    samplingRate: 48000,
    language: 'en-US',
    voiceId: '6ccbfb76-1fc6-48f7-b71d-91ac6298247b', // Tessa
  },
});
```

### Example 3: Backend Voice Override (Per-Synthesis)

```typescript
// Backend - Override voice for specific TTS call
await ttsController.synthesize(sessionId, 'Special announcement', {
  voiceId: '6ccbfb76-1fc6-48f7-b71d-91ac6298247b', // Use Tessa for this message
});
// Note: Session voice remains unchanged for subsequent calls
```

---

## Testing

### Manual Testing Checklist

- [ ] Voice selector shows both Kyle and Tessa options
- [ ] Kyle selected by default on page load
- [ ] Clicking Tessa changes selection (visual feedback)
- [ ] Voice buttons disabled during recording
- [ ] Starting recording sends voiceId in payload
- [ ] Backend stores voiceId in session metadata
- [ ] TTS synthesis uses selected voice
- [ ] Audio playback matches selected voice
- [ ] Stopping recording re-enables voice buttons
- [ ] New recording session allows voice change

### Integration Testing

**Test File**: `/vantum-backend/tests/integration/voice-selection.test.ts` (TODO)

**Test Scenarios**:

1. Default voice (no voiceId specified)
2. Kyle voice explicitly selected
3. Tessa voice explicitly selected
4. Voice persists across multiple LLM responses
5. Voice isolation between concurrent sessions
6. Invalid voiceId handling (fallback to default)

---

## Security Considerations

### Voice IDs are Public

**Important**: Cartesia voice IDs are **not secrets**. They are public identifiers similar to font names or theme IDs.

- ✅ Safe to hardcode in frontend
- ✅ Safe to expose in API payloads
- ✅ Safe to log for debugging
- ❌ Do NOT confuse with API keys (which are secrets)

### Access Control

Voice selection itself doesn't require authentication, but:

- Users can only select voices for their own sessions
- VoiceId is scoped to session metadata (no cross-session access)
- TTS API key is stored server-side (never exposed to client)

---

## Troubleshooting

### Issue: Wrong voice playing

**Symptoms**: Audio plays but in wrong voice (not matching selection)

**Possible Causes**:

1. VoiceId not included in audio.start payload
2. Session metadata not updated
3. LLM service not retrieving voiceId
4. TTS service ignoring voiceId option

**Debug Steps**:

```bash
# Check audio.start payload
# Look for: "voiceId": "c961b81c-..."

# Check session metadata
# Backend logs should show:
# "Audio session started" with voiceId field

# Check TTS synthesis
# Backend logs should show:
# "TTS synthesis requested" with voiceId in options
```

---

### Issue: Voice buttons not working

**Symptoms**: Clicking voice buttons has no effect

**Possible Causes**:

1. Buttons disabled (recording in progress)
2. React state not updating
3. Event handler not firing

**Debug Steps**:

```javascript
// In browser console:
// 1. Check if recording
console.log(isRecording); // Should be false to enable buttons

// 2. Check selected voice state
// (Requires React DevTools)
```

---

### Issue: Voice resets to default

**Symptoms**: Selected voice changes back to Kyle unexpectedly

**Possible Causes**:

1. Component remount (React Strict Mode)
2. State not persisted between sessions
3. Browser refresh

**Expected Behavior**: Voice selection is **per-session**, not persisted across page refreshes. This is intentional.

---

## Future Enhancements

### Planned Features

1. **Voice Preview** (P2):
   - Play sample audio before recording
   - Help users make informed voice selection

2. **Custom Voices** (Future):
   - Allow users to create custom voice profiles
   - Store voice preferences per user account

3. **Voice Cloning** (Future):
   - Clone user's own voice for responses
   - Requires additional Cartesia features

4. **Emotion Control** (Future):
   - Adjust emotional tone of selected voice
   - Leverage Cartesia Sonic 3 emotion parameters

---

## Related Documentation

- **Cartesia Integration**: `/docs/integrations/cartesia.md`
- **TTS Service API**: `/docs/services/tts-service.md`
- **WebSocket Protocol**: `/docs/protocol/websocket-protocol.md`
- **Session Management**: `/docs/services/session-service.md`
- **Audio Pipeline**: `/docs/architecture/audio-pipeline.md`

---

## Changelog

### Version 1.0.0 (January 28, 2026)

- Initial release
- Two voices: Kyle (male) and Tessa (female)
- Frontend voice selector UI
- Backend session metadata storage
- LLM service voice retrieval
- Complete documentation

---

**Maintained By**: Vantum Backend Team
**Contact**: For questions or issues, see project documentation
