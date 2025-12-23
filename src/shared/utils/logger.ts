/**
 * Structured Logging Utility
 * Simple colorized console logger for development
 */

// Log levels
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

// Log level colors
const levelColors: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: colors.gray,
  [LogLevel.INFO]: colors.blue,
  [LogLevel.WARN]: colors.yellow,
  [LogLevel.ERROR]: colors.red,
};

// Log level priority
const levelPriority: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

// Logger configuration
interface LoggerConfig {
  level: LogLevel;
  enableColors: boolean;
  enableTimestamp: boolean;
}

class Logger {
  private config: LoggerConfig = {
    level: (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO,
    enableColors: process.env.NODE_ENV !== 'production',
    enableTimestamp: true,
  };

  /**
   * Format timestamp
   */
  private formatTimestamp(): string {
    const now = new Date();
    return now.toISOString();
  }

  /**
   * Colorize text
   */
  private colorize(text: string, color: string): string {
    if (!this.config.enableColors) {
      return text;
    }
    return `${color}${text}${colors.reset}`;
  }

  /**
   * Format log message
   */
  private formatMessage(
    level: LogLevel,
    message: string,
    meta?: Record<string, any>
  ): string {
    const parts: string[] = [];

    // Timestamp
    if (this.config.enableTimestamp) {
      parts.push(this.colorize(this.formatTimestamp(), colors.gray));
    }

    // Log level
    const levelStr = level.toUpperCase().padEnd(5);
    parts.push(this.colorize(levelStr, levelColors[level]));

    // Message
    parts.push(message);

    // Metadata
    if (meta && Object.keys(meta).length > 0) {
      const metaStr = JSON.stringify(meta, null, 0);
      parts.push(this.colorize(metaStr, colors.gray));
    }

    return parts.join(' ');
  }

  /**
   * Check if level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return levelPriority[level] >= levelPriority[this.config.level];
  }

  /**
   * Log at specified level
   */
  private log(level: LogLevel, message: string, meta?: Record<string, any>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, meta);

    switch (level) {
      case LogLevel.ERROR:
        console.error(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.DEBUG:
        console.debug(formattedMessage);
        break;
      default:
        console.log(formattedMessage);
    }
  }

  /**
   * Debug level logging
   */
  debug(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, meta);
  }

  /**
   * Info level logging
   */
  info(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, meta);
  }

  /**
   * Warning level logging
   */
  warn(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, meta);
  }

  /**
   * Error level logging
   */
  error(message: string, error?: Error | Record<string, any>): void {
    const meta: Record<string, any> = {};

    if (error instanceof Error) {
      meta.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error) {
      meta.error = error;
    }

    this.log(LogLevel.ERROR, message, meta);
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Enable/disable colors
   */
  setColors(enabled: boolean): void {
    this.config.enableColors = enabled;
  }
}

// Export singleton instance
export const logger = new Logger();

// Export for testing
export { Logger };

