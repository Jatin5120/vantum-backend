/**
 * Session Management Types
 */

// ============================================================================
// Session State
// ============================================================================

export enum SessionState {
  IDLE = 'idle',             // Session created but not active
  ACTIVE = 'active',         // Voice session in progress
  ENDED = 'ended',           // Session completed
}

// ============================================================================
// Session Interface
// ============================================================================

export interface Session {
  socketId: string;          // WebSocket connection ID
  sessionId: string;         // Unique session ID (UUID)
  state: SessionState;       // Current session state
  createdAt: number;         // Unix timestamp
  lastActivity: number;      // Last activity timestamp
  metadata: SessionMetadata;  // Additional session info
  conversationContext?: ConversationContext; // For future LLM integration
}

// ============================================================================
// Session Metadata
// ============================================================================

export interface SessionMetadata {
  ipAddress?: string;        // Client IP address
  userAgent?: string;        // Client user agent
  samplingRate?: number;     // Audio sampling rate
  voiceId?: string;          // TTS voice ID
  language?: string;         // Language code
}

// ============================================================================
// Conversation Context (for future LLM integration)
// ============================================================================

export interface ConversationContext {
  messages: ConversationMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// ============================================================================
// Session Configuration
// ============================================================================

export interface SessionConfig {
  idleTimeout: number;       // Milliseconds before idle session cleanup
  maxSessionDuration: number; // Maximum session duration (milliseconds)
  cleanupInterval: number;   // How often to check for expired sessions (milliseconds)
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  idleTimeout: 30 * 60 * 1000,      // 30 minutes
  maxSessionDuration: 2 * 60 * 60 * 1000, // 2 hours
  cleanupInterval: 5 * 60 * 1000,   // 5 minutes
};

