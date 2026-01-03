import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { env, validateEnv } from '@/shared/config';
import { logger } from '@/shared/utils';
import {
  initializeSocketServer,
  shutdownSocketServer,
  getSocketStats,
} from '@/modules/socket';

// Validate environment variables
try {
  validateEnv();
} catch (error) {
  logger.error('Environment validation failed', error as Error);
  process.exit(1);
}

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  const socketStats = getSocketStats(wss);
  const isWebSocketServerHealthy = wss !== undefined && socketStats.totalConnections >= 0;

  res.json({
    status: isWebSocketServerHealthy ? 'ok' : 'degraded',
    message: 'Vantum API is running',
    uptime: process.uptime(),
    sessions: socketStats.sessionStats,
    websocketServer: {
      healthy: isWebSocketServerHealthy,
      totalConnections: socketStats.totalConnections,
      activeSessions: socketStats.activeSessions,
    },
  });
});

// Create HTTP server
const httpServer = createServer(app);

// Initialize WebSocket server
const wss = initializeSocketServer(httpServer);

// Graceful shutdown handler
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, starting graceful shutdown`);

  try {
    // Step 1: Stop accepting new connections
    await new Promise<void>((resolve) => {
      httpServer.close(() => {
        logger.info('HTTP server closed');
        resolve();
      });

      // Force close after timeout
      setTimeout(() => {
        logger.warn('HTTP server force closed after timeout');
        resolve();
      }, 5000);
    });

    // Step 2: Shutdown WebSocket server (this handles WebSocket cleanup)
    await shutdownSocketServer(wss);

    // Step 3: Shutdown STT service (Phase 3)
    try {
      const { sttController } = await import('@/modules/stt');
      await sttController.shutdown();
      logger.info('STT service shutdown complete');
    } catch (error) {
      logger.error('Error shutting down STT service', error as Error);
    }

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', error as Error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled rejection', { reason });
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Start server
httpServer.listen(env.PORT, () => {
  logger.info(`🚀 Vantum backend server started`, {
    port: env.PORT,
    environment: env.NODE_ENV,
    frontendUrl: env.FRONTEND_URL,
  });
});
