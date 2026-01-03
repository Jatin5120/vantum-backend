/**
 * STTSessionService Unit Tests
 * Tests session state management
 * Target Coverage: 80%+
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  STTSession,
  STTSessionService,
} from '@/modules/stt/services/stt-session.service';

describe('STTSession', () => {
  const mockSessionId = 'test-session-123';
  const mockConnectionId = 'test-connection-456';
  const mockConfig = {
    samplingRate: 16000,
    language: 'en-US',
  };

  let session: STTSession;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    session = new STTSession(mockSessionId, mockConnectionId, mockConfig);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(session.sessionId).toBe(mockSessionId);
      expect(session.connectionId).toBe(mockConnectionId);
      expect(session.config.samplingRate).toBe(16000);
      expect(session.config.language).toBe('en-US');
      expect(session.config.model).toBe('nova-2');
      expect(session.deepgramLiveClient).toBeNull();
      expect(session.connectionState).toBe('connecting');
      expect(session.accumulatedTranscript).toBe('');
      expect(session.interimTranscript).toBe('');
      expect(session.isActive).toBe(true);
      expect(session.retryCount).toBe(0);
      expect(session.reconnectAttempts).toBe(0);
    });

    it('should initialize timestamps', () => {
      const expectedTime = new Date('2024-01-01T00:00:00Z').getTime();
      expect(session.createdAt).toBe(expectedTime);
      expect(session.lastActivityAt).toBe(expectedTime);
      expect(session.lastTranscriptTime).toBe(expectedTime);
    });

    it('should initialize metrics to zero', () => {
      expect(session.metrics.chunksReceived).toBe(0);
      expect(session.metrics.chunksForwarded).toBe(0);
      expect(session.metrics.transcriptsReceived).toBe(0);
      expect(session.metrics.errors).toBe(0);
      expect(session.metrics.reconnections).toBe(0);
    });

    it('should accept different sampling rates', () => {
      const session8k = new STTSession(mockSessionId, mockConnectionId, {
        samplingRate: 8000,
        language: 'en-US',
      });
      expect(session8k.config.samplingRate).toBe(8000);

      const session48k = new STTSession(mockSessionId, mockConnectionId, {
        samplingRate: 48000,
        language: 'en-US',
      });
      expect(session48k.config.samplingRate).toBe(48000);
    });

    it('should accept different languages', () => {
      const spanishSession = new STTSession(mockSessionId, mockConnectionId, {
        samplingRate: 16000,
        language: 'es-ES',
      });
      expect(spanishSession.config.language).toBe('es-ES');
    });
  });

  describe('touch', () => {
    it('should update lastActivityAt timestamp', () => {
      const initialTime = session.lastActivityAt;

      vi.advanceTimersByTime(5000); // Advance 5 seconds
      session.touch();

      expect(session.lastActivityAt).toBeGreaterThan(initialTime);
      expect(session.lastActivityAt).toBe(initialTime + 5000);
    });

    it('should be callable multiple times', () => {
      const initialTime = session.lastActivityAt;

      vi.advanceTimersByTime(1000);
      session.touch();
      const time1 = session.lastActivityAt;

      vi.advanceTimersByTime(1000);
      session.touch();
      const time2 = session.lastActivityAt;

      expect(time1).toBe(initialTime + 1000);
      expect(time2).toBe(initialTime + 2000);
    });
  });

  describe('addTranscript', () => {
    it('should add final transcript to accumulated text', () => {
      session.addTranscript('Hello world', 0.95, true);

      expect(session.accumulatedTranscript).toBe('Hello world ');
      expect(session.interimTranscript).toBe('');
      expect(session.metrics.transcriptsReceived).toBe(1);
    });

    it('should set interim transcript for non-final results', () => {
      session.addTranscript('Hello', 0.85, false);

      expect(session.accumulatedTranscript).toBe('');
      expect(session.interimTranscript).toBe('Hello');
      expect(session.metrics.transcriptsReceived).toBe(1);
    });

    it('should accumulate multiple final transcripts', () => {
      session.addTranscript('Hello', 0.95, true);
      session.addTranscript('world', 0.93, true);
      session.addTranscript('from', 0.97, true);
      session.addTranscript('Vantum', 0.96, true);

      expect(session.accumulatedTranscript).toBe('Hello world from Vantum ');
      expect(session.metrics.transcriptsReceived).toBe(4);
    });

    it('should clear interim transcript when final transcript arrives', () => {
      session.addTranscript('Hel', 0.75, false);
      expect(session.interimTranscript).toBe('Hel');

      session.addTranscript('Hello', 0.95, true);
      expect(session.interimTranscript).toBe('');
      expect(session.accumulatedTranscript).toBe('Hello ');
    });

    it('should update transcript segment history', () => {
      const initialTime = Date.now();

      session.addTranscript('First', 0.95, true);
      vi.advanceTimersByTime(1000);
      session.addTranscript('Second', 0.93, false);

      expect(session.transcriptSegments).toHaveLength(2);
      expect(session.transcriptSegments[0].text).toBe('First');
      expect(session.transcriptSegments[0].confidence).toBe(0.95);
      expect(session.transcriptSegments[0].isFinal).toBe(true);
      expect(session.transcriptSegments[0].timestamp).toBe(initialTime);

      expect(session.transcriptSegments[1].text).toBe('Second');
      expect(session.transcriptSegments[1].confidence).toBe(0.93);
      expect(session.transcriptSegments[1].isFinal).toBe(false);
      expect(session.transcriptSegments[1].timestamp).toBe(initialTime + 1000);
    });

    it('should update lastTranscriptTime', () => {
      const initialTime = session.lastTranscriptTime;

      vi.advanceTimersByTime(2000);
      session.addTranscript('Test', 0.9, true);

      expect(session.lastTranscriptTime).toBe(initialTime + 2000);
    });

    it('should handle low confidence transcripts', () => {
      session.addTranscript('Uncertain text', 0.35, false);

      expect(session.interimTranscript).toBe('Uncertain text');
      expect(session.transcriptSegments[0].confidence).toBe(0.35);
    });

    it('should handle empty transcripts', () => {
      session.addTranscript('', 0.0, true);

      expect(session.accumulatedTranscript).toBe(' '); // Still adds space
      expect(session.metrics.transcriptsReceived).toBe(1);
    });
  });

  describe('getFinalTranscript', () => {
    it('should return trimmed accumulated transcript', () => {
      session.addTranscript('Hello', 0.95, true);
      session.addTranscript('world', 0.93, true);

      const result = session.getFinalTranscript();

      expect(result).toBe('Hello world');
      expect(result).not.toContain('  '); // No double spaces
    });

    it('should return empty string when no transcripts', () => {
      const result = session.getFinalTranscript();

      expect(result).toBe('');
    });

    it('should not include interim transcripts', () => {
      session.addTranscript('Final', 0.95, true);
      session.addTranscript('Interim', 0.85, false);

      const result = session.getFinalTranscript();

      expect(result).toBe('Final');
      expect(result).not.toContain('Interim');
    });
  });

  describe('getDuration', () => {
    it('should return session duration in milliseconds', () => {
      vi.advanceTimersByTime(45000); // 45 seconds

      const duration = session.getDuration();

      expect(duration).toBe(45000);
    });

    it('should return 0 immediately after creation', () => {
      const duration = session.getDuration();

      expect(duration).toBe(0);
    });

    it('should increase over time', () => {
      const duration1 = session.getDuration();

      vi.advanceTimersByTime(10000);
      const duration2 = session.getDuration();

      vi.advanceTimersByTime(20000);
      const duration3 = session.getDuration();

      expect(duration1).toBe(0);
      expect(duration2).toBe(10000);
      expect(duration3).toBe(30000);
    });
  });

  describe('getInactivityDuration', () => {
    it('should return time since last activity', () => {
      vi.advanceTimersByTime(5000);
      session.touch();

      vi.advanceTimersByTime(10000);

      const inactivity = session.getInactivityDuration();

      expect(inactivity).toBe(10000);
    });

    it('should return 0 immediately after touch', () => {
      session.touch();

      const inactivity = session.getInactivityDuration();

      expect(inactivity).toBe(0);
    });

    it('should reset when touched', () => {
      vi.advanceTimersByTime(15000);
      expect(session.getInactivityDuration()).toBe(15000);

      session.touch();
      expect(session.getInactivityDuration()).toBe(0);

      vi.advanceTimersByTime(5000);
      expect(session.getInactivityDuration()).toBe(5000);
    });
  });

  describe('cleanup', () => {
    it('should close Deepgram client if exists', () => {
      const mockClient = {
        requestClose: vi.fn(),
      };
      session.deepgramLiveClient = mockClient as any;

      session.cleanup();

      expect(mockClient.requestClose).toHaveBeenCalled();
      expect(session.deepgramLiveClient).toBeNull();
      expect(session.isActive).toBe(false);
    });

    it('should handle null Deepgram client', () => {
      session.deepgramLiveClient = null;

      expect(() => session.cleanup()).not.toThrow();
      expect(session.isActive).toBe(false);
    });

    it('should handle client close errors gracefully', () => {
      const mockClient = {
        requestClose: vi.fn(() => {
          throw new Error('Close error');
        }),
      };
      session.deepgramLiveClient = mockClient as any;

      expect(() => session.cleanup()).not.toThrow();
      expect(session.deepgramLiveClient).toBeNull();
      expect(session.isActive).toBe(false);
    });

    it('should set isActive to false', () => {
      expect(session.isActive).toBe(true);

      session.cleanup();

      expect(session.isActive).toBe(false);
    });

    it('should clear reconnection buffer on cleanup', () => {
      // Add some chunks to buffer
      const chunk1 = Buffer.from([1, 2, 3]);
      const chunk2 = Buffer.from([4, 5, 6]);

      session.reconnectionBuffer.push(chunk1, chunk2);
      expect(session.reconnectionBuffer.length).toBe(2);

      session.cleanup();

      expect(session.reconnectionBuffer.length).toBe(0);
    });
  });

  describe('Reconnection Buffer Management (Phase 2)', () => {
    it('should add chunks to reconnection buffer', () => {
      const chunk1 = Buffer.from([1, 2, 3, 4]);
      const chunk2 = Buffer.from([5, 6, 7, 8]);

      session.addToReconnectionBuffer(chunk1);
      session.addToReconnectionBuffer(chunk2);

      expect(session.reconnectionBuffer.length).toBe(2);
      expect(session.metrics.bufferedChunksDuringReconnection).toBe(2);
    });

    it('should reject chunks larger than 32KB', () => {
      const MAX_BUFFER_SIZE = 32 * 1024; // 32KB
      const hugeChunk = Buffer.alloc(MAX_BUFFER_SIZE + 1);

      session.addToReconnectionBuffer(hugeChunk);

      expect(session.reconnectionBuffer.length).toBe(0);
      expect(session.metrics.bufferedChunksDuringReconnection).toBe(0);
    });

    it('should remove oldest chunks when buffer exceeds 32KB', () => {
      const MAX_BUFFER_SIZE = 32 * 1024; // 32KB

      // Add chunks totaling 31KB (should fit)
      const chunk1 = Buffer.alloc(15 * 1024); // 15KB
      const chunk2 = Buffer.alloc(15 * 1024); // 15KB
      session.addToReconnectionBuffer(chunk1);
      session.addToReconnectionBuffer(chunk2);

      expect(session.reconnectionBuffer.length).toBe(2);

      // Add chunk that would exceed max (2KB more)
      const chunk3 = Buffer.alloc(3 * 1024); // 3KB
      session.addToReconnectionBuffer(chunk3);

      // First chunk should be removed
      expect(session.reconnectionBuffer.length).toBe(2);
      expect(session.reconnectionBuffer[0]).toBe(chunk2);
      expect(session.reconnectionBuffer[1]).toBe(chunk3);
    });

    it('should not grow buffer beyond 32KB even with large chunks', () => {
      const MAX_BUFFER_SIZE = 32 * 1024; // 32KB

      // Add multiple 10KB chunks
      for (let i = 0; i < 5; i++) {
        const chunk = Buffer.alloc(10 * 1024); // 10KB each
        session.addToReconnectionBuffer(chunk);
      }

      // Calculate total buffer size
      const totalSize = session.reconnectionBuffer.reduce((sum, chunk) => sum + chunk.length, 0);

      expect(totalSize).toBeLessThanOrEqual(MAX_BUFFER_SIZE);
    });

    it('should flush buffer and return all chunks', () => {
      const chunk1 = Buffer.from([1, 2, 3]);
      const chunk2 = Buffer.from([4, 5, 6]);
      const chunk3 = Buffer.from([7, 8, 9]);

      session.addToReconnectionBuffer(chunk1);
      session.addToReconnectionBuffer(chunk2);
      session.addToReconnectionBuffer(chunk3);

      const flushed = session.flushReconnectionBuffer();

      expect(flushed.length).toBe(3);
      expect(flushed[0]).toEqual(chunk1);
      expect(flushed[1]).toEqual(chunk2);
      expect(flushed[2]).toEqual(chunk3);
      expect(session.reconnectionBuffer.length).toBe(0);
    });

    it('should clear buffer and discard all chunks', () => {
      const chunk1 = Buffer.from([1, 2, 3]);
      const chunk2 = Buffer.from([4, 5, 6]);

      session.addToReconnectionBuffer(chunk1);
      session.addToReconnectionBuffer(chunk2);

      expect(session.reconnectionBuffer.length).toBe(2);

      session.clearReconnectionBuffer();

      expect(session.reconnectionBuffer.length).toBe(0);
    });

    it('should track bufferedChunksDuringReconnection metric', () => {
      expect(session.metrics.bufferedChunksDuringReconnection).toBe(0);

      const chunk1 = Buffer.from([1, 2, 3]);
      const chunk2 = Buffer.from([4, 5, 6]);
      const chunk3 = Buffer.from([7, 8, 9]);

      session.addToReconnectionBuffer(chunk1);
      expect(session.metrics.bufferedChunksDuringReconnection).toBe(1);

      session.addToReconnectionBuffer(chunk2);
      expect(session.metrics.bufferedChunksDuringReconnection).toBe(2);

      session.addToReconnectionBuffer(chunk3);
      expect(session.metrics.bufferedChunksDuringReconnection).toBe(3);
    });

    it('should handle adding chunk equal to MAX_BUFFER_SIZE', () => {
      const MAX_BUFFER_SIZE = 32 * 1024; // 32KB
      const exactMaxChunk = Buffer.alloc(MAX_BUFFER_SIZE);

      session.addToReconnectionBuffer(exactMaxChunk);

      // Chunk exactly at max size should be rejected (implementation rejects chunks >= MAX)
      // Looking at the code, it rejects chunks > MAX, so equal should be accepted
      expect(session.reconnectionBuffer.length).toBe(1);
    });

    it('should handle empty buffer flush', () => {
      const flushed = session.flushReconnectionBuffer();

      expect(flushed).toEqual([]);
      expect(session.reconnectionBuffer.length).toBe(0);
    });

    it('should handle multiple flushes', () => {
      const chunk1 = Buffer.from([1, 2, 3]);
      session.addToReconnectionBuffer(chunk1);

      const flushed1 = session.flushReconnectionBuffer();
      expect(flushed1.length).toBe(1);
      expect(session.reconnectionBuffer.length).toBe(0);

      const chunk2 = Buffer.from([4, 5, 6]);
      session.addToReconnectionBuffer(chunk2);

      const flushed2 = session.flushReconnectionBuffer();
      expect(flushed2.length).toBe(1);
      expect(session.reconnectionBuffer.length).toBe(0);
    });

    it('should handle buffer operations during edge case with exact boundary', () => {
      const MAX_BUFFER_SIZE = 32 * 1024; // 32KB

      // Add chunk just under max
      const chunk1 = Buffer.alloc(MAX_BUFFER_SIZE - 100);
      session.addToReconnectionBuffer(chunk1);

      expect(session.reconnectionBuffer.length).toBe(1);

      // Add small chunk that fits exactly
      const chunk2 = Buffer.alloc(50);
      session.addToReconnectionBuffer(chunk2);

      expect(session.reconnectionBuffer.length).toBe(2);
      expect(session.reconnectionBuffer[0]).toBe(chunk1);
      expect(session.reconnectionBuffer[1]).toBe(chunk2);
    });
  });
});

describe('STTSessionService', () => {
  let service: STTSessionService;
  const mockSessionId = 'test-session-123';
  const mockConnectionId = 'test-connection-456';
  const mockConfig = {
    samplingRate: 16000,
    language: 'en-US',
  };

  beforeEach(() => {
    service = new STTSessionService();
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('createSession', () => {
    it('should create and store new session', () => {
      const session = service.createSession(mockSessionId, mockConnectionId, mockConfig);

      expect(session).toBeDefined();
      expect(session.sessionId).toBe(mockSessionId);
      expect(session.connectionId).toBe(mockConnectionId);
      expect(session.config.samplingRate).toBe(16000);
      expect(session.config.language).toBe('en-US');
    });

    it('should create multiple independent sessions', () => {
      const session1 = service.createSession('session-1', 'conn-1', mockConfig);
      const session2 = service.createSession('session-2', 'conn-2', mockConfig);
      const session3 = service.createSession('session-3', 'conn-3', mockConfig);

      expect(service.getSessionCount()).toBe(3);
      expect(session1.sessionId).not.toBe(session2.sessionId);
      expect(session2.sessionId).not.toBe(session3.sessionId);
    });

    it('should allow creating session with same ID after deletion', () => {
      service.createSession(mockSessionId, mockConnectionId, mockConfig);
      service.deleteSession(mockSessionId);

      const newSession = service.createSession(mockSessionId, 'new-conn', mockConfig);

      expect(newSession.sessionId).toBe(mockSessionId);
      expect(newSession.connectionId).toBe('new-conn');
    });
  });

  describe('getSession', () => {
    it('should retrieve existing session', () => {
      const created = service.createSession(mockSessionId, mockConnectionId, mockConfig);

      const retrieved = service.getSession(mockSessionId);

      expect(retrieved).toBeDefined();
      expect(retrieved).toBe(created); // Same instance
      expect(retrieved!.sessionId).toBe(mockSessionId);
    });

    it('should return undefined for non-existent session', () => {
      const session = service.getSession('non-existent-id');

      expect(session).toBeUndefined();
    });

    it('should return undefined after session deletion', () => {
      service.createSession(mockSessionId, mockConnectionId, mockConfig);
      service.deleteSession(mockSessionId);

      const session = service.getSession(mockSessionId);

      expect(session).toBeUndefined();
    });
  });

  describe('hasSession', () => {
    it('should return true for existing session', () => {
      service.createSession(mockSessionId, mockConnectionId, mockConfig);

      expect(service.hasSession(mockSessionId)).toBe(true);
    });

    it('should return false for non-existent session', () => {
      expect(service.hasSession('non-existent-id')).toBe(false);
    });

    it('should return false after session deletion', () => {
      service.createSession(mockSessionId, mockConnectionId, mockConfig);
      service.deleteSession(mockSessionId);

      expect(service.hasSession(mockSessionId)).toBe(false);
    });
  });

  describe('deleteSession', () => {
    it('should delete existing session', () => {
      service.createSession(mockSessionId, mockConnectionId, mockConfig);

      service.deleteSession(mockSessionId);

      expect(service.getSession(mockSessionId)).toBeUndefined();
      expect(service.getSessionCount()).toBe(0);
    });

    it('should call cleanup on session before deletion', () => {
      const session = service.createSession(mockSessionId, mockConnectionId, mockConfig);
      const cleanupSpy = vi.spyOn(session, 'cleanup');

      service.deleteSession(mockSessionId);

      expect(cleanupSpy).toHaveBeenCalled();
    });

    it('should handle deleting non-existent session gracefully', () => {
      expect(() => service.deleteSession('non-existent-id')).not.toThrow();
    });

    it('should not affect other sessions', () => {
      service.createSession('session-1', 'conn-1', mockConfig);
      service.createSession('session-2', 'conn-2', mockConfig);
      service.createSession('session-3', 'conn-3', mockConfig);

      service.deleteSession('session-2');

      expect(service.getSessionCount()).toBe(2);
      expect(service.hasSession('session-1')).toBe(true);
      expect(service.hasSession('session-2')).toBe(false);
      expect(service.hasSession('session-3')).toBe(true);
    });
  });

  describe('getAllSessions', () => {
    it('should return all active sessions', () => {
      service.createSession('session-1', 'conn-1', mockConfig);
      service.createSession('session-2', 'conn-2', mockConfig);
      service.createSession('session-3', 'conn-3', mockConfig);

      const sessions = service.getAllSessions();

      expect(sessions).toHaveLength(3);
      expect(sessions.map((s) => s.sessionId)).toContain('session-1');
      expect(sessions.map((s) => s.sessionId)).toContain('session-2');
      expect(sessions.map((s) => s.sessionId)).toContain('session-3');
    });

    it('should return empty array when no sessions', () => {
      const sessions = service.getAllSessions();

      expect(sessions).toEqual([]);
      expect(sessions).toHaveLength(0);
    });

    it('should return array copy (not affecting internal state)', () => {
      service.createSession(mockSessionId, mockConnectionId, mockConfig);

      const sessions = service.getAllSessions();
      sessions.pop(); // Modify returned array

      expect(service.getSessionCount()).toBe(1); // Internal state unchanged
    });
  });

  describe('getSessionCount', () => {
    it('should return correct count of sessions', () => {
      expect(service.getSessionCount()).toBe(0);

      service.createSession('session-1', 'conn-1', mockConfig);
      expect(service.getSessionCount()).toBe(1);

      service.createSession('session-2', 'conn-2', mockConfig);
      expect(service.getSessionCount()).toBe(2);

      service.deleteSession('session-1');
      expect(service.getSessionCount()).toBe(1);

      service.deleteSession('session-2');
      expect(service.getSessionCount()).toBe(0);
    });

    it('should handle large number of sessions', () => {
      for (let i = 0; i < 100; i++) {
        service.createSession(`session-${i}`, `conn-${i}`, mockConfig);
      }

      expect(service.getSessionCount()).toBe(100);
    });
  });

  describe('cleanup', () => {
    it('should cleanup all sessions', () => {
      const session1 = service.createSession('session-1', 'conn-1', mockConfig);
      const session2 = service.createSession('session-2', 'conn-2', mockConfig);
      const session3 = service.createSession('session-3', 'conn-3', mockConfig);

      const cleanup1 = vi.spyOn(session1, 'cleanup');
      const cleanup2 = vi.spyOn(session2, 'cleanup');
      const cleanup3 = vi.spyOn(session3, 'cleanup');

      service.cleanup();

      expect(cleanup1).toHaveBeenCalled();
      expect(cleanup2).toHaveBeenCalled();
      expect(cleanup3).toHaveBeenCalled();
      expect(service.getSessionCount()).toBe(0);
    });

    it('should handle cleanup with no sessions', () => {
      expect(() => service.cleanup()).not.toThrow();
      expect(service.getSessionCount()).toBe(0);
    });

    it('should remove all sessions after cleanup', () => {
      service.createSession('session-1', 'conn-1', mockConfig);
      service.createSession('session-2', 'conn-2', mockConfig);

      service.cleanup();

      expect(service.getSessionCount()).toBe(0);
      expect(service.getAllSessions()).toEqual([]);
    });
  });
});
