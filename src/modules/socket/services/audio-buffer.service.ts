/**
 * Audio Buffer Service
 * Buffers audio chunks for echo/loopback testing
 * TODO: Remove this when real STT/LLM/TTS pipeline is implemented
 */

import { logger } from '@/shared/utils';

interface BufferedAudioChunk {
  audio: Uint8Array;
  timestamp: number;
}

interface SessionAudioBuffer {
  sessionId: string;
  chunks: BufferedAudioChunk[];
  samplingRate: number;
  startEventId: string; // eventId from audio.start
  createdAt: number;
}

export class AudioBufferService {
  private buffers = new Map<string, SessionAudioBuffer>();

  /**
   * Initialize buffer for a session
   */
  initializeBuffer(
    sessionId: string,
    samplingRate: number,
    startEventId: string
  ): void {
    this.buffers.set(sessionId, {
      sessionId,
      chunks: [],
      samplingRate,
      startEventId,
      createdAt: Date.now(),
    });
    logger.debug('Audio buffer initialized', { sessionId, samplingRate });
  }

  /**
   * Add audio chunk to buffer
   */
  addChunk(sessionId: string, audio: Uint8Array): void {
    const buffer = this.buffers.get(sessionId);
    if (!buffer) {
      logger.warn('No buffer found for session', { sessionId });
      return;
    }

    buffer.chunks.push({
      audio,
      timestamp: Date.now(),
    });
  }

  /**
   * Get all buffered chunks for a session
   */
  getChunks(sessionId: string): BufferedAudioChunk[] | null {
    const buffer = this.buffers.get(sessionId);
    if (!buffer) {
      return null;
    }
    return buffer.chunks;
  }

  /**
   * Get buffer metadata
   */
  getBuffer(sessionId: string): SessionAudioBuffer | undefined {
    return this.buffers.get(sessionId);
  }

  /**
   * Clear buffer for a session
   */
  clearBuffer(sessionId: string): void {
    const buffer = this.buffers.get(sessionId);
    if (buffer) {
      logger.debug('Audio buffer cleared', {
        sessionId,
        chunkCount: buffer.chunks.length,
      });
      this.buffers.delete(sessionId);
    }
  }

  /**
   * Get all active buffer count
   */
  getActiveCount(): number {
    return this.buffers.size;
  }

  /**
   * Cleanup all buffers (for graceful shutdown)
   */
  cleanup(): void {
    logger.info('Cleaning up all audio buffers', {
      count: this.buffers.size,
    });
    this.buffers.clear();
  }
}

// Export singleton instance
export const audioBufferService = new AudioBufferService();

