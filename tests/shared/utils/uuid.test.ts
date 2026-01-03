/**
 * UUID Utility Tests
 */

import { describe, it, expect } from 'vitest';
import { generateId } from '@/shared/utils/uuid';

describe('UUID Utility', () => {
  it('should generate valid UUIDv7', () => {
    const id = generateId();

    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('should generate unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    const id3 = generateId();

    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).not.toBe(id3);
  });

  it('should generate time-ordered IDs', () => {
    const id1 = generateId();
    const id2 = generateId();

    // UUIDv7 is time-ordered, so id1 should be lexicographically less than id2
    expect(id1 < id2).toBe(true);
  });
});
