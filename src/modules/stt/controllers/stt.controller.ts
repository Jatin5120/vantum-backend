/**
 * STT Controller
 * Public API gateway for STT module (exposed to other modules)
 */

import { logger } from '@/shared/utils';
import { sttService } from '../services';
import type { STTConfig, STTServiceMetrics, STTSessionMetrics } from '../types';

class STTController {
  /**
   * Create new STT session with Deepgram WebSocket connection
   *
   * @param sessionId - Unique session identifier from socket module
   * @param config - STT configuration (sampling rate, language, etc.)
   * @throws {Error} If Deepgram connection fails or invalid config
   * @example
   * ```typescript
   * await sttController.createSession(session.sessionId, {
   *   sessionId: session.sessionId,
   *   connectionId: ws.connectionId,
   *   samplingRate: 16000,
   *   language: 'en-US',
   * });
   * ```
   */
  async createSession(sessionId: string, config: STTConfig): Promise<void> {
    try {
      // Input validation
      if (!sessionId || !config) {
        throw new Error('Invalid input: sessionId and config are required');
      }

      // Validate samplingRate
      if (config.samplingRate < 8000 || config.samplingRate > 48000) {
        throw new Error(
          `Invalid samplingRate: ${config.samplingRate}. Must be between 8000 and 48000 Hz`
        );
      }

      // Delegate to internal service
      await sttService.createSession(sessionId, config);

      logger.info('STT session created via controller', { sessionId });
    } catch (error) {
      logger.error('STT controller: Failed to create session', { sessionId, error });
      throw error; // Propagate to caller (socket module)
    }
  }

  /**
   * Forward audio chunk to Deepgram for real-time transcription
   *
   * @param sessionId - Session identifier
   * @param audioChunk - PCM audio data (Int16 encoded in Uint8Array)
   * @returns Promise that resolves when chunk is forwarded
   * @example
   * ```typescript
   * await sttController.forwardChunk(sessionId, audioChunkData);
   * ```
   */
  async forwardChunk(sessionId: string, audioChunk: Uint8Array): Promise<void> {
    // Input validation
    if (!sessionId || !audioChunk || audioChunk.length === 0) {
      logger.warn('STT controller: Invalid chunk', { sessionId });
      return;
    }

    // Delegate to internal service (non-blocking)
    await sttService.forwardAudioChunk(sessionId, audioChunk);
  }

  /**
   * Finalize current transcription without closing connection
   *
   * @param sessionId - Session identifier
   * @returns Final transcript text for current segment (empty string if session not found or error)
   * @example
   * ```typescript
   * const transcript = await sttController.finalizeTranscript(sessionId);
   * console.log('Finalized transcript:', transcript);
   * ```
   */
  async finalizeTranscript(sessionId: string): Promise<string> {
    try {
      const transcript = await sttService.finalizeTranscript(sessionId);
      logger.info('STT transcript finalized via controller', { sessionId });
      return transcript;
    } catch (error) {
      logger.error('STT controller: Failed to finalize transcript', { sessionId, error });
      return ''; // Graceful degradation
    }
  }

  /**
   * End STT session and close Deepgram connection
   *
   * @param sessionId - Session identifier
   * @returns Final transcript text (empty string if session not found or error)
   * @example
   * ```typescript
   * const finalTranscript = await sttController.endSession(sessionId);
   * console.log('STT session closed. Final transcript:', finalTranscript);
   * ```
   */
  async endSession(sessionId: string): Promise<string> {
    try {
      const transcript = await sttService.endSession(sessionId);
      logger.info('STT session ended via controller', { sessionId });
      return transcript;
    } catch (error) {
      logger.error('STT controller: Failed to end session', { sessionId, error });
      return ''; // Return empty string on error for graceful degradation
    }
  }

  /**
   * Check if STT session exists
   *
   * @param sessionId - Session identifier
   * @returns true if session exists, false otherwise
   * @example
   * ```typescript
   * if (sttController.hasSession(sessionId)) {
   *   console.log('Session exists');
   * }
   * ```
   */
  hasSession(sessionId: string): boolean {
    return sttService.hasSession(sessionId);
  }

  /**
   * Get service-level metrics for all active STT sessions
   *
   * @returns Aggregated metrics (active sessions, chunks forwarded, transcripts received, errors)
   * @example
   * ```typescript
   * const metrics = sttController.getMetrics();
   * console.log('Active sessions:', metrics.activeSessions);
   * ```
   */
  getMetrics(): STTServiceMetrics {
    return sttService.getMetrics();
  }

  /**
   * Get session-specific metrics for debugging and monitoring
   *
   * @param sessionId - Session identifier
   * @returns Session metrics (duration, chunks forwarded, errors, connection state) or undefined if not found
   * @example
   * ```typescript
   * const metrics = sttController.getSessionMetrics(sessionId);
   * if (metrics) {
   *   console.log('Session errors:', metrics.errors);
   * }
   * ```
   */
  getSessionMetrics(sessionId: string): STTSessionMetrics | undefined {
    return sttService.getSessionMetrics(sessionId);
  }

  /**
   * Ensure Deepgram connection is ready for the session
   * Reconnects if connection was closed during previous finalization
   *
   * @param sessionId - Session identifier
   * @returns Promise that resolves when connection is ready
   * @example
   * ```typescript
   * await sttController.ensureConnectionReady(sessionId);
   * ```
   */
  async ensureConnectionReady(sessionId: string): Promise<void> {
    try {
      await sttService.ensureConnectionReady(sessionId);
      logger.debug('STT connection ensured ready via controller', { sessionId });
    } catch (error) {
      logger.error('STT controller: Failed to ensure connection ready', { sessionId, error });
      throw error;
    }
  }

  /**
   * Health check to verify STT service is operational
   *
   * @returns true if service is healthy (API key configured), false otherwise
   * @example
   * ```typescript
   * if (sttController.isHealthy()) {
   *   console.log('STT service is ready');
   * }
   * ```
   */
  isHealthy(): boolean {
    return sttService.isHealthy();
  }

  /**
   * Gracefully shutdown STT service, closing all active connections
   *
   * @param options - Optional shutdown options
   * @param options.restart - If true, restarts service after shutdown (for tests)
   * @returns Promise that resolves when shutdown is complete
   * @example
   * ```typescript
   * // Production shutdown (stays shut down)
   * await sttController.shutdown();
   *
   * // Test mode shutdown (restarts after cleanup)
   * await sttController.shutdown({ restart: true });
   * ```
   */
  async shutdown(options?: { restart?: boolean }): Promise<void> {
    await sttService.shutdown(options);
  }
}

// Export singleton instance
export const sttController = new STTController();
