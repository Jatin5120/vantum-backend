"use strict";
/**
 * TTS Retry Configuration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ttsRetryConfig = void 0;
exports.ttsRetryConfig = {
    // Maximum retry attempts
    maxRetries: 3,
    // Exponential backoff delays (milliseconds)
    baseDelay: 1000, // 1s
    maxDelay: 8000, // 8s
    backoffMultiplier: 2,
    // Retryable HTTP status codes
    retryableStatusCodes: [500, 502, 503, 504],
    // Connection retry delays (same pattern as STT)
    connectionRetryDelays: [1000, 2000, 4000], // 1s, 2s, 4s
    reconnectionRetryDelays: [500, 1000, 2000], // Faster for reconnection
    // Retry attempts
    initialMaxAttempts: 3,
    reconnectMaxAttempts: 3,
};
