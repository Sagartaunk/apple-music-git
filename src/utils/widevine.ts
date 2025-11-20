import * as path from 'path';
import * as fs from 'fs';
import { app, dialog } from 'electron';

export interface WidevineStatus {
  available: boolean;
  path?: string;
  version?: string;
  message: string;
}

/**
 * Setup Widevine CDM for DRM playback
 * Searches common Linux installation paths
 */
export function setupWidevine(): string {
  const possiblePaths = [
    // System-wide Widevine installations
    '/usr/lib/chromium/libwidevinecdm.so',
    '/usr/lib64/chromium/libwidevinecdm.so',
    '/usr/lib/chromium-browser/libwidevinecdm.so',
    '/usr/lib/google-chrome/libwidevinecdm.so',
    '/opt/google/chrome/libwidevinecdm.so',
    '/usr/lib/opera/lib_extra/libwidevinecdm.so',
    
    // User-level installations
    path.join(app.getPath('home'), '.local/lib/chromium/libwidevinecdm.so'),
    
    // Electron bundled path (if manually placed)
    path.join(process.resourcesPath, 'widevine', 'libwidevinecdm.so'),
  ];

  for (const widevinePath of possiblePaths) {
    try {
      // Check both existence and accessibility
      fs.accessSync(widevinePath, fs.constants.R_OK);
      console.log('[App ✅] Widevine CDM found at:', widevinePath);
      return widevinePath;
    } catch (error) {
      // Continue searching
    }
  }

  // Fallback to Chromium default (will fail gracefully if not found)
  const fallbackPath = '/usr/lib/chromium/libwidevinecdm.so';
  console.warn('[App ⚠️ ] Widevine CDM not found. Playback may fail.');
  console.warn('[App ⚠️ ] Install Widevine: sudo pacman -S chromium-widevine (AUR on Arch)');
  return fallbackPath;
}

/**
 * Check if Widevine is properly installed
 */
export function checkWidevineStatus(): WidevineStatus {
  const widevinePath = setupWidevine();

  try {
    // Check if file exists and is accessible
    fs.accessSync(widevinePath, fs.constants.R_OK);
    const stats = fs.statSync(widevinePath);
    
    if (stats.isFile()) {
      return {
        available: true,
        path: widevinePath,
        message: 'Widevine CDM loaded successfully',
      };
    }
  } catch (error) {
    // File not found or not accessible
    const errorMessage = `Widevine CDM not found or not accessible`;
    
    // Show error dialog to user with installation instructions
    showWidevineErrorDialog();
    
    return {
      available: false,
      path: widevinePath,
      message: errorMessage,
    };
  }

  return {
    available: false,
    message: `Widevine CDM not found. Install with: sudo pacman -S chromium-widevine (AUR)`,
  };
}

/**
 * Show error dialog to user when Widevine is missing
 */
function showWidevineErrorDialog(): void {
  if (app.isReady()) {
    dialog.showMessageBox({
      type: 'warning',
      title: 'Widevine CDM Not Found',
      message: 'Widevine DRM component is required for Apple Music playback',
      detail: `To install Widevine on your system:

Arch Linux / Manjaro:
  yay -S chromium-widevine

Ubuntu / Debian:
  sudo apt install chromium-codecs-ffmpeg-extra

Fedora:
  sudo dnf install chromium-libs-media-freeworld

After installation, restart the application.`,
      buttons: ['OK'],
    }).catch((error) => {
      console.error('[App ❌] Failed to show Widevine error dialog:', error);
    });
  }
}