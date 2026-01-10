/**
 * Timeout Configuration
 * Session timeouts, cleanup intervals, and context limits
 */

export const llmTimeoutConfig = {
  // Request timeouts
  requestTimeout: parseInt(process.env.LLM_REQUEST_TIMEOUT || '30000', 10), // 30s
  streamingTimeout: parseInt(process.env.LLM_STREAMING_TIMEOUT || '60000', 10), // 60s

  // Session timeouts
  sessionIdleTimeout: parseInt(process.env.LLM_SESSION_IDLE_TIMEOUT || '1800000', 10), // 30 min
  sessionMaxDuration: parseInt(process.env.LLM_SESSION_MAX_DURATION || '7200000', 10), // 2 hours

  // Cleanup
  cleanupInterval: parseInt(process.env.LLM_CLEANUP_INTERVAL || '300000', 10), // 5 min

  // Context limits (0 = unlimited)
  maxMessagesPerContext: parseInt(process.env.LLM_MAX_MESSAGES || '0', 10),
  maxContextTokens: parseInt(process.env.LLM_MAX_CONTEXT_TOKENS || '0', 10),
} as const;
