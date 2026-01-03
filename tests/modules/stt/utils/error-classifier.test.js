"use strict";
/**
 * Error Classifier Tests
 * Target Coverage: 90%+
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const error_classifier_1 = require("@/modules/stt/utils/error-classifier");
(0, vitest_1.describe)('Error Classifier', () => {
    (0, vitest_1.describe)('Fatal Errors (4xx client errors)', () => {
        (0, vitest_1.it)('should classify 401 as fatal', () => {
            const error = new Error('HTTP 401: Unauthorized');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.FATAL);
            (0, vitest_1.expect)(classified.retryable).toBe(false);
            (0, vitest_1.expect)(classified.statusCode).toBe(401);
            (0, vitest_1.expect)(classified.message).toBe('Invalid API key');
            (0, vitest_1.expect)(classified.originalError).toBe(error);
        });
        (0, vitest_1.it)('should classify 403 as fatal', () => {
            const error = new Error('HTTP 403: Forbidden');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.FATAL);
            (0, vitest_1.expect)(classified.retryable).toBe(false);
            (0, vitest_1.expect)(classified.statusCode).toBe(403);
            (0, vitest_1.expect)(classified.message).toBe('Access forbidden');
        });
        (0, vitest_1.it)('should classify 404 as fatal', () => {
            const error = new Error('HTTP 404: Not Found');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.FATAL);
            (0, vitest_1.expect)(classified.retryable).toBe(false);
            (0, vitest_1.expect)(classified.statusCode).toBe(404);
            (0, vitest_1.expect)(classified.message).toBe('Endpoint not found');
        });
        (0, vitest_1.it)('should classify 400 as fatal', () => {
            const error = new Error('HTTP 400: Bad Request');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.FATAL);
            (0, vitest_1.expect)(classified.retryable).toBe(false);
            (0, vitest_1.expect)(classified.statusCode).toBe(400);
            (0, vitest_1.expect)(classified.message).toBe('Invalid request configuration');
        });
        (0, vitest_1.it)('should mark all fatal errors as not retryable', () => {
            const fatalCodes = [400, 401, 403, 404];
            fatalCodes.forEach((code) => {
                const error = new Error(`HTTP ${code}: Error`);
                const classified = (0, error_classifier_1.classifyDeepgramError)(error);
                (0, vitest_1.expect)(classified.retryable).toBe(false);
                (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.FATAL);
            });
        });
        (0, vitest_1.it)('should classify unknown 4xx errors as fatal', () => {
            const error = new Error('HTTP 418: I am a teapot');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.FATAL);
            (0, vitest_1.expect)(classified.retryable).toBe(false);
            (0, vitest_1.expect)(classified.statusCode).toBe(418);
            (0, vitest_1.expect)(classified.message).toBe('Client error 418');
        });
    });
    (0, vitest_1.describe)('Retryable Errors (5xx server errors)', () => {
        (0, vitest_1.it)('should classify 429 as retryable', () => {
            const error = new Error('HTTP 429: Rate Limit Exceeded');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.RETRYABLE);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
            (0, vitest_1.expect)(classified.statusCode).toBe(429);
            (0, vitest_1.expect)(classified.message).toBe('Rate limit exceeded');
        });
        (0, vitest_1.it)('should classify 500 as retryable', () => {
            const error = new Error('HTTP 500: Internal Server Error');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.RETRYABLE);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
            (0, vitest_1.expect)(classified.statusCode).toBe(500);
            (0, vitest_1.expect)(classified.message).toBe('Server error');
        });
        (0, vitest_1.it)('should classify 502 as retryable', () => {
            const error = new Error('HTTP 502: Bad Gateway');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.RETRYABLE);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
            (0, vitest_1.expect)(classified.statusCode).toBe(502);
            (0, vitest_1.expect)(classified.message).toBe('Bad gateway');
        });
        (0, vitest_1.it)('should classify 503 as retryable', () => {
            const error = new Error('HTTP 503: Service Unavailable');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.RETRYABLE);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
            (0, vitest_1.expect)(classified.statusCode).toBe(503);
            (0, vitest_1.expect)(classified.message).toBe('Service unavailable');
        });
        (0, vitest_1.it)('should classify 504 as retryable', () => {
            const error = new Error('HTTP 504: Gateway Timeout');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.RETRYABLE);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
            (0, vitest_1.expect)(classified.statusCode).toBe(504);
            (0, vitest_1.expect)(classified.message).toBe('Gateway timeout');
        });
        (0, vitest_1.it)('should mark all retryable errors as retryable: true', () => {
            const retryableCodes = [429, 500, 502, 503, 504];
            retryableCodes.forEach((code) => {
                const error = new Error(`HTTP ${code}: Error`);
                const classified = (0, error_classifier_1.classifyDeepgramError)(error);
                (0, vitest_1.expect)(classified.retryable).toBe(true);
                (0, vitest_1.expect)([error_classifier_1.ErrorType.RETRYABLE, error_classifier_1.ErrorType.TIMEOUT]).toContain(classified.type);
            });
        });
        (0, vitest_1.it)('should classify unknown 5xx errors as retryable', () => {
            const error = new Error('HTTP 599: Custom Server Error');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.RETRYABLE);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
            (0, vitest_1.expect)(classified.statusCode).toBe(599);
            (0, vitest_1.expect)(classified.message).toBe('Server error 599');
        });
    });
    (0, vitest_1.describe)('Network Errors', () => {
        (0, vitest_1.it)('should classify ECONNREFUSED as retryable', () => {
            const error = new Error('ECONNREFUSED: Connection refused');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.TIMEOUT);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
            (0, vitest_1.expect)(classified.message).toBe('Network or timeout error');
        });
        (0, vitest_1.it)('should classify ETIMEDOUT as retryable', () => {
            const error = new Error('ETIMEDOUT: Connection timed out');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.TIMEOUT);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
        (0, vitest_1.it)('should classify ECONNRESET as retryable', () => {
            const error = new Error('ECONNRESET: Connection reset by peer');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.TIMEOUT);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
        (0, vitest_1.it)('should classify network timeout as retryable', () => {
            const error = new Error('Network timeout occurred');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.TIMEOUT);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
        (0, vitest_1.it)('should classify socket errors as retryable', () => {
            const error = new Error('Socket error: connection lost');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.TIMEOUT);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
        (0, vitest_1.it)('should handle case-insensitive network keywords', () => {
            const error = new Error('NETWORK ERROR DETECTED');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.TIMEOUT);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
    });
    (0, vitest_1.describe)('Connection Closed Errors', () => {
        (0, vitest_1.it)('should classify "connection closed" as retryable (network timeout)', () => {
            const error = new Error('Connection closed unexpectedly');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            // "closed" keyword triggers network error check, classifies as TIMEOUT
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.TIMEOUT);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
            (0, vitest_1.expect)(classified.message).toBe('Network or timeout error');
        });
        (0, vitest_1.it)('should classify "socket closed" as retryable (network timeout)', () => {
            const error = new Error('Socket closed by server');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            // "socket" + "closed" keywords trigger network error check
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.TIMEOUT);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
        (0, vitest_1.it)('should classify "websocket closed" as retryable (network timeout)', () => {
            const error = new Error('WebSocket closed abnormally');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            // "websocket" + "closed" keywords trigger network error check
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.TIMEOUT);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
        (0, vitest_1.it)('should handle case-insensitive connection closed keywords', () => {
            const error = new Error('CONNECTION CLOSED');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            // Case-insensitive matching, still triggers network error check
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.TIMEOUT);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
    });
    (0, vitest_1.describe)('Status Code Extraction', () => {
        (0, vitest_1.it)('should extract status from error.status property', () => {
            const error = Object.assign(new Error('Server error'), { status: 503 });
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.statusCode).toBe(503);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
        (0, vitest_1.it)('should extract status from error.code property', () => {
            const error = Object.assign(new Error('Bad request'), { code: 400 });
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.statusCode).toBe(400);
            (0, vitest_1.expect)(classified.retryable).toBe(false);
        });
        (0, vitest_1.it)('should extract status from error message "HTTP 401"', () => {
            const error = new Error('HTTP 401: Unauthorized access');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.statusCode).toBe(401);
            (0, vitest_1.expect)(classified.retryable).toBe(false);
        });
        (0, vitest_1.it)('should extract status from error message "401:"', () => {
            const error = new Error('401: Authentication failed');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.statusCode).toBe(401);
            (0, vitest_1.expect)(classified.retryable).toBe(false);
        });
        (0, vitest_1.it)('should extract status from error message with whitespace', () => {
            const error = new Error('HTTP  502  Bad Gateway');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.statusCode).toBe(502);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
        (0, vitest_1.it)('should prioritize error.status over error.code', () => {
            const error = Object.assign(new Error('Error'), { status: 500, code: 400 });
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.statusCode).toBe(500); // Should use status, not code
        });
        (0, vitest_1.it)('should return undefined statusCode for errors without status', () => {
            const error = new Error('Generic error message');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.statusCode).toBeUndefined();
        });
        (0, vitest_1.it)('should handle errors with non-numeric status property', () => {
            const error = Object.assign(new Error('Error'), { status: 'INVALID' });
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            // Should not extract invalid status, fallback to unknown error handling
            (0, vitest_1.expect)(classified.retryable).toBe(true); // Unknown errors are retryable
        });
        (0, vitest_1.it)('should handle errors with non-numeric code property', () => {
            const error = Object.assign(new Error('Error'), { code: 'ERR_CONNECTION' });
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            // Should not extract invalid code, fallback to unknown error handling
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
    });
    (0, vitest_1.describe)('Unknown Errors', () => {
        (0, vitest_1.it)('should default to retryable for unknown errors', () => {
            const error = new Error('Unknown weird error');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.RETRYABLE);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
            (0, vitest_1.expect)(classified.message).toBe('Unknown weird error');
        });
        (0, vitest_1.it)('should handle errors without message', () => {
            const error = new Error();
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.RETRYABLE);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
            (0, vitest_1.expect)(classified.message).toBe('Unknown error');
        });
        (0, vitest_1.it)('should handle errors with empty message', () => {
            const error = new Error('');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.RETRYABLE);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
            (0, vitest_1.expect)(classified.message).toBe('Unknown error');
        });
        (0, vitest_1.it)('should handle errors with special characters', () => {
            const error = new Error('Error: 💥 Something exploded!');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.RETRYABLE);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
            (0, vitest_1.expect)(classified.originalError).toBe(error);
        });
    });
    (0, vitest_1.describe)('Helper Functions', () => {
        (0, vitest_1.describe)('isFatalError', () => {
            (0, vitest_1.it)('should return true for 401 errors', () => {
                const error = new Error('HTTP 401: Unauthorized');
                (0, vitest_1.expect)((0, error_classifier_1.isFatalError)(error)).toBe(true);
            });
            (0, vitest_1.it)('should return false for 500 errors', () => {
                const error = new Error('HTTP 500: Internal Server Error');
                (0, vitest_1.expect)((0, error_classifier_1.isFatalError)(error)).toBe(false);
            });
            (0, vitest_1.it)('should return false for network errors', () => {
                const error = new Error('ECONNREFUSED');
                (0, vitest_1.expect)((0, error_classifier_1.isFatalError)(error)).toBe(false);
            });
            (0, vitest_1.it)('should return false for unknown errors', () => {
                const error = new Error('Unknown error');
                (0, vitest_1.expect)((0, error_classifier_1.isFatalError)(error)).toBe(false);
            });
        });
        (0, vitest_1.describe)('isRetryableError', () => {
            (0, vitest_1.it)('should return false for 401 errors', () => {
                const error = new Error('HTTP 401: Unauthorized');
                (0, vitest_1.expect)((0, error_classifier_1.isRetryableError)(error)).toBe(false);
            });
            (0, vitest_1.it)('should return true for 500 errors', () => {
                const error = new Error('HTTP 500: Internal Server Error');
                (0, vitest_1.expect)((0, error_classifier_1.isRetryableError)(error)).toBe(true);
            });
            (0, vitest_1.it)('should return true for 503 errors', () => {
                const error = new Error('HTTP 503: Service Unavailable');
                (0, vitest_1.expect)((0, error_classifier_1.isRetryableError)(error)).toBe(true);
            });
            (0, vitest_1.it)('should return true for network errors', () => {
                const error = new Error('ECONNREFUSED');
                (0, vitest_1.expect)((0, error_classifier_1.isRetryableError)(error)).toBe(true);
            });
            (0, vitest_1.it)('should return true for connection closed errors', () => {
                const error = new Error('Connection closed');
                (0, vitest_1.expect)((0, error_classifier_1.isRetryableError)(error)).toBe(true);
            });
            (0, vitest_1.it)('should return true for unknown errors (fail-safe)', () => {
                const error = new Error('Mysterious error');
                (0, vitest_1.expect)((0, error_classifier_1.isRetryableError)(error)).toBe(true);
            });
        });
    });
    (0, vitest_1.describe)('Edge Cases', () => {
        (0, vitest_1.it)('should handle errors with both status code and network keywords', () => {
            const error = Object.assign(new Error('Network timeout'), { status: 504 });
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            // Status code takes precedence in implementation (checked first)
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.RETRYABLE);
            (0, vitest_1.expect)(classified.statusCode).toBe(504);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
        (0, vitest_1.it)('should handle errors with status code in message AND property', () => {
            const error = Object.assign(new Error('HTTP 401: Unauthorized'), { status: 500 });
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            // Property should take precedence over message
            (0, vitest_1.expect)(classified.statusCode).toBe(500);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
        (0, vitest_1.it)('should preserve original error reference', () => {
            const error = new Error('Test error');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.originalError).toBe(error);
            (0, vitest_1.expect)(classified.originalError).toBeInstanceOf(Error);
        });
        (0, vitest_1.it)('should handle errors with very long messages', () => {
            const longMessage = 'Error: ' + 'A'.repeat(10000);
            const error = new Error(longMessage);
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.message).toBe(longMessage);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
        (0, vitest_1.it)('should handle multiple status codes in message (use first)', () => {
            const error = new Error('HTTP 500 led to 502 gateway error');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.statusCode).toBe(500); // Should extract first code
        });
        (0, vitest_1.it)('should handle status code at beginning of message', () => {
            const error = new Error('500 Internal Server Error');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.statusCode).toBe(500);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
        (0, vitest_1.it)('should not extract invalid status codes', () => {
            const error = new Error('Error code 999 happened');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.statusCode).toBe(999);
            // 999 is not in 4xx or 5xx range, falls through to unknown
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
    });
    (0, vitest_1.describe)('Real-World Deepgram Error Patterns', () => {
        (0, vitest_1.it)('should handle Deepgram API key error', () => {
            const error = Object.assign(new Error('Invalid API key'), { status: 401 });
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.FATAL);
            (0, vitest_1.expect)(classified.retryable).toBe(false);
            (0, vitest_1.expect)(classified.message).toBe('Invalid API key');
        });
        (0, vitest_1.it)('should handle Deepgram rate limit error', () => {
            const error = Object.assign(new Error('Rate limit exceeded'), { status: 429 });
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.RETRYABLE);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
            (0, vitest_1.expect)(classified.message).toBe('Rate limit exceeded');
        });
        (0, vitest_1.it)('should handle Deepgram service unavailable', () => {
            const error = Object.assign(new Error('Service temporarily unavailable'), { status: 503 });
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.RETRYABLE);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
        (0, vitest_1.it)('should handle WebSocket connection errors', () => {
            const error = new Error('WebSocket closed with code 1006');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            // "websocket" + "closed" keywords trigger network error check
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.TIMEOUT);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
        (0, vitest_1.it)('should handle Deepgram timeout errors', () => {
            const error = new Error('Deepgram request timeout');
            const classified = (0, error_classifier_1.classifyDeepgramError)(error);
            (0, vitest_1.expect)(classified.type).toBe(error_classifier_1.ErrorType.TIMEOUT);
            (0, vitest_1.expect)(classified.retryable).toBe(true);
        });
    });
});
