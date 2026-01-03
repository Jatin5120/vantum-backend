/**
 * STT Session Service
 * Manages STT session state (internal to stt module)
 */

import { logger } from '@/shared/utils';
import type { ListenLiveClient } from '@deepgram/sdk';
import { STT_CONSTANTS } from '../config/timeout.config';
import type {
  STTSessionState,
  TranscriptSegment,
  ConnectionState,
} from '../types';

export class STTSession implements STTSessionState {
  sessionId: string;
  connectionId: string;
  deepgramLiveClient: ListenLiveClient | null = null;
  connectionState: ConnectionState = 'connecting';
  accumulatedTranscript = '';
  interimTranscript = '';
  lastTranscriptTime: number;
  transcriptSegments: TranscriptSegment[] = [];
  config: { samplingRate: number; language: string; model: string };
  retryCount = 0;
  lastRetryTime = 0;
  reconnectAttempts = 0;

  // Phase 2: Reconnection buffering
  reconnectionBuffer: Buffer[] = [];
  lastReconnectionTime: number | null = null;
  isReconnecting = false;

  // KeepAlive interval management
  keepAliveInterval?: NodeJS.Timeout;

  // Finalization state tracking
  isFinalizingTranscript = false;
  finalizationTimeoutHandle?: NodeJS.Timeout;

  createdAt: number;
  lastActivityAt: number;
  lastActivityTimestamp: number; // Phase 3: For cleanup timer
  isActive = true;
  metrics = {
    chunksReceived: 0,
    chunksForwarded: 0,
    transcriptsReceived: 0,
    errors: 0,
    reconnections: 0,
    successfulReconnections: 0,
    failedReconnections: 0,
    totalDowntimeMs: 0,
    bufferedChunksDuringReconnection: 0,
    finalizationMethod: null as 'event' | 'timeout' | null,
  };

  constructor(
    sessionId: string,
    connectionId: string,
    config: { samplingRate: number; language: string }
  ) {
    this.sessionId = sessionId;
    this.connectionId = connectionId;
    this.config = {
      samplingRate: config.samplingRate,
      language: config.language,
      model: 'nova-2',
    };
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();
    this.lastActivityTimestamp = Date.now(); // Phase 3
    this.lastTranscriptTime = Date.now();
  }

  touch(): void {
    this.lastActivityAt = Date.now();
    this.lastActivityTimestamp = Date.now(); // Phase 3
  }

  addTranscript(text: string, confidence: number, isFinal: boolean): void {
    if (isFinal) {
      const lengthBefore = this.accumulatedTranscript.length;
      this.accumulatedTranscript += text + ' ';
      const lengthAfter = this.accumulatedTranscript.length;

      // Debug log to verify accumulation is working
      logger.debug('📝 Accumulated final transcript', {
        sessionId: this.sessionId,
        chunkText: text,
        chunkLength: text.length,
        lengthBefore,
        lengthAfter,
        accumulatedSoFar: this.accumulatedTranscript.substring(0, 100) + '...', // Show first 100 chars
      });

      this.interimTranscript = '';
    } else {
      this.interimTranscript = text;
    }

    this.transcriptSegments.push({
      text,
      timestamp: Date.now(),
      confidence,
      isFinal,
    });

    this.lastTranscriptTime = Date.now();
    this.metrics.transcriptsReceived++;
  }

  getFinalTranscript(): string {
    // Return accumulated final transcripts
    let finalTranscript = this.accumulatedTranscript.trim();

    // Check if the last transcript segment is an unfinalized interim
    // This handles cases where the last utterance didn't get finalized before session ended
    if (this.transcriptSegments.length > 0) {
      const lastSegment = this.transcriptSegments[this.transcriptSegments.length - 1];

      // If the last segment is interim (not final), append it
      if (!lastSegment.isFinal && lastSegment.text && lastSegment.text.trim().length > 0) {
        if (finalTranscript) {
          // Append to existing final transcripts
          finalTranscript += ' ' + lastSegment.text.trim();
          logger.info('Appended unfinalized interim to final transcript', {
            sessionId: this.sessionId,
            interimText: lastSegment.text,
            totalLength: finalTranscript.length,
          });
        } else {
          // No final transcripts, use interim as fallback
          finalTranscript = lastSegment.text.trim();
          logger.info('No final transcript, using last interim as fallback', {
            sessionId: this.sessionId,
            interimTranscript: lastSegment.text,
          });
        }
      }
    }

    return finalTranscript;
  }

  getDuration(): number {
    return Date.now() - this.createdAt;
  }

  getInactivityDuration(): number {
    return Date.now() - this.lastActivityAt;
  }

  /**
   * Add audio chunk to reconnection buffer (Phase 2)
   * Used during reconnection to prevent audio data loss
   */
  addToReconnectionBuffer(audioChunk: Buffer): void {
    // Limit buffer size: max 2 seconds of audio at 16kHz (32KB)
    const MAX_BUFFER_SIZE = STT_CONSTANTS.MAX_RECONNECTION_BUFFER_BYTES;

    // Reject chunks larger than max buffer size
    if (audioChunk.length > MAX_BUFFER_SIZE) {
      logger.warn('Audio chunk exceeds max buffer size, discarding', {
        sessionId: this.sessionId,
        chunkSize: audioChunk.length,
        maxSize: MAX_BUFFER_SIZE,
      });
      return;
    }

    // Remove oldest chunks until new chunk fits
    while (this.reconnectionBuffer.length > 0) {
      const currentSize = this.reconnectionBuffer.reduce(
        (total, chunk) => total + chunk.length,
        0
      );

      if (currentSize + audioChunk.length <= MAX_BUFFER_SIZE) {
        break; // Fits now
      }

      const removed = this.reconnectionBuffer.shift();
      logger.debug('Reconnection buffer full, discarded oldest chunk', {
        sessionId: this.sessionId,
        discardedSize: removed!.length,
        remainingChunks: this.reconnectionBuffer.length,
      });
    }

    this.reconnectionBuffer.push(audioChunk);
    this.metrics.bufferedChunksDuringReconnection++;
  }

  /**
   * Flush reconnection buffer after successful reconnection (Phase 2)
   */
  flushReconnectionBuffer(): Buffer[] {
    const bufferedChunks = [...this.reconnectionBuffer];
    this.reconnectionBuffer = [];
    logger.debug('Flushed reconnection buffer', {
      sessionId: this.sessionId,
      chunkCount: bufferedChunks.length,
    });
    return bufferedChunks;
  }

  /**
   * Clear reconnection buffer on failure (Phase 2)
   */
  clearReconnectionBuffer(): void {
    const count = this.reconnectionBuffer.length;
    this.reconnectionBuffer = [];
    logger.debug('Cleared reconnection buffer', { sessionId: this.sessionId, chunkCount: count });
  }

  /**
   * Get total size of reconnection buffer in bytes
   * Used for memory tracking
   */
  getReconnectionBufferSize(): number {
    return this.reconnectionBuffer.reduce((total, chunk) => total + chunk.length, 0);
  }

  cleanup(): void {
    // Clear KeepAlive interval
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = undefined;
    }

    // Clear finalization timeout
    if (this.finalizationTimeoutHandle) {
      clearTimeout(this.finalizationTimeoutHandle);
      this.finalizationTimeoutHandle = undefined;
    }

    if (this.deepgramLiveClient) {
      try {
        this.deepgramLiveClient.requestClose();
      } catch (error) {
        logger.error('Error closing Deepgram client', { sessionId: this.sessionId, error });
      }
      this.deepgramLiveClient = null;
    }
    this.clearReconnectionBuffer();
    this.isActive = false;
  }
}

/**
 * STT Session Service
 * Manages session Map (internal to stt module)
 */
export class STTSessionService {
  private sessions = new Map<string, STTSession>();

  createSession(
    sessionId: string,
    connectionId: string,
    config: { samplingRate: number; language: string }
  ): STTSession {
    const session = new STTSession(sessionId, connectionId, config);
    this.sessions.set(sessionId, session);
    logger.debug('STT session created in service', { sessionId });
    return session;
  }

  getSession(sessionId: string): STTSession | undefined {
    return this.sessions.get(sessionId);
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  deleteSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.cleanup();
      this.sessions.delete(sessionId);
      logger.debug('STT session deleted from service', { sessionId });
    }
  }

  getAllSessions(): STTSession[] {
    return Array.from(this.sessions.values());
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  cleanup(): void {
    logger.info('Cleaning up all STT sessions', { count: this.sessions.size });
    this.sessions.forEach((session) => session.cleanup());
    this.sessions.clear();
  }
}

// Export singleton instance
export const sttSessionService = new STTSessionService();
