import { contextBridge, ipcRenderer } from 'electron';

/**
 * Secure API exposed to renderer process
 * Uses contextBridge for safe communication
 */
const api = {
  // Playback controls
  playPause: () => ipcRenderer.invoke('play-pause'),
  nextTrack: () => ipcRenderer.invoke('next-track'),
  previousTrack: () => ipcRenderer.invoke('previous-track'),
  setVolume: (volume: number) => ipcRenderer.invoke('set-volume', volume),

  // UI controls
  toggleMiniPlayer: () => ipcRenderer.invoke('toggle-mini-player'),
  toggleDarkMode: () => ipcRenderer.invoke('toggle-dark-mode'),

  // App state
  getAppState: () => ipcRenderer.invoke('get-app-state'),
};

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', api);

// TypeScript declaration for window.electronAPI
export type ElectronAPI = typeof api;