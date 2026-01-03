# STT Implementation Guide for @backend-dev (v2.0)

**REVISED: STT as Independent Module**
**Design Spec**: [deepgram-stt-integration-design-v2.md](./deepgram-stt-integration-design-v2.md)

---

## Critical Architecture Change

**STT is now a separate, independent module under `/src/modules/stt/`**

Key points:
- STT module is NOT part of socket module
- Socket module imports STT via public API only: `import { sttController } from '@/modules/stt'`
- Clean module boundaries with minimal coupling
- Each module manages its own state independently

---

## Quick Start Checklist

### Prerequisites

```bash
# 1. Install Deepgram SDK
cd vantum-backend
pnpm add @deepgram/sdk

# 2. Add API key to .env
echo "DEEPGRAM_API_KEY=your_api_key_here" >> .env

# 3. (Optional) Switch to local shared package
# Edit package.json:
{
  "dependencies": {
    "@Jatin5120/vantum-shared": "file:../vantum-shared"
  }
}
pnpm install
```

---

## Implementation Order (4 Phases)

### Phase 1: Module Structure & Core Service (Week 1)

**Step 1: Create STT Module Structure**

```bash
# Create main module directory
mkdir -p src/modules/stt

# Create subdirectories
mkdir -p src/modules/stt/controllers
mkdir -p src/modules/stt/services
mkdir -p src/modules/stt/config
mkdir -p src/modules/stt/types
mkdir -p src/modules/stt/utils

# Create index files for barrel exports
touch src/modules/stt/index.ts
touch src/modules/stt/controllers/index.ts
touch src/modules/stt/services/index.ts
touch src/modules/stt/config/index.ts
touch src/modules/stt/types/index.ts
touch src/modules/stt/utils/index.ts
```

**Step 2: Create Configuration Files**

Create these files in order:

1. `src/modules/stt/config/deepgram.config.ts`
2. `src/modules/stt/config/retry.config.ts`
3. `src/modules/stt/config/timeout.config.ts`
4. `src/modules/stt/config/index.ts`

**Step 3: Create Type Definitions**

1. `src/modules/stt/types/stt-session.types.ts`
2. `src/modules/stt/types/transcript.types.ts`
3. `src/modules/stt/types/error.types.ts`
4. `src/modules/stt/types/index.ts`

**Step 4: Implement Services**

1. `src/modules/stt/services/stt-session.service.ts`
2. `src/modules/stt/services/stt.service.ts`
3. `src/modules/stt/services/index.ts`

**Step 5: Implement Controller (Public API)**

1. `src/modules/stt/controllers/stt.controller.ts`
2. `src/modules/stt/controllers/index.ts`

**Step 6: Create Module Public Exports**

1. `src/modules/stt/index.ts`

**Step 7: Update Socket Module**

1. Modify `src/modules/socket/handlers/audio.handler.ts`

---

## File Templates (Copy-Paste Ready)

### 1. Config Files

#### `src/modules/stt/config/deepgram.config.ts`

```typescript
/**
 * Deepgram Configuration
 * Central configuration for Deepgram API integration
 */

export const DEEPGRAM_CONFIG = {
  // Model Selection
  model: 'nova-2' as const,
  language: 'en-US' as const,

  // Features
  smart_format: true,
  interim_results: true,
  endpointing: false,
  utterances: false,

  // Audio Format
  encoding: 'linear16' as const,
  sample_rate: 16000,
  channels: 1,

  // Performance
  punctuate: true,
  diarize: false,
  alternatives: 1,
} as const;

export interface DeepgramConfig {
  model: string;
  language: string;
  smart_format: boolean;
  interim_results: boolean;
  endpointing: boolean;
  utterances: boolean;
  encoding: string;
  sample_rate: number;
  channels: number;
  punctuate: boolean;
  diarize: boolean;
  alternatives: number;
}
```

#### `src/modules/stt/config/retry.config.ts`

```typescript
/**
 * Retry Configuration
 * Defines retry strategies for various error scenarios
 */

export const RETRY_CONFIG = {
  // Initial connection retry (hybrid: fast then slow)
  CONNECTION_RETRY_DELAYS: [0, 100, 1000, 3000, 5000], // ms

  // Mid-stream reconnection (fast retries only)
  RECONNECTION_RETRY_DELAYS: [0, 100, 500], // ms

  // Error-specific retry delays
  RATE_LIMIT_DELAYS: [5000, 10000, 20000],         // 429 errors
  SERVICE_UNAVAILABLE_DELAYS: [1000, 3000, 5000],  // 503 errors
  SERVER_ERROR_DELAYS: [0, 500, 1000],             // 500, 502, 504
  NETWORK_ERROR_DELAYS: [0, 100, 500],             // Network timeouts
} as const;
```

#### `src/modules/stt/config/timeout.config.ts`

```typescript
/**
 * Timeout Configuration
 * Defines timeout values for various operations
 */

export const TIMEOUT_CONFIG = {
  CONNECTION_TIMEOUT_MS: 10000,      // 10s to establish connection
  MESSAGE_TIMEOUT_MS: 5000,          // 5s for Deepgram to respond
  SESSION_TIMEOUT_MS: 3600000,       // 1 hour max session duration
  INACTIVITY_TIMEOUT_MS: 300000,     // 5 minutes no audio = stale
  CLEANUP_INTERVAL_MS: 300000,       // 5 minutes cleanup interval
} as const;
```

#### `src/modules/stt/config/index.ts`

```typescript
/**
 * Config Module Exports
 */

export * from './deepgram.config';
export * from './retry.config';
export * from './timeout.config';
```

---

### 2. Type Definitions

#### `src/modules/stt/types/transcript.types.ts`

```typescript
/**
 * Transcript Types
 */

export interface TranscriptSegment {
  text: string;
  timestamp: number;
  confidence: number;
  isFinal: boolean;
}
```

#### `src/modules/stt/types/stt-session.types.ts`

```typescript
/**
 * STT Session Types
 */

import type { LiveTranscriptionEvents } from '@deepgram/sdk';
import type { TranscriptSegment } from './transcript.types';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface STTSessionState {
  // Core Identifiers
  sessionId: string;
  connectionId: string;

  // Deepgram Connection
  deepgramLiveClient: LiveTranscriptionEvents | null;
  connectionState: ConnectionState;

  // Transcript Accumulation
  accumulatedTranscript: string;
  interimTranscript: string;
  lastTranscriptTime: number;
  transcriptSegments: TranscriptSegment[];

  // Audio Config
  config: {
    samplingRate: number;
    language: string;
    model: string;
  };

  // Retry State
  retryCount: number;
  lastRetryTime: number;
  reconnectAttempts: number;

  // Lifecycle
  createdAt: number;
  lastActivityAt: number;
  isActive: boolean;

  // Metrics
  metrics: {
    chunksReceived: number;
    chunksForwarded: number;
    transcriptsReceived: number;
    errors: number;
    reconnections: number;
  };
}

export interface STTConfig {
  sessionId: string;
  connectionId: string;
  samplingRate: number;
  language?: string;
}

export interface STTServiceMetrics {
  activeSessions: number;
  totalChunksForwarded: number;
  totalTranscriptsReceived: number;
  totalErrors: number;
  totalReconnections: number;
}

export interface STTSessionMetrics {
  sessionId: string;
  duration: number;
  chunksForwarded: number;
  transcriptsReceived: number;
  reconnections: number;
  errors: number;
  finalTranscriptLength: number;
  connectionState: ConnectionState;
}
```

#### `src/modules/stt/types/error.types.ts`

```typescript
/**
 * STT Error Types
 */

export interface DeepgramError {
  code: number;
  type: string;
  message: string;
}
```

#### `src/modules/stt/types/index.ts`

```typescript
/**
 * Types Module Exports
 */

export * from './stt-session.types';
export * from './transcript.types';
export * from './error.types';
```

---

### 3. Services

#### `src/modules/stt/services/stt-session.service.ts`

```typescript
/**
 * STT Session Service
 * Manages STT session state (internal to stt module)
 */

import { logger } from '@/shared/utils';
import type { LiveTranscriptionEvents } from '@deepgram/sdk';
import type {
  STTSessionState,
  STTConfig,
  TranscriptSegment,
  ConnectionState,
} from '../types';

export class STTSession implements STTSessionState {
  sessionId: string;
  connectionId: string;
  deepgramLiveClient: LiveTranscriptionEvents | null = null;
  connectionState: ConnectionState = 'connecting';
  accumulatedTranscript = '';
  interimTranscript = '';
  lastTranscriptTime: number;
  transcriptSegments: TranscriptSegment[] = [];
  config: { samplingRate: number; language: string; model: string };
  retryCount = 0;
  lastRetryTime = 0;
  reconnectAttempts = 0;
  createdAt: number;
  lastActivityAt: number;
  isActive = true;
  metrics = {
    chunksReceived: 0,
    chunksForwarded: 0,
    transcriptsReceived: 0,
    errors: 0,
    reconnections: 0,
  };

  constructor(
    sessionId: string,
    connectionId: string,
    config: { samplingRate: number; language: string }
  ) {
    this.sessionId = sessionId;
    this.connectionId = connectionId;
    this.config = {
      samplingRate: config.samplingRate,
      language: config.language,
      model: 'nova-2',
    };
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();
    this.lastTranscriptTime = Date.now();
  }

  touch(): void {
    this.lastActivityAt = Date.now();
  }

  addTranscript(text: string, confidence: number, isFinal: boolean): void {
    if (isFinal) {
      this.accumulatedTranscript += text + ' ';
      this.interimTranscript = '';
    } else {
      this.interimTranscript = text;
    }

    this.transcriptSegments.push({
      text,
      timestamp: Date.now(),
      confidence,
      isFinal,
    });

    this.lastTranscriptTime = Date.now();
    this.metrics.transcriptsReceived++;
  }

  getFinalTranscript(): string {
    return this.accumulatedTranscript.trim();
  }

  getDuration(): number {
    return Date.now() - this.createdAt;
  }

  getInactivityDuration(): number {
    return Date.now() - this.lastActivityAt;
  }

  cleanup(): void {
    if (this.deepgramLiveClient) {
      try {
        this.deepgramLiveClient.finish();
      } catch (error) {
        logger.error('Error closing Deepgram client', { sessionId: this.sessionId, error });
      }
      this.deepgramLiveClient = null;
    }
    this.isActive = false;
  }
}

/**
 * STT Session Service
 * Manages session Map (internal to stt module)
 */
export class STTSessionService {
  private sessions = new Map<string, STTSession>();

  createSession(
    sessionId: string,
    connectionId: string,
    config: { samplingRate: number; language: string }
  ): STTSession {
    const session = new STTSession(sessionId, connectionId, config);
    this.sessions.set(sessionId, session);
    logger.debug('STT session created in service', { sessionId });
    return session;
  }

  getSession(sessionId: string): STTSession | undefined {
    return this.sessions.get(sessionId);
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  deleteSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.cleanup();
      this.sessions.delete(sessionId);
      logger.debug('STT session deleted from service', { sessionId });
    }
  }

  getAllSessions(): STTSession[] {
    return Array.from(this.sessions.values());
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  cleanup(): void {
    logger.info('Cleaning up all STT sessions', { count: this.sessions.size });
    this.sessions.forEach((session) => session.cleanup());
    this.sessions.clear();
  }
}

// Export singleton instance
export const sttSessionService = new STTSessionService();
```

#### `src/modules/stt/services/stt.service.ts` (Skeleton - Phase 1)

```typescript
/**
 * STT Service
 * Core business logic for Deepgram integration (internal to stt module)
 */

import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { logger } from '@/shared/utils';
import { sttSessionService, STTSession } from './stt-session.service';
import { DEEPGRAM_CONFIG, RETRY_CONFIG, TIMEOUT_CONFIG } from '../config';
import type { STTConfig, STTServiceMetrics, STTSessionMetrics } from '../types';

export class STTService {
  private readonly apiKey: string;
  private cleanupTimer?: NodeJS.Timeout;
  private readonly MAX_TRANSCRIPT_LENGTH = 50000;

  constructor() {
    this.apiKey = process.env.DEEPGRAM_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('DEEPGRAM_API_KEY not set, STT service will not function');
    }
    this.startCleanupTimer();
  }

  /**
   * Create new STT session
   */
  async createSession(sessionId: string, config: STTConfig): Promise<void> {
    try {
      logger.info('Creating STT session', { sessionId, config });

      // Create session object
      const session = sttSessionService.createSession(sessionId, config.connectionId, {
        samplingRate: config.samplingRate,
        language: config.language || 'en-US',
      });

      // TODO: Implement Deepgram connection in Phase 2
      // const deepgramClient = await this.connectToDeepgram(session.config);
      // session.deepgramLiveClient = deepgramClient;
      // this.setupDeepgramListeners(session);

      session.connectionState = 'connected';

      logger.info('STT session created', { sessionId });
    } catch (error) {
      logger.error('Failed to create STT session', { sessionId, error });
      throw error;
    }
  }

  /**
   * Forward audio chunk to Deepgram
   */
  async forwardChunk(sessionId: string, audioChunk: Uint8Array): Promise<void> {
    const session = sttSessionService.getSession(sessionId);
    if (!session) {
      logger.warn('STT session not found', { sessionId });
      return;
    }

    try {
      session.touch();
      session.metrics.chunksReceived++;

      // TODO: Implement Deepgram forwarding in Phase 2
      // if (session.deepgramLiveClient) {
      //   session.deepgramLiveClient.send(audioChunk);
      //   session.metrics.chunksForwarded++;
      // }

      logger.debug('Audio chunk forwarded', { sessionId, chunkSize: audioChunk.length });
    } catch (error) {
      logger.error('Failed to forward audio chunk', { sessionId, error });
      session.metrics.errors++;
    }
  }

  /**
   * End STT session and get final transcript
   */
  async endSession(sessionId: string): Promise<string> {
    const session = sttSessionService.getSession(sessionId);
    if (!session) {
      logger.warn('STT session not found for ending', { sessionId });
      return '';
    }

    try {
      const finalTranscript = session.getFinalTranscript();

      logger.info('STT session ended', {
        sessionId,
        duration: session.getDuration(),
        transcriptLength: finalTranscript.length,
        metrics: session.metrics,
      });

      sttSessionService.deleteSession(sessionId);

      return finalTranscript;
    } catch (error) {
      logger.error('Error ending STT session', { sessionId, error });
      sttSessionService.deleteSession(sessionId);
      return '';
    }
  }

  /**
   * TODO: Implement in Phase 2
   */
  private async connectToDeepgram(config: any): Promise<LiveTranscriptionEvents> {
    throw new Error('Not implemented yet');
  }

  /**
   * TODO: Implement in Phase 2
   */
  private setupDeepgramListeners(session: STTSession): void {
    // Setup transcript, error, close listeners
  }

  /**
   * TODO: Implement in Phase 3
   */
  private startCleanupTimer(): void {
    // Implement periodic cleanup
  }

  /**
   * Get service-level metrics
   */
  getMetrics(): STTServiceMetrics {
    const sessions = sttSessionService.getAllSessions();
    let totalChunksForwarded = 0;
    let totalTranscriptsReceived = 0;
    let totalErrors = 0;
    let totalReconnections = 0;

    for (const session of sessions) {
      totalChunksForwarded += session.metrics.chunksForwarded;
      totalTranscriptsReceived += session.metrics.transcriptsReceived;
      totalErrors += session.metrics.errors;
      totalReconnections += session.metrics.reconnections;
    }

    return {
      activeSessions: sttSessionService.getSessionCount(),
      totalChunksForwarded,
      totalTranscriptsReceived,
      totalErrors,
      totalReconnections,
    };
  }

  /**
   * Get session-level metrics
   */
  getSessionMetrics(sessionId: string): STTSessionMetrics | undefined {
    const session = sttSessionService.getSession(sessionId);
    if (!session) return undefined;

    return {
      sessionId,
      duration: session.getDuration(),
      chunksForwarded: session.metrics.chunksForwarded,
      transcriptsReceived: session.metrics.transcriptsReceived,
      reconnections: session.metrics.reconnections,
      errors: session.metrics.errors,
      finalTranscriptLength: session.accumulatedTranscript.length,
      connectionState: session.connectionState,
    };
  }

  /**
   * Health check
   */
  isHealthy(): boolean {
    return !!this.apiKey;
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down STT service', {
      activeSessions: sttSessionService.getSessionCount(),
    });

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    sttSessionService.cleanup();

    logger.info('STT service shutdown complete');
  }
}

// Export singleton instance
export const sttService = new STTService();
```

#### `src/modules/stt/services/index.ts`

```typescript
/**
 * Services Module Exports (internal to stt module)
 */

export { sttService } from './stt.service';
export { sttSessionService, STTSession } from './stt-session.service';
```

---

### 4. Controller (Public API)

#### `src/modules/stt/controllers/stt.controller.ts`

```typescript
/**
 * STT Controller
 * Public API gateway for STT module (exposed to other modules)
 */

import { logger } from '@/shared/utils';
import { sttService } from '../services';
import type { STTConfig, STTServiceMetrics, STTSessionMetrics } from '../types';

class STTController {
  /**
   * Create new STT session
   * Called by socket module (audio.handler.ts)
   */
  async createSession(sessionId: string, config: STTConfig): Promise<void> {
    try {
      // Input validation
      if (!sessionId || !config) {
        throw new Error('Invalid input: sessionId and config are required');
      }

      // Delegate to internal service
      await sttService.createSession(sessionId, config);

      logger.info('STT session created via controller', { sessionId });
    } catch (error) {
      logger.error('STT controller: Failed to create session', { sessionId, error });
      throw error; // Propagate to caller (socket module)
    }
  }

  /**
   * Forward audio chunk to Deepgram
   * Called by socket module (audio.handler.ts)
   */
  async forwardChunk(sessionId: string, audioChunk: Uint8Array): Promise<void> {
    // Input validation
    if (!sessionId || !audioChunk || audioChunk.length === 0) {
      logger.warn('STT controller: Invalid chunk', { sessionId });
      return;
    }

    // Delegate to internal service (non-blocking)
    await sttService.forwardChunk(sessionId, audioChunk);
  }

  /**
   * End STT session and get final transcript
   * Called by socket module (audio.handler.ts)
   */
  async endSession(sessionId: string): Promise<string> {
    try {
      const transcript = await sttService.endSession(sessionId);
      logger.info('STT session ended via controller', { sessionId });
      return transcript;
    } catch (error) {
      logger.error('STT controller: Failed to end session', { sessionId, error });
      return ''; // Graceful degradation
    }
  }

  /**
   * Get service-level metrics
   * Can be called by monitoring/health check endpoints
   */
  getMetrics(): STTServiceMetrics {
    return sttService.getMetrics();
  }

  /**
   * Get session-level metrics
   * Can be called by monitoring/debugging
   */
  getSessionMetrics(sessionId: string): STTSessionMetrics | undefined {
    return sttService.getSessionMetrics(sessionId);
  }

  /**
   * Health check
   * Can be called by health check endpoints
   */
  isHealthy(): boolean {
    return sttService.isHealthy();
  }

  /**
   * Graceful shutdown
   * Called by main server shutdown
   */
  async shutdown(): Promise<void> {
    await sttService.shutdown();
  }
}

// Export singleton instance
export const sttController = new STTController();
```

#### `src/modules/stt/controllers/index.ts`

```typescript
/**
 * Controllers Module Exports (public API)
 */

export { sttController } from './stt.controller';
```

---

### 5. Module Public Exports

#### `src/modules/stt/index.ts`

```typescript
/**
 * STT Module Public Exports
 * Only these are accessible to other modules
 */

// Public API Gateway
export { sttController } from './controllers';

// Public Types
export type {
  STTConfig,
  STTServiceMetrics,
  STTSessionMetrics,
  STTSessionState,
  TranscriptSegment,
} from './types';

// Internal exports for testing only
// (Only use these in test files, never in other modules)
export { sttService } from './services/stt.service';
export { sttSessionService, STTSession } from './services/stt-session.service';
```

---

### 6. Update Socket Module

#### Modify `src/modules/socket/handlers/audio.handler.ts`

Add these changes:

```typescript
// At top of file - ADD THIS IMPORT
import { sttController } from '@/modules/stt';

// Add environment flag - ADD THIS CONSTANT
const USE_STT = !!process.env.DEEPGRAM_API_KEY;

// In handleAudioStart function - ADD THIS BLOCK
// (After session validation and metadata update)
if (USE_STT) {
  // NEW: Initialize STT session via controller
  try {
    await sttController.createSession(session.sessionId, {
      sessionId: session.sessionId,
      connectionId,
      samplingRate,
      language: payload.language || 'en-US',
    });
    logger.info('STT session initialized', { sessionId: session.sessionId });
  } catch (error) {
    logger.error('Failed to initialize STT session', { sessionId: session.sessionId, error });
    sendError(
      ws,
      ErrorCode.INTERNAL_ERROR,
      'Failed to initialize transcription',
      VOICECHAT_EVENTS.AUDIO_START,
      session.sessionId
    );
    return;
  }
} else {
  // LEGACY: Echo testing
  audioBufferService.initializeBuffer(session.sessionId, samplingRate, startEventId);
  logger.info('Echo buffer initialized', { sessionId: session.sessionId });
}

// In handleAudioChunk function - ADD THIS BLOCK
// (After audio chunk validation)
if (USE_STT) {
  // NEW: Forward to STT controller
  if (!isMuted) {
    await sttController.forwardChunk(session.sessionId, audioChunk);
  }
} else {
  // LEGACY: Buffer for echo
  if (!isMuted) {
    audioBufferService.addChunk(session.sessionId, audioChunk);
  }
}

// In handleAudioEnd function - ADD THIS BLOCK
// (Before sending ACK, after session state update)
if (USE_STT) {
  // NEW: End STT session via controller and get final transcript
  const finalTranscript = await sttController.endSession(session.sessionId);
  logger.info('STT session ended', {
    sessionId: session.sessionId,
    transcriptLength: finalTranscript.length,
    transcript: finalTranscript.substring(0, 100), // Log first 100 chars
  });
  // TODO: Store transcript for LLM (Phase 5)
} else {
  // LEGACY: Echo audio back
  await streamEchoedAudio(session.sessionId, samplingRate);
  audioBufferService.clearBuffer(session.sessionId);
}
```

---

## Testing During Development

### Test Without STT (Echo Mode)
```bash
unset DEEPGRAM_API_KEY
pnpm dev
# Socket module uses echo mode
# STT module not invoked
```

### Test With STT (Real Deepgram)
```bash
export DEEPGRAM_API_KEY=your_key_here
pnpm dev
# Socket module calls stt module
# STT module connects to Deepgram
```

### Verify Module Separation

```bash
# Check imports in socket module
grep -r "from '@/modules/stt" src/modules/socket/
# Should only see: import { sttController } from '@/modules/stt'
# Should NOT see imports from stt/services, stt/config, etc.

# Check no reverse dependencies
grep -r "from '@/modules/socket" src/modules/stt/
# Should be empty (stt module never imports from socket)
```

### Manual Verification Checklist

Phase 1:
- [ ] STT module structure created (all directories and files)
- [ ] Barrel exports configured (index.ts files)
- [ ] Socket module imports only from `@/modules/stt`
- [ ] Service starts without errors
- [ ] Session created on audio.start
- [ ] Audio chunks forwarded (check logs)
- [ ] Session deleted on audio.end
- [ ] Echo mode still works (without API key)
- [ ] No circular dependencies

---

## Common Issues & Solutions

### Issue 1: "Cannot find module '@/modules/stt'"
**Solution**: Ensure barrel export is correct in `src/modules/stt/index.ts`

### Issue 2: "sttController is undefined"
**Solution**: Check that `stt.controller.ts` exports singleton and `controllers/index.ts` re-exports it

### Issue 3: Circular dependency error
**Solution**:
- stt module should NEVER import from socket module
- socket module imports ONLY from `@/modules/stt` (public API)
- Check all import statements

### Issue 4: TypeScript errors in socket module
**Solution**: Ensure types are exported from `src/modules/stt/index.ts`

### Issue 5: "DEEPGRAM_API_KEY not set" warning
**Solution**: Add to `.env` file and restart server (or use echo mode)

---

## Phase 2 & 3 Implementation Notes

See the full design spec for:
- Phase 2: Error handling and retry logic templates
- Phase 3: Cleanup timer and memory management templates

---

## Module Architecture Validation

Before moving to Phase 2, verify:

1. **Clean Separation**:
   ```typescript
   // ✅ CORRECT in socket module
   import { sttController } from '@/modules/stt';

   // ❌ WRONG in socket module
   import { STTService } from '@/modules/stt/services/stt.service';
   ```

2. **No Reverse Dependencies**:
   ```bash
   # This should return nothing
   grep -r "@/modules/socket" src/modules/stt/
   ```

3. **State Independence**:
   - socket module has its own state (SessionService, WebSocketService)
   - stt module has its own state (STTSessionService)
   - Coordinated only via sessionId

4. **API Contracts**:
   - All cross-module calls go through STTController
   - STTController validates inputs
   - Errors properly propagated

---

## Questions or Blockers?

If you encounter any issues:

1. **Check Design Spec**: [deepgram-stt-integration-design-v2.md](./deepgram-stt-integration-design-v2.md)
2. **Module Boundaries**: Verify no circular dependencies
3. **Ask @architect**: For architectural questions or design clarifications

---

**Good luck with implementation!** The modular design provides clean separation of concerns and makes the codebase more maintainable. Focus on getting Phase 1 structure correct before moving to Phase 2.
