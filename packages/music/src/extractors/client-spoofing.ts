export type YouTubeClientType = 'ANDROID' | 'IOS' | 'TV' | 'WEB';

export interface ClientProfile {
  clientName: string;
  clientVersion: string;
  userAgent: string;
  osName?: string | undefined;
  osVersion?: string | undefined;
  deviceModel?: string | undefined;
}

export const CLIENT_PROFILES: Record<YouTubeClientType, ClientProfile> = {
  ANDROID: {
    clientName: 'ANDROID',
    clientVersion: '19.44.38',
    userAgent:
      'com.google.android.youtube/19.44.38 (Linux; U; Android 14; en_US; Pixel 8 Pro Build/UQ1A.240205.004) gzip',
    osName: 'Android',
    osVersion: '14',
    deviceModel: 'Pixel 8 Pro',
  },
  IOS: {
    clientName: 'IOS',
    clientVersion: '19.45.4',
    userAgent:
      'com.google.ios.youtube/19.45.4 (iPhone15,2; U; CPU iOS 17_5_1 like Mac OS X; en_US)',
    osName: 'iOS',
    osVersion: '17.5.1',
    deviceModel: 'iPhone15,2',
  },
  TV: {
    clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
    clientVersion: '2.0',
    userAgent:
      'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/4.0 Chrome/76.0.3809.146 TV Safari/537.36',
    osName: 'Tizen',
    osVersion: '6.0',
  },
  WEB: {
    clientName: 'WEB',
    clientVersion: '2.20260315.01.00',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    osName: 'Windows',
    osVersion: '10.0',
  },
};

/**
 * Builds HTTP headers emulating a specific client profile.
 */
export function buildClientHeaders(
  clientType: YouTubeClientType,
  cookie?: string,
): Record<string, string> {
  const profile = CLIENT_PROFILES[clientType];
  const headers: Record<string, string> = {
    'User-Agent': profile.userAgent,
    'Accept-Language': 'en-US,en;q=0.9',
    'X-YouTube-Client-Name': profile.clientName === 'WEB' ? '1' : profile.clientName === 'IOS' ? '5' : '3',
    'X-YouTube-Client-Version': profile.clientVersion,
  };

  if (cookie) {
    headers['Cookie'] = cookie;
  }

  return headers;
}

/**
 * Rotates to the next fallback client type in sequence.
 */
export function getFallbackClient(current: YouTubeClientType): YouTubeClientType {
  switch (current) {
    case 'ANDROID':
      return 'IOS';
    case 'IOS':
      return 'TV';
    case 'TV':
      return 'WEB';
    case 'WEB':
      return 'ANDROID';
  }
}
