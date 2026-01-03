/**
 * Retry Configuration
 * Defines retry strategies for various error scenarios
 */

/**
 * Initial Connection Retry Strategy (Hybrid)
 * - User is waiting for connection
 * - Fast initial attempts: 0ms, 100ms, 1s (total ~1s)
 * - Then slow backoff: 3s, 5s (total ~9s)
 * - Max attempts: 5
 * - Total timeout: ~9 seconds
 */
export const INITIAL_CONNECTION = {
  delays: [0, 100, 1000, 3000, 5000], // milliseconds
  maxAttempts: 5,
  totalTimeout: 10000, // 10 seconds max
} as const;

/**
 * Mid-Stream Reconnection Strategy (Fast Only)
 * - Call is in progress
 * - Minimize disruption
 * - Fast retries only: 0ms, 100ms, 500ms (total <1s)
 * - Max attempts: 3
 * - Give up quickly to avoid audio gap
 */
export const MID_STREAM_RECONNECTION = {
  delays: [0, 100, 500], // milliseconds
  maxAttempts: 3,
  totalTimeout: 1000, // 1 second max
} as const;

export const RETRY_CONFIG = {
  // Initial connection retry (hybrid: fast then slow)
  CONNECTION_RETRY_DELAYS: INITIAL_CONNECTION.delays,

  // Mid-stream reconnection (fast retries only)
  RECONNECTION_RETRY_DELAYS: MID_STREAM_RECONNECTION.delays,

  // Error-specific retry delays
  RATE_LIMIT_DELAYS: [5000, 10000, 20000], // 429 errors
  SERVICE_UNAVAILABLE_DELAYS: [1000, 3000, 5000], // 503 errors
  SERVER_ERROR_DELAYS: [0, 500, 1000], // 500, 502, 504
  NETWORK_ERROR_DELAYS: [0, 100, 500], // Network timeouts

  // Max attempts by mode
  INITIAL_MAX_ATTEMPTS: INITIAL_CONNECTION.maxAttempts,
  RECONNECT_MAX_ATTEMPTS: MID_STREAM_RECONNECTION.maxAttempts,
} as const;
