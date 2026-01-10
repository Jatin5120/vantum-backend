/**
 * LLM Session Service
 * Manages conversation context (message history) per session
 * Stateful singleton service following Handler + Service pattern
 */

import { logger } from '@/shared/utils';
import { ConversationContext, ConversationMessage } from '../types';
import { promptsConfig, llmTimeoutConfig } from '../config';

export class LLMSessionServiceClass {
  private sessions = new Map<string, ConversationContext>();
  // eslint-disable-next-line no-undef
  private cleanupTimer?: NodeJS.Timeout;
  private readonly isTestMode = process.env.NODE_ENV === 'test';

  constructor() {
    // Start cleanup timer (not in test mode)
    if (!this.isTestMode) {
      this.startCleanupTimer();
    } else {
      logger.debug('LLM session service: Test mode detected, cleanup timer disabled');
    }
  }

  /**
   * Create new conversation context
   */
  createSession(sessionId: string): ConversationContext {
    const existingSession = this.sessions.get(sessionId);
    if (existingSession) {
      logger.warn('LLM session already exists', { sessionId });
      return existingSession;
    }

    const now = Date.now();
    const context: ConversationContext = {
      sessionId,
      messages: [
        {
          role: 'system',
          content: promptsConfig.systemPrompt,
          timestamp: now,
        },
      ],
      createdAt: now,
      lastMessageAt: now,
      messageCount: 1,
    };

    this.sessions.set(sessionId, context);
    logger.info('LLM session created', { sessionId });

    return context;
  }

  /**
   * Get conversation context
   */
  getSession(sessionId: string): ConversationContext | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Check if session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Add user message to context
   */
  addUserMessage(sessionId: string, message: string): void {
    const context = this.sessions.get(sessionId);
    if (!context) {
      logger.warn('Cannot add user message - session not found', { sessionId });
      return;
    }

    const msg: ConversationMessage = {
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };

    context.messages.push(msg);
    context.lastMessageAt = msg.timestamp;
    context.messageCount++;

    logger.debug('User message added to context', {
      sessionId,
      messageCount: context.messageCount,
    });
  }

  /**
   * Add assistant message to context
   */
  addAssistantMessage(sessionId: string, message: string): void {
    const context = this.sessions.get(sessionId);
    if (!context) {
      logger.warn('Cannot add assistant message - session not found', {
        sessionId,
      });
      return;
    }

    const msg: ConversationMessage = {
      role: 'assistant',
      content: message,
      timestamp: Date.now(),
    };

    context.messages.push(msg);
    context.lastMessageAt = msg.timestamp;
    context.messageCount++;

    logger.debug('Assistant message added to context', {
      sessionId,
      messageCount: context.messageCount,
    });
  }

  /**
   * Get conversation history for OpenAI API
   * Returns messages in OpenAI format (without timestamps)
   */
  getConversationHistory(sessionId: string): Array<{ role: string; content: string }> {
    const context = this.sessions.get(sessionId);
    if (!context) {
      logger.warn('Cannot get history - session not found', { sessionId });
      return [];
    }

    // Remove timestamp for OpenAI API
    return context.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Delete session and cleanup
   */
  deleteSession(sessionId: string): void {
    const context = this.sessions.get(sessionId);
    if (context) {
      this.sessions.delete(sessionId);
      logger.info('LLM session deleted', {
        sessionId,
        duration: Date.now() - context.createdAt,
        messageCount: context.messageCount,
      });
    }
  }

  /**
   * Get all sessions
   */
  getAllSessions(): ConversationContext[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, llmTimeoutConfig.cleanupInterval);

    logger.info('LLM session cleanup timer started', {
      intervalMs: llmTimeoutConfig.cleanupInterval,
    });
  }

  /**
   * Perform cleanup of stale sessions
   */
  private performCleanup(): void {
    try {
      const now = Date.now();
      const sessions = this.getAllSessions();
      const sessionsToDelete: string[] = [];

      for (const context of sessions) {
        const idle = now - context.lastMessageAt;
        const duration = now - context.createdAt;

        // Cleanup conditions
        const isIdle = idle > llmTimeoutConfig.sessionIdleTimeout;
        const isTooLong = duration > llmTimeoutConfig.sessionMaxDuration;
        const tooManyMessages =
          llmTimeoutConfig.maxMessagesPerContext > 0 &&
          context.messageCount > llmTimeoutConfig.maxMessagesPerContext;

        if (isIdle || isTooLong || tooManyMessages) {
          sessionsToDelete.push(context.sessionId);
          logger.info('Cleaning up stale LLM session', {
            sessionId: context.sessionId,
            reason: isIdle ? 'idle' : isTooLong ? 'duration' : 'message_limit',
            idleMs: idle,
            durationMs: duration,
            messageCount: context.messageCount,
          });
        }
      }

      // Delete stale sessions
      sessionsToDelete.forEach((sessionId) => this.deleteSession(sessionId));

      if (sessionsToDelete.length > 0) {
        logger.info('LLM session cleanup complete', {
          cleaned: sessionsToDelete.length,
          remaining: this.getSessionCount(),
        });
      }
    } catch (error) {
      logger.error('Error during LLM session cleanup', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Stop cleanup timer
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
      logger.debug('LLM session cleanup timer stopped');
    }
  }

  /**
   * Cleanup all sessions (for graceful shutdown)
   */
  cleanup(): void {
    try {
      this.stopCleanupTimer();
      const count = this.sessions.size;
      this.sessions.clear();
      logger.info('All LLM sessions cleared', { count });
    } catch (error) {
      logger.error('Error during LLM session cleanup', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.sessions.clear();
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = undefined;
      }
    }
  }
}

// Export singleton instance
export const llmSessionService = new LLMSessionServiceClass();
