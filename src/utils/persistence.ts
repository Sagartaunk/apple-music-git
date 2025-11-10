import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
  isDarkMode: boolean;
  isMiniPlayer: boolean;
}

const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');

const DEFAULT_STATE: WindowState = {
  width: 1200,
  height: 800,
  isMaximized: false,
  isDarkMode: true,
  isMiniPlayer: false,
};

/**
 * Load persisted window state from disk
 */
export function loadWindowState(): WindowState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      const state = JSON.parse(data) as WindowState;
      
      // Validate state values
      return {
        width: Math.max(state.width || DEFAULT_STATE.width, 800),
        height: Math.max(state.height || DEFAULT_STATE.height, 600),
        x: state.x,
        y: state.y,
        isMaximized: state.isMaximized || false,
        isDarkMode: state.isDarkMode ?? true,
        isMiniPlayer: state.isMiniPlayer || false,
      };
    }
  } catch (error) {
    console.error('Failed to load window state:', error);
  }

  return DEFAULT_STATE;
}

/**
 * Save window state to disk
 */
export function saveWindowState(state: WindowState): void {
  try {
    const userDataPath = app.getPath('userData');
    
    // Ensure directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save window state:', error);
  }
}