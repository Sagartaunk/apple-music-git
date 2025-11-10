/**
 * Apple Music Auto-Play Utility
 * Handles automatic playback when navigating to playlists, albums, or stations
 * Updated for 2025 Apple Music DOM structure
 */

/**
 * Modern DOM selectors for Apple Music (2025)
 * These are prioritized by reliability and frequency of success
 */
export const MODERN_PLAY_SELECTORS = [
  // Primary play button for playlists/albums (most reliable)
  'button[data-testid="play-button"]',
  'button[aria-label*="Play"]',
  
  // First track in list - various structures
  '[data-testid="tracklist-row"]:first-child button[data-testid="preview-button"]',
  '[data-testid="tracklist-row"]:first-child button',
  'li.songs-list__row:first-child button',
  'div[role="row"]:first-child button[aria-label*="Play"]',
  
  // Legacy selectors (still needed for some pages)
  '[data-testid="track-list"] [role="button"]:first-child',
  '.songs-list-row:first-child [role="button"]',
  '.tracklist-item:first-child [role="button"]',
  '[data-index="0"][role="button"]',
  '.song-row:first-child',
  '[class*="track"]:first-child [role="button"]',
  
  // Large "Play" button on playlist/album page
  'button.product-lockup__play-button',
  'button[data-metrics-click*="play"]',
  
  // Fallback to any play button
  'button[class*="play-button"]',
  'button[class*="PlayButton"]',
  'button[class*="play-btn"]',
];

/**
 * Interface for auto-play result
 */
export interface AutoPlayResult {
  success: boolean;
  message: string;
  trackFound?: boolean;
  selector?: string;
  error?: boolean;
  diagnostics?: {
    url: string;
    readyState: string;
    title: string;
    totalButtons: number;
    playButtons: number;
    trackRows: number;
  };
}

/**
 * Inspect the DOM for debugging purposes
 * Returns diagnostic information about the page state
 */
export function inspectAppleMusicDOM(): Record<string, unknown> {
  const allButtons = document.querySelectorAll('button');
  const playButtons = document.querySelectorAll(
    'button[aria-label*="Play"], button[data-testid*="play"]'
  );
  const trackRows = document.querySelectorAll(
    '[data-testid="tracklist-row"], .songs-list__row, .tracklist-item, .song-row'
  );

  return {
    url: window.location.href,
    readyState: document.readyState,
    title: document.title,
    totalButtons: allButtons.length,
    playButtons: playButtons.length,
    trackRows: trackRows.length,
    sampleButtons: Array.from(allButtons)
      .slice(0, 10)
      .map((b) => ({
        tag: b.tagName,
        class: b.className,
        ariaLabel: b.getAttribute('aria-label'),
        testId: b.getAttribute('data-testid'),
        text: b.textContent?.trim().substring(0, 30),
      })),
  };
}

/**
 * Generate the JavaScript code to execute auto-play in the page context
 * This is injected into the Apple Music page via executeJavaScript
 * 
 * @returns JavaScript code as a string
 */
export function generateAutoPlayScript(): string {
  // Convert selectors array to a string representation
  const selectorsString = MODERN_PLAY_SELECTORS.map(s => `'${s}'`).join(',\n    ');
  
  return `
    (async function() {
      try {
        // Modern selectors for Apple Music (2025)
        const modernSelectors = [
          ${selectorsString}
        ];

        console.log('[AutoPlay] Starting auto-play attempt...');
        console.log('[AutoPlay] Document ready state:', document.readyState);

        // Wait for document to be fully loaded
        if (document.readyState !== 'complete') {
          await new Promise(resolve => {
            if (document.readyState === 'complete') {
              resolve(true);
            } else {
              window.addEventListener('load', () => resolve(true), { once: true });
              // Timeout after 5 seconds
              setTimeout(() => resolve(true), 5000);
            }
          });
          console.log('[AutoPlay] Document loaded');
        }

        // Smart polling with diagnostic logging
        let attempts = 0;
        const maxAttempts = 60; // 15 seconds total (250ms * 60)
        let playButton = null;
        let foundSelector = null;

        while (attempts < maxAttempts && !playButton) {
          if (attempts === 0) {
            console.log('[AutoPlay] Scanning for play button with', modernSelectors.length, 'selectors...');
          }

          // Try each selector
          for (const selector of modernSelectors) {
            const element = document.querySelector(selector);
            if (element) {
              playButton = element;
              foundSelector = selector;
              console.log(\`[AutoPlay] ✅ Found element with: \${selector}\`);
              console.log('[AutoPlay] Element HTML:', element.outerHTML.substring(0, 150));
              break;
            }
          }

          if (!playButton) {
            await new Promise(resolve => setTimeout(resolve, 250));
            attempts++;

            // Log progress every 2.5 seconds (10 attempts)
            if (attempts > 0 && attempts % 10 === 0) {
              console.log(\`[AutoPlay] Still waiting... (\${attempts * 250}ms elapsed)\`);
            }
          }
        }

        if (playButton && foundSelector) {
          console.log(\`[AutoPlay] ✅ Clicking play button (found after \${attempts * 250}ms)\`);
          
          // Strategy 1: Click the found element
          playButton.click();

          // Strategy 2: Also try main play button after 500ms (fallback)
          setTimeout(() => {
            const mainPlayButton = document.querySelector('[data-testid="play-pause-button"]');
            const ariaLabel = mainPlayButton?.getAttribute('aria-label');
            if (mainPlayButton && ariaLabel && ariaLabel.toLowerCase().includes('play')) {
              console.log('[AutoPlay] Also clicking main play/pause button as fallback');
              mainPlayButton.click();
            }
          }, 500);

          // Strategy 3: Trigger keyboard shortcut (space key) after 1000ms (last resort)
          setTimeout(() => {
            const event = new KeyboardEvent('keydown', {
              key: ' ',
              code: 'Space',
              keyCode: 32,
              which: 32,
              bubbles: true,
              cancelable: true
            });
            document.dispatchEvent(event);
            console.log('[AutoPlay] Triggered space key for play');
          }, 1000);

          return {
            success: true,
            message: \`Play button clicked successfully (found after \${attempts * 250}ms)\`,
            trackFound: true,
            selector: foundSelector
          };
        } else {
          // Auto-play failed - gather diagnostics
          console.warn('[AutoPlay] ⚠️ Could not find play button after', maxAttempts * 250, 'ms');
          
          const allButtons = document.querySelectorAll('button');
          const playButtons = document.querySelectorAll('button[aria-label*="Play"], button[data-testid*="play"]');
          const trackRows = document.querySelectorAll('[data-testid="tracklist-row"], .songs-list__row, .tracklist-item, .song-row');
          
          console.log('[AutoPlay] Diagnostics:');
          console.log('  - Total buttons on page:', allButtons.length);
          console.log('  - Play-related buttons:', playButtons.length);
          console.log('  - Track rows:', trackRows.length);
          console.log('  - First 5 buttons:', Array.from(allButtons).slice(0, 5).map(b => ({
            class: b.className,
            ariaLabel: b.getAttribute('aria-label'),
            testId: b.getAttribute('data-testid'),
            text: b.textContent?.trim().substring(0, 30)
          })));

          return {
            success: false,
            message: \`Play button not found after \${maxAttempts * 250}ms\`,
            trackFound: false,
            diagnostics: {
              url: window.location.href,
              readyState: document.readyState,
              title: document.title,
              totalButtons: allButtons.length,
              playButtons: playButtons.length,
              trackRows: trackRows.length
            }
          };
        }
      } catch (error) {
        console.error('[AutoPlay] ❌ Error:', error);
        return {
          success: false,
          message: error.message || 'Unknown error',
          error: true
        };
      }
    })();
  `;
}
