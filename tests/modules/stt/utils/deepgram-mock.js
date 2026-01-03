"use strict";
/**
 * Deepgram SDK Mock Utilities
 * Provides mock implementation of Deepgram SDK for testing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMockSTTConfig = exports.generateMockAudioChunk = exports.waitFor = exports.mockDeepgramSDK = exports.createMockDeepgramClient = exports.MockDeepgramLiveClient = void 0;
const vitest_1 = require("vitest");
/**
 * Mock LiveClient that simulates Deepgram WebSocket behavior
 */
class MockDeepgramLiveClient {
    constructor() {
        this.eventHandlers = new Map();
        this.sendMock = vitest_1.vi.fn();
        this.requestCloseMock = vitest_1.vi.fn();
        this.removeListenerMock = vitest_1.vi.fn();
        // Simulate connection opening after short delay
        setTimeout(() => {
            this.emit('Open', {});
        }, 10);
    }
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }
    removeListener(event, handler) {
        this.removeListenerMock(event, handler);
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }
    send(data) {
        this.sendMock(data);
    }
    requestClose() {
        this.requestCloseMock();
        setTimeout(() => {
            this.emit('Close', {});
        }, 10);
    }
    // Test utility: manually trigger events
    emit(event, data) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.forEach((handler) => handler(data));
        }
    }
    // Test utility: simulate transcript response
    emitTranscript(text, isFinal = false, confidence = 0.95) {
        this.emit('Transcript', {
            channel: {
                alternatives: [
                    {
                        transcript: text,
                        confidence,
                    },
                ],
            },
            is_final: isFinal,
        });
    }
    // Test utility: simulate error
    emitError(error) {
        this.emit('Error', error);
    }
    // Test utility: simulate connection close
    emitClose() {
        this.emit('Close', {});
    }
    // Test utility: simulate metadata
    emitMetadata(metadata) {
        this.emit('Metadata', metadata);
    }
}
exports.MockDeepgramLiveClient = MockDeepgramLiveClient;
/**
 * Mock Deepgram client factory
 */
const createMockDeepgramClient = () => {
    const liveClient = new MockDeepgramLiveClient();
    return {
        listen: {
            live: vitest_1.vi.fn(() => liveClient),
        },
        _liveClient: liveClient, // Expose for test access
    };
};
exports.createMockDeepgramClient = createMockDeepgramClient;
/**
 * Create mock for @deepgram/sdk module
 */
const mockDeepgramSDK = () => {
    let currentClient = null;
    const createClientMock = vitest_1.vi.fn(() => {
        currentClient = (0, exports.createMockDeepgramClient)();
        return currentClient;
    });
    // Mock the @deepgram/sdk module
    vitest_1.vi.mock('@deepgram/sdk', () => ({
        createClient: createClientMock,
    }));
    // Helper to get the current mock client
    const getCurrentClient = () => currentClient;
    const getCurrentLiveClient = () => currentClient?._liveClient;
    return {
        createClient: createClientMock,
        getCurrentClient,
        getCurrentLiveClient,
    };
};
exports.mockDeepgramSDK = mockDeepgramSDK;
/**
 * Wait for a condition to be true (test utility)
 */
const waitFor = async (condition, timeout = 1000, interval = 10) => {
    const startTime = Date.now();
    while (!condition()) {
        if (Date.now() - startTime > timeout) {
            throw new Error('waitFor timeout');
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
    }
};
exports.waitFor = waitFor;
/**
 * Generate mock audio chunk
 */
const generateMockAudioChunk = (size = 1024) => {
    return new Uint8Array(size).fill(128); // Fill with dummy audio data
};
exports.generateMockAudioChunk = generateMockAudioChunk;
/**
 * Create mock STT config
 */
const createMockSTTConfig = (overrides) => ({
    sessionId: 'test-session-id',
    connectionId: 'test-connection-id',
    samplingRate: 16000,
    language: 'en-US',
    ...overrides,
});
exports.createMockSTTConfig = createMockSTTConfig;
