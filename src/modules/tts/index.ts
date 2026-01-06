/**
 * TTS Module Exports
 * Only exports public API (controller and types)
 */

// Public API (Controller)
export { ttsController } from './controllers';

// Types (for external use)
export type {
  TTSConfig,
  SynthesisOptions,
  TTSServiceMetrics,
  TTSSessionMetrics,
  TTSState,
  TTSConnectionState,
} from './types';

// DO NOT export internal services, handlers, or utilities
// External modules should only use ttsController
