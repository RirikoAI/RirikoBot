const BROWSERS: ReadonlyArray<[RegExp, string]> = [
  [/\bEdg(e|A|iOS)?\//, 'Edge'],
  [/\bOPR\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\bChrome\/|\bCriOS\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];

const SYSTEMS: ReadonlyArray<[RegExp, string]> = [
  [/\bWindows NT\b/, 'Windows'],
  [/\bAndroid\b/, 'Android'],
  [/\b(iPhone|iPad|iPod)\b/, 'iOS'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
];

/**
 * A short label such as "Chrome on Windows". It is built only from fixed names, so a crafted
 * user agent cannot inject text into pages or Discord messages.
 */
export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return 'Unknown browser';
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? (system ? `Browser on ${system}` : 'Unknown browser');
}
