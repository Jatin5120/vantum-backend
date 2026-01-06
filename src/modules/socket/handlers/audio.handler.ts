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
import { logger } from '@/shared/utils';
import { generateId } from '@/shared/utils';
import { handleInvalidPayload, handleSessionError, sendError } from './error.handler';
import { handlerUtils } from './handler-utils';
import { sttController } from '@/modules/stt';
import { handleFinalTranscript } from '@/modules/tts/handlers';
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
 *
 * MVP: Manual TTS trigger on "Stop recording" button
 * User clicks "Stop recording" → Finalize STT transcript → Trigger TTS synthesis
 * TTS synthesis happens via handleFinalTranscript() in tts module (manually triggered)
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

        // MVP: Trigger TTS synthesis with accumulated transcript (manual user control)
        // User clicked "Stop recording" → Finalized transcript → Synthesize speech
        if (finalTranscript && finalTranscript.trim().length > 0) {
          try {
            logger.info('Manual TTS trigger on audio.input.end (MVP)', {
              sessionId: session.sessionId,
              transcriptLength: finalTranscript.length,
              transcript: finalTranscript.substring(0, 100) + '...',
            });

            // Non-blocking call to TTS handler (synthesize accumulated transcript)
            handleFinalTranscript(finalTranscript, session.sessionId).catch((error) => {
              logger.error('Failed to trigger TTS synthesis', { sessionId: session.sessionId, error });
            });
          } catch (error) {
            logger.error('Error triggering TTS on manual stop', { sessionId: session.sessionId, error });
          }
        }
      } catch (error) {
        logger.error('Failed to finalize transcript', { sessionId: session.sessionId, error });
        // Continue to cleanup
      }
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
    // NOTE: WebSocket is NOT removed here (TTS synthesis may still be active)
    // WebSocket cleanup happens in disconnect handler (socket.server.ts:handleDisconnect)
    // This allows TTS audio chunks to be sent after audio.input.end completes
    //
    // Why this is correct:
    // - audio.input.end signals END OF RECORDING, not END OF SESSION
    // - WebSocket can handle multiple recording cycles per session
    // - TTS synthesis is async and needs WebSocket to send audio chunks
    // - Disconnect handler properly cleans up STT/TTS sessions + WebSocket

    if (sessionId) {
      logger.debug('Audio session ended, WebSocket remains open for TTS', {
        sessionId,
        note: 'Cleanup will happen on disconnect',
      });
    }
  }
}
