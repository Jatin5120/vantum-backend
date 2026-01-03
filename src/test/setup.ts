/**
 * Vitest Setup File
 * Global test configuration and setup
 */

import { vi } from 'vitest';
import dotenv from 'dotenv';

// Load environment variables from .env file for tests
dotenv.config();

// Mock environment variables for tests if not set
if (!process.env.DEEPGRAM_API_KEY) {
  process.env.DEEPGRAM_API_KEY = 'test-deepgram-api-key';
}

if (!process.env.PORT) {
  process.env.PORT = '3001';
}

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

// Global test utilities can be added here
