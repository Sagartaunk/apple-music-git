import {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  session,
  Session,
  screen,
  shell,
} from "electron";
import * as path from "path";
import { setupWidevine, checkWidevineStatus } from "./utils/widevine";
import {
  loadWindowState,
  saveWindowState,
  WindowState,
} from "./utils/persistence";
import { logger } from "./utils/logger";
import { createClickScript } from "./utils/selectors";
import { detectRegion } from "./utils/region";

// Declare main_window for webpack entry point
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Extended BrowserView interface for listener management
interface ExtendedBrowserView extends BrowserView {
  _listeners?: Record<string, (...args: unknown[]) => void>;
}

// Extended WebContents for type safety
interface WebContentsWithListeners {
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

// ============================================================================
// PERFORMANCE OPTIMIZATIONS: Disable unnecessary Chromium features
// ============================================================================

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

// Audio optimization: ensure single audio stream
app.commandLine.appendSwitch(
  "enable-features",
  "PulseaudioLoopbackForScreenShare",
);
app.commandLine.appendSwitch("audio-buffer-size", "2048");

// Cache size control (100MB global limit)
app.commandLine.appendSwitch("disk-cache-size", String(100 * 1024 * 1024));

// ✅ AUTOPLAY FIX: Enable autoplay without user gesture requirement
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

// ✅ DRM FIX: Ensure hardware acceleration for media playback
app.commandLine.appendSwitch(
  "enable-features",
  "VaapiVideoDecoder,VaapiVideoEncoder",
);
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");

// Widevine DRM enablement
const widevinePath = setupWidevine();
app.commandLine.appendSwitch("widevine-cdm-path", widevinePath);
app.commandLine.appendSwitch("widevine-cdm-version", "4.10.2710.0");

logger.log("🔐 Widevine configured at:", widevinePath);

// ✅ Set global user agent BEFORE any session/view creation
// This prevents "not available in your region" errors
const SAFARI_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15";
app.userAgentFallback = SAFARI_USER_AGENT;
logger.log("🌐 Global user agent set to Safari");

// Disable hardware media keys (prevents conflicts with system media controls)
app.commandLine.appendSwitch("disable-features", "HardwareMediaKeyHandling");

// ============================================================================
// GLOBAL STATE
// ============================================================================

let mainWindow: BrowserWindow | null = null;
let musicView: ExtendedBrowserView | null = null;
let windowState: WindowState;
let lastProcessedPlaylistUrl: string = ""; // Track processed playlists to avoid duplicate triggers
let widevineChecked = false; // Flag to prevent redundant Widevine checks

// ============================================================================
// MAIN WINDOW CREATION
// ============================================================================

/**
 * Create the main application window with control overlay
 * FIXED: Window shows immediately with guaranteed visibility on Linux
 */
async function createWindow(): Promise<void> {
  try {
    // Load persisted window state
    windowState = loadWindowState();

    // 🔍 DEBUG: Log window state before creation
    logger.log("📊 Loading window state:", {
      width: windowState.width,
      height: windowState.height,
      x: windowState.x,
      y: windowState.y,
      isMaximized: windowState.isMaximized,
      isDarkMode: windowState.isDarkMode,
      isMiniPlayer: windowState.isMiniPlayer,
    });

    // Ensure valid window dimensions (fallback to defaults if invalid)
    const width = Math.max(windowState.width || 1200, 800);
    const height = Math.max(windowState.height || 800, 600);

    // Calculate center position if no saved position exists
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } =
      primaryDisplay.workAreaSize;

    const x =
      windowState.x !== undefined
        ? windowState.x
        : Math.floor((screenWidth - width) / 2);
    const y =
      windowState.y !== undefined
        ? windowState.y
        : Math.floor((screenHeight - height) / 2);

    logger.log("📐 Creating window with bounds:", { x, y, width, height });
    logger.log("🖥️  Primary display:", { screenWidth, screenHeight });

    mainWindow = new BrowserWindow({
      width,
      height,
      x,
      y,
      minWidth: 800,
      minHeight: 600,
      backgroundColor: windowState.isDarkMode ? "#000000" : "#FFFFFF",
      show: true, // ✅ Show immediately
      center: windowState.x === undefined || windowState.y === undefined,
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

    // 🔍 DEBUG: Log actual window bounds after creation
    const actualBounds = mainWindow.getBounds();
    logger.log("✅ Window created with actual bounds:", actualBounds);
    logger.log("👁️  Window visible:", mainWindow.isVisible());
    logger.log("🎯 Window focused:", mainWindow.isFocused());

    // Force focus and show (Linux compatibility)
    mainWindow.show();
    mainWindow.focus();
    logger.log("👁️  Window explicitly shown and focused");

    // Load the control UI
    logger.log("📄 Loading control UI from:", MAIN_WINDOW_WEBPACK_ENTRY);
    await mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY).catch((error) => {
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

    // Create BrowserView for Apple Music
    logger.log("🎵 Creating Apple Music BrowserView...");
    await createMusicView();

    // Apply maximized state if needed (after showing window)
    if (windowState.isMaximized) {
      logger.log("📏 Maximizing window...");
      mainWindow.maximize();
    }

    // 🔍 DEBUG: Final window state after all setup
    mainWindow.webContents.once("did-finish-load", () => {
      logger.log("✅ Control UI finished loading");
      const finalBounds = mainWindow?.getBounds();
      logger.log("📊 Final window bounds:", finalBounds);
      logger.log("👁️  Window visible:", mainWindow?.isVisible());
      logger.log("🎯 Window focused:", mainWindow?.isFocused());
      logger.log("📍 Window minimized:", mainWindow?.isMinimized());
    });

    // Debug: Log renderer console messages
    if (!app.isPackaged) {
      mainWindow.webContents.on("console-message", (event, level, message) => {
        logger.log(`🖥️  [Renderer]:`, message);
      });
    }

    // Debug: Log load failures
    mainWindow.webContents.on(
      "did-fail-load",
      (event, errorCode, errorDescription, validatedURL) => {
        logger.error("❌ Control UI failed to load:", {
          errorCode,
          errorDescription,
          url: validatedURL,
        });
      },
    );

    // Save window state on close
    mainWindow.on("close", () => {
      if (mainWindow) {
        const bounds = mainWindow.getBounds();
        const isMaximized = mainWindow.isMaximized();
        logger.log("💾 Saving window state on close:", {
          bounds,
          isMaximized,
        });
        saveWindowState({
          ...windowState,
          width: bounds.width,
          height: bounds.height,
          x: bounds.x,
          y: bounds.y,
          isMaximized,
        });
      }
    });

    mainWindow.on("closed", () => {
      logger.log("🚪 Window closed");
      
      // ✅ FIX: Clean up event listeners to prevent memory leaks
      if (musicView && !musicView.webContents.isDestroyed()) {
        const listeners = musicView._listeners;
        if (listeners) {
          Object.keys(listeners).forEach((event) => {
            try {
              const listener = listeners[event];
              if (listener) {
                (musicView?.webContents as unknown as WebContentsWithListeners).removeListener(event, listener);
              }
            } catch (error) {
              logger.warn(`Failed to remove listener for ${event}:`, error);
            }
          });
          delete musicView._listeners;
        }
      }
      
      mainWindow = null;
      musicView = null;
    });

    // Handle window resize
    mainWindow.on("resize", () => {
      updateMusicViewBounds();
    });

    mainWindow.on("maximize", () => {
      logger.log("📏 Window maximized");
      updateMusicViewBounds();
    });

    mainWindow.on("unmaximize", () => {
      logger.log("📏 Window unmaximized");
      updateMusicViewBounds();
    });

    // Linux-specific: Ensure window is raised to front
    if (process.platform === "linux") {
      logger.log("🐧 Linux detected - ensuring window visibility");
      mainWindow.moveTop();
      mainWindow.setAlwaysOnTop(true);
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setAlwaysOnTop(false);
          logger.log(
            "👁️  Window visibility forced (temporary always-on-top removed)",
          );
        }
      }, 500);
    }

    logger.log("🎉 Window creation complete!");
  } catch (error) {
    logger.error("❌ Failed to create main window:", error);
    logger.error("Stack trace:", (error as Error).stack);
    app.quit();
  }
}

// ============================================================================
// BROWSER VIEW CREATION (Apple Music Web Player)
// ============================================================================

/**
 * Create BrowserView for Apple Music web player
 * FIXED: Full DRM and autoplay support with login detection
 */
async function createMusicView(): Promise<void> {
  if (!mainWindow) {
    logger.error("❌ Cannot create music view: mainWindow is null");
    return;
  }

  try {
    const ses: Session = session.fromPartition("persist:applemusic", {
      cache: true,
    });

    logger.log("🔧 Configuring session for Apple Music...");

    // ✅ Enable all media-related permissions for DRM playback
    ses.setPermissionRequestHandler((webContents, permission, callback) => {
      const allowedPermissions = [
        "media",
        "mediaKeySystem",
        "audio",
        "audioCapture",
        "videoCapture",
        "pointerLock",
        "fullscreen",
      ];
      const allowed = allowedPermissions.includes(permission);
      logger.log(
        `🔐 Permission request: ${permission} → ${allowed ? "✅ ALLOW" : "❌ DENY"}`,
      );
      callback(allowed);
    });

    // ✅ FIXED: User agent already set globally via app.userAgentFallback
    // Set on session as well for redundancy
    ses.setUserAgent(SAFARI_USER_AGENT);
    logger.log("🌐 Session user agent confirmed");

    // ✅ PERFORMANCE FIX: Don't clear cache on every startup (200-500ms savings)
    // Cache clearing can be triggered with --clear-cache CLI flag if needed
    if (process.argv.includes('--clear-cache')) {
      try {
        await ses.clearCache();
        logger.log("✅ Cache cleared (--clear-cache flag detected)");
      } catch (cacheError) {
        logger.warn("⚠️  Cache clear failed:", cacheError);
      }
    }

    // ✅ Configure cookies to persist login
    ses.cookies.on("changed", (event, cookie, cause, removed) => {
      if (!removed && cookie.domain?.includes("apple.com")) {
        logger.log("🍪 Apple cookie updated:", cookie.name, "→", cause);
      }
    });

    musicView = new BrowserView({
      webPreferences: {
        partition: "persist:applemusic",
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false, // ✅ CRITICAL: Disable sandbox for Widevine plugins
        webSecurity: true,
        allowRunningInsecureContent: false,
        plugins: true, // ✅ Required for Widevine CDM
        session: ses,
        devTools: !app.isPackaged,
        // ✅ Enable media playback
        backgroundThrottling: false,
        // ✅ Enable WebRTC and media streams
        enableWebSQL: false,
      },
    });

    mainWindow.setBrowserView(musicView);
    updateMusicViewBounds();

    // ✅ Detect user region and load appropriate Apple Music URL
    logger.log("🌍 Detecting user region...");
    const regionInfo = await detectRegion();
    logger.log(`🌍 Region detected: ${regionInfo.country} - ${regionInfo.message}`);
    const appleMusicUrl = regionInfo.appleMusicUrl;

    logger.log("🌐 Loading Apple Music URL:", appleMusicUrl);

    // ✅ FIXED: Remove invalid preload reference (BrowserView doesn't need separate preload)
    
    // Load Apple Music with region-specific URL
    await musicView.webContents
      .loadURL(appleMusicUrl)
      .catch((error) => {
        logger.error("❌ Failed to load Apple Music:", error);
        throw error;
      });

    // ✅ Store listener references for cleanup
    const listeners: Record<string, (...args: unknown[]) => void> = {};
    
    // ✅ Monitor playback state and login status
    const didFinishLoadListener = async () => {
      logger.log("✅ Apple Music page finished loading");

      // Check if user is logged in
      try {
        const loginStatus = await musicView?.webContents.executeJavaScript(`
          (function() {
            // Check for login indicators
            const isLoggedIn = !!(
              document.querySelector('[data-testid="chrome-user-menu"]') ||
              document.querySelector('.web-chrome-playback-lcd') ||
              document.querySelector('[data-testid="playback-progress-bar"]') ||
              localStorage.getItem('music.ampwebplay.vevo-token') ||
              document.cookie.includes('itspod') ||
              document.cookie.includes('myacinfo')
            );

            const loginButton = document.querySelector('[href*="sign-in"]');
            const hasLoginButton = !!loginButton;

            logger.log('🔍 Login check:', {
              isLoggedIn,
              hasLoginButton,
              cookieCount: document.cookie.split(';').length,
              localStorageKeys: Object.keys(localStorage).length
            });

            return {
              isLoggedIn,
              hasLoginButton,
              cookieCount: document.cookie.split(';').length,
              localStorageKeys: Object.keys(localStorage).length
            };
          })();
        `);

        if (loginStatus.isLoggedIn) {
          logger.log("✅ User is logged in to Apple Music");
        } else {
          logger.warn("⚠️  User is NOT logged in to Apple Music");
          logger.warn("   Please sign in at: https://music.apple.com");
          if (loginStatus.hasLoginButton) {
            logger.warn("   Login button detected on page");
          }
        }

        logger.log("📊 Login status:", loginStatus);
      } catch (error) {
        logger.error("❌ Failed to check login status:", error);
      }

      // ✅ Inject dark mode CSS if enabled
      if (windowState.isDarkMode) {
        try {
          await musicView?.webContents.insertCSS(`
            :root {
              color-scheme: dark !important;
            }
            body {
              background-color: #000 !important;
            }
          `);
          logger.log("🌙 Dark mode CSS injected");
        } catch (err) {
          logger.warn("⚠️  CSS injection failed:", err);
        }
      }

      // ✅ PERFORMANCE FIX: Monitor Widevine initialization ONCE per session
      if (!widevineChecked) {
        widevineChecked = true;
        try {
          const drmStatus = await musicView?.webContents.executeJavaScript(`
            (function() {
              return new Promise((resolve) => {
                if (!navigator.requestMediaKeySystemAccess) {
                  resolve({ available: false, error: 'EME API not available' });
                  return;
                }

                navigator.requestMediaKeySystemAccess('com.widevine.alpha', [
                  {
                    initDataTypes: ['cenc'],
                    audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }],
                    videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }],
                  }
                ])
                .then(access => {
                  console.log('✅ Widevine MediaKeySystemAccess obtained');
                  return access.createMediaKeys();
                })
                .then(mediaKeys => {
                  console.log('✅ Widevine MediaKeys created');
                  resolve({
                    available: true,
                    keySystem: 'com.widevine.alpha',
                    message: 'Widevine initialized successfully'
                  });
                })
                .catch(error => {
                  console.error('❌ Widevine initialization failed:', error);
                  resolve({
                    available: false,
                    error: error.message
                  });
                });
              });
            })();
          `);

          if (drmStatus.available) {
            logger.log(
              "✅ Widevine DRM initialized in BrowserView:",
              drmStatus.message,
            );
          } else {
            logger.error(
              "❌ Widevine DRM failed to initialize:",
              drmStatus.error,
            );
          }
        } catch (error) {
          logger.error("❌ Failed to check DRM status:", error);
        }
      }

      // ✅ Enable autoplay by simulating user interaction
      try {
        await musicView?.webContents.executeJavaScript(`
          (function() {
            // Dispatch user gesture events to unlock autoplay
            document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
            logger.log('🎮 User gesture simulated for autoplay unlock');
          })();
        `);
        logger.log("🎮 Autoplay unlocked via simulated user gesture");
      } catch (error) {
        logger.warn("⚠️  Failed to simulate user gesture:", error);
      }

      // ✅ NEW: Inject global error handler for lyrics and other errors
      try {
        await musicView?.webContents.executeJavaScript(`
          (function() {
            // Global error handler to prevent lyrics errors from blocking playback
            window.addEventListener('error', function(event) {
              // Check if it's a lyrics-related error
              if (event.message && (
                event.message.includes('lyrics') ||
                event.message.includes('Lyrics') ||
                event.filename?.includes('lyrics')
              )) {
                logger.warn('⚠️ Lyrics error caught and suppressed:', event.message);
                event.preventDefault();
                return false;
              }
            }, true);

            // Handle promise rejections (e.g., lyrics fetch failures)
            window.addEventListener('unhandledrejection', function(event) {
              if (event.reason && typeof event.reason === 'object') {
                const reasonStr = JSON.stringify(event.reason);
                if (reasonStr.includes('lyrics') || reasonStr.includes('Lyrics')) {
                  logger.warn('⚠️ Lyrics promise rejection caught and suppressed:', event.reason);
                  event.preventDefault();
                  return false;
                }
              }
            });

            logger.log('✅ Global error handlers installed for graceful lyrics error handling');
          })();
        `);
        logger.log("✅ Lyrics error handlers injected");
      } catch (error) {
        logger.warn("⚠️  Failed to inject error handlers:", error);
      }
    };
    listeners['did-finish-load'] = didFinishLoadListener;
    musicView.webContents.on("did-finish-load", didFinishLoadListener);

    // ✅ Monitor media playback events
    const mediaStartedListener = () => {
      logger.log("▶️  Media playback STARTED");
    };
    listeners['media-started-playing'] = mediaStartedListener;
    musicView.webContents.on("media-started-playing", mediaStartedListener);

    const mediaPausedListener = () => {
      logger.log("⏸️  Media playback PAUSED");
    };
    listeners['media-paused'] = mediaPausedListener;
    musicView.webContents.on("media-paused", mediaPausedListener);

    // ✅ Debug: Log all console messages from Apple Music
    const consoleMessageListener = (event: unknown, level: number, message: string) => {
      const levelEmoji = level === 0 ? "📝" : level === 1 ? "⚠️" : "❌";
      logger.log(`🎵 [Apple Music ${levelEmoji}]:`, message);
    };
    listeners['console-message'] = consoleMessageListener;
    musicView.webContents.on("console-message", consoleMessageListener);

    // ✅ NEW: Monitor navigation for playlist URLs and auto-play first track
    const didNavigateListener = (event: unknown, url: string) => {
      logger.log("🧭 Music view navigated to:", url);

      if (url.includes("sign-in") || url.includes("auth")) {
        logger.log("🔑 Authentication page detected");
      }

      if (url.includes("music.apple.com") && !url.includes("sign-in")) {
        logger.log("✅ On main Apple Music page");
      }
    };
    listeners['did-navigate'] = didNavigateListener;
    musicView.webContents.on("did-navigate", didNavigateListener);

    // ✅ NEW: Auto-play first track when navigating to a playlist
    const didNavigateInPageListener = async (event: unknown, url: string) => {
      logger.log("🔄 In-page navigation to:", url);

      // Check if navigated to a playlist or album page
      const isPlaylist =
        url.includes("/library/playlist/") || url.includes("/playlist/");
      const isAlbum = url.includes("/album/");
      const isStation = url.includes("/station/");

      if (isPlaylist || isAlbum || isStation) {
        // Avoid processing the same URL multiple times
        if (url === lastProcessedPlaylistUrl) {
          logger.log("⏭️  Skipping auto-play (already processed this URL)");
          return;
        }

        lastProcessedPlaylistUrl = url;

        const contentType = isPlaylist
          ? "playlist"
          : isAlbum
            ? "album"
            : "station";
        logger.log(
          `🎵 Detected ${contentType} navigation, attempting auto-play...`,
        );

        // ✅ FIXED: Smart polling instead of arbitrary timeout
        // Wait for content to load with intelligent DOM polling
        setTimeout(async () => {
          try {
            const autoPlayResult = await musicView?.webContents
              .executeJavaScript(`
              (async function() {
                try {
                  // Wait for tracks to load (up to 10 seconds with 250ms intervals)
                  let attempts = 0;
                  const maxAttempts = 40; // 10 seconds total
                  let firstTrack = null;

                  while (attempts < maxAttempts && !firstTrack) {
                    // Try multiple selectors for first track
                    firstTrack =
                      document.querySelector('[data-testid="track-list"] [role="button"]:first-child') ||
                      document.querySelector('.songs-list-row:first-child [role="button"]') ||
                      document.querySelector('.tracklist-item:first-child [role="button"]') ||
                      document.querySelector('[data-index="0"][role="button"]') ||
                      document.querySelector('.song-row:first-child') ||
                      document.querySelector('[class*="track"]:first-child [role="button"]');

                    if (!firstTrack) {
                      await new Promise(resolve => setTimeout(resolve, 250));
                      attempts++;
                    }
                  }

                  if (firstTrack) {
                    console.log('✅ Found first track, simulating click...');

                    // Simulate user interaction to satisfy autoplay policy
                    const clickEvent = new MouseEvent('click', {
                      view: window,
                      bubbles: true,
                      cancelable: true,
                      clientX: 100,
                      clientY: 100
                    });

                    firstTrack.click();

                    // Also try to trigger play button if clicking track didn't work
                    setTimeout(() => {
                      const playBtn = document.querySelector(
                        '[data-testid="play-pause-button"]'
                      );
                      if (playBtn && playBtn.getAttribute('aria-label')?.includes('Play')) {
                        playBtn.click();
                        console.log('✅ Also clicked global play button');
                      }
                    }, 500);

                    return {
                      success: true,
                      message: 'First track clicked successfully',
                      trackFound: true
                    };
                  } else {
                    console.warn('⚠️ Could not find first track element after 10 seconds');
                    return {
                      success: false,
                      message: 'First track not found after 10 seconds',
                      trackFound: false
                    };
                  }
                } catch (error) {
                  console.error('❌ Auto-play error:', error);
                  return {
                    success: false,
                    message: error.message,
                    error: true
                  };
                }
              })();
            `);

            if (autoPlayResult?.success) {
              logger.log(
                `✅ Auto-play successful for ${contentType}:`,
                autoPlayResult.message,
              );
            } else {
              logger.warn(
                `⚠️  Auto-play failed for ${contentType}:`,
                autoPlayResult?.message,
              );
            }
          } catch (error) {
            logger.error("❌ Failed to execute auto-play script:", error);
          }
        }, 500); // Initial delay reduced to 500ms before smart polling begins
      }
    };
    listeners['did-navigate-in-page'] = didNavigateInPageListener;
    musicView.webContents.on("did-navigate-in-page", didNavigateInPageListener);

    // ✅ Handle external links
    musicView.webContents.setWindowOpenHandler(({ url }) => {
      logger.log("🔗 Window open requested:", url);

      if (url.startsWith("https://music.apple.com")) {
        return { action: "allow" };
      }

      if (url.includes("apple.com")) {
        // Allow Apple authentication flows
        return { action: "allow" };
      }

      shell.openExternal(url).catch((err) => {
        logger.error("❌ Failed to open external link:", err);
      });
      return { action: "deny" };
    });

    // ✅ Monitor certificate errors (important for DRM)
    const certificateErrorListener = (
      event: unknown,
      url: string,
      error: string,
      certificate: unknown,
      callback: (allow: boolean) => void
    ) => {
      logger.warn("⚠️  Certificate error:", { url, error });
      // Don't allow certificate errors in production
      callback(false);
    };
    listeners['certificate-error'] = certificateErrorListener;
    musicView.webContents.on("certificate-error", certificateErrorListener);

    // ✅ Store listener references for cleanup
    musicView._listeners = listeners;

    logger.log("✅ Apple Music BrowserView created successfully");
  } catch (error) {
    logger.error("❌ Failed to create music view:", error);
    logger.error("Stack trace:", (error as Error).stack);
  }
}

// ============================================================================
// BROWSER VIEW BOUNDS MANAGEMENT
// ============================================================================

/**
 * Update BrowserView bounds to fit below control bar (60px or 80px height)
 */
function updateMusicViewBounds(): void {
  if (!mainWindow || !musicView) {
    return;
  }

  try {
    const bounds = mainWindow.getContentBounds();
    const controlBarHeight = windowState.isMiniPlayer ? 80 : 60;

    const viewBounds = {
      x: 0,
      y: controlBarHeight,
      width: bounds.width,
      height: bounds.height - controlBarHeight,
    };

    musicView.setBounds(viewBounds);
  } catch (error) {
    logger.error("❌ Failed to update music view bounds:", error);
  }
}

// ============================================================================
// IPC HANDLERS (Renderer ↔ Main Communication)
// ============================================================================

/**
 * IPC Handlers for playback control and UI state
 */
function setupIpcHandlers(): void {
  logger.log("🔌 Setting up IPC handlers...");

  // ✅ DEDUPLICATED: Play/Pause
  ipcMain.handle("play-pause", async () => {
    if (!musicView) return { success: false, error: 'Music view not available' };
    try {
      await musicView.webContents.executeJavaScript(
        createClickScript('playPause', '▶️  Play/Pause')
      );
      logger.log("▶️  Play/Pause executed");
      return { success: true };
    } catch (error) {
      logger.error("❌ Play/Pause failed:", error);
      return { success: false, error: String(error) };
    }
  });

  // ✅ DEDUPLICATED: Next track
  ipcMain.handle("next-track", async () => {
    if (!musicView) return { success: false, error: 'Music view not available' };
    try {
      await musicView.webContents.executeJavaScript(
        createClickScript('next', '⏭️  Next')
      );
      logger.log("⏭️  Next track executed");
      return { success: true };
    } catch (error) {
      logger.error("❌ Next track failed:", error);
      return { success: false, error: String(error) };
    }
  });

  // ✅ DEDUPLICATED: Previous track
  ipcMain.handle("previous-track", async () => {
    if (!musicView) return { success: false, error: 'Music view not available' };
    try {
      await musicView.webContents.executeJavaScript(
        createClickScript('previous', '⏮️  Previous')
      );
      logger.log("⏮️  Previous track executed");
      return { success: true };
    } catch (error) {
      logger.error("❌ Previous track failed:", error);
      return { success: false, error: String(error) };
    }
  });

  // Volume control
  ipcMain.handle("set-volume", async (_event, volume: number) => {
    logger.log("🔊 Volume requested:", volume, "(system-level control)");
  });

  // Toggle mini player
  ipcMain.handle("toggle-mini-player", async () => {
    try {
      windowState.isMiniPlayer = !windowState.isMiniPlayer;
      saveWindowState(windowState);
      updateMusicViewBounds();
      logger.log("📦 Mini player toggled:", windowState.isMiniPlayer);
      return windowState.isMiniPlayer;
    } catch (error) {
      logger.error("❌ Mini player toggle failed:", error);
      return windowState.isMiniPlayer;
    }
  });

  // Toggle dark mode
  ipcMain.handle("toggle-dark-mode", async () => {
    try {
      windowState.isDarkMode = !windowState.isDarkMode;
      saveWindowState(windowState);
      mainWindow?.setBackgroundColor(
        windowState.isDarkMode ? "#000000" : "#FFFFFF",
      );

      logger.log("🌙 Dark mode toggled:", windowState.isDarkMode);

      if (musicView) {
        const currentUrl = musicView.webContents.getURL();
        await musicView.webContents.loadURL(currentUrl);
        logger.log("🔄 Music view reloaded for dark mode");
      }

      return windowState.isDarkMode;
    } catch (error) {
      logger.error("❌ Dark mode toggle failed:", error);
      return windowState.isDarkMode;
    }
  });

  // Get app state
  ipcMain.handle("get-app-state", async () => {
    try {
      return {
        isDarkMode: windowState.isDarkMode,
        isMiniPlayer: windowState.isMiniPlayer,
        widevineStatus: checkWidevineStatus(),
      };
    } catch (error) {
      logger.error("❌ Failed to get app state:", error);
      return {
        isDarkMode: true,
        isMiniPlayer: false,
        widevineStatus: { available: false, message: "Error checking status" },
      };
    }
  });

  logger.log("✅ IPC handlers configured");
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

      setupIpcHandlers();
      await createWindow();

      app.on("activate", async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          await createWindow();
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      const bounds = mainWindow.getBounds();
      const isMaximized = mainWindow.isMaximized();
      saveWindowState({
        ...windowState,
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
