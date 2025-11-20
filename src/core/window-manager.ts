import { BrowserWindow, screen, app } from "electron";
import * as path from "path";
import {
  loadWindowState,
  saveWindowState,
  WindowState,
} from "../utils/persistence";
import { logger } from "../utils/logger";
import { checkWidevineStatus } from "../utils/widevine";

// Declare webpack entry points
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

/**
 * WindowManager - Handles main window lifecycle, bounds, and state management
 */
export class WindowManager {
  private window: BrowserWindow | null = null;
  private windowState: WindowState;

  constructor() {
    this.windowState = loadWindowState();
  }

  /**
   * Get the main window instance
   */
  getWindow(): BrowserWindow | null {
    return this.window;
  }

  /**
   * Get current window state
   */
  getWindowState(): WindowState {
    return this.windowState;
  }

  /**
   * Update window state property
   */
  updateWindowState(updates: Partial<WindowState>): void {
    this.windowState = { ...this.windowState, ...updates };
    saveWindowState(this.windowState);
  }

  /**
   * Create the main application window with control overlay
   */
  async createWindow(): Promise<BrowserWindow> {
    try {
      logger.log("📊 Loading window state:", {
        width: this.windowState.width,
        height: this.windowState.height,
        x: this.windowState.x,
        y: this.windowState.y,
        isMaximized: this.windowState.isMaximized,
        isDarkMode: this.windowState.isDarkMode,
        isMiniPlayer: this.windowState.isMiniPlayer,
      });

      // Ensure valid window dimensions
      const width = Math.max(this.windowState.width || 1200, 800);
      const height = Math.max(this.windowState.height || 800, 600);

      // Calculate center position if no saved position exists
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: screenWidth, height: screenHeight } =
        primaryDisplay.workAreaSize;

      const x =
        this.windowState.x !== undefined
          ? this.windowState.x
          : Math.floor((screenWidth - width) / 2);
      const y =
        this.windowState.y !== undefined
          ? this.windowState.y
          : Math.floor((screenHeight - height) / 2);

      logger.log("📐 Creating window with bounds:", { x, y, width, height });
      logger.log("🖥️  Primary display:", { screenWidth, screenHeight });

      this.window = new BrowserWindow({
        width,
        height,
        x,
        y,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: this.windowState.isDarkMode ? "#000000" : "#FFFFFF",
        show: true,
        center: this.windowState.x === undefined || this.windowState.y === undefined,
        webPreferences: {
          preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          allowRunningInsecureContent: false,
          devTools: !app.isPackaged,
        },
        frame: true,
        title: "Apple Music",
        icon: path.join(__dirname, "../assets/icon.png"),
        skipTaskbar: false,
        focusable: true,
        alwaysOnTop: false,
        autoHideMenuBar: true,
      });

      const actualBounds = this.window.getBounds();
      logger.log("✅ Window created with actual bounds:", actualBounds);
      logger.log("👁️  Window visible:", this.window.isVisible());
      logger.log("🎯 Window focused:", this.window.isFocused());

      // Force focus and show (Linux compatibility)
      this.window.show();
      this.window.focus();
      logger.log("👁️  Window explicitly shown and focused");

      // Load the control UI
      logger.log("📄 Loading control UI from:", MAIN_WINDOW_WEBPACK_ENTRY);
      await this.window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY).catch((error) => {
        logger.error("❌ Failed to load control UI:", error);
        throw error;
      });
      logger.log("✅ Control UI loaded successfully");

      // Check Widevine status
      const widevineStatus = checkWidevineStatus();
      if (!widevineStatus.available) {
        logger.error("⚠️  Widevine not available:", widevineStatus.message);
        logger.error("   Install with: yay -S chromium-widevine (Arch AUR)");
      } else {
        logger.log("✅ Widevine CDM loaded:", widevineStatus.path);
      }

      // Setup window event handlers
      this.setupWindowEvents();

      // Apply maximized state if needed (after showing window)
      if (this.windowState.isMaximized) {
        logger.log("📏 Maximizing window...");
        this.window.maximize();
      }

      // Debug: Log renderer console messages in development
      if (!app.isPackaged) {
        this.window.webContents.on("console-message", (event, level, message) => {
          logger.log(`🖥️  [Renderer]:`, message);
        });
      }

      // Debug: Log load failures
      this.window.webContents.on(
        "did-fail-load",
        (event, errorCode, errorDescription, validatedURL) => {
          logger.error("❌ Control UI failed to load:", {
            errorCode,
            errorDescription,
            url: validatedURL,
          });
        }
      );

      // Linux-specific: Ensure window is raised to front
      if (process.platform === "linux") {
        logger.log("🐧 Linux detected - ensuring window visibility");
        this.window.moveTop();
        this.window.setAlwaysOnTop(true);
        setTimeout(() => {
          if (this.window && !this.window.isDestroyed()) {
            this.window.setAlwaysOnTop(false);
            logger.log(
              "👁️  Window visibility forced (temporary always-on-top removed)"
            );
          }
        }, 500);
      }

      logger.log("🎉 Window creation complete!");
      return this.window;
    } catch (error) {
      logger.error("❌ Failed to create main window:", error);
      logger.error("Stack trace:", (error as Error).stack);
      throw error;
    }
  }

  /**
   * Setup window event handlers for state management
   */
  private setupWindowEvents(): void {
    if (!this.window) return;

    this.window.webContents.once("did-finish-load", () => {
      logger.log("✅ Control UI finished loading");
      const finalBounds = this.window?.getBounds();
      logger.log("📊 Final window bounds:", finalBounds);
      logger.log("👁️  Window visible:", this.window?.isVisible());
      logger.log("🎯 Window focused:", this.window?.isFocused());
      logger.log("📍 Window minimized:", this.window?.isMinimized());
    });

    this.window.on("close", () => {
      if (this.window) {
        const bounds = this.window.getBounds();
        const isMaximized = this.window.isMaximized();
        logger.log("💾 Saving window state on close:", {
          bounds,
          isMaximized,
        });
        saveWindowState({
          ...this.windowState,
          width: bounds.width,
          height: bounds.height,
          x: bounds.x,
          y: bounds.y,
          isMaximized,
        });
      }
    });

    this.window.on("closed", () => {
      logger.log("🚪 Window closed");
      this.window = null;
    });

    this.window.on("resize", () => {
      // Emit event that can be listened to by MusicViewManager
      this.window?.webContents.send("window-resized");
    });

    this.window.on("maximize", () => {
      logger.log("📏 Window maximized");
      this.window?.webContents.send("window-resized");
    });

    this.window.on("unmaximize", () => {
      logger.log("📏 Window unmaximized");
      this.window?.webContents.send("window-resized");
    });
  }

  /**
   * Get content bounds for BrowserView positioning
   */
  getContentBounds(): { x: number; y: number; width: number; height: number } | null {
    if (!this.window) return null;
    return this.window.getContentBounds();
  }

  /**
   * Set window background color
   */
  setBackgroundColor(color: string): void {
    this.window?.setBackgroundColor(color);
  }

  /**
   * Cleanup on app quit
   */
  saveStateOnQuit(): void {
    try {
      if (this.window && !this.window.isDestroyed()) {
        const bounds = this.window.getBounds();
        const isMaximized = this.window.isMaximized();
        saveWindowState({
          ...this.windowState,
          width: bounds.width,
          height: bounds.height,
          x: bounds.x,
          y: bounds.y,
          isMaximized,
        });
      }
    } catch (error) {
      logger.error("❌ Failed to save state on quit:", error);
    }
  }
}
