/**
 * OpenAI API Configuration
 * Model, temperature, timeout, and API settings
 */

export const openaiConfig = {
  // Model configuration
  model: process.env.LLM_MODEL || 'gpt-4.1-2025-04-14',
  temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
  maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '500', 10),
  topP: parseFloat(process.env.LLM_TOP_P || '1.0'),
  frequencyPenalty: parseFloat(process.env.LLM_FREQUENCY_PENALTY || '0.0'),
  presencePenalty: parseFloat(process.env.LLM_PRESENCE_PENALTY || '0.0'),

  // Streaming configuration
  streaming: true,

  // API configuration
  apiKey: process.env.OPENAI_API_KEY || '',
  organization: process.env.OPENAI_ORGANIZATION || undefined,
  timeout: parseInt(process.env.LLM_REQUEST_TIMEOUT || '30000', 10), // 30s

  /**
   * Validate configuration
   */
  validate(): void {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is required in environment variables');
    }
    if (this.temperature < 0 || this.temperature > 2) {
      throw new Error('LLM_TEMPERATURE must be between 0 and 2');
    }
    if (this.maxTokens < 1 || this.maxTokens > 4096) {
      throw new Error('LLM_MAX_TOKENS must be between 1 and 4096');
    }
  },
} as const;
