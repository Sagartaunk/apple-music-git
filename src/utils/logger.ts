import { app } from 'electron';

/**
 * Production-safe logging utility
 * Suppresses debug logs in production builds while preserving warnings and errors
 */
class Logger {
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = !app.isPackaged;
  }

  /**
   * Log debug information (only in development)
   */
  log(...args: unknown[]): void {
    if (this.isDevelopment) {
      console.log(...args);
    }
  }

  /**
   * Log warnings (always shown)
   */
  warn(...args: unknown[]): void {
    console.warn(...args);
  }

  /**
   * Log errors (always shown)
   */
  error(...args: unknown[]): void {
    console.error(...args);
  }

  /**
   * Log information (always shown)
   */
  info(...args: unknown[]): void {
    console.info(...args);
  }
}

// Export singleton instance
export const logger = new Logger();
