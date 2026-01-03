/**
 * STTController Unit Tests
 * Tests the public API gateway for STT module
 * Target Coverage: 90%+
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sttController } from '@/modules/stt/controllers/stt.controller';
import { sttService } from '@/modules/stt/services/stt.service';
import type { STTConfig } from '@/modules/stt/types';

// Mock the STT service
vi.mock('@/modules/stt/services/stt.service', () => ({
  sttService: {
    createSession: vi.fn(),
    forwardAudioChunk: vi.fn(),
    endSession: vi.fn(),
    getMetrics: vi.fn(),
    getSessionMetrics: vi.fn(),
    isHealthy: vi.fn(),
    shutdown: vi.fn(),
  },
}));

describe('STTController', () => {
  const mockSessionId = 'test-session-123';
  const mockConfig: STTConfig = {
    sessionId: mockSessionId,
    connectionId: 'test-connection-456',
    samplingRate: 16000,
    language: 'en-US',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createSession', () => {
    it('should create STT session with valid config', async () => {
      vi.mocked(sttService.createSession).mockResolvedValue(undefined);

      await expect(sttController.createSession(mockSessionId, mockConfig)).resolves.toBeUndefined();

      expect(sttService.createSession).toHaveBeenCalledWith(mockSessionId, mockConfig);
      expect(sttService.createSession).toHaveBeenCalledTimes(1);
    });

    it('should throw error when sessionId is missing', async () => {
      await expect(sttController.createSession('', mockConfig)).rejects.toThrow(
        'Invalid input: sessionId and config are required'
      );

      expect(sttService.createSession).not.toHaveBeenCalled();
    });

    it('should throw error when config is missing', async () => {
      await expect(
        sttController.createSession(mockSessionId, null as any)
      ).rejects.toThrow('Invalid input: sessionId and config are required');

      expect(sttService.createSession).not.toHaveBeenCalled();
    });

    it('should throw error when samplingRate is too low', async () => {
      const invalidConfig = { ...mockConfig, samplingRate: 7999 };

      await expect(sttController.createSession(mockSessionId, invalidConfig)).rejects.toThrow(
        'Invalid samplingRate: 7999. Must be between 8000 and 48000 Hz'
      );

      expect(sttService.createSession).not.toHaveBeenCalled();
    });

    it('should throw error when samplingRate is too high', async () => {
      const invalidConfig = { ...mockConfig, samplingRate: 48001 };

      await expect(sttController.createSession(mockSessionId, invalidConfig)).rejects.toThrow(
        'Invalid samplingRate: 48001. Must be between 8000 and 48000 Hz'
      );

      expect(sttService.createSession).not.toHaveBeenCalled();
    });

    it('should accept samplingRate at lower boundary (8000)', async () => {
      vi.mocked(sttService.createSession).mockResolvedValue(undefined);
      const validConfig = { ...mockConfig, samplingRate: 8000 };

      await expect(sttController.createSession(mockSessionId, validConfig)).resolves.toBeUndefined();

      expect(sttService.createSession).toHaveBeenCalledWith(mockSessionId, validConfig);
    });

    it('should accept samplingRate at upper boundary (48000)', async () => {
      vi.mocked(sttService.createSession).mockResolvedValue(undefined);
      const validConfig = { ...mockConfig, samplingRate: 48000 };

      await expect(sttController.createSession(mockSessionId, validConfig)).resolves.toBeUndefined();

      expect(sttService.createSession).toHaveBeenCalledWith(mockSessionId, validConfig);
    });

    it('should propagate service errors to caller', async () => {
      const serviceError = new Error('Deepgram connection failed');
      vi.mocked(sttService.createSession).mockRejectedValue(serviceError);

      await expect(sttController.createSession(mockSessionId, mockConfig)).rejects.toThrow(
        'Deepgram connection failed'
      );

      expect(sttService.createSession).toHaveBeenCalledWith(mockSessionId, mockConfig);
    });
  });

  describe('forwardChunk', () => {
    it('should forward audio chunk to service', async () => {
      const mockChunk = new Uint8Array([1, 2, 3, 4, 5]);
      vi.mocked(sttService.forwardAudioChunk).mockResolvedValue(undefined);

      await expect(
        sttController.forwardChunk(mockSessionId, mockChunk)
      ).resolves.toBeUndefined();

      expect(sttService.forwardAudioChunk).toHaveBeenCalledWith(mockSessionId, mockChunk);
      expect(sttService.forwardAudioChunk).toHaveBeenCalledTimes(1);
    });

    it('should not call service when sessionId is missing', async () => {
      const mockChunk = new Uint8Array([1, 2, 3]);

      await sttController.forwardChunk('', mockChunk);

      expect(sttService.forwardAudioChunk).not.toHaveBeenCalled();
    });

    it('should not call service when audioChunk is null', async () => {
      await sttController.forwardChunk(mockSessionId, null as any);

      expect(sttService.forwardAudioChunk).not.toHaveBeenCalled();
    });

    it('should not call service when audioChunk is empty', async () => {
      const emptyChunk = new Uint8Array([]);

      await sttController.forwardChunk(mockSessionId, emptyChunk);

      expect(sttService.forwardAudioChunk).not.toHaveBeenCalled();
    });

    it('should handle service errors gracefully (non-blocking)', async () => {
      const mockChunk = new Uint8Array([1, 2, 3]);
      vi.mocked(sttService.forwardAudioChunk).mockRejectedValue(new Error('Network error'));

      // Should not throw
      await expect(
        sttController.forwardChunk(mockSessionId, mockChunk)
      ).rejects.toThrow('Network error');

      expect(sttService.forwardAudioChunk).toHaveBeenCalled();
    });

    it('should handle large audio chunks', async () => {
      const largeChunk = new Uint8Array(65536); // 64KB chunk
      vi.mocked(sttService.forwardAudioChunk).mockResolvedValue(undefined);

      await sttController.forwardChunk(mockSessionId, largeChunk);

      expect(sttService.forwardAudioChunk).toHaveBeenCalledWith(mockSessionId, largeChunk);
    });
  });

  describe('endSession', () => {
    it('should end session and return final transcript', async () => {
      const mockTranscript = 'Hello world, this is a test transcript';
      vi.mocked(sttService.endSession).mockResolvedValue(mockTranscript);

      const result = await sttController.endSession(mockSessionId);

      expect(result).toBe(mockTranscript);
      expect(sttService.endSession).toHaveBeenCalledWith(mockSessionId);
      expect(sttService.endSession).toHaveBeenCalledTimes(1);
    });

    it('should return empty string when session not found', async () => {
      vi.mocked(sttService.endSession).mockResolvedValue('');

      const result = await sttController.endSession('non-existent-session');

      expect(result).toBe('');
      expect(sttService.endSession).toHaveBeenCalledWith('non-existent-session');
    });

    it('should return empty string on service error (graceful degradation)', async () => {
      vi.mocked(sttService.endSession).mockRejectedValue(new Error('Service error'));

      const result = await sttController.endSession(mockSessionId);

      expect(result).toBe('');
      expect(sttService.endSession).toHaveBeenCalledWith(mockSessionId);
    });

    it('should handle empty transcript from service', async () => {
      vi.mocked(sttService.endSession).mockResolvedValue('');

      const result = await sttController.endSession(mockSessionId);

      expect(result).toBe('');
    });

    it('should handle long transcripts', async () => {
      const longTranscript = 'word '.repeat(5000); // ~25KB transcript
      vi.mocked(sttService.endSession).mockResolvedValue(longTranscript);

      const result = await sttController.endSession(mockSessionId);

      expect(result).toBe(longTranscript);
      expect(result.length).toBeGreaterThanOrEqual(25000);
    });
  });

  describe('getMetrics', () => {
    it('should return service-level metrics', () => {
      const mockMetrics = {
        activeSessions: 3,
        totalChunksForwarded: 1500,
        totalTranscriptsReceived: 45,
        totalErrors: 2,
        totalReconnections: 1,
      };
      vi.mocked(sttService.getMetrics).mockReturnValue(mockMetrics);

      const result = sttController.getMetrics();

      expect(result).toEqual(mockMetrics);
      expect(sttService.getMetrics).toHaveBeenCalledTimes(1);
    });

    it('should return zero metrics when no sessions active', () => {
      const emptyMetrics = {
        activeSessions: 0,
        totalChunksForwarded: 0,
        totalTranscriptsReceived: 0,
        totalErrors: 0,
        totalReconnections: 0,
      };
      vi.mocked(sttService.getMetrics).mockReturnValue(emptyMetrics);

      const result = sttController.getMetrics();

      expect(result).toEqual(emptyMetrics);
      expect(result.activeSessions).toBe(0);
    });

    it('should handle metrics with high numbers', () => {
      const highMetrics = {
        activeSessions: 100,
        totalChunksForwarded: 1000000,
        totalTranscriptsReceived: 50000,
        totalErrors: 150,
        totalReconnections: 25,
      };
      vi.mocked(sttService.getMetrics).mockReturnValue(highMetrics);

      const result = sttController.getMetrics();

      expect(result).toEqual(highMetrics);
    });
  });

  describe('getSessionMetrics', () => {
    it('should return session-specific metrics when session exists', () => {
      const mockSessionMetrics = {
        sessionId: mockSessionId,
        duration: 45000,
        chunksForwarded: 500,
        transcriptsReceived: 15,
        reconnections: 0,
        errors: 1,
        finalTranscriptLength: 256,
        connectionState: 'connected' as const,
      };
      vi.mocked(sttService.getSessionMetrics).mockReturnValue(mockSessionMetrics);

      const result = sttController.getSessionMetrics(mockSessionId);

      expect(result).toEqual(mockSessionMetrics);
      expect(sttService.getSessionMetrics).toHaveBeenCalledWith(mockSessionId);
    });

    it('should return undefined when session not found', () => {
      vi.mocked(sttService.getSessionMetrics).mockReturnValue(undefined);

      const result = sttController.getSessionMetrics('non-existent-session');

      expect(result).toBeUndefined();
      expect(sttService.getSessionMetrics).toHaveBeenCalledWith('non-existent-session');
    });

    it('should return metrics for session with errors', () => {
      const errorMetrics = {
        sessionId: mockSessionId,
        duration: 10000,
        chunksForwarded: 100,
        transcriptsReceived: 5,
        reconnections: 3,
        errors: 25,
        finalTranscriptLength: 50,
        connectionState: 'error' as const,
      };
      vi.mocked(sttService.getSessionMetrics).mockReturnValue(errorMetrics);

      const result = sttController.getSessionMetrics(mockSessionId);

      expect(result).toEqual(errorMetrics);
      expect(result?.errors).toBe(25);
      expect(result?.connectionState).toBe('error');
    });

    it('should return metrics for disconnected session', () => {
      const disconnectedMetrics = {
        sessionId: mockSessionId,
        duration: 30000,
        chunksForwarded: 300,
        transcriptsReceived: 10,
        reconnections: 0,
        errors: 0,
        finalTranscriptLength: 150,
        connectionState: 'disconnected' as const,
      };
      vi.mocked(sttService.getSessionMetrics).mockReturnValue(disconnectedMetrics);

      const result = sttController.getSessionMetrics(mockSessionId);

      expect(result?.connectionState).toBe('disconnected');
    });
  });

  describe('isHealthy', () => {
    it('should return true when service is healthy', () => {
      vi.mocked(sttService.isHealthy).mockReturnValue(true);

      const result = sttController.isHealthy();

      expect(result).toBe(true);
      expect(sttService.isHealthy).toHaveBeenCalledTimes(1);
    });

    it('should return false when service is unhealthy', () => {
      vi.mocked(sttService.isHealthy).mockReturnValue(false);

      const result = sttController.isHealthy();

      expect(result).toBe(false);
      expect(sttService.isHealthy).toHaveBeenCalledTimes(1);
    });

    it('should be callable multiple times', () => {
      vi.mocked(sttService.isHealthy).mockReturnValue(true);

      const result1 = sttController.isHealthy();
      const result2 = sttController.isHealthy();
      const result3 = sttController.isHealthy();

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(true);
      expect(sttService.isHealthy).toHaveBeenCalledTimes(3);
    });
  });

  describe('shutdown', () => {
    it('should shutdown service gracefully with restart option', async () => {
      vi.mocked(sttService.shutdown).mockResolvedValue(undefined);

      await expect(sttController.shutdown({ restart: true })).resolves.toBeUndefined();

      expect(sttService.shutdown).toHaveBeenCalledTimes(1);
      expect(sttService.shutdown).toHaveBeenCalledWith({ restart: true });
    });

    it('should shutdown service gracefully in production mode', async () => {
      vi.mocked(sttService.shutdown).mockResolvedValue(undefined);

      await expect(sttController.shutdown()).resolves.toBeUndefined();

      expect(sttService.shutdown).toHaveBeenCalledTimes(1);
      expect(sttService.shutdown).toHaveBeenCalledWith(undefined);
    });

    it('should handle shutdown errors', async () => {
      const shutdownError = new Error('Shutdown error');
      vi.mocked(sttService.shutdown).mockRejectedValue(shutdownError);

      await expect(sttController.shutdown({ restart: true })).rejects.toThrow('Shutdown error');

      expect(sttService.shutdown).toHaveBeenCalledTimes(1);
    });

    it('should be idempotent (callable multiple times)', async () => {
      vi.mocked(sttService.shutdown).mockResolvedValue(undefined);

      await sttController.shutdown({ restart: true });
      await sttController.shutdown({ restart: true });
      await sttController.shutdown({ restart: true });

      expect(sttService.shutdown).toHaveBeenCalledTimes(3);
    });
  });

  describe('Integration: Complete session lifecycle', () => {
    it('should handle complete lifecycle: create → forward → end', async () => {
      const mockChunk = new Uint8Array([1, 2, 3]);
      const mockTranscript = 'Complete transcript';

      vi.mocked(sttService.createSession).mockResolvedValue(undefined);
      vi.mocked(sttService.forwardAudioChunk).mockResolvedValue(undefined);
      vi.mocked(sttService.endSession).mockResolvedValue(mockTranscript);

      // Create session
      await sttController.createSession(mockSessionId, mockConfig);
      expect(sttService.createSession).toHaveBeenCalled();

      // Forward chunks
      await sttController.forwardChunk(mockSessionId, mockChunk);
      await sttController.forwardChunk(mockSessionId, mockChunk);
      expect(sttService.forwardAudioChunk).toHaveBeenCalledTimes(2);

      // End session
      const transcript = await sttController.endSession(mockSessionId);
      expect(transcript).toBe(mockTranscript);
      expect(sttService.endSession).toHaveBeenCalled();
    });
  });
});
