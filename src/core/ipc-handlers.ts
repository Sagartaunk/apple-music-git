import { ipcMain } from "electron";
import { logger } from "../utils/logger";
import { createClickScript } from "../utils/selectors";
import { checkWidevineStatus } from "../utils/widevine";
import { WindowManager } from "./window-manager";
import { MusicViewManager } from "./music-view-manager";

/**
 * IPC error response structure
 */
interface IPCResponse {
  success: boolean;
  error?: string;
}

/**
 * IPC Handlers Manager - Centralized IPC handler setup
 */
export class IPCHandlersManager {
  private windowManager: WindowManager;
  private musicViewManager: MusicViewManager;

  constructor(windowManager: WindowManager, musicViewManager: MusicViewManager) {
    this.windowManager = windowManager;
    this.musicViewManager = musicViewManager;
  }

  /**
   * Setup all IPC handlers for renderer communication
   */
  setupHandlers(): void {
    logger.log("🔌 Setting up IPC handlers...");

    // Play/Pause control
    ipcMain.handle("play-pause", async (): Promise<IPCResponse> => {
      const musicView = this.musicViewManager.getMusicView();
      if (!musicView) {
        return { success: false, error: 'Music view not available' };
      }
      try {
        await musicView.webContents.executeJavaScript(
          createClickScript('playPause', '▶️  Play/Pause')
        );
        logger.log("▶️  Play/Pause executed");
        return { success: true };
      } catch (error) {
        logger.error("❌ Play/Pause failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });

    // Next track control
    ipcMain.handle("next-track", async (): Promise<IPCResponse> => {
      const musicView = this.musicViewManager.getMusicView();
      if (!musicView) {
        return { success: false, error: 'Music view not available' };
      }
      try {
        await musicView.webContents.executeJavaScript(
          createClickScript('next', '⏭️  Next')
        );
        logger.log("⏭️  Next track executed");
        return { success: true };
      } catch (error) {
        logger.error("❌ Next track failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });

    // Previous track control
    ipcMain.handle("previous-track", async (): Promise<IPCResponse> => {
      const musicView = this.musicViewManager.getMusicView();
      if (!musicView) {
        return { success: false, error: 'Music view not available' };
      }
      try {
        await musicView.webContents.executeJavaScript(
          createClickScript('previous', '⏮️  Previous')
        );
        logger.log("⏮️  Previous track executed");
        return { success: true };
      } catch (error) {
        logger.error("❌ Previous track failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });

    // Volume control (system-level)
    ipcMain.handle("set-volume", async (_event, volume: number): Promise<IPCResponse> => {
      logger.log("🔊 Volume requested:", volume, "(system-level control)");
      return { success: true };
    });

    // Toggle mini player
    ipcMain.handle("toggle-mini-player", async (): Promise<boolean> => {
      try {
        const windowState = this.windowManager.getWindowState();
        const newMiniPlayerState = !windowState.isMiniPlayer;
        
        this.windowManager.updateWindowState({ isMiniPlayer: newMiniPlayerState });
        this.musicViewManager.updateWindowState({
          ...windowState,
          isMiniPlayer: newMiniPlayerState
        });
        this.musicViewManager.updateMusicViewBounds();
        
        logger.log("📦 Mini player toggled:", newMiniPlayerState);
        return newMiniPlayerState;
      } catch (error) {
        logger.error("❌ Mini player toggle failed:", error);
        return this.windowManager.getWindowState().isMiniPlayer;
      }
    });

    // Toggle dark mode
    ipcMain.handle("toggle-dark-mode", async (): Promise<boolean> => {
      try {
        const windowState = this.windowManager.getWindowState();
        const newDarkModeState = !windowState.isDarkMode;
        
        this.windowManager.updateWindowState({ isDarkMode: newDarkModeState });
        this.windowManager.setBackgroundColor(
          newDarkModeState ? "#000000" : "#FFFFFF"
        );
        this.musicViewManager.updateWindowState({
          ...windowState,
          isDarkMode: newDarkModeState
        });

        logger.log("🌙 Dark mode toggled:", newDarkModeState);

        await this.musicViewManager.reloadMusicView();

        return newDarkModeState;
      } catch (error) {
        logger.error("❌ Dark mode toggle failed:", error);
        return this.windowManager.getWindowState().isDarkMode;
      }
    });

    // Get app state
    ipcMain.handle("get-app-state", async () => {
      try {
        const windowState = this.windowManager.getWindowState();
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

  /**
   * Remove all IPC handlers (cleanup)
   */
  removeHandlers(): void {
    ipcMain.removeHandler("play-pause");
    ipcMain.removeHandler("next-track");
    ipcMain.removeHandler("previous-track");
    ipcMain.removeHandler("set-volume");
    ipcMain.removeHandler("toggle-mini-player");
    ipcMain.removeHandler("toggle-dark-mode");
    ipcMain.removeHandler("get-app-state");
    logger.log("🔌 IPC handlers removed");
  }
}
