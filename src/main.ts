import { app, BrowserWindow } from "electron";
import { setupWidevine } from "./utils/widevine";
import { logger } from "./utils/logger";
import { WindowManager } from "./core/window-manager";
import { MusicViewManager } from "./core/music-view-manager";
import { IPCHandlersManager } from "./core/ipc-handlers";

// ============================================================================
// PERFORMANCE OPTIMIZATIONS & CHROMIUM FLAGS
// ============================================================================

// Disable unnecessary Chromium features for better performance
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-breakpad");
app.commandLine.appendSwitch("disable-component-update");
app.commandLine.appendSwitch("disable-domain-reliability");
app.commandLine.appendSwitch("disable-features", "MediaRouter");
app.commandLine.appendSwitch("disable-print-preview");
app.commandLine.appendSwitch("disable-metrics");
app.commandLine.appendSwitch("disable-metrics-repo");
app.commandLine.appendSwitch("no-default-browser-check");
app.commandLine.appendSwitch("no-pings");

// Audio optimization
app.commandLine.appendSwitch("enable-features", "PulseaudioLoopbackForScreenShare");
app.commandLine.appendSwitch("audio-buffer-size", "2048");

// Cache size control (100MB limit)
app.commandLine.appendSwitch("disk-cache-size", String(100 * 1024 * 1024));

// Autoplay enablement
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

// Hardware acceleration for DRM
app.commandLine.appendSwitch("enable-features", "VaapiVideoDecoder,VaapiVideoEncoder");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");

// Widevine DRM setup
const widevinePath = setupWidevine();
app.commandLine.appendSwitch("widevine-cdm-path", widevinePath);
app.commandLine.appendSwitch("widevine-cdm-version", "4.10.2710.0");
logger.log("🔐 Widevine configured at:", widevinePath);

// Safari user agent for Apple Music compatibility
const SAFARI_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15";
app.userAgentFallback = SAFARI_USER_AGENT;
logger.log("🌐 Global user agent set to Safari");

// Disable hardware media keys
app.commandLine.appendSwitch("disable-features", "HardwareMediaKeyHandling");

// ============================================================================
// GLOBAL STATE
// ============================================================================

let windowManager: WindowManager;
let musicViewManager: MusicViewManager;
let ipcHandlers: IPCHandlersManager;

// ============================================================================
// APPLICATION INITIALIZATION
// ============================================================================

/**
 * Initialize the application with modular architecture
 */
async function initializeApp(): Promise<void> {
  try {
    logger.log("🚀 Initializing application...");

    // Create window manager
    windowManager = new WindowManager();
    const mainWindow = await windowManager.createWindow();

    // Create music view manager
    musicViewManager = new MusicViewManager(
      mainWindow,
      windowManager.getWindowState()
    );
    await musicViewManager.createMusicView();

    // Setup IPC handlers
    ipcHandlers = new IPCHandlersManager(windowManager, musicViewManager);
    ipcHandlers.setupHandlers();

    // Setup window resize listener for music view
    mainWindow.on("resize", () => {
      musicViewManager.updateMusicViewBounds();
    });

    mainWindow.on("maximize", () => {
      musicViewManager.updateMusicViewBounds();
    });

    mainWindow.on("unmaximize", () => {
      musicViewManager.updateMusicViewBounds();
    });

    // Cleanup on window close
    mainWindow.on("closed", () => {
      musicViewManager.cleanup();
    });

    logger.success("Application initialized successfully");
  } catch (error) {
    logger.error("❌ Failed to initialize application:", error);
    logger.error("Stack trace:", (error as Error).stack);
    app.quit();
  }
}

// ============================================================================
// APP LIFECYCLE
// ============================================================================

app
  .whenReady()
  .then(async () => {
    try {
      logger.log("🚀 Electron app ready");
      logger.log("📍 Platform:", process.platform);
      logger.log("📍 Electron version:", process.versions.electron);
      logger.log("📍 Chrome version:", process.versions.chrome);
      logger.log("📍 Node version:", process.versions.node);

      await initializeApp();

      app.on("activate", async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          await initializeApp();
        }
      });
    } catch (error) {
      logger.error("❌ App initialization failed:", error);
      app.quit();
    }
  })
  .catch((error) => {
    logger.error("❌ App ready event failed:", error);
    app.quit();
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  try {
    windowManager?.saveStateOnQuit();
  } catch (error) {
    logger.error("❌ Failed to save state on quit:", error);
  }
});

// ============================================================================
// GLOBAL ERROR HANDLERS
// ============================================================================

process.on("unhandledRejection", (reason, _promise) => {
  logger.error("❌ Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  logger.error("❌ Uncaught Exception:", error);
});

app.on("render-process-gone", (event, webContents, details) => {
  logger.error("❌ Renderer process gone:", details);
});

logger.log("✅ Main process initialized");
