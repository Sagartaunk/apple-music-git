/**
 * Region detection utility for Apple Music availability
 */

export interface RegionInfo {
  country: string;
  isSupported: boolean;
  appleMusicUrl: string;
  message: string;
}

/**
 * List of countries where Apple Music is available
 * Based on official Apple Music availability: https://support.apple.com/en-us/HT204411
 */
const SUPPORTED_REGIONS = [
  'US', 'GB', 'CA', 'AU', 'NZ', 'JP', 'DE', 'FR', 'IT', 'ES', 'NL', 'SE', 'NO',
  'DK', 'FI', 'BE', 'AT', 'CH', 'IE', 'PT', 'GR', 'PL', 'CZ', 'HU', 'RO', 'BG',
  'HR', 'SK', 'SI', 'EE', 'LV', 'LT', 'CY', 'MT', 'LU', 'IS', 'BR', 'MX', 'AR',
  'CL', 'CO', 'PE', 'IN', 'SG', 'MY', 'TH', 'PH', 'ID', 'VN', 'HK', 'TW', 'KR',
  'CN', 'ZA', 'AE', 'SA', 'IL', 'TR', 'RU', 'UA',
];

/**
 * Detect user's region using IP geolocation
 * Fallback to US if detection fails
 */
export async function detectRegion(): Promise<RegionInfo> {
  try {
    // Try to detect region using a free geolocation API
    // Using ipapi.co as it doesn't require API key for basic usage
    const response = await fetch('https://ipapi.co/json/', {
      method: 'GET',
      headers: {
        'User-Agent': 'AppleMusicElectron/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Region detection failed: ${response.status}`);
    }

    const data = await response.json();
    const country = data.country_code || 'US';
    const isSupported = SUPPORTED_REGIONS.includes(country);

    return {
      country,
      isSupported,
      appleMusicUrl: getAppleMusicUrl(country),
      message: isSupported
        ? `Apple Music is available in ${country}`
        : `Apple Music may not be available in ${country}. Using US region.`,
    };
  } catch (error) {
    // Fallback to US region if detection fails
    return {
      country: 'US',
      isSupported: true,
      appleMusicUrl: 'https://music.apple.com/us/',
      message: `Region detection failed. Using US region. Error: ${error}`,
    };
  }
}

/**
 * Get Apple Music URL for a specific region
 */
export function getAppleMusicUrl(countryCode: string): string {
  const normalizedCode = countryCode.toLowerCase();
  
  // For supported regions, use region-specific URL
  if (SUPPORTED_REGIONS.includes(countryCode.toUpperCase())) {
    return `https://music.apple.com/${normalizedCode}/`;
  }
  
  // Fallback to US region
  return 'https://music.apple.com/us/';
}

/**
 * Check if a region is supported
 */
export function isRegionSupported(countryCode: string): boolean {
  return SUPPORTED_REGIONS.includes(countryCode.toUpperCase());
}
