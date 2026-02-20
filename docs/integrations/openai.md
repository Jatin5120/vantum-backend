# OpenAI Integration Guide

## Overview

Vantum uses OpenAI's GPT-4 API for conversational AI in the voice chat pipeline. This document covers setup, configuration, error handling, and operational best practices.

## Table of Contents

- [Setup](#setup)
- [Configuration](#configuration)
- [Features](#features)
- [Rate Limits](#rate-limits)
- [Error Handling](#error-handling)
- [Monitoring](#monitoring)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Setup

### 1. Obtain API Key

1. Sign up at [OpenAI Platform](https://platform.openai.com/)
2. Navigate to API Keys section
3. Create a new secret key
4. Save the key securely (shown only once)

### 2. Environment Configuration

Add to `/vantum-backend/.env`:

```bash
# Required
OPENAI_API_KEY=sk-proj-...

# Optional
OPENAI_ORGANIZATION=org-...  # For organization accounts
```

**Security Notes**:

- Never commit `.env` files to version control
- Rotate keys regularly (every 90 days recommended)
- Use different keys for development and production
- Store production keys in secure secret management (AWS Secrets Manager, etc.)

### 3. Verify Installation

```bash
cd vantum-backend
pnpm install  # OpenAI SDK installed via package.json
pnpm dev      # Should start without API key errors
```

Check logs for:

```
[INFO] LLM service initialized successfully
```

## Configuration

### Model Configuration

**Location**: `/vantum-backend/src/modules/llm/config/openai.config.ts`

**Default Model**: `gpt-4.1-2025-04-14`

**Available Models**:

- `gpt-4.1-2025-04-14` - GPT-4.1 (current production model) ← **IN USE**
- `gpt-4-turbo-2024-04-09` - GPT-4 Turbo (previous)
- `gpt-4` - Standard GPT-4
- `gpt-3.5-turbo` - Faster, cheaper (fallback option)

### Environment Variables

**Model Selection**:

```bash
LLM_MODEL=gpt-4.1-2025-04-14
```

**Generation Parameters**:

```bash
LLM_TEMPERATURE=0.7          # Randomness: 0 (deterministic) to 2 (creative)
LLM_MAX_TOKENS=500           # Max response length: 1-4096
LLM_TOP_P=1.0                # Nucleus sampling: 0-1
LLM_FREQUENCY_PENALTY=0.0    # Repetition penalty: -2 to 2
LLM_PRESENCE_PENALTY=0.0     # Topic diversity: -2 to 2
```

**Operational Settings**:

```bash
LLM_REQUEST_TIMEOUT=30000    # API timeout in milliseconds
LLM_MAX_RETRIES=3            # Retry attempts on failure
LLM_RETRY_DELAY=1000         # Initial retry delay (exponential backoff)
```

### System Prompt

**Location**: `/vantum-backend/src/modules/llm/config/prompts.config.ts`

**Default Prompt**:

```typescript
You are a helpful AI assistant in a voice conversation.
Keep responses concise and natural. Use ||BREAK|| markers
to indicate natural pauses for better speech synthesis.
```

**Customization**:

- Edit `prompts.config.ts` to change system prompt
- Use `||BREAK||` markers for semantic chunking
- Keep prompts concise for voice context

## Features

### 1. Streaming Responses

OpenAI API streams responses in real-time using Server-Sent Events (SSE).

**Implementation**: `llm.service.ts` + `llm-streaming.service.ts`

**Flow**:

```
User speaks → STT transcript
  ↓
LLM generates response (streaming)
  ↓
Semantic chunking (||BREAK|| markers)
  ↓
Progressive TTS delivery
  ↓
Audio playback to user
```

**Benefits**:

- Lower latency (first chunk arrives quickly)
- Progressive audio generation
- Better user experience

### 2. Semantic Streaming

**Marker-Based Chunking**:

- AI inserts `||BREAK||` markers in response
- System splits at markers for natural pauses
- Each chunk synthesized sequentially

**Fallback**: Sentence-based chunking if no markers

**Configuration**: `/vantum-backend/src/modules/llm/config/streaming.config.ts`

### 3. Conversation Context

**Session Management**: `llm-session.service.ts`

**Features**:

- Maintains conversation history per session
- System prompt injection
- Message role tracking (user, assistant, system)
- Automatic context pruning (max messages limit)

**Limits**:

```typescript
maxMessagesPerContext: 50; // Max messages before pruning
sessionIdleTimeoutMs: 1800000; // 30 min idle timeout
sessionMaxDurationMs: 7200000; // 2 hour max duration
```

### 4. Fallback Messages

**Tiered Fallback System** (`retry.config.ts`):

| Attempt | Severity | Message                                                           |
| ------- | -------- | ----------------------------------------------------------------- |
| 1-2     | Light    | "I'm having a bit of trouble. Could you repeat that?"             |
| 3-4     | Moderate | "I'm experiencing some technical difficulties. Let me try again." |
| 5+      | Severe   | "I'm having persistent issues. Please try again later."           |

**Purpose**: Maintain conversation flow even on API failures

### 5. Request Queuing

**Per-Session Queue**: Prevents concurrent requests per session

**Behavior**:

- First request processes immediately
- Subsequent requests queue
- FIFO processing order
- Queue size limit: 10 requests (configurable)

**Benefits**:

- Prevents API rate limit overload
- Maintains conversation order
- Resource efficiency

## Rate Limits

### OpenAI Quotas (2024)

| Tier                | RPM    | TPM       | Max Requests/Day |
| ------------------- | ------ | --------- | ---------------- |
| Free                | 3      | 40,000    | ~200             |
| Tier 1 ($5 spent)   | 500    | 150,000   | ~25,000          |
| Tier 2 ($50 spent)  | 5,000  | 1,000,000 | ~250,000         |
| Tier 3 ($100 spent) | 10,000 | 2,000,000 | ~500,000         |

**RPM**: Requests Per Minute
**TPM**: Tokens Per Minute

**Check your tier**: [OpenAI Usage Dashboard](https://platform.openai.com/usage)

### Vantum Mitigation Strategies

1. **Request Queuing**: Per-session queues prevent burst overload
2. **Error Classification**: 429 errors marked as RATE_LIMIT (retryable)
3. **Exponential Backoff**: Automatic retry with increasing delays
4. **Graceful Degradation**: Fallback messages on exhausted retries
5. **Monitoring**: Track request counts and response times

### Cost Estimation

**GPT-4 Turbo Pricing** (2024):

- Input: $0.01 / 1K tokens
- Output: $0.03 / 1K tokens

**Typical Voice Conversation**:

- User message: ~50 tokens
- AI response: ~150 tokens
- Cost per exchange: ~$0.005 (half a cent)
- 1000 conversations: ~$5

**Daily Budget Example**:

- $10/day budget
- ~2,000 conversations/day
- 67 conversations/hour
- ~1 conversation/minute

## Error Handling

### Error Classification (P1-4)

**Location**: `/vantum-backend/src/modules/llm/utils/error-classifier.ts`

| Error Type   | Retryable | Description                              | HTTP Code |
| ------------ | --------- | ---------------------------------------- | --------- |
| `AUTH`       | ❌        | Invalid API key, auth failure            | 401, 403  |
| `RATE_LIMIT` | ✅        | Too many requests                        | 429       |
| `NETWORK`    | ✅        | Connection timeout, DNS failure          | -         |
| `FATAL`      | ❌        | Context length exceeded, invalid request | 400       |
| `UNKNOWN`    | ✅        | Unclassified errors (default retry)      | -         |

**Usage**:

```typescript
import { classifyLLMError, LLMErrorType } from '@/modules/llm/utils/error-classifier';

try {
  await openai.chat.completions.create({...});
} catch (error) {
  const classified = classifyLLMError(error);

  if (classified.isRetryable) {
    // Retry with backoff
  } else {
    // Use fallback message
  }
}
```

### Retry Strategy

**Configuration**: `retry.config.ts`

```typescript
maxRetries: 3
retryDelays: [1000, 2000, 4000]  // Exponential backoff
fallbackMessages: {
  light: "...",    // 1-2 failures
  moderate: "...", // 3-4 failures
  severe: "..."    // 5+ failures
}
```

**Retry Logic**:

1. Classify error type
2. If retryable: exponential backoff (1s → 2s → 4s)
3. If not retryable: immediate fallback
4. After max retries: fallback message

### Common Errors

**Error**: "Invalid API key"

- **Type**: AUTH
- **Retryable**: ❌
- **Solution**: Verify OPENAI_API_KEY in .env

**Error**: "Rate limit exceeded"

- **Type**: RATE_LIMIT
- **Retryable**: ✅
- **Solution**: Automatic retry with backoff

**Error**: "Maximum context length exceeded"

- **Type**: FATAL
- **Retryable**: ❌
- **Solution**: Reduce conversation history or max_tokens

**Error**: "Request timeout"

- **Type**: NETWORK
- **Retryable**: ✅
- **Solution**: Check network, increase timeout

## Monitoring

### Metrics

**Service-Level Metrics** (in-memory):

```typescript
{
  totalRequests: number; // Total API calls
  totalSuccesses: number; // Successful responses
  totalFailures: number; // Failed responses
  averageResponseTime: number; // Avg response time (ms)
}
```

**Access**:

```typescript
const metrics = llmController.getMetrics();
console.log(`Success rate: ${(metrics.totalSuccesses / metrics.totalRequests) * 100}%`);
```

### Logging

**Log Levels**:

- `info`: Session start/end, API calls, responses
- `error`: API failures, timeouts, fallbacks
- `debug`: Request queuing, chunk processing, retries

**Context**: All logs include `sessionId` for request tracing

**Example Logs**:

```
[INFO] LLM session initialized { sessionId: 'abc-123' }
[DEBUG] Queuing LLM request { sessionId: 'abc-123', queueSize: 2 }
[ERROR] LLM API call failed { sessionId: 'abc-123', errorType: 'RATE_LIMIT', attempt: 2 }
```

### Health Checks

**Endpoint**: `llmController.isHealthy()`

**Returns**:

```typescript
{
  healthy: boolean;
  activeSessions: number;
  totalRequests: number;
  errorRate: number; // percentage
}
```

**Integration**: Add to health check endpoint in Express

## Best Practices

### 1. API Key Security

✅ **DO**:

- Store keys in environment variables
- Use different keys for dev/staging/prod
- Rotate keys every 90 days
- Monitor usage for anomalies

❌ **DON'T**:

- Hardcode keys in source code
- Commit keys to version control
- Share keys across environments
- Expose keys in logs

### 2. Cost Optimization

✅ **DO**:

- Set reasonable `max_tokens` (default: 500)
- Prune conversation history (max 50 messages)
- Use GPT-3.5-turbo for non-critical paths
- Monitor token usage daily

❌ **DON'T**:

- Use unlimited `max_tokens`
- Keep full conversation history
- Retry infinitely on failures
- Ignore cost alerts

### 3. Error Handling

✅ **DO**:

- Classify errors (AUTH, RATE_LIMIT, etc.)
- Provide fallback messages
- Log errors with context
- Retry on transient failures

❌ **DON'T**:

- Treat all errors the same
- Crash on API failures
- Retry on AUTH errors
- Swallow errors silently

### 4. Performance

✅ **DO**:

- Use streaming for low latency
- Queue requests per session
- Set appropriate timeouts
- Monitor response times

❌ **DON'T**:

- Make concurrent requests per session
- Block on synchronous calls
- Use infinite timeouts
- Ignore slow responses

## Troubleshooting

### Issue: "Invalid API key"

**Symptoms**: AUTH error on all requests

**Diagnosis**:

```bash
# Check env variable is set
echo $OPENAI_API_KEY

# Verify key format (should start with sk-proj- or sk-)
```

**Solutions**:

1. Verify key in `.env` file
2. Check key validity on [OpenAI Dashboard](https://platform.openai.com/api-keys)
3. Ensure key has sufficient permissions
4. Try regenerating key

### Issue: "Rate limit exceeded"

**Symptoms**: 429 errors, RATE_LIMIT classification

**Diagnosis**:

```typescript
const metrics = llmController.getMetrics();
console.log(`Requests/min: ${metrics.totalRequests / uptime_minutes}`);
```

**Solutions**:

1. Check usage tier: [OpenAI Usage](https://platform.openai.com/usage)
2. Upgrade tier if needed ($5 → Tier 1)
3. Reduce request frequency
4. Implement request throttling

### Issue: "Maximum context length exceeded"

**Symptoms**: FATAL error, context length in error message

**Diagnosis**:

- Check conversation history length
- Calculate total tokens (input + output)

**Solutions**:

1. Reduce `maxMessagesPerContext` (default: 50)
2. Reduce `max_tokens` (default: 500)
3. Implement smarter context pruning
4. Use GPT-4 Turbo (128K context vs 8K)

### Issue: "Request timeout"

**Symptoms**: NETWORK error, timeout in logs

**Diagnosis**:

- Check network connectivity
- Verify OpenAI API status: [status.openai.com](https://status.openai.com)

**Solutions**:

1. Increase `LLM_REQUEST_TIMEOUT` (default: 30s)
2. Check firewall/proxy settings
3. Verify DNS resolution
4. Retry with exponential backoff (automatic)

### Issue: High Latency

**Symptoms**: Slow responses, poor user experience

**Diagnosis**:

```typescript
const metrics = llmController.getMetrics();
console.log(`Avg response time: ${metrics.averageResponseTime}ms`);
```

**Solutions**:

1. Use streaming (already enabled)
2. Reduce `max_tokens` (fewer tokens = faster)
3. Use GPT-3.5-turbo (faster than GPT-4)
4. Optimize system prompt (shorter prompt)
5. Check network latency to OpenAI

### Issue: Poor Response Quality

**Symptoms**: Irrelevant responses, hallucinations

**Solutions**:

1. Improve system prompt (be more specific)
2. Adjust `temperature` (lower = more focused)
3. Increase `max_tokens` (allow fuller responses)
4. Use GPT-4 instead of GPT-3.5
5. Provide better conversation context

## References

- [OpenAI API Documentation](https://platform.openai.com/docs)
- [GPT-4 Model Card](https://platform.openai.com/docs/models/gpt-4)
- [Rate Limits Guide](https://platform.openai.com/docs/guides/rate-limits)
- [Token Counting](https://platform.openai.com/tokenizer)
- [Best Practices](https://platform.openai.com/docs/guides/production-best-practices)
- [Pricing](https://openai.com/pricing)

## Internal References

- LLM Service: `/vantum-backend/src/modules/llm/services/llm.service.ts`
- Error Classifier: `/vantum-backend/src/modules/llm/utils/error-classifier.ts`
- Streaming Service: `/vantum-backend/src/modules/llm/services/llm-streaming.service.ts`
- Configuration: `/vantum-backend/src/modules/llm/config/`
- Tests: `/vantum-backend/tests/modules/llm/`
