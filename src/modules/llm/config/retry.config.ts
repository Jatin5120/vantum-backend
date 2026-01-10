/**
 * Retry and Fallback Configuration
 * 3-tier fallback messages and retry settings
 */

export const llmRetryConfig = {
  // Fallback messages (3-tier strategy)
  fallbackMessages: {
    tier1: process.env.LLM_FALLBACK_TIER1 || 'I apologize, can you repeat that?',
    tier2:
      process.env.LLM_FALLBACK_TIER2 || "I'm experiencing technical difficulties. Please hold.",
    tier3:
      process.env.LLM_FALLBACK_TIER3 ||
      "I apologize, I'm having connection issues. I'll have someone call you back.",
  },

  // Retry configuration (not implemented in MVP)
  maxRetries: parseInt(process.env.LLM_MAX_RETRIES || '0', 10),
  retryDelays: [1000, 2000, 4000], // ms

  /**
   * Maximum requests that can be queued per session
   * Set to 0 to disable limit (not recommended for production)
   * Prevents memory exhaustion from excessive queueing
   */
  maxQueueSize: parseInt(process.env.LLM_MAX_QUEUE_SIZE || '10', 10),
} as const;
