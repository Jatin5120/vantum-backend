/**
 * Audio Event Handlers
 * Handles voicechat audio events (following thine's pattern)
 */

import { WebSocket } from 'ws';
import {
  VOICECHAT_EVENTS,
  AudioStartPayload,
  AudioChunkPayload,
  isAudioStartPayload,
  isAudioChunkPayload,
  isAudioEndPayload,
  ErrorCode,
  UnpackedMessage,
} from '@Jatin5120/vantum-shared';
import { SessionState } from '../types';
import { sessionService, websocketService } from '../services';
import { audioBufferService } from '../services/audio-buffer.service';
import { logger } from '@/shared/utils';
import { generateId } from '@/shared/utils';
import { handleInvalidPayload, handleSessionError, sendError } from './error.handler';
import { handlerUtils } from './handler-utils';
import { MessagePackHelper } from '../utils/MessagePackHelper';
import { pack } from 'msgpackr';
import { sttController } from '@/modules/stt';
import { OUTPUT_SAMPLE_RATE } from '@/modules/audio/constants/audio.constants';
import { audioResamplerService } from '@/modules/audio/services';

// Environment flag to toggle between STT and echo mode
const USE_STT = !!process.env.DEEPGRAM_API_KEY;

// Log audio mode on server startup
if (USE_STT) {
  logger.info('🤖 STT MODE: Deepgram integration ENABLED', {
    mode: 'stt',
    provider: 'deepgram',
  });
} else {
  logger.warn('🔊 ECHO MODE: Audio echo testing (Deepgram API key not set)', {
    mode: 'echo',
    notice: 'Set DEEPGRAM_API_KEY to enable STT',
  });
}

/**
 * Handle voicechat.audio.start event
 */
export async function handleAudioStart(
  ws: WebSocket,
  data: UnpackedMessage,
  connectionId: string
): Promise<void> {
  try {
    const session = handlerUtils.getSessionOrError(
      ws,
      connectionId,
      'Session not found',
      'handleAudioStart',
      VOICECHAT_EVENTS.AUDIO_START
    );
    if (!session) return;

    // Validate payload
    if (!isAudioStartPayload(data?.payload)) {
      handleInvalidPayload(ws, VOICECHAT_EVENTS.AUDIO_START, 'payload must be an object', data);
      return;
    }

    const payload = data.payload as AudioStartPayload;

    // Validate sampling rate
    const samplingRate = payload.samplingRate || 16000;
    if (samplingRate < 8000 || samplingRate > 48000) {
      handleInvalidPayload(
        ws,
        VOICECHAT_EVENTS.AUDIO_START,
        `samplingRate must be between 8000 and 48000, got ${samplingRate}`,
        data
      );
      return;
    }

    // CRITICAL: Store active WebSocket for this session (following thine's pattern)
    // This is needed to send TTS audio chunks back in Layer 2
    websocketService.registerWebSocket(session.sessionId, ws);

    // Update session with audio config
    const updatedSession = sessionService.updateSession(connectionId, {
      state: SessionState.ACTIVE,
      metadata: {
        ...session.metadata,
        samplingRate,
        voiceId: payload.voiceId,
        language: payload.language || 'en-US',
      },
    });

    if (!updatedSession) {
      handleSessionError(ws, 'Failed to update session', VOICECHAT_EVENTS.AUDIO_START, data);
      return;
    }

    // Verify STT session exists (should have been created on WebSocket connect)
    if (USE_STT) {
      // If not, create it now as fallback
      if (!sttController.hasSession(session.sessionId)) {
        logger.warn('STT session not found on audio.start, creating fallback', {
          sessionId: session.sessionId
        });
        try {
          await sttController.createSession(session.sessionId, {
            sessionId: session.sessionId,
            connectionId,
            samplingRate,
            language: payload.language || 'en-US',
          });
        } catch (error) {
          logger.error('Failed to create fallback STT session', {
            sessionId: session.sessionId,
            error
          });
          sendError(
            ws,
            ErrorCode.INTERNAL_ERROR,
            'Failed to initialize transcription',
            VOICECHAT_EVENTS.AUDIO_START,
            session.sessionId,
            data.eventId
          );
          return;
        }
      } else {
        logger.info('STT session already ready', { sessionId: session.sessionId });
      }
    }

    // ALWAYS initialize buffer (for echo testing, later for TTS)
    const startEventId = data.eventId || generateId();
    audioBufferService.initializeBuffer(session.sessionId, samplingRate, startEventId);
    logger.info('Audio buffer initialized', { sessionId: session.sessionId });

    logger.info('Audio session started', {
      connectionId,
      sessionId: session.sessionId,
      samplingRate,
      voiceId: payload.voiceId,
      language: payload.language,
    });

    // Send acknowledgment (stub - in Layer 2 we'll initialize STT connection)
    // Use sessionId from request message, fallback to session.sessionId if not provided
    const sessionId = data.sessionId || session.sessionId;
    // ACK must use the same eventId as the request
    if (!data.eventId) {
      logger.warn('Request missing eventId, cannot send proper ACK', { connectionId });
      sendError(ws, ErrorCode.INVALID_PAYLOAD, 'Request missing eventId', VOICECHAT_EVENTS.AUDIO_START, sessionId);
      return;
    }
    handlerUtils.sendAck(ws, VOICECHAT_EVENTS.AUDIO_START, data.eventId, sessionId, 'audio.start.ack');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error in handleAudioStart', {
      connectionId,
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined,
    });
    const sessionId = data?.sessionId;
    sendError(ws, ErrorCode.INTERNAL_ERROR, 'Failed to start audio session', VOICECHAT_EVENTS.AUDIO_START, sessionId, data?.eventId);
  }
}

/**
 * Handle voicechat.audio.chunk event
 */
export async function handleAudioChunk(
  ws: WebSocket,
  data: UnpackedMessage,
  connectionId: string
): Promise<void> {
  try {
    const session = handlerUtils.getSessionOrError(
      ws,
      connectionId,
      'Session not found',
      'handleAudioChunk',
      VOICECHAT_EVENTS.AUDIO_CHUNK
    );
    if (!session) return;

    // Validate payload
    if (!isAudioChunkPayload(data.payload)) {
      handleInvalidPayload(ws, VOICECHAT_EVENTS.AUDIO_CHUNK, 'Invalid audio chunk payload', data);
      return;
    }

    const payload = data.payload as AudioChunkPayload;
    const audioChunk = handlerUtils.decodeBinaryToUint8Array(payload.audio);
    if (!audioChunk) {
      handleInvalidPayload(ws, VOICECHAT_EVENTS.AUDIO_CHUNK, 'payload.audio must be binary', data);
      return;
    }
    const isMuted = payload.isMuted ?? false;

    // Update last activity
    sessionService.touchSession(connectionId);

    // Log audio chunk received (debug only)
    logger.debug('Audio chunk received', {
      connectionId,
      sessionId: session.sessionId,
      chunkSize: audioChunk.length,
      isMuted,
    });

    // Forward to STT if enabled
    if (USE_STT && !isMuted) {
      try {
        // Get input sample rate from session metadata
        const inputSampleRate = session.metadata?.samplingRate || 16000;

        // Resample if needed (backend handles all resampling)
        let processedChunk = Buffer.from(audioChunk);

        if (inputSampleRate !== OUTPUT_SAMPLE_RATE) {
          logger.debug('Resampling audio', {
            sessionId: session.sessionId,
            from: inputSampleRate,
            to: OUTPUT_SAMPLE_RATE,
          });

          const resampledBuffer = await audioResamplerService.resample(
            session.sessionId,
            Buffer.from(audioChunk),
            inputSampleRate
          );
          processedChunk = Buffer.from(resampledBuffer);
        }

        // Forward resampled audio to STT (16kHz)
        await sttController.forwardChunk(session.sessionId, new Uint8Array(processedChunk));
      } catch (error) {
        logger.error('Failed to process audio for STT', {
          sessionId: session.sessionId,
          error,
        });
        // Continue despite error - don't break the audio pipeline
      }
    }

    // ALWAYS buffer audio (for echo OR future TTS)
    if (!isMuted) {
      audioBufferService.addChunk(session.sessionId, audioChunk);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error in handleAudioChunk', {
      connectionId,
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined,
    });
    const sessionId = data?.sessionId;
    sendError(ws, ErrorCode.INTERNAL_ERROR, 'Failed to process audio chunk', VOICECHAT_EVENTS.AUDIO_CHUNK, sessionId, data?.eventId);
  }
}

/**
 * Handle voicechat.audio.end event
 * BUG FIX: Moved buffer cleanup to outer finally block
 */
export async function handleAudioEnd(
  ws: WebSocket,
  data: UnpackedMessage,
  connectionId: string
): Promise<void> {
  let sessionId: string | undefined;

  try {
    const session = handlerUtils.getSessionOrError(
      ws,
      connectionId,
      'Session not found',
      'handleAudioEnd',
      VOICECHAT_EVENTS.AUDIO_END
    );
    if (!session) return;

    // Capture sessionId early for finally block
    sessionId = session.sessionId;

    // Validate payload
    if (!isAudioEndPayload(data?.payload)) {
      handleInvalidPayload(ws, VOICECHAT_EVENTS.AUDIO_END, 'payload must be an object', data);
      return;
    }

    // Update session state
    const updatedSession = sessionService.updateSessionState(connectionId, SessionState.ENDED);
    if (!updatedSession) {
      handleSessionError(ws, 'Failed to update session state', VOICECHAT_EVENTS.AUDIO_END, data);
      return;
    }

    logger.info('Audio session ended', {
      connectionId,
      sessionId: session.sessionId,
      duration: Date.now() - session.createdAt,
    });

    // Finalize transcript if STT enabled (connection stays open)
    let finalTranscript = '';
    if (USE_STT) {
      try {
        finalTranscript = await sttController.finalizeTranscript(session.sessionId);
        logger.info('🎤 STT FINAL TRANSCRIPT (COMPLETE RECORDING)', {
          sessionId: session.sessionId,
          transcriptLength: finalTranscript.length,
          fullTranscript: finalTranscript,
          note: 'This is the COMPLETE accumulated transcript from the entire recording session',
        });
        // TODO: Store transcript for LLM (Layer 2)
      } catch (error) {
        logger.error('Failed to finalize transcript', { sessionId: session.sessionId, error });
        // Continue to cleanup
      }
    }

    // ALWAYS echo audio back (for testing playback pipeline)
    // TODO: In Layer 2, replace with TTS audio
    try {
      logger.info('Starting audio echo (testing playback)', { sessionId: session.sessionId });
      await streamEchoedAudio(session.sessionId, session.metadata?.samplingRate || 16000);
    } catch (error) {
      logger.error('Failed to echo audio', { sessionId: session.sessionId, error });
    }

    // Send acknowledgment
    // Use sessionId from request message, fallback to session.sessionId if not provided
    const ackSessionId = data.sessionId || session.sessionId;
    // ACK must use the same eventId as the request
    if (!data.eventId) {
      logger.warn('Request missing eventId, cannot send proper ACK', { connectionId });
      sendError(ws, ErrorCode.INVALID_PAYLOAD, 'Request missing eventId', VOICECHAT_EVENTS.AUDIO_END, ackSessionId);
      return;
    }
    handlerUtils.sendAck(ws, VOICECHAT_EVENTS.AUDIO_END, data.eventId, ackSessionId, 'audio.end.ack');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error in handleAudioEnd', {
      connectionId,
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined,
    });
    const errorSessionId = data?.sessionId;
    sendError(ws, ErrorCode.INTERNAL_ERROR, 'Failed to end audio session', VOICECHAT_EVENTS.AUDIO_END, errorSessionId, data?.eventId);
  } finally {
    // BUG FIX: Always cleanup buffer, even on error or early return
    if (sessionId) {
      try {
        audioBufferService.clearBuffer(sessionId);
        logger.debug('Audio buffer cleared', { sessionId });
      } catch (_cleanupError) {
        logger.error('Error clearing buffer', { sessionId, error: _cleanupError });
      }

      try {
        // CRITICAL: Remove active WebSocket for this session (following thine's cleanup pattern)
        websocketService.removeWebSocket(sessionId);
      } catch (_removeError) {
        logger.error('Error removing WebSocket', { sessionId, error: _removeError });
      }
    }
  }
}

/**
 * Stream echoed audio back to client (for testing pipeline)
 * TODO: Remove when real STT/LLM/TTS pipeline is implemented
 */
async function streamEchoedAudio(sessionId: string, samplingRate: number): Promise<void> {
  const buffer = audioBufferService.getBuffer(sessionId);
  if (!buffer || buffer.chunks.length === 0) {
    logger.debug('No audio chunks to echo', { sessionId });
    return;
  }

  if (!websocketService.hasWebSocket(sessionId)) {
    logger.warn('No active WebSocket for echo', { sessionId });
    return;
  }

  // Wait 1 second before starting echo
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const utteranceId = generateId();
  const startEventId = buffer.startEventId;
  const startTime = Date.now();
  const chunkDelay = 50; // 50ms between chunks

  // Enhanced echo start logging
  logger.info('🔊 Starting audio echo', {
    sessionId,
    chunkCount: buffer.chunks.length,
    utteranceId,
    estimatedDuration: `${(buffer.chunks.length * chunkDelay) / 1000}s`,
  });

  // Send response.start event
  const startMessage = {
    eventType: VOICECHAT_EVENTS.RESPONSE_START,
    eventId: startEventId,
    sessionId,
    payload: {
      utteranceId,
      timestamp: Date.now(),
    },
  };
  const startPacked = pack(startMessage);
  websocketService.sendToSession(sessionId, startPacked, 'response.start');

  // Stream chunks back with small delay between chunks
  for (let i = 0; i < buffer.chunks.length; i++) {
    const chunk = buffer.chunks[i];

    // Log progress periodically (every 10 chunks or at start/end)
    if (i === 0 || i === buffer.chunks.length - 1 || (i + 1) % 10 === 0) {
      logger.debug('Echo progress', {
        sessionId,
        chunk: `${i + 1}/${buffer.chunks.length}`,
        progress: `${Math.round(((i + 1) / buffer.chunks.length) * 100)}%`,
      });
    }

    const chunkUtteranceId = utteranceId;

    // Pack and send chunk
    const packedChunk = MessagePackHelper.packChunk(
      chunk.audio,
      samplingRate,
      chunkUtteranceId,
      startEventId,
      sessionId
    );

    websocketService.sendToSession(sessionId, packedChunk, 'response.chunk');

    // Small delay between chunks (except for last one)
    if (i < buffer.chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, chunkDelay));
    }
  }

  // Send response.complete event
  const completeMessage = {
    eventType: VOICECHAT_EVENTS.RESPONSE_COMPLETE,
    eventId: startEventId,
    sessionId,
    payload: { utteranceId },
  };
  const completePacked = pack(completeMessage);
  websocketService.sendToSession(sessionId, completePacked, 'response.complete');

  // Enhanced echo completion logging
  logger.info('🔊 Audio echo completed', {
    sessionId,
    utteranceId,
    chunkCount: buffer.chunks.length,
    actualDuration: `${Date.now() - startTime}ms`,
  });
}
