# External Services Integration

**Version**: 1.0.0
**Last Updated**: 2024-12-27
**Status**: Living Document

---

## Overview

This document describes all external service integrations used in the Vantum backend, including API configuration, authentication, error handling, cost management, and fallback strategies.

**External Services**:
1. **Deepgram** - Speech-to-Text (STT)
2. **OpenAI** - Large Language Model (LLM)
3. **Cartesia** - Text-to-Speech (TTS)
4. **Twilio** - Telephony (Future)

---

## 1. Deepgram (Speech-to-Text)

**Status**: ✅ FULLY IMPLEMENTED (Layer 1) - Production-ready
**Purpose**: Convert user speech to text in real-time
**Documentation**: https://developers.deepgram.com/

### API Details

**Protocol**: WebSocket (real-time streaming)
**Endpoint**: `wss://api.deepgram.com/v1/listen`
**Authentication**: API Key (Authorization header or query parameter)

### Configuration

```typescript
interface DeepgramConfig {
  apiKey: string;
  model: 'nova-2' | 'nova' | 'enhanced' | 'base';
  language: 'en-US' | 'en-GB' | 'es' | 'fr';
  encoding: 'linear16';       // PCM 16-bit
  sampleRate: 16000;          // 16kHz
  channels: 1;                // Mono
  interim_results: true;      // Partial transcripts
  punctuate: true;            // Add punctuation
  vad_events: true;           // Voice Activity Detection
  utterance_end_ms: 1000;     // End utterance after 1s silence
  endpointing: 300;           // Start new utterance after 300ms silence
}
```

**Recommended Configuration**:
```typescript
const deepgramConfig: DeepgramConfig = {
  apiKey: process.env.DEEPGRAM_API_KEY!,
  model: 'nova-2',            // Latest, best accuracy
  language: 'en-US',
  encoding: 'linear16',
  sampleRate: 16000,
  channels: 1,
  interim_results: true,      // Enable for real-time feedback
  punctuate: true,            // Better readability
  vad_events: true,           // Detect speech start/end
  utterance_end_ms: 1000,     // User stopped speaking
  endpointing: 300            // Quick response
};
```

### Features Used

**Real-Time Streaming**:
- Continuous audio streaming over WebSocket
- Low latency (<200ms from audio to transcript)
- Session-level persistent connection (ADR-003)

**Interim Results**:
- Partial transcripts as user speaks
- Updates continuously until utterance complete
- Useful for UI feedback

**Final Results**:
- Complete transcript when utterance ends
- Includes punctuation and capitalization
- Triggers LLM conversation processing

**Voice Activity Detection (VAD)**:
- Detects when user starts speaking
- Detects when user stops speaking
- Used for interruption handling (ADR-007)

### Message Types

**Sent to Deepgram**:
```typescript
// Audio chunk (binary PCM 16-bit, 16kHz, mono)
ws.send(audioBuffer);
```

**Received from Deepgram**:
```typescript
// Interim result (partial transcript)
{
  "type": "Results",
  "channel_index": [0, 0],
  "duration": 1.23,
  "start": 0.0,
  "is_final": false,
  "speech_final": false,
  "channel": {
    "alternatives": [{
      "transcript": "Hello how are",  // Partial
      "confidence": 0.95
    }]
  }
}

// Final result (complete transcript)
{
  "type": "Results",
  "channel_index": [0, 0],
  "duration": 2.45,
  "start": 0.0,
  "is_final": true,
  "speech_final": true,
  "channel": {
    "alternatives": [{
      "transcript": "Hello, how are you?",  // Complete
      "confidence": 0.98
    }]
  }
}

// VAD event (speech started)
{
  "type": "SpeechStarted",
  "timestamp": 1234567890.123
}

// VAD event (utterance ended)
{
  "type": "UtteranceEnd",
  "timestamp": 1234567891.234
}
```

### Error Handling

**Connection Errors**:
```typescript
// Retry with exponential backoff
const maxRetries = 3;
let retryCount = 0;

while (retryCount < maxRetries) {
  try {
    await connectToDeepgram(sessionId);
    break;
  } catch (error) {
    retryCount++;
    const backoffMs = Math.pow(2, retryCount) * 1000; // 2s, 4s, 8s
    await sleep(backoffMs);
  }
}
```

**Transcription Errors**:
- Low confidence (<0.5): Ask user to repeat
- Empty transcript: Ignore, continue listening
- Timeout: Retry connection

### Cost Management

**Pricing**: $0.0043 per minute (Nova-2 model)

**Monthly Cost Estimate** (10 concurrent calls):
- Average call duration: 5 minutes
- Calls per day: 100
- Monthly calls: 3,000
- Total minutes: 15,000
- **Monthly cost**: 15,000 × $0.0043 = **$64.50**

**Optimization Strategies**:
- Use session-level persistent connections (no reconnection overhead)
- Close connection immediately when call ends
- Use VAD to avoid transcribing silence

### Environment Variables

```bash
# .env
DEEPGRAM_API_KEY=your_deepgram_api_key_here
```

### Related Documents

- [Deepgram STT Integration Design](/docs/design/deepgram-stt-integration-design.md)
- [ADR-003: Session-Level Persistent Connections](/docs/architecture/decisions.md#adr-003-session-level-persistent-connections)

---

## 2. OpenAI (Large Language Model)

**Status**: 🚧 NOT STARTED - To be Implemented (Layer 2)
**Purpose**: Generate intelligent conversation responses
**Documentation**: https://platform.openai.com/docs/api-reference

### API Details

**Protocol**: HTTPS REST API with Server-Sent Events (SSE) for streaming
**Endpoint**: `https://api.openai.com/v1/chat/completions`
**Authentication**: Bearer token (API Key)

### Configuration

```typescript
interface OpenAIConfig {
  apiKey: string;
  model: 'gpt-4' | 'gpt-4-turbo' | 'gpt-4o' | 'gpt-3.5-turbo';
  temperature: number;        // 0.0-1.0, controls randomness
  maxTokens: number;          // Max tokens in response
  topP: number;               // Nucleus sampling parameter
  frequencyPenalty: number;   // Reduce repetition
  presencePenalty: number;    // Encourage new topics
  stream: boolean;            // Enable streaming (required for low latency)
  systemPrompt: string;       // Conversation context
}
```

**Recommended Configuration**:
```typescript
const openaiConfig: OpenAIConfig = {
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o',            // Latest, fast, cost-effective
  temperature: 0.7,           // Natural, slightly varied responses
  maxTokens: 150,             // Keep responses concise (1-2 sentences)
  topP: 1.0,                  // Standard nucleus sampling
  frequencyPenalty: 0.3,      // Reduce repetition
  presencePenalty: 0.2,       // Encourage topic diversity
  stream: true,               // REQUIRED for streaming TTS
  systemPrompt: getSystemPrompt() // See below
};
```

### System Prompt

**Purpose**: Define AI personality, goals, and constraints

**Example (Sales Outreach)**:
```typescript
function getSystemPrompt(companyName: string, productName: string): string {
  return `You are a friendly and professional sales representative for ${companyName}.
Your goal is to engage prospects in a natural conversation, understand their needs,
and determine if ${productName} is a good fit.

Guidelines:
- Be concise: Respond in 1-2 sentences maximum
- Ask one question at a time
- Listen carefully and respond naturally
- Show empathy and understanding
- Don't be pushy; focus on helping
- If prospect sounds busy, offer to call back later
- If prospect is interested, offer to schedule a demo
- If not interested, politely thank them and end the call

Remember: You're having a phone conversation. Keep responses brief and conversational.`;
}
```

**Customization**:
- Per-campaign system prompts
- Dynamic context injection (prospect name, company, industry)
- Tone adjustment (formal, casual, technical)

### Streaming Implementation

**Request**:
```typescript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-4o',
    messages: conversationHistory,
    temperature: 0.7,
    max_tokens: 150,
    stream: true  // Enable streaming
  })
});

// Read SSE stream
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n').filter(line => line.trim() !== '');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') break;

      const json = JSON.parse(data);
      const token = json.choices[0]?.delta?.content;

      if (token) {
        // Send token to TTS service
        await handleLLMToken(sessionId, token);
      }
    }
  }
}
```

### Conversation History Management

```typescript
interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: number;
  interrupted?: boolean;  // For interrupted messages (ADR-007)
}

const conversationHistory: ConversationMessage[] = [
  { role: 'system', content: systemPrompt },
  { role: 'user', content: 'Hello, who is this?' },
  { role: 'assistant', content: 'Hi! This is Sarah from Vantum. How are you today?' },
  { role: 'user', content: 'I\'m busy right now.' },
  { role: 'assistant', content: 'I understand. Would it be better if I called back later?' }
];
```

**History Management**:
- Keep last 10-20 messages (balance context vs token cost)
- Always include system prompt
- Mark interrupted messages with `interrupted: true` flag
- Trim old messages when approaching token limit

### Error Handling

**Rate Limiting (429)**:
```typescript
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After') || 5;
  await sleep(retryAfter * 1000);
  // Retry request
}
```

**Timeout**:
```typescript
const timeout = 10000; // 10s
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), timeout);

try {
  const response = await fetch(url, { signal: controller.signal });
} catch (error) {
  if (error.name === 'AbortError') {
    // Use fallback response
    return getFallbackResponse();
  }
}
```

**Fallback Responses**:
```typescript
const fallbackResponses = {
  timeout: "I'm having trouble processing that. Could you repeat?",
  error: "I'm experiencing technical difficulties. Let me transfer you to a human.",
  rateLimited: "I need a moment to think. One second..."
};
```

### Cost Management

**Pricing** (GPT-4o):
- Input: $2.50 per 1M tokens ($0.0025 per 1K)
- Output: $10.00 per 1M tokens ($0.01 per 1K)

**Monthly Cost Estimate** (10 concurrent calls):
- Average call: 10 exchanges (20 messages)
- Average tokens per message: 50 input, 30 output
- Tokens per call: 1,000 input + 600 output
- Calls per day: 100
- Monthly calls: 3,000

**Calculation**:
- Input tokens: 3,000 × 1,000 = 3M tokens = 3M × $0.0000025 = **$7.50**
- Output tokens: 3,000 × 600 = 1.8M tokens = 1.8M × $0.00001 = **$18.00**
- **Total monthly cost**: **$25.50**

**Optimization Strategies**:
- Keep responses concise (max_tokens: 150)
- Trim conversation history (keep last 10-20 messages)
- Use frequency_penalty to reduce repetition
- Cache common responses (greetings, objection handling)

### Environment Variables

```bash
# .env
OPENAI_API_KEY=sk-your_openai_api_key_here
```

### Related Documents

- [ADR-008: Streaming for LLM and TTS](/docs/architecture/decisions.md#adr-008-streaming-for-llm-and-tts)
- [Conversation State Machine](/docs/architecture/state-machine.md)

---

## 3. Cartesia (Text-to-Speech)

**Status**: 🚧 NOT STARTED - To be Implemented (Layer 2)
**Purpose**: Convert LLM text responses to natural-sounding speech
**Documentation**: https://docs.cartesia.ai/

### API Details

**Protocol**: WebSocket (streaming audio generation)
**Endpoint**: To be confirmed (check Cartesia documentation)
**Authentication**: API Key

### Configuration

```typescript
interface CartesiaConfig {
  apiKey: string;
  voiceId: string;            // Voice selection (professional-female, etc.)
  model: string;              // TTS model version
  sampleRate: 16000;          // 16kHz output
  encoding: 'pcm' | 'opus';   // Audio encoding format
  language: 'en-US';
  speed: number;              // 0.5-2.0, speech speed multiplier
  stream: boolean;            // Enable streaming (required)
}
```

**Recommended Configuration**:
```typescript
const cartesiaConfig: CartesiaConfig = {
  apiKey: process.env.CARTESIA_API_KEY!,
  voiceId: 'professional-female',  // To be selected
  model: 'latest',                 // Use latest model
  sampleRate: 16000,               // Match Deepgram
  encoding: 'pcm',                 // Raw PCM for low latency
  language: 'en-US',
  speed: 1.0,                      // Normal speed
  stream: true                     // REQUIRED for low latency
};
```

### Voice Selection

**Available Voices** (to be confirmed from Cartesia docs):
- `professional-female` - Business, professional tone
- `professional-male` - Business, professional tone
- `friendly-female` - Warm, conversational tone
- `friendly-male` - Warm, conversational tone

**Selection Criteria**:
- Match target audience expectations
- A/B test different voices for conversion rate
- Consider industry (tech, finance, healthcare)

### Streaming Implementation

**Request** (conceptual, adjust based on Cartesia docs):
```typescript
const ws = new WebSocket(`wss://api.cartesia.ai/tts/stream?api_key=${apiKey}`);

// Configure
ws.send(JSON.stringify({
  type: 'configure',
  config: cartesiaConfig
}));

// Stream text chunks from LLM
for await (const token of llmStream) {
  ws.send(JSON.stringify({
    type: 'text',
    text: token
  }));
}

// Receive audio chunks
ws.on('message', (data) => {
  const audioChunk = data; // PCM 16-bit, 16kHz
  // Send to client or Twilio
  sendAudioToClient(sessionId, audioChunk);
});

// End stream
ws.send(JSON.stringify({ type: 'end' }));
```

### Sentence Buffering

**Problem**: LLM streams tokens, TTS needs complete sentences

**Solution**: Buffer tokens until sentence boundary detected

```typescript
let textBuffer = '';

for await (const token of llmStream) {
  textBuffer += token;

  // Check for sentence boundary
  if (isSentenceBoundary(textBuffer)) {
    // Send complete sentence to TTS
    await synthesizeSpeech(sessionId, textBuffer.trim());
    textBuffer = '';
  }
}

// Handle remaining text
if (textBuffer.trim()) {
  await synthesizeSpeech(sessionId, textBuffer.trim());
}

function isSentenceBoundary(text: string): boolean {
  // Ends with sentence terminator + space or end of buffer
  return /[.!?]\s|[.!?]$/.test(text);
}
```

### Error Handling

**Connection Errors**:
- Retry with exponential backoff (similar to Deepgram)
- Fall back to text-only response (display on screen)

**Generation Errors**:
- Timeout: Use pre-recorded fallback audio
- Quality issues: Log for later review
- API error: Switch to backup TTS provider (future)

### Cost Management

**Pricing**: To be confirmed (estimated $0.10 per 1K characters)

**Monthly Cost Estimate** (10 concurrent calls):
- Average response length: 100 characters
- Responses per call: 10
- Characters per call: 1,000
- Calls per day: 100
- Monthly calls: 3,000
- Total characters: 3M

**Calculation**:
- 3M characters = 3,000K characters
- 3,000 × $0.10 = **$300/month**

**Optimization Strategies**:
- Keep responses concise (LLM max_tokens: 150)
- Cache common responses (greetings, closing)
- Use interruption handling to avoid unnecessary synthesis (ADR-007)

### Environment Variables

```bash
# .env
CARTESIA_API_KEY=your_cartesia_api_key_here
```

### Related Documents

- [ADR-011: TTS Provider Selection (Cartesia)](/docs/architecture/decisions.md#adr-011-tts-provider-selection-cartesia)
- [ADR-008: Streaming for LLM and TTS](/docs/architecture/decisions.md#adr-008-streaming-for-llm-and-tts)

---

## 4. Twilio (Telephony)

**Status**: ⏳ FUTURE - To be Implemented (Layer 3)
**Purpose**: Place and manage outbound phone calls
**Documentation**: https://www.twilio.com/docs/voice

### API Details

**Protocol**: HTTPS REST API + WebSocket for Media Streams
**Endpoint**: `https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Calls.json`
**Authentication**: Account SID + Auth Token (HTTP Basic Auth)

### Configuration

```typescript
interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;        // Twilio phone number (from)
  mediaStreamUrl: string;     // WebSocket endpoint for audio
}
```

```typescript
const twilioConfig: TwilioConfig = {
  accountSid: process.env.TWILIO_ACCOUNT_SID!,
  authToken: process.env.TWILIO_AUTH_TOKEN!,
  phoneNumber: process.env.TWILIO_PHONE_NUMBER!,
  mediaStreamUrl: 'wss://your-backend.com/twilio/media'
};
```

### Integration Approach

**Option 1: Media Streams (RECOMMENDED)**
- Real-time bidirectional audio over WebSocket
- Low latency
- Full control over audio processing
- Requires WebSocket server endpoint

**Option 2: TwiML Bins**
- Simpler setup
- Higher latency
- Limited control

**Option 3: Programmable Voice API**
- Most flexible
- Most complex setup

**Decision**: Use Media Streams for real-time audio (to be confirmed in Layer 3)

### Outbound Call Flow

```typescript
// 1. Initiate call
const call = await twilio.calls.create({
  from: twilioConfig.phoneNumber,
  to: prospectPhoneNumber,
  twiml: `
    <Response>
      <Connect>
        <Stream url="${twilioConfig.mediaStreamUrl}" />
      </Connect>
    </Response>
  `
});

// 2. Receive Media Stream connection
twilioWs.on('connection', (ws) => {
  const sessionId = createSession();

  // 3. Receive audio from Twilio (8kHz μ-law)
  ws.on('message', (data) => {
    const message = JSON.parse(data);
    if (message.event === 'media') {
      const audio = decodeFromMulaw(message.media.payload);
      // Resample 8kHz → 16kHz, send to Deepgram
      processIncomingAudio(sessionId, audio);
    }
  });

  // 4. Send audio to Twilio (8kHz μ-law)
  sendAudioToTwilio(ws, audioChunk);
});
```

### Audio Format

**Twilio Format**: 8kHz μ-law (G.711), mono
**Backend Format**: 16kHz PCM 16-bit (for Deepgram/Cartesia)

**Conversion Required**:
- Incoming: μ-law → PCM, 8kHz → 16kHz
- Outgoing: PCM → μ-law, 16kHz → 8kHz

**See**: ADR-002 for resampling strategy

### Error Handling

**Call Failures**:
- Busy signal: Retry later
- No answer: Mark prospect as unreachable
- Invalid number: Remove from list

**Connection Drops**:
- Detect disconnect
- Clean up session resources
- Log call duration and outcome

### Cost Management

**Pricing**:
- Outbound calls: $0.0140 per minute
- Phone number rental: $1.00 per month per number

**Monthly Cost Estimate** (10 concurrent calls):
- Average call duration: 5 minutes
- Calls per day: 100
- Monthly calls: 3,000
- Total minutes: 15,000

**Calculation**:
- Call cost: 15,000 × $0.0140 = **$210/month**
- Phone numbers: 5 numbers × $1.00 = **$5/month**
- **Total**: **$215/month**

### Environment Variables

```bash
# .env
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

### Related Documents

- [ADR-001: Same Pipeline for Dev and Production](/docs/architecture/decisions.md#adr-001-same-pipeline-for-dev-and-production)
- [ADR-002: Bidirectional Audio Resampling](/docs/architecture/decisions.md#adr-002-bidirectional-audio-resampling)

---

## API Key Management

### Storage

**Environment Variables** (`.env` file, NOT committed to git):
```bash
# Speech-to-Text
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# Language Model
OPENAI_API_KEY=sk-your_openai_api_key_here

# Text-to-Speech
CARTESIA_API_KEY=your_cartesia_api_key_here

# Telephony (Future)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

**Loading Configuration**:
```typescript
// src/config/external-services.config.ts
import dotenv from 'dotenv';
dotenv.config();

export const externalServicesConfig = {
  deepgram: {
    apiKey: process.env.DEEPGRAM_API_KEY!,
    model: 'nova-2',
    language: 'en-US',
    sampleRate: 16000,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 150,
  },
  cartesia: {
    apiKey: process.env.CARTESIA_API_KEY!,
    voiceId: 'professional-female',
    sampleRate: 16000,
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID!,
    authToken: process.env.TWILIO_AUTH_TOKEN!,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER!,
  },
};
```

### Security Best Practices

**DO**:
- ✅ Store API keys in environment variables
- ✅ Add `.env` to `.gitignore`
- ✅ Use different keys for dev/staging/production
- ✅ Rotate keys regularly (quarterly)
- ✅ Restrict API key permissions (if possible)
- ✅ Monitor API key usage
- ✅ Revoke compromised keys immediately

**DON'T**:
- ❌ Commit `.env` to git
- ❌ Log API keys (even partially)
- ❌ Send API keys to client
- ❌ Use production keys in development
- ❌ Share keys in chat/email (use secret manager)

### Key Rotation Process

1. Generate new API key from provider dashboard
2. Update `.env` in all environments (dev, staging, prod)
3. Deploy with new key
4. Verify services working with new key
5. Revoke old key from provider dashboard

---

## Rate Limiting

### Strategy

**Track Request Counts**:
```typescript
interface RateLimitTracker {
  service: 'deepgram' | 'openai' | 'cartesia' | 'twilio';
  requests: number;
  resetAt: number;  // Unix timestamp
  limit: number;
}

const rateLimits = new Map<string, RateLimitTracker>();
```

**Check Before Request**:
```typescript
async function checkRateLimit(service: string): Promise<void> {
  const tracker = rateLimits.get(service);

  if (tracker && Date.now() < tracker.resetAt) {
    if (tracker.requests >= tracker.limit) {
      // Wait until reset
      const waitMs = tracker.resetAt - Date.now();
      await sleep(waitMs);
    }
  }

  // Update tracker
  tracker.requests++;
}
```

**Exponential Backoff**:
```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429) {  // Rate limited
        retryCount++;
        const backoffMs = Math.pow(2, retryCount) * 1000;  // 2s, 4s, 8s
        await sleep(backoffMs);
      } else {
        throw error;  // Not a rate limit error
      }
    }
  }

  throw new Error('Max retries exceeded');
}
```

### Service-Specific Limits

**Deepgram**:
- Concurrent connections: 50 (default)
- Requests per minute: No strict limit (fair use)

**OpenAI**:
- RPM (Requests Per Minute): Tier-based (varies by usage)
- TPM (Tokens Per Minute): Tier-based (varies by usage)
- Monitor: Track both RPM and TPM

**Cartesia**:
- To be determined from documentation

**Twilio**:
- Concurrent calls: Account-based limit
- API requests: 1,000 per second (default)

---

## Fallback Strategies

### Deepgram Fallback

**Connection Failure**:
1. Retry with exponential backoff (3 attempts)
2. If all retries fail: Send error to client, end call gracefully

**Low Confidence Transcripts**:
```typescript
if (transcript.confidence < 0.5) {
  await respondWithFallback(
    "I'm sorry, I didn't catch that. Could you repeat?"
  );
}
```

### OpenAI Fallback

**Timeout** (>10s):
```typescript
const fallbackResponses = {
  greeting: "Hi! This is Sarah from Vantum. How are you today?",
  thinking: "That's a great question. Let me think about that...",
  error: "I'm experiencing technical difficulties. Let me transfer you."
};

if (timeout) {
  return fallbackResponses.thinking;
}
```

**Rate Limited**:
- Wait for rate limit reset
- Use cached responses for common questions
- Notify user: "I need a moment to think..."

### Cartesia Fallback

**Generation Failure**:
1. Retry once
2. If retry fails: Send text-only response to client (display on screen)
3. Future: Switch to backup TTS provider (Google/AWS)

**Pre-Recorded Audio** (for critical messages):
```typescript
const preRecordedAudio = {
  greeting: 'audio/greeting.wav',
  error: 'audio/technical-difficulties.wav',
  goodbye: 'audio/goodbye.wav'
};

if (ttsFailure) {
  await playPreRecordedAudio(sessionId, preRecordedAudio.error);
}
```

---

## Cost Management

### Total Cost Estimate

**Monthly Costs** (100 calls/day, 5 min avg):

| Service | Monthly Cost | % of Total |
|---------|--------------|------------|
| Deepgram (STT) | $64.50 | 21% |
| OpenAI (LLM) | $25.50 | 8% |
| Cartesia (TTS) | $300.00 | 61% |
| Twilio (Calls) | $215.00 | 10% |
| **TOTAL** | **$605.00** | **100%** |

**Cost Per Call**: $605 / 3,000 = **$0.20**

### Optimization Strategies

**1. Reduce LLM Token Usage**:
- Keep responses concise (max_tokens: 150)
- Trim conversation history (last 10-20 messages)
- Use frequency_penalty to reduce repetition

**2. Optimize TTS Usage**:
- Cache common responses (greetings, objections, closing)
- Use interruption handling to avoid synthesizing unused audio
- Pre-generate frequently used phrases

**3. Reduce Call Duration**:
- Detect uninterested prospects early (sentiment analysis)
- End calls gracefully when appropriate
- Use efficient conversation scripts

**4. Batch Operations** (future):
- Schedule calls during off-peak hours (lower Twilio rates)
- Use bulk API endpoints if available

### Monitoring

**Metrics to Track**:
- Cost per call (STT + LLM + TTS + Twilio)
- Cost per minute
- API usage by service
- Rate limit hits
- Error rates by service

**Alerts**:
- Daily cost exceeds threshold
- Service error rate > 5%
- Rate limit reached
- API key expiring soon

---

## Testing with External Services

### Mock Services

**For Unit Tests**: Mock external API calls
```typescript
// tests/mocks/deepgram.mock.ts
export class MockDeepgramService {
  async connect(sessionId: string): Promise<void> {
    // Mock implementation
  }

  async sendAudio(sessionId: string, audio: Buffer): Promise<void> {
    // Mock implementation
  }

  // Emit mock transcripts
  emitMockTranscript(sessionId: string, transcript: string) {
    this.emit('transcript', { sessionId, transcript });
  }
}
```

### Sandbox/Test Keys

**Use Provider Test Credentials**:
- Deepgram: Separate API key for testing (if available)
- OpenAI: Separate API key for testing
- Twilio: Use test credentials (test phone numbers)

**Benefits**:
- Don't pollute production metrics
- Lower/no costs for testing
- Safe to commit test keys (if provider allows)

---

## Related Documents

- [Architecture Overview](/docs/architecture/architecture.md)
- [Architectural Decisions](/docs/architecture/decisions.md)
- [Deepgram STT Integration Design](/docs/design/deepgram-stt-integration-design.md)
- [Scalability](/docs/architecture/scalability.md)

---

**Last Updated**: 2024-12-27
**Maintainer**: Architect Agent
**Status**: Living document - will be updated as integrations are implemented
