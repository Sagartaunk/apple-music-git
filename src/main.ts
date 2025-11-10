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

// Declare main_window for webpack entry point
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

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

console.log("🔐 Widevine configured at:", widevinePath);

// Disable hardware media keys (prevents conflicts with system media controls)
app.commandLine.appendSwitch("disable-features", "HardwareMediaKeyHandling");

// ============================================================================
// GLOBAL STATE
// ============================================================================

let mainWindow: BrowserWindow | null = null;
let musicView: BrowserView | null = null;
let windowState: WindowState;
let lastProcessedPlaylistUrl: string = ""; // Track processed playlists to avoid duplicate triggers

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
    console.log("📊 Loading window state:", {
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

    console.log("📐 Creating window with bounds:", { x, y, width, height });
    console.log("🖥️  Primary display:", { screenWidth, screenHeight });

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
    console.log("✅ Window created with actual bounds:", actualBounds);
    console.log("👁️  Window visible:", mainWindow.isVisible());
    console.log("🎯 Window focused:", mainWindow.isFocused());

    // Force focus and show (Linux compatibility)
    mainWindow.show();
    mainWindow.focus();
    console.log("👁️  Window explicitly shown and focused");

    // Load the control UI
    console.log("📄 Loading control UI from:", MAIN_WINDOW_WEBPACK_ENTRY);
    await mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY).catch((error) => {
      console.error("❌ Failed to load control UI:", error);
      throw error;
    });
    console.log("✅ Control UI loaded successfully");

    // Check Widevine status
    const widevineStatus = checkWidevineStatus();
    if (!widevineStatus.available) {
      console.error("⚠️  Widevine not available:", widevineStatus.message);
      console.error("   Install with: yay -S chromium-widevine (Arch AUR)");
    } else {
      console.log("✅ Widevine CDM loaded:", widevineStatus.path);
    }

    // Create BrowserView for Apple Music
    console.log("🎵 Creating Apple Music BrowserView...");
    await createMusicView();

    // Apply maximized state if needed (after showing window)
    if (windowState.isMaximized) {
      console.log("📏 Maximizing window...");
      mainWindow.maximize();
    }

    // 🔍 DEBUG: Final window state after all setup
    mainWindow.webContents.once("did-finish-load", () => {
      console.log("✅ Control UI finished loading");
      const finalBounds = mainWindow?.getBounds();
      console.log("📊 Final window bounds:", finalBounds);
      console.log("👁️  Window visible:", mainWindow?.isVisible());
      console.log("🎯 Window focused:", mainWindow?.isFocused());
      console.log("📍 Window minimized:", mainWindow?.isMinimized());
    });

    // Debug: Log renderer console messages
    if (!app.isPackaged) {
      mainWindow.webContents.on("console-message", (event, level, message) => {
        console.log(`🖥️  [Renderer]:`, message);
      });
    }

    // Debug: Log load failures
    mainWindow.webContents.on(
      "did-fail-load",
      (event, errorCode, errorDescription, validatedURL) => {
        console.error("❌ Control UI failed to load:", {
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
        console.log("💾 Saving window state on close:", {
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
      console.log("🚪 Window closed");
      mainWindow = null;
      musicView = null;
    });

    // Handle window resize
    mainWindow.on("resize", () => {
      updateMusicViewBounds();
    });

    mainWindow.on("maximize", () => {
      console.log("📏 Window maximized");
      updateMusicViewBounds();
    });

    mainWindow.on("unmaximize", () => {
      console.log("📏 Window unmaximized");
      updateMusicViewBounds();
    });

    // Linux-specific: Ensure window is raised to front
    if (process.platform === "linux") {
      console.log("🐧 Linux detected - ensuring window visibility");
      mainWindow.moveTop();
      mainWindow.setAlwaysOnTop(true);
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setAlwaysOnTop(false);
          console.log(
            "👁️  Window visibility forced (temporary always-on-top removed)",
          );
        }
      }, 500);
    }

    console.log("🎉 Window creation complete!");
  } catch (error) {
    console.error("❌ Failed to create main window:", error);
    console.error("Stack trace:", (error as Error).stack);
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
    console.error("❌ Cannot create music view: mainWindow is null");
    return;
  }

  try {
    const ses: Session = session.fromPartition("persist:applemusic", {
      cache: true,
    });

    console.log("🔧 Configuring session for Apple Music...");

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
      console.log(
        `🔐 Permission request: ${permission} → ${allowed ? "✅ ALLOW" : "❌ DENY"}`,
      );
      callback(allowed);
    });

    // ✅ Set user agent to match Safari (Apple Music works best with Safari UA)
    const userAgent =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15";
    ses.setUserAgent(userAgent);
    console.log("🌐 User agent set to Safari:", userAgent);

    // Clear cache on startup for fresh session
    try {
      await ses.clearCache();
      console.log("✅ Cache cleared for Apple Music session");
    } catch (cacheError) {
      console.warn("⚠️  Cache clear failed (non-critical):", cacheError);
    }

    // ✅ Configure cookies to persist login
    ses.cookies.on("changed", (event, cookie, cause, removed) => {
      if (!removed && cookie.domain?.includes("apple.com")) {
        console.log("🍪 Apple cookie updated:", cookie.name, "→", cause);
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

    console.log("🌐 Loading Apple Music URL: https://music.apple.com");

    // ✅ Inject playback initialization script BEFORE page loads
    await musicView.webContents.session.setPreloads([
      path.join(__dirname, "../preload-music.js"), // Optional: create if needed
    ]);

    // Load Apple Music
    await musicView.webContents
      .loadURL("https://music.apple.com")
      .catch((error) => {
        console.error("❌ Failed to load Apple Music:", error);
        throw error;
      });

    // ✅ Monitor playback state and login status
    musicView.webContents.on("did-finish-load", async () => {
      console.log("✅ Apple Music page finished loading");

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

            console.log('🔍 Login check:', {
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
          console.log("✅ User is logged in to Apple Music");
        } else {
          console.warn("⚠️  User is NOT logged in to Apple Music");
          console.warn("   Please sign in at: https://music.apple.com");
          if (loginStatus.hasLoginButton) {
            console.warn("   Login button detected on page");
          }
        }

        console.log("📊 Login status:", loginStatus);
      } catch (error) {
        console.error("❌ Failed to check login status:", error);
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
          console.log("🌙 Dark mode CSS injected");
        } catch (err) {
          console.warn("⚠️  CSS injection failed:", err);
        }
      }

      // ✅ Monitor Widevine initialization
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
          console.log(
            "✅ Widevine DRM initialized in BrowserView:",
            drmStatus.message,
          );
        } else {
          console.error(
            "❌ Widevine DRM failed to initialize:",
            drmStatus.error,
          );
        }
      } catch (error) {
        console.error("❌ Failed to check DRM status:", error);
      }

      // ✅ Enable autoplay by simulating user interaction
      try {
        await musicView?.webContents.executeJavaScript(`
          (function() {
            // Dispatch user gesture events to unlock autoplay
            document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
            console.log('🎮 User gesture simulated for autoplay unlock');
          })();
        `);
        console.log("🎮 Autoplay unlocked via simulated user gesture");
      } catch (error) {
        console.warn("⚠️  Failed to simulate user gesture:", error);
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
                console.warn('⚠️ Lyrics error caught and suppressed:', event.message);
                event.preventDefault();
                return false;
              }
            }, true);

            // Handle promise rejections (e.g., lyrics fetch failures)
            window.addEventListener('unhandledrejection', function(event) {
              if (event.reason && typeof event.reason === 'object') {
                const reasonStr = JSON.stringify(event.reason);
                if (reasonStr.includes('lyrics') || reasonStr.includes('Lyrics')) {
                  console.warn('⚠️ Lyrics promise rejection caught and suppressed:', event.reason);
                  event.preventDefault();
                  return false;
                }
              }
            });

            console.log('✅ Global error handlers installed for graceful lyrics error handling');
          })();
        `);
        console.log("✅ Lyrics error handlers injected");
      } catch (error) {
        console.warn("⚠️  Failed to inject error handlers:", error);
      }
    });

    // ✅ Monitor media playback events
    musicView.webContents.on("media-started-playing", () => {
      console.log("▶️  Media playback STARTED");
    });

    musicView.webContents.on("media-paused", () => {
      console.log("⏸️  Media playback PAUSED");
    });

    // ✅ Debug: Log all console messages from Apple Music
    musicView.webContents.on(
      "console-message",
      (event, level, message, line, sourceId) => {
        const levelEmoji = level === 0 ? "📝" : level === 1 ? "⚠️" : "❌";
        console.log(`🎵 [Apple Music ${levelEmoji}]:`, message);
      },
    );

    // ✅ NEW: Monitor navigation for playlist URLs and auto-play first track
    musicView.webContents.on("did-navigate", (event, url) => {
      console.log("🧭 Music view navigated to:", url);

      if (url.includes("sign-in") || url.includes("auth")) {
        console.log("🔑 Authentication page detected");
      }

      if (url.includes("music.apple.com") && !url.includes("sign-in")) {
        console.log("✅ On main Apple Music page");
      }
    });

    // ✅ NEW: Auto-play first track when navigating to a playlist
    musicView.webContents.on("did-navigate-in-page", async (event, url) => {
      console.log("🔄 In-page navigation to:", url);

      // Check if navigated to a playlist or album page
      const isPlaylist =
        url.includes("/library/playlist/") || url.includes("/playlist/");
      const isAlbum = url.includes("/album/");
      const isStation = url.includes("/station/");

      if (isPlaylist || isAlbum || isStation) {
        // Avoid processing the same URL multiple times
        if (url === lastProcessedPlaylistUrl) {
          console.log("⏭️  Skipping auto-play (already processed this URL)");
          return;
        }

        lastProcessedPlaylistUrl = url;

        const contentType = isPlaylist
          ? "playlist"
          : isAlbum
            ? "album"
            : "station";
        console.log(
          `🎵 Detected ${contentType} navigation, attempting auto-play...`,
        );

        // Wait for content to load before attempting auto-play
        setTimeout(async () => {
          try {
            const autoPlayResult = await musicView?.webContents
              .executeJavaScript(`
              (async function() {
                try {
                  // Wait for tracks to load (up to 5 seconds)
                  let attempts = 0;
                  let firstTrack = null;

                  while (attempts < 20 && !firstTrack) {
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
                    console.warn('⚠️ Could not find first track element after 5 seconds');
                    return {
                      success: false,
                      message: 'First track not found',
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
              console.log(
                `✅ Auto-play successful for ${contentType}:`,
                autoPlayResult.message,
              );
            } else {
              console.warn(
                `⚠️  Auto-play failed for ${contentType}:`,
                autoPlayResult?.message,
              );
            }
          } catch (error) {
            console.error("❌ Failed to execute auto-play script:", error);
          }
        }, 1500); // Wait 1.5 seconds for content to load
      }
    });

    // ✅ Handle external links
    musicView.webContents.setWindowOpenHandler(({ url }) => {
      console.log("🔗 Window open requested:", url);

      if (url.startsWith("https://music.apple.com")) {
        return { action: "allow" };
      }

      if (url.includes("apple.com")) {
        // Allow Apple authentication flows
        return { action: "allow" };
      }

      shell.openExternal(url).catch((err) => {
        console.error("❌ Failed to open external link:", err);
      });
      return { action: "deny" };
    });

    // ✅ Monitor certificate errors (important for DRM)
    musicView.webContents.on(
      "certificate-error",
      (event, url, error, certificate, callback) => {
        console.warn("⚠️  Certificate error:", { url, error });
        // Don't allow certificate errors in production
        callback(false);
      },
    );

    console.log("✅ Apple Music BrowserView created successfully");
  } catch (error) {
    console.error("❌ Failed to create music view:", error);
    console.error("Stack trace:", (error as Error).stack);
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
    console.error("❌ Failed to update music view bounds:", error);
  }
}

// ============================================================================
// IPC HANDLERS (Renderer ↔ Main Communication)
// ============================================================================

/**
 * IPC Handlers for playback control and UI state
 */
function setupIpcHandlers(): void {
  console.log("🔌 Setting up IPC handlers...");

  // Play/Pause
  ipcMain.handle("play-pause", async () => {
    if (!musicView) return;
    try {
      await musicView.webContents.executeJavaScript(`
        (function() {
          const playBtn = document.querySelector(
            '[data-testid="play-pause-button"], ' +
            '.playback-controls__playback-btn, ' +
            'button[aria-label*="play"], ' +
            'button[aria-label*="pause"], ' +
            'button[title*="Play"], ' +
            'button[title*="Pause"]'
          );
          if (playBtn) {
            playBtn.click();
            console.log('▶️  Play/Pause clicked');
          } else {
            console.warn('⚠️  Play/Pause button not found');
          }
        })();
      `);
      console.log("▶️  Play/Pause executed");
    } catch (error) {
      console.error("❌ Play/Pause failed:", error);
    }
  });

  // Next track
  ipcMain.handle("next-track", async () => {
    if (!musicView) return;
    try {
      await musicView.webContents.executeJavaScript(`
        (function() {
          const nextBtn = document.querySelector(
            '[data-testid="next-button"], ' +
            '.playback-controls__next-btn, ' +
            'button[aria-label*="next"], ' +
            'button[title*="Next"]'
          );
          if (nextBtn) {
            nextBtn.click();
            console.log('⏭️  Next clicked');
          } else {
            console.warn('⚠️  Next button not found');
          }
        })();
      `);
      console.log("⏭️  Next track executed");
    } catch (error) {
      console.error("❌ Next track failed:", error);
    }
  });

  // Previous track
  ipcMain.handle("previous-track", async () => {
    if (!musicView) return;
    try {
      await musicView.webContents.executeJavaScript(`
        (function() {
          const prevBtn = document.querySelector(
            '[data-testid="previous-button"], ' +
            '.playback-controls__previous-btn, ' +
            'button[aria-label*="previous"], ' +
            'button[title*="Previous"]'
          );
          if (prevBtn) {
            prevBtn.click();
            console.log('⏮️  Previous clicked');
          } else {
            console.warn('⚠️  Previous button not found');
          }
        })();
      `);
      console.log("⏮️  Previous track executed");
    } catch (error) {
      console.error("❌ Previous track failed:", error);
    }
  });

  // Volume control
  ipcMain.handle("set-volume", async (_event, volume: number) => {
    console.log("🔊 Volume requested:", volume, "(system-level control)");
  });

  // Toggle mini player
  ipcMain.handle("toggle-mini-player", async () => {
    try {
      windowState.isMiniPlayer = !windowState.isMiniPlayer;
      saveWindowState(windowState);
      updateMusicViewBounds();
      console.log("📦 Mini player toggled:", windowState.isMiniPlayer);
      return windowState.isMiniPlayer;
    } catch (error) {
      console.error("❌ Mini player toggle failed:", error);
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

      console.log("🌙 Dark mode toggled:", windowState.isDarkMode);

      if (musicView) {
        const currentUrl = musicView.webContents.getURL();
        await musicView.webContents.loadURL(currentUrl);
        console.log("🔄 Music view reloaded for dark mode");
      }

      return windowState.isDarkMode;
    } catch (error) {
      console.error("❌ Dark mode toggle failed:", error);
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
      console.error("❌ Failed to get app state:", error);
      return {
        isDarkMode: true,
        isMiniPlayer: false,
        widevineStatus: { available: false, message: "Error checking status" },
      };
    }
  });

  console.log("✅ IPC handlers configured");
}

// ============================================================================
// APP LIFECYCLE
// ============================================================================

app
  .whenReady()
  .then(async () => {
    try {
      console.log("🚀 Electron app ready");
      console.log("📍 Platform:", process.platform);
      console.log("📍 Electron version:", process.versions.electron);
      console.log("📍 Chrome version:", process.versions.chrome);
      console.log("📍 Node version:", process.versions.node);

      setupIpcHandlers();
      await createWindow();

      app.on("activate", async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          await createWindow();
        }
      });
    } catch (error) {
      console.error("❌ App initialization failed:", error);
      app.quit();
    }
  })
  .catch((error) => {
    console.error("❌ App ready event failed:", error);
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
    console.error("❌ Failed to save state on quit:", error);
  }
});

// ============================================================================
// GLOBAL ERROR HANDLERS
// ============================================================================

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
});

app.on("render-process-gone", (event, webContents, details) => {
  console.error("❌ Renderer process gone:", details);
});

console.log("✅ Main process initialized");
