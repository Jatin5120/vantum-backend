/**
 * Audio Event Handlers
 * Handles voicechat audio events (following thine's pattern)
 */

import { WebSocket } from 'ws';
import {
  VOICECHAT_EVENTS,
  AudioStartPayload,
  AudioChunkPayload,
  AudioEndPayload,
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

    // Initialize audio buffer for echo/loopback testing
    // TODO: Remove when real STT/LLM/TTS pipeline is implemented
    const startEventId = data.eventId || generateId();
    audioBufferService.initializeBuffer(session.sessionId, samplingRate, startEventId);

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

    // Buffer audio chunk for echo/loopback testing
    // TODO: Replace with STT service forwarding when pipeline is implemented
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
 */
export async function handleAudioEnd(
  ws: WebSocket,
  data: UnpackedMessage,
  connectionId: string
): Promise<void> {
  try {
    const session = handlerUtils.getSessionOrError(
      ws,
      connectionId,
      'Session not found',
      'handleAudioEnd',
      VOICECHAT_EVENTS.AUDIO_END
    );
    if (!session) return;

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

    // Send acknowledgment (stub - in Layer 2 we'll cleanup STT/TTS connections)
    // Use sessionId from request message, fallback to session.sessionId if not provided
    const sessionId = data.sessionId || session.sessionId;
    // ACK must use the same eventId as the request
    if (!data.eventId) {
      logger.warn('Request missing eventId, cannot send proper ACK', { connectionId });
      sendError(ws, ErrorCode.INVALID_PAYLOAD, 'Request missing eventId', VOICECHAT_EVENTS.AUDIO_END, sessionId);
      return;
    }
    handlerUtils.sendAck(ws, VOICECHAT_EVENTS.AUDIO_END, data.eventId, sessionId, 'audio.end.ack');

    // Echo/loopback testing: Stream buffered audio back to client after delay
    // TODO: Remove when real STT/LLM/TTS pipeline is implemented
    await streamEchoedAudio(session.sessionId, session.metadata?.samplingRate || 16000);

    // CRITICAL: Remove active WebSocket for this session (following thine's cleanup pattern)
    websocketService.removeWebSocket(session.sessionId);
    
    // Clear audio buffer
    audioBufferService.clearBuffer(session.sessionId);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error in handleAudioEnd', {
      connectionId,
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined,
    });
    const sessionId = data?.sessionId;
    sendError(ws, ErrorCode.INTERNAL_ERROR, 'Failed to end audio session', VOICECHAT_EVENTS.AUDIO_END, sessionId, data?.eventId);
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

  // Generate utterance ID for this response
  const utteranceId = generateId();
  const startEventId = buffer.startEventId;

  logger.info('Starting audio echo', {
    sessionId,
    chunkCount: buffer.chunks.length,
    utteranceId,
  });

  // Send response.start event
  const startMessage = {
    eventType: VOICECHAT_EVENTS.RESPONSE_START,
    eventId: startEventId, // Use same eventId as audio.start
    sessionId,
    payload: {
      utteranceId,
      timestamp: Date.now(),
    },
  };
  const startPacked = pack(startMessage);
  websocketService.sendToSession(sessionId, startPacked, 'response.start');

  // Stream chunks back with small delay between chunks (simulate real-time streaming)
  const chunkDelay = 50; // 50ms between chunks (simulates TTS streaming)
  
  for (let i = 0; i < buffer.chunks.length; i++) {
    const chunk = buffer.chunks[i];
    
    // Use same utteranceId for all chunks in this response
    // The utteranceId identifies the entire response, not individual chunks
    // All chunks must use the same utteranceId to prevent frontend from stopping playback
    const chunkUtteranceId = utteranceId;
    
    // Pack and send chunk
    const packedChunk = MessagePackHelper.packChunk(
      chunk.audio,
      samplingRate,
      chunkUtteranceId,
      startEventId, // Same eventId for all chunks
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
    eventId: startEventId, // Use same eventId as audio.start
    sessionId,
    payload: { utteranceId },
  };
  const completePacked = pack(completeMessage);
  websocketService.sendToSession(sessionId, completePacked, 'response.complete');

  logger.info('Audio echo completed', {
    sessionId,
    utteranceId,
    chunkCount: buffer.chunks.length,
  });
}
