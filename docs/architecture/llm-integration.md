# OpenAI GPT-4.1 LLM Integration Architecture

**Version**: 1.0.0
**Last Updated**: 2026-01-08
**Status**: Design Complete - Ready for Implementation
**Author**: @architect

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Integration Point](#integration-point)
4. [Design Decisions](#design-decisions)
5. [Component Architecture](#component-architecture)
6. [Data Flow](#data-flow)
7. [Conversation Context Management](#conversation-context-management)
8. [Error Handling & Fallbacks](#error-handling--fallbacks)
9. [Configuration Schema](#configuration-schema)
10. [Future Enhancements](#future-enhancements)
11. [Testing Strategy](#testing-strategy)

---

## Overview

This document specifies the architecture for integrating OpenAI GPT-4.1 into the Vantum backend's audio pipeline. The LLM service will transform the current echo-mode TTS system into an intelligent AI sales representative capable of holding natural conversations.

### Current Flow (Echo Mode)

```
User speaks → STT transcribes → TTS echoes back → User hears echo
```

### Target Flow (With LLM)

```
User speaks → STT transcribes → LLM generates response → TTS speaks AI → User hears AI
```

### Key Requirements

**User-Specified**:

- Model: `gpt-4.1-2025-04-14` (latest GPT-4.1)
- Streaming: Buffer complete response before TTS (Option B)
- Temperature: 0.7 (configurable via config file)
- Context: Entire session history (no token limits for now)
- Storage: In-memory (no database persistence)
- Business Logic: AI sales representative for cold outreach
- Prompt: Short system prompt, dynamic data for future
- Error Handling: 3-tier fallback strategy
- Queueing: Always queue (never reject)

**System Requirements**:

- Pattern: Handler + Service separation (non-negotiable)
- Type Safety: TypeScript strict mode
- Testing: Real OpenAI API, 80%+ coverage
- Integration: Zero TTS refactoring (as designed)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Vantum Backend                               │
│                                                                 │
│  ┌──────────────────────────────────────────┐                 │
│  │  STT Module (Deepgram) ✅ COMPLETE       │                 │
│  │  - Real-time transcription                │                 │
│  │  - Final transcript accumulation          │                 │
│  └────────────┬─────────────────────────────┘                 │
│               │ Transcript (string)                            │
│               ▼                                                 │
│  ┌──────────────────────────────────────────┐                 │
│  │  TTS Module - Transcript Handler         │                 │
│  │  handleFinalTranscript() ⭐ INTEGRATION  │                 │
│  └────────────┬─────────────────────────────┘                 │
│               │                                                 │
│               ▼                                                 │
│  ┌──────────────────────────────────────────┐                 │
│  │  LLM Module (NEW) 📋 THIS DESIGN         │                 │
│  │                                           │                 │
│  │  ┌─────────────────────────────────────┐│                 │
│  │  │ LLMController (Public API)          ││                 │
│  │  │ - generateResponse(sessionId, text) ││                 │
│  │  │ - Validation, logging               ││                 │
│  │  └───────────┬─────────────────────────┘│                 │
│  │              │                            │                 │
│  │              ▼                            │                 │
│  │  ┌─────────────────────────────────────┐│                 │
│  │  │ LLMService (Core Logic)             ││                 │
│  │  │ - OpenAI API integration            ││                 │
│  │  │ - Request queueing                  ││                 │
│  │  │ - Streaming & buffering             ││                 │
│  │  │ - 3-tier error fallback             ││                 │
│  │  └───────────┬─────────────────────────┘│                 │
│  │              │                            │                 │
│  │              ▼                            │                 │
│  │  ┌─────────────────────────────────────┐│                 │
│  │  │ LLMSessionService                   ││                 │
│  │  │ - Conversation context storage      ││                 │
│  │  │ - Message history (all turns)       ││                 │
│  │  │ - Session lifecycle                 ││                 │
│  │  └─────────────────────────────────────┘│                 │
│  └──────────────┬───────────────────────────┘                 │
│                 │ AI Response (string)                         │
│                 ▼                                               │
│  ┌──────────────────────────────────────────┐                 │
│  │  TTS Module (Cartesia) ✅ COMPLETE       │                 │
│  │  - Text-to-speech synthesis               │                 │
│  │  - Audio streaming to client              │                 │
│  └──────────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Integration Point

### Current Implementation (Echo Mode)

**File**: `/vantum-backend/src/modules/tts/handlers/transcript.handler.ts`

```typescript
export async function handleFinalTranscript(transcript: string, sessionId: string): Promise<void> {
  try {
    // Validate transcript
    if (!transcript || transcript.trim().length === 0) {
      logger.warn('Empty transcript, skipping TTS', { sessionId });
      return;
    }

    // Send to TTS for synthesis (echo mode)
    await ttsController.synthesize(sessionId, transcript);
  } catch (error) {
    logger.error('Error handling final transcript for TTS', { sessionId, error });
  }
}
```

### Target Implementation (With LLM)

```typescript
export async function handleFinalTranscript(transcript: string, sessionId: string): Promise<void> {
  try {
    // Validate transcript
    if (!transcript || transcript.trim().length === 0) {
      logger.warn('Empty transcript, skipping LLM', { sessionId });
      return;
    }

    // Step 1: Send transcript to LLM
    const llmResponse = await llmController.generateResponse(sessionId, transcript);

    // Step 2: Send LLM response to TTS (SAME API as echo mode) ⭐
    await ttsController.synthesize(sessionId, llmResponse.text);

    logger.info('LLM response sent to TTS', { sessionId });
  } catch (error) {
    logger.error('Error handling final transcript for LLM', { sessionId, error });
    // Fallback already handled by LLMController (3-tier strategy)
  }
}
```

**Key Point**: ✅ **ZERO TTS REFACTORING REQUIRED** - TTS controller API remains identical.

---

## Design Decisions

### Decision 1: Conversation Context Storage

**Options Considered**:

1. **Extend existing `SessionService`** - Add conversation history to existing sessions
2. **Create new `LLMSessionService`** - Dedicated service for LLM-specific data
3. **Hybrid approach** - Use SessionService for lifecycle, LLMSessionService for context

**Chosen**: **Option 2 - Create new `LLMSessionService`**

**Rationale**:

- **Separation of concerns**: LLM context is domain-specific, not core session data
- **Scalability**: LLM data can grow large (conversation history), should be isolated
- **Testing**: Easier to test LLM functionality in isolation
- **Future-proofing**: When adding database persistence, LLM context can be migrated independently
- **Pattern consistency**: Follows STT/TTS pattern (each service manages its own session data)

**Data Structure**:

```typescript
interface ConversationContext {
  sessionId: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  createdAt: number;
  lastMessageAt: number;
  messageCount: number;
}
```

**Trade-offs**:

- Slight duplication (two session stores)
- Worth it for better isolation and testability

---

### Decision 2: Request Queueing Strategy

**Options Considered**:

1. **No queue** - Process requests immediately, reject if busy
2. **Simple FIFO queue** - Queue all requests, process sequentially
3. **Priority queue** - Prioritize certain requests (e.g., user interruptions)

**Chosen**: **Option 2 - Simple FIFO queue**

**Rationale**:

- **User requirement**: "Always queue, never reject"
- **Simplicity**: FIFO is easiest to implement and reason about
- **Sufficient for MVP**: Target is 10 concurrent users, no need for complex prioritization
- **Predictable behavior**: Requests processed in order they arrive

**Implementation**:

- Per-session queue (not global)
- Process one request at a time per session
- No queue size limit (user said no limits for now)
- Future: Add max queue size with graceful rejection

**Trade-offs**:

- No prioritization (e.g., can't prioritize interruptions)
- Potential memory growth if user sends many requests quickly
- Acceptable for MVP, can optimize later

---

### Decision 3: Streaming Buffer Strategy

**User Specified**: "Buffer complete response before TTS (Option B)"

**Implementation**:

```typescript
// OpenAI streaming API
const stream = await openai.chat.completions.create({
  model: 'gpt-4.1-2025-04-14',
  messages: conversationHistory,
  stream: true,
  temperature: 0.7,
});

// Buffer all chunks
let completeResponse = '';
for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content || '';
  completeResponse += content;
}

// Send complete response to TTS (single call)
await ttsController.synthesize(sessionId, completeResponse);
```

**Rationale**:

- **Pros**: Simpler TTS integration, single audio utterance, easier error handling
- **Cons**: Higher latency (wait for complete LLM response before TTS starts)
- **Trade-off**: Acceptable for MVP, can optimize with streaming later

**Future Optimization (Option A - Not Now)**:

- Stream LLM tokens to TTS in real-time
- Requires sentence boundary detection
- Requires TTS queueing/buffering
- Adds complexity, defer to Phase 2

---

### Decision 4: OpenAI SDK Integration

**Options Considered**:

1. **Official `openai` npm package** - Recommended SDK
2. **Direct HTTP API calls** - Lower-level control
3. **Wrapper library** (e.g., LangChain) - Higher-level abstraction

**Chosen**: **Option 1 - Official `openai` npm package**

**Rationale**:

- **Official support**: Maintained by OpenAI
- **TypeScript support**: Native types included
- **Streaming support**: Built-in streaming API
- **Error handling**: Structured error types
- **Updates**: Automatically supports new models/features

**Package**: `openai` (latest version)

**Trade-offs**:

- Locked into OpenAI's SDK design
- Acceptable - SDK is stable and well-designed

---

### Decision 5: Error Recovery Strategy

**User Specified**: 3-tier fallback strategy

**Implementation**:

```typescript
// Tier 1: First failure
const TIER_1_MESSAGE = 'I apologize, can you repeat that?';

// Tier 2: Second failure
const TIER_2_MESSAGE = "I'm experiencing technical difficulties. Please hold.";

// Tier 3: Third failure
const TIER_3_MESSAGE =
  "I apologize, I'm having connection issues. I'll have someone call you back.";

class LLMService {
  private failureCounts = new Map<string, number>(); // sessionId -> count

  async generateResponse(sessionId: string, userMessage: string): Promise<string> {
    try {
      // Attempt LLM call
      const response = await this.callOpenAI(sessionId, userMessage);

      // Success - reset failure count
      this.failureCounts.set(sessionId, 0);
      return response;
    } catch (error) {
      // Failure - increment count and use fallback
      const count = (this.failureCounts.get(sessionId) || 0) + 1;
      this.failureCounts.set(sessionId, count);

      logger.error('LLM API call failed', { sessionId, attempt: count, error });

      // Return fallback based on attempt number
      if (count === 1) {
        return TIER_1_MESSAGE;
      } else if (count === 2) {
        return TIER_2_MESSAGE;
      } else {
        // Tier 3: Graceful exit
        return TIER_3_MESSAGE;
        // Future: Trigger session end or transfer to human
      }
    }
  }
}
```

**Retry Logic**:

- **No retries** - Use fallback immediately
- Rationale: Faster recovery, better UX (AI responds quickly with fallback)
- Future: Add exponential backoff retry before fallback

---

### Decision 6: Configuration Management

**Chosen**: Store all configs in config files (not hardcoded)

**File Structure**:

```
src/modules/llm/config/
├── index.ts             # Re-export all configs
├── openai.config.ts     # OpenAI settings (model, temperature)
├── retry.config.ts      # Retry/fallback settings (delays, max attempts)
├── timeout.config.ts    # Timeout settings (request timeout, session timeout)
└── prompts.config.ts    # System prompts (sales rep persona)
```

**Why**:

- Easy to change without code modification
- Environment-specific configs (dev vs prod)
- Testable (mock configs in tests)
- Follows STT/TTS pattern (consistent across modules)

---

## Component Architecture

### Component 1: LLMController

**Location**: `src/modules/llm/controllers/llm.controller.ts`

**Responsibilities**:

- Public API for LLM operations
- Input validation (sessionId, transcript)
- High-level error handling and logging
- Delegates to LLMService

**API**:

```typescript
export class LLMController {
  /**
   * Generate AI response for user message
   * @param sessionId - Session ID
   * @param userMessage - User's transcript from STT
   * @returns Promise<{ text: string }> - AI response text
   * @throws Error if validation fails or LLM service unavailable
   */
  async generateResponse(sessionId: string, userMessage: string): Promise<{ text: string }>;

  /**
   * Initialize LLM session (optional - auto-created on first message)
   * @param sessionId - Session ID
   */
  async initializeSession(sessionId: string): Promise<void>;

  /**
   * End LLM session and cleanup context
   * @param sessionId - Session ID
   */
  async endSession(sessionId: string): Promise<void>;

  /**
   * Check if LLM service is healthy
   * @returns boolean
   */
  isHealthy(): boolean;

  /**
   * Get service metrics (for monitoring)
   */
  getMetrics(): LLMServiceMetrics;
}
```

**Dependencies**:

- LLMService (core logic)
- Logger (shared utility)

**Error Handling**:

- Validates inputs (sessionId required, userMessage non-empty)
- Logs all operations with sessionId context
- Rethrows errors to caller (transcript handler)
- Fallbacks handled by LLMService (transparent to controller)

---

### Component 2: LLMService

**Location**: `src/modules/llm/services/llm.service.ts`

**Responsibilities**:

- OpenAI API integration
- Conversation context management (via LLMSessionService)
- Request queueing (per session)
- Streaming and buffering
- 3-tier error fallback
- Retry logic (future)
- Cleanup and resource management

**API**:

```typescript
export class LLMService {
  /**
   * Generate response from OpenAI
   * Queues request if session is busy
   * @param sessionId - Session ID
   * @param userMessage - User message
   * @returns Promise<string> - AI response (or fallback message)
   */
  async generateResponse(sessionId: string, userMessage: string): Promise<string>;

  /**
   * Create LLM session (auto-called if doesn't exist)
   */
  async createSession(sessionId: string): Promise<void>;

  /**
   * End LLM session and cleanup
   */
  async endSession(sessionId: string): Promise<void>;

  /**
   * Check if session exists
   */
  hasSession(sessionId: string): boolean;

  /**
   * Health check
   */
  isHealthy(): boolean;

  /**
   * Get service metrics
   */
  getMetrics(): LLMServiceMetrics;

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void>;
}
```

**Private Methods**:

```typescript
private async callOpenAI(sessionId: string, userMessage: string): Promise<string>;
private async processQueue(sessionId: string): Promise<void>;
private getFallbackMessage(sessionId: string, attemptNumber: number): string;
private incrementFailureCount(sessionId: string): number;
private resetFailureCount(sessionId: string): void;
```

**Dependencies**:

- OpenAI SDK (`openai` package)
- LLMSessionService (conversation context)
- OpenAI config (model, temperature)
- Retry config (delays, max attempts)
- Timeout config (request timeout)
- Prompts config (system prompt)
- Logger (shared utility)

**Error Handling**:

- Catches all OpenAI API errors
- Returns fallback messages (3-tier strategy)
- Tracks failure count per session
- Logs all errors with context

---

### Component 3: LLMSessionService

**Location**: `src/modules/llm/services/llm-session.service.ts`

**Responsibilities**:

- Store conversation context (message history)
- Manage session lifecycle
- Add user/assistant messages
- Retrieve conversation history for OpenAI
- Cleanup stale sessions

**API**:

```typescript
export class LLMSessionService {
  /**
   * Create new conversation context
   */
  createSession(sessionId: string): ConversationContext;

  /**
   * Get conversation context
   */
  getSession(sessionId: string): ConversationContext | undefined;

  /**
   * Check if session exists
   */
  hasSession(sessionId: string): boolean;

  /**
   * Add user message to context
   */
  addUserMessage(sessionId: string, message: string): void;

  /**
   * Add assistant message to context
   */
  addAssistantMessage(sessionId: string, message: string): void;

  /**
   * Get conversation history for OpenAI API
   * @returns Array<{ role, content }> - Message array for OpenAI
   */
  getConversationHistory(sessionId: string): Array<{ role: string; content: string }>;

  /**
   * Delete session and cleanup
   */
  deleteSession(sessionId: string): void;

  /**
   * Get all sessions (for cleanup)
   */
  getAllSessions(): ConversationContext[];

  /**
   * Get session count
   */
  getSessionCount(): number;
}
```

**Data Structure**:

```typescript
interface ConversationContext {
  sessionId: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  createdAt: number;
  lastMessageAt: number;
  messageCount: number;
}

class LLMSessionServiceClass {
  private sessions = new Map<string, ConversationContext>();
  private systemPrompt: string; // Loaded from config
}
```

**Dependencies**:

- Prompts config (system prompt)
- Logger (shared utility)

**Cleanup Strategy**:

- Automatic cleanup timer (follows STT/TTS pattern)
- Cleanup conditions:
  - Session idle > 30 minutes
  - Session duration > 2 hours
  - Total message count > 1000 (prevent memory leak)
- Cleanup interval: 5 minutes (configurable)

---

## Data Flow

### Complete Flow (User Input → AI Response)

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
│ 3. handleFinalTranscript(transcript, sessionId)                │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. LLMController.generateResponse(sessionId, transcript)       │
│    - Validates input                                            │
│    - Logs request                                               │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. LLMService.generateResponse(sessionId, transcript)          │
│    - Checks if session exists (creates if not)                  │
│    - Adds to queue if busy                                      │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. LLMSessionService: Add user message to context              │
│    context.messages.push({                                      │
│      role: 'user',                                              │
│      content: "What are your prices?",                          │
│      timestamp: Date.now()                                      │
│    })                                                           │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. LLMService: Get conversation history                        │
│    messages = [                                                 │
│      { role: 'system', content: 'You are a sales rep...' },    │
│      { role: 'user', content: 'What are your prices?' }        │
│    ]                                                            │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 8. LLMService: Call OpenAI API (with streaming)                │
│    const stream = await openai.chat.completions.create({       │
│      model: 'gpt-4.1-2025-04-14',                              │
│      messages: messages,                                        │
│      stream: true,                                              │
│      temperature: 0.7                                           │
│    });                                                          │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 9. LLMService: Buffer streaming response                       │
│    let response = '';                                           │
│    for await (const chunk of stream) {                          │
│      response += chunk.choices[0]?.delta?.content || '';       │
│    }                                                            │
│    // response = "Our pricing starts at..."                    │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 10. LLMSessionService: Add assistant message to context        │
│     context.messages.push({                                     │
│       role: 'assistant',                                        │
│       content: response,                                        │
│       timestamp: Date.now()                                     │
│     })                                                          │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 11. Return response to LLMController                            │
│     return { text: response }                                   │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 12. handleFinalTranscript: Send to TTS                         │
│     await ttsController.synthesize(sessionId, response.text)    │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 13. TTS Service (Cartesia) synthesizes audio                   │
│     - Generates audio chunks                                    │
│     - Resamples to 48kHz                                        │
│     - Streams to client                                         │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 14. User hears AI response: "Our pricing starts at..."         │
└─────────────────────────────────────────────────────────────────┘
```

### Error Flow (Failure Scenario)

```
Step 8: OpenAI API call FAILS (network error)
   │
   ▼
LLMService catches error
   │
   ▼
Increment failure count (failureCounts.set(sessionId, 1))
   │
   ▼
Get fallback message (Tier 1)
   fallback = "I apologize, can you repeat that?"
   │
   ▼
Add fallback to conversation context
   context.messages.push({ role: 'assistant', content: fallback })
   │
   ▼
Return fallback to controller
   return { text: fallback }
   │
   ▼
handleFinalTranscript sends fallback to TTS
   await ttsController.synthesize(sessionId, fallback)
   │
   ▼
User hears: "I apologize, can you repeat that?"
```

---

## Conversation Context Management

### Context Structure

```typescript
// Single conversation context per session
interface ConversationContext {
  sessionId: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  createdAt: number;
  lastMessageAt: number;
  messageCount: number;
}

// Example context during conversation
{
  sessionId: "01934567-89ab-cdef-0123-456789abcd00",
  messages: [
    {
      role: 'system',
      content: 'You are a professional sales representative...',
      timestamp: 1704415200000
    },
    {
      role: 'user',
      content: 'Hello, who is this?',
      timestamp: 1704415205000
    },
    {
      role: 'assistant',
      content: 'Hi! This is Sarah from Vantum. How are you today?',
      timestamp: 1704415208000
    },
    {
      role: 'user',
      content: 'What are your prices?',
      timestamp: 1704415215000
    },
    {
      role: 'assistant',
      content: 'Our pricing starts at $99/month...',
      timestamp: 1704415220000
    }
  ],
  createdAt: 1704415200000,
  lastMessageAt: 1704415220000,
  messageCount: 5
}
```

### Context Lifecycle

**Creation**:

- Auto-created on first message (lazy initialization)
- System prompt added as first message
- Stored in LLMSessionService Map

**Updates**:

- Add user message before LLM call
- Add assistant message after LLM response (or fallback)
- Update lastMessageAt timestamp
- Increment messageCount

**Retrieval**:

- Get full conversation history for OpenAI API
- Format: Array<{ role, content }> (timestamp removed for API)

**Cleanup**:

- Automatic cleanup timer (5 minutes interval)
- Cleanup conditions:
  - Idle > 30 minutes (no new messages)
  - Duration > 2 hours (session too long)
  - messageCount > 1000 (prevent memory leak)
- Manual cleanup on disconnect (via endSession)

### Memory Management

**Current**: No limits (user specified)

**Future** (when scaling):

- Token counting (estimate with tiktoken)
- Sliding window (keep last N messages)
- Message pruning (remove old messages when exceeding limit)
- Context compression (summarize old messages)

**Memory Estimate**:

- Average message: ~100 characters = 200 bytes
- 100 messages per conversation: ~20KB
- 100 concurrent conversations: ~2MB
- **Acceptable for MVP**

---

## Error Handling & Fallbacks

### 3-Tier Fallback Strategy

```typescript
// Configuration
const FALLBACK_MESSAGES = {
  tier1: 'I apologize, can you repeat that?',
  tier2: "I'm experiencing technical difficulties. Please hold.",
  tier3: "I apologize, I'm having connection issues. I'll have someone call you back.",
};

// Implementation
class LLMService {
  private failureCounts = new Map<string, number>();

  async generateResponse(sessionId: string, userMessage: string): Promise<string> {
    try {
      // Add user message to context
      llmSessionService.addUserMessage(sessionId, userMessage);

      // Attempt OpenAI call
      const response = await this.callOpenAI(sessionId, userMessage);

      // Success - reset failure count
      this.failureCounts.set(sessionId, 0);

      // Add assistant message to context
      llmSessionService.addAssistantMessage(sessionId, response);

      return response;
    } catch (error) {
      // Log error
      logger.error('LLM API call failed', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Increment failure count
      const attemptNumber = this.incrementFailureCount(sessionId);

      // Get fallback message based on attempt
      const fallback = this.getFallbackMessage(sessionId, attemptNumber);

      // Add fallback to context (maintains conversation coherence)
      llmSessionService.addAssistantMessage(sessionId, fallback);

      // Return fallback
      return fallback;
    }
  }

  private getFallbackMessage(sessionId: string, attemptNumber: number): string {
    if (attemptNumber === 1) {
      return FALLBACK_MESSAGES.tier1;
    } else if (attemptNumber === 2) {
      return FALLBACK_MESSAGES.tier2;
    } else {
      // Tier 3: Graceful exit
      // Future: Trigger session end or transfer to human
      logger.error('LLM failed 3 times, using final fallback', { sessionId });
      return FALLBACK_MESSAGES.tier3;
    }
  }

  private incrementFailureCount(sessionId: string): number {
    const current = this.failureCounts.get(sessionId) || 0;
    const next = current + 1;
    this.failureCounts.set(sessionId, next);
    return next;
  }

  private resetFailureCount(sessionId: string): void {
    this.failureCounts.set(sessionId, 0);
  }
}
```

### Error Classification

```typescript
// Error types from OpenAI SDK
enum OpenAIErrorType {
  NETWORK = 'network', // Network/connection error
  AUTH = 'auth', // Invalid API key
  RATE_LIMIT = 'rate_limit', // Rate limit exceeded
  TIMEOUT = 'timeout', // Request timeout
  INVALID_REQUEST = 'invalid', // Invalid request format
  SERVER = 'server', // OpenAI server error
  UNKNOWN = 'unknown',
}

function classifyOpenAIError(error: unknown): {
  type: OpenAIErrorType;
  retryable: boolean;
  message: string;
} {
  // OpenAI SDK error classification
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) {
      return { type: OpenAIErrorType.AUTH, retryable: false, message: 'Invalid API key' };
    }
    if (error.status === 429) {
      return { type: OpenAIErrorType.RATE_LIMIT, retryable: true, message: 'Rate limit exceeded' };
    }
    if (error.status === 408 || error.status === 504) {
      return { type: OpenAIErrorType.TIMEOUT, retryable: true, message: 'Request timeout' };
    }
    if (error.status >= 500) {
      return { type: OpenAIErrorType.SERVER, retryable: true, message: 'OpenAI server error' };
    }
    if (error.status === 400) {
      return {
        type: OpenAIErrorType.INVALID_REQUEST,
        retryable: false,
        message: 'Invalid request',
      };
    }
  }

  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return { type: OpenAIErrorType.NETWORK, retryable: true, message: 'Network error' };
  }

  // Unknown error
  return {
    type: OpenAIErrorType.UNKNOWN,
    retryable: true,
    message: error instanceof Error ? error.message : String(error),
  };
}
```

### Logging Strategy

```typescript
// Success logging
logger.info('LLM response generated', {
  sessionId,
  userMessageLength: userMessage.length,
  responseLength: response.length,
  durationMs: Date.now() - startTime,
  attemptNumber: 1,
});

// Error logging
logger.error('LLM API call failed', {
  sessionId,
  errorType: classified.type,
  errorMessage: classified.message,
  retryable: classified.retryable,
  attemptNumber,
  userMessage: userMessage.substring(0, 100), // First 100 chars only
});

// Fallback logging
logger.warn('Using LLM fallback message', {
  sessionId,
  tier: attemptNumber,
  fallbackMessage: fallback,
});
```

---

## Configuration Schema

### File: `src/modules/llm/config/openai.config.ts`

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
  streaming: true, // Always stream (buffer before TTS for now)

  // API configuration
  apiKey: process.env.OPENAI_API_KEY || '',
  organization: process.env.OPENAI_ORGANIZATION || undefined,
  timeout: parseInt(process.env.LLM_REQUEST_TIMEOUT || '30000', 10), // 30s

  // Validation
  validate() {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is required');
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

### File: `src/modules/llm/config/retry.config.ts`

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

  // Retry configuration (not implemented in MVP, but prepared)
  maxRetries: parseInt(process.env.LLM_MAX_RETRIES || '0', 10), // 0 = no retries
  retryDelays: [1000, 2000, 4000], // Exponential backoff (ms)

  // Queue configuration
  maxQueueSize: parseInt(process.env.LLM_MAX_QUEUE_SIZE || '0', 10), // 0 = unlimited
} as const;
```

### File: `src/modules/llm/config/timeout.config.ts`

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

  // Context limits (for future)
  maxMessagesPerContext: parseInt(process.env.LLM_MAX_MESSAGES || '0', 10), // 0 = unlimited
  maxContextTokens: parseInt(process.env.LLM_MAX_CONTEXT_TOKENS || '0', 10), // 0 = unlimited
} as const;
```

### File: `src/modules/llm/config/prompts.config.ts`

```typescript
/**
 * System Prompts Configuration
 */
export const promptsConfig = {
  // System prompt for sales representative
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
- Keep responses concise (2-3 sentences)
- Ask open-ended questions
- Listen actively and respond to what they say
- Don't be pushy - focus on value
- If they're not interested, thank them and end gracefully

Remember: You're having a phone conversation, so speak naturally and keep it brief.`,

  // Future: Dynamic prompts
  // These will be populated with prospect data (name, company, etc.)
  getDynamicPrompt(prospectData?: { name?: string; company?: string; industry?: string }): string {
    if (!prospectData) {
      return this.systemPrompt;
    }

    // Future enhancement: Customize prompt with prospect data
    let prompt = this.systemPrompt;

    if (prospectData.name) {
      prompt += `\n\nYou are speaking with ${prospectData.name}.`;
    }
    if (prospectData.company) {
      prompt += `\nThey work at ${prospectData.company}.`;
    }
    if (prospectData.industry) {
      prompt += `\nTheir company is in the ${prospectData.industry} industry.`;
    }

    return prompt;
  },
} as const;
```

### Environment Variables (`.env`)

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-...
OPENAI_ORGANIZATION=org-...  # Optional
LLM_MODEL=gpt-4.1-2025-04-14
LLM_TEMPERATURE=0.7
LLM_MAX_TOKENS=500
LLM_REQUEST_TIMEOUT=30000

# Fallback Messages
LLM_FALLBACK_TIER1="I apologize, can you repeat that?"
LLM_FALLBACK_TIER2="I'm experiencing technical difficulties. Please hold."
LLM_FALLBACK_TIER3="I apologize, I'm having connection issues. I'll have someone call you back."

# Session Configuration
LLM_SESSION_IDLE_TIMEOUT=1800000   # 30 minutes
LLM_SESSION_MAX_DURATION=7200000   # 2 hours
LLM_CLEANUP_INTERVAL=300000        # 5 minutes

# Context Limits (0 = unlimited)
LLM_MAX_MESSAGES=0
LLM_MAX_CONTEXT_TOKENS=0
```

---

## Future Enhancements

### Phase 2: Real-Time Streaming (Not MVP)

**Goal**: Stream LLM tokens to TTS in real-time (reduce latency)

**Requirements**:

- Sentence boundary detection
- TTS queue management
- Partial response handling
- Cancellation support

**Complexity**: High - defer until Phase 2

---

### Phase 3: Advanced Features (Post-Launch)

**Interruption Handling**:

- Detect when user speaks during AI response
- Cancel LLM generation mid-stream
- Cancel TTS playback
- Resume conversation gracefully

**Dynamic Prompts**:

- Populate prompt with prospect data (name, company, industry)
- Campaign-specific prompts
- A/B test different prompts

**Context Management**:

- Token counting (tiktoken library)
- Sliding window (keep last N messages)
- Message pruning
- Context compression/summarization

**Database Persistence**:

- Store conversation history in PostgreSQL
- Restore context on reconnection
- Analytics and reporting

**Script Following**:

- Optional script for AI to loosely follow
- Script stages (intro, pitch, objection handling, close)
- Flexibility: AI can deviate when needed

**Retry Logic**:

- Exponential backoff retry before fallback
- Max 2 retries with delays [1s, 2s]
- Only retry on retryable errors (network, timeout, 5xx)

---

## Testing Strategy

### Unit Tests (Target: 85%+ coverage)

**LLMController Tests**:

```typescript
describe('LLMController', () => {
  test('validates sessionId is required');
  test('validates userMessage is non-empty');
  test('calls LLMService.generateResponse');
  test('returns response object with text property');
  test('throws error if LLM service fails');
  test('logs all operations with sessionId');
});
```

**LLMService Tests**:

```typescript
describe('LLMService', () => {
  test('calls OpenAI API with correct parameters');
  test('buffers streaming response completely');
  test('adds user message to context before LLM call');
  test('adds assistant message to context after LLM call');
  test('returns fallback on first error (Tier 1)');
  test('returns fallback on second error (Tier 2)');
  test('returns fallback on third error (Tier 3)');
  test('resets failure count on success');
  test('queues requests when session is busy');
  test('processes queue sequentially');
  test('creates session if not exists');
  test('cleans up on endSession');
});
```

**LLMSessionService Tests**:

```typescript
describe('LLMSessionService', () => {
  test('creates session with system prompt');
  test('adds user message to context');
  test('adds assistant message to context');
  test('returns conversation history for OpenAI');
  test('formats messages correctly (role + content)');
  test('updates lastMessageAt timestamp');
  test('increments messageCount');
  test('deletes session and cleans up');
  test('cleanup timer removes idle sessions');
  test('cleanup timer removes long sessions');
  test('cleanup timer removes sessions exceeding message limit');
});
```

### Integration Tests

**End-to-End Flow**:

```typescript
describe('LLM Integration E2E', () => {
  test('user message → LLM → assistant response');
  test('multi-turn conversation maintains context');
  test('fallback on OpenAI error');
  test('3-tier fallback progression');
  test('context persists across multiple messages');
  test('cleanup removes stale sessions');
});
```

**Integration with TTS**:

```typescript
describe('LLM + TTS Integration', () => {
  test('LLM response triggers TTS synthesis');
  test('fallback message triggers TTS synthesis');
  test('TTS receives complete buffered response');
  test('end-to-end latency < 5s');
});
```

### Performance Tests

```typescript
describe('LLM Performance', () => {
  test('response generation < 3s (P95)');
  test('10 concurrent sessions without errors');
  test('50 concurrent sessions without errors');
  test('memory per session < 50KB');
  test('no memory leaks after 100 conversations');
});
```

### Error Scenario Tests

```typescript
describe('LLM Error Handling', () => {
  test('handles network error → Tier 1 fallback');
  test('handles OpenAI server error → Tier 1 fallback');
  test('handles rate limit error → Tier 1 fallback');
  test('handles timeout error → Tier 1 fallback');
  test('handles invalid API key → non-retryable');
  test('handles malformed response → fallback');
  test('progresses through 3 tiers on repeated failures');
  test('resets failure count on success');
});
```

### Test Configuration

**Use Real OpenAI API** (user specified):

- Tests call actual OpenAI API
- Use dedicated test API key with low rate limits
- Mock only in failure scenarios (network errors, etc.)
- Target: 80%+ coverage

**Alternative for CI/CD** (optional):

- Use VCR-style recording (record real responses, replay in CI)
- Faster CI builds
- Still validates integration occasionally

---

## Implementation Checklist

### Module Structure

- [ ] Create `/src/modules/llm/` directory
- [ ] Create `/src/modules/llm/controllers/` directory
- [ ] Create `/src/modules/llm/services/` directory
- [ ] Create `/src/modules/llm/types/` directory
- [ ] Create `/src/modules/llm/config/` directory
- [ ] Create `/src/modules/llm/utils/` directory (optional, for error classifier)

### Configuration

- [ ] Implement `openai.config.ts` (model, temperature, timeout)
- [ ] Implement `retry.config.ts` (fallback messages, retry settings)
- [ ] Implement `timeout.config.ts` (session timeouts, cleanup intervals)
- [ ] Implement `prompts.config.ts` (system prompt)
- [ ] Create `index.ts` to re-export all configs
- [ ] Add environment variables to `.env.example`
- [ ] Document all config options

### Core Services

- [ ] Implement `LLMSessionService` (conversation context management)
  - [ ] createSession()
  - [ ] getSession()
  - [ ] hasSession()
  - [ ] addUserMessage()
  - [ ] addAssistantMessage()
  - [ ] getConversationHistory()
  - [ ] deleteSession()
  - [ ] cleanup timer
- [ ] Implement `LLMService` (core LLM logic)
  - [ ] Install `openai` package
  - [ ] createSession()
  - [ ] generateResponse()
  - [ ] callOpenAI() (private)
  - [ ] Request queueing logic
  - [ ] Streaming & buffering
  - [ ] Error handling & fallbacks
  - [ ] Failure count tracking
  - [ ] endSession()
  - [ ] shutdown()
- [ ] Implement `LLMController` (public API)
  - [ ] generateResponse()
  - [ ] initializeSession()
  - [ ] endSession()
  - [ ] isHealthy()
  - [ ] getMetrics()

### Types

- [ ] Define `ConversationContext` interface
- [ ] Define `LLMConfig` interface
- [ ] Define `LLMServiceMetrics` interface
- [ ] Define `OpenAIErrorType` enum
- [ ] Export all types from `index.ts`

### Utilities (Optional)

- [ ] Implement `classifyOpenAIError()` function
- [ ] Implement error logging helpers

### Integration

- [ ] Update `handleFinalTranscript()` in TTS module
  - [ ] Add LLM call before TTS
  - [ ] Handle LLM response
  - [ ] Handle errors gracefully
- [ ] Update session cleanup (call llm.endSession on disconnect)
- [ ] Update health checks (include LLM health)

### Testing

- [ ] Write unit tests for `LLMController` (85%+ coverage)
- [ ] Write unit tests for `LLMService` (85%+ coverage)
- [ ] Write unit tests for `LLMSessionService` (85%+ coverage)
- [ ] Write integration tests (E2E flow)
- [ ] Write performance tests (latency, concurrency)
- [ ] Write error scenario tests (fallbacks, retries)
- [ ] Achieve 80%+ overall test coverage

### Documentation

- [ ] Update implementation plan (Phase 5 → IN PROGRESS)
- [ ] Update architecture docs (LLM module section)
- [ ] Create API documentation for LLMController
- [ ] Document configuration options
- [ ] Document error codes and fallbacks
- [ ] Update README with LLM setup instructions

### Production Readiness

- [ ] Validate OpenAI API key on startup
- [ ] Add structured logging with sessionId context
- [ ] Add metrics collection (response time, error rate)
- [ ] Add graceful shutdown handling
- [ ] Add memory leak prevention (cleanup timers)
- [ ] Add rate limiting monitoring
- [ ] Security review (API key handling)
- [ ] Performance testing (10+ concurrent sessions)

---

## Related Documents

### Core Architecture

- [Architecture Documentation](./architecture.md) - System overview
- [Implementation Plan](../development/implementation-plan.md) - Phase 5 details
- [WebSocket Protocol Specification](../protocol/websocket-protocol.md) - Protocol reference

### Related Modules

- [STT Module Documentation](../modules/stt/api.md) - STT service API
- [TTS Service Documentation](../services/tts-service.md) - TTS service API
- [TTS Module Documentation](../modules/tts.md) - Complete TTS integration

### External Services

- [External Services Integration](../integrations/external-services.md) - API integration patterns
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference) - Official OpenAI docs
- [OpenAI Node.js SDK](https://github.com/openai/openai-node) - Official SDK

---

## Approval & Next Steps

**Architecture Design**: ✅ COMPLETE

**Ready for Implementation**: YES

**Recommended Next Step**:

```
Please invoke @backend-dev with the following command:

@backend-dev Implement OpenAI GPT-4.1 LLM integration per architect spec in /vantum-backend/docs/architecture/llm-integration.md

Key files to create:
- src/modules/llm/controllers/llm.controller.ts
- src/modules/llm/services/llm.service.ts
- src/modules/llm/services/llm-session.service.ts
- src/modules/llm/config/*.ts (4 config files)
- src/modules/llm/types/index.ts

Key files to modify:
- src/modules/tts/handlers/transcript.handler.ts (add LLM call)
- .env.example (add OpenAI config)

Implementation scope: ~2-3 days
Testing scope: ~1-2 days
Total estimate: ~1 week
```

---

**Document Version**: 1.0.0
**Date**: 2026-01-08
**Status**: Design Complete - Ready for Implementation
**Next Review**: After implementation complete
