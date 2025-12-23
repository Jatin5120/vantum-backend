/**
 * Socket Module - Public API
 * 
 * This is the public interface for the socket module.
 * Only export what other modules should use.
 * Internal implementation details are hidden.
 */

// Server initialization and stats
export { initializeSocketServer, shutdownSocketServer, getSocketStats } from './socket.server';

// Backend-specific types
export type {
  Session,
  SessionState,
  SessionMetadata,
  SessionConfig,
  ExtendedWebSocket,
  WebSocketUpgradeRequest,
} from './types';

// Re-export shared types from @Jatin5120/vantum-shared for convenience
export type {
  UnpackedMessage,
  EventMessage,
  VoicechatEventType,
  AudioStartPayload,
  AudioChunkPayload,
  AudioEndPayload,
  ResponseStartPayload,
  ResponseChunkPayload,
  ResponseInterruptPayload,
  ResponseStopPayload,
  ResponseCompletePayload,
  ErrorPayload,
} from '@Jatin5120/vantum-shared';

// Re-export shared constants and enums
export { ErrorCode, VOICECHAT_EVENTS } from '@Jatin5120/vantum-shared';

