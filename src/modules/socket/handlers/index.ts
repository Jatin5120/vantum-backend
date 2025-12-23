/**
 * Socket Handlers
 * Centralized exports for all socket event handlers
 */

export { handleWebSocketMessage } from './message.handler';
export { handleAudioStart, handleAudioChunk, handleAudioEnd } from './audio.handler';
export { handlerUtils } from './handler-utils';
export {
  sendError,
  handleConnectionError,
  handleInvalidPayload,
  handleSessionError,
  handleAudioError,
  handleSTTError,
  handleLLMError,
  handleTTSError,
  handleInternalError,
} from './error.handler';
