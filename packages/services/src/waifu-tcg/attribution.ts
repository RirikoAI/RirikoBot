import type { WaifuSource } from './types.js';

export const DEFAULT_ATTRIBUTION_TEXT = 'Image source: waifu.im';
export const DEFAULT_SOURCE_NAME = 'waifu.im';
export const DEFAULT_SOURCE_URL = 'https://api.waifu.im';

export interface CardAttribution {
  footerText: string;
  sourceName: string;
  sourceUrl: string;
}

/**
 * Generates card attribution in strict compliance with Section 24 of BLUEPRINT.md.
 * Footer MUST display: 'Image source: waifu.im' (or configured source attribution).
 */
export function getCardAttribution(source?: WaifuSource | null): CardAttribution {
  return {
    footerText: source?.attributionText || DEFAULT_ATTRIBUTION_TEXT,
    sourceName: source?.name || DEFAULT_SOURCE_NAME,
    sourceUrl: source?.baseUrl || DEFAULT_SOURCE_URL,
  };
}

/**
 * Formats a Discord embed footer object adhering to Section 24 attribution rules.
 */
export function formatCardEmbedFooter(
  source?: WaifuSource | null,
  extraSuffix?: string,
): { text: string; iconURL?: string } {
  const attribution = getCardAttribution(source);
  const text = extraSuffix ? `${attribution.footerText} • ${extraSuffix}` : attribution.footerText;
  return { text };
}
