// Type declaration for electronAPI
interface ElectronAPI {
  playPause: () => Promise<void>;
  nextTrack: () => Promise<void>;
  previousTrack: () => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  toggleMiniPlayer: () => Promise<boolean>;
  toggleDarkMode: () => Promise<boolean>;
  getAppState: () => Promise<{
    isDarkMode: boolean;
    isMiniPlayer: boolean;
    widevineStatus: { available: boolean; message: string };
  }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

/**
 * Renderer process controller for UI interactions
 */
class ControlsManager {
  private isPlaying = false;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    // Load initial app state
    await this.loadAppState();

    // Setup event listeners
    this.setupEventListeners();
  }

  private async loadAppState(): Promise<void> {
    try {
      const state = await window.electronAPI.getAppState();

      // Apply dark mode
      if (state.isDarkMode) {
        document.body.classList.add('dark-mode');
        this.updateDarkModeIcon(true);
      } else {
        document.body.classList.remove('dark-mode');
        this.updateDarkModeIcon(false);
      }

      // Apply mini player mode
      if (state.isMiniPlayer) {
        document.body.classList.add('mini-player');
      }

      // Update Widevine status indicator
      this.updateWidevineStatus(state.widevineStatus.available);
    } catch (error) {
      console.error('Failed to load app state:', error);
    }
  }

  private setupEventListeners(): void {
    // Play/Pause button
    const playPauseBtn = document.getElementById('play-pause-btn');
    playPauseBtn?.addEventListener('click', () => this.handlePlayPause());

    // Next track button
    const nextBtn = document.getElementById('next-btn');
    nextBtn?.addEventListener('click', () => this.handleNextTrack());

    // Previous track button
    const prevBtn = document.getElementById('prev-btn');
    prevBtn?.addEventListener('click', () => this.handlePreviousTrack());

    // Volume slider
    const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
    volumeSlider?.addEventListener('input', (e) => {
      const volume = parseInt((e.target as HTMLInputElement).value, 10);
      this.handleVolumeChange(volume);
    });

    // Mini player toggle
    const miniPlayerBtn = document.getElementById('mini-player-btn');
    miniPlayerBtn?.addEventListener('click', () => this.handleMiniPlayerToggle());

    // Dark mode toggle
    const darkModeBtn = document.getElementById('dark-mode-btn');
    darkModeBtn?.addEventListener('click', () => this.handleDarkModeToggle());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
  }

  private async handlePlayPause(): Promise<void> {
    try {
      await window.electronAPI.playPause();
      this.isPlaying = !this.isPlaying;
      this.updatePlayPauseIcon();
    } catch (error) {
      console.error('Play/Pause failed:', error);
    }
  }

  private async handleNextTrack(): Promise<void> {
    try {
      await window.electronAPI.nextTrack();
      this.isPlaying = true;
      this.updatePlayPauseIcon();
    } catch (error) {
      console.error('Next track failed:', error);
    }
  }

  private async handlePreviousTrack(): Promise<void> {
    try {
      await window.electronAPI.previousTrack();
      this.isPlaying = true;
      this.updatePlayPauseIcon();
    } catch (error) {
      console.error('Previous track failed:', error);
    }
  }

  private async handleVolumeChange(volume: number): Promise<void> {
    try {
      await window.electronAPI.setVolume(volume);
    } catch (error) {
      console.error('Volume change failed:', error);
    }
  }

  private async handleMiniPlayerToggle(): Promise<void> {
    try {
      const isMiniPlayer = await window.electronAPI.toggleMiniPlayer();
      if (isMiniPlayer) {
        document.body.classList.add('mini-player');
      } else {
        document.body.classList.remove('mini-player');
      }
    } catch (error) {
      console.error('Mini player toggle failed:', error);
    }
  }

  private async handleDarkModeToggle(): Promise<void> {
    try {
      const isDarkMode = await window.electronAPI.toggleDarkMode();
      if (isDarkMode) {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
      this.updateDarkModeIcon(isDarkMode);
    } catch (error) {
      console.error('Dark mode toggle failed:', error);
    }
  }

  private handleKeyboardShortcuts(e: KeyboardEvent): void {
    // Space: Play/Pause
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      this.handlePlayPause();
    }

    // Arrow Right: Next track
    if (e.code === 'ArrowRight' && e.ctrlKey) {
      e.preventDefault();
      this.handleNextTrack();
    }

    // Arrow Left: Previous track
    if (e.code === 'ArrowLeft' && e.ctrlKey) {
      e.preventDefault();
      this.handlePreviousTrack();
    }

    // M: Toggle mini player
    if (e.code === 'KeyM' && e.ctrlKey) {
      e.preventDefault();
      this.handleMiniPlayerToggle();
    }

    // D: Toggle dark mode
    if (e.code === 'KeyD' && e.ctrlKey) {
      e.preventDefault();
      this.handleDarkModeToggle();
    }
  }

  private updatePlayPauseIcon(): void {
    const playIcon = document.getElementById('play-icon');
    const pauseIcon = document.getElementById('pause-icon');

    if (this.isPlaying) {
      playIcon?.setAttribute('style', 'display:none;');
      pauseIcon?.setAttribute('style', 'display:block;');
    } else {
      playIcon?.setAttribute('style', 'display:block;');
      pauseIcon?.setAttribute('style', 'display:none;');
    }
  }

  private updateDarkModeIcon(isDarkMode: boolean): void {
    const darkIcon = document.getElementById('dark-icon');
    const lightIcon = document.getElementById('light-icon');

    if (isDarkMode) {
      darkIcon?.setAttribute('style', 'display:block;');
      lightIcon?.setAttribute('style', 'display:none;');
    } else {
      darkIcon?.setAttribute('style', 'display:none;');
      lightIcon?.setAttribute('style', 'display:block;');
    }
  }

  private updateWidevineStatus(available: boolean): void {
    const statusDot = document.querySelector('.status-dot');
    const statusIndicator = document.getElementById('status-indicator');

    if (available) {
      statusDot?.classList.remove('error');
      statusIndicator?.setAttribute('title', 'Widevine CDM: Ready');
    } else {
      statusDot?.classList.add('error');
      statusIndicator?.setAttribute('title', 'Widevine CDM: Not Found');
    }
  }
}

// Initialize controls when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new ControlsManager());
} else {
  new ControlsManager();
}