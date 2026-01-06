# Cartesia TTS Integration - Implementation Fix

**Issue**: ZERO audio chunks received despite successful synthesis
**Root Cause**: Listening to wrong event name (`'chunk'` vs `'enqueue'`)
**Severity**: P0 - Blocking
**Fix Complexity**: LOW - 30 lines of code

---

## The Problem

**Current Code** (lines 220-242 in `tts.service.ts`):

```typescript
source.on('chunk', async (audioData: Int16Array | Uint8Array) => {
  logger.debug('🎵 Cartesia chunk received!', {
    sessionId,
    utteranceId,
    dataType: audioData.constructor.name,
    byteLength: audioData.byteLength,
  });

  try {
    const audioBuffer = Buffer.from(audioData.buffer, audioData.byteOffset, audioData.byteLength);
    await this.handleAudioChunk(session, audioBuffer);
  } catch (error) {
    logger.error('Error handling audio chunk from Cartesia', { sessionId, error });
    session.metrics.errors++;
  }
});
```

**Why It Fails**:
1. Event name is `'enqueue'` (not `'chunk'`)
2. Event has no parameter (must read from `source.buffer`)
3. Need to track read position to avoid re-processing

---

## The Solution

### Step 1: Replace Event Listener

**Replace lines 217-242** with:

```typescript
// Listen for audio chunks from the source
// Note: Cartesia SDK emits 'enqueue' when audio data is added to buffer
logger.debug('🔍 Registering Cartesia enqueue listener', { sessionId, utteranceId });

// Track last processed write index to avoid re-processing
let lastProcessedIndex = 0;

source.on('enqueue', async () => {
  try {
    // Check if new data available
    const currentWriteIndex = source.writeIndex;

    if (currentWriteIndex <= lastProcessedIndex) {
      // No new data since last processing
      return;
    }

    // Get new audio data from buffer
    const audioData = source.buffer.subarray(lastProcessedIndex, currentWriteIndex);

    if (audioData.length === 0) {
      logger.debug('Empty audio data in enqueue event', { sessionId, utteranceId });
      return;
    }

    logger.debug('🎵 Cartesia audio enqueued!', {
      sessionId,
      utteranceId,
      dataType: audioData.constructor.name,
      byteLength: audioData.byteLength,
      length: audioData.length,
      newSamples: currentWriteIndex - lastProcessedIndex,
    });

    // Convert TypedArray to Buffer
    const audioBuffer = Buffer.from(
      audioData.buffer,
      audioData.byteOffset,
      audioData.byteLength
    );

    // Process audio chunk
    await this.handleAudioChunk(session, audioBuffer);

    // Update last processed index
    lastProcessedIndex = currentWriteIndex;
  } catch (error) {
    logger.error('Error handling audio enqueue from Cartesia', {
      sessionId: session.sessionId,
      utteranceId: session.currentUtteranceId,
      error: error instanceof Error ? error.message : String(error),
    });
    session.metrics.errors++;
    // Don't crash - continue processing next chunks
  }
});

logger.debug('🔍 Enqueue listener registered', { sessionId, utteranceId });

// Safeguard: Check if data already buffered (race condition)
// This handles case where audio arrives before listener is registered
if (source.writeIndex > 0) {
  logger.debug('🔍 Initial buffer check - data already present', {
    sessionId,
    utteranceId,
    writeIndex: source.writeIndex,
  });

  // Manually trigger processing for existing data
  try {
    const initialData = source.buffer.subarray(0, source.writeIndex);
    if (initialData.length > 0) {
      const audioBuffer = Buffer.from(
        initialData.buffer,
        initialData.byteOffset,
        initialData.byteLength
      );
      await this.handleAudioChunk(session, audioBuffer);
      lastProcessedIndex = source.writeIndex;
    }
  } catch (error) {
    logger.error('Error processing initial buffered data', {
      sessionId,
      utteranceId,
      error,
    });
  }
}
```

---

### Step 2: Remove Debug Event Listeners

**Delete lines 194-215** (the catch-all event listeners):

```typescript
// DEBUG: Log all available events on source
const sourceAny = source as any;
if (sourceAny.eventNames) {
  logger.debug('🔍 Source available events', {
    sessionId,
    utteranceId,
    events: sourceAny.eventNames(),
  });
}

// DEBUG: Register catch-all event listeners for diagnostics
['chunk', 'data', 'message', 'close', 'end', 'finish', 'error'].forEach(eventName => {
  sourceAny.on(eventName, (...args: any[]) => {
    logger.debug(`🔔 Source event: ${eventName}`, {
      sessionId,
      utteranceId,
      argsCount: args.length,
      firstArgType: args[0]?.constructor?.name,
      firstArgLength: args[0]?.length || args[0]?.byteLength,
    });
  });
});
```

**Reason**: These were diagnostic listeners for non-existent events. They create memory leaks and clutter logs.

---

### Step 3: Keep Close and Error Listeners (Lines 246-294)

**No changes needed** - these listeners are correct:

```typescript
// Listen for completion
source.on('close', () => {
  try {
    logger.debug('🔍 Audio source closed, synthesis complete', {
      sessionId,
      utteranceId,
      chunksReceived: session.metrics.chunksGenerated,
      wasSynthesisSuccessful: session.metrics.chunksGenerated > 0,
    });

    this.handleSynthesisComplete(session);
  } catch (error) {
    logger.error('Error handling synthesis complete', { sessionId, utteranceId, error });
  }
});

// Listen for errors
source.on('error', (error: Error) => {
  logger.error('🚨 Cartesia source error event', { sessionId, utteranceId, error });

  try {
    this.handleCartesiaError(session, error);
  } catch (handlingError) {
    logger.error('Error in error handler', { sessionId, utteranceId, originalError: error, handlingError });
  }
});
```

---

## Expected Behavior After Fix

### Before Fix:
```
✅ Cartesia synthesis request sent
✅ Connection established
🔔 Source event: close (fired)
❌ NO 'chunk' events
❌ chunksGenerated: 0
❌ Falls back to echo
```

### After Fix:
```
✅ Cartesia synthesis request sent
✅ Connection established
🎵 Cartesia audio enqueued! (newSamples: 1600)
🎵 Cartesia audio enqueued! (newSamples: 1600)
🎵 Cartesia audio enqueued! (newSamples: 1600)
🎵 Cartesia audio enqueued! (newSamples: 800)
🔍 Audio source closed, synthesis complete
✅ chunksGenerated: 4
✅ Audio sent to client
```

---

## Testing Strategy

### Unit Test Update

**Update mock in test file** (`tts-e2e.test.ts` lines 18-50):

```typescript
const mockAudioSource = {
  buffer: new Int16Array(6400), // Buffer to hold audio data
  writeIndex: 0,
  readIndex: 0,

  on: vi.fn((event: string, handler: Function) => {
    if (event === 'enqueue') {  // ← Changed from 'chunk'
      // Simulate realistic audio streaming
      const chunks = [
        new Int16Array(1600), // ~100ms of audio at 16kHz
        new Int16Array(1600),
        new Int16Array(1600),
        new Int16Array(800), // Last chunk smaller
      ];

      let chunkIndex = 0;
      const streamInterval = setInterval(() => {
        if (chunkIndex < chunks.length) {
          // Copy chunk into buffer
          const chunk = chunks[chunkIndex];
          this.buffer.set(chunk, this.writeIndex);
          this.writeIndex += chunk.length;

          // Trigger enqueue event
          handler();  // ← No parameter!
          chunkIndex++;
        } else {
          clearInterval(streamInterval);
        }
      }, 100); // 100ms between chunks
    }

    if (event === 'close') {
      setTimeout(() => handler(), 500); // Complete after all chunks
    }

    if (event === 'error' && shouldFailSynthesis) {
      setTimeout(() => handler(new Error('Synthesis error')), 50);
    }
  }),
  off: vi.fn(),
  once: vi.fn(),
};
```

---

### Integration Test

Run E2E test after fix:

```bash
cd vantum-backend
pnpm test tests/modules/tts/integration/tts-e2e.test.ts
```

**Expected**:
- ✅ All tests pass
- ✅ Audio chunks received: 4
- ✅ Total samples: 6400
- ✅ No fallback to echo

---

### Manual Test (Real Cartesia API)

```bash
# Set real API key
export CARTESIA_API_KEY="your-key-here"

# Run development server
pnpm dev

# Connect frontend and trigger TTS synthesis
# Expected: Hear actual AI voice, not echo
```

---

## Files to Modify

1. **`/vantum-backend/src/modules/tts/services/tts.service.ts`**
   - Lines 194-242: Replace event listener logic
   - Add race condition safeguard

2. **`/vantum-backend/tests/modules/tts/integration/tts-e2e.test.ts`**
   - Lines 18-50: Update mock audio source
   - Change event from `'chunk'` to `'enqueue'`
   - Simulate buffer write operations

---

## Risk Assessment

**Risk Level**: LOW

**Why Low Risk**:
- Small, isolated change (1 event name + buffer read logic)
- No changes to state machine or session management
- No changes to external API calls
- Backward compatible (no breaking changes)
- Easy to revert if needed

**Testing Coverage**:
- Unit tests: 10+ tests covering synthesis flow
- Integration tests: E2E scenario with realistic mocks
- Manual testing: Real Cartesia API validation

---

## Rollback Plan

If fix causes issues:

```bash
git revert <commit-hash>
```

Or manually revert:

```typescript
// Revert to line 220-242 (original code)
source.on('chunk', async (audioData: Int16Array | Uint8Array) => {
  // ... original implementation
});
```

---

## Success Criteria

- [ ] E2E test passes with 4 audio chunks received
- [ ] No "chunksGenerated: 0" in logs
- [ ] Real Cartesia API produces actual AI voice
- [ ] No echo fallback in production scenario
- [ ] Test coverage remains 85%+

---

## Timeline

**Estimated Time**: 1 hour
- Implementation: 20 minutes
- Testing: 20 minutes
- Documentation: 20 minutes

**Dependencies**: None

**Blockers**: None

---

## Next Steps

1. **Invoke @backend-dev** to implement this fix
2. **Run tests** to validate fix works
3. **Manual test** with real Cartesia API
4. **Update test mocks** if needed
5. **Commit changes** with clear message

**Commit Message Template**:
```
fix(tts): correct Cartesia audio source event handling

- Change event from 'chunk' to 'enqueue' per SDK specification
- Read audio data from source.buffer instead of event parameter
- Add race condition safeguard for pre-buffered audio
- Remove debug listeners for non-existent events
- Update test mocks to simulate enqueue behavior

Fixes: Zero audio chunks received from Cartesia synthesis
Verified against: @cartesia/cartesia-js v2.2.9 source code
```

---

**Prepared By**: @architect
**Date**: 2026-01-04
**Status**: READY FOR IMPLEMENTATION
