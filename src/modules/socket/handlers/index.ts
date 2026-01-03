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
  // Layer 2: Uncomment when LLM/TTS services are implemented
  // handleLLMError,
  // handleTTSError,
  handleInternalError,
} from './error.handler';
