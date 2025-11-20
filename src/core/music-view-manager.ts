import { BrowserView, BrowserWindow, session, Session, shell } from "electron";
import { logger } from "../utils/logger";
import { detectRegion } from "../utils/region";
import { generateAutoPlayScript, AutoPlayResult } from "../utils/autoplay";
import { WindowState } from "../utils/persistence";

// Safari user agent for Apple Music compatibility
const SAFARI_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15";

// Extended BrowserView interface for listener management
interface ExtendedBrowserView extends BrowserView {
  _listeners?: Record<string, (...args: unknown[]) => void>;
}

// Extended WebContents for type safety
interface WebContentsWithListeners {
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

/**
 * MusicViewManager - Manages Apple Music BrowserView lifecycle
 */
export class MusicViewManager {
  private musicView: ExtendedBrowserView | null = null;
  private mainWindow: BrowserWindow | null = null;
  private windowState: WindowState;
  private lastProcessedPlaylistUrl: string = "";
  private widevineChecked: boolean = false;
  private cookieChangeListener: ((event: unknown, cookie: unknown, cause: unknown, removed: boolean) => void) | null = null;

  constructor(mainWindow: BrowserWindow, windowState: WindowState) {
    this.mainWindow = mainWindow;
    this.windowState = windowState;
  }

  /**
   * Get the music view instance
   */
  getMusicView(): BrowserView | null {
    return this.musicView;
  }

  /**
   * Create BrowserView for Apple Music web player
   */
  async createMusicView(): Promise<void> {
    if (!this.mainWindow) {
      logger.error("❌ Cannot create music view: mainWindow is null");
      return;
    }

    try {
      const ses: Session = session.fromPartition("persist:applemusic", {
        cache: true,
      });

      logger.log("🔧 Configuring session for Apple Music...");

      // Enable all media-related permissions for DRM playback
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
          `🔐 Permission request: ${permission} → ${allowed ? "✅ ALLOW" : "❌ DENY"}`
        );
        callback(allowed);
      });

      // Set user agent for Safari compatibility
      ses.setUserAgent(SAFARI_USER_AGENT);
      logger.log("🌐 Session user agent confirmed");

      // PERFORMANCE FIX: Only clear cache if --clear-cache flag is present
      if (process.argv.includes('--clear-cache')) {
        try {
          await ses.clearCache();
          logger.log("✅ Cache cleared (--clear-cache flag detected)");
        } catch (cacheError) {
          logger.warn("⚠️  Cache clear failed:", cacheError);
        }
      }

      // Configure cookies to persist login with proper cleanup
      this.cookieChangeListener = (event: unknown, cookie: unknown, cause: unknown, removed: boolean) => {
        if (!removed && typeof cookie === 'object' && cookie !== null && 'domain' in cookie && 'name' in cookie) {
          const cookieObj = cookie as { domain?: string; name: string };
          // Secure check: domain must end with .apple.com or be exactly apple.com
          if (cookieObj.domain?.endsWith('.apple.com') || cookieObj.domain === 'apple.com') {
            logger.log("🍪 Apple cookie updated:", cookieObj.name, "→", cause);
          }
        }
      };
      ses.cookies.on("changed", this.cookieChangeListener);

      this.musicView = new BrowserView({
        webPreferences: {
          partition: "persist:applemusic",
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false, // Required for Widevine CDM
          webSecurity: true,
          allowRunningInsecureContent: false,
          plugins: true, // Required for Widevine CDM
          session: ses,
          devTools: false, // Will be overridden by main window setting
          backgroundThrottling: false,
          enableWebSQL: false,
        },
      });

      this.mainWindow.setBrowserView(this.musicView);
      this.updateMusicViewBounds();

      // Detect user region and load appropriate Apple Music URL
      logger.log("🌍 Detecting user region...");
      const regionInfo = await detectRegion();
      logger.log(`🌍 Region detected: ${regionInfo.country} - ${regionInfo.message}`);
      const appleMusicUrl = regionInfo.appleMusicUrl;

      logger.log("🌐 Loading Apple Music URL:", appleMusicUrl);

      await this.musicView.webContents
        .loadURL(appleMusicUrl)
        .catch((error) => {
          logger.error("❌ Failed to load Apple Music:", error);
          throw error;
        });

      // Setup event listeners
      this.setupMusicViewEvents();

      logger.log("✅ Apple Music BrowserView created successfully");
    } catch (error) {
      logger.error("❌ Failed to create music view:", error);
      logger.error("Stack trace:", (error as Error).stack);
    }
  }

  /**
   * Setup all event listeners for the music view
   */
  private setupMusicViewEvents(): void {
    if (!this.musicView) return;

    const listeners: Record<string, (...args: unknown[]) => void> = {};

    // Page finished loading
    const didFinishLoadListener = async () => {
      logger.log("✅ Apple Music page finished loading");
      await this.handlePageLoad();
    };
    listeners['did-finish-load'] = didFinishLoadListener;
    this.musicView.webContents.on("did-finish-load", didFinishLoadListener);

    // Media playback started
    const mediaStartedListener = () => {
      logger.log("▶️  Media playback STARTED");
    };
    listeners['media-started-playing'] = mediaStartedListener;
    this.musicView.webContents.on("media-started-playing", mediaStartedListener);

    // Media playback paused
    const mediaPausedListener = () => {
      logger.log("⏸️  Media playback PAUSED");
    };
    listeners['media-paused'] = mediaPausedListener;
    this.musicView.webContents.on("media-paused", mediaPausedListener);

    // Console messages from Apple Music
    const consoleMessageListener = (event: unknown, level: number, message: string) => {
      const levelEmoji = level === 0 ? "📝" : level === 1 ? "⚠️" : "❌";
      logger.log(`🎵 [Apple Music ${levelEmoji}]:`, message);
    };
    listeners['console-message'] = consoleMessageListener;
    this.musicView.webContents.on("console-message", consoleMessageListener);

    // Main navigation
    const didNavigateListener = (event: unknown, url: string) => {
      logger.log("🧭 Music view navigated to:", url);

      try {
        const urlObj = new URL(url);
        // Secure check: verify hostname ends with apple.com
        if ((urlObj.hostname === 'music.apple.com' || urlObj.hostname.endsWith('.apple.com')) &&
            (url.includes("sign-in") || url.includes("auth"))) {
          logger.log("🔑 Authentication page detected");
        }

        if (urlObj.hostname === 'music.apple.com' && !url.includes("sign-in")) {
          logger.log("✅ On main Apple Music page");
        }
      } catch (error) {
        logger.warn("⚠️  Invalid URL in navigation:", url);
      }
    };
    listeners['did-navigate'] = didNavigateListener;
    this.musicView.webContents.on("did-navigate", didNavigateListener);

    // In-page navigation for auto-play
    const didNavigateInPageListener = async (event: unknown, url: string) => {
      logger.log("🔄 In-page navigation to:", url);
      await this.handleAutoPlay(url);
    };
    listeners['did-navigate-in-page'] = didNavigateInPageListener;
    this.musicView.webContents.on("did-navigate-in-page", didNavigateInPageListener);

    // Handle external links
    this.musicView.webContents.setWindowOpenHandler(({ url }) => {
      logger.log("🔗 Window open requested:", url);

      try {
        const urlObj = new URL(url);
        
        // Secure check: only allow specific Apple domains
        if (urlObj.protocol === 'https:' && 
            (urlObj.hostname === 'music.apple.com' || 
             urlObj.hostname.endsWith('.music.apple.com'))) {
          return { action: "allow" };
        }

        // Allow other Apple authentication domains
        if (urlObj.protocol === 'https:' &&
            (urlObj.hostname === 'appleid.apple.com' ||
             urlObj.hostname.endsWith('.appleid.apple.com') ||
             urlObj.hostname === 'apple.com' ||
             urlObj.hostname.endsWith('.apple.com'))) {
          return { action: "allow" };
        }

        // Open non-Apple URLs in external browser
        shell.openExternal(url).catch((err) => {
          logger.error("❌ Failed to open external link:", err);
        });
        return { action: "deny" };
      } catch (error) {
        logger.warn("⚠️  Invalid URL in window open:", url);
        return { action: "deny" };
      }
    });

    // Certificate error monitoring
    const certificateErrorListener = (
      event: unknown,
      url: string,
      error: string,
      certificate: unknown,
      callback: (allow: boolean) => void
    ) => {
      logger.warn("⚠️  Certificate error:", { url, error });
      callback(false);
    };
    listeners['certificate-error'] = certificateErrorListener;
    this.musicView.webContents.on("certificate-error", certificateErrorListener);

    // Store listener references for cleanup
    this.musicView._listeners = listeners;
  }

  /**
   * Handle page load - check login, inject CSS, initialize Widevine
   */
  private async handlePageLoad(): Promise<void> {
    if (!this.musicView) return;

    try {
      // Check login status
      const loginStatus = await this.musicView.webContents.executeJavaScript(`
        (function() {
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

    // Inject dark mode CSS if enabled
    if (this.windowState.isDarkMode) {
      try {
        await this.musicView.webContents.insertCSS(`
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

    // PERFORMANCE FIX: Check Widevine only once per session
    if (!this.widevineChecked) {
      this.widevineChecked = true;
      await this.checkWidevineInBrowser();
    }

    // Enable autoplay
    await this.enableAutoplay();

    // Inject error handlers for lyrics and other errors
    await this.injectErrorHandlers();
  }

  /**
   * Check Widevine DRM status in browser
   */
  private async checkWidevineInBrowser(): Promise<void> {
    if (!this.musicView) return;

    try {
      const drmStatus = await this.musicView.webContents.executeJavaScript(`
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
          drmStatus.message
        );
      } else {
        logger.error(
          "❌ Widevine DRM failed to initialize:",
          drmStatus.error
        );
      }
    } catch (error) {
      logger.error("❌ Failed to check DRM status:", error);
    }
  }

  /**
   * Enable autoplay by simulating user interaction
   */
  private async enableAutoplay(): Promise<void> {
    if (!this.musicView) return;

    try {
      await this.musicView.webContents.executeJavaScript(`
        (function() {
          document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
          console.log('🎮 User gesture simulated for autoplay unlock');
        })();
      `);
      logger.log("🎮 Autoplay unlocked via simulated user gesture");
    } catch (error) {
      logger.warn("⚠️  Failed to simulate user gesture:", error);
    }
  }

  /**
   * Inject global error handlers for lyrics and other errors
   */
  private async injectErrorHandlers(): Promise<void> {
    if (!this.musicView) return;

    try {
      await this.musicView.webContents.executeJavaScript(`
        (function() {
          window.addEventListener('error', function(event) {
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
      logger.log("✅ Lyrics error handlers injected");
    } catch (error) {
      logger.warn("⚠️  Failed to inject error handlers:", error);
    }
  }

  /**
   * Handle auto-play when navigating to playlists/albums
   */
  private async handleAutoPlay(url: string): Promise<void> {
    if (!this.musicView) return;

    const isPlaylist = url.includes("/library/playlist/") || url.includes("/playlist/");
    const isAlbum = url.includes("/album/");
    const isStation = url.includes("/station/");

    if (isPlaylist || isAlbum || isStation) {
      // Avoid processing the same URL multiple times
      if (url === this.lastProcessedPlaylistUrl) {
        logger.log("⏭️  Skipping auto-play (already processed this URL)");
        return;
      }

      this.lastProcessedPlaylistUrl = url;

      const contentType = isPlaylist ? "playlist" : isAlbum ? "album" : "station";
      logger.log(`🎵 Detected ${contentType} navigation, attempting auto-play...`);

      // Wait for content to render before attempting auto-play
      setTimeout(async () => {
        try {
          const autoPlayResult = await this.musicView?.webContents
            .executeJavaScript(generateAutoPlayScript()) as AutoPlayResult;

          if (autoPlayResult?.success) {
            logger.log(
              `✅ Auto-play successful for ${contentType}:`,
              autoPlayResult.message
            );
            if (autoPlayResult.selector) {
              logger.log(`   Using selector: ${autoPlayResult.selector}`);
            }
          } else {
            logger.warn(
              `⚠️  Auto-play failed for ${contentType}:`,
              autoPlayResult?.message
            );
            if (autoPlayResult?.diagnostics) {
              logger.log("   Diagnostics:", autoPlayResult.diagnostics);
            }
          }
        } catch (error) {
          logger.error("❌ Failed to execute auto-play script:", error);
        }
      }, 1500);
    }
  }

  /**
   * Update BrowserView bounds to fit below control bar
   */
  updateMusicViewBounds(): void {
    if (!this.mainWindow || !this.musicView) {
      return;
    }

    try {
      const bounds = this.mainWindow.getContentBounds();
      const controlBarHeight = this.windowState.isMiniPlayer ? 80 : 60;

      const viewBounds = {
        x: 0,
        y: controlBarHeight,
        width: bounds.width,
        height: bounds.height - controlBarHeight,
      };

      this.musicView.setBounds(viewBounds);
    } catch (error) {
      logger.error("❌ Failed to update music view bounds:", error);
    }
  }

  /**
   * Update window state reference (when toggling dark mode, mini player, etc.)
   */
  updateWindowState(windowState: WindowState): void {
    this.windowState = windowState;
  }

  /**
   * Reload music view (for dark mode changes)
   */
  async reloadMusicView(): Promise<void> {
    if (!this.musicView) return;

    const currentUrl = this.musicView.webContents.getURL();
    await this.musicView.webContents.loadURL(currentUrl);
    logger.log("🔄 Music view reloaded");
  }

  /**
   * Cleanup event listeners and resources
   */
  cleanup(): void {
    if (this.musicView && !this.musicView.webContents.isDestroyed()) {
      const listeners = this.musicView._listeners;
      if (listeners) {
        Object.keys(listeners).forEach((event) => {
          try {
            const listener = listeners[event];
            if (listener) {
              (this.musicView?.webContents as unknown as WebContentsWithListeners).removeListener(event, listener);
            }
          } catch (error) {
            logger.warn(`Failed to remove listener for ${event}:`, error);
          }
        });
        delete this.musicView._listeners;
      }
    }

    // Remove cookie listener
    if (this.cookieChangeListener) {
      try {
        const ses = session.fromPartition("persist:applemusic");
        ses.cookies.removeListener("changed", this.cookieChangeListener);
        this.cookieChangeListener = null;
      } catch (error) {
        logger.warn("Failed to remove cookie listener:", error);
      }
    }

    this.musicView = null;
  }
}
