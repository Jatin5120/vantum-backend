/**
 * TTS Controller
 * Public API for TTS operations (only exported interface from TTS module)
 */

import { logger } from '@/shared/utils';
import { ttsService } from '../services';
import { TTSConfig, SynthesisOptions, TTSServiceMetrics, TTSSessionMetrics } from '../types';

/**
 * TTSController - Public API wrapper around TTSService
 */
export class TTSController {
  /**
   * Initialize TTS session
   */
  async initializeSession(sessionId: string, config: TTSConfig): Promise<void> {
    try {
      logger.info('Initializing TTS session', { sessionId });
      await ttsService.createSession(sessionId, config);
      logger.info('TTS session initialized', { sessionId });
    } catch (error) {
      logger.error('Failed to initialize TTS session', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Synthesize text to speech (main entry point)
   */
  async synthesize(
    sessionId: string,
    text: string,
    options?: SynthesisOptions
  ): Promise<void> {
    try {
      // Validate input
      if (!sessionId) {
        throw new Error('sessionId is required');
      }

      if (!text || text.trim().length === 0) {
        logger.warn('Empty text provided for synthesis', { sessionId });
        return;
      }

      logger.info('TTS synthesis requested', {
        sessionId,
        textLength: text.length,
        preview: text.substring(0, 50) + '...',
      });

      await ttsService.synthesizeText(sessionId, text, options);
    } catch (error) {
      logger.error('TTS synthesis failed', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Cancel ongoing synthesis
   */
  async cancel(sessionId: string): Promise<void> {
    try {
      logger.info('Cancelling TTS synthesis', { sessionId });
      await ttsService.cancelSynthesis(sessionId);
      logger.info('TTS synthesis cancelled', { sessionId });
    } catch (error) {
      logger.error('Failed to cancel TTS synthesis', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * End TTS session
   */
  async endSession(sessionId: string): Promise<void> {
    try {
      logger.info('Ending TTS session', { sessionId });
      await ttsService.endSession(sessionId);
      logger.info('TTS session ended', { sessionId });
    } catch (error) {
      logger.error('Failed to end TTS session', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - always try to cleanup even if error
    }
  }

  /**
   * Check if session exists
   */
  hasSession(sessionId: string): boolean {
    return ttsService.hasSession(sessionId);
  }

  /**
   * Get service-level metrics
   */
  getMetrics(): TTSServiceMetrics {
    return ttsService.getMetrics();
  }

  /**
   * Get session-specific metrics
   */
  getSessionMetrics(sessionId: string): TTSSessionMetrics | undefined {
    return ttsService.getSessionMetrics(sessionId);
  }

  /**
   * Health check
   */
  isHealthy(): boolean {
    return ttsService.isHealthy();
  }

  /**
   * Graceful shutdown (for testing)
   */
  async shutdown(options: { restart?: boolean } = {}): Promise<void> {
    await ttsService.shutdown(options);
  }
}

// Export singleton instance
export const ttsController = new TTSController();
