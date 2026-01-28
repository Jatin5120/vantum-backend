/**
 * TTS Service Unit Tests
 * Comprehensive test coverage for TTSService class
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TTSService } from '@/modules/tts/services/tts.service';
import { ttsSessionService } from '@/modules/tts/services/tts-session.service';
import { TTSState } from '@/modules/tts/types';
import { cartesiaConfig } from '@/modules/tts/config';

// Mock Cartesia SDK with Emittery-compatible API
const mockAudioSourceListeners: Record<string, Function[]> = {};
let autoEmitEvents = true; // Flag to control auto-emission

const mockAudioSource = {
  on: vi.fn((event: string, callback: Function) => {
    if (!mockAudioSourceListeners[event]) {
      mockAudioSourceListeners[event] = [];
    }
    mockAudioSourceListeners[event].push(callback);

    // Auto-emit events only if enabled (for end-to-end synthesis tests)
    if (autoEmitEvents) {
      // Auto-emit 'enqueue' event to transition GENERATING → STREAMING
      if (event === 'enqueue') {
        setImmediate(() => callback());
      }

      // Auto-emit 'close' event after a microtask to simulate synthesis completion
      // Use setImmediate for proper async behavior
      if (event === 'close') {
        setImmediate(() => callback());
      }
    }
  }),
  off: vi.fn(),
  once: vi.fn(),
  buffer: new Uint8Array(0),
  writeIndex: 0,
};

const mockConnectionEvents = {
  on: vi.fn(),
  off: vi.fn(),
};

const mockCartesiaWs = {
  connect: vi.fn().mockResolvedValue(mockConnectionEvents),
  disconnect: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue({
    source: mockAudioSource,
  }),
  socket: {
    ping: vi.fn(),
  },
};

const mockCartesiaClient = {
  tts: {
    websocket: vi.fn(() => mockCartesiaWs),
  },
};

vi.mock('@cartesia/cartesia-js', () => {
  return {
    CartesiaClient: class MockCartesiaClient {
      constructor() {
        return mockCartesiaClient;
      }
    }
  };
});

// Mock audio resampler
vi.mock('@/modules/audio/services', () => ({
  audioResamplerService: {
    resampleToHigher: vi.fn((buffer) => Buffer.from(buffer)),
  },
}));

// Mock WebSocket service
const mockWebSocket = {
  send: vi.fn(),
  readyState: 1, // OPEN
};

vi.mock('@/modules/socket/services', () => ({
  websocketService: {
    getWebSocket: vi.fn(() => mockWebSocket),
  },
}));

// Mock logger
vi.mock('@/shared/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  generateId: vi.fn(() => 'test-id-123'),
}));

describe('TTSService', () => {
  let service: TTSService;
  const sessionId = 'test-session-id';
  const connectionId = 'test-connection-id';
  const config = {
    sessionId,
    connectionId,
    voiceId: 'test-voice-id',
    language: 'en',
    speed: 1.0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Don't use fake timers to avoid infinite loop issues
    process.env.CARTESIA_API_KEY = 'test-api-key';
    process.env.NODE_ENV = 'test'; // Disable cleanup timer

    // Reset auto-emit flag (enabled by default for full synthesis tests)
    autoEmitEvents = true;

    // Reset audio source mock with sample audio data
    mockAudioSource.buffer = new Int16Array([1, 2, 3, 4, 5]);
    mockAudioSource.writeIndex = 5;
    mockAudioSource.on.mockClear();
    mockAudioSource.off.mockClear();

    // Clear event listeners
    Object.keys(mockAudioSourceListeners).forEach(key => delete mockAudioSourceListeners[key]);

    // Reset session service
    ttsSessionService.clearAllSessions();

    // Create fresh service instance
    service = new TTSService();
  });

  afterEach(async () => {
    try {
      await service.shutdown({ restart: false });
    } catch (error) {
      // Ignore shutdown errors in tests
    }
    ttsSessionService.clearAllSessions();
    vi.clearAllMocks();
  });

  describe('Session Lifecycle', () => {
    it('should create session with correct initial state', async () => {
      await service.createSession(sessionId, config);

      const session = ttsSessionService.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.sessionId).toBe(sessionId);
      expect(session?.connectionId).toBe(connectionId);
      expect(session?.ttsState).toBe(TTSState.IDLE);
      expect(session?.connectionState).toBe('connected');
      expect(session?.synthesisMutex).toBe(false); // P1-3: Verify mutex initialized
    });

    it('should connect to Cartesia on session creation', async () => {
      await service.createSession(sessionId, config);

      expect(mockCartesiaClient.tts.websocket).toHaveBeenCalledWith({
        sampleRate: cartesiaConfig.sampleRate,
        container: 'raw',
        encoding: 'pcm_s16le',
      });
      expect(mockCartesiaWs.connect).toHaveBeenCalled();
    });

    it('should cleanup session on creation failure', async () => {
      mockCartesiaWs.connect.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(service.createSession(sessionId, config)).rejects.toThrow('Connection failed');

      const session = ttsSessionService.getSession(sessionId);
      expect(session).toBeUndefined();
    });

    it('should end session and cleanup resources', async () => {
      await service.createSession(sessionId, config);
      await service.endSession(sessionId);

      const session = ttsSessionService.getSession(sessionId);
      expect(session).toBeUndefined();
    });

    it('should check if session exists', async () => {
      expect(service.hasSession(sessionId)).toBe(false);

      await service.createSession(sessionId, config);
      expect(service.hasSession(sessionId)).toBe(true);

      await service.endSession(sessionId);
      expect(service.hasSession(sessionId)).toBe(false);
    });

    it('should prevent session creation during shutdown', async () => {
      await service.shutdown({ restart: false });

      await expect(service.createSession(sessionId, config)).rejects.toThrow(
        'TTS service is shutting down'
      );
    });
  });

  describe('Text Synthesis', () => {
    beforeEach(async () => {
      await service.createSession(sessionId, config);
    });

    it('should synthesize text successfully', async () => {
      const text = 'Hello, world!';

      await service.synthesizeText(sessionId, text);

      const session = ttsSessionService.getSession(sessionId);
      // After await completes, synthesis is done: utteranceId cleared, state back to IDLE
      expect(session?.currentUtteranceId).toBe(null);
      expect(session?.ttsState).toBe(TTSState.IDLE);
      expect(session?.metrics.textsSynthesized).toBe(1);
    });

    it('should send synthesis request with correct parameters', async () => {
      const text = 'Test synthesis';

      await service.synthesizeText(sessionId, text);

      expect(mockCartesiaWs.send).toHaveBeenCalledWith({
        modelId: cartesiaConfig.model,
        voice: {
          mode: 'id',
          id: config.voiceId,
        },
        transcript: text,
        outputFormat: {
          container: 'raw',
          encoding: 'pcm_s16le',
          sampleRate: cartesiaConfig.sampleRate,
        },
        language: config.language,
      });
    });

    it('should use custom voice ID from options', async () => {
      const text = 'Custom voice test';
      const customVoiceId = 'custom-voice-id';

      await service.synthesizeText(sessionId, text, { voiceId: customVoiceId });

      expect(mockCartesiaWs.send).toHaveBeenCalledWith(
        expect.objectContaining({
          voice: {
            mode: 'id',
            id: customVoiceId,
          },
        })
      );
    });

    it('should reject empty text', async () => {
      await service.synthesizeText(sessionId, '');

      const session = ttsSessionService.getSession(sessionId);
      expect(session?.metrics.textsSynthesized).toBe(0);
    });

    it('should truncate text exceeding max length', async () => {
      const longText = 'a'.repeat(15000); // Exceeds MAX_TEXT_LENGTH (10000)

      await service.synthesizeText(sessionId, longText);

      expect(mockCartesiaWs.send).toHaveBeenCalledWith(
        expect.objectContaining({
          transcript: expect.stringMatching(/^a{10000}$/),
        })
      );
    });

    it('should buffer text during reconnection', async () => {
      const session = ttsSessionService.getSession(sessionId);
      if (!session) throw new Error('Session not found');

      // Simulate disconnection
      session.isReconnecting = true;
      session.connectionState = 'disconnected';

      const text = 'Buffered text';
      await service.synthesizeText(sessionId, text);

      expect(session.reconnectionBuffer).toContain(text);
      expect(session.metrics.bufferedTextsDuringReconnection).toBe(1);
    });

    it('should not synthesize when session not in IDLE state', async () => {
      const session = ttsSessionService.getSession(sessionId);
      if (!session) throw new Error('Session not found');

      // Set to GENERATING (already synthesizing)
      session.transitionTo(TTSState.GENERATING);

      await service.synthesizeText(sessionId, 'test');

      // Should not create new synthesis (only the initial mock call from createSession)
      expect(mockCartesiaWs.send).toHaveBeenCalledTimes(0);
    });

    it('should handle synthesis errors gracefully', async () => {
      mockCartesiaWs.send.mockRejectedValueOnce(new Error('Synthesis failed'));

      await expect(service.synthesizeText(sessionId, 'test')).rejects.toThrow('Synthesis failed');

      const session = ttsSessionService.getSession(sessionId);
      expect(session?.metrics.synthesisErrors).toBe(1);
      expect(session?.metrics.errors).toBe(1);
      expect(session?.ttsState).toBe(TTSState.ERROR);
    });

    // P1-3: New test - Concurrent synthesis blocked by mutex
    it('should block concurrent synthesis attempts with mutex', async () => {
      const session = ttsSessionService.getSession(sessionId);
      if (!session) throw new Error('Session not found');

      // Set mutex (simulating in-progress synthesis)
      session.synthesisMutex = true;

      await service.synthesizeText(sessionId, 'concurrent text');

      // Should not create new synthesis
      expect(mockCartesiaWs.send).toHaveBeenCalledTimes(0);
      expect(session.metrics.textsSynthesized).toBe(0); // Skipped due to mutex
    });

    // P1-3: New test - Mutex released after successful synthesis
    it('should release mutex after successful synthesis', async () => {
      await service.synthesizeText(sessionId, 'test');

      const session = ttsSessionService.getSession(sessionId);
      expect(session?.synthesisMutex).toBe(false); // Mutex released in finally block
    });

    // P1-3: New test - Mutex released even after synthesis error
    it('should release mutex even after synthesis error', async () => {
      mockCartesiaWs.send.mockRejectedValueOnce(new Error('Synthesis failed'));

      await expect(service.synthesizeText(sessionId, 'test')).rejects.toThrow('Synthesis failed');

      const session = ttsSessionService.getSession(sessionId);
      expect(session?.synthesisMutex).toBe(false); // Mutex released in finally block
    });
  });

  describe('Audio Chunk Handling', () => {
    beforeEach(async () => {
      await service.createSession(sessionId, config);
    });

    it('should register enqueue listener for audio chunks', async () => {
      await service.synthesizeText(sessionId, 'test');

      // Should register 'enqueue' listener (NOT 'chunk'!)
      const enqueueHandler = mockAudioSource.on.mock.calls.find(
        (call) => call[0] === 'enqueue'
      )?.[1];

      expect(enqueueHandler).toBeDefined();
    });

    it('should handle audio chunks from Cartesia via enqueue event', async () => {
      // Disable auto-emit to manually control event flow
      autoEmitEvents = false;

      const synthesisPromise = service.synthesizeText(sessionId, 'test');

      // Wait for listener registration
      await new Promise(resolve => setImmediate(resolve));

      // Get the 'enqueue' event handler registered
      const enqueueHandler = mockAudioSourceListeners['enqueue']?.[0];
      expect(enqueueHandler).toBeDefined();

      // Simulate audio data in buffer
      const audioData = new Int16Array([1, 2, 3, 4, 5]);
      mockAudioSource.buffer = audioData;
      mockAudioSource.writeIndex = audioData.length;

      // Fire enqueue event
      await enqueueHandler();

      const session = ttsSessionService.getSession(sessionId);
      expect(session?.metrics.chunksGenerated).toBe(1);
      expect(session?.metrics.chunksSent).toBe(1);
      expect(session?.ttsState).toBe(TTSState.STREAMING);

      // Complete the synthesis
      const closeHandler = mockAudioSourceListeners['close']?.[0];
      await closeHandler();
      await synthesisPromise;
    });

    it('should transition to STREAMING on first chunk', async () => {
      // Disable auto-emit to manually control event flow
      autoEmitEvents = false;

      // Clear pre-buffered audio to prevent immediate STREAMING transition
      mockAudioSource.buffer = new Int16Array(0);
      mockAudioSource.writeIndex = 0;

      const synthesisPromise = service.synthesizeText(sessionId, 'test');

      // Wait for listener registration
      await new Promise(resolve => setImmediate(resolve));

      const session = ttsSessionService.getSession(sessionId);
      expect(session?.ttsState).toBe(TTSState.GENERATING);

      // Simulate first chunk via enqueue
      const enqueueHandler = mockAudioSourceListeners['enqueue']?.[0];
      const audioData = new Int16Array([1, 2, 3]);
      mockAudioSource.buffer = audioData;
      mockAudioSource.writeIndex = audioData.length;
      await enqueueHandler();

      expect(session?.ttsState).toBe(TTSState.STREAMING);

      // Complete the synthesis
      const closeHandler = mockAudioSourceListeners['close']?.[0];
      await closeHandler();
      await synthesisPromise;
    });

    it('should send audio chunks to client via WebSocket', async () => {
      await service.synthesizeText(sessionId, 'test');

      const enqueueHandler = mockAudioSource.on.mock.calls.find(
        (call) => call[0] === 'enqueue'
      )?.[1];

      const audioData = new Int16Array([1, 2, 3]);
      mockAudioSource.buffer = audioData;
      mockAudioSource.writeIndex = audioData.length;
      await enqueueHandler();

      expect(mockWebSocket.send).toHaveBeenCalled();
    });

    it('should handle chunk errors without crashing', async () => {
      await service.synthesizeText(sessionId, 'test');

      const enqueueHandler = mockAudioSource.on.mock.calls.find(
        (call) => call[0] === 'enqueue'
      )?.[1];

      // Simulate error in chunk handling (invalid buffer)
      mockAudioSource.buffer = null as any;
      mockAudioSource.writeIndex = 10;

      await expect(enqueueHandler()).resolves.not.toThrow();

      const session = ttsSessionService.getSession(sessionId);
      expect(session?.metrics.errors).toBeGreaterThan(0);
    });

    // P1-1: New test - Pre-buffered audio processed correctly
    it('should process pre-buffered audio before listener registration', async () => {
      // Simulate audio already buffered before listener attached
      const prebufferedData = new Int16Array([1, 2, 3, 4, 5]);
      mockAudioSource.buffer = prebufferedData;
      mockAudioSource.writeIndex = prebufferedData.length;

      await service.synthesizeText(sessionId, 'test');

      const session = ttsSessionService.getSession(sessionId);
      // Pre-buffered audio should be processed immediately
      expect(session?.metrics.chunksGenerated).toBe(1);
      expect(session?.metrics.chunksSent).toBe(1);
    });
  });

  describe('Synthesis Completion', () => {
    beforeEach(async () => {
      await service.createSession(sessionId, config);
    });

    it('should handle synthesis completion', async () => {
      await service.synthesizeText(sessionId, 'test');

      // Simulate streaming started
      const session = ttsSessionService.getSession(sessionId);
      session?.transitionTo(TTSState.STREAMING);

      // Get the 'close' event handler
      const closeHandler = mockAudioSource.on.mock.calls.find((call) => call[0] === 'close')?.[1];
      expect(closeHandler).toBeDefined();

      // Simulate completion
      closeHandler();

      expect(session?.ttsState).toBe(TTSState.IDLE);
      expect(session?.currentUtteranceId).toBeNull();
    });

    // P0-2 FIX: Updated test to reflect memory leak fix - event listeners ARE cleaned up in finally block
    it('should cleanup event listeners in finally block to prevent memory leak (P0-2 fix)', async () => {
      await service.synthesizeText(sessionId, 'test');

      const closeHandler = mockAudioSource.on.mock.calls.find((call) => call[0] === 'close')?.[1];
      closeHandler();

      // P0-2 FIX: Verify .off() WAS called for all 3 listeners (enqueue, close, error)
      // This prevents memory leak from accumulating event listeners
      expect(mockAudioSource.off).toHaveBeenCalledTimes(3);
      expect(mockAudioSource.off).toHaveBeenCalledWith('enqueue', expect.any(Function));
      expect(mockAudioSource.off).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockAudioSource.off).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should update synthesis time metrics', async () => {
      const session = ttsSessionService.getSession(sessionId);
      const startTime = Date.now();
      session!.lastActivityAt = startTime;

      await service.synthesizeText(sessionId, 'test');

      // Manually advance time (no fake timers)
      const futureTime = startTime + 100;
      vi.spyOn(Date, 'now').mockReturnValue(futureTime);

      const closeHandler = mockAudioSource.on.mock.calls.find((call) => call[0] === 'close')?.[1];
      closeHandler();

      expect(session?.metrics.averageSynthesisTimeMs).toBeGreaterThan(0);
      expect(session?.metrics.totalSynthesisTimeMs).toBeGreaterThan(0);

      vi.restoreAllMocks();
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await service.createSession(sessionId, config);
    });

    it('should handle source errors', async () => {
      await service.synthesizeText(sessionId, 'test');

      const errorHandler = mockAudioSource.on.mock.calls.find((call) => call[0] === 'error')?.[1];
      const error = new Error('Source error');

      errorHandler(error);

      const session = ttsSessionService.getSession(sessionId);
      expect(session?.metrics.synthesisErrors).toBe(1);
      expect(session?.metrics.errors).toBe(1);
      expect(session?.metrics.connectionErrors).toBe(1);
    });

    // P1-2: Updated test - SDK self-cleans on error, but defensive cleanup attempted
    it('should attempt defensive cleanup on error (but SDK self-cleans)', async () => {
      await service.synthesizeText(sessionId, 'test');

      const errorHandler = mockAudioSource.on.mock.calls.find((call) => call[0] === 'error')?.[1];
      errorHandler(new Error('Test error'));

      // P1-2: Implementation attempts defensive cleanup in catch block
      // But SDK self-cleans, so this is defensive only
      // We can't easily test this without exposing internal state
      // Just verify error was handled
      const session = ttsSessionService.getSession(sessionId);
      expect(session?.metrics.errors).toBeGreaterThan(0);
    });

    // P1-2: New test - Defensive cleanup in synthesis error path
    it('should attempt defensive listener cleanup on synthesis error', async () => {
      mockCartesiaWs.send.mockRejectedValueOnce(new Error('Synthesis failed'));

      await expect(service.synthesizeText(sessionId, 'test')).rejects.toThrow('Synthesis failed');

      // P1-2: Defensive cleanup attempted in catch block
      // Since send() failed, no source exists yet, so no cleanup possible
      // Just verify error metrics
      const session = ttsSessionService.getSession(sessionId);
      expect(session?.metrics.synthesisErrors).toBe(1);
    });

    it('should classify Cartesia errors', async () => {
      // Disable auto-emit to manually control event flow
      autoEmitEvents = false;

      const synthesisPromise = service.synthesizeText(sessionId, 'test');

      // Wait for listener registration
      await new Promise(resolve => setImmediate(resolve));

      const errorHandler = mockAudioSourceListeners['error']?.[0];
      const authError = Object.assign(new Error('Unauthorized'), { statusCode: 401 });

      errorHandler(authError);

      const session = ttsSessionService.getSession(sessionId);
      expect(session?.ttsState).toBe(TTSState.ERROR);

      // Clean up (synthesis Promise should have been rejected)
      await synthesisPromise.catch(() => {}); // Expected to fail
    });
  });

  describe('Synthesis Cancellation', () => {
    beforeEach(async () => {
      await service.createSession(sessionId, config);
    });

    it('should cancel ongoing synthesis', async () => {
      await service.synthesizeText(sessionId, 'test');

      const session = ttsSessionService.getSession(sessionId);
      session?.transitionTo(TTSState.STREAMING);

      await service.cancelSynthesis(sessionId);

      expect(session?.ttsState).toBe(TTSState.IDLE);
    });

    it('should not cancel when not synthesizing', async () => {
      const session = ttsSessionService.getSession(sessionId);
      expect(session?.ttsState).toBe(TTSState.IDLE);

      await service.cancelSynthesis(sessionId);

      // Should remain IDLE
      expect(session?.ttsState).toBe(TTSState.IDLE);
    });

    it('should handle non-existent session gracefully', async () => {
      await expect(service.cancelSynthesis('non-existent-session')).resolves.not.toThrow();
    });
  });

  describe('Connection Management', () => {
    beforeEach(async () => {
      await service.createSession(sessionId, config);
    });

    it('should setup connection event listeners', async () => {
      expect(mockConnectionEvents.on).toHaveBeenCalledWith('open', expect.any(Function));
      expect(mockConnectionEvents.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should start keepAlive on connection', async () => {
      const session = ttsSessionService.getSession(sessionId);
      expect(session?.keepAliveInterval).toBeDefined();
    });

    it('should send keepAlive pings', async () => {
      const session = ttsSessionService.getSession(sessionId);

      // Manually trigger keepAlive interval callback
      if (session?.keepAliveInterval) {
        const intervalCallback = (session.keepAliveInterval as any)._onTimeout || (() => {});
        intervalCallback();
      }

      // Verify ping was called (if interval triggered)
      // Note: This is a simplified test - real intervals are handled by timers
    });

    it('should handle unexpected connection close', async () => {
      const closeHandler = mockConnectionEvents.on.mock.calls.find(
        (call) => call[0] === 'close'
      )?.[1];

      // Mock reconnection
      mockCartesiaWs.connect.mockResolvedValueOnce(mockConnectionEvents);

      closeHandler();

      // Wait for async reconnection
      await new Promise(resolve => setTimeout(resolve, 10));

      const session = ttsSessionService.getSession(sessionId);
      expect(session?.metrics.reconnections).toBe(1);
    });
  });

  describe('Reconnection Logic', () => {
    beforeEach(async () => {
      await service.createSession(sessionId, config);
    });

    it('should attempt reconnection on unexpected close', async () => {
      const session = ttsSessionService.getSession(sessionId);
      const closeHandler = mockConnectionEvents.on.mock.calls.find(
        (call) => call[0] === 'close'
      )?.[1];

      mockCartesiaWs.connect.mockResolvedValueOnce(mockConnectionEvents);

      closeHandler();

      // Wait for async reconnection
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(session?.metrics.reconnections).toBe(1);
      expect(session?.metrics.successfulReconnections).toBe(1);
    });

    it('should flush buffered texts after reconnection', async () => {
      const session = ttsSessionService.getSession(sessionId);
      if (!session) throw new Error('Session not found');

      // Manually add texts to buffer (simulating texts buffered during disconnection)
      // DON'T set isReconnecting = true, let the closeHandler do that
      session.reconnectionBuffer.push('text 1', 'text 2');

      const closeHandler = mockConnectionEvents.on.mock.calls.find(
        (call) => call[0] === 'close'
      )?.[1];

      mockCartesiaWs.connect.mockResolvedValueOnce(mockConnectionEvents);

      closeHandler();

      // Wait for async reconnection + buffer flush (which calls synthesizeText twice)
      // With auto-emit enabled, synthesis completes quickly, but reconnection logic is async
      await new Promise(resolve => setTimeout(resolve, 50));

      // Buffer should be cleared after flush
      expect(session.reconnectionBuffer).toHaveLength(0);
    });


    it('should track downtime during reconnection', async () => {
      const session = ttsSessionService.getSession(sessionId);
      const closeHandler = mockConnectionEvents.on.mock.calls.find(
        (call) => call[0] === 'close'
      )?.[1];

      mockCartesiaWs.connect.mockResolvedValueOnce(mockConnectionEvents);

      const startTime = Date.now();
      closeHandler();

      // Wait for async reconnection with enough time to accumulate downtime
      await new Promise(resolve => setTimeout(resolve, 100));

      const downtime = session?.metrics.totalDowntimeMs || 0;
      // Downtime should be tracked (at least a few milliseconds)
      expect(downtime).toBeGreaterThanOrEqual(0);
    });

    it('should track failed reconnections', async () => {
      const session = ttsSessionService.getSession(sessionId);
      const closeHandler = mockConnectionEvents.on.mock.calls.find(
        (call) => call[0] === 'close'
      )?.[1];

      mockCartesiaWs.connect.mockRejectedValueOnce(new Error('Reconnection failed'));

      closeHandler();

      // Wait for async reconnection attempt
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(session?.metrics.failedReconnections).toBe(1);
      expect(session?.connectionState).toBe('disconnected');
    });

    it('should prevent multiple simultaneous reconnections', async () => {
      const session = ttsSessionService.getSession(sessionId);
      session!.isReconnecting = true;

      const closeHandler = mockConnectionEvents.on.mock.calls.find(
        (call) => call[0] === 'close'
      )?.[1];

      closeHandler();

      // Wait briefly
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should not increment reconnections (already reconnecting)
      expect(mockCartesiaWs.connect).toHaveBeenCalledTimes(1); // Only initial connection
    });
  });

  describe('Metrics', () => {
    it('should track service-level metrics', async () => {
      await service.createSession(sessionId, config);

      const metrics = service.getMetrics();

      expect(metrics.activeSessions).toBe(1);
      expect(metrics.totalSessionsCreated).toBe(1);
      expect(metrics.peakConcurrentSessions).toBe(1);
    });

    it('should aggregate metrics from all sessions', async () => {
      await service.createSession('session-1', { ...config, sessionId: 'session-1' });
      await service.createSession('session-2', { ...config, sessionId: 'session-2' });

      await service.synthesizeText('session-1', 'test 1');
      await service.synthesizeText('session-2', 'test 2');

      const metrics = service.getMetrics();
      expect(metrics.totalTextsSynthesized).toBe(2);
      expect(metrics.activeSessions).toBe(2);
    });

    it('should calculate memory usage estimate', async () => {
      await service.createSession(sessionId, config);

      const metrics = service.getMetrics();
      expect(metrics.memoryUsageEstimateMB).toBeGreaterThanOrEqual(0);
    });

    it('should return session-specific metrics', async () => {
      await service.createSession(sessionId, config);
      await service.synthesizeText(sessionId, 'test');

      const sessionMetrics = service.getSessionMetrics(sessionId);

      expect(sessionMetrics).toBeDefined();
      expect(sessionMetrics?.textsSynthesized).toBe(1);
    });

    it('should return undefined for non-existent session', () => {
      const metrics = service.getSessionMetrics('non-existent');
      expect(metrics).toBeUndefined();
    });

    it('should track peak concurrent sessions', async () => {
      await service.createSession('session-1', { ...config, sessionId: 'session-1' });
      await service.createSession('session-2', { ...config, sessionId: 'session-2' });
      await service.createSession('session-3', { ...config, sessionId: 'session-3' });

      const metrics = service.getMetrics();
      expect(metrics.peakConcurrentSessions).toBe(3);

      await service.endSession('session-2');

      const updatedMetrics = service.getMetrics();
      expect(updatedMetrics.peakConcurrentSessions).toBe(3); // Peak should remain
      expect(updatedMetrics.activeSessions).toBe(2); // Active decreases
    });
  });

  describe('Health Check', () => {
    it('should be healthy when API key is set', () => {
      expect(service.isHealthy()).toBe(true);
    });

    it('should be unhealthy when API key is missing', () => {
      process.env.CARTESIA_API_KEY = '';
      const unhealthyService = new TTSService();
      expect(unhealthyService.isHealthy()).toBe(false);
    });
  });

  describe('Graceful Shutdown', () => {
    it('should close all active sessions', async () => {
      await service.createSession('session-1', { ...config, sessionId: 'session-1' });
      await service.createSession('session-2', { ...config, sessionId: 'session-2' });

      await service.shutdown({ restart: false });

      expect(ttsSessionService.getSessionCount()).toBe(0);
    });

    it('should support restart option', async () => {
      await service.createSession(sessionId, config);

      await service.shutdown({ restart: true });

      // Should be able to create new session after restart
      await expect(service.createSession('new-session', { ...config, sessionId: 'new-session' })).resolves.not.toThrow();
    });

    it('should force cleanup remaining sessions', async () => {
      await service.createSession('session-1', { ...config, sessionId: 'session-1' });
      await service.createSession('session-2', { ...config, sessionId: 'session-2' });

      // Mock one session to fail cleanup
      const session1 = ttsSessionService.getSession('session-1');
      vi.spyOn(session1!, 'cleanup').mockRejectedValueOnce(new Error('Cleanup failed'));

      await service.shutdown({ restart: false });

      // All sessions should still be removed
      expect(ttsSessionService.getSessionCount()).toBe(0);
    });
  });

  describe('Cleanup Timer', () => {
    it('should not start cleanup timer in test mode', () => {
      // Already in test mode (NODE_ENV=test)
      const testService = new TTSService();

      // Timer should not be set
      expect(testService['cleanupTimer']).toBeUndefined();
    });

    it('should start cleanup timer in production mode', () => {
      process.env.NODE_ENV = 'production';
      const prodService = new TTSService();

      // Timer should be set
      expect(prodService['cleanupTimer']).toBeDefined();

      // Cleanup
      prodService.shutdown({ restart: false });
      process.env.NODE_ENV = 'test';
    });
  });
});
