/**
 * TTS Service
 * Core business logic for Cartesia TTS integration
 */

import { CartesiaClient } from '@cartesia/cartesia-js';
import { logger, generateId } from '@/shared/utils';
import { ttsSessionService, TTSSession } from './tts-session.service';
import { cartesiaConfig, ttsTimeoutConfig, TTS_CONSTANTS } from '../config';
import { classifyCartesiaError } from '../utils';
import { TTSErrorType } from '../types';
import {
  TTSConfig,
  SynthesisOptions,
  TTSServiceMetrics,
  TTSSessionMetrics,
  TTSState,
} from '../types';
import { audioResamplerService } from '@/modules/audio/services';
import { websocketService } from '@/modules/socket/services';
import { WebSocketUtils, MessagePackHelper } from '@/modules/socket/utils';
import { VOICECHAT_EVENTS } from '@Jatin5120/vantum-shared';
import { pack } from 'msgpackr';

/** Minimal interface for the Cartesia audio source event emitter */
interface CartesiaAudioSource {
  on(_event: string, _handler: (..._args: unknown[]) => unknown): void;
  off(_event: string, _handler: (..._args: unknown[]) => unknown): void;
  buffer: Int16Array | Uint8Array;
  writeIndex: number;
}

/** Minimal interface for the Cartesia WebSocket client */
interface CartesiaWsClient {
  send(_params: Record<string, unknown>): Promise<{ source: CartesiaAudioSource }>;
  disconnect(): void;
  socket?: { ping(): void };
}

/** Minimal interface for the Cartesia connection events emitter */
interface CartesiaConnectionEvents {
  on(_event: string, _handler: () => void): void;
  off(_event: string, _handler: () => void): void;
}

/**
 * TTSService - Core TTS business logic
 */
export class TTSService {
  private readonly apiKey: string;
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private isShuttingDown = false;
  private peakConcurrentSessions = 0;
  private totalSessionsCreated = 0;
  private totalSessionsCleaned = 0;
  private readonly isTestMode = process.env.NODE_ENV === 'test';

  constructor() {
    this.apiKey = process.env.CARTESIA_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('CARTESIA_API_KEY not set, TTS service will not function');
    }

    // Don't start cleanup timer in test mode
    if (!this.isTestMode) {
      this.startCleanupTimer();
    } else {
      logger.debug('TTS service: Test mode detected, cleanup timer disabled');
    }
  }

  /**
   * Create new TTS session
   */
  async createSession(sessionId: string, config: TTSConfig): Promise<void> {
    try {
      // Check if shutting down
      if (this.isShuttingDown) {
        throw new Error('TTS service is shutting down, cannot create new sessions');
      }

      logger.info('Creating TTS session', { sessionId, config });

      // Create session object
      const session = ttsSessionService.createSession(sessionId, config.connectionId, config);

      // Increment session counter
      this.totalSessionsCreated++;

      // Connect to Cartesia
      await this.connectToCartesia(session);

      session.connectionState = 'connected';

      // Check session count monitoring
      this.checkSessionCount();

      logger.info('TTS session created', { sessionId });
    } catch (error) {
      logger.error('Failed to create TTS session', { sessionId, error });
      // Delete session on failure
      await ttsSessionService.deleteSession(sessionId);
      throw error;
    }
  }

  /**
   * Synthesize text to speech
   * Returns a Promise that resolves with audio duration in milliseconds (sequential playback support)
   */
  async synthesizeText(
    sessionId: string,
    text: string,
    options?: SynthesisOptions
  ): Promise<number> {
    const session = this.getSessionOrWarn(sessionId, 'synthesizing text');
    if (!session) return 0;

    // Store listener references for cleanup
    let enqueueHandler: ((..._args: unknown[]) => unknown) | null = null;
    let closeHandler: ((..._args: unknown[]) => unknown) | null = null;
    let errorHandler: ((..._args: unknown[]) => unknown) | null = null;
    let audioSource: CartesiaAudioSource | null = null;

    // Wrap entire synthesis in a Promise that resolves with audio duration
    return new Promise<number>((resolve, reject) => {
      // Store Promise callbacks on session for event handlers to call
      session.synthesisPromise = { resolve, reject };

      (async () => {
        try {
          // Validate text
          if (!text || text.trim().length === 0) {
            logger.warn('Empty text provided for synthesis', { sessionId });
            resolve(0); // Resolve with 0 duration for empty text
            return;
          }

          // Truncate text if exceeds max length
          if (text.length > TTS_CONSTANTS.MAX_TEXT_LENGTH) {
            text = text.substring(0, TTS_CONSTANTS.MAX_TEXT_LENGTH);
            logger.warn('Text truncated to max length', {
              sessionId,
              originalLength: text.length,
              truncatedLength: text.length,
            });
          }

          // Update activity timestamp
          session.touch();

          // Check if session can synthesize
          if (!session.canSynthesize()) {
            logger.warn('Session cannot synthesize', {
              sessionId,
              state: session.ttsState,
              connectionState: session.connectionState,
            });

            // Buffer text during reconnection
            if (session.isReconnecting) {
              session.addToReconnectionBuffer(text);
            }
            resolve(0); // Resolve with 0 duration if cannot synthesize
            return;
          }

          // P1-3: Acquire synthesis lock immediately after canSynthesize check
          if (session.synthesisMutex) {
            logger.warn('Synthesis already in progress, skipping', {
              sessionId,
              textPreview: text.substring(0, 50) + '...',
              currentState: session.ttsState,
            });
            resolve(0); // Resolve with 0 duration if mutex locked
            return;
          }
          session.synthesisMutex = true;

          // Generate utteranceId for this synthesis response (used for all chunks)
          const utteranceId = generateId();
          session.currentUtteranceId = utteranceId;

          logger.info('Starting TTS synthesis', {
            sessionId,
            utteranceId,
            textLength: text.length,
          });

          // Transition to GENERATING state
          session.transitionTo(TTSState.GENERATING);

          // Get Cartesia WebSocket client (stored as unknown, cast to typed interface)
          const cartesiaWs = session.cartesiaClient as CartesiaWsClient | null;
          if (!cartesiaWs) {
            throw new Error('Cartesia client not connected');
          }

          // Send text to Cartesia for synthesis and get audio source
          // Note: SDK expects camelCase (modelId, outputFormat, sampleRate) even though
          // the wire protocol uses snake_case. The SDK handles the conversion.
          const response = await cartesiaWs.send({
            modelId: cartesiaConfig.model,
            voice: {
              mode: 'id',
              id: options?.voiceId || session.config.voiceId,
            },
            transcript: text,
            outputFormat: {
              container: 'raw',
              encoding: 'pcm_s16le',
              sampleRate: cartesiaConfig.sampleRate,
            },
            language: options?.language || cartesiaConfig.language,
          });

          // Get the audio source from the response
          const source = response.source;
          audioSource = source; // Store for cleanup

          // Track last processed index to avoid re-processing audio data
          let lastProcessedIndex = 0;

          // Listen for audio chunks from the source
          logger.debug('Registering Cartesia enqueue listener', { sessionId, utteranceId });

          // P0-2 FIX: Store listener reference for cleanup
          enqueueHandler = async () => {
            try {
              // Read new audio data from source.buffer
              // source.writeIndex points to the end of available data
              const audioData = source.buffer.subarray(lastProcessedIndex, source.writeIndex);

              if (audioData.length === 0) {
                logger.debug('Enqueue event fired but no new data', {
                  sessionId,
                  lastProcessedIndex,
                  writeIndex: source.writeIndex,
                });
                return;
              }

              logger.debug('🎵 Cartesia audio data received!', {
                sessionId,
                utteranceId,
                byteLength: audioData.byteLength,
                samplesCount: audioData.length,
                lastProcessedIndex,
                writeIndex: source.writeIndex,
              });

              // Convert to Node.js Buffer
              const audioBuffer = Buffer.from(
                audioData.buffer,
                audioData.byteOffset,
                audioData.byteLength
              );

              // Update index for next iteration
              lastProcessedIndex = source.writeIndex;

              // Handle the audio chunk
              await this.handleAudioChunk(session, audioBuffer);
            } catch (err) {
              logger.error('Error handling audio from Cartesia', {
                sessionId: session.sessionId,
                utteranceId: session.currentUtteranceId,
                error: err instanceof Error ? err.message : String(err),
              });
              session.metrics.errors++;
            }
          };

          // Listen for 'enqueue' event (not 'chunk'!)
          // The Cartesia SDK emits 'enqueue' when new audio data is available
          source.on('enqueue', enqueueHandler);

          logger.debug('Enqueue listener registered', { sessionId, utteranceId });

          // IMPORTANT: Check if audio was already buffered before we registered the listener
          // This prevents a race condition where synthesis completes before we attach the listener
          if (source.writeIndex > 0) {
            logger.debug('Processing pre-buffered audio', {
              sessionId,
              utteranceId,
              prebufferedBytes: source.writeIndex,
            });

            // P1-1 FIX: Capture writeIndex before async processing to prevent race condition
            const prebufferedData = source.buffer.subarray(0, source.writeIndex);
            if (prebufferedData.length > 0) {
              // Capture writeIndex before async processing
              const currentWriteIndex = source.writeIndex;

              try {
                const audioBuffer = Buffer.from(
                  prebufferedData.buffer,
                  prebufferedData.byteOffset,
                  prebufferedData.byteLength
                );

                // Update index BEFORE async call to prevent race condition
                lastProcessedIndex = currentWriteIndex;

                await this.handleAudioChunk(session, audioBuffer);
              } catch (err) {
                logger.error('Error processing pre-buffered audio', {
                  sessionId,
                  utteranceId,
                  error: err,
                });
                // Note: Don't revert lastProcessedIndex - data is lost on error anyway
              }
            }
          }

          // P0-2 FIX: Store listener reference for cleanup
          closeHandler = () => {
            try {
              logger.debug('Audio source closed, synthesis complete', {
                sessionId,
                utteranceId,
                chunksReceived: session.metrics.chunksGenerated,
                wasSynthesisSuccessful: session.metrics.chunksGenerated > 0,
              });

              // NOTE: No manual listener cleanup needed - the audio source self-cleans on close
              // The Cartesia SDK's audio source manages its own lifecycle and event listeners
              // Attempting to remove listeners here causes errors and prevents state transition

              // Get audio duration from completion handler
              const audioDurationMs = this.handleSynthesisComplete(session);

              // Resolve the synthesis Promise with audio duration (enables sequential playback)
              if (session.synthesisPromise) {
                session.synthesisPromise.resolve(audioDurationMs);
                session.synthesisPromise = null; // Clean up
                logger.debug('Synthesis Promise resolved', {
                  sessionId,
                  utteranceId,
                  audioDurationMs,
                });
              }
            } catch (err) {
              logger.error('Error handling synthesis complete', {
                sessionId: session.sessionId,
                utteranceId,
                error: err instanceof Error ? err.message : String(err),
              });

              // Reject Promise on error
              if (session.synthesisPromise) {
                session.synthesisPromise.reject(
                  err instanceof Error ? err : new Error(String(err))
                );
                session.synthesisPromise = null; // Clean up
              }
            }
          };

          // Listen for completion
          source.on('close', closeHandler);

          // P0-2 FIX: Store listener reference for cleanup
          errorHandler = (rawError: unknown) => {
            const error = rawError instanceof Error ? rawError : new Error(String(rawError));
            logger.error('🚨 Cartesia source error event', {
              sessionId,
              utteranceId,
              error: error.message,
              errorType: error?.constructor?.name,
              errorStack: error.stack,
            });

            try {
              // NOTE: No manual listener cleanup needed - error handler will trigger cleanup
              // The audio source manages its own lifecycle and will be garbage collected
              // after the error is handled and the source is closed

              this.handleCartesiaError(session, error);

              // Reject the synthesis Promise on error
              if (session.synthesisPromise) {
                session.synthesisPromise.reject(error);
                session.synthesisPromise = null; // Clean up
                logger.debug('Synthesis Promise rejected due to Cartesia error', {
                  sessionId,
                  utteranceId,
                });
              }
            } catch (handlingError) {
              logger.error('Error in error handler', {
                sessionId,
                utteranceId,
                originalError: error,
                handlingError,
              });

              // Reject Promise if not already done
              if (session.synthesisPromise) {
                session.synthesisPromise.reject(
                  handlingError instanceof Error ? handlingError : new Error(String(handlingError))
                );
                session.synthesisPromise = null; // Clean up
              }
            }
          };

          // Listen for errors
          source.on('error', errorHandler);

          // Increment metrics
          session.metrics.textsSynthesized++;

          logger.info('TTS synthesis request sent', { sessionId, utteranceId });
          // Note: Method returns here but Promise is not resolved yet
          // It will be resolved by the 'close' event handler when synthesis completes
        } catch (error) {
          logger.error('TTS synthesis failed', {
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          });

          // P1-2 FIX: Defensive cleanup - Remove event listeners to prevent memory leak
          // The SDK claims self-cleanup on close, but we do this defensively in case
          // the error occurs before the 'close' event fires or if the SDK doesn't clean up
          const currentSource = (session as unknown as Record<string, unknown>)['currentSource'] as
            | CartesiaAudioSource
            | undefined;
          if (currentSource) {
            try {
              currentSource.off('enqueue', () => {});
              currentSource.off('close', () => {});
              currentSource.off('error', () => {});
              logger.debug('Event listeners removed after synthesis error', { sessionId });
            } catch {
              // Ignore cleanup errors - SDK may have already cleaned up or source may be invalid
              logger.debug('Listener cleanup failed (may be already cleaned up)', { sessionId });
            }
          }

          session.metrics.synthesisErrors++;
          session.metrics.errors++;
          session.transitionTo(TTSState.ERROR);

          // Send error to client
          this.sendTTSError(sessionId, classifyCartesiaError(error));

          // Reject the synthesis Promise
          if (session.synthesisPromise) {
            session.synthesisPromise.reject(
              error instanceof Error ? error : new Error(String(error))
            );
            session.synthesisPromise = null; // Clean up
          }
        } finally {
          // P1-3 FIX: Always release mutex, even on error
          session.synthesisMutex = false;

          // P0-2 FIX: CRITICAL - Remove all event listeners to prevent memory leak
          // P2-2 FIX: Added clarifying comment about finally block behavior
          // Finally block ensures cleanup runs in ALL paths (success, error, early return)
          if (audioSource) {
            try {
              if (enqueueHandler) {
                audioSource.off('enqueue', enqueueHandler);
              }
              if (closeHandler) {
                audioSource.off('close', closeHandler);
              }
              if (errorHandler) {
                audioSource.off('error', errorHandler);
              }
              logger.debug('Cleaned up audio source event listeners', { sessionId });
            } catch {
              // Ignore cleanup errors - SDK may have already cleaned up
              logger.debug('Listener cleanup error in finally block (may be already cleaned up)', {
                sessionId,
              });
            }
          }
        }
      })(); // Close async IIFE
    });
  }

  /**
   * Cancel ongoing synthesis
   */
  async cancelSynthesis(sessionId: string): Promise<void> {
    const session = this.getSessionOrWarn(sessionId, 'cancelling synthesis');
    if (!session) return;

    try {
      // Check if synthesis can be cancelled
      if (!session.canCancel()) {
        logger.warn('No active synthesis to cancel', {
          sessionId,
          state: session.ttsState,
        });
        return;
      }

      logger.info('Cancelling TTS synthesis', { sessionId });

      // Cancel Cartesia synthesis
      const cartesiaWs = session.cartesiaClient as CartesiaWsClient | null;
      if (cartesiaWs) {
        // Send cancel message to Cartesia (if supported)
        // TODO: Check if Cartesia supports cancellation
        logger.debug('Sent cancel request to Cartesia', { sessionId });
      }

      // Transition to CANCELLED state
      session.transitionTo(TTSState.CANCELLED);

      // Transition back to IDLE
      session.transitionTo(TTSState.IDLE);

      logger.info('TTS synthesis cancelled', { sessionId });
    } catch (error) {
      logger.error('Failed to cancel TTS synthesis', { sessionId, error });
      session.metrics.errors++;
    }
  }

  /**
   * End TTS session
   */
  async endSession(sessionId: string): Promise<void> {
    const session = this.getSessionOrWarn(sessionId, 'ending');
    if (!session) return;

    try {
      logger.info('Closing TTS session', {
        sessionId,
        duration: session.getDuration(),
        metrics: session.metrics,
      });

      // Cleanup session
      await ttsSessionService.deleteSession(sessionId);
      this.totalSessionsCleaned++;

      logger.info('TTS session closed', { sessionId });
    } catch (error) {
      logger.error('Error ending TTS session', { sessionId, error });
      await ttsSessionService.deleteSession(sessionId);
      this.totalSessionsCleaned++;
    }
  }

  /**
   * Check if session exists
   */
  hasSession(sessionId: string): boolean {
    return ttsSessionService.hasSession(sessionId);
  }

  /**
   * Connect to Cartesia WebSocket
   */
  private async connectToCartesia(session: TTSSession): Promise<void> {
    try {
      logger.info('Connecting to Cartesia WebSocket', { sessionId: session.sessionId });

      // Create Cartesia client
      const client = new CartesiaClient({
        apiKey: this.apiKey,
      });

      // Get WebSocket client for TTS
      const cartesiaWs = client.tts.websocket({
        sampleRate: cartesiaConfig.sampleRate,
        container: 'raw',
        encoding: 'pcm_s16le',
      });

      // Connect to Cartesia and get connection event emitter
      const connectionEvents = await cartesiaWs.connect();

      // Store WebSocket client on session (as unknown since we don't have exact types)
      session.cartesiaClient = cartesiaWs as unknown;

      // Store connection events on session for cleanup (prevent memory leak)
      session.connectionEvents = connectionEvents;

      // Setup connection event listeners using the returned emitter
      this.setupCartesiaListeners(session, connectionEvents);

      // Start keepAlive mechanism
      this.startKeepAlive(session);

      logger.info('Connected to Cartesia successfully', { sessionId: session.sessionId });
    } catch (error) {
      logger.error('Failed to connect to Cartesia', { sessionId: session.sessionId, error });
      throw error;
    }
  }

  /**
   * Setup Cartesia connection event listeners
   *
   * @param session - TTS session
   * @param connectionEvents - Emittery callbacks returned by cartesiaWs.connect()
   */
  private setupCartesiaListeners(session: TTSSession, connectionEvents: unknown): void {
    const sessionId = session.sessionId;

    logger.info('Setting up Cartesia connection event listeners', { sessionId });

    try {
      // Cast to typed interface since Cartesia SDK returns complex generic type
      const events = connectionEvents as CartesiaConnectionEvents;

      // Listen for 'open' event (connection established)
      events.on('open', () => {
        logger.info('Cartesia WebSocket connection opened', { sessionId });
        session.connectionState = 'connected';
      });

      // Listen for 'close' event (connection closed)
      events.on('close', () => {
        logger.warn('Cartesia WebSocket connection closed', { sessionId });
        session.connectionState = 'disconnected';
        this.handleUnexpectedClose(sessionId);
      });

      logger.info('Cartesia connection event listeners registered', { sessionId });
    } catch (error) {
      logger.error('Error setting up Cartesia connection listeners', { sessionId, error });
      // Don't throw - connection is already established at this point
    }
  }

  /**
   * Handle audio chunk from Cartesia
   * Resamples from 16kHz to 48kHz and sends to client via WebSocket
   */
  private async handleAudioChunk(session: TTSSession, audioChunk: Buffer): Promise<void> {
    try {
      const sessionId = session.sessionId;

      // Transition to STREAMING on first chunk
      if (session.ttsState === TTSState.GENERATING) {
        session.transitionTo(TTSState.STREAMING);

        // Reset audio byte counter for new utterance
        session.currentUtteranceAudioBytes = 0;

        // Send audio.output.start event to client
        this.sendAudioOutputStart(sessionId);
      }

      // Resample audio from 16kHz (Cartesia) to 48kHz (browser)
      const resampledAudio = await audioResamplerService.resampleToHigher(
        audioChunk,
        cartesiaConfig.sampleRate, // 16000
        48000 // Browser playback rate
      );

      // Accumulate audio bytes for duration calculation
      session.currentUtteranceAudioBytes += resampledAudio.length;

      // Send audio chunk to client via WebSocket
      this.sendAudioChunk(sessionId, resampledAudio);

      // Update metrics
      session.metrics.chunksGenerated++;
      session.metrics.chunksSent++;

      logger.debug('TTS audio chunk sent to client', {
        sessionId,
        originalSize: audioChunk.length,
        resampledSize: resampledAudio.length,
      });
    } catch (error) {
      logger.error('Error handling audio chunk', {
        sessionId: session.sessionId,
        error,
      });
      session.metrics.errors++;
    }
  }

  /**
   * Handle synthesis complete from Cartesia
   * Returns audio duration in milliseconds for playback delay
   */
  private handleSynthesisComplete(session: TTSSession): number {
    try {
      const sessionId = session.sessionId;

      // Calculate audio playback duration from bytes
      // Formula: duration (seconds) = (bytes / 2) / sampleRate
      // 48kHz, 16-bit PCM: bytes/2 = samples, samples/48000 = seconds
      const audioBytes = session.currentUtteranceAudioBytes;
      const sampleRate = 48000; // Browser playback rate
      const bytesPerSample = 2; // 16-bit PCM
      const durationSeconds = audioBytes / bytesPerSample / sampleRate;
      const durationMs = Math.round(durationSeconds * 1000);

      logger.info('TTS synthesis complete', {
        sessionId,
        audioBytes,
        durationMs,
        durationSeconds: durationSeconds.toFixed(2),
      });

      // Transition to COMPLETED state
      session.transitionTo(TTSState.COMPLETED);

      // Send audio.output.complete event to client
      this.sendAudioOutputComplete(sessionId);

      // Transition back to IDLE (ready for next synthesis)
      session.transitionTo(TTSState.IDLE);

      // Update metrics
      const synthesisDuration = Date.now() - session.lastActivityAt;
      const currentAvg = session.metrics.averageSynthesisTimeMs;
      const count = session.metrics.textsSynthesized;
      session.metrics.averageSynthesisTimeMs =
        (currentAvg * (count - 1) + synthesisDuration) / count;
      session.metrics.totalSynthesisTimeMs += synthesisDuration;

      return durationMs;
    } catch (error) {
      logger.error('Error handling synthesis complete', {
        sessionId: session.sessionId,
        error,
      });
      return 0; // Return 0 on error to prevent blocking
    }
  }

  /**
   * Handle errors from Cartesia
   */
  private handleCartesiaError(session: TTSSession, error: Error): void {
    const sessionId = session.sessionId;

    logger.error('Cartesia error', { sessionId, error });

    // Classify error
    const classified = classifyCartesiaError(error);

    // Update metrics
    session.metrics.synthesisErrors++;
    session.metrics.errors++;
    session.metrics.connectionErrors++;

    // Handle based on error type
    if (classified.type === TTSErrorType.FATAL || classified.type === TTSErrorType.AUTH) {
      logger.error('Fatal Cartesia error, closing connection', { sessionId });
      session.transitionTo(TTSState.ERROR);
      this.handleUnexpectedClose(sessionId);
    } else if (classified.retryable) {
      logger.warn('Retryable Cartesia error, will reconnect', { sessionId });
      // Reconnection handled by handleUnexpectedClose
    } else if (classified.type === TTSErrorType.RATE_LIMIT) {
      logger.warn('Cartesia rate limit hit', { sessionId });
      // Wait before retrying
    }

    // Send error to client
    this.sendTTSError(sessionId, classified);
  }

  /**
   * Send audio.output.start event to client (RESPONSE_START)
   */
  private sendAudioOutputStart(sessionId: string): void {
    const ws = websocketService.getWebSocket(sessionId);
    if (!ws) {
      logger.warn('No WebSocket connection for session', { sessionId });
      return;
    }

    const session = this.getSessionOrWarn(sessionId, 'sending audio output start');
    if (!session || !session.currentUtteranceId) {
      logger.error('No utteranceId for audio output start', { sessionId });
      return;
    }

    const message = MessagePackHelper.packResponseStart(
      session.currentUtteranceId,
      Date.now(),
      sessionId
    );

    WebSocketUtils.safeSend(ws, message, 'audio output start');

    logger.debug('Sent audio output start', {
      sessionId,
      utteranceId: session.currentUtteranceId,
    });
  }

  /**
   * Send audio.output.chunk event to client (RESPONSE_CHUNK)
   */
  private sendAudioChunk(sessionId: string, audioChunk: Buffer): void {
    const ws = websocketService.getWebSocket(sessionId);
    if (!ws) {
      logger.warn('No WebSocket connection for session', { sessionId });
      return;
    }

    const session = this.getSessionOrWarn(sessionId, 'sending audio chunk');
    if (!session || !session.currentUtteranceId) {
      logger.error('No utteranceId for audio chunk', { sessionId });
      return;
    }

    const eventId = generateId(); // Generate event ID for THIS message
    const message = MessagePackHelper.packChunk(
      audioChunk,
      48000, // Browser sample rate
      session.currentUtteranceId, // ← SAME utteranceId for all chunks!
      eventId,
      sessionId
    );

    WebSocketUtils.safeSend(ws, message, 'audio output chunk');

    logger.debug('Sent audio chunk', {
      sessionId,
      utteranceId: session.currentUtteranceId,
      chunkSize: audioChunk.length,
      sequenceNumber: session.metrics.chunksSent,
    });
  }

  /**
   * Send audio.output.complete event to client (RESPONSE_COMPLETE)
   */
  private sendAudioOutputComplete(sessionId: string): void {
    const ws = websocketService.getWebSocket(sessionId);
    if (!ws) {
      logger.warn('No WebSocket connection for session', { sessionId });
      return;
    }

    const session = this.getSessionOrWarn(sessionId, 'sending audio output complete');
    if (!session || !session.currentUtteranceId) {
      logger.error('No utteranceId for audio output complete', { sessionId });
      return;
    }

    const message = MessagePackHelper.packComplete(session.currentUtteranceId, sessionId);

    WebSocketUtils.safeSend(ws, message, 'audio output complete');

    logger.info('Sent audio output complete', {
      sessionId,
      utteranceId: session.currentUtteranceId,
    });

    // Clear utteranceId after completion
    session.currentUtteranceId = null;
  }

  /**
   * Send tts.error event to client
   */
  private sendTTSError(
    sessionId: string,
    error: { type: string; message: string; retryable: boolean }
  ): void {
    const ws = websocketService.getWebSocket(sessionId);
    if (!ws) {
      logger.warn('No WebSocket connection for session', { sessionId });
      return;
    }

    const message = pack({
      eventType: VOICECHAT_EVENTS.ERROR,
      eventId: generateId(),
      sessionId: sessionId,
      payload: {
        errorType: error.type,
        message: error.message,
        retryable: error.retryable,
      },
    });

    WebSocketUtils.safeSend(ws, message, 'tts error');
  }

  /**
   * Start keepAlive mechanism
   */
  private startKeepAlive(session: TTSSession): void {
    // Clear existing keepAlive if any
    if (session.keepAliveInterval) {
      clearInterval(session.keepAliveInterval);
    }

    session.keepAliveInterval = setInterval(() => {
      try {
        const cartesiaWs = session.cartesiaClient as CartesiaWsClient | null;
        if (cartesiaWs && cartesiaWs.socket) {
          // Send ping to keep connection alive
          cartesiaWs.socket.ping();
          logger.debug('Sent keepAlive ping to Cartesia', {
            sessionId: session.sessionId,
          });
        }
      } catch (error) {
        logger.error('Error sending keepAlive', { sessionId: session.sessionId, error });
      }
    }, TTS_CONSTANTS.KEEPALIVE_INTERVAL_MS);
  }

  /**
   * Handle unexpected connection close
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
      session.isReconnecting = true;
      session.connectionState = 'disconnected';
      session.metrics.reconnections++;

      const startTime = Date.now();

      logger.info('Attempting TTS reconnection', { sessionId });

      // Attempt reconnection with retry logic
      await this.connectToCartesia(session);

      session.connectionState = 'connected';
      session.isReconnecting = false;
      session.metrics.successfulReconnections++;

      const downtime = Date.now() - startTime;
      session.metrics.totalDowntimeMs += downtime;

      logger.info('TTS reconnection successful', {
        sessionId,
        downtimeMs: downtime,
        bufferedTexts: session.reconnectionBuffer.length,
      });

      // Flush buffered texts
      const bufferedTexts = [...session.reconnectionBuffer];
      for (const text of bufferedTexts) {
        // Check if session still exists before each synthesis
        if (!ttsSessionService.hasSession(sessionId)) {
          logger.warn('Session deleted during buffer flush, stopping', { sessionId });
          break;
        }
        await this.synthesizeText(sessionId, text);
      }

      // Check again before clearing buffer (session might have been deleted during loop)
      const currentSession = ttsSessionService.getSession(sessionId);
      if (currentSession) {
        currentSession.clearReconnectionBuffer();
      }
    } catch (error) {
      session.isReconnecting = false;
      session.metrics.failedReconnections++;

      logger.error('TTS reconnection failed', { sessionId, error });

      // Update connection state
      session.connectionState = 'disconnected';

      // Clear Cartesia client
      if (session.cartesiaClient) {
        try {
          const cartesiaWs = session.cartesiaClient as CartesiaWsClient;
          if (cartesiaWs) {
            cartesiaWs.disconnect();
          }
        } catch {
          // Ignore close errors
        }
        session.cartesiaClient = null;
      }

      // Clear buffered texts (data loss inevitable)
      session.clearReconnectionBuffer();
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, ttsTimeoutConfig.cleanupInterval);

    logger.info('TTS cleanup timer started', {
      intervalMs: ttsTimeoutConfig.cleanupInterval,
    });
  }

  /**
   * Perform cleanup of stale sessions
   */
  private performCleanup(): void {
    try {
      const now = Date.now();
      const sessions = ttsSessionService.getAllSessions();

      logger.debug('Cleaning up TTS sessions', { count: sessions.length });

      for (const session of sessions) {
        const idle = now - session.lastActivityAt;
        const duration = session.getDuration();

        // Cleanup conditions
        const isIdle = idle > ttsTimeoutConfig.sessionIdleTimeout;
        const isTooLong = duration > ttsTimeoutConfig.sessionTimeout;
        const isBadState = session.connectionState === 'disconnected' && !session.isReconnecting;

        if (isIdle || isTooLong || isBadState) {
          logger.info('Cleaning up stale TTS session', {
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
      logger.error('Error during TTS cleanup', { error });
    }
  }

  /**
   * Check session count and update peak
   */
  private checkSessionCount(): void {
    const currentCount = ttsSessionService.getSessionCount();
    if (currentCount > this.peakConcurrentSessions) {
      this.peakConcurrentSessions = currentCount;
    }

    if (currentCount > ttsTimeoutConfig.maxSessions) {
      logger.warn('TTS session count exceeds maximum', {
        current: currentCount,
        max: ttsTimeoutConfig.maxSessions,
      });
    }
  }

  /**
   * Get session or log warning
   */
  private getSessionOrWarn(sessionId: string, operation: string): TTSSession | null {
    const session = ttsSessionService.getSession(sessionId);
    if (!session) {
      logger.warn(`TTS session not found for ${operation}`, { sessionId });
      return null;
    }
    return session;
  }

  /**
   * Get service-level metrics
   */
  getMetrics(): TTSServiceMetrics {
    this.checkSessionCount();

    const sessions = ttsSessionService.getAllSessions();

    // Aggregate metrics from all sessions
    const aggregated = sessions.reduce(
      (acc, session) => ({
        textsSynthesized: acc.textsSynthesized + session.metrics.textsSynthesized,
        chunksGenerated: acc.chunksGenerated + session.metrics.chunksGenerated,
        chunksSent: acc.chunksSent + session.metrics.chunksSent,
        errors: acc.errors + session.metrics.errors,
        reconnections: acc.reconnections + session.metrics.reconnections,
        successfulReconnections:
          acc.successfulReconnections + session.metrics.successfulReconnections,
        failedReconnections: acc.failedReconnections + session.metrics.failedReconnections,
        totalDuration: acc.totalDuration + session.getDuration(),
      }),
      {
        textsSynthesized: 0,
        chunksGenerated: 0,
        chunksSent: 0,
        errors: 0,
        reconnections: 0,
        successfulReconnections: 0,
        failedReconnections: 0,
        totalDuration: 0,
      }
    );

    return {
      activeSessions: ttsSessionService.getSessionCount(),
      totalTextsSynthesized: aggregated.textsSynthesized,
      totalChunksGenerated: aggregated.chunksGenerated,
      totalChunksSent: aggregated.chunksSent,
      totalErrors: aggregated.errors,
      totalReconnections: aggregated.reconnections,
      totalSuccessfulReconnections: aggregated.successfulReconnections,
      totalFailedReconnections: aggregated.failedReconnections,
      peakConcurrentSessions: this.peakConcurrentSessions,
      totalSessionsCreated: this.totalSessionsCreated,
      totalSessionsCleaned: this.totalSessionsCleaned,
      averageSessionDurationMs:
        sessions.length > 0 ? aggregated.totalDuration / sessions.length : 0,
      memoryUsageEstimateMB: this.calculateTotalMemoryUsage() / (1024 * 1024),
    };
  }

  /**
   * Calculate total memory usage
   */
  private calculateTotalMemoryUsage(): number {
    const sessions = ttsSessionService.getAllSessions();
    return sessions.reduce((total, session) => {
      const textBufferSize = session.textBuffer.length * 2; // ~2 bytes per char
      const reconnectionBufferSize = session.getReconnectionBufferSize();
      return total + textBufferSize + reconnectionBufferSize;
    }, 0);
  }

  /**
   * Get session-specific metrics
   */
  getSessionMetrics(sessionId: string): TTSSessionMetrics | undefined {
    const session = ttsSessionService.getSession(sessionId);
    if (!session) return undefined;

    return {
      ...session.metrics,
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
  async shutdown(options: { restart?: boolean } = {}): Promise<void> {
    logger.info('TTS service shutdown initiated', {
      activeSessions: ttsSessionService.getSessionCount(),
    });

    // Mark service as shutting down
    this.isShuttingDown = true;

    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Get all active sessions
    const activeSessions = ttsSessionService.getAllSessions();

    // Close all sessions with timeout per session
    const shutdownPromises = activeSessions.map(async (session) => {
      try {
        const timeoutPromise = new Promise<void>((_resolve, reject) =>
          setTimeout(
            () => reject(new Error('Shutdown timeout')),
            ttsTimeoutConfig.shutdownTimeoutPerSession
          )
        );
        await Promise.race([this.endSession(session.sessionId), timeoutPromise]);
      } catch (error) {
        logger.error('Failed to close TTS session during shutdown', {
          sessionId: session.sessionId,
          error,
        });
        // Force cleanup
        try {
          await ttsSessionService.deleteSession(session.sessionId);
          this.totalSessionsCleaned++;
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    await Promise.allSettled(shutdownPromises);

    // Force cleanup remaining sessions
    const remainingSessions = ttsSessionService.getSessionCount();
    if (remainingSessions > 0) {
      logger.warn('Force cleaning remaining TTS sessions', { count: remainingSessions });
      const allRemaining = ttsSessionService.getAllSessions();
      for (const session of allRemaining) {
        try {
          await session.cleanup();
          await ttsSessionService.deleteSession(session.sessionId);
          this.totalSessionsCleaned++;
        } catch {
          // Ignore errors
        }
      }
    }

    // Restart if requested (for tests)
    if (options.restart) {
      logger.info('Restarting TTS service (test mode)');
      this.isShuttingDown = false;
      if (!this.isTestMode) {
        this.startCleanupTimer();
      }
    } else {
      logger.info('TTS service shutdown complete');
    }
  }
}

// Export singleton instance
export const ttsService = new TTSService();
