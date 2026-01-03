# Sample Rate Handling Guide

**Version**: 1.0.0
**Last Updated**: 2025-12-25
**Status**: Active

## Table of Contents

1. [Overview](#overview)
2. [Sample Rate Sources](#sample-rate-sources)
3. [Resampling Strategy](#resampling-strategy)
4. [Implementation Patterns](#implementation-patterns)
5. [Configuration Management](#configuration-management)
6. [Edge Cases](#edge-cases)
7. [Future Considerations](#future-considerations)

---

## Overview

### Purpose

This document provides a comprehensive guide for handling audio sample rates from different sources in the Vantum system. Different audio sources (browser, Twilio, etc.) provide audio at different sample rates, and this guide explains when and how to resample.

### Key Concepts

**Sample Rate**: The number of audio samples per second (measured in Hz)
- Higher sample rate = better quality, larger file size
- Lower sample rate = lower quality, smaller file size
- Voice intelligibility: 8kHz minimum, 16kHz optimal, 48kHz overkill

**Resampling**: Converting audio from one sample rate to another
- Downsampling: 48kHz → 16kHz (most common in our system)
- Upsampling: 8kHz → 16kHz (future Twilio integration)
- Passthrough: 16kHz → 16kHz (no conversion needed)

---

## Sample Rate Sources

### 1. Browser Audio Capture (Current)

**Source**: Web Audio API (`MediaDevices.getUserMedia()`)

**Actual Sample Rate**: 48kHz (typical browser default)

**Why 48kHz?**:
- Native hardware sample rate for most audio interfaces
- Browser captures at hardware rate (not configurable)
- Cannot force 16kHz in browser reliably

**Flow**:
```
Microphone → Browser (48kHz) → WebSocket → Backend (48kHz) → Resample → 16kHz → Deepgram
```

**Configuration**:
```typescript
// Frontend (React)
// AudioContext.sampleRate is READ-ONLY
const audioContext = new AudioContext(); // Uses hardware sample rate (48kHz)
console.log(audioContext.sampleRate); // 48000 (typical)

// Backend receives 48kHz audio
const samplingRate = 48000; // From audio.start payload or default
```

**Resampling Required**: YES (48kHz → 16kHz)

---

### 2. Twilio Voice (Future)

**Source**: Twilio Voice API

**Actual Sample Rate**: 8kHz (telephony standard)

**Why 8kHz?**:
- PSTN (telephone network) standard
- G.711 codec (8kHz, 64 kbps)
- Sufficient for voice intelligibility

**Flow**:
```
Phone Call → Twilio (8kHz) → WebSocket → Backend (8kHz) → Resample → 16kHz → Deepgram
```

**Configuration**:
```typescript
// Twilio webhook payload
const twilioAudio = {
  samplingRate: 8000, // Always 8kHz
  encoding: 'mulaw', // G.711 μ-law
};

// Backend receives 8kHz audio (after mulaw decoding)
const samplingRate = 8000; // From Twilio
```

**Resampling Required**: YES (8kHz → 16kHz, upsampling)

---

### 3. Pre-recorded Audio (Future)

**Source**: File uploads (MP3, WAV, etc.)

**Actual Sample Rate**: Variable (depends on file)

**Common Rates**:
- Voice recordings: 16kHz, 22.05kHz, 44.1kHz
- Music: 44.1kHz (CD quality), 48kHz (professional)
- Podcasts: 44.1kHz, 48kHz

**Flow**:
```
File Upload → FFmpeg (detect rate) → Decode → Resample → 16kHz → Deepgram
```

**Configuration**:
```typescript
// Detect sample rate from file metadata
const metadata = await getAudioMetadata(file);
const samplingRate = metadata.sampleRate; // Variable

// Resample to 16kHz if needed
```

**Resampling Required**: CONDITIONAL (depends on file)

---

### 4. Native Target Rate (Optimal)

**Source**: Hypothetical future source already at 16kHz

**Actual Sample Rate**: 16kHz

**Why 16kHz?**:
- Deepgram optimal rate
- Telephony standard (wideband)
- Good balance of quality and size

**Flow**:
```
Source (16kHz) → Backend (16kHz) → Passthrough → 16kHz → Deepgram
```

**Configuration**:
```typescript
const samplingRate = 16000; // Already at target rate
```

**Resampling Required**: NO (passthrough optimization)

---

## Resampling Strategy

### Decision Matrix

| Source | Source Rate | Target Rate | Action | Reason |
|--------|-------------|-------------|--------|--------|
| **Browser** | 48kHz | 16kHz | **Downsample** | Optimal for Deepgram |
| **Twilio** | 8kHz | 16kHz | **Upsample** | Improve quality for Deepgram |
| **Pre-recorded** | Variable | 16kHz | **Conditional** | Depends on source rate |
| **Already 16kHz** | 16kHz | 16kHz | **Passthrough** | No conversion needed |

### When to Resample

```typescript
function shouldResample(sourceSampleRate: number, targetSampleRate: number): boolean {
  return sourceSampleRate !== targetSampleRate;
}

// Usage
const sourceSampleRate = 48000; // Browser
const targetSampleRate = 16000; // Deepgram optimal

if (shouldResample(sourceSampleRate, targetSampleRate)) {
  // Resample required
  const resampledAudio = await audioResamplerService.resample(
    sessionId,
    audioBuffer,
    sourceSampleRate,
    targetSampleRate
  );
} else {
  // Passthrough (no resampling)
  const resampledAudio = audioBuffer; // Use as-is
}
```

---

## Implementation Patterns

### Pattern 1: Browser Audio (Current)

**Scenario**: Frontend captures audio at 48kHz, backend resamples to 16kHz

```typescript
// Frontend: src/lib/audio/AudioCapture.ts
class AudioCapture {
  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new AudioContext();

    // AudioContext.sampleRate is READ-ONLY (typically 48000)
    const actualSampleRate = audioContext.sampleRate;
    console.log(`Browser sample rate: ${actualSampleRate}Hz`);

    // Send sample rate to backend in audio.start
    this.socketManager.sendAudioStart({
      samplingRate: actualSampleRate, // 48000
      language: 'en-US',
    });

    // Start capturing audio at 48kHz
    await this.startCapture(audioContext);
  }
}

// Backend: src/modules/socket/handlers/audio.handler.ts
import { audioResamplerService } from '@/modules/audio/services';

async function handleAudioChunk(payload: AudioChunkPayload, sessionId: string) {
  const session = sessionService.getSessionBySessionId(sessionId);
  const audioChunk = payload.audio; // Uint8Array (48kHz)
  const samplingRate = session.metadata?.samplingRate || 48000;

  if (USE_STT) {
    // Resample 48kHz → 16kHz
    const resampledBuffer = await audioResamplerService.resample(
      sessionId,
      Buffer.from(audioChunk),
      samplingRate, // 48000
      16000 // Target for Deepgram
    );

    // Forward resampled audio to STT (16kHz)
    await sttController.forwardChunk(sessionId, new Uint8Array(resampledBuffer));
  }
}
```

---

### Pattern 2: Twilio Integration (Future)

**Scenario**: Twilio sends 8kHz audio, backend upsamples to 16kHz

```typescript
// Backend: src/modules/twilio/handlers/twilio-audio.handler.ts
import { audioResamplerService } from '@/modules/audio/services';

async function handleTwilioAudio(twilioPayload: TwilioAudioPayload) {
  const { sessionId, audio, encoding } = twilioPayload;

  // Twilio audio is 8kHz, mulaw-encoded
  const decodedAudio = decodeMulaw(audio); // Decode mulaw → PCM Int16
  const sourceSampleRate = 8000; // Twilio standard

  // Upsample 8kHz → 16kHz
  const resampledBuffer = await audioResamplerService.resample(
    sessionId,
    decodedAudio,
    sourceSampleRate, // 8000
    16000 // Target for Deepgram
  );

  // Forward to STT
  await sttController.forwardChunk(sessionId, new Uint8Array(resampledBuffer));
}
```

---

### Pattern 3: Dynamic Source Rate (Future)

**Scenario**: Source rate varies per session, backend adapts

```typescript
// Backend: src/modules/socket/handlers/audio.handler.ts
async function handleAudioStart(payload: AudioStartPayload, connectionId: string) {
  const { sessionId, samplingRate, language } = payload;

  // Store source sample rate in session metadata
  const session = sessionService.createSession(connectionId, {
    samplingRate, // Could be 8000, 16000, 48000, etc.
    language,
    sourceType: detectSourceType(samplingRate), // 'browser', 'twilio', 'file'
  });

  // Initialize STT with target rate (always 16kHz)
  await sttController.createSession(sessionId, {
    sessionId,
    connectionId,
    samplingRate: 16000, // STT always receives 16kHz
    language,
  });
}

async function handleAudioChunk(payload: AudioChunkPayload, sessionId: string) {
  const session = sessionService.getSessionBySessionId(sessionId);
  const sourceSampleRate = session.metadata?.samplingRate || 48000;
  const audioChunk = payload.audio;

  // Resample based on source rate
  const resampledBuffer = await audioResamplerService.resample(
    sessionId,
    Buffer.from(audioChunk),
    sourceSampleRate, // Dynamic: 8000, 16000, 48000, etc.
    16000 // Target: always 16kHz
  );

  await sttController.forwardChunk(sessionId, new Uint8Array(resampledBuffer));
}

function detectSourceType(samplingRate: number): string {
  if (samplingRate === 8000) return 'twilio';
  if (samplingRate === 16000) return 'direct';
  if (samplingRate === 48000) return 'browser';
  return 'unknown';
}
```

---

## Configuration Management

### Session-Level Configuration

**Store sample rate in session metadata**:

```typescript
// src/modules/socket/types/session.ts
export interface Session {
  sessionId: string;
  socketId: string;
  state: SessionState;
  metadata: {
    samplingRate: number; // Source sample rate (8000, 16000, 48000, etc.)
    language: string;
    sourceType: 'browser' | 'twilio' | 'file' | 'unknown';
    createdAt: number;
    lastActivityAt: number;
  };
}

// Create session with sample rate
const session = sessionService.createSession(connectionId, {
  samplingRate: 48000, // From audio.start payload
  language: 'en-US',
  sourceType: 'browser',
});

// Retrieve sample rate later
const samplingRate = session.metadata?.samplingRate || 48000;
```

---

### Environment Configuration

**Configure target sample rate (default: 16kHz)**:

```bash
# .env
# Target sample rate for Deepgram (optimal)
STT_TARGET_SAMPLE_RATE=16000

# Optional: Allow passthrough for specific sources
STT_ALLOW_PASSTHROUGH=true
```

```typescript
// src/modules/audio/config/audio.config.ts
export const AUDIO_CONFIG = {
  TARGET_SAMPLE_RATE: parseInt(process.env.STT_TARGET_SAMPLE_RATE || '16000', 10),
  ALLOW_PASSTHROUGH: process.env.STT_ALLOW_PASSTHROUGH === 'true',
} as const;

// Usage
import { AUDIO_CONFIG } from '@/modules/audio/config';

const targetSampleRate = AUDIO_CONFIG.TARGET_SAMPLE_RATE; // 16000
```

---

## Edge Cases

### Edge Case 1: Unknown Sample Rate

**Scenario**: Frontend doesn't send `samplingRate` in `audio.start`

**Solution**: Default to 48kHz (browser default)

```typescript
async function handleAudioStart(payload: AudioStartPayload, connectionId: string) {
  const samplingRate = payload.samplingRate || 48000; // Default to 48kHz

  const session = sessionService.createSession(connectionId, {
    samplingRate,
    language: payload.language || 'en-US',
  });

  logger.warn('Sample rate not provided, defaulting to 48kHz', { sessionId: session.sessionId });
}
```

---

### Edge Case 2: Invalid Sample Rate

**Scenario**: Frontend sends invalid sample rate (e.g., 0, negative, non-standard)

**Solution**: Validate and fallback to 48kHz

```typescript
function validateSampleRate(samplingRate: number): number {
  const validRates = [8000, 16000, 22050, 24000, 32000, 44100, 48000];

  if (!samplingRate || samplingRate <= 0) {
    logger.warn('Invalid sample rate (zero or negative), defaulting to 48kHz', { samplingRate });
    return 48000;
  }

  if (!validRates.includes(samplingRate)) {
    logger.warn('Non-standard sample rate, using as-is', { samplingRate });
    // Allow non-standard rates (resampler can handle)
  }

  return samplingRate;
}

// Usage
const samplingRate = validateSampleRate(payload.samplingRate);
```

---

### Edge Case 3: Sample Rate Mismatch

**Scenario**: Frontend sends 48kHz in `audio.start`, but actual audio is 16kHz

**Solution**: Trust `audio.start` metadata (frontend should be consistent)

**Prevention**:
```typescript
// Frontend: Ensure consistency
const actualSampleRate = audioContext.sampleRate;

// Send actual sample rate (not hardcoded)
socketManager.sendAudioStart({
  samplingRate: actualSampleRate, // Use actual, not assumed
});
```

**Backend Detection** (future enhancement):
```typescript
// Optional: Detect sample rate from audio data (advanced)
function detectSampleRateFromAudio(audioData: Buffer): number {
  // Analyze audio spectrum to infer sample rate
  // This is complex and not recommended for real-time systems
  // Better to trust frontend metadata
}
```

---

### Edge Case 4: Mid-Session Sample Rate Change

**Scenario**: Source changes sample rate mid-session (unlikely but possible)

**Solution**: Not supported - require new session

```typescript
async function handleAudioStart(payload: AudioStartPayload, connectionId: string) {
  const existingSession = sessionService.getSessionBySocketId(connectionId);

  if (existingSession) {
    // Session already exists - sample rate change not allowed
    logger.error('Cannot change sample rate mid-session', {
      sessionId: existingSession.sessionId,
      oldRate: existingSession.metadata?.samplingRate,
      newRate: payload.samplingRate,
    });

    sendError(
      ws,
      ErrorCode.INVALID_STATE,
      'Cannot change audio configuration mid-session. End current session first.',
      VOICECHAT_EVENTS.AUDIO_START,
      existingSession.sessionId
    );
    return;
  }

  // Create new session with new sample rate
  const session = sessionService.createSession(connectionId, {
    samplingRate: payload.samplingRate,
  });
}
```

---

## Future Considerations

### 1. Multi-Source Sessions

**Scenario**: Single session receives audio from multiple sources (e.g., conference call)

**Challenge**: Different sources may have different sample rates

**Solution**: Resample each source independently to 16kHz before mixing

```typescript
// Future: Multi-source audio mixing
async function handleMultiSourceAudio(sources: AudioSource[]) {
  const resampledSources = await Promise.all(
    sources.map(async (source) => {
      return audioResamplerService.resample(
        sessionId,
        source.audio,
        source.samplingRate, // Each source has its own rate
        16000 // Target: 16kHz for all
      );
    })
  );

  // Mix resampled audio
  const mixedAudio = mixAudioSources(resampledSources);

  // Forward to STT
  await sttController.forwardChunk(sessionId, mixedAudio);
}
```

---

### 2. Adaptive Sample Rate

**Scenario**: Adjust target sample rate based on network conditions

**Challenge**: High latency → lower sample rate for faster transmission

**Solution**: Dynamic target rate based on metrics

```typescript
// Future: Adaptive resampling
function getAdaptiveTargetRate(sessionMetrics: SessionMetrics): number {
  const { latency, bandwidth } = sessionMetrics;

  if (latency > 200 && bandwidth < 50000) {
    return 8000; // Low quality for poor conditions
  } else if (latency > 100) {
    return 12000; // Medium quality
  } else {
    return 16000; // High quality (default)
  }
}

const targetRate = getAdaptiveTargetRate(session.metrics);
const resampledAudio = await audioResamplerService.resample(
  sessionId,
  audioBuffer,
  sourceSampleRate,
  targetRate // Dynamic target
);
```

---

### 3. Quality Presets

**Scenario**: User selects audio quality preset (low, medium, high)

**Solution**: Map presets to sample rates

```typescript
// Future: Quality presets
const QUALITY_PRESETS = {
  low: { targetRate: 8000, bitrate: 32000 },
  medium: { targetRate: 12000, bitrate: 48000 },
  high: { targetRate: 16000, bitrate: 64000 },
} as const;

// User selects quality
const quality = session.metadata?.quality || 'high';
const preset = QUALITY_PRESETS[quality];

const resampledAudio = await audioResamplerService.resample(
  sessionId,
  audioBuffer,
  sourceSampleRate,
  preset.targetRate
);
```

---

### 4. Format Conversion

**Scenario**: Support non-PCM formats (MP3, Opus, AAC)

**Challenge**: Requires decoding before resampling

**Solution**: Add format detection and decoding layer

```typescript
// Future: Format conversion
async function processAudioChunk(
  sessionId: string,
  audioData: Buffer,
  format: 'pcm' | 'mp3' | 'opus' | 'aac',
  sourceSampleRate: number
): Promise<Buffer> {
  // Step 1: Decode to PCM (if needed)
  let pcmData = audioData;
  if (format !== 'pcm') {
    pcmData = await audioDecoderService.decode(audioData, format);
  }

  // Step 2: Resample to target rate
  const resampledData = await audioResamplerService.resample(
    sessionId,
    pcmData,
    sourceSampleRate,
    16000
  );

  return resampledData;
}
```

---

## Summary

### Current Implementation (Browser Only)

| Source | Rate | Action | Target |
|--------|------|--------|--------|
| Browser | 48kHz | Downsample | 16kHz |

### Future Implementation (Multi-Source)

| Source | Rate | Action | Target |
|--------|------|--------|--------|
| Browser | 48kHz | Downsample | 16kHz |
| Twilio | 8kHz | Upsample | 16kHz |
| Pre-recorded | Variable | Conditional | 16kHz |
| Already 16kHz | 16kHz | Passthrough | 16kHz |

### Key Takeaways

1. **Always resample to 16kHz** for optimal Deepgram performance
2. **Store source sample rate** in session metadata (from `audio.start`)
3. **Trust frontend metadata** - validate but don't override
4. **Passthrough optimization** - skip resampling if already at target rate
5. **Graceful degradation** - default to 48kHz if unknown
6. **No mid-session changes** - require new session for sample rate changes

---

## References

- [Audio Resampling Architecture](./audio-resampling.md) - Detailed resampling design
- [Deepgram Audio Best Practices](https://developers.deepgram.com/docs/audio-best-practices)
- [Web Audio API Sample Rate](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/sampleRate)
- [Twilio Voice Streaming](https://www.twilio.com/docs/voice/twiml/stream)

---

**Version History**:
- v1.0.0 (2025-12-25) - Initial documentation for sample rate handling
