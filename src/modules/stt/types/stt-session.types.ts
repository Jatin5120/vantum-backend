/**
 * STT Session Types
 */

import type { ListenLiveClient } from '@deepgram/sdk';
import type { TranscriptSegment } from './transcript.types';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface STTSessionState {
  // Core Identifiers
  sessionId: string;
  connectionId: string;

  // Deepgram Connection
  deepgramLiveClient: ListenLiveClient | null;
  connectionState: ConnectionState;

  // Transcript Accumulation
  accumulatedTranscript: string;
  interimTranscript: string;
  lastTranscriptTime: number;
  transcriptSegments: TranscriptSegment[];

  // Audio Config
  config: {
    samplingRate: number;
    language: string;
    model: string;
  };

  // Retry State
  retryCount: number;
  lastRetryTime: number;
  reconnectAttempts: number;

  // Reconnection Buffering (Phase 2)
  reconnectionBuffer: Buffer[];
  lastReconnectionTime: number | null;
  isReconnecting: boolean;

  // KeepAlive Management
  keepAliveInterval?: NodeJS.Timeout;

  // Lifecycle
  createdAt: number;
  lastActivityAt: number;
  isActive: boolean;

  // Metrics
  metrics: {
    chunksReceived: number;
    chunksForwarded: number;
    transcriptsReceived: number;
    errors: number;
    reconnections: number;
    successfulReconnections: number;
    failedReconnections: number;
    totalDowntimeMs: number;
    bufferedChunksDuringReconnection: number;
  };
}

export interface STTConfig {
  sessionId: string;
  connectionId: string;
  samplingRate: number;
  language?: string;
}

export interface STTServiceMetrics {
  activeSessions: number;
  totalChunksForwarded: number;
  totalTranscriptsReceived: number;
  totalErrors: number;
  totalReconnections: number;
  totalSuccessfulReconnections: number;
  totalFailedReconnections: number;
  // Phase 3: Enhanced metrics
  peakConcurrentSessions: number;
  totalSessionsCreated: number;
  totalSessionsCleaned: number;
  averageSessionDurationMs: number;
  memoryUsageEstimateMB: number;
}

export interface STTSessionMetrics {
  sessionId: string;
  duration: number;
  chunksForwarded: number;
  transcriptsReceived: number;
  reconnections: number;
  successfulReconnections: number;
  failedReconnections: number;
  totalDowntimeMs: number;
  bufferedChunksDuringReconnection: number;
  errors: number;
  finalTranscriptLength: number;
  connectionState: ConnectionState;
}
