/**
 * Socket Module Types
 * Centralized exports for all socket-related types
 */

// Backend-specific types
export * from './session';
export * from './socket';

// Re-export shared types from @Jatin5120/vantum-shared
export {
  VOICECHAT_EVENTS,
  ErrorCode,
  toErrorEventType,
  isAudioStartPayload,
  isAudioChunkPayload,
  isAudioEndPayload,
} from '@Jatin5120/vantum-shared';

export type {
  VoicechatEventType,
  AudioStartPayload,
  AudioChunkPayload,
  AudioEndPayload,
  ResponseStartPayload,
  ResponseChunkPayload,
  ResponseInterruptPayload,
  ResponseStopPayload,
  ResponseCompletePayload,
  ConnectionAckPayload,
  EventMessage,
  UnpackedMessage,
  ErrorMessage,
  ErrorPayload,
  EventPayloadMap,
} from '@Jatin5120/vantum-shared';

