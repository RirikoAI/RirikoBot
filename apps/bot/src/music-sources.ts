import { ExtractorPipeline, createStandardAdapters, type MusicSourceAdapter } from '@ririko/music';

/**
 * The private music package lives in a separate private repository that maintainers clone into
 * `packages/music-private` and build there. It is not a workspace package, so the public install,
 * build and tests never depend on it.
 */
const PRIVATE_MUSIC_PACKAGE_ENTRY = new URL(
  '../../../packages/music-private/dist/index.js',
  import.meta.url,
);

/** What the private package's entry point exports. */
export interface PrivateMusicPackage {
  createMusicAdapters(env: NodeJS.ProcessEnv): MusicSourceAdapter[];
}

export type PrivateMusicPackageLoader = () => Promise<Partial<PrivateMusicPackage>>;

const importPrivateMusicPackage: PrivateMusicPackageLoader = () =>
  import(PRIVATE_MUSIC_PACKAGE_ENTRY.href) as Promise<Partial<PrivateMusicPackage>>;

/**
 * Builds the in-process extractor pipeline the bot plays from when Lavalink is unavailable.
 * `USE_PRIVATE_MUSIC_PACKAGE=true` imports the private package and adds its adapters; otherwise
 * the package is never imported. Playback through Lavalink does not depend on this flag.
 */
export async function createMusicPipeline(
  env: NodeJS.ProcessEnv = process.env,
  loadPrivatePackage: PrivateMusicPackageLoader = importPrivateMusicPackage,
): Promise<ExtractorPipeline> {
  const adapters = createStandardAdapters();
  if (env.USE_PRIVATE_MUSIC_PACKAGE === 'true') {
    adapters.push(...(await loadPrivateAdapters(env, loadPrivatePackage)));
  }
  return new ExtractorPipeline({ adapters });
}

/** A missing or broken private package leaves the bot running with the standard adapters. */
async function loadPrivateAdapters(
  env: NodeJS.ProcessEnv,
  loadPrivatePackage: PrivateMusicPackageLoader,
): Promise<MusicSourceAdapter[]> {
  try {
    const privatePackage = await loadPrivatePackage();
    if (typeof privatePackage.createMusicAdapters !== 'function') {
      throw new Error('its entry point does not export createMusicAdapters()');
    }
    return privatePackage.createMusicAdapters(env);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `[music] USE_PRIVATE_MUSIC_PACKAGE is true, but the private music package could not be ` +
        `loaded (${reason}). Clone and build it in packages/music-private; continuing without it.`,
    );
    return [];
  }
}
