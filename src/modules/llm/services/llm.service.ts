/**
 * LLM Service
 * Core business logic for OpenAI GPT-4.1 integration with semantic streaming
 * Stateful singleton service following Handler + Service pattern
 *
 * Integration with semantic streaming:
 * - Buffers complete LLM response first
 * - Then processes through streaming service for chunking
 * - Sends chunks to TTS progressively for better UX
 *
 * Size: ~380 lines (approaching upper limit)
 * Future: Consider splitting if exceeds 400 lines:
 *   - Extract OpenAI client wrapper to separate service
 *   - Extract queue management to separate utility
 */

import OpenAI from 'openai';
import { logger } from '@/shared/utils';
import { llmSessionService } from './llm-session.service';
import { llmStreamingService } from './llm-streaming.service';
import { openaiConfig, llmRetryConfig } from '../config';
import { LLMServiceMetrics, QueuedRequest } from '../types';

export class LLMServiceClass {
  private openai: OpenAI;
  private failureCounts = new Map<string, number>(); // sessionId -> failure count
  private requestQueues = new Map<string, QueuedRequest[]>(); // sessionId -> queue
  private processingFlags = new Map<string, boolean>(); // sessionId -> is processing

  // Metrics
  private totalRequests = 0;
  private totalSuccesses = 0;
  private totalFailures = 0;
  private tier1Fallbacks = 0;
  private tier2Fallbacks = 0;
  private tier3Fallbacks = 0;
  private responseTimes: number[] = [];
  private peakConcurrentSessions = 0;

  constructor() {
    // Validate configuration
    openaiConfig.validate();

    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: openaiConfig.apiKey,
      organization: openaiConfig.organization,
      timeout: openaiConfig.timeout,
    });

    logger.info('LLM service initialized', {
      model: openaiConfig.model,
      temperature: openaiConfig.temperature,
    });
  }

  /**
   * Generate response from OpenAI with semantic streaming
   * Queues request if session is busy
   *
   * NOTE: This now returns void but sends TTS chunks progressively
   * The TTS integration is done by semantic streaming service
   */
  async generateResponse(sessionId: string, userMessage: string): Promise<string> {
    this.totalRequests++;

    // Create session if doesn't exist
    if (!llmSessionService.hasSession(sessionId)) {
      llmSessionService.createSession(sessionId);
    }

    // Check if processing
    if (this.processingFlags.get(sessionId)) {
      logger.debug('Session busy, queueing request', { sessionId });
      return this.queueRequest(sessionId, userMessage);
    }

    // Process immediately
    return this.processRequest(sessionId, userMessage);
  }

  /**
   * Queue request for later processing
   */
  private queueRequest(sessionId: string, userMessage: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const queue = this.requestQueues.get(sessionId) || [];

      // Check queue overflow (prevent memory exhaustion)
      if (llmRetryConfig.maxQueueSize > 0 && queue.length >= llmRetryConfig.maxQueueSize) {
        const error = new Error(
          `Request queue full for session ${sessionId} (max: ${llmRetryConfig.maxQueueSize})`
        );
        logger.error('Queue overflow - rejecting request', {
          sessionId,
          queueSize: queue.length,
          maxQueueSize: llmRetryConfig.maxQueueSize,
        });
        reject(error);
        return;
      }

      queue.push({
        userMessage,
        resolve,
        reject,
        timestamp: Date.now(),
      });
      this.requestQueues.set(sessionId, queue);

      logger.debug('Request queued', {
        sessionId,
        queueSize: queue.length,
        maxQueueSize: llmRetryConfig.maxQueueSize,
      });
    });
  }

  /**
   * Process queued requests
   */
  private async processQueue(sessionId: string): Promise<void> {
    const queue = this.requestQueues.get(sessionId);
    if (!queue || queue.length === 0) {
      return;
    }

    const request = queue.shift();
    if (!request) {
      return; // Should never happen due to length check above
    }
    this.requestQueues.set(sessionId, queue);

    try {
      const response = await this.processRequest(sessionId, request.userMessage);
      request.resolve(response);
    } catch (error) {
      request.reject(error as Error);
    }
  }

  /**
   * Process single request with semantic streaming
   */
  private async processRequest(sessionId: string, userMessage: string): Promise<string> {
    const startTime = Date.now();
    this.processingFlags.set(sessionId, true);

    try {
      // Add user message to context
      llmSessionService.addUserMessage(sessionId, userMessage);

      // Call OpenAI
      const response = await this.callOpenAIWithStreaming(sessionId);

      // Success - record metrics
      this.totalSuccesses++;
      this.failureCounts.set(sessionId, 0);
      const duration = Date.now() - startTime;
      this.responseTimes.push(duration);

      // Add assistant message to context
      llmSessionService.addAssistantMessage(sessionId, response);

      logger.info('LLM response generated with semantic streaming', {
        sessionId,
        durationMs: duration,
        responseLength: response.length,
      });

      return response;
    } catch (error) {
      // Failure - use fallback
      this.totalFailures++;
      const attemptNumber = this.incrementFailureCount(sessionId);
      const fallback = this.getFallbackMessage(sessionId, attemptNumber);

      logger.error('LLM API call failed', {
        sessionId,
        attempt: attemptNumber,
        error: error instanceof Error ? error.message : String(error),
      });

      // Add fallback to context (maintains conversation coherence)
      llmSessionService.addAssistantMessage(sessionId, fallback);

      // Send fallback to TTS
      const { ttsController } = await import('@/modules/tts');
      await ttsController.synthesize(sessionId, fallback);

      return fallback;
    } finally {
      this.processingFlags.set(sessionId, false);

      // Process next in queue
      await this.processQueue(sessionId);
    }
  }

  /**
   * Call OpenAI API with streaming and semantic chunking
   * Buffers full response, then processes through streaming service
   */
  private async callOpenAIWithStreaming(sessionId: string): Promise<string> {
    const messages = llmSessionService.getConversationHistory(sessionId);

    logger.debug('Calling OpenAI API with semantic streaming', {
      sessionId,
      messageCount: messages.length,
      model: openaiConfig.model,
    });

    const stream = await this.openai.chat.completions.create({
      model: openaiConfig.model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      temperature: openaiConfig.temperature,
      max_tokens: openaiConfig.maxTokens,
      top_p: openaiConfig.topP,
      frequency_penalty: openaiConfig.frequencyPenalty,
      presence_penalty: openaiConfig.presencePenalty,
      stream: true,
    });

    // Buffer streaming response
    let completeResponse = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      completeResponse += content;
    }

    if (!completeResponse.trim()) {
      throw new Error('OpenAI returned empty response');
    }

    logger.debug('OpenAI streaming complete, starting semantic chunking', {
      sessionId,
      responseLength: completeResponse.length,
    });

    // Process with semantic chunking and send to TTS progressively
    try {
      const tokenStream = this.convertTextToTokenStream(completeResponse);
      await llmStreamingService.processStream(sessionId, tokenStream);
    } catch (streamingError) {
      logger.error('Semantic streaming failed, still returning complete response', {
        sessionId,
        error: streamingError instanceof Error ? streamingError.message : String(streamingError),
      });
      // Continue anyway - response is still valid
    }

    return completeResponse.trim();
  }

  /**
   * Convert text to async iterable of tokens (for semantic streaming)
   * In production with true OpenAI streaming, this would yield tokens as they arrive
   * For now, we yield the complete response which the streaming service will chunk
   */
  private async *convertTextToTokenStream(text: string): AsyncIterable<string> {
    yield text;
  }

  /**
   * Get fallback message based on attempt number
   */
  private getFallbackMessage(sessionId: string, attemptNumber: number): string {
    let fallback: string;

    if (attemptNumber === 1) {
      this.tier1Fallbacks++;
      fallback = llmRetryConfig.fallbackMessages.tier1;
      logger.warn('Using Tier 1 fallback', { sessionId });
    } else if (attemptNumber === 2) {
      this.tier2Fallbacks++;
      fallback = llmRetryConfig.fallbackMessages.tier2;
      logger.warn('Using Tier 2 fallback', { sessionId });
    } else {
      this.tier3Fallbacks++;
      fallback = llmRetryConfig.fallbackMessages.tier3;
      logger.error('Using Tier 3 fallback (graceful exit)', { sessionId });
      // Future: Trigger session end or transfer to human
    }

    return fallback;
  }

  /**
   * Increment failure count for session
   */
  private incrementFailureCount(sessionId: string): number {
    const current = this.failureCounts.get(sessionId) || 0;
    const next = current + 1;
    this.failureCounts.set(sessionId, next);
    return next;
  }

  /**
   * Create LLM session (auto-called if doesn't exist)
   */
  async createSession(sessionId: string): Promise<void> {
    llmSessionService.createSession(sessionId);
    logger.info('LLM session created', { sessionId });
  }

  /**
   * End LLM session and cleanup
   */
  async endSession(sessionId: string): Promise<void> {
    llmSessionService.deleteSession(sessionId);
    this.failureCounts.delete(sessionId);
    this.requestQueues.delete(sessionId);
    this.processingFlags.delete(sessionId);
    logger.info('LLM session ended', { sessionId });
  }

  /**
   * Check if session exists
   */
  hasSession(sessionId: string): boolean {
    return llmSessionService.hasSession(sessionId);
  }

  /**
   * Health check
   */
  isHealthy(): boolean {
    return !!openaiConfig.apiKey;
  }

  /**
   * Get service metrics
   */
  getMetrics(): LLMServiceMetrics {
    // Update peak sessions
    const currentSessions = llmSessionService.getSessionCount();
    if (currentSessions > this.peakConcurrentSessions) {
      this.peakConcurrentSessions = currentSessions;
    }

    // Calculate average response time
    const avgResponseTime =
      this.responseTimes.length > 0
        ? this.responseTimes.reduce((sum, t) => sum + t, 0) / this.responseTimes.length
        : 0;

    return {
      activeSessions: currentSessions,
      totalRequests: this.totalRequests,
      totalSuccesses: this.totalSuccesses,
      totalFailures: this.totalFailures,
      averageResponseTimeMs: Math.round(avgResponseTime),
      tier1Fallbacks: this.tier1Fallbacks,
      tier2Fallbacks: this.tier2Fallbacks,
      tier3Fallbacks: this.tier3Fallbacks,
      peakConcurrentSessions: this.peakConcurrentSessions,
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('LLM service shutdown initiated', {
      activeSessions: llmSessionService.getSessionCount(),
    });

    llmSessionService.cleanup();

    // Clear all state
    this.failureCounts.clear();
    this.requestQueues.clear();
    this.processingFlags.clear();

    logger.info('LLM service shutdown complete');
  }
}

// Export singleton instance
export const llmService = new LLMServiceClass();
