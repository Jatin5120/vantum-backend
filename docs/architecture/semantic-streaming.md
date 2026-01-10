# Semantic Streaming Architecture

**Version**: 1.0.0
**Last Updated**: 2026-01-10
**Status**: Final Design - Ready for Implementation
**Author**: @architect

---

## Table of Contents

1. [Overview](#overview)
2. [Break Marker Syntax](#break-marker-syntax)
3. [Streaming Architecture](#streaming-architecture)
4. [TTS Delivery Strategy](#tts-delivery-strategy)
5. [Error Handling & Fallback](#error-handling--fallback)
6. [System Prompt Integration](#system-prompt-integration)
7. [Configuration](#configuration)
8. [Performance Expectations](#performance-expectations)
9. [Implementation Guide](#implementation-guide)
10. [Testing Requirements](#testing-requirements)

---

## Overview

This document specifies the **Option D: Semantic Streaming** architecture for LLM-to-TTS integration in Vantum. This approach replaces the original Option B (complete buffer) with a more responsive, natural-sounding system that delivers audio in semantic chunks.

### Why Semantic Streaming?

**Problem with Option B (Complete Buffer)**:

- Buffered entire LLM response before sending to TTS
- First audio: ~2.8s latency
- Unnatural pacing (all at once)

**Solution: Semantic Streaming**:

- Streams semantic chunks progressively to TTS
- First audio: ~0.7s latency
- Natural conversational pacing

### Key Characteristics

- **Break Marker**: `||BREAK||` (explicit pause points)
- **LLM-Guided**: GPT-4.1 inserts markers at natural conversation boundaries
- **Progressive Delivery**: TTS receives chunks as LLM generates them
- **Sequential Processing**: Wait for each TTS chunk to complete before sending next
- **Fallback Strategy**: Graceful degradation if semantic chunking fails

---

## Break Marker Syntax

### Marker: `||BREAK||`

The system uses `||BREAK||` as the explicit pause marker.

**Why ||BREAK||?**

- **Semantic**: "BREAK" clearly communicates pause intent to the LLM
- **Unique**: Extremely unlikely to appear in natural conversation
- **Parseable**: Easy to detect with regex: `/\|\|BREAK\|\|/g`
- **Memorable**: LLM can easily remember and apply correctly

### Example Usage

**LLM Response:**

```
"Hi, this is Alex from Vantum. ||BREAK|| I noticed your company recently expanded.
Do you have a moment to chat? ||BREAK|| I promise to keep it brief."
```

**Parsed Chunks:**

```typescript
[
  'Hi, this is Alex from Vantum.',
  'I noticed your company recently expanded. Do you have a moment to chat?',
  'I promise to keep it brief.',
];
```

### Parsing Implementation

```typescript
/**
 * Extract chunks from LLM response using ||BREAK|| markers
 */
function extractMarkerChunks(text: string): string[] {
  return text
    .split(/\|\|BREAK\|\|/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}
```

**Regex Explanation:**

- `/\|\|BREAK\|\|/` matches literal `||BREAK||`
- `\\|` escapes the pipe character (special in regex)
- Split on marker, trim whitespace, remove empty strings

---

## Streaming Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User speaks: "What are your prices?"                        │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. STT Service (Deepgram) transcribes                          │
│    transcript = "What are your prices?"                         │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. LLM Service (OpenAI GPT-4.1) generates response             │
│    streaming: true                                              │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼ (LLM streams tokens)
┌─────────────────────────────────────────────────────────────────┐
│ 4. Semantic Streaming Service buffers tokens until marker      │
│    Buffer: "Our pricing starts at $99/month"                   │
│    Marker detected: ||BREAK||                                   │
│    → Extract Chunk 1: "Our pricing starts at $99/month"        │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Send Chunk 1 to TTS (Sequential)                            │
│    await ttsController.synthesize(sessionId, chunk1)            │
│    ⏳ Wait for TTS to complete                                  │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. User hears Chunk 1 audio                                    │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. Continue buffering tokens for Chunk 2                       │
│    Buffer: "We also offer enterprise plans."                   │
│    Marker detected: ||BREAK||                                   │
│    → Extract Chunk 2                                            │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 8. Send Chunk 2 to TTS (Sequential)                            │
│    await ttsController.synthesize(sessionId, chunk2)            │
│    ⏳ Wait for TTS to complete                                  │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 9. User hears Chunk 2 audio                                    │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 10. LLM stream complete (no more tokens)                       │
│     Flush any remaining buffer as final chunk                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Points

1. **Token Buffering**: LLM tokens are buffered until a `||BREAK||` marker is detected
2. **Chunk Extraction**: Each chunk is extracted, trimmed, and validated
3. **Sequential TTS**: Each chunk is sent to TTS and **awaited** before sending the next
4. **Progressive Audio**: User hears audio progressively as chunks complete
5. **Final Flush**: Any remaining buffer after LLM stream ends is sent as final chunk

---

## TTS Delivery Strategy

### Sequential TTS Delivery

Chunks are sent to TTS **sequentially** (not in parallel).

**Flow:**

```typescript
for (const chunk of chunks) {
  await ttsController.synthesize(sessionId, chunk); // ← Await each
}
```

**Why Sequential?**

- **Prevents out-of-order audio**: Chunks play in correct sequence
- **Predictable behavior**: Each chunk completes before next starts
- **Easier error handling**: Can stop on first error
- **Simplicity**: No complex coordination needed

**Trade-off:**

- **Slight latency increase**: Chunk 2 waits for Chunk 1 to complete
- **Acceptable for MVP**: Reliability > marginal latency gain

### Parallel vs Sequential Comparison

| Aspect         | Sequential (Chosen)   | Parallel (Rejected)      |
| -------------- | --------------------- | ------------------------ |
| Audio order    | ✅ Guaranteed correct | ❌ May play out of order |
| Latency        | ~200ms slower         | ~200ms faster            |
| Complexity     | ✅ Simple             | ❌ Complex coordination  |
| Error handling | ✅ Easy               | ❌ Difficult             |
| Reliability    | ✅ High               | ⚠️ Medium                |

**Decision**: Sequential delivery prioritizes reliability and predictability over marginal latency gains.

---

## Error Handling & Fallback

### Fallback Strategy

**Primary**: Marker-based chunking (`||BREAK||`)
**Secondary**: Semantic sentence grouping
**Tertiary (Fallback)**: Sentence-by-sentence (Option C)
**Last Resort**: Send complete buffer

### Fallback Flow

```
Try: Extract ||BREAK|| markers
  ↓ (if no markers found)
Try: Semantic sentence grouping
  ↓ (if grouping fails or error)
Fallback: Split on sentence boundaries (. ! ?)
  ↓ (if all else fails)
Last Resort: Send complete buffer
```

### Implementation

```typescript
async function processLLMResponse(sessionId: string, buffer: string): Promise<void> {
  try {
    // Primary: Marker-based chunking
    if (buffer.includes('||BREAK||')) {
      const chunks = extractMarkerChunks(buffer);
      await sendChunksToTTS(sessionId, chunks);
      return;
    }

    // Secondary: Semantic sentence grouping (future enhancement)
    const semanticChunks = extractSemanticGroups(buffer);
    if (semanticChunks.length > 0) {
      await sendChunksToTTS(sessionId, semanticChunks);
      return;
    }

    // Tertiary: Sentence-by-sentence fallback (Option C)
    logger.warn('No markers found, falling back to sentence chunking', { sessionId });
    const sentences = extractSentences(buffer);
    await sendChunksToTTS(sessionId, sentences);
  } catch (error) {
    // Last resort: Send complete buffer
    logger.error('Semantic chunking failed, sending complete buffer', { sessionId, error });
    await ttsController.synthesize(sessionId, buffer);
  }
}

/**
 * Sentence-by-sentence fallback (Option C)
 */
function extractSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
```

### Error Scenarios

| Scenario           | Response                       | Rationale                         |
| ------------------ | ------------------------------ | --------------------------------- |
| No markers found   | Fall back to sentence chunking | Still better than complete buffer |
| Chunking fails     | Send complete buffer           | Last resort, ensures audio plays  |
| TTS error on chunk | Stop processing, log error     | Prevent cascading failures        |
| LLM stream error   | Use fallback message           | 3-tier fallback from LLM service  |

---

## System Prompt Integration

### Enhanced System Prompt

The LLM system prompt includes explicit instructions for using the `||BREAK||` marker.

**File**: `src/modules/llm/config/prompts.config.ts`

```typescript
export const promptsConfig = {
  systemPrompt: `You are a professional sales representative for Vantum, an AI-powered cold outreach platform.

Your goals:
1. Engage prospects in natural, friendly conversation
2. Gather information about their business needs
3. Book a meeting or demo when appropriate
4. Handle objections gracefully

Guidelines:
- Be conversational and professional
- Keep responses concise (2-3 sentences per chunk)
- Ask open-ended questions
- Listen actively and respond to what they say
- Don't be pushy - focus on value
- If they're not interested, thank them and end gracefully

IMPORTANT - Natural Speech Pacing:
Use the marker "||BREAK||" to indicate natural pause points in your response.

Place ||BREAK|| between:
- Distinct thoughts or ideas
- Questions (to give listener time to think)
- Transitions between topics
- Natural conversation breath points

Examples:
✓ "Hi, this is Alex from Vantum. ||BREAK|| I noticed your company recently expanded."
✓ "That's a great question! ||BREAK|| Let me explain how we can help."
✓ "I understand your concern. ||BREAK|| Many clients felt the same initially."

Keep chunks between ||BREAK|| markers to 1-3 sentences for natural pacing.

Remember: You're having a phone conversation, so speak naturally and keep it brief.`,
};
```

### Prompt Design Principles

1. **Clear Instructions**: Explicit guidance on when to use `||BREAK||`
2. **Examples**: Concrete examples of correct usage
3. **Natural Pacing**: Encourage 1-3 sentences per chunk
4. **Conversational**: Maintain natural phone conversation style
5. **Consistent**: Same marker throughout all conversations

---

## Configuration

### Streaming Configuration File

**File**: `src/modules/llm/config/streaming.config.ts` (tracked in git)

```typescript
/**
 * Semantic Streaming Configuration
 *
 * This file is TRACKED in git (not environment variables) for consistency
 * across environments and easier testing.
 */

export const streamingConfig = {
  // Break marker for prompt-guided chunking
  breakMarker: '||BREAK||',

  // Chunk size limits
  minChunkWords: 5, // Minimum words per chunk
  maxChunkWords: 50, // Maximum words per chunk
  maxChunkChars: 300, // Maximum characters per chunk

  // Safety limits
  maxBufferSize: 400, // Force chunk if buffer exceeds this (chars)

  // TTS delivery
  sequentialTTS: true, // Wait for each TTS chunk to complete

  // Fallback configuration
  enableFallback: true, // Enable fallback to sentence chunking
  fallbackMode: 'sentence', // 'sentence' or 'complete'
} as const;

// Type export for TypeScript consumers
export type StreamingConfig = typeof streamingConfig;
```

### Configuration Rationale

**Why tracked file (not env variables)?**

- **Consistency**: Same config across dev, staging, production
- **Testability**: Easy to test different configurations
- **Version Control**: Changes tracked in git
- **Type Safety**: TypeScript can validate config
- **Simplicity**: No need for env variable parsing

**No Environment Variables**: All streaming behavior is controlled via tracked file.

---

## Performance Expectations

### Latency Targets

| Metric                | Option B (Complete Buffer) | Option D (Semantic Streaming) | Improvement   |
| --------------------- | -------------------------- | ----------------------------- | ------------- |
| **First audio**       | ~2.8s                      | ~0.7s                         | **-75%** ⭐   |
| LLM first token       | ~0.3s                      | ~0.3s                         | Same          |
| LLM complete response | ~2.0s                      | ~2.0s                         | Same          |
| TTS first chunk       | ~0.5s                      | ~0.5s                         | Same          |
| User experience       | Unnatural (all at once)    | Natural (progressive)         | **Better** ⭐ |

### User Experience Comparison

**Option B (Complete Buffer)**:

```
User: "What are your prices?"
[2.8s silence]
AI: "Our pricing starts at $99/month. We also offer enterprise plans. Would you like to hear more about our features?"
```

**Option D (Semantic Streaming)**:

```
User: "What are your prices?"
[0.7s] AI: "Our pricing starts at $99/month."
[0.3s] AI: "We also offer enterprise plans."
[0.3s] AI: "Would you like to hear more about our features?"
```

**Result**: Semantic streaming feels more conversational and responsive.

---

## Implementation Guide

### Phase 1: Create Streaming Service

**File**: `src/modules/llm/services/llm-streaming.service.ts`

```typescript
/**
 * LLM Streaming Service
 * Handles semantic chunking and progressive TTS delivery
 */

import { logger } from '@/shared/utils';
import { ttsController } from '@/modules/tts';
import { streamingConfig } from '../config/streaming.config';

export class LLMStreamingService {
  /**
   * Process LLM stream and send chunks to TTS progressively
   */
  async processStream(sessionId: string, stream: AsyncIterable<string>): Promise<void> {
    let buffer = '';

    try {
      // Stream tokens from LLM
      for await (const token of stream) {
        buffer += token;

        // Check for marker
        if (buffer.includes(streamingConfig.breakMarker)) {
          const chunks = this.extractChunks(buffer);

          // Send complete chunks to TTS (keep remainder in buffer)
          for (let i = 0; i < chunks.length - 1; i++) {
            await this.sendChunkToTTS(sessionId, chunks[i]);
          }

          // Keep last incomplete chunk in buffer
          buffer = chunks[chunks.length - 1] || '';
        }

        // Safety: Force chunk if buffer too large
        if (buffer.length > streamingConfig.maxBufferSize) {
          await this.sendChunkToTTS(sessionId, buffer);
          buffer = '';
        }
      }

      // Flush remaining buffer
      if (buffer.trim().length > 0) {
        await this.sendChunkToTTS(sessionId, buffer);
      }
    } catch (error) {
      logger.error('Error processing LLM stream', { sessionId, error });

      // Fallback: Send remaining buffer
      if (buffer.trim().length > 0) {
        await this.sendChunkToTTS(sessionId, buffer);
      }

      throw error;
    }
  }

  /**
   * Extract chunks from buffer using ||BREAK|| marker
   */
  private extractChunks(text: string): string[] {
    return text
      .split(new RegExp(streamingConfig.breakMarker, 'g'))
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0);
  }

  /**
   * Send single chunk to TTS (sequential)
   */
  private async sendChunkToTTS(sessionId: string, chunk: string): Promise<void> {
    try {
      logger.debug('Sending chunk to TTS', {
        sessionId,
        chunkLength: chunk.length,
        preview: chunk.substring(0, 50),
      });

      await ttsController.synthesize(sessionId, chunk);

      logger.info('Chunk TTS complete', { sessionId });
    } catch (error) {
      logger.error('Error sending chunk to TTS', {
        sessionId,
        chunk: chunk.substring(0, 100),
        error,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const llmStreamingService = new LLMStreamingService();
```

### Phase 2: Update LLM Service

**File**: `src/modules/llm/services/llm.service.ts`

Replace the complete buffer logic with semantic streaming:

```typescript
import { llmStreamingService } from './llm-streaming.service';

export class LLMService {
  async generateResponse(sessionId: string, userMessage: string): Promise<string> {
    try {
      // Add user message to context
      llmSessionService.addUserMessage(sessionId, userMessage);

      // Get conversation history
      const messages = llmSessionService.getConversationHistory(sessionId);

      // Call OpenAI with streaming
      const stream = await this.openai.chat.completions.create({
        model: openaiConfig.model,
        messages: messages as OpenAI.ChatCompletionMessageParam[],
        temperature: openaiConfig.temperature,
        max_tokens: openaiConfig.maxTokens,
        stream: true,
      });

      // Convert OpenAI stream to token stream
      const tokenStream = this.convertToTokenStream(stream);

      // Process stream with semantic chunking (sends to TTS progressively)
      await llmStreamingService.processStream(sessionId, tokenStream);

      // Success
      logger.info('LLM streaming complete', { sessionId });
    } catch (error) {
      logger.error('LLM streaming failed', { sessionId, error });
      // Use fallback (3-tier strategy already in place)
      throw error;
    }
  }

  /**
   * Convert OpenAI stream to async iterable of tokens
   */
  private async *convertToTokenStream(
    stream: AsyncIterable<OpenAI.ChatCompletionChunk>
  ): AsyncIterable<string> {
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || '';
      if (token) {
        yield token;
      }
    }
  }
}
```

### Phase 3: Update System Prompt

**File**: `src/modules/llm/config/prompts.config.ts`

Add the `||BREAK||` marker instructions (see [System Prompt Integration](#system-prompt-integration) above).

### Phase 4: Testing

See [Testing Requirements](#testing-requirements) below.

---

## Testing Requirements

### Unit Tests

**Test File**: `tests/modules/llm/services/llm-streaming.service.test.ts`

```typescript
describe('LLMStreamingService', () => {
  describe('extractChunks', () => {
    test('extracts chunks with ||BREAK|| marker');
    test('trims whitespace from chunks');
    test('filters empty chunks');
    test('handles text without markers (single chunk)');
    test('handles multiple consecutive markers');
  });

  describe('processStream', () => {
    test('buffers tokens until marker found');
    test('sends complete chunks to TTS sequentially');
    test('awaits TTS completion before sending next chunk');
    test('flushes remaining buffer at end of stream');
    test('forces chunk when buffer exceeds max size');
    test('handles TTS errors gracefully');
  });

  describe('fallback', () => {
    test('falls back to sentence chunking when no markers');
    test('sends complete buffer on chunking failure');
    test('logs fallback usage');
  });
});
```

### Integration Tests

**Test File**: `tests/modules/llm/integration/llm-streaming-integration.test.ts`

```typescript
describe('LLM Streaming Integration', () => {
  test('end-to-end: LLM stream → TTS chunks', async () => {
    // Mock OpenAI stream with markers
    const mockStream = createMockStream([
      'Hi, this is Alex. ',
      '||BREAK|| ',
      'How can I help you? ',
      '||BREAK|| ',
      'We have great offers.',
    ]);

    // Process stream
    await llmStreamingService.processStream(sessionId, mockStream);

    // Verify TTS called 3 times (3 chunks)
    expect(ttsController.synthesize).toHaveBeenCalledTimes(3);
    expect(ttsController.synthesize).toHaveBeenNthCalledWith(1, sessionId, 'Hi, this is Alex.');
    expect(ttsController.synthesize).toHaveBeenNthCalledWith(2, sessionId, 'How can I help you?');
    expect(ttsController.synthesize).toHaveBeenNthCalledWith(3, sessionId, 'We have great offers.');
  });

  test('sequential delivery: waits for each TTS to complete', async () => {
    // Track call order
    const callOrder: number[] = [];

    ttsController.synthesize.mockImplementation(async () => {
      callOrder.push(Date.now());
      await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay
    });

    await llmStreamingService.processStream(sessionId, mockStream);

    // Verify sequential (each call 100ms+ apart)
    expect(callOrder[1] - callOrder[0]).toBeGreaterThanOrEqual(100);
    expect(callOrder[2] - callOrder[1]).toBeGreaterThanOrEqual(100);
  });
});
```

### Performance Tests

```typescript
describe('Semantic Streaming Performance', () => {
  test('first chunk to TTS < 1s', async () => {
    const start = Date.now();

    // Mock stream with marker
    const mockStream = createMockStream(['Hello ||BREAK||']);

    await llmStreamingService.processStream(sessionId, mockStream);

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000);
  });

  test('latency improvement over complete buffer', async () => {
    // Compare Option D vs Option B
    const optionD = await measureLatency(() => semanticStreaming());
    const optionB = await measureLatency(() => completeBuffer());

    expect(optionD.firstChunk).toBeLessThan(optionB.firstChunk);
  });
});
```

### Coverage Target

**Overall**: 85%+ for streaming service
**Critical paths**: 95%+ (chunk extraction, TTS delivery)

---

## Migration from Option B

### Before (Option B - Complete Buffer)

```typescript
// Old implementation (DEPRECATED)
async function generateResponse(sessionId: string, userMessage: string): Promise<string> {
  const stream = await openai.chat.completions.create({ stream: true });

  // Buffer entire response
  let completeResponse = '';
  for await (const chunk of stream) {
    completeResponse += chunk.choices[0]?.delta?.content || '';
  }

  // Send complete buffer to TTS (single call)
  await ttsController.synthesize(sessionId, completeResponse);

  return completeResponse;
}
```

**Latency**: First audio ~2.8s

### After (Option D - Semantic Streaming)

```typescript
// New implementation (CURRENT)
async function generateResponse(sessionId: string, userMessage: string): Promise<void> {
  const stream = await openai.chat.completions.create({ stream: true });

  // Convert to token stream
  const tokenStream = convertToTokenStream(stream);

  // Process with semantic chunking (progressive TTS delivery)
  await llmStreamingService.processStream(sessionId, tokenStream);
}
```

**Latency**: First audio ~0.7s (-75% improvement ⭐)

### No Configuration Needed

Semantic streaming is the **default and only mode**. No environment variables or feature flags needed.

---

## Related Documents

- [LLM Integration Architecture](./llm-integration.md) - Overall LLM design
- [LLM Implementation Spec](../development/llm-implementation-spec.md) - Implementation details
- [TTS Module Documentation](../modules/tts.md) - TTS integration
- [WebSocket Protocol](../protocol/websocket-protocol.md) - Protocol specification

---

## Approval & Next Steps

**Design Status**: ✅ FINAL - Ready for Implementation

**Recommended Next Step**:

```
Please invoke @backend-dev to implement semantic streaming:

@backend-dev Implement semantic streaming service per spec in /vantum-backend/docs/architecture/semantic-streaming.md

Key tasks:
1. Create llm-streaming.service.ts with marker-based chunking
2. Update llm.service.ts to use streaming service
3. Create streaming.config.ts (tracked file)
4. Update prompts.config.ts with ||BREAK|| instructions
5. Write comprehensive tests (85%+ coverage)

Estimated effort: 8 hours
```

---

**Document Version**: 1.0.0
**Date**: 2026-01-10
**Status**: Final Design - Ready for Implementation
**Next Review**: After implementation complete
