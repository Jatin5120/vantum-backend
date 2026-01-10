/**
 * LLM Module Type Definitions
 * All types used across the LLM module
 */

/**
 * Single message in conversation
 */
export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/**
 * Conversation context stored per session
 */
export interface ConversationContext {
  sessionId: string;
  messages: ConversationMessage[];
  createdAt: number;
  lastMessageAt: number;
  messageCount: number;
}

/**
 * LLM service configuration
 */
export interface LLMConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  apiKey: string;
  timeout: number;
}

/**
 * LLM service metrics
 */
export interface LLMServiceMetrics {
  activeSessions: number;
  totalRequests: number;
  totalSuccesses: number;
  totalFailures: number;
  averageResponseTimeMs: number;
  tier1Fallbacks: number;
  tier2Fallbacks: number;
  tier3Fallbacks: number;
  peakConcurrentSessions: number;
}

/**
 * OpenAI error types for classification
 * Currently defined for future error handling enhancements
 */
/* eslint-disable no-unused-vars */
export enum OpenAIErrorType {
  NETWORK = 'network',
  AUTH = 'auth',
  RATE_LIMIT = 'rate_limit',
  TIMEOUT = 'timeout',
  INVALID_REQUEST = 'invalid',
  SERVER = 'server',
  UNKNOWN = 'unknown',
}
/* eslint-enable no-unused-vars */

/**
 * Classified error with metadata
 */
export interface ClassifiedError {
  type: OpenAIErrorType;
  retryable: boolean;
  message: string;
  statusCode?: number;
}

/**
 * LLM response to client
 */
export interface LLMResponse {
  text: string;
  isFallback: boolean;
  tier?: number;
}

/**
 * Request queue item
 */
export interface QueuedRequest {
  userMessage: string;
  // eslint-disable-next-line no-unused-vars
  resolve: (response: string) => void;
  // eslint-disable-next-line no-unused-vars
  reject: (error: Error) => void;
  timestamp: number;
}

/**
 * Semantic chunk extracted from LLM response
 */
export interface SemanticChunk {
  text: string;
  wordCount: number;
  charCount: number;
  chunkNumber: number;
}

/**
 * Chunking result with complete chunks and remainder
 */
export interface ChunkingResult {
  chunks: SemanticChunk[];
  remaining: string;
}

/**
 * Chunking strategy used for extraction
 */
export type ChunkingStrategy = 'marker' | 'semantic' | 'sentence' | 'buffer';

/**
 * Streaming metrics
 */
export interface StreamingMetrics {
  totalChunksStreamed: number;
  totalChunksToTTS: number;
  averageChunkSize: number;
  maxChunkSize: number;
  fallbacksUsed: number;
  markerChunksProcessed?: number; // Optional field for debugging (per-stream)
}
