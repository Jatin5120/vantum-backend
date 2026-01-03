/**
 * Deepgram SDK Mock Utilities
 * Provides mock implementation of Deepgram SDK for testing
 */

import { vi } from 'vitest';

/**
 * Mock LiveClient that simulates Deepgram WebSocket behavior
 */
export class MockDeepgramLiveClient {
  private eventHandlers = new Map<string, Array<(data: any) => void>>();
  public sendMock = vi.fn();
  public requestCloseMock = vi.fn();
  public removeListenerMock = vi.fn();

  constructor() {
    // Simulate connection opening after short delay
    setTimeout(() => {
      this.emit('Open', {});
    }, 10);
  }

  on(event: string, handler: (data: any) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  removeListener(event: string, handler: (data: any) => void): void {
    this.removeListenerMock(event, handler);
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  send(data: ArrayBufferLike): void {
    this.sendMock(data);
  }

  requestClose(): void {
    this.requestCloseMock();
    setTimeout(() => {
      this.emit('Close', {});
    }, 10);
  }

  // Test utility: manually trigger events
  emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(data));
    }
  }

  // Test utility: simulate transcript response
  emitTranscript(text: string, isFinal: boolean = false, confidence: number = 0.95): void {
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
  emitError(error: Error): void {
    this.emit('Error', error);
  }

  // Test utility: simulate connection close
  emitClose(): void {
    this.emit('Close', {});
  }

  // Test utility: simulate metadata
  emitMetadata(metadata: Record<string, any>): void {
    this.emit('Metadata', metadata);
  }
}

/**
 * Mock Deepgram client factory
 */
export const createMockDeepgramClient = () => {
  const liveClient = new MockDeepgramLiveClient();

  return {
    listen: {
      live: vi.fn(() => liveClient),
    },
    _liveClient: liveClient, // Expose for test access
  };
};

/**
 * Create mock for @deepgram/sdk module
 */
export const mockDeepgramSDK = () => {
  let currentClient: ReturnType<typeof createMockDeepgramClient> | null = null;

  const createClientMock = vi.fn(() => {
    currentClient = createMockDeepgramClient();
    return currentClient;
  });

  // Mock the @deepgram/sdk module
  vi.mock('@deepgram/sdk', () => ({
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

/**
 * Wait for a condition to be true (test utility)
 */
export const waitFor = async (
  condition: () => boolean,
  timeout: number = 1000,
  interval: number = 10
): Promise<void> => {
  const startTime = Date.now();
  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('waitFor timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
};

/**
 * Generate mock audio chunk
 */
export const generateMockAudioChunk = (size: number = 1024): Uint8Array => {
  return new Uint8Array(size).fill(128); // Fill with dummy audio data
};

/**
 * Create mock STT config
 */
export const createMockSTTConfig = (overrides?: Partial<any>) => ({
  sessionId: 'test-session-id',
  connectionId: 'test-connection-id',
  samplingRate: 16000,
  language: 'en-US',
  ...overrides,
});
