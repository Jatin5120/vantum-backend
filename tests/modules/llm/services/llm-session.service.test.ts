/**
 * LLM Session Service Unit Tests
 * Tests conversation context and session state management
 * Target Coverage: 90%+
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { llmSessionService } from '@/modules/llm/services/llm-session.service';

describe('LLMSessionService', () => {
  const mockSessionId = 'test-session-123';

  beforeEach(() => {
    // Ensure clean state before each test
    llmSessionService.cleanup();
  });

  afterEach(() => {
    // Cleanup after each test
    llmSessionService.cleanup();
  });

  describe('createSession', () => {
    it('should create new session with correct initial state', () => {
      const session = llmSessionService.createSession(mockSessionId);

      expect(session).toBeDefined();
      expect(session.sessionId).toBe(mockSessionId);
      expect(session.messages).toHaveLength(1); // System message
      expect(session.messages[0].role).toBe('system');
      expect(session.messageCount).toBe(1);
    });

    it('should initialize createdAt timestamp', () => {
      const beforeCreate = Date.now();
      const session = llmSessionService.createSession(mockSessionId);
      const afterCreate = Date.now();

      expect(session.createdAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(session.createdAt).toBeLessThanOrEqual(afterCreate);
    });

    it('should initialize lastMessageAt timestamp', () => {
      const session = llmSessionService.createSession(mockSessionId);

      expect(session.lastMessageAt).toBe(session.createdAt);
    });

    it('should include system prompt in initial messages', () => {
      const session = llmSessionService.createSession(mockSessionId);

      expect(session.messages[0].role).toBe('system');
      expect(session.messages[0].content).toBeTruthy();
      expect(session.messages[0].content.length).toBeGreaterThan(0);
    });

    it('should return existing session if already created', () => {
      const session1 = llmSessionService.createSession(mockSessionId);
      const session2 = llmSessionService.createSession(mockSessionId);

      expect(session2).toEqual(session1);
    });

    it('should create multiple sessions independently', () => {
      const session1 = llmSessionService.createSession('session-1');
      const session2 = llmSessionService.createSession('session-2');

      expect(session1.sessionId).not.toBe(session2.sessionId);
      expect(llmSessionService.getSessionCount()).toBe(2);
    });
  });

  describe('hasSession', () => {
    it('should return true for existing session', () => {
      llmSessionService.createSession(mockSessionId);

      expect(llmSessionService.hasSession(mockSessionId)).toBe(true);
    });

    it('should return false for non-existent session', () => {
      expect(llmSessionService.hasSession('non-existent')).toBe(false);
    });

    it('should return false after session deletion', () => {
      llmSessionService.createSession(mockSessionId);
      llmSessionService.deleteSession(mockSessionId);

      expect(llmSessionService.hasSession(mockSessionId)).toBe(false);
    });
  });

  describe('getSession', () => {
    it('should return session object', () => {
      llmSessionService.createSession(mockSessionId);

      const session = llmSessionService.getSession(mockSessionId);

      expect(session).toBeDefined();
      expect(session?.sessionId).toBe(mockSessionId);
    });

    it('should return undefined for non-existent session', () => {
      const session = llmSessionService.getSession('non-existent');

      expect(session).toBeUndefined();
    });

    it('should reflect current message count', () => {
      llmSessionService.createSession(mockSessionId);
      llmSessionService.addUserMessage(mockSessionId, 'Hello');

      const session = llmSessionService.getSession(mockSessionId);

      expect(session?.messageCount).toBe(2); // System + user
    });
  });

  describe('addUserMessage', () => {
    beforeEach(() => {
      llmSessionService.createSession(mockSessionId);
    });

    it('should add user message to context', () => {
      const message = 'Hello, how are you?';

      llmSessionService.addUserMessage(mockSessionId, message);

      const session = llmSessionService.getSession(mockSessionId);
      const userMessage = session?.messages.find((m) => m.role === 'user');

      expect(userMessage).toBeDefined();
      expect(userMessage?.content).toBe(message);
    });

    it('should increment messageCount', () => {
      const initialCount = llmSessionService.getSession(mockSessionId)?.messageCount;

      llmSessionService.addUserMessage(mockSessionId, 'Message 1');

      const newCount = llmSessionService.getSession(mockSessionId)?.messageCount;

      expect(newCount).toBe((initialCount || 0) + 1);
    });

    it('should update lastMessageAt timestamp', () => {
      const session1 = llmSessionService.getSession(mockSessionId);
      const initialTime = session1?.lastMessageAt || 0;

      // Wait a bit and add message
      vi.useFakeTimers();
      vi.setSystemTime(new Date(initialTime + 5000));
      llmSessionService.addUserMessage(mockSessionId, 'Test');
      vi.useRealTimers();

      const session2 = llmSessionService.getSession(mockSessionId);

      expect((session2?.lastMessageAt || 0) > initialTime).toBe(true);
    });

    it('should not throw for non-existent session', () => {
      expect(() => {
        llmSessionService.addUserMessage('non-existent', 'message');
      }).not.toThrow();
    });

    it('should add message with timestamp', () => {
      const before = Date.now();
      llmSessionService.addUserMessage(mockSessionId, 'Test message');
      const after = Date.now();

      const session = llmSessionService.getSession(mockSessionId);
      const userMsg = session?.messages.find((m) => m.role === 'user');

      expect(userMsg?.timestamp).toBeGreaterThanOrEqual(before);
      expect(userMsg?.timestamp).toBeLessThanOrEqual(after);
    });

    it('should handle empty message', () => {
      llmSessionService.addUserMessage(mockSessionId, '');

      const session = llmSessionService.getSession(mockSessionId);
      const emptyMsg = session?.messages.find((m) => m.content === '');

      expect(emptyMsg).toBeDefined();
    });

    it('should handle long message', () => {
      const longMessage = 'a'.repeat(10000);

      llmSessionService.addUserMessage(mockSessionId, longMessage);

      const session = llmSessionService.getSession(mockSessionId);
      const msg = session?.messages.find((m) => m.role === 'user');

      expect(msg?.content).toBe(longMessage);
    });
  });

  describe('addAssistantMessage', () => {
    beforeEach(() => {
      llmSessionService.createSession(mockSessionId);
    });

    it('should add assistant message to context', () => {
      const message = 'Hello! How can I help you?';

      llmSessionService.addAssistantMessage(mockSessionId, message);

      const session = llmSessionService.getSession(mockSessionId);
      const assistantMessage = session?.messages.find((m) => m.role === 'assistant');

      expect(assistantMessage).toBeDefined();
      expect(assistantMessage?.content).toBe(message);
    });

    it('should increment messageCount', () => {
      const initialCount = llmSessionService.getSession(mockSessionId)?.messageCount;

      llmSessionService.addAssistantMessage(mockSessionId, 'Response');

      const newCount = llmSessionService.getSession(mockSessionId)?.messageCount;

      expect(newCount).toBe((initialCount || 0) + 1);
    });

    it('should update lastMessageAt timestamp', () => {
      const session1 = llmSessionService.getSession(mockSessionId);
      const initialTime = session1?.lastMessageAt || 0;

      vi.useFakeTimers();
      vi.setSystemTime(new Date(initialTime + 5000));
      llmSessionService.addAssistantMessage(mockSessionId, 'Response');
      vi.useRealTimers();

      const session2 = llmSessionService.getSession(mockSessionId);

      expect((session2?.lastMessageAt || 0) > initialTime).toBe(true);
    });

    it('should handle fallback messages', () => {
      const fallbackMessage = 'I apologize, can you repeat that?';

      llmSessionService.addAssistantMessage(mockSessionId, fallbackMessage);

      const session = llmSessionService.getSession(mockSessionId);
      const assistantMsg = session?.messages.find((m) => m.role === 'assistant');

      expect(assistantMsg?.content).toBe(fallbackMessage);
    });
  });

  describe('getConversationHistory', () => {
    beforeEach(() => {
      llmSessionService.createSession(mockSessionId);
    });

    it('should return messages for OpenAI API', () => {
      llmSessionService.addUserMessage(mockSessionId, 'Hello');
      llmSessionService.addAssistantMessage(mockSessionId, 'Hi there!');

      const history = llmSessionService.getConversationHistory(mockSessionId);

      expect(history).toHaveLength(3); // system + user + assistant
      expect(history[0]).toEqual({
        role: 'system',
        content: expect.any(String),
      });
      expect(history[1]).toEqual({ role: 'user', content: 'Hello' });
      expect(history[2]).toEqual({ role: 'assistant', content: 'Hi there!' });
    });

    it('should not include timestamps in history', () => {
      llmSessionService.addUserMessage(mockSessionId, 'Test');

      const history = llmSessionService.getConversationHistory(mockSessionId);
      const userMsg = history.find((m) => m.role === 'user');

      expect(userMsg).not.toHaveProperty('timestamp');
    });

    it('should maintain message order', () => {
      const messages = ['First', 'Second', 'Third', 'Fourth'];

      llmSessionService.addUserMessage(mockSessionId, messages[0]);
      llmSessionService.addAssistantMessage(mockSessionId, messages[1]);
      llmSessionService.addUserMessage(mockSessionId, messages[2]);
      llmSessionService.addAssistantMessage(mockSessionId, messages[3]);

      const history = llmSessionService.getConversationHistory(mockSessionId);
      const contentOnly = history.filter((m) => m.role !== 'system').map((m) => m.content);

      expect(contentOnly).toEqual(messages);
    });

    it('should return empty array for non-existent session', () => {
      const history = llmSessionService.getConversationHistory('non-existent');

      expect(history).toEqual([]);
    });

    it('should return formatted messages for OpenAI compatibility', () => {
      llmSessionService.addUserMessage(mockSessionId, 'Question?');

      const history = llmSessionService.getConversationHistory(mockSessionId);

      // Verify structure matches OpenAI API requirements
      for (const msg of history) {
        expect(msg).toHaveProperty('role');
        expect(msg).toHaveProperty('content');
        expect(['system', 'user', 'assistant']).toContain(msg.role);
        expect(typeof msg.content).toBe('string');
      }
    });
  });

  describe('deleteSession', () => {
    beforeEach(() => {
      llmSessionService.createSession(mockSessionId);
    });

    it('should delete existing session', () => {
      expect(llmSessionService.hasSession(mockSessionId)).toBe(true);

      llmSessionService.deleteSession(mockSessionId);

      expect(llmSessionService.hasSession(mockSessionId)).toBe(false);
    });

    it('should not throw for non-existent session', () => {
      expect(() => {
        llmSessionService.deleteSession('non-existent');
      }).not.toThrow();
    });

    it('should reduce session count', () => {
      const initialCount = llmSessionService.getSessionCount();

      llmSessionService.deleteSession(mockSessionId);

      const newCount = llmSessionService.getSessionCount();

      expect(newCount).toBe(initialCount - 1);
    });

    it('should allow recreation of deleted session', () => {
      llmSessionService.deleteSession(mockSessionId);

      const newSession = llmSessionService.createSession(mockSessionId);

      expect(newSession.sessionId).toBe(mockSessionId);
      expect(newSession.messageCount).toBe(1); // Fresh session
    });
  });

  describe('getAllSessions', () => {
    it('should return all sessions', () => {
      llmSessionService.createSession('session-1');
      llmSessionService.createSession('session-2');
      llmSessionService.createSession('session-3');

      const allSessions = llmSessionService.getAllSessions();

      expect(allSessions).toHaveLength(3);
      expect(allSessions.map((s) => s.sessionId)).toContain('session-1');
      expect(allSessions.map((s) => s.sessionId)).toContain('session-2');
      expect(allSessions.map((s) => s.sessionId)).toContain('session-3');
    });

    it('should return empty array when no sessions', () => {
      const allSessions = llmSessionService.getAllSessions();

      expect(allSessions).toEqual([]);
    });

    it('should return copy not reference', () => {
      llmSessionService.createSession(mockSessionId);

      const sessions1 = llmSessionService.getAllSessions();
      const sessions2 = llmSessionService.getAllSessions();

      expect(sessions1).not.toBe(sessions2);
      expect(sessions1).toEqual(sessions2);
    });
  });

  describe('getSessionCount', () => {
    it('should return correct count', () => {
      expect(llmSessionService.getSessionCount()).toBe(0);

      llmSessionService.createSession('session-1');
      expect(llmSessionService.getSessionCount()).toBe(1);

      llmSessionService.createSession('session-2');
      expect(llmSessionService.getSessionCount()).toBe(2);

      llmSessionService.deleteSession('session-1');
      expect(llmSessionService.getSessionCount()).toBe(1);
    });
  });

  describe('Cleanup Timer', () => {
    it('should start cleanup timer on init', () => {
      // Timer is started in constructor if not in test mode
      // We just verify no errors occur
      expect(() => {
        llmSessionService.createSession('test-session');
      }).not.toThrow();
    });

    it('should stop cleanup timer', () => {
      llmSessionService.createSession('test-session');

      expect(() => {
        llmSessionService.stopCleanupTimer();
      }).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should delete all sessions', () => {
      llmSessionService.createSession('session-1');
      llmSessionService.createSession('session-2');

      expect(llmSessionService.getSessionCount()).toBe(2);

      llmSessionService.cleanup();

      expect(llmSessionService.getSessionCount()).toBe(0);
    });

    it('should allow new sessions after cleanup', () => {
      llmSessionService.createSession('session-1');
      llmSessionService.cleanup();

      const newSession = llmSessionService.createSession('session-2');

      expect(newSession.sessionId).toBe('session-2');
      expect(llmSessionService.getSessionCount()).toBe(1);
    });

    it('should stop cleanup timer', () => {
      llmSessionService.createSession('test');

      expect(() => {
        llmSessionService.cleanup();
        llmSessionService.cleanup(); // Should not throw
      }).not.toThrow();
    });

    it('should not throw if called multiple times', () => {
      llmSessionService.createSession('test');

      expect(() => {
        llmSessionService.cleanup();
        llmSessionService.cleanup();
        llmSessionService.cleanup();
      }).not.toThrow();
    });
  });

  describe('Conversation Context - Full Flow', () => {
    it('should maintain conversation across multiple turns', () => {
      llmSessionService.createSession(mockSessionId);

      // Turn 1
      llmSessionService.addUserMessage(mockSessionId, 'What is Python?');
      llmSessionService.addAssistantMessage(mockSessionId, 'Python is a programming language.');

      // Turn 2
      llmSessionService.addUserMessage(mockSessionId, 'Is it used for web development?');
      llmSessionService.addAssistantMessage(
        mockSessionId,
        'Yes, Python is widely used for web development.'
      );

      const history = llmSessionService.getConversationHistory(mockSessionId);

      expect(history).toHaveLength(5); // system + 4 user/assistant messages
      expect(history[1].content).toBe('What is Python?');
      expect(history[2].content).toBe('Python is a programming language.');
      expect(history[3].content).toBe('Is it used for web development?');
      expect(history[4].content).toBe('Yes, Python is widely used for web development.');
    });

    it('should maintain proper message alternation', () => {
      llmSessionService.createSession(mockSessionId);

      llmSessionService.addUserMessage(mockSessionId, 'User 1');
      llmSessionService.addAssistantMessage(mockSessionId, 'Assistant 1');
      llmSessionService.addUserMessage(mockSessionId, 'User 2');
      llmSessionService.addAssistantMessage(mockSessionId, 'Assistant 2');

      const history = llmSessionService.getConversationHistory(mockSessionId);
      const roles = history.map((m) => m.role);

      expect(roles).toEqual(['system', 'user', 'assistant', 'user', 'assistant']);
    });
  });
});
