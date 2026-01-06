/**
 * TTS Session Types
 */

/**
 * Emittery event listener type
 * Cartesia SDK uses Emittery for event handling
 * This is a simplified interface compatible with Cartesia's connection events
 * @see https://github.com/sindresorhus/emittery
 */
export interface EmitteryCallbacks {
  on: (event: string | string[], listener: (...args: any[]) => void | Promise<void>) => any;
  off: (event?: string | string[], listener?: (...args: any[]) => void | Promise<void>) => void;
}

export type TTSConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export enum TTSState {
  IDLE = 'idle',
  GENERATING = 'generating',
  STREAMING = 'streaming',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  ERROR = 'error',
}

export interface TTSConfig {
  sessionId: string;
  connectionId: string;
  voiceId: string;
  language: string;
  speed?: number;
}

export interface SynthesisOptions {
  voiceId?: string;
  speed?: number;
  language?: string;
}

export interface TTSSessionData {
  // Core Identifiers
  sessionId: string;
  connectionId: string;

  // Connection state
  connectionState: TTSConnectionState;
  cartesiaClient: unknown | null; // Placeholder for Cartesia WebSocket client
  connectionEvents: unknown | null; // Connection event emitter from Cartesia SDK (for cleanup)
  isReconnecting: boolean;

  // Synthesis state
  ttsState: TTSState;
  currentUtteranceId: string | null;
  textBuffer: string; // Buffer for incomplete sentences
  synthesisMutex: boolean; // P1-3: Prevents concurrent synthesis calls

  // Configuration
  config: TTSConfig;

  // Reconnection buffering
  reconnectionBuffer: string[]; // Text buffer during reconnection
  lastReconnectionTime: number | null;

  // KeepAlive management
  keepAliveInterval?: NodeJS.Timeout;

  // Lifecycle
  createdAt: number;
  lastActivityAt: number;
  isActive: boolean;

  // Metrics
  metrics: TTSSessionMetrics;

  // Retry state
  retryCount: number;
  lastRetryTime: number;
}

export interface TTSSessionMetrics {
  // Synthesis metrics
  textsSynthesized: number;
  chunksGenerated: number;
  chunksSent: number;

  // Error tracking
  errors: number;
  synthesisErrors: number;
  connectionErrors: number;

  // Reconnection tracking
  reconnections: number;
  successfulReconnections: number;
  failedReconnections: number;
  totalDowntimeMs: number;
  bufferedTextsDuringReconnection: number;

  // Performance
  averageSynthesisTimeMs: number;
  totalSynthesisTimeMs: number;
}

export interface TTSServiceMetrics {
  activeSessions: number;
  totalTextsSynthesized: number;
  totalChunksGenerated: number;
  totalChunksSent: number;
  totalErrors: number;
  totalReconnections: number;
  totalSuccessfulReconnections: number;
  totalFailedReconnections: number;
  peakConcurrentSessions: number;
  totalSessionsCreated: number;
  totalSessionsCleaned: number;
  averageSessionDurationMs: number;
  memoryUsageEstimateMB: number;
}
