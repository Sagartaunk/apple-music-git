import { contextBridge, ipcRenderer } from 'electron';

/**
 * Secure API exposed to renderer process
 * Uses contextBridge for safe communication
 * ✅ ADDED: Error handling for all IPC calls
 */
const api = {
  // Playback controls
  playPause: async () => {
    try {
      return await ipcRenderer.invoke('play-pause');
    } catch (error) {
      console.error('IPC playPause failed:', error);
      return { success: false, error: String(error) };
    }
  },
  nextTrack: async () => {
    try {
      return await ipcRenderer.invoke('next-track');
    } catch (error) {
      console.error('IPC nextTrack failed:', error);
      return { success: false, error: String(error) };
    }
  },
  previousTrack: async () => {
    try {
      return await ipcRenderer.invoke('previous-track');
    } catch (error) {
      console.error('IPC previousTrack failed:', error);
      return { success: false, error: String(error) };
    }
  },
  setVolume: async (volume: number) => {
    try {
      return await ipcRenderer.invoke('set-volume', volume);
    } catch (error) {
      console.error('IPC setVolume failed:', error);
      return { success: false, error: String(error) };
    }
  },

  // UI controls
  toggleMiniPlayer: async () => {
    try {
      return await ipcRenderer.invoke('toggle-mini-player');
    } catch (error) {
      console.error('IPC toggleMiniPlayer failed:', error);
      return false;
    }
  },
  toggleDarkMode: async () => {
    try {
      return await ipcRenderer.invoke('toggle-dark-mode');
    } catch (error) {
      console.error('IPC toggleDarkMode failed:', error);
      return false;
    }
  },

  // App state
  getAppState: async () => {
    try {
      return await ipcRenderer.invoke('get-app-state');
    } catch (error) {
      console.error('IPC getAppState failed:', error);
      return {
        isDarkMode: true,
        isMiniPlayer: false,
        widevineStatus: { available: false, message: 'Error' }
      };
    }
  },
};

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', api);

// TypeScript declaration for window.electronAPI
export type ElectronAPI = typeof api;