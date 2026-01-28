/**
 * Native WebSocket Server Initialization
 * Following thine's pattern with direct MessagePack handling
 * P1-6 FIX: Parallel cleanup for disconnect handler
 * P1-7 FIX: Added LLM session check before cleanup
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HTTPServer } from 'http';
import type { WebSocketUpgradeRequest, ExtendedWebSocket } from './types';
import { VOICECHAT_EVENTS } from '@Jatin5120/vantum-shared';
import { logger, generateId } from '@/shared/utils';
import { websocketShutdownConfig, websocketConfig } from '@/shared/config';
import { sessionService, websocketService } from './services';
import { MessagePackHelper, WebSocketUtils } from './utils';
import { handleWebSocketMessage, handleConnectionError } from './handlers';
import { sttController } from '@/modules/stt';
import { ttsController } from '@/modules/tts';
import { cartesiaConfig } from '@/modules/tts/config/cartesia.config';
import { llmController } from '@/modules/llm';

// Environment flag to toggle between STT and echo mode
const USE_STT = !!process.env.DEEPGRAM_API_KEY;
const USE_TTS = !!process.env.CARTESIA_API_KEY;
const USE_LLM = !!process.env.OPENAI_API_KEY;

/**
 * Initialize WebSocket server
 */
export function initializeSocketServer(httpServer: HTTPServer): WebSocketServer {
  logger.info('Initializing native WebSocket server with MessagePack');

  const wss = new WebSocketServer({
    server: httpServer,
    path: websocketConfig.path,
    maxPayload: websocketConfig.maxPayload,
    perMessageDeflate: websocketConfig.perMessageDeflate,
    clientTracking: websocketConfig.clientTracking,
  });

  wss.on('connection', (ws: WebSocket, request) => {
    handleConnection(wss, ws, request);
  });

  wss.on('error', (error: Error) => {
    logger.error('WebSocket server error', error);
  });

  logger.info('WebSocket server initialized successfully');

  return wss;
}

/**
 * Handle new WebSocket connection
 */
async function handleConnection(
  wss: WebSocketServer,
  ws: WebSocket,
  request: WebSocketUpgradeRequest
): Promise<void> {
  const clientIP = request.socket.remoteAddress || 'unknown';
  const userAgent = request.headers['user-agent'] || 'unknown';

  // Generate unique connection ID using uuidv7 (following thine's pattern)
  const connectionId = generateId();

  logger.info('Client connected', {
    connectionId,
    clientIP,
    userAgent,
  });

  // Create session for this connection
  const session = sessionService.createSession(connectionId, {
    ipAddress: clientIP,
    userAgent,
  });

  // Store connection ID on WebSocket for later reference
  const extWs = ws as ExtendedWebSocket;
  extWs.connectionId = connectionId;
  extWs.sessionId = session.sessionId;

  // Initialize STT session immediately (session-level lifecycle)
  let sttSessionCreated = false;
  if (USE_STT) {
    try {
      await sttController.createSession(session.sessionId, {
        sessionId: session.sessionId,
        connectionId,
        samplingRate: 16000, // Default, will be updated on audio.start if different
        language: 'en-US', // Default, will be updated on audio.start if different
      });
      sttSessionCreated = true;
      logger.info('STT session created on WebSocket connect', {
        sessionId: session.sessionId,
        connectionId,
      });
    } catch (error) {
      logger.error('Failed to create STT session on connect', {
        sessionId: session.sessionId,
        error,
      });
      // Don't fail the entire connection - STT will be created as fallback on audio.start
    }
  }

  // Store STT session status on WebSocket for cleanup
  extWs.sttSessionCreated = sttSessionCreated;

  // Initialize TTS session immediately (session-level lifecycle)
  let ttsSessionCreated = false;
  if (USE_TTS) {
    try {
      await ttsController.initializeSession(session.sessionId, {
        sessionId: session.sessionId,
        connectionId,
        voiceId: cartesiaConfig.voiceId,
        language: cartesiaConfig.language,
        speed: cartesiaConfig.speed,
      });
      ttsSessionCreated = true;
      logger.info('TTS session created on WebSocket connect', {
        sessionId: session.sessionId,
        connectionId,
      });
    } catch (error) {
      logger.error('Failed to create TTS session on connect', {
        sessionId: session.sessionId,
        error,
      });
      // Don't fail the entire connection - continue without TTS
    }
  }

  // Store TTS session status on WebSocket for cleanup
  extWs.ttsSessionCreated = ttsSessionCreated;

  // Handle incoming messages
  ws.on('message', async (data: Buffer | string) => {
    await handleWebSocketMessage(ws, data, connectionId);
  });

  // Handle connection close
  ws.on('close', (code: number, reason: Buffer) => {
    handleDisconnect(ws, connectionId, code, reason.toString());
  });

  // Handle errors
  ws.on('error', (error: Error) => {
    handleError(ws, connectionId, error);
  });

  // Send connection acknowledgment
  // Note: connection.ack is special - it's not a response to a request, so we generate a new eventId
  // For regular request/response ACKs, the eventId should match the request
  const connectionEventId = generateId();
  const ackMessage = MessagePackHelper.packAck(
    VOICECHAT_EVENTS.CONNECTION_ACK,
    connectionEventId,
    true,
    session.sessionId
  );

  logger.info('Sending connection ACK', {
    connectionId,
    sessionId: session.sessionId,
    eventId: connectionEventId,
  });

  WebSocketUtils.safeSend(ws, ackMessage, 'connection ack');

  logger.debug('Connection handlers registered', {
    connectionId,
    sessionId: session.sessionId,
  });
}

/**
 * Handle WebSocket disconnection
 * P1-6 FIX: Parallel cleanup for faster disconnection
 * P1-7 FIX: Added LLM session check before cleanup
 */
async function handleDisconnect(
  ws: WebSocket,
  connectionId: string,
  code: number,
  reason: string
): Promise<void> {
  const extWs = ws as ExtendedWebSocket;
  const session = sessionService.getSessionBySocketId(connectionId);

  logger.info('Client disconnected', {
    connectionId,
    sessionId: session?.sessionId,
    code,
    reason,
  });

  // Cleanup session
  if (session) {
    const duration = Date.now() - session.createdAt;
    logger.debug('Session cleanup', {
      connectionId,
      sessionId: session.sessionId,
      duration,
      state: session.state,
    });

    // P1-6 FIX: Parallel cleanup instead of sequential
    // OLD (sequential): TTS → STT → LLM one at a time
    // NEW (parallel): All three cleanup simultaneously using Promise.allSettled
    // Benefit: Faster disconnection (e.g., 6s → 2s if each takes 2s)
    await Promise.allSettled([
      // TTS cleanup (if session exists)
      USE_TTS && extWs.ttsSessionCreated && ttsController.hasSession(session.sessionId)
        ? ttsController.endSession(session.sessionId).then(() => {
            logger.info('TTS session closed on disconnect', { sessionId: session.sessionId });
          }).catch((error) => {
            logger.error('Failed to close TTS session', { sessionId: session.sessionId, error });
          })
        : Promise.resolve(),

      // STT cleanup (if session exists)
      USE_STT && extWs.sttSessionCreated && sttController.hasSession(session.sessionId)
        ? sttController.endSession(session.sessionId).then(() => {
            logger.info('STT session closed on disconnect', { sessionId: session.sessionId });
          }).catch((error) => {
            logger.error('Failed to close STT session', { sessionId: session.sessionId, error });
          })
        : Promise.resolve(),

      // P1-7 FIX: LLM cleanup with session existence check
      // OLD: Always attempted cleanup even if session doesn't exist
      // NEW: Check llmController.hasSession() before cleanup
      // Benefit: Avoids unnecessary work, cleaner logs
      USE_LLM && llmController.hasSession && llmController.hasSession(session.sessionId)
        ? llmController.endSession(session.sessionId).then(() => {
            logger.info('LLM session closed on disconnect', { sessionId: session.sessionId });
          }).catch((error) => {
            logger.error('Failed to close LLM session', { sessionId: session.sessionId, error });
          })
        : Promise.resolve(),
    ]);

    logger.info('All service sessions ended (parallel)', { sessionId: session.sessionId });
  }

  // Delete session
  sessionService.deleteSession(connectionId);

  // CRITICAL: Remove active WebSocket for this session (following thine's pattern)
  if (session) {
    websocketService.removeWebSocket(session.sessionId);
  }
}

/**
 * Handle WebSocket errors
 */
function handleError(ws: WebSocket, connectionId: string, error: Error): void {
  const session = sessionService.getSessionBySocketId(connectionId);

  handleConnectionError(ws, error, 'error.connection', session?.sessionId);
}

/**
 * Get socket server statistics
 * Exposed for health checks and monitoring
 */
export function getSocketStats(wss: WebSocketServer): {
  totalConnections: number;
  activeSessions: number;
  sessionStats: {
    total: number;
    idle: number;
    active: number;
    ended: number;
    avgDuration: number;
  };
} {
  const sessionStats = sessionService.getStats();

  return {
    totalConnections: wss.clients.size,
    activeSessions: sessionStats.active,
    sessionStats,
  };
}

/**
 * Graceful shutdown for WebSocket server
 */
export async function shutdownSocketServer(wss: WebSocketServer): Promise<void> {
  logger.info('Shutting down WebSocket server');

  return new Promise((resolve) => {
    // First, close all WebSocket connections gracefully
    const closePromises: Promise<void>[] = [];

    wss.clients.forEach((ws) => {
      const closePromise = new Promise<void>((closeResolve) => {
        ws.once('close', () => {
          closeResolve();
        });
        ws.close();
      });
      closePromises.push(closePromise);
    });

    // Wait for all connections to close (with timeout)
    Promise.all(closePromises)
      .then(() => {
        // Cleanup all tracked WebSockets
        websocketService.cleanup();

        // Close the server
        wss.close(() => {
          logger.info('WebSocket server closed');
          resolve();
        });
      })
      .catch(() => {
        // Even if some connections fail to close, continue shutdown
        websocketService.cleanup();
        wss.close(() => {
          logger.warn('WebSocket server closed with errors');
          resolve();
        });
      });

    // Force close after timeout
    setTimeout(() => {
      logger.warn('WebSocket server force closed after timeout');
      websocketService.cleanup();
      wss.close(() => {
        resolve();
      });
    }, websocketShutdownConfig.shutdownTimeout);
  });
}
