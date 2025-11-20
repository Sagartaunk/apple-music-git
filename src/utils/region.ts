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
 * Detect user's region using IP geolocation with fallback chain
 * Tries multiple services: ipapi.co → ip-api.com → ipinfo.io
 * Always returns valid region (defaults to US if all fail)
 */
export async function detectRegion(): Promise<RegionInfo> {
  // Service 1: ipapi.co (no API key required)
  try {
    const response = await fetch('https://ipapi.co/json/', {
      method: 'GET',
      headers: {
        'User-Agent': 'AppleMusicElectron/1.0',
      },
    });

    if (response.ok) {
      const data = await response.json();
      const country = data.country_code || 'US';
      const isSupported = SUPPORTED_REGIONS.includes(country);

      return {
        country,
        isSupported,
        appleMusicUrl: getAppleMusicUrl(country),
        message: isSupported
          ? `Apple Music is available in ${country} (via ipapi.co)`
          : `Apple Music may not be available in ${country}. Using US region.`,
      };
    }
  } catch (error) {
    console.warn('ipapi.co failed:', error);
  }

  // Service 2: ip-api.com (fallback)
  try {
    const response = await fetch('http://ip-api.com/json/', {
      method: 'GET',
      headers: {
        'User-Agent': 'AppleMusicElectron/1.0',
      },
    });

    if (response.ok) {
      const data = await response.json();
      const country = data.countryCode || 'US';
      const isSupported = SUPPORTED_REGIONS.includes(country);

      return {
        country,
        isSupported,
        appleMusicUrl: getAppleMusicUrl(country),
        message: isSupported
          ? `Apple Music is available in ${country} (via ip-api.com)`
          : `Apple Music may not be available in ${country}. Using US region.`,
      };
    }
  } catch (error) {
    console.warn('ip-api.com failed:', error);
  }

  // Service 3: ipinfo.io (last resort)
  try {
    const response = await fetch('https://ipinfo.io/json', {
      method: 'GET',
      headers: {
        'User-Agent': 'AppleMusicElectron/1.0',
      },
    });

    if (response.ok) {
      const data = await response.json();
      const country = data.country || 'US';
      const isSupported = SUPPORTED_REGIONS.includes(country);

      return {
        country,
        isSupported,
        appleMusicUrl: getAppleMusicUrl(country),
        message: isSupported
          ? `Apple Music is available in ${country} (via ipinfo.io)`
          : `Apple Music may not be available in ${country}. Using US region.`,
      };
    }
  } catch (error) {
    console.warn('ipinfo.io failed:', error);
  }

  // All services failed - use US as default
  return {
    country: 'US',
    isSupported: true,
    appleMusicUrl: 'https://music.apple.com/us/',
    message: 'All region detection services failed. Using US region as default.',
  };
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
