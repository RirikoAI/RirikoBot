import type { WaifuAsset, WaifuSource } from './types.js';
import { getCardAttribution, type CardAttribution } from './attribution.js';

export const SILHOUETTE_FALLBACK_URL = '/assets/waifu-cards/silhouette-placeholder.png';

export interface ResolvedCardAssetDisplay {
  imageUrl: string;
  isSilhouette: boolean;
  characterName: string;
  animeTitle: string;
  attribution: CardAttribution;
}

/**
 * Resolves the display asset for a waifu card.
 * If the image asset has been deleted by creator request (Section 2.2),
 * it gracefully falls back to the standardized silhouette card frame while
 * strictly preserving character name, anime title, stats, and player ownership.
 */
export function resolveCardAssetDisplay(
  asset: WaifuAsset,
  source?: WaifuSource | null,
): ResolvedCardAssetDisplay {
  const attribution = getCardAttribution(source);

  if (asset.isDeletedByRequest) {
    return {
      imageUrl: SILHOUETTE_FALLBACK_URL,
      isSilhouette: true,
      characterName: asset.characterName,
      animeTitle: asset.animeTitle,
      attribution,
    };
  }

  return {
    imageUrl: asset.discordCdnUrl || asset.localStoragePath || SILHOUETTE_FALLBACK_URL,
    isSilhouette: false,
    characterName: asset.characterName,
    animeTitle: asset.animeTitle,
    attribution,
  };
}
