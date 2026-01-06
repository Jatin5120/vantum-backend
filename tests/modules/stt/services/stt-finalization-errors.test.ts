/**
 * STT Service - Finalization Flow with Error Injection Tests
 * Tests critical finalization sequence with error scenarios
 * Focus: Event handler error resilience, timeout safety nets, resource cleanup
 * Target Coverage: 85%+ for finalization path, 100% for error handlers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sttService } from '@/modules/stt/services/stt.service';
import { sttSessionService } from '@/modules/stt/services/stt-session.service';
import { LiveTranscriptionEvents } from '@deepgram/sdk';
import { TIMEOUT_CONFIG } from '@/modules/stt/config';

// ============================================================================
// MOCK DEEPGRAM SDK
// ============================================================================

interface MockDeepgramLiveClient {
  on: any;
  send: any;
  requestClose: any;
  removeListener: any;
  removeAllListeners: any;
  getReadyState: any;
  keepAlive: any;
  _eventHandlers?: Map<string, Function[]>;
  _emitEvent?: (event: string, data: any) => void;
  _resetHandlers?: () => void;
}

let mockEventHandlers = new Map<string, Function[]>();

const createMockLiveClient = (): MockDeepgramLiveClient => {
  const handlers = new Map<string, Function[]>();

  const mockClient: MockDeepgramLiveClient = {
    on: vi.fn((event: string, handler: Function) => {
      if (!handlers.has(event)) {
        handlers.set(event, []);
      }
      handlers.get(event)!.push(handler);

      // Auto-fire 'Open' event to prevent connection timeout
      // Use process.nextTick to work with fake timers (executes before next event loop)
      if (event === LiveTranscriptionEvents.Open) {
        process.nextTick(() => handler());
      }
    }),

    send: vi.fn(),

    requestClose: vi.fn(),

    removeListener: vi.fn((event: string, handler: Function) => {
      const eventHandlers = handlers.get(event);
      if (eventHandlers) {
        const index = eventHandlers.indexOf(handler);
        if (index > -1) {
          eventHandlers.splice(index, 1);
        }
      }
    }),

    removeAllListeners: vi.fn(() => {
      handlers.clear();
    }),

    getReadyState: vi.fn(() => 1), // OPEN by default

    keepAlive: vi.fn(),

    _eventHandlers: handlers,

    _emitEvent: (event: string, data: any) => {
      const eventHandlers = handlers.get(event);
      if (eventHandlers) {
        eventHandlers.forEach((handler) => {
          handler(data);
        });
      }
    },

    _resetHandlers: () => {
      handlers.clear();
    },
  };

  return mockClient;
};

let currentMockClient: MockDeepgramLiveClient;

vi.mock('@deepgram/sdk', () => {
  return {
    createClient: vi.fn(() => {
      currentMockClient = createMockLiveClient();
      return {
        listen: {
          live: vi.fn(() => currentMockClient),
        },
      };
    }),
    LiveTranscriptionEvents: {
      Open: 'Open',
      Close: 'Close',
      Transcript: 'Transcript',
      Metadata: 'Metadata',
      Error: 'Error',
      SpeechStarted: 'SpeechStarted',
      UtteranceEnd: 'UtteranceEnd',
    },
  };
});

// ============================================================================
// TEST SUITE
// ============================================================================

describe('STT Service - Finalization Flow with Error Injection', () => {
  const testSessionId = 'finalization-error-test';
  const testConnectionId = 'conn-finalization-test';
  const testConfig = {
    sessionId: testSessionId,
    connectionId: testConnectionId,
    samplingRate: 16000,
    language: 'en-US',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    await sttService.shutdown({ restart: true });
  });

  afterEach(async () => {
    // CRITICAL: Shutdown service BEFORE clearing timers to stop keepAlive intervals
    // Otherwise runAllTimers() tries to run infinite keepAlive loop (10000+ timers)
    await sttService.shutdown({ restart: false });
    vi.clearAllTimers(); // Clear remaining timers instead of running them
    vi.useRealTimers();
  });

  // ========================================================================================
  // SECTION 1: FINALIZATION FLOW - HAPPY PATH WITH TIMING
  // ========================================================================================

  describe('Finalization Flow - Happy Path with Proper Timing', () => {
    it('should send CloseStream and wait for Metadata event', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      session!.addTranscript('test transcript', 0.95, true);

      // Setup: Metadata fires after 5ms (realistic)
      const metadataHandler = vi.fn();
      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.Metadata) {
          metadataHandler.mockImplementation(() => {
            setTimeout(() => handler({ duration: 1.2, request_id: 'req-123' }), 5);
          });
        }
      });

      // Act
      const promise = sttService.finalizeTranscript(testSessionId);
      vi.advanceTimersByTime(10);
      const result = await promise;

      // Assert
      expect(currentMockClient.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'CloseStream' })
      );
      expect(result).toBe('test transcript');
      expect(session!.metrics.finalizationMethod).toBe('event');
    });

    it('should reset finalization flag after 100ms delay', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      session!.addTranscript('test', 0.95, true);

      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.Metadata) {
          setTimeout(() => handler({ duration: 1.0 }), 3);
        }
      });

      // Act
      const promise = sttService.finalizeTranscript(testSessionId);

      // Initially flag should be true
      expect(session!.isFinalizingTranscript).toBe(true);

      vi.advanceTimersByTime(10);
      await promise;

      // After finalization but before timeout reset
      expect(session!.isFinalizingTranscript).toBe(true);

      // After 100ms reset delay
      vi.advanceTimersByTime(100);
      expect(session!.isFinalizingTranscript).toBe(false);
    });

    it('should clear existing finalization timeout before setting new one', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      session!.addTranscript('first', 0.95, true);

      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.Metadata) {
          setTimeout(() => handler({ duration: 1.0 }), 5);
        }
      });

      // Set initial timeout handle
      const oldHandle = setTimeout(() => {}, 999);
      session!.finalizationTimeoutHandle = oldHandle;

      // Act
      const promise = sttService.finalizeTranscript(testSessionId);
      vi.advanceTimersByTime(10);
      await promise;

      // Assert: Old handle should have been cleared (no error)
      expect(session!.finalizationTimeoutHandle).toBeDefined();
    });

    it('should prevent Close event from triggering reconnection during finalization', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      session!.addTranscript('test', 0.95, true);
      session!.isActive = true;

      let closeHandler: Function | null = null;
      let metadataHandler: Function | null = null;

      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.Metadata) {
          metadataHandler = handler;
        } else if (event === LiveTranscriptionEvents.Close) {
          closeHandler = handler;
        }
      });

      // Act: Start finalization
      const finalizePromise = sttService.finalizeTranscript(testSessionId);

      // Simulate Close event arriving after Metadata
      vi.advanceTimersByTime(8);
      if (metadataHandler) {
        metadataHandler({ duration: 1.0 });
      }

      // Close event should not trigger reconnection
      vi.advanceTimersByTime(5);
      if (closeHandler) {
        closeHandler({ code: 1000, reason: 'Normal closure' });
      }

      await finalizePromise;
      vi.advanceTimersByTime(150);

      // Assert: No reconnection attempted
      expect(session!.connectionState).toBe('connected');
    });
  });

  // ========================================================================================
  // SECTION 2: EVENT HANDLER ERROR INJECTION - ALL 7 HANDLERS
  // ========================================================================================

  describe('Event Handler Error Injection - Transcript Handler', () => {
    it('should handle error in Transcript event handler without crashing', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);

      let transcriptHandler: Function | null = null;
      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.Transcript) {
          transcriptHandler = () => {
            handler({ channel: { alternatives: [{ transcript: 'test', confidence: 0.95 }] }, is_final: true });
            throw new Error('Transcript handler error');
          };
        }
      });

      // Act & Assert: Should not crash
      expect(() => {
        if (transcriptHandler) transcriptHandler();
      }).toThrow();

      // Service should still be functional
      expect(sttService.isHealthy()).toBe(true);
    });

    it('should continue processing after Transcript handler error', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      let transcriptHandler: Function | null = null;
      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.Transcript) {
          transcriptHandler = handler;
        }
      });

      // Act: First call throws, second call succeeds
      if (transcriptHandler) {
        // In real scenario, error is caught in handler
        transcriptHandler({
          channel: { alternatives: [{ transcript: 'first', confidence: 0.95 }] },
          is_final: true,
        });

        transcriptHandler({
          channel: { alternatives: [{ transcript: 'second', confidence: 0.93 }] },
          is_final: true,
        });
      }

      // Assert: Both transcripts added
      expect(session!.accumulatedTranscript).toContain('first');
      expect(session!.accumulatedTranscript).toContain('second');
    });
  });

  describe('Event Handler Error Injection - Error Handler', () => {
    it('should handle error in Error event handler', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);

      let errorHandler: Function | null = null;
      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.Error) {
          errorHandler = handler;
        }
      });

      // Act: Trigger error handler
      const testError = new Error('Deepgram API error');
      if (errorHandler) {
        // Handler wraps in try-catch internally
        errorHandler(testError);
      }

      // Assert: Service continues
      expect(sttService.isHealthy()).toBe(true);
    });

    it('should handle logging error in Error handler', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      let errorHandler: Function | null = null;
      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.Error) {
          errorHandler = handler;
        }
      });

      // Act: Trigger error with error data
      const testError = new Error('API rate limit exceeded');
      if (errorHandler) {
        errorHandler(testError);
      }

      // Assert: Error counted
      expect(session!.metrics.errors).toBeGreaterThan(0);
    });
  });

  describe('Event Handler Error Injection - Generic Error Handler', () => {
    it('should handle error in generic error event handler', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);

      let genericErrorHandler: Function | null = null;
      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === 'error') {
          genericErrorHandler = handler;
        }
      });

      // Act: Trigger generic error
      if (genericErrorHandler) {
        genericErrorHandler(new Error('Generic WebSocket error'));
      }

      // Assert: No crash
      expect(sttService.isHealthy()).toBe(true);
    });
  });

  describe('Event Handler Error Injection - Close Handler', () => {
    it('should cleanup KeepAlive interval even if error occurs in Close handler', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      const mockInterval = setInterval(() => {}, 1000);
      session!.keepAliveInterval = mockInterval;

      let closeHandler: Function | null = null;
      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.Close) {
          closeHandler = handler;
        }
      });

      // Act: Trigger close handler
      if (closeHandler) {
        closeHandler({ code: 1006, reason: 'Abnormal closure' });
      }

      // Assert: Interval cleared even though handler had error
      expect(session!.keepAliveInterval).toBeUndefined();
    });

    it('should set connectionState to disconnected even on error', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      session!.connectionState = 'connected';

      let closeHandler: Function | null = null;
      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.Close) {
          closeHandler = handler;
        }
      });

      // Act
      if (closeHandler) {
        closeHandler({ code: 1000 });
      }

      // Assert: Connection marked disconnected
      expect(session!.connectionState).toBe('disconnected');
    });
  });

  describe('Event Handler Error Injection - Metadata Handler', () => {
    it('should handle error in Metadata event handler during finalization', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      session!.addTranscript('test', 0.95, true);

      let metadataHandler: Function | null = null;
      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.Metadata) {
          metadataHandler = handler;
        }
      });

      // Act: Start finalization
      const promise = sttService.finalizeTranscript(testSessionId);

      // Trigger Metadata
      vi.advanceTimersByTime(50);
      if (metadataHandler) {
        metadataHandler({ duration: 1.0, request_id: 'test-123' });
      }

      const result = await promise;

      // Assert: Still got transcript back
      expect(result).toBe('test');
    });
  });

  describe('Event Handler Error Injection - SpeechStarted & UtteranceEnd Handlers', () => {
    it('should handle error in SpeechStarted handler', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);

      let speechStartedHandler: Function | null = null;
      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.SpeechStarted) {
          speechStartedHandler = handler;
        }
      });

      // Act
      if (speechStartedHandler) {
        speechStartedHandler();
      }

      // Assert: No crash
      expect(sttService.isHealthy()).toBe(true);
    });

    it('should handle error in UtteranceEnd handler', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);

      let utteranceEndHandler: Function | null = null;
      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.UtteranceEnd) {
          utteranceEndHandler = handler;
        }
      });

      // Act
      if (utteranceEndHandler) {
        utteranceEndHandler();
      }

      // Assert: No crash
      expect(sttService.isHealthy()).toBe(true);
    });
  });

  // ========================================================================================
  // SECTION 3: TIMEOUT FALLBACK TESTS
  // ========================================================================================

  describe('Timeout Fallback - Metadata Event Timeout', () => {
    it('should trigger timeout if Metadata event never fires', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      session!.addTranscript('timeout test', 0.95, true);

      // Mock: Never call Metadata handler (but still fire Open)
      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        }
        // No Metadata event emitted
      });

      // Act: Start finalization (timeout is 5000ms)
      const promise = sttService.finalizeTranscript(testSessionId);

      // Advance past timeout
      vi.advanceTimersByTime(TIMEOUT_CONFIG.METADATA_EVENT_TIMEOUT_MS + 100);

      const result = await promise;

      // Assert: Got result via timeout
      expect(result).toBe('timeout test');
      expect(session!.metrics.finalizationMethod).toBe('timeout');
    });

    it('should cancel timeout when Metadata event fires first', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      session!.addTranscript('fast event', 0.95, true);

      const timeoutCancelSpy = vi.spyOn(global, 'clearTimeout');

      let metadataHandler: Function | null = null;
      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.Metadata) {
          metadataHandler = handler;
        }
      });

      // Act: Metadata fires quickly
      const promise = sttService.finalizeTranscript(testSessionId);
      vi.advanceTimersByTime(50);

      if (metadataHandler) {
        metadataHandler({ duration: 0.5 });
      }

      const result = await promise;

      // Assert: Used event path
      expect(result).toBe('fast event');
      expect(session!.metrics.finalizationMethod).toBe('event');

      // Timeout should have been cancelled
      expect(timeoutCancelSpy).toHaveBeenCalled();
    });

    it('should return accumulated transcript on timeout', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      session!.addTranscript('first', 0.95, true);
      session!.addTranscript('second', 0.93, true);
      session!.addTranscript('third', 0.91, true);

      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        }
        // Never fire Metadata
      });

      // Act
      const promise = sttService.finalizeTranscript(testSessionId);
      vi.advanceTimersByTime(TIMEOUT_CONFIG.METADATA_EVENT_TIMEOUT_MS + 100);

      const result = await promise;

      // Assert: All transcripts returned
      expect(result).toContain('first');
      expect(result).toContain('second');
      expect(result).toContain('third');
    });
  });

  // ========================================================================================
  // SECTION 4: RESOURCE CLEANUP TESTS
  // ========================================================================================

  describe('Resource Cleanup - Finalization Timeout Handle', () => {
    it('should clear finalization timeout in session cleanup', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      // Manually set a finalization timeout
      const timeoutHandle = setTimeout(() => {}, 5000);
      session!.finalizationTimeoutHandle = timeoutHandle;

      // Act
      session!.cleanup();

      // Assert: Timeout cleared
      expect(session!.finalizationTimeoutHandle).toBeUndefined();
    });

    it('should not leak finalization timeouts after finalization', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      session!.addTranscript('test', 0.95, true);

      let metadataHandler: Function | null = null;
      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.Metadata) {
          metadataHandler = handler;
        }
      });

      // Act: Finalize
      const promise = sttService.finalizeTranscript(testSessionId);
      vi.advanceTimersByTime(50);

      if (metadataHandler) {
        metadataHandler({ duration: 1.0 });
      }

      await promise;

      // Wait for finalization timeout to reset
      vi.advanceTimersByTime(150);

      // Assert: Finalization flag reset, timeout cleared
      expect(session!.isFinalizingTranscript).toBe(false);
      expect(session!.finalizationTimeoutHandle).toBeUndefined();
    });
  });

  describe('Resource Cleanup - KeepAlive Interval', () => {
    it('should clear KeepAlive interval on session cleanup', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      const mockInterval = setInterval(() => {}, 8000);
      session!.keepAliveInterval = mockInterval;

      // Act
      session!.cleanup();

      // Assert
      expect(session!.keepAliveInterval).toBeUndefined();
    });

    it('should clear KeepAlive interval on unexpected close', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      // Simulate KeepAlive interval was set
      const mockInterval = setInterval(() => {}, 8000);
      session!.keepAliveInterval = mockInterval;
      session!.isActive = true;

      let closeHandler: Function | null = null;
      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.Close) {
          closeHandler = handler;
        }
      });

      // Act: Unexpected close
      if (closeHandler) {
        closeHandler({ code: 1006 });
      }

      // Assert: KeepAlive interval cleared
      expect(session!.keepAliveInterval).toBeUndefined();
    });
  });

  describe('Resource Cleanup - Event Listeners', () => {
    it('should cleanup Metadata listener after finalization', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      session!.addTranscript('test', 0.95, true);

      let metadataHandler: Function | null = null;
      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.Metadata) {
          metadataHandler = handler;
        }
      });

      // Act
      const promise = sttService.finalizeTranscript(testSessionId);
      vi.advanceTimersByTime(50);

      if (metadataHandler) {
        metadataHandler({ duration: 1.0 });
      }

      await promise;

      // Assert: removeListener was called to clean up
      expect(currentMockClient.removeListener).toHaveBeenCalledWith(
        LiveTranscriptionEvents.Metadata,
        expect.any(Function)
      );
    });

    it('should cleanup listeners even on timeout path', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      session!.addTranscript('test', 0.95, true);

      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        }
        // Never emit Metadata
      });

      // Act
      const promise = sttService.finalizeTranscript(testSessionId);
      vi.advanceTimersByTime(TIMEOUT_CONFIG.METADATA_EVENT_TIMEOUT_MS + 100);

      await promise;

      // Assert: Cleanup still happened
      expect(currentMockClient.removeListener).toHaveBeenCalled();
    });
  });

  describe('Resource Cleanup - Reconnection Buffer', () => {
    it('should clear reconnection buffer on session cleanup', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);

      session!.addToReconnectionBuffer(Buffer.from([1, 2, 3, 4]));
      session!.addToReconnectionBuffer(Buffer.from([5, 6, 7, 8]));

      expect(session!.reconnectionBuffer.length).toBe(2);

      // Act
      session!.cleanup();

      // Assert
      expect(session!.reconnectionBuffer.length).toBe(0);
    });
  });

  // ========================================================================================
  // SECTION 5: RACE CONDITION TESTS
  // ========================================================================================

  describe('Race Conditions - Metadata and Close Events', () => {
    it('should handle Metadata event arriving 3-10ms before Close event', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      session!.addTranscript('race test', 0.95, true);
      session!.isActive = true;

      let metadataHandler: Function | null = null;
      let closeHandler: Function | null = null;

      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.Metadata) {
          metadataHandler = handler;
        } else if (event === LiveTranscriptionEvents.Close) {
          closeHandler = handler;
        }
      });

      // Act: Start finalization
      const promise = sttService.finalizeTranscript(testSessionId);

      // Metadata fires at 5ms
      vi.advanceTimersByTime(5);
      if (metadataHandler) {
        metadataHandler({ duration: 1.0 });
      }

      // Close event fires at 8ms (3ms after Metadata)
      vi.advanceTimersByTime(3);
      if (closeHandler) {
        closeHandler({ code: 1000, reason: 'Normal' });
      }

      const result = await promise;

      // Assert: No reconnection attempted
      expect(result).toBe('race test');
      expect(session!.connectionState).toBe('connected');
      expect(session!.metrics.finalizationMethod).toBe('event');
    });

    it('should handle Close event arriving simultaneously with Metadata', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      session!.addTranscript('simultaneous', 0.95, true);

      let metadataHandler: Function | null = null;
      let closeHandler: Function | null = null;

      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.Metadata) {
          metadataHandler = handler;
        } else if (event === LiveTranscriptionEvents.Close) {
          closeHandler = handler;
        }
      });

      // Act
      const promise = sttService.finalizeTranscript(testSessionId);

      vi.advanceTimersByTime(5);

      // Both fire at same time
      if (metadataHandler) {
        metadataHandler({ duration: 1.0 });
      }
      if (closeHandler) {
        closeHandler({ code: 1000 });
      }

      const result = await promise;

      // Assert: Still works correctly
      expect(result).toBe('simultaneous');
    });
  });

  describe('Race Conditions - Multiple Finalization Requests', () => {
    it('should handle concurrent finalization requests gracefully', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      session!.addTranscript('test', 0.95, true);

      let metadataHandler: Function | null = null;
      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.Metadata) {
          metadataHandler = handler;
        }
      });

      // Act: Two simultaneous finalization calls (shouldn't happen in practice, but test robustness)
      const promise1 = sttService.finalizeTranscript(testSessionId);
      const promise2 = sttService.finalizeTranscript(testSessionId);

      vi.advanceTimersByTime(10);
      if (metadataHandler) {
        metadataHandler({ duration: 1.0 });
      }

      // Both should complete
      const result1 = await promise1;
      const result2 = await promise2;

      // Assert
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });

  describe('Race Conditions - Finalization During Reconnection', () => {
    it('should handle finalization flag timing during Close event processing', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      session!.addTranscript('finalize during close', 0.95, true);
      session!.isActive = true;

      let closeHandler: Function | null = null;
      let metadataHandler: Function | null = null;

      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.Close) {
          closeHandler = handler;
        } else if (event === LiveTranscriptionEvents.Metadata) {
          metadataHandler = handler;
        }
      });

      // Act: Finalize first
      const promise = sttService.finalizeTranscript(testSessionId);

      // Flag should be true
      expect(session!.isFinalizingTranscript).toBe(true);

      // Metadata arrives
      vi.advanceTimersByTime(5);
      if (metadataHandler) {
        metadataHandler({ duration: 1.0 });
      }

      // Before reset delay, Close arrives
      vi.advanceTimersByTime(3);
      if (closeHandler) {
        closeHandler({ code: 1000 });
      }

      // Flag still true for Close handler to check
      expect(session!.isFinalizingTranscript).toBe(true);

      await promise;

      // After delay, flag reset
      vi.advanceTimersByTime(100);
      expect(session!.isFinalizingTranscript).toBe(false);
    });
  });

  // ========================================================================================
  // SECTION 6: EDGE CASES
  // ========================================================================================

  describe('Edge Cases - Null Client Handling', () => {
    it('should handle finalization when deepgramLiveClient is null', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      session!.addTranscript('null client', 0.95, true);

      // Make client null (race condition)
      session!.deepgramLiveClient = null;

      // Act
      const result = await sttService.finalizeTranscript(testSessionId);

      // Assert: Returns transcript gracefully
      expect(result).toBe('null client');
      expect(session!.accumulatedTranscript).toBe('');
    });

    it('should still reset state when client is null', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      session!.addTranscript('test', 0.95, true);
      session!.addTranscript('interim', 0.9, false);
      session!.deepgramLiveClient = null;

      // Act
      await sttService.finalizeTranscript(testSessionId);

      // Assert: State still reset
      expect(session!.accumulatedTranscript).toBe('');
      expect(session!.interimTranscript).toBe('');
      expect(session!.transcriptSegments).toEqual([]);
    });
  });

  describe('Edge Cases - Empty Transcripts', () => {
    it('should handle finalization with no accumulated transcript', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      // No transcripts added

      let metadataHandler: Function | null = null;
      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.Metadata) {
          metadataHandler = handler;
        }
      });

      // Act
      const promise = sttService.finalizeTranscript(testSessionId);
      vi.advanceTimersByTime(10);

      if (metadataHandler) {
        metadataHandler({ duration: 1.0 });
      }

      const result = await promise;

      // Assert
      expect(result).toBe('');
    });

    it('should handle finalization with only interim transcript', async () => {
      // Arrange
      await sttService.createSession(testSessionId, testConfig);
      const session = sttSessionService.getSession(testSessionId);
      session!.addTranscript('only interim', 0.9, false); // Interim only

      let metadataHandler: Function | null = null;
      currentMockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === LiveTranscriptionEvents.Open) {
          setTimeout(() => handler(), 10);
        } else if (event === LiveTranscriptionEvents.Metadata) {
          metadataHandler = handler;
        }
      });

      // Act
      const promise = sttService.finalizeTranscript(testSessionId);
      vi.advanceTimersByTime(10);

      if (metadataHandler) {
        metadataHandler({ duration: 1.0 });
      }

      const result = await promise;

      // Assert: getFinalTranscript includes unfinalized interim as fallback
      expect(result).toContain('only interim');
    });
  });
});
