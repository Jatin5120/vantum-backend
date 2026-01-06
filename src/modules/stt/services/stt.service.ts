/**
 * STT Service
 * Core business logic for Deepgram integration (internal to stt module)
 */

import { createClient, ListenLiveClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { logger } from '@/shared/utils';
import { sttSessionService, STTSession } from './stt-session.service';
import { DEEPGRAM_CONFIG, RETRY_CONFIG, TIMEOUT_CONFIG, STT_CONSTANTS } from '../config';
import {
  classifyDeepgramError,
  ErrorType,
} from '../utils/error-classifier';
import type { STTConfig, STTServiceMetrics, STTSessionMetrics } from '../types';

/**
 * Type definitions for Deepgram events
 */
interface DeepgramTranscriptResponse {
  channel?: {
    alternatives?: Array<{
      transcript: string;
      confidence?: number;
    }>;
  };
  is_final?: boolean;
}

interface DeepgramMetadata {
  request_id?: string;
  model_info?: unknown;
  duration?: number;
  [key: string]: unknown;
}

export class STTService {
  private readonly apiKey: string;
  private cleanupTimer?: NodeJS.Timeout;
  private readonly maxTranscriptLength = STT_CONSTANTS.MAX_TRANSCRIPT_LENGTH;
  // Phase 3: Memory management tracking
  private isShuttingDown = false;
  private peakConcurrentSessions = 0;
  private totalSessionsCreated = 0;
  private totalSessionsCleaned = 0;
  // Logging configuration
  private readonly LOG_INTERIM_TRANSCRIPTS = process.env.LOG_INTERIM_TRANSCRIPTS === 'true';
  // Test mode flag - prevents cleanup timer from starting
  private readonly isTestMode = process.env.NODE_ENV === 'test';

  constructor() {
    this.apiKey = process.env.DEEPGRAM_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('DEEPGRAM_API_KEY not set, STT service will not function');
    }
    // Don't start cleanup timer in test mode (prevents tests from hanging)
    if (!this.isTestMode) {
      this.startCleanupTimer();
    } else {
      logger.debug('STT service: Test mode detected, cleanup timer disabled');
    }
  }

  /**
   * Create new STT session
   */
  async createSession(sessionId: string, config: STTConfig): Promise<void> {
    try {
      // Phase 3: Check if shutting down
      if (this.isShuttingDown) {
        throw new Error('STT service is shutting down, cannot create new sessions');
      }

      logger.info('Creating STT session', { sessionId, config });

      // Create session object
      const session = sttSessionService.createSession(sessionId, config.connectionId, {
        samplingRate: config.samplingRate,
        language: config.language || 'en-US',
      });

      // Phase 3: Increment session counter
      this.totalSessionsCreated++;

      // Clean up existing connection if any (prevent resource leak)
      if (session.deepgramLiveClient) {
        logger.warn('Closing existing Deepgram connection for session', { sessionId });
        try {
          session.deepgramLiveClient.requestClose();
        } catch (error) {
          logger.error('Error closing existing Deepgram connection', { sessionId, error });
        }
        session.deepgramLiveClient = null;
      }

      // Connect to Deepgram
      const deepgramClient = await this.connectToDeepgram(session);
      session.deepgramLiveClient = deepgramClient;
      // Listeners are now set up inside Open handler (in createDeepgramConnection)

      session.connectionState = 'connected';

      // Phase 3: Check session count monitoring
      this.checkSessionCount();

      logger.info('STT session created', { sessionId });
    } catch (error) {
      logger.error('Failed to create STT session', { sessionId, error });
      // Delete session on failure to prevent resource leak
      sttSessionService.deleteSession(sessionId);
      throw error;
    }
  }

  /**
   * Forward audio chunk to Deepgram
   * BUG FIX: Added reconnection buffering logic
   * FIX: Added ready state check before sending (P1 Issue #1)
   * FIX: Improved type safety - cast to ArrayBufferLike for Deepgram SDK (P1 Issue #2a)
   */
  async forwardAudioChunk(sessionId: string, audioChunk: Uint8Array | Buffer): Promise<void> {
    const session = this.getSessionOrWarn(sessionId, 'forwarding chunk');
    if (!session) return;

    // Update session activity timestamp
    session.touch();

    // Track chunk received
    session.metrics.chunksReceived++;

    try {
      const client = session.deepgramLiveClient;

      // BUG FIX: Buffer audio during reconnection
      if (session.isReconnecting || !client) {
        logger.debug('Buffering audio chunk during reconnection', {
          sessionId,
          chunkSize: audioChunk.length,
          isReconnecting: session.isReconnecting,
          clientExists: !!client,
        });
        session.addToReconnectionBuffer(Buffer.from(audioChunk));
        return;
      }

      // FIX (P1 Issue #1): Check ready state before sending
      const readyState = client.getReadyState();
      if (readyState !== 1) {
        // 1 = OPEN
        logger.warn('Deepgram connection not ready, buffering chunk', {
          sessionId,
          readyState,
          readyStateName: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][readyState] || 'UNKNOWN',
        });
        session.addToReconnectionBuffer(Buffer.from(audioChunk));
        return;
      }

      // Log first chunk details for debugging
      if (session.metrics.chunksForwarded === 0) {
        logger.info('First audio chunk received', {
          sessionId,
          chunkSize: audioChunk.length,
          expectedSize: STT_CONSTANTS.EXPECTED_FIRST_CHUNK_BYTES,
          samplingRate: session.config.samplingRate,
        });
      }

      // FIX (P1 Issue #2a): Improved type safety with proper cast
      // NOTE: The 'as any' cast is necessary due to Deepgram SDK type limitations.
      // - SDK expects: SocketDataLike = string | ArrayBufferLike | Blob
      // - We have: Uint8Array | Buffer (Buffer extends Uint8Array)
      // - TypeScript doesn't recognize Uint8Array as assignable to the union type
      // - Runtime behavior is correct - Deepgram accepts Uint8Array/Buffer
      // - This cast is safe and necessary for proper type checking elsewhere
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.send(audioChunk as any);
      session.metrics.chunksForwarded++;

      // Alternative approaches (new Uint8Array(audioChunk), audioBuffer.buffer, etc.)
      // all fail TypeScript validation or have runtime overhead

      // Log every 100 chunks in production (less verbose)
      if (session.metrics.chunksForwarded % STT_CONSTANTS.CHUNK_LOG_FREQUENCY === 0) {
        logger.debug('Audio chunks forwarded', {
          sessionId,
          totalChunks: session.metrics.chunksForwarded,
        });
      }
    } catch (error) {
      logger.error('Error forwarding audio chunk to Deepgram', { sessionId, error });
      session.metrics.errors++;
    }
  }

  /**
   * Finalize transcript: Send CloseStream, wait for Metadata event, return transcript
   * This supports multiple recording cycles per session (connection stays open)
   */
  async finalizeTranscript(sessionId: string): Promise<string> {
    const session = this.getSessionOrWarn(sessionId, 'finalizing transcript');
    if (!session) return '';

    try {
      // Set finalization flag to prevent reconnection on Close event
      session.isFinalizingTranscript = true;

      // P1 FIX: Clear keepAlive immediately when finalizing
      if (session.keepAliveInterval) {
        clearInterval(session.keepAliveInterval);
        session.keepAliveInterval = undefined;
        logger.debug('Cleared keepAlive interval during finalization', {
          sessionId,
        });
      }

      logger.info('Finalizing transcript for recording cycle', {
        sessionId,
        currentTranscript: session.getFinalTranscript().substring(0, 50) + '...',
      });

      const client = session.deepgramLiveClient;

      // If client is null (e.g. race condition), return accumulated transcript gracefully
      if (!client) {
        logger.warn('Client is null during finalization, returning accumulated transcript', {
          sessionId,
        });
        const finalTranscript = session.getFinalTranscript();
        // Reset state even if client is null
        session.interimTranscript = '';
        session.transcriptSegments = [];
        return finalTranscript;
      }

      // Check ready state before sending
      const readyState = client.getReadyState();
      if (readyState !== 1) {
        logger.warn('Deepgram connection not ready during finalization', {
          sessionId,
          readyState,
        });
        // Don't send CloseStream, but still finalize transcript
        const finalTranscript = session.getFinalTranscript();
        session.interimTranscript = '';
        session.transcriptSegments = [];
        // Reset finalization flag after delay
        this.resetFinalizationFlag(session);
        return finalTranscript;
      }

      // Send CloseStream message to finalize transcript
      try {
        logger.info('Sending CloseStream to finalize transcript', { sessionId });
        client.send(JSON.stringify({ type: 'CloseStream' }));
      } catch (sendError) {
        logger.error('Failed to send CloseStream', { sessionId, error: sendError });
        // Continue with finalization even if send failed
      }

      // Wait for Metadata event (indicates finalization complete)
      // Deepgram fires Metadata event after processing remaining audio
      const metadataWait = this.waitForMetadataEvent(session);

      // Timeout fallback (safety net if Metadata event never fires)
      const timeoutWait = this.createTimeoutFallback(
        session,
        TIMEOUT_CONFIG.METADATA_EVENT_TIMEOUT_MS
      );

      try {
        await Promise.race([metadataWait.promise, timeoutWait.promise]);
        logger.info('Finalization wait completed', {
          sessionId,
          method: session.metrics.finalizationMethod,
        });
      } catch (error) {
        logger.warn('Finalization wait failed', { sessionId, error: (error as Error).message });
      } finally {
        // ALWAYS cleanup both paths
        metadataWait.cleanup();
        timeoutWait.cancel();

        // Reset finalization flag after delay to ensure Close event is processed
        this.resetFinalizationFlag(session);
      }

      const finalTranscript = session.getFinalTranscript();

      // Reset transcript state for next recording
      session.interimTranscript = '';
      session.transcriptSegments = [];
      session.lastTranscriptTime = Date.now();

      logger.info('Transcript finalized and state reset', {
        sessionId,
        transcriptLength: finalTranscript.length,
        connectionState: session.connectionState,
      });

      return finalTranscript;
    } catch (error) {
      logger.error('Error finalizing transcript', { sessionId, error });

      // Reset finalization flag after delay to ensure Close event is processed
      this.resetFinalizationFlag(session);
      return '';
    }
  }

  /**
   * End STT session and close Deepgram connection
   */
  async endSession(sessionId: string): Promise<string> {
    const session = this.getSessionOrWarn(sessionId, 'ending');
    if (!session) return '';

    try {
      logger.info('Closing STT session and Deepgram connection', {
        sessionId,
        duration: session.getDuration(),
        metrics: session.metrics,
      });

      // Get final transcript before cleanup
      const finalTranscript = session.getFinalTranscript();

      // Cleanup session
      sttSessionService.deleteSession(sessionId);
      this.totalSessionsCleaned++;

      return finalTranscript;
    } catch (error) {
      logger.error('Error ending STT session', { sessionId, error });
      sttSessionService.deleteSession(sessionId);
      this.totalSessionsCleaned++;
      return ''; // Return empty string on error for graceful degradation
    }
  }

  /**
   * Check if STT session exists
   */
  hasSession(sessionId: string): boolean {
    return sttSessionService.hasSession(sessionId);
  }

  /**
   * Connect to Deepgram WebSocket with retry logic (Phase 2)
   */
  private async connectToDeepgram(
    session: STTSession,
    mode: 'initial' | 'reconnection' = 'initial'
  ): Promise<ListenLiveClient> {
    const retryDelays =
      mode === 'initial'
        ? RETRY_CONFIG.CONNECTION_RETRY_DELAYS
        : RETRY_CONFIG.RECONNECTION_RETRY_DELAYS;

    const maxAttempts =
      mode === 'initial' ? RETRY_CONFIG.INITIAL_MAX_ATTEMPTS : RETRY_CONFIG.RECONNECT_MAX_ATTEMPTS;

    const timeout =
      mode === 'initial'
        ? TIMEOUT_CONFIG.CONNECTION_TIMEOUT_MS
        : TIMEOUT_CONFIG.RECONNECTION_TIMEOUT_MS;

    logger.debug('Connecting to Deepgram', {
      sessionId: session.sessionId,
      mode,
      maxAttempts,
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Add delay before retry (skip on first attempt)
        if (attempt > 0) {
          const delay = retryDelays[attempt];
          logger.info('Retrying Deepgram connection', {
            sessionId: session.sessionId,
            attempt: attempt + 1,
            maxAttempts,
            delay,
          });
          await this.sleep(delay);
          session.retryCount++;
          session.lastRetryTime = Date.now();
        }

        // Attempt connection
        const connection = await this.createDeepgramConnection(session, timeout);

        logger.info('Deepgram connection established', {
          sessionId: session.sessionId,
          attempt: attempt + 1,
          mode,
        });

        return connection;
      } catch (error) {
        lastError = error as Error;

        // Classify error
        const classified = classifyDeepgramError(lastError);

        logger.warn('Deepgram connection attempt failed', {
          sessionId: session.sessionId,
          attempt: attempt + 1,
          maxAttempts,
          errorType: classified.type,
          errorMessage: classified.message,
          retryable: classified.retryable,
        });

        // If fatal error, don't retry
        if (classified.type === ErrorType.FATAL) {
          logger.error('Fatal Deepgram error, not retrying', {
            sessionId: session.sessionId,
            error: classified.message,
            statusCode: classified.statusCode,
          });
          throw new Error(`Fatal Deepgram error: ${classified.message}`);
        }

        // If last attempt, throw error
        if (attempt === maxAttempts - 1) {
          logger.error('All Deepgram connection attempts failed', {
            sessionId: session.sessionId,
            totalAttempts: maxAttempts,
            lastError: classified.message,
          });
          throw new Error(
            `Failed to connect to Deepgram after ${maxAttempts} attempts: ${classified.message}`
          );
        }

        // Continue to next retry
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError || new Error('Connection failed');
  }

  /**
   * Create Deepgram connection with timeout
   */
  private async createDeepgramConnection(
    session: STTSession,
    timeoutMs: number
  ): Promise<ListenLiveClient> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const client = createClient(this.apiKey);

        // Deepgram configuration
        const config = {
          model: DEEPGRAM_CONFIG.model,
          language: session.config.language,
          smart_format: true,
          interim_results: true,
          endpointing: DEEPGRAM_CONFIG.endpointing,
          utterances: false, // We handle turn management manually
          encoding: 'linear16' as const,
          sample_rate: session.config.samplingRate,
          channels: 1,
        };

        logger.info('🔧 Creating Deepgram connection with config', {
          sessionId: session.sessionId,
          config,
        });

        const connection = client.listen.live(config);

        // Wait for Open event
        connection.on(LiveTranscriptionEvents.Open, () => {
          clearTimeout(timeout);
          logger.info('🎙️ Deepgram connection opened', { sessionId: session.sessionId });

          // Setup listeners AFTER connection is open
          this.setupDeepgramListeners(session, connection);

          // Start keepAlive mechanism
          this.startKeepAlive(session);

          resolve(connection);
        });

        // Handle connection errors
        connection.on(LiveTranscriptionEvents.Error, (error) => {
          clearTimeout(timeout);
          logger.error('Deepgram connection error during setup', {
            sessionId: session.sessionId,
            error,
          });
          reject(error);
        });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Wait for Metadata event to confirm finalization
   */
  private waitForMetadataEvent(session: STTSession): {
    promise: Promise<void>;
    cleanup: () => void;
  } {
    const client = session.deepgramLiveClient;

    if (!client) {
      // If client is null, resolve immediately
      return {
        promise: Promise.resolve(),
        cleanup: () => {},
      };
    }

    let metadataHandler: ((data: DeepgramMetadata) => void) | null = null;

    const promise = new Promise<void>((resolve) => {
      metadataHandler = (_data: DeepgramMetadata) => {
        logger.info('Metadata event received (finalization complete)', {
          sessionId: session.sessionId,
          duration: _data.duration,
          request_id: _data.request_id,
        });

        session.metrics.finalizationMethod = 'event';
        resolve();
      };

      client.on(LiveTranscriptionEvents.Metadata, metadataHandler);
    });

    const cleanup = () => {
      if (metadataHandler && client) {
        client.removeListener(LiveTranscriptionEvents.Metadata, metadataHandler);
      }
    };

    return { promise, cleanup };
  }

  /**
   * Create timeout fallback for finalization
   */
  private createTimeoutFallback(
    session: STTSession,
    timeoutMs: number
  ): {
    promise: Promise<void>;
    cancel: () => void;
  } {
    let timeoutHandle: NodeJS.Timeout | null = null;

    const promise = new Promise<void>((resolve) => {
      timeoutHandle = setTimeout(() => {
        logger.warn('Metadata event timeout, using fallback', {
          sessionId: session.sessionId,
          timeoutMs,
        });

        session.metrics.finalizationMethod = 'timeout';
        resolve();
      }, timeoutMs);
    });

    const cancel = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    };

    return { promise, cancel };
  }

  /**
   * Reset finalization flag after delay
   * Prevents race condition where Close event arrives before flag reset
   */
  private resetFinalizationFlag(
    session: STTSession,
    delayMs: number = TIMEOUT_CONFIG.FINALIZATION_RESET_DELAY_MS
  ): void {
    // Clear any existing timeout
    if (session.finalizationTimeoutHandle) {
      clearTimeout(session.finalizationTimeoutHandle);
    }

    // Set new timeout
    session.finalizationTimeoutHandle = setTimeout(() => {
      session.isFinalizingTranscript = false;
      session.finalizationTimeoutHandle = undefined;
      logger.debug('Finalization flag reset', { sessionId: session.sessionId });
    }, delayMs);
  }

  /**
   * Creates a wrapped event handler with standardized error handling
   *
   * @param eventName - Name of the event for logging
   * @param handler - The actual event handler function
   * @param sessionId - Session ID for logging context
   * @returns Wrapped handler with try-catch and logging
   */
  private createEventHandler<T>(
    eventName: string,
    handler: (data: T) => void | Promise<void>,
    sessionId: string
  ): (data: T) => void {
    return (data: T) => {
      try {
        handler(data);
      } catch (error) {
        logger.error(`Error in ${eventName} event handler`, {
          sessionId,
          error: (error as Error).message,
          stack: (error as Error).stack,
        });
      }
    };
  }

  /**
   * Setup Deepgram event listeners (Phase 2: Enhanced with reconnection)
   * CRITICAL FIX: Accepts connection directly instead of checking null session.deepgramLiveClient
   */
  private setupDeepgramListeners(session: STTSession, connection: ListenLiveClient): void {
    if (!connection) {
      logger.error('❌ Cannot setup listeners - connection is null', { sessionId: session.sessionId });
      return;
    }

    logger.info('📋 Setting up Deepgram event listeners', {
      sessionId: session.sessionId,
      events: ['Transcript (Results)', 'Error', 'Close', 'Metadata', 'SpeechStarted', 'UtteranceEnd'],
    });

    // Transcript events
    connection.on(
      LiveTranscriptionEvents.Transcript,
      this.createEventHandler<DeepgramTranscriptResponse>(
        'Transcript',
        (data) => {
          logger.info('📥 Transcript event received from Deepgram', {
            sessionId: session.sessionId,
            hasData: !!data,
            isFinal: data?.is_final,
          });
          this.handleTranscriptUpdate(session.sessionId, data);
        },
        session.sessionId
      )
    );

    logger.info('✅ Registered Transcript listener', { sessionId: session.sessionId });

    // Error events
    connection.on(
      LiveTranscriptionEvents.Error,
      this.createEventHandler<Error>(
        'Error',
        (error) => {
          logger.error('❌ Deepgram error event', { sessionId: session.sessionId, error });
          this.handleDeepgramError(session.sessionId, error);
        },
        session.sessionId
      )
    );

    logger.info('✅ Registered Error listener', { sessionId: session.sessionId });

    // Generic error handler as safety net (prevents unhandled errors from crashing)
    connection.on(
      'error',
      this.createEventHandler<Error>(
        'GenericError',
        (error) => {
          logger.error('Deepgram connection error event (generic handler)', {
            sessionId: session.sessionId,
            error: error.message,
          });
        },
        session.sessionId
      )
    );

    // Close events
    connection.on(
      LiveTranscriptionEvents.Close,
      this.createEventHandler<unknown>(
        'Close',
        () => {
          logger.info('⚠️ Deepgram connection closed', {
            sessionId: session.sessionId,
            isFinalizingTranscript: session.isFinalizingTranscript,
          });

          // If we're finalizing, this is expected - don't reconnect
          if (session.isFinalizingTranscript) {
            logger.info('Close event during finalization - expected, not reconnecting', {
              sessionId: session.sessionId,
            });
            return;
          }

          // Otherwise, this is unexpected - attempt reconnection
          logger.warn('Unexpected Close event - will attempt reconnection', {
            sessionId: session.sessionId,
          });
          this.handleUnexpectedClose(session.sessionId);
        },
        session.sessionId
      )
    );

    logger.info('✅ Registered Close listener', { sessionId: session.sessionId });

    // Metadata events (finalization confirmation)
    // Note: Listener is added dynamically during finalizeTranscript()

    logger.info('✅ All Deepgram event listeners registered', { sessionId: session.sessionId });
  }

  /**
   * Handle transcript updates from Deepgram
   */
  private handleTranscriptUpdate(sessionId: string, data: DeepgramTranscriptResponse): void {
    const session = this.getSessionOrWarn(sessionId, 'handling transcript');
    if (!session) return;

    try {
      // Update last activity time
      session.lastTranscriptTime = Date.now();

      // Extract transcript from data
      const alternatives = data.channel?.alternatives || [];
      if (alternatives.length === 0) {
        logger.debug('No transcript alternatives in response', { sessionId });
        return;
      }

      const alternative = alternatives[0];
      const transcript = alternative.transcript || '';
      const confidence = alternative.confidence || 0;
      const isFinal = data.is_final || false;

      // Skip empty transcripts
      if (!transcript.trim()) {
        return;
      }

      // Add transcript to session
      session.addTranscript(transcript, confidence, isFinal);
      session.metrics.transcriptsReceived++;

      // Log based on type (less verbose in production)
      if (isFinal || this.LOG_INTERIM_TRANSCRIPTS) {
        logger.info('Transcript update', {
          sessionId,
          transcript: transcript.substring(0, 100),
          confidence,
          isFinal,
        });
      }

      // MVP: TTS synthesis is triggered manually on audio.input.end (user clicks "Stop recording")
      // Automatic synthesis on transcript.final is planned for Phase 1 (future enhancement)
      // This ensures user has explicit control during MVP development
      if (isFinal) {
        logger.debug('Final transcript received (not auto-triggering TTS in MVP)', {
          sessionId,
          transcript: transcript.substring(0, 50) + '...',
        });
      }
    } catch (error) {
      logger.error('Error processing transcript update', { sessionId, error });
      session.metrics.errors++;
    }
  }

  /**
   * Handle Deepgram errors
   * FIX (P1 Issue #2b): Use direct type check instead of isFatalError() with 'as any'
   */
  private handleDeepgramError(sessionId: string, error: Error): void {
    const session = this.getSessionOrWarn(sessionId, 'handling error');
    if (!session) return;

    try {
      // Classify error
      const classified = classifyDeepgramError(error);

      session.metrics.errors++;

      logger.error('Deepgram error', {
        sessionId,
        errorType: classified.type,
        errorMessage: classified.message,
        statusCode: classified.statusCode,
        retryable: classified.retryable,
      });

      // FIX (P1 Issue #2b): Use direct type check instead of isFatalError(classified as any)
      // This is simpler and more type-safe since we already have the classified error
      if (classified.type === ErrorType.FATAL) {
        logger.error('Fatal Deepgram error, closing connection', { sessionId });
        this.handleUnexpectedClose(sessionId);
      }
    } catch (handlerError) {
      logger.error('Error in Deepgram error handler', { sessionId, error: handlerError });
    }
  }

  /**
   * Handle unexpected connection close (Phase 2: Reconnection)
   */
  private async handleUnexpectedClose(sessionId: string): Promise<void> {
    const session = this.getSessionOrWarn(sessionId, 'handling unexpected close');
    if (!session) return;

    // Prevent multiple simultaneous reconnection attempts
    if (session.isReconnecting) {
      logger.warn('Reconnection already in progress', { sessionId });
      return;
    }

    try {
      // If finalizing, don't reconnect
      if (session.isFinalizingTranscript) {
        logger.info('Close during finalization - not reconnecting', { sessionId });
        return;
      }

      session.isReconnecting = true;
      session.connectionState = 'disconnected';
      session.metrics.reconnections++;

      const startTime = Date.now();

      logger.info('Attempting reconnection', { sessionId });

      // Attempt reconnection
      const newConnection = await this.connectToDeepgram(session, 'reconnection');

      // Replace connection
      session.deepgramLiveClient = newConnection;
      session.connectionState = 'connected';
      session.isReconnecting = false;
      session.metrics.successfulReconnections++;

      const downtime = Date.now() - startTime;
      session.metrics.totalDowntimeMs += downtime;

      logger.info('Reconnection successful', {
        sessionId,
        downtimeMs: downtime,
        bufferedChunks: session.getReconnectionBufferSize(),
      });

      // Flush buffered chunks
      const bufferedChunks = [...session.reconnectionBuffer];
      for (const chunk of bufferedChunks) {
        await this.forwardAudioChunk(sessionId, chunk);
      }
      session.clearReconnectionBuffer();
    } catch (error) {
      session.isReconnecting = false;
      session.metrics.failedReconnections++;

      logger.error('Reconnection failed', { sessionId, error });

      // Update connection state to disconnected
      session.connectionState = 'disconnected';

      // Clean up Deepgram client
      if (session.deepgramLiveClient) {
        try {
          session.deepgramLiveClient.requestClose();
        } catch (_closeError) {
          // Ignore close errors
        }
        session.deepgramLiveClient = null; // Clear reference
      }

      // Clear buffered chunks (data loss inevitable)
      session.clearReconnectionBuffer();

      // Graceful degradation: session will be cleaned up by cleanup timer
      // or explicitly by endSession call
    }
  }

  /**
   * Start cleanup timer (Phase 3)
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, TIMEOUT_CONFIG.CLEANUP_INTERVAL_MS);

    logger.info('STT cleanup timer started', {
      intervalMs: TIMEOUT_CONFIG.CLEANUP_INTERVAL_MS,
    });
  }

  /**
   * Perform cleanup of stale sessions (Phase 3)
   */
  private performCleanup(): void {
    try {
      const now = Date.now();
      const sessions = sttSessionService.getAllSessions();

      logger.info('Cleaning up all STT sessions', { count: sessions.length });

      for (const session of sessions) {
        const idle = now - session.lastTranscriptTime;
        const duration = session.getDuration();

        // Cleanup conditions:
        // 1. Session idle for too long (no transcripts)
        // 2. Session duration exceeded max
        // 3. Connection in bad state (disconnected and not reconnecting)
        const isIdle = idle > TIMEOUT_CONFIG.SESSION_IDLE_TIMEOUT_MS;
        const isTooLong = duration > TIMEOUT_CONFIG.SESSION_TIMEOUT_MS;
        const isBadState =
          session.connectionState === 'disconnected' && !session.isReconnecting;

        if (isIdle || isTooLong || isBadState) {
          logger.info('Cleaning up stale session', {
            sessionId: session.sessionId,
            reason: isIdle ? 'idle' : isTooLong ? 'duration' : 'bad_state',
            idleMs: idle,
            durationMs: duration,
            connectionState: session.connectionState,
          });

          this.endSession(session.sessionId);
        }
      }
    } catch (error) {
      logger.error('Error during cleanup', { error });
    }
  }

  /**
   * Start keepAlive mechanism (Phase 3: Deepgram recommended 8-10s)
   * P1 FIX: Added defensive checks before sending keepAlive
   */
  private startKeepAlive(session: STTSession): void {
    // Clear existing keepAlive if any
    if (session.keepAliveInterval) {
      clearInterval(session.keepAliveInterval);
    }

    session.keepAliveInterval = setInterval(() => {
      try {
        // P1 FIX: Check finalization state first
        if (session.isFinalizingTranscript) {
          logger.debug('Skipping keepAlive - session is finalizing', {
            sessionId: session.sessionId,
          });
          return;
        }

        const client = session.deepgramLiveClient;
        if (!client) {
          logger.debug('Skipping keepAlive - no client', {
            sessionId: session.sessionId,
          });
          return;
        }

        // P1 FIX: Check connection readyState before sending
        const readyState = client.getReadyState();
        if (readyState !== 1) {
          // 1 = OPEN
          logger.debug('Skipping keepAlive - connection not open', {
            sessionId: session.sessionId,
            readyState,
            readyStateName: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][readyState] || 'UNKNOWN',
          });
          return;
        }

        client.keepAlive();
        logger.debug('Sent keepAlive to Deepgram', { sessionId: session.sessionId });
      } catch (error) {
        logger.error('Error sending keepAlive', { sessionId: session.sessionId, error });
      }
    }, STT_CONSTANTS.KEEPALIVE_INTERVAL_MS);
  }

  /**
   * Check session count and update peak (Phase 3)
   */
  private checkSessionCount(): void {
    const currentCount = sttSessionService.getSessionCount();
    if (currentCount > this.peakConcurrentSessions) {
      this.peakConcurrentSessions = currentCount;
    }

    if (currentCount > TIMEOUT_CONFIG.MAX_SESSIONS) {
      logger.warn('Session count exceeds maximum', {
        current: currentCount,
        max: TIMEOUT_CONFIG.MAX_SESSIONS,
      });
    }
  }

  /**
   * Get session or log warning
   */
  private getSessionOrWarn(sessionId: string, operation: string): STTSession | null {
    const session = sttSessionService.getSession(sessionId);
    if (!session) {
      logger.warn(`Session not found for ${operation}`, { sessionId });
      return null;
    }
    return session;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get service-level metrics (Phase 3)
   */
  getMetrics(): STTServiceMetrics {
    // Update peak sessions count before returning metrics
    this.checkSessionCount();

    const sessions = sttSessionService.getAllSessions();

    // Aggregate metrics from all sessions
    const aggregated = sessions.reduce(
      (acc, session) => ({
        chunksForwarded: acc.chunksForwarded + session.metrics.chunksForwarded,
        transcriptsReceived: acc.transcriptsReceived + session.metrics.transcriptsReceived,
        errors: acc.errors + session.metrics.errors,
        reconnections: acc.reconnections + session.metrics.reconnections,
        successfulReconnections: acc.successfulReconnections + session.metrics.successfulReconnections,
        failedReconnections: acc.failedReconnections + session.metrics.failedReconnections,
        totalDuration: acc.totalDuration + session.getDuration(),
      }),
      {
        chunksForwarded: 0,
        transcriptsReceived: 0,
        errors: 0,
        reconnections: 0,
        successfulReconnections: 0,
        failedReconnections: 0,
        totalDuration: 0,
      }
    );

    return {
      activeSessions: sttSessionService.getSessionCount(),
      totalChunksForwarded: aggregated.chunksForwarded,
      totalTranscriptsReceived: aggregated.transcriptsReceived,
      totalErrors: aggregated.errors,
      totalReconnections: aggregated.reconnections,
      totalSuccessfulReconnections: aggregated.successfulReconnections,
      totalFailedReconnections: aggregated.failedReconnections,
      peakConcurrentSessions: this.peakConcurrentSessions,
      totalSessionsCreated: this.totalSessionsCreated,
      totalSessionsCleaned: this.totalSessionsCleaned,
      averageSessionDurationMs: sessions.length > 0 ? aggregated.totalDuration / sessions.length : 0,
      memoryUsageEstimateMB: this.calculateTotalMemoryUsage() / (1024 * 1024),
    };
  }

  /**
   * Calculate total memory usage across all sessions
   */
  private calculateTotalMemoryUsage(): number {
    const sessions = sttSessionService.getAllSessions();
    return sessions.reduce((total, session) => {
      // Estimate: transcript length + buffer size
      const transcriptSize = session.getAccumulatedTranscriptLength() * 2; // ~2 bytes per char
      const bufferSize = session.getReconnectionBufferSize();
      return total + transcriptSize + bufferSize;
    }, 0);
  }

  /**
   * Get session-specific metrics
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
      successfulReconnections: session.metrics.successfulReconnections,
      failedReconnections: session.metrics.failedReconnections,
      totalDowntimeMs: session.metrics.totalDowntimeMs,
      bufferedChunksDuringReconnection: session.metrics.bufferedChunksDuringReconnection,
      errors: session.metrics.errors,
      finalTranscriptLength: session.getAccumulatedTranscriptLength(),
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
   * Graceful shutdown (Phase 3: Enhanced with timeout handling)
   */
  async shutdown(options: { restart?: boolean } = {}): Promise<void> {
    logger.info('STT service shutdown initiated', {
      activeSessions: sttSessionService.getSessionCount(),
    });

    // 1. Mark service as shutting down
    this.isShuttingDown = true;

    // 2. Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // 3. Get all active sessions
    const activeSessions = sttSessionService.getAllSessions();

    // 4. Close all sessions with timeout per session
    const shutdownPromises = activeSessions.map(async (session) => {
      try {
        const timeoutPromise = new Promise<string>((_resolve, reject) =>
          setTimeout(
            () => reject(new Error('Shutdown timeout')),
            TIMEOUT_CONFIG.SHUTDOWN_TIMEOUT_PER_SESSION_MS
          )
        );
        await Promise.race([this.endSession(session.sessionId), timeoutPromise]);
      } catch (error) {
        logger.error('Failed to close session during shutdown', {
          sessionId: session.sessionId,
          error,
        });
        // Force cleanup
        try {
          sttSessionService.deleteSession(session.sessionId);
          this.totalSessionsCleaned++;
        } catch (_cleanupError) {
          // Ignore cleanup errors during shutdown
        }
      }
    });

    await Promise.allSettled(shutdownPromises);

    // 5. Force cleanup any remaining sessions
    const remainingSessions = sttSessionService.getSessionCount();
    if (remainingSessions > 0) {
      logger.warn('Force cleaning remaining sessions', { count: remainingSessions });
      const allRemaining = sttSessionService.getAllSessions();
      for (const session of allRemaining) {
        try {
          await session.cleanup();
          sttSessionService.deleteSession(session.sessionId);
          this.totalSessionsCleaned++;
        } catch (_error) {
          // Ignore errors during force cleanup
        }
      }
    }

    // 6. Only restart if explicitly requested (for tests)
    if (options.restart) {
      logger.info('Restarting service (test mode)');
      this.isShuttingDown = false;
      // Don't restart cleanup timer in test mode
      if (!this.isTestMode) {
        this.startCleanupTimer();
      }
    } else {
      logger.info('Service shutdown complete (production mode)');
      // Stay shut down - don't restart
    }
  }
}

// Export singleton instance
export const sttService = new STTService();
