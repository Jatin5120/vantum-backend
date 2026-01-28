"use strict";
/**
 * TTS Timeout Configuration
 * P1-5 FIX: Added synthesisTimeoutMs for synthesis operation timeout
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ttsTimeoutConfig = void 0;
exports.ttsTimeoutConfig = {
    // Synthesis timeouts
    synthesisTimeout: Number(process.env.TTS_SYNTHESIS_TIMEOUT_MS) || 5000, // 5s
    synthesisTimeoutMs: Number(process.env.TTS_SYNTHESIS_TIMEOUT_MS) || 30000, // 30s for synthesis operation
    // Connection timeouts
    connectionTimeout: Number(process.env.TTS_CONNECTION_TIMEOUT_MS) || 5000, // 5s
    reconnectionTimeout: 3000, // 3s for reconnection
    // KeepAlive interval (Cartesia recommended)
    keepaliveInterval: Number(process.env.TTS_KEEPALIVE_INTERVAL_MS) || 8000, // 8s
    // Shutdown timeout
    shutdownTimeout: 10000, // 10s total
    shutdownTimeoutPerSession: 2000, // 2s per session
    // Cleanup intervals
    cleanupInterval: Number(process.env.TTS_CLEANUP_INTERVAL_MS) || 300000, // 5 minutes
    sessionIdleTimeout: Number(process.env.TTS_SESSION_IDLE_TIMEOUT_MS) || 600000, // 10 minutes
    sessionTimeout: Number(process.env.TTS_SESSION_TIMEOUT_MS) || 1800000, // 30 minutes
    // Session limits
    maxSessions: Number(process.env.TTS_MAX_CONCURRENT_SESSIONS) || 50,
};
