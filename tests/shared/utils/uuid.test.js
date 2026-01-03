"use strict";
/**
 * UUID Utility Tests
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const uuid_1 = require("@/shared/utils/uuid");
(0, vitest_1.describe)('UUID Utility', () => {
    (0, vitest_1.it)('should generate valid UUIDv7', () => {
        const id = (0, uuid_1.generateId)();
        (0, vitest_1.expect)(id).toBeDefined();
        (0, vitest_1.expect)(typeof id).toBe('string');
        (0, vitest_1.expect)(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
    (0, vitest_1.it)('should generate unique IDs', () => {
        const id1 = (0, uuid_1.generateId)();
        const id2 = (0, uuid_1.generateId)();
        const id3 = (0, uuid_1.generateId)();
        (0, vitest_1.expect)(id1).not.toBe(id2);
        (0, vitest_1.expect)(id2).not.toBe(id3);
        (0, vitest_1.expect)(id1).not.toBe(id3);
    });
    (0, vitest_1.it)('should generate time-ordered IDs', () => {
        const id1 = (0, uuid_1.generateId)();
        const id2 = (0, uuid_1.generateId)();
        // UUIDv7 is time-ordered, so id1 should be lexicographically less than id2
        (0, vitest_1.expect)(id1 < id2).toBe(true);
    });
});
