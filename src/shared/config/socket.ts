/**
 * WebSocket Configuration
 * Native WebSocket configuration (following thine's pattern)
 */

/**
 * WebSocket server configuration
 */
export const websocketConfig = {
  // WebSocket path
  path: '/ws',
  
  // Maximum message size (10 MB for audio chunks)
  maxPayload: 10 * 1024 * 1024,
  
  // Per-message deflate compression
  perMessageDeflate: false, // Disable for lower latency with binary data
  
  // Client tracking
  clientTracking: true,
};

/**
 * MessagePack configuration
 * Using msgpackr defaults (no special config needed)
 */
export const messagePackConfig = {
  // msgpackr handles this automatically
  // No special configuration needed
};

/**
 * WebSocket server shutdown configuration
 */
export const websocketShutdownConfig = {
  // Timeout for graceful shutdown (milliseconds)
  shutdownTimeout: 5000,
  
  // Maximum number of concurrent connections
  maxConnections: 1000,
  
  // Rate limiting: max messages per second per connection
  maxMessagesPerSecond: 100,
};

