/**
 * STT Module Public Exports
 * Only these are accessible to other modules
 */

// Public API Gateway
export { sttController } from './controllers';

// Public Types
export type {
  STTConfig,
  STTServiceMetrics,
  STTSessionMetrics,
  STTSessionState,
  TranscriptSegment,
} from './types';

// Internal exports for testing only
// (Only use these in test files, never in other modules)
export { sttService } from './services/stt.service';
export { sttSessionService, STTSession } from './services/stt-session.service';
