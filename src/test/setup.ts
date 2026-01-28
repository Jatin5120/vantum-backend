/**
 * Vitest Setup File
 * Global test configuration and setup
 * P1-8 FIX: Updated API key patterns to non-obvious test values
 */

import { vi } from 'vitest';
import dotenv from 'dotenv';

// Load environment variables from .env file for tests
dotenv.config();

// P1-8 FIX: Mock environment variables with non-obvious test patterns
// Changed from 'test-deepgram-api-key' to sk_test_mock format
// Benefit: Clearer intent that these are test keys, not real API patterns
if (!process.env.DEEPGRAM_API_KEY) {
  process.env.DEEPGRAM_API_KEY = 'sk_test_mock_deepgram_12345';
}

if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = 'sk_test_mock_openai_67890';
}

if (!process.env.CARTESIA_API_KEY) {
  process.env.CARTESIA_API_KEY = 'sk_test_mock_cartesia_abcde';
}

if (!process.env.PORT) {
  process.env.PORT = '3001';
}

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

// Global test utilities can be added here
