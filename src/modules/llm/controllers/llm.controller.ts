/**
 * LLM Controller
 * Public API for LLM operations
 * Stateless controller following Handler + Service pattern
 * P1-7 FIX: Added hasSession method for session existence check
 */

import { logger } from '@/shared/utils';
import { llmService } from '../services/llm.service';
import { LLMResponse, LLMServiceMetrics } from '../types';

export class LLMController {
  /**
   * Generate AI response for user message
   * @param sessionId - Session ID
   * @param userMessage - User's transcript from STT
   * @returns Promise<LLMResponse> - AI response with metadata
   */
  async generateResponse(sessionId: string, userMessage: string): Promise<LLMResponse> {
    try {
      // Validate inputs
      if (!sessionId || !sessionId.trim()) {
        throw new Error('sessionId is required');
      }

      if (!userMessage || !userMessage.trim()) {
        logger.warn('Empty user message provided', { sessionId });
        throw new Error('userMessage is required and cannot be empty');
      }

      logger.info('LLM request received', {
        sessionId,
        messageLength: userMessage.length,
        preview: userMessage.substring(0, 50) + '...',
      });

      // Generate response
      const response = await llmService.generateResponse(sessionId, userMessage);

      // Determine if fallback
      const isFallback = this.isFallbackMessage(response);

      logger.info('LLM response generated', {
        sessionId,
        responseLength: response.length,
        isFallback,
      });

      return {
        text: response,
        isFallback,
        tier: isFallback ? this.getFallbackTier(response) : undefined,
      };
    } catch (error) {
      logger.error('LLM controller error', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Initialize LLM session (optional - auto-created on first message)
   * @param sessionId - Session ID
   */
  async initializeSession(sessionId: string): Promise<void> {
    try {
      logger.info('Initializing LLM session', { sessionId });
      await llmService.createSession(sessionId);
    } catch (error) {
      logger.error('Failed to initialize LLM session', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * End LLM session and cleanup context
   * @param sessionId - Session ID
   */
  async endSession(sessionId: string): Promise<void> {
    try {
      logger.info('Ending LLM session', { sessionId });
      await llmService.endSession(sessionId);
    } catch (error) {
      logger.error('Failed to end LLM session', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - always try to cleanup
    }
  }

  /**
   * P1-7 FIX: Check if LLM session exists
   * Used by socket server to conditionally cleanup sessions
   * @param sessionId - Session ID
   * @returns True if session exists
   */
  hasSession(sessionId: string): boolean {
    return llmService.hasSession(sessionId);
  }

  /**
   * Check if LLM service is healthy
   */
  isHealthy(): boolean {
    return llmService.isHealthy();
  }

  /**
   * Get service metrics
   */
  getMetrics(): LLMServiceMetrics {
    return llmService.getMetrics();
  }

  /**
   * Check if response is a fallback message
   * @private
   */
  private isFallbackMessage(response: string): boolean {
    const fallbacks = [
      'I apologize, can you repeat that?',
      "I'm experiencing technical difficulties. Please hold.",
      "I apologize, I'm having connection issues. I'll have someone call you back.",
    ];
    return fallbacks.includes(response);
  }

  /**
   * Get fallback tier from message
   * @private
   */
  private getFallbackTier(response: string): number {
    if (response.includes('can you repeat that')) return 1;
    if (response.includes('technical difficulties')) return 2;
    if (response.includes('connection issues')) return 3;
    return 0;
  }
}

// Export singleton instance
export const llmController = new LLMController();
