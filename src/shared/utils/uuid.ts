/**
 * UUID Utility
 * Centralized UUID generation using uuidv7 (following thine's pattern)
 */

import { v7 as uuidv7 } from 'uuid';

/**
 * Generate a UUID v7 (time-ordered, sortable)
 * Following thine's pattern - used for all IDs (events, sessions, connections)
 */
export function generateId(): string {
  return uuidv7();
}

