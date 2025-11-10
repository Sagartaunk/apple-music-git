import { app } from 'electron';

/**
 * Production-safe logging utility with consistent prefixes
 * Automatically suppresses debug logs in packaged builds
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
      console.log('[App 📝]', ...args);
    }
  }

  /**
   * Log warnings (always shown)
   */
  warn(...args: unknown[]): void {
    console.warn('[App ⚠️ ]', ...args);
  }

  /**
   * Log errors (always shown)
   */
  error(...args: unknown[]): void {
    console.error('[App ❌]', ...args);
  }

  /**
   * Log information (always shown)
   */
  info(...args: unknown[]): void {
    console.info('[App ℹ️ ]', ...args);
  }

  /**
   * Log success messages (only in development)
   */
  success(...args: unknown[]): void {
    if (this.isDevelopment) {
      console.log('[App ✅]', ...args);
    }
  }
}

// Export singleton instance
export const logger = new Logger();
