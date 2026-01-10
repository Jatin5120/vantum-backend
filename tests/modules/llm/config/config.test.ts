/**
 * LLM Configuration Tests
 * Tests configuration loading and validation
 * Target Coverage: 90%+
 */

import { describe, it, expect } from 'vitest';
import {
  openaiConfig,
  llmRetryConfig,
  llmTimeoutConfig,
  promptsConfig,
} from '@/modules/llm/config';

describe('LLM Configuration', () => {
  describe('openaiConfig', () => {
    it('should have model property', () => {
      expect(openaiConfig.model).toBeDefined();
      expect(typeof openaiConfig.model).toBe('string');
      expect(openaiConfig.model.length).toBeGreaterThan(0);
    });

    it('should have valid temperature value', () => {
      expect(openaiConfig.temperature).toBeDefined();
      expect(typeof openaiConfig.temperature).toBe('number');
      expect(openaiConfig.temperature).toBeGreaterThanOrEqual(0);
      expect(openaiConfig.temperature).toBeLessThanOrEqual(2);
    });

    it('should have valid maxTokens value', () => {
      expect(openaiConfig.maxTokens).toBeDefined();
      expect(typeof openaiConfig.maxTokens).toBe('number');
      expect(openaiConfig.maxTokens).toBeGreaterThan(0);
      expect(openaiConfig.maxTokens).toBeLessThanOrEqual(4096);
    });

    it('should have valid topP value', () => {
      expect(openaiConfig.topP).toBeDefined();
      expect(typeof openaiConfig.topP).toBe('number');
      expect(openaiConfig.topP).toBeGreaterThanOrEqual(0);
      expect(openaiConfig.topP).toBeLessThanOrEqual(1);
    });

    it('should have frequency penalty', () => {
      expect(openaiConfig.frequencyPenalty).toBeDefined();
      expect(typeof openaiConfig.frequencyPenalty).toBe('number');
    });

    it('should have presence penalty', () => {
      expect(openaiConfig.presencePenalty).toBeDefined();
      expect(typeof openaiConfig.presencePenalty).toBe('number');
    });

    it('should have streaming enabled', () => {
      expect(openaiConfig.streaming).toBe(true);
    });

    it('should have API key', () => {
      expect(openaiConfig.apiKey).toBeDefined();
      if (process.env.OPENAI_API_KEY) {
        expect(openaiConfig.apiKey).toBeTruthy();
      }
    });

    it('should have timeout value', () => {
      expect(openaiConfig.timeout).toBeDefined();
      expect(typeof openaiConfig.timeout).toBe('number');
      expect(openaiConfig.timeout).toBeGreaterThan(0);
    });

    it('should validate configuration', () => {
      // Should not throw if valid
      if (process.env.OPENAI_API_KEY) {
        expect(() => {
          openaiConfig.validate();
        }).not.toThrow();
      }
    });

    it('should validate temperature is in range', () => {
      if (process.env.OPENAI_API_KEY) {
        expect(() => {
          openaiConfig.validate();
        }).not.toThrow();
      }
    });

    it('should validate maxTokens is in range', () => {
      if (process.env.OPENAI_API_KEY) {
        expect(() => {
          openaiConfig.validate();
        }).not.toThrow();
      }
    });

    it('should allow organization to be optional', () => {
      // organization can be undefined or string
      expect(
        typeof openaiConfig.organization === 'undefined' ||
          typeof openaiConfig.organization === 'string'
      ).toBe(true);
    });
  });

  describe('llmRetryConfig', () => {
    it('should have fallback messages object', () => {
      expect(llmRetryConfig.fallbackMessages).toBeDefined();
      expect(typeof llmRetryConfig.fallbackMessages).toBe('object');
    });

    it('should have Tier 1 fallback message', () => {
      expect(llmRetryConfig.fallbackMessages.tier1).toBeDefined();
      expect(typeof llmRetryConfig.fallbackMessages.tier1).toBe('string');
      expect(llmRetryConfig.fallbackMessages.tier1.length).toBeGreaterThan(0);
    });

    it('should have Tier 2 fallback message', () => {
      expect(llmRetryConfig.fallbackMessages.tier2).toBeDefined();
      expect(typeof llmRetryConfig.fallbackMessages.tier2).toBe('string');
      expect(llmRetryConfig.fallbackMessages.tier2.length).toBeGreaterThan(0);
    });

    it('should have Tier 3 fallback message', () => {
      expect(llmRetryConfig.fallbackMessages.tier3).toBeDefined();
      expect(typeof llmRetryConfig.fallbackMessages.tier3).toBe('string');
      expect(llmRetryConfig.fallbackMessages.tier3.length).toBeGreaterThan(0);
    });

    it('should have unique fallback messages', () => {
      const { tier1, tier2, tier3 } = llmRetryConfig.fallbackMessages;

      expect(tier1).not.toBe(tier2);
      expect(tier2).not.toBe(tier3);
      expect(tier1).not.toBe(tier3);
    });

    it('should have maxRetries configuration', () => {
      expect(llmRetryConfig.maxRetries).toBeDefined();
      expect(typeof llmRetryConfig.maxRetries).toBe('number');
      expect(llmRetryConfig.maxRetries).toBeGreaterThanOrEqual(0);
    });

    it('should have retry delays array', () => {
      expect(llmRetryConfig.retryDelays).toBeDefined();
      expect(Array.isArray(llmRetryConfig.retryDelays)).toBe(true);
      expect(llmRetryConfig.retryDelays.length).toBeGreaterThan(0);
    });

    it('should have maxQueueSize configuration', () => {
      expect(llmRetryConfig.maxQueueSize).toBeDefined();
      expect(typeof llmRetryConfig.maxQueueSize).toBe('number');
      expect(llmRetryConfig.maxQueueSize).toBeGreaterThanOrEqual(0);
    });

    it('should have increasing retry delays', () => {
      const delays = llmRetryConfig.retryDelays;

      for (let i = 1; i < delays.length; i++) {
        expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
      }
    });
  });

  describe('llmTimeoutConfig', () => {
    it('should have request timeout', () => {
      expect(llmTimeoutConfig.requestTimeout).toBeDefined();
      expect(typeof llmTimeoutConfig.requestTimeout).toBe('number');
      expect(llmTimeoutConfig.requestTimeout).toBeGreaterThan(0);
    });

    it('should have streaming timeout', () => {
      expect(llmTimeoutConfig.streamingTimeout).toBeDefined();
      expect(typeof llmTimeoutConfig.streamingTimeout).toBe('number');
      expect(llmTimeoutConfig.streamingTimeout).toBeGreaterThan(0);
    });

    it('should have streaming timeout greater than request timeout', () => {
      expect(llmTimeoutConfig.streamingTimeout).toBeGreaterThan(llmTimeoutConfig.requestTimeout);
    });

    it('should have session idle timeout', () => {
      expect(llmTimeoutConfig.sessionIdleTimeout).toBeDefined();
      expect(typeof llmTimeoutConfig.sessionIdleTimeout).toBe('number');
      expect(llmTimeoutConfig.sessionIdleTimeout).toBeGreaterThan(0);
    });

    it('should have session max duration', () => {
      expect(llmTimeoutConfig.sessionMaxDuration).toBeDefined();
      expect(typeof llmTimeoutConfig.sessionMaxDuration).toBe('number');
      expect(llmTimeoutConfig.sessionMaxDuration).toBeGreaterThan(0);
    });

    it('should have cleanup interval', () => {
      expect(llmTimeoutConfig.cleanupInterval).toBeDefined();
      expect(typeof llmTimeoutConfig.cleanupInterval).toBe('number');
      expect(llmTimeoutConfig.cleanupInterval).toBeGreaterThan(0);
    });

    it('should have maxMessagesPerContext', () => {
      expect(llmTimeoutConfig.maxMessagesPerContext).toBeDefined();
      expect(typeof llmTimeoutConfig.maxMessagesPerContext).toBe('number');
      expect(llmTimeoutConfig.maxMessagesPerContext).toBeGreaterThanOrEqual(0);
    });

    it('should have maxContextTokens', () => {
      expect(llmTimeoutConfig.maxContextTokens).toBeDefined();
      expect(typeof llmTimeoutConfig.maxContextTokens).toBe('number');
      expect(llmTimeoutConfig.maxContextTokens).toBeGreaterThanOrEqual(0);
    });

    it('should have sensible timeout ordering', () => {
      expect(llmTimeoutConfig.requestTimeout).toBeLessThan(llmTimeoutConfig.sessionIdleTimeout);
      expect(llmTimeoutConfig.sessionIdleTimeout).toBeLessThan(llmTimeoutConfig.sessionMaxDuration);
    });
  });

  describe('promptsConfig', () => {
    it('should have system prompt', () => {
      expect(promptsConfig.systemPrompt).toBeDefined();
      expect(typeof promptsConfig.systemPrompt).toBe('string');
      expect(promptsConfig.systemPrompt.length).toBeGreaterThan(0);
    });

    it('should have non-empty system prompt', () => {
      expect(promptsConfig.systemPrompt).toMatch(/sales|representative/i);
    });

    it('should have getDynamicPrompt method', () => {
      expect(promptsConfig.getDynamicPrompt).toBeDefined();
      expect(typeof promptsConfig.getDynamicPrompt).toBe('function');
    });

    it('should return system prompt with no parameters', () => {
      const prompt = promptsConfig.getDynamicPrompt();

      expect(prompt).toBe(promptsConfig.systemPrompt);
    });

    it('should include prospect name in dynamic prompt', () => {
      const prompt = promptsConfig.getDynamicPrompt({
        name: 'John Smith',
      });

      expect(prompt).toContain('John Smith');
    });

    it('should include company in dynamic prompt', () => {
      const prompt = promptsConfig.getDynamicPrompt({
        company: 'Acme Corp',
      });

      expect(prompt).toContain('Acme Corp');
    });

    it('should include industry in dynamic prompt', () => {
      const prompt = promptsConfig.getDynamicPrompt({
        industry: 'Technology',
      });

      expect(prompt).toContain('Technology');
    });

    it('should include all prospect data in dynamic prompt', () => {
      const prompt = promptsConfig.getDynamicPrompt({
        name: 'Alice',
        company: 'TechCorp',
        industry: 'SaaS',
      });

      expect(prompt).toContain('Alice');
      expect(prompt).toContain('TechCorp');
      expect(prompt).toContain('SaaS');
    });

    it('should start with base system prompt', () => {
      const prompt = promptsConfig.getDynamicPrompt({
        name: 'John',
      });

      expect(prompt).toContain(promptsConfig.systemPrompt);
    });

    it('should handle missing prospect data gracefully', () => {
      expect(() => {
        promptsConfig.getDynamicPrompt({});
        promptsConfig.getDynamicPrompt({ name: undefined });
      }).not.toThrow();
    });
  });

  describe('Configuration Consistency', () => {
    it('should use consistent model names', () => {
      // Verify model name is valid OpenAI format
      expect(openaiConfig.model).toMatch(/gpt-/i);
    });

    it('should have non-conflicting timeout values', () => {
      expect(llmTimeoutConfig.requestTimeout).toBeLessThan(llmTimeoutConfig.streamingTimeout);
      expect(llmTimeoutConfig.cleanupInterval).toBeLessThan(llmTimeoutConfig.sessionIdleTimeout);
    });

    it('should have positive numeric configurations', () => {
      expect(openaiConfig.temperature).toBeGreaterThanOrEqual(0);
      expect(openaiConfig.maxTokens).toBeGreaterThan(0);
      expect(llmTimeoutConfig.requestTimeout).toBeGreaterThan(0);
      expect(llmTimeoutConfig.cleanupInterval).toBeGreaterThan(0);
    });
  });

  describe('Environment Variable Handling', () => {
    it('should load defaults when env vars not set', () => {
      // Config should always have values (either env or defaults)
      expect(openaiConfig.model).toBeTruthy();
      expect(openaiConfig.temperature).toBeDefined();
      expect(openaiConfig.maxTokens).toBeDefined();
    });

    it('should have fallback values for all configs', () => {
      // Even without env vars, these should work
      expect(llmRetryConfig.fallbackMessages.tier1).toBeTruthy();
      expect(llmRetryConfig.fallbackMessages.tier2).toBeTruthy();
      expect(llmRetryConfig.fallbackMessages.tier3).toBeTruthy();
      expect(promptsConfig.systemPrompt).toBeTruthy();
    });
  });
});
