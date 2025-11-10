import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

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
      if (fs.existsSync(widevinePath)) {
        console.log('✓ Widevine CDM found at:', widevinePath);
        return widevinePath;
      }
    } catch (error) {
      // Continue searching
    }
  }

  // Fallback to Chromium default (will fail gracefully if not found)
  const fallbackPath = '/usr/lib/chromium/libwidevinecdm.so';
  console.warn('⚠ Widevine CDM not found. Playback may fail.');
  console.warn('Install Widevine: sudo pacman -S chromium-widevine (AUR on Arch)');
  return fallbackPath;
}

/**
 * Check if Widevine is properly installed
 */
export function checkWidevineStatus(): WidevineStatus {
  const widevinePath = setupWidevine();

  if (fs.existsSync(widevinePath)) {
    try {
      fs.statSync(widevinePath);
      return {
        available: true,
        path: widevinePath,
        message: 'Widevine CDM loaded successfully',
      };
    } catch (error) {
      return {
        available: false,
        path: widevinePath,
        message: `Widevine file found but not accessible: ${error}`,
      };
    }
  }

  return {
    available: false,
    message: `Widevine CDM not found. Install with: sudo pacman -S chromium-widevine (AUR)`,
  };
}