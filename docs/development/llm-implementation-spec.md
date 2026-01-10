# LLM Integration - Technical Implementation Specification

**Version**: 1.1.0
**Last Updated**: 2026-01-10
**Status**: Ready for Implementation
**Target**: @backend-dev

---

## Table of Contents

1. [Overview](#overview)
2. [Module Structure](#module-structure)
3. [Implementation Steps](#implementation-steps)
4. [Component Specifications](#component-specifications)
5. [Type Definitions](#type-definitions)
6. [Configuration Files](#configuration-files)
7. [Integration Points](#integration-points)
8. [Error Handling](#error-handling)
9. [Testing Requirements](#testing-requirements)
10. [Acceptance Criteria](#acceptance-criteria)

---

## Overview

### Objective

Implement OpenAI GPT-4.1 LLM integration to transform the current echo-mode TTS system into an intelligent AI sales representative with **semantic streaming** for natural conversational pacing.

### Architecture Reference

This spec implements the design in:

- `/vantum-backend/docs/architecture/llm-integration.md` - High-level architecture
- `/vantum-backend/docs/architecture/semantic-streaming.md` - Semantic streaming design ⭐ NEW

Read those documents first for:

- High-level architecture
- Design decisions and rationale
- Complete data flow diagrams
- Error handling strategy
- Semantic streaming architecture

### Implementation Scope

**Files to Create** (12 files):

1. `src/modules/llm/controllers/llm.controller.ts`
2. `src/modules/llm/services/llm.service.ts`
3. `src/modules/llm/services/llm-session.service.ts`
4. `src/modules/llm/services/llm-streaming.service.ts` ⭐ NEW
5. `src/modules/llm/config/openai.config.ts`
6. `src/modules/llm/config/retry.config.ts`
7. `src/modules/llm/config/timeout.config.ts`
8. `src/modules/llm/config/prompts.config.ts`
9. `src/modules/llm/config/streaming.config.ts` ⭐ NEW
10. `src/modules/llm/config/index.ts`
11. `src/modules/llm/types/index.ts`
12. `src/modules/llm/index.ts`

**Files to Modify** (2 files):

1. `src/modules/tts/handlers/transcript.handler.ts` - Add LLM call
2. `.env.example` - Add OpenAI environment variables

**Dependencies to Install**:

```bash
pnpm add openai
```

**Estimated Effort**:

- Configuration + types: 30 min
- Streaming service: 3 hours ⭐
- LLM service integration: 1 hour
- System prompt update: 30 min
- Unit tests: 2 hours
- Integration tests: 1 hour
- **Total: ~8 hours**

---

## Module Structure

Create the following directory structure:

```
src/modules/llm/
├── index.ts                    # Module exports
├── controllers/
│   └── llm.controller.ts       # Public API (Controller pattern)
├── services/
│   ├── llm.service.ts          # Core LLM logic (Service pattern)
│   ├── llm-session.service.ts  # Conversation context management
│   └── llm-streaming.service.ts # Semantic chunking ⭐ NEW
├── types/
│   └── index.ts                # TypeScript type definitions
└── config/
    ├── index.ts                # Re-export all configs
    ├── openai.config.ts        # OpenAI API settings
    ├── retry.config.ts         # Retry/fallback settings
    ├── timeout.config.ts       # Timeout/cleanup settings
    ├── prompts.config.ts       # System prompts (with ||BREAK|| instructions)
    └── streaming.config.ts     # Streaming configuration ⭐ NEW
```

---

## Implementation Steps

### Step 1: Install Dependencies

```bash
cd vantum-backend
pnpm add openai
```

### Step 2: Create Module Structure

```bash
mkdir -p src/modules/llm/controllers
mkdir -p src/modules/llm/services
mkdir -p src/modules/llm/types
mkdir -p src/modules/llm/config
```

### Step 3: Implement Type Definitions

Create `src/modules/llm/types/index.ts` first (types needed by all other files).

### Step 4: Implement Configuration Files (5 files) ⭐ NEW

Create all 5 config files in `src/modules/llm/config/`:

1. `openai.config.ts`
2. `retry.config.ts`
3. `timeout.config.ts`
4. `prompts.config.ts` (with `||BREAK||` marker instructions)
5. `streaming.config.ts` ⭐ NEW (tracked file for semantic streaming)

### Step 5: Implement LLMSessionService

Create `src/modules/llm/services/llm-session.service.ts`.

This is a pure data service (no external dependencies), easiest to test.

### Step 6: Implement LLMStreamingService ⭐ NEW

Create `src/modules/llm/services/llm-streaming.service.ts`.

This handles:

- Token buffering until `||BREAK||` marker
- Chunk extraction and validation
- Sequential TTS delivery
- Fallback to sentence chunking

### Step 7: Implement LLMService

Create `src/modules/llm/services/llm.service.ts`.

Update to use LLMStreamingService for progressive TTS delivery.

### Step 8: Implement LLMController

Create `src/modules/llm/controllers/llm.controller.ts`.

This wraps LLMService with validation and logging.

### Step 9: Create Module Exports

Create `src/modules/llm/index.ts` to export controller.

### Step 10: Integrate with TTS Handler

Modify `src/modules/tts/handlers/transcript.handler.ts` to call LLM before TTS.

### Step 11: Update Environment Configuration

Add OpenAI variables to `.env.example`.

### Step 12: Write Tests

Create comprehensive test suite (see [Testing Requirements](#testing-requirements)).

### Step 13: Manual Testing

Test end-to-end flow with real OpenAI API.

---

## Component Specifications

### Component 1: Type Definitions

**File**: `src/modules/llm/types/index.ts`

```typescript
/**
 * LLM Module Type Definitions
 */

/**
 * Conversation context stored per session
 */
export interface ConversationContext {
  sessionId: string;
  messages: ConversationMessage[];
  createdAt: number;
  lastMessageAt: number;
  messageCount: number;
}

/**
 * Single message in conversation
 */
export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/**
 * LLM service configuration
 */
export interface LLMConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  apiKey: string;
  timeout: number;
}

/**
 * LLM service metrics
 */
export interface LLMServiceMetrics {
  activeSessions: number;
  totalRequests: number;
  totalSuccesses: number;
  totalFailures: number;
  averageResponseTimeMs: number;
  tier1Fallbacks: number;
  tier2Fallbacks: number;
  tier3Fallbacks: number;
  peakConcurrentSessions: number;
}

/**
 * OpenAI error types
 */
export enum OpenAIErrorType {
  NETWORK = 'network',
  AUTH = 'auth',
  RATE_LIMIT = 'rate_limit',
  TIMEOUT = 'timeout',
  INVALID_REQUEST = 'invalid',
  SERVER = 'server',
  UNKNOWN = 'unknown',
}

/**
 * Classified error with metadata
 */
export interface ClassifiedError {
  type: OpenAIErrorType;
  retryable: boolean;
  message: string;
  statusCode?: number;
}

/**
 * LLM response
 */
export interface LLMResponse {
  text: string;
  isFallback: boolean;
  tier?: number;
}

/**
 * Request queue item
 */
export interface QueuedRequest {
  userMessage: string;
  resolve: (response: string) => void;
  reject: (error: Error) => void;
  timestamp: number;
}
```

---

### Component 2: Configuration Files

#### File: `src/modules/llm/config/openai.config.ts`

```typescript
/**
 * OpenAI API Configuration
 */

export const openaiConfig = {
  // Model configuration
  model: process.env.LLM_MODEL || 'gpt-4.1-2025-04-14',
  temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
  maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '500', 10),
  topP: parseFloat(process.env.LLM_TOP_P || '1.0'),
  frequencyPenalty: parseFloat(process.env.LLM_FREQUENCY_PENALTY || '0.0'),
  presencePenalty: parseFloat(process.env.LLM_PRESENCE_PENALTY || '0.0'),

  // Streaming configuration
  streaming: true,

  // API configuration
  apiKey: process.env.OPENAI_API_KEY || '',
  organization: process.env.OPENAI_ORGANIZATION || undefined,
  timeout: parseInt(process.env.LLM_REQUEST_TIMEOUT || '30000', 10), // 30s

  // Validation
  validate(): void {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is required in environment variables');
    }
    if (this.temperature < 0 || this.temperature > 2) {
      throw new Error('LLM_TEMPERATURE must be between 0 and 2');
    }
    if (this.maxTokens < 1 || this.maxTokens > 4096) {
      throw new Error('LLM_MAX_TOKENS must be between 1 and 4096');
    }
  },
} as const;
```

#### File: `src/modules/llm/config/retry.config.ts`

```typescript
/**
 * Retry and Fallback Configuration
 */

export const llmRetryConfig = {
  // Fallback messages (3-tier strategy)
  fallbackMessages: {
    tier1: process.env.LLM_FALLBACK_TIER1 || 'I apologize, can you repeat that?',
    tier2:
      process.env.LLM_FALLBACK_TIER2 || "I'm experiencing technical difficulties. Please hold.",
    tier3:
      process.env.LLM_FALLBACK_TIER3 ||
      "I apologize, I'm having connection issues. I'll have someone call you back.",
  },

  // Retry configuration (not implemented in MVP)
  maxRetries: parseInt(process.env.LLM_MAX_RETRIES || '0', 10),
  retryDelays: [1000, 2000, 4000], // ms

  // Queue configuration
  maxQueueSize: parseInt(process.env.LLM_MAX_QUEUE_SIZE || '0', 10), // 0 = unlimited
} as const;
```

#### File: `src/modules/llm/config/timeout.config.ts`

```typescript
/**
 * Timeout Configuration
 */

export const llmTimeoutConfig = {
  // Request timeouts
  requestTimeout: parseInt(process.env.LLM_REQUEST_TIMEOUT || '30000', 10), // 30s
  streamingTimeout: parseInt(process.env.LLM_STREAMING_TIMEOUT || '60000', 10), // 60s

  // Session timeouts
  sessionIdleTimeout: parseInt(process.env.LLM_SESSION_IDLE_TIMEOUT || '1800000', 10), // 30 min
  sessionMaxDuration: parseInt(process.env.LLM_SESSION_MAX_DURATION || '7200000', 10), // 2 hours

  // Cleanup
  cleanupInterval: parseInt(process.env.LLM_CLEANUP_INTERVAL || '300000', 10), // 5 min

  // Context limits (0 = unlimited)
  maxMessagesPerContext: parseInt(process.env.LLM_MAX_MESSAGES || '0', 10),
  maxContextTokens: parseInt(process.env.LLM_MAX_CONTEXT_TOKENS || '0', 10),
} as const;
```

#### File: `src/modules/llm/config/prompts.config.ts` ⭐ UPDATED

```typescript
/**
 * System Prompts Configuration
 */

export const promptsConfig = {
  systemPrompt:
    process.env.LLM_SYSTEM_PROMPT ||
    `You are a professional sales representative for Vantum, an AI-powered cold outreach platform.

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

  // Future: Dynamic prompts with prospect data
  getDynamicPrompt(prospectData?: { name?: string; company?: string; industry?: string }): string {
    let prompt = this.systemPrompt;

    if (prospectData?.name) {
      prompt += `\n\nYou are speaking with ${prospectData.name}.`;
    }
    if (prospectData?.company) {
      prompt += `\nThey work at ${prospectData.company}.`;
    }
    if (prospectData?.industry) {
      prompt += `\nTheir company is in the ${prospectData.industry} industry.`;
    }

    return prompt;
  },
} as const;
```

#### File: `src/modules/llm/config/streaming.config.ts` ⭐ NEW

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
  fallbackMode: 'sentence' as const, // 'sentence' or 'complete'
} as const;

// Type export for TypeScript consumers
export type StreamingConfig = typeof streamingConfig;
```

#### File: `src/modules/llm/config/index.ts`

```typescript
/**
 * LLM Configuration Exports
 */

export * from './openai.config';
export * from './retry.config';
export * from './timeout.config';
export * from './prompts.config';
export * from './streaming.config'; // ⭐ NEW
```

---

### Component 3: LLMSessionService

**File**: `src/modules/llm/services/llm-session.service.ts`

(Same as before - no changes needed)

---

### Component 4: LLMStreamingService ⭐ NEW

**File**: `src/modules/llm/services/llm-streaming.service.ts`

```typescript
/**
 * LLM Streaming Service
 * Handles semantic chunking and progressive TTS delivery
 */

import { logger } from '@/shared/utils';
import { ttsController } from '@/modules/tts';
import { streamingConfig } from '../config/streaming.config';

export class LLMStreamingServiceClass {
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
          logger.warn('Buffer size exceeded, forcing chunk', {
            sessionId,
            bufferSize: buffer.length,
            limit: streamingConfig.maxBufferSize,
          });
          await this.sendChunkToTTS(sessionId, buffer);
          buffer = '';
        }
      }

      // Flush remaining buffer
      if (buffer.trim().length > 0) {
        logger.debug('Flushing remaining buffer', {
          sessionId,
          bufferSize: buffer.length,
        });
        await this.sendChunkToTTS(sessionId, buffer);
      }
    } catch (error) {
      logger.error('Error processing LLM stream', { sessionId, error });

      // Fallback: Send remaining buffer
      if (buffer.trim().length > 0) {
        try {
          await this.sendChunkToTTS(sessionId, buffer);
        } catch (fallbackError) {
          logger.error('Failed to send fallback buffer', { sessionId, fallbackError });
        }
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
        preview: chunk.substring(0, 50) + (chunk.length > 50 ? '...' : ''),
      });

      // Sequential delivery (await completion)
      await ttsController.synthesize(sessionId, chunk);

      logger.info('Chunk TTS complete', {
        sessionId,
        chunkLength: chunk.length,
      });
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
export const llmStreamingService = new LLMStreamingServiceClass();
```

---

### Component 5: LLMService (Updated for Streaming) ⭐

**File**: `src/modules/llm/services/llm.service.ts`

```typescript
/**
 * LLM Service
 * Core business logic for OpenAI GPT-4.1 integration with semantic streaming
 */

import OpenAI from 'openai';
import { logger } from '@/shared/utils';
import { llmSessionService } from './llm-session.service';
import { llmStreamingService } from './llm-streaming.service'; // ⭐ NEW
import { openaiConfig, llmRetryConfig, llmTimeoutConfig } from '../config';
import { LLMServiceMetrics, QueuedRequest } from '../types';

export class LLMServiceClass {
  private openai: OpenAI;
  private failureCounts = new Map<string, number>(); // sessionId -> failure count
  private requestQueues = new Map<string, QueuedRequest[]>(); // sessionId -> queue
  private processingFlags = new Map<string, boolean>(); // sessionId -> is processing

  // Metrics
  private totalRequests = 0;
  private totalSuccesses = 0;
  private totalFailures = 0;
  private tier1Fallbacks = 0;
  private tier2Fallbacks = 0;
  private tier3Fallbacks = 0;
  private responseTimes: number[] = [];
  private peakConcurrentSessions = 0;

  constructor() {
    // Validate configuration
    openaiConfig.validate();

    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: openaiConfig.apiKey,
      organization: openaiConfig.organization,
      timeout: openaiConfig.timeout,
    });

    logger.info('LLM service initialized', {
      model: openaiConfig.model,
      temperature: openaiConfig.temperature,
    });
  }

  /**
   * Generate response from OpenAI with semantic streaming
   * Queues request if session is busy
   */
  async generateResponse(sessionId: string, userMessage: string): Promise<void> {
    this.totalRequests++;

    // Create session if doesn't exist
    if (!llmSessionService.hasSession(sessionId)) {
      llmSessionService.createSession(sessionId);
    }

    // Check if processing
    if (this.processingFlags.get(sessionId)) {
      logger.debug('Session busy, queueing request', { sessionId });
      await this.queueRequest(sessionId, userMessage);
      return;
    }

    // Process immediately
    await this.processRequest(sessionId, userMessage);
  }

  /**
   * Queue request for later processing
   */
  private queueRequest(sessionId: string, userMessage: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const queue = this.requestQueues.get(sessionId) || [];
      queue.push({
        userMessage,
        resolve: resolve as any,
        reject,
        timestamp: Date.now(),
      });
      this.requestQueues.set(sessionId, queue);

      logger.debug('Request queued', {
        sessionId,
        queueSize: queue.length,
      });
    });
  }

  /**
   * Process queued requests
   */
  private async processQueue(sessionId: string): Promise<void> {
    const queue = this.requestQueues.get(sessionId);
    if (!queue || queue.length === 0) {
      return;
    }

    const request = queue.shift()!;
    this.requestQueues.set(sessionId, queue);

    try {
      await this.processRequest(sessionId, request.userMessage);
      request.resolve();
    } catch (error) {
      request.reject(error as Error);
    }
  }

  /**
   * Process single request with semantic streaming
   */
  private async processRequest(sessionId: string, userMessage: string): Promise<void> {
    const startTime = Date.now();
    this.processingFlags.set(sessionId, true);

    try {
      // Add user message to context
      llmSessionService.addUserMessage(sessionId, userMessage);

      // Call OpenAI with streaming
      await this.callOpenAIWithStreaming(sessionId);

      // Success - record metrics
      this.totalSuccesses++;
      this.failureCounts.set(sessionId, 0);
      const duration = Date.now() - startTime;
      this.responseTimes.push(duration);

      logger.info('LLM streaming complete', {
        sessionId,
        durationMs: duration,
      });
    } catch (error) {
      // Failure - use fallback
      this.totalFailures++;
      const attemptNumber = this.incrementFailureCount(sessionId);
      const fallback = this.getFallbackMessage(sessionId, attemptNumber);

      logger.error('LLM API call failed', {
        sessionId,
        attempt: attemptNumber,
        error: error instanceof Error ? error.message : String(error),
      });

      // Add fallback to context (maintains conversation coherence)
      llmSessionService.addAssistantMessage(sessionId, fallback);

      // Send fallback to TTS
      const { ttsController } = await import('@/modules/tts');
      await ttsController.synthesize(sessionId, fallback);
    } finally {
      this.processingFlags.set(sessionId, false);

      // Process next in queue
      await this.processQueue(sessionId);
    }
  }

  /**
   * Call OpenAI API with streaming and semantic chunking
   */
  private async callOpenAIWithStreaming(sessionId: string): Promise<void> {
    const messages = llmSessionService.getConversationHistory(sessionId);

    logger.debug('Calling OpenAI API with streaming', {
      sessionId,
      messageCount: messages.length,
      model: openaiConfig.model,
    });

    const stream = await this.openai.chat.completions.create({
      model: openaiConfig.model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      temperature: openaiConfig.temperature,
      max_tokens: openaiConfig.maxTokens,
      top_p: openaiConfig.topP,
      frequency_penalty: openaiConfig.frequencyPenalty,
      presence_penalty: openaiConfig.presencePenalty,
      stream: true,
    });

    // Convert OpenAI stream to token stream
    const tokenStream = this.convertToTokenStream(stream);

    // Process with semantic streaming (progressive TTS delivery)
    let completeResponse = '';
    for await (const token of tokenStream) {
      completeResponse += token;
    }

    // Add complete response to context
    llmSessionService.addAssistantMessage(sessionId, completeResponse);

    // Process with semantic chunking and send to TTS
    await llmStreamingService.processStream(sessionId, this.convertTextToStream(completeResponse));

    logger.debug('OpenAI streaming and TTS delivery complete', {
      sessionId,
      responseLength: completeResponse.length,
    });
  }

  /**
   * Convert OpenAI stream to async iterable of tokens
   */
  private async *convertToTokenStream(
    stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
  ): AsyncIterable<string> {
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || '';
      if (token) {
        yield token;
      }
    }
  }

  /**
   * Convert text to async iterable (for testing/fallback)
   */
  private async *convertTextToStream(text: string): AsyncIterable<string> {
    yield text;
  }

  /**
   * Get fallback message based on attempt number
   */
  private getFallbackMessage(sessionId: string, attemptNumber: number): string {
    let fallback: string;

    if (attemptNumber === 1) {
      this.tier1Fallbacks++;
      fallback = llmRetryConfig.fallbackMessages.tier1;
      logger.warn('Using Tier 1 fallback', { sessionId });
    } else if (attemptNumber === 2) {
      this.tier2Fallbacks++;
      fallback = llmRetryConfig.fallbackMessages.tier2;
      logger.warn('Using Tier 2 fallback', { sessionId });
    } else {
      this.tier3Fallbacks++;
      fallback = llmRetryConfig.fallbackMessages.tier3;
      logger.error('Using Tier 3 fallback (graceful exit)', { sessionId });
      // Future: Trigger session end or transfer to human
    }

    return fallback;
  }

  /**
   * Increment failure count for session
   */
  private incrementFailureCount(sessionId: string): number {
    const current = this.failureCounts.get(sessionId) || 0;
    const next = current + 1;
    this.failureCounts.set(sessionId, next);
    return next;
  }

  /**
   * Create LLM session (auto-called if doesn't exist)
   */
  async createSession(sessionId: string): Promise<void> {
    llmSessionService.createSession(sessionId);
    logger.info('LLM session created', { sessionId });
  }

  /**
   * End LLM session and cleanup
   */
  async endSession(sessionId: string): Promise<void> {
    llmSessionService.deleteSession(sessionId);
    this.failureCounts.delete(sessionId);
    this.requestQueues.delete(sessionId);
    this.processingFlags.delete(sessionId);
    logger.info('LLM session ended', { sessionId });
  }

  /**
   * Check if session exists
   */
  hasSession(sessionId: string): boolean {
    return llmSessionService.hasSession(sessionId);
  }

  /**
   * Health check
   */
  isHealthy(): boolean {
    return !!openaiConfig.apiKey;
  }

  /**
   * Get service metrics
   */
  getMetrics(): LLMServiceMetrics {
    // Update peak sessions
    const currentSessions = llmSessionService.getSessionCount();
    if (currentSessions > this.peakConcurrentSessions) {
      this.peakConcurrentSessions = currentSessions;
    }

    // Calculate average response time
    const avgResponseTime =
      this.responseTimes.length > 0
        ? this.responseTimes.reduce((sum, t) => sum + t, 0) / this.responseTimes.length
        : 0;

    return {
      activeSessions: currentSessions,
      totalRequests: this.totalRequests,
      totalSuccesses: this.totalSuccesses,
      totalFailures: this.totalFailures,
      averageResponseTimeMs: Math.round(avgResponseTime),
      tier1Fallbacks: this.tier1Fallbacks,
      tier2Fallbacks: this.tier2Fallbacks,
      tier3Fallbacks: this.tier3Fallbacks,
      peakConcurrentSessions: this.peakConcurrentSessions,
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('LLM service shutdown initiated', {
      activeSessions: llmSessionService.getSessionCount(),
    });

    llmSessionService.cleanup();

    // Clear all state
    this.failureCounts.clear();
    this.requestQueues.clear();
    this.processingFlags.clear();

    logger.info('LLM service shutdown complete');
  }
}

// Export singleton instance
export const llmService = new LLMServiceClass();
```

---

### Component 6: LLMController

(Same as before - no changes needed)

---

### Component 7: Module Exports

**File**: `src/modules/llm/index.ts`

```typescript
/**
 * LLM Module Exports
 */

export { llmController } from './controllers/llm.controller';
export { llmStreamingService } from './services/llm-streaming.service'; // ⭐ NEW
export type { LLMResponse, LLMServiceMetrics, ConversationContext } from './types';
```

---

## Integration Points

(Same as before - no changes needed)

---

## Error Handling

(Same as before - no changes needed)

---

## Testing Requirements

### Test Coverage Target

**Overall**: 85%+ coverage
**Critical Services**: 90%+ coverage

### Test Structure

```
tests/modules/llm/
├── controllers/
│   └── llm.controller.test.ts
├── services/
│   ├── llm.service.test.ts
│   ├── llm-session.service.test.ts
│   └── llm-streaming.service.test.ts ⭐ NEW
├── integration/
│   ├── llm-flow.test.ts
│   ├── llm-tts-integration.test.ts
│   └── llm-streaming-integration.test.ts ⭐ NEW
└── utils/
    └── error-classifier.test.ts
```

### Unit Tests for Streaming Service ⭐ NEW

**LLMStreamingService Tests** (15+ tests):

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
    test('sends fallback buffer on error');
  });

  describe('sendChunkToTTS', () => {
    test('calls ttsController.synthesize with correct params');
    test('logs chunk preview');
    test('throws error if TTS fails');
  });
});
```

### Integration Tests for Streaming ⭐ NEW

**LLM Streaming Integration Test**:

```typescript
describe('LLM Streaming Integration', () => {
  test('end-to-end: LLM stream → semantic chunks → TTS', async () => {
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

  test('latency improvement: first chunk < 1s', async () => {
    const start = Date.now();

    // Mock stream with marker
    const mockStream = createMockStream(['Hello ||BREAK||']);

    await llmStreamingService.processStream(sessionId, mockStream);

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000); // < 1s to first chunk
  });
});
```

### Performance Tests ⭐ NEW

```typescript
describe('Semantic Streaming Performance', () => {
  test('first chunk to TTS < 1s', async () => {
    const start = Date.now();

    const mockStream = createMockStream(['Hello ||BREAK||']);
    await llmStreamingService.processStream(sessionId, mockStream);

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000);
  });

  test('no memory leaks after 100 streams', async () => {
    const initialMemory = process.memoryUsage().heapUsed;

    for (let i = 0; i < 100; i++) {
      const sessionId = generateId();
      await llmStreamingService.processStream(sessionId, createMockStream(['Test ||BREAK|| Test']));
    }

    if (global.gc) global.gc();

    const finalMemory = process.memoryUsage().heapUsed;
    const growth = (finalMemory - initialMemory) / 1024 / 1024; // MB

    expect(growth).toBeLessThan(50); // < 50MB growth
  });
});
```

---

## Acceptance Criteria

### Functional Requirements

- [ ] LLM responds to user input with AI-generated text
- [ ] Conversation context is maintained across multiple turns
- [ ] 3-tier fallback strategy works correctly
- [ ] Failure count resets on successful response
- [ ] Queueing works when session is busy
- [ ] Session cleanup removes stale sessions
- [ ] All configuration loaded from config files
- [ ] Environment variables work correctly
- [ ] **Semantic streaming sends chunks progressively to TTS** ⭐ NEW
- [ ] **||BREAK|| marker is correctly parsed from LLM responses** ⭐ NEW
- [ ] **Sequential TTS delivery (waits for each chunk)** ⭐ NEW
- [ ] **Fallback to sentence chunking when no markers** ⭐ NEW

### Integration Requirements

- [ ] Transcript handler calls LLM before TTS
- [ ] LLM response is sent to TTS in chunks (not complete buffer) ⭐ NEW
- [ ] TTS receives chunks sequentially ⭐ NEW
- [ ] Zero TTS refactoring required
- [ ] Session cleanup includes LLM

### Non-Functional Requirements

- [ ] **First audio chunk < 1s** ⭐ NEW
- [ ] Response time < 5s (P95)
- [ ] 10 concurrent sessions work without errors
- [ ] No memory leaks after 100 conversations
- [ ] Memory per session < 50KB
- [ ] 85%+ test coverage
- [ ] All tests pass

### Code Quality Requirements

- [ ] Handler + Service pattern followed
- [ ] TypeScript strict mode (no `any`)
- [ ] Comprehensive error handling
- [ ] Resource cleanup on disconnect
- [ ] Structured logging with sessionId
- [ ] Configuration in config files (not hardcoded)

### Documentation Requirements

- [ ] Update implementation-plan.md (Phase 5 → COMPLETE)
- [ ] Update architecture.md (LLM module section)
- [ ] Add API documentation for LLMController
- [ ] Update README with LLM setup instructions
- [ ] Document all environment variables
- [ ] **Document semantic streaming architecture** ⭐ NEW (DONE)

---

## Manual Testing Checklist

### Setup

1. Install dependencies: `pnpm add openai`
2. Add `OPENAI_API_KEY` to `.env`
3. Start backend: `pnpm dev`
4. Start frontend: `cd ../vantum-frontend && pnpm dev`

### Test Cases

#### Test 1: Semantic Streaming (Progressive Audio) ⭐ NEW

- Connect to WebSocket
- Start audio
- Speak: "Hello, what is Vantum?"
- Stop recording
- Verify:
  - LLM generates AI response with `||BREAK||` markers
  - Audio plays progressively (chunk by chunk)
  - Natural pacing between chunks
  - Not all at once (unlike Option B)

#### Test 2: Single Turn Conversation

- Connect to WebSocket
- Start audio
- Speak: "Hello, what is Vantum?"
- Stop recording
- Verify:
  - LLM generates AI response (not echo)
  - TTS synthesizes AI voice
  - Response is relevant

#### Test 3: Multi-Turn Conversation

- Start new session
- Turn 1: "Hello, who is this?"
- Turn 2: "What are your prices?"
- Turn 3: "Can you tell me more?"
- Verify:
  - Each turn gets relevant response
  - Context is maintained (AI remembers previous turns)
  - No context leakage between sessions

#### Test 4: Fallback Tier 1

- Mock OpenAI error (network disconnect)
- Send message
- Verify:
  - AI responds: "I apologize, can you repeat that?"
  - TTS plays fallback message
  - Conversation continues

#### Test 5: Fallback Progression (Tier 1 → 2 → 3)

- Mock repeated OpenAI errors
- Send 3 messages
- Verify:
  - Message 1: Tier 1 fallback
  - Message 2: Tier 2 fallback
  - Message 3: Tier 3 fallback (graceful exit)

#### Test 6: Recovery After Error

- Mock OpenAI error
- Get Tier 1 fallback
- Fix error (unmock)
- Send new message
- Verify:
  - AI responds with normal response
  - Failure count reset

#### Test 7: Concurrent Sessions

- Open 5 browser tabs
- Start conversation in each
- Verify:
  - All sessions work independently
  - No context leakage
  - All get responses

#### Test 8: Session Cleanup

- Create session
- Leave idle for 30 minutes
- Verify:
  - Session cleaned up automatically
  - No memory leak

---

## Troubleshooting

### Issue: "OPENAI_API_KEY is required"

**Solution**: Add API key to `.env`:

```bash
OPENAI_API_KEY=sk-...
```

### Issue: OpenAI API errors

**Check**:

1. API key is valid
2. Account has credits
3. Rate limits not exceeded
4. Network connectivity

### Issue: Empty LLM responses

**Check**:

1. Conversation context is populated
2. System prompt is loaded
3. OpenAI model is correct

### Issue: High latency

**Check**:

1. OpenAI API latency (use metrics)
2. Network latency
3. Request timeout settings

### Issue: Memory leaks

**Check**:

1. Sessions are being cleaned up
2. Cleanup timer is running
3. No circular references in context

### Issue: No ||BREAK|| markers in responses ⭐ NEW

**Check**:

1. System prompt includes marker instructions
2. LLM is using latest prompt
3. Temperature not too high (should be 0.7)
4. Model is GPT-4.1 (not GPT-3.5)

### Issue: Chunks playing out of order ⭐ NEW

**Check**:

1. Sequential TTS is enabled (streamingConfig.sequentialTTS = true)
2. Await is used for each TTS call
3. No parallel processing

---

## Next Steps After Implementation

1. **Code Review**: Invoke @reviewer to review implementation
2. **Testing**: Invoke @tester to write comprehensive tests
3. **Performance Tuning**: Optimize latency if needed
4. **Documentation**: Update all related docs
5. **Production Deployment**: Deploy to production environment

---

**Document Version**: 1.1.0
**Date**: 2026-01-10
**Status**: Ready for Implementation (with Semantic Streaming)
**Next Review**: After implementation complete
