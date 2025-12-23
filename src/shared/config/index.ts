/**
 * Shared Configuration
 * Centralized exports for all configuration
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Environment variables
 */
export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3001', 10),
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  
  // API Keys (for future layers)
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  CARTESIA_API_KEY: process.env.CARTESIA_API_KEY,
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
} as const;

/**
 * Validate required environment variables
 */
export function validateEnv(): void {
  const required: (keyof typeof env)[] = [
    'PORT',
    'FRONTEND_URL',
  ];

  const missing = required.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

/**
 * Check if running in development mode
 */
export const isDevelopment = env.NODE_ENV === 'development';

/**
 * Check if running in production mode
 */
export const isProduction = env.NODE_ENV === 'production';

/**
 * Check if running in test mode
 */
export const isTest = env.NODE_ENV === 'test';

// Export socket configuration
export * from './socket';
