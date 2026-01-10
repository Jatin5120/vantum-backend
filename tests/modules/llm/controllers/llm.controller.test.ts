/**
 * LLM Controller Unit Tests
 * Tests the public API gateway for LLM module
 * Target Coverage: 90%+
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { llmController } from '@/modules/llm/controllers/llm.controller';
import { llmService } from '@/modules/llm/services/llm.service';

// Mock the LLM service
vi.mock('@/modules/llm/services/llm.service', () => ({
  llmService: {
    generateResponse: vi.fn(),
    createSession: vi.fn(),
    endSession: vi.fn(),
    isHealthy: vi.fn(),
    getMetrics: vi.fn(),
  },
}));

describe('LLMController', () => {
  const mockSessionId = 'test-session-123';
  const mockUserMessage = 'Hello, I need help with sales';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Input Validation', () => {
    it('should reject empty sessionId', async () => {
      await expect(llmController.generateResponse('', mockUserMessage)).rejects.toThrow(
        'sessionId is required'
      );
    });

    it('should reject whitespace-only sessionId', async () => {
      await expect(llmController.generateResponse('   ', mockUserMessage)).rejects.toThrow(
        'sessionId is required'
      );
    });

    it('should reject null sessionId', async () => {
      await expect(llmController.generateResponse(null as any, mockUserMessage)).rejects.toThrow(
        'sessionId is required'
      );
    });

    it('should reject empty userMessage', async () => {
      await expect(llmController.generateResponse(mockSessionId, '')).rejects.toThrow(
        'userMessage is required and cannot be empty'
      );
    });

    it('should reject whitespace-only userMessage', async () => {
      await expect(llmController.generateResponse(mockSessionId, '   ')).rejects.toThrow(
        'userMessage is required and cannot be empty'
      );
    });

    it('should reject null userMessage', async () => {
      await expect(llmController.generateResponse(mockSessionId, null as any)).rejects.toThrow(
        'userMessage is required and cannot be empty'
      );
    });

    it('should accept valid inputs', async () => {
      vi.mocked(llmService.generateResponse).mockResolvedValue('This is a response');

      await expect(
        llmController.generateResponse(mockSessionId, mockUserMessage)
      ).resolves.toBeDefined();
    });
  });

  describe('generateResponse', () => {
    it('should call llmService with correct parameters', async () => {
      vi.mocked(llmService.generateResponse).mockResolvedValue('AI response text');

      await llmController.generateResponse(mockSessionId, mockUserMessage);

      expect(llmService.generateResponse).toHaveBeenCalledWith(mockSessionId, mockUserMessage);
      expect(llmService.generateResponse).toHaveBeenCalledTimes(1);
    });

    it('should return response with correct structure', async () => {
      vi.mocked(llmService.generateResponse).mockResolvedValue('AI response text');

      const result = await llmController.generateResponse(mockSessionId, mockUserMessage);

      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('isFallback');
      expect(typeof result.text).toBe('string');
      expect(typeof result.isFallback).toBe('boolean');
    });

    it('should mark non-fallback response correctly', async () => {
      const aiResponse = 'This is a normal AI response';
      vi.mocked(llmService.generateResponse).mockResolvedValue(aiResponse);

      const result = await llmController.generateResponse(mockSessionId, mockUserMessage);

      expect(result.text).toBe(aiResponse);
      expect(result.isFallback).toBe(false);
      expect(result.tier).toBeUndefined();
    });

    it('should detect Tier 1 fallback message', async () => {
      const fallbackMessage = 'I apologize, can you repeat that?';
      vi.mocked(llmService.generateResponse).mockResolvedValue(fallbackMessage);

      const result = await llmController.generateResponse(mockSessionId, mockUserMessage);

      expect(result.text).toBe(fallbackMessage);
      expect(result.isFallback).toBe(true);
      expect(result.tier).toBe(1);
    });

    it('should detect Tier 2 fallback message', async () => {
      const fallbackMessage = "I'm experiencing technical difficulties. Please hold.";
      vi.mocked(llmService.generateResponse).mockResolvedValue(fallbackMessage);

      const result = await llmController.generateResponse(mockSessionId, mockUserMessage);

      expect(result.text).toBe(fallbackMessage);
      expect(result.isFallback).toBe(true);
      expect(result.tier).toBe(2);
    });

    it('should detect Tier 3 fallback message', async () => {
      const fallbackMessage =
        "I apologize, I'm having connection issues. I'll have someone call you back.";
      vi.mocked(llmService.generateResponse).mockResolvedValue(fallbackMessage);

      const result = await llmController.generateResponse(mockSessionId, mockUserMessage);

      expect(result.text).toBe(fallbackMessage);
      expect(result.isFallback).toBe(true);
      expect(result.tier).toBe(3);
    });

    it('should handle llmService errors gracefully', async () => {
      const error = new Error('API Error');
      vi.mocked(llmService.generateResponse).mockRejectedValue(error);

      await expect(llmController.generateResponse(mockSessionId, mockUserMessage)).rejects.toThrow(
        'API Error'
      );
    });

    it('should handle long user messages', async () => {
      const longMessage = 'a'.repeat(1000);
      vi.mocked(llmService.generateResponse).mockResolvedValue('Response');

      await expect(
        llmController.generateResponse(mockSessionId, longMessage)
      ).resolves.toBeDefined();

      expect(llmService.generateResponse).toHaveBeenCalledWith(mockSessionId, longMessage);
    });

    it('should handle special characters in message', async () => {
      const specialMessage = 'Hello! @#$%^&*() How are you? 你好';
      vi.mocked(llmService.generateResponse).mockResolvedValue('Response');

      await expect(
        llmController.generateResponse(mockSessionId, specialMessage)
      ).resolves.toBeDefined();

      expect(llmService.generateResponse).toHaveBeenCalledWith(mockSessionId, specialMessage);
    });
  });

  describe('initializeSession', () => {
    it('should call llmService.createSession', async () => {
      vi.mocked(llmService.createSession).mockResolvedValue(undefined);

      await llmController.initializeSession(mockSessionId);

      expect(llmService.createSession).toHaveBeenCalledWith(mockSessionId);
      expect(llmService.createSession).toHaveBeenCalledTimes(1);
    });

    it('should resolve successfully', async () => {
      vi.mocked(llmService.createSession).mockResolvedValue(undefined);

      await expect(llmController.initializeSession(mockSessionId)).resolves.toBeUndefined();
    });

    it('should handle errors', async () => {
      const error = new Error('Initialization failed');
      vi.mocked(llmService.createSession).mockRejectedValue(error);

      await expect(llmController.initializeSession(mockSessionId)).rejects.toThrow(
        'Initialization failed'
      );
    });
  });

  describe('endSession', () => {
    it('should call llmService.endSession', async () => {
      vi.mocked(llmService.endSession).mockResolvedValue(undefined);

      await llmController.endSession(mockSessionId);

      expect(llmService.endSession).toHaveBeenCalledWith(mockSessionId);
      expect(llmService.endSession).toHaveBeenCalledTimes(1);
    });

    it('should resolve successfully', async () => {
      vi.mocked(llmService.endSession).mockResolvedValue(undefined);

      await expect(llmController.endSession(mockSessionId)).resolves.toBeUndefined();
    });

    it('should not throw on error (graceful cleanup)', async () => {
      const error = new Error('End session failed');
      vi.mocked(llmService.endSession).mockRejectedValue(error);

      // Should not throw
      await expect(llmController.endSession(mockSessionId)).resolves.toBeUndefined();
    });
  });

  describe('isHealthy', () => {
    it('should return true when llmService is healthy', () => {
      vi.mocked(llmService.isHealthy).mockReturnValue(true);

      const result = llmController.isHealthy();

      expect(result).toBe(true);
      expect(llmService.isHealthy).toHaveBeenCalled();
    });

    it('should return false when llmService is not healthy', () => {
      vi.mocked(llmService.isHealthy).mockReturnValue(false);

      const result = llmController.isHealthy();

      expect(result).toBe(false);
      expect(llmService.isHealthy).toHaveBeenCalled();
    });
  });

  describe('getMetrics', () => {
    it('should return metrics object', () => {
      const mockMetrics = {
        activeSessions: 5,
        totalRequests: 100,
        totalSuccesses: 95,
        totalFailures: 5,
        averageResponseTimeMs: 250,
        tier1Fallbacks: 2,
        tier2Fallbacks: 2,
        tier3Fallbacks: 1,
        peakConcurrentSessions: 10,
      };

      vi.mocked(llmService.getMetrics).mockReturnValue(mockMetrics);

      const result = llmController.getMetrics();

      expect(result).toEqual(mockMetrics);
      expect(llmService.getMetrics).toHaveBeenCalled();
    });

    it('should return metrics with all required fields', () => {
      const mockMetrics = {
        activeSessions: 0,
        totalRequests: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        averageResponseTimeMs: 0,
        tier1Fallbacks: 0,
        tier2Fallbacks: 0,
        tier3Fallbacks: 0,
        peakConcurrentSessions: 0,
      };

      vi.mocked(llmService.getMetrics).mockReturnValue(mockMetrics);

      const result = llmController.getMetrics();

      expect(result).toHaveProperty('activeSessions');
      expect(result).toHaveProperty('totalRequests');
      expect(result).toHaveProperty('totalSuccesses');
      expect(result).toHaveProperty('totalFailures');
      expect(result).toHaveProperty('averageResponseTimeMs');
      expect(result).toHaveProperty('tier1Fallbacks');
      expect(result).toHaveProperty('tier2Fallbacks');
      expect(result).toHaveProperty('tier3Fallbacks');
      expect(result).toHaveProperty('peakConcurrentSessions');
    });
  });

  describe('Fallback Detection Edge Cases', () => {
    it('should not detect fallback for partial matches', async () => {
      const almostFallback = 'I can repeat that for you';
      vi.mocked(llmService.generateResponse).mockResolvedValue(almostFallback);

      const result = await llmController.generateResponse(mockSessionId, mockUserMessage);

      expect(result.isFallback).toBe(false);
      expect(result.tier).toBeUndefined();
    });

    it('should be case-sensitive in fallback detection', async () => {
      const uppercaseFallback = 'I APOLOGIZE, CAN YOU REPEAT THAT?';
      vi.mocked(llmService.generateResponse).mockResolvedValue(uppercaseFallback);

      const result = await llmController.generateResponse(mockSessionId, mockUserMessage);

      expect(result.isFallback).toBe(false);
    });

    it('should handle empty response', async () => {
      vi.mocked(llmService.generateResponse).mockResolvedValue('');

      const result = await llmController.generateResponse(mockSessionId, mockUserMessage);

      expect(result.text).toBe('');
      expect(result.isFallback).toBe(false);
    });
  });
});
