/**
 * Shared Apple Music DOM selectors
 * Consolidated to avoid duplication across IPC handlers
 */

export const APPLE_MUSIC_SELECTORS = {
  playPause: [
    '[data-testid="play-pause-button"]',
    '.playback-controls__playback-btn',
    'button[aria-label*="play"]',
    'button[aria-label*="pause"]',
    'button[title*="Play"]',
    'button[title*="Pause"]',
  ].join(', '),

  next: [
    '[data-testid="next-button"]',
    '.playback-controls__next-btn',
    'button[aria-label*="next"]',
    'button[title*="Next"]',
  ].join(', '),

  previous: [
    '[data-testid="previous-button"]',
    '.playback-controls__previous-btn',
    'button[aria-label*="previous"]',
    'button[title*="Previous"]',
  ].join(', '),

  firstTrack: [
    '[data-testid="track-list"] [role="button"]:first-child',
    '.songs-list-row:first-child [role="button"]',
    '.tracklist-item:first-child [role="button"]',
    '[data-index="0"][role="button"]',
    '.song-row:first-child',
    '[class*="track"]:first-child [role="button"]',
  ].join(', '),
};

/**
 * Generate JavaScript code to click an element by selector
 * Properly escapes both single quotes and backslashes for security
 */
export function createClickScript(selectorKey: keyof typeof APPLE_MUSIC_SELECTORS, actionName: string): string {
  const selector = APPLE_MUSIC_SELECTORS[selectorKey];
  // Escape backslashes first, then single quotes
  const escapedSelector = selector.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const escapedActionName = actionName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  
  return `
    (function() {
      const element = document.querySelector('${escapedSelector}');
      if (element) {
        element.click();
        console.log('${escapedActionName} clicked');
      } else {
        console.warn('${escapedActionName} button not found');
      }
    })();
  `;
}
