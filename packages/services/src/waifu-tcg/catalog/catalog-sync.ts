import type { CatalogCharacter } from './card-catalog.js';
import type { AniListClient } from './anilist.client.js';
import type { DanbooruClient } from './danbooru.client.js';

export interface CatalogSyncClients {
  anilist: AniListClient;
  danbooru: DanbooruClient;
}

export interface CatalogSyncResult {
  character: CatalogCharacter;
  changed: boolean;
  warnings: string[];
}

/**
 * Fills missing external references for one character:
 * AniList id + favourites, Danbooru character tag, and the artwork URL (Danbooru first, AniList
 * portrait as fallback). With `force`, re-resolves the AniList data and artwork. An existing
 * `danbooruTag` is always kept so hand-set overrides survive; delete it to re-resolve.
 * MANUAL images are never replaced.
 * API failures become warnings so one bad lookup never aborts a whole sync.
 */
export async function syncCatalogCharacter(
  input: CatalogCharacter,
  clients: CatalogSyncClients,
  options: { force?: boolean } = {},
): Promise<CatalogSyncResult> {
  const force = Boolean(options.force);
  const character: CatalogCharacter = { ...input };
  const warnings: string[] = [];
  const manualImage = character.image?.source === 'MANUAL';
  let anilistImage: string | null = null;
  // AniList's romanization ("Ryuuko Matoi") and romaji titles ("Sousou no Frieren") often match
  // Danbooru tags better than the catalog's spelling.
  const names = [character.name];
  const titles = [character.anime];

  const needImage = !manualImage && (force || !character.image);

  if (force || character.anilistId === undefined || needImage) {
    try {
      const found = await clients.anilist.findCharacter(character.name, character.anime);
      if (found) {
        character.anilistId = found.id;
        character.favourites = found.favourites;
        anilistImage = found.imageUrl;
        names.push(found.name);
        titles.push(...found.mediaTitles);
      } else {
        warnings.push('AniList: no match');
      }
    } catch (err) {
      warnings.push(`AniList: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (needImage && !character.danbooruTag) {
    try {
      const tag = await clients.danbooru.resolveCharacterTag(names, titles);
      if (tag) character.danbooruTag = tag;
      else warnings.push('Danbooru: no character tag');
    } catch (err) {
      warnings.push(`Danbooru tag: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (needImage) {
    let art = null;
    if (character.danbooruTag) {
      try {
        art = await clients.danbooru.findPortrait(character.danbooruTag);
        if (!art) warnings.push(`Danbooru: no usable art for ${character.danbooruTag}`);
      } catch (err) {
        warnings.push(`Danbooru art: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (art) {
      character.image = {
        url: art.imageUrl,
        source: 'DANBOORU',
        sourceId: String(art.postId),
        credit: `Art: ${art.artist ?? 'unknown'} · danbooru #${art.postId}`,
      };
    } else if (anilistImage && character.anilistId !== undefined) {
      character.image = {
        url: anilistImage,
        source: 'ANILIST',
        sourceId: String(character.anilistId),
        credit: 'Image: AniList',
      };
    }
  }

  const changed = JSON.stringify(character) !== JSON.stringify(input);
  return { character, changed, warnings };
}
