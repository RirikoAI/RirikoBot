import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  statSync,
  readdirSync,
  copyFileSync,
  unlinkSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';

const LAVALINK_DIR = resolve(process.cwd(), 'lavalink');
const PLUGINS_DIR = join(LAVALINK_DIR, 'plugins');
const JAR_PATH = join(LAVALINK_DIR, 'Lavalink.jar');
const YML_PATH = join(LAVALINK_DIR, 'application.yml');
const LAVALINK_VERSION = '4.2.2';
const LAVALINK_JAR_URL = `https://github.com/lavalink-devs/Lavalink/releases/download/${LAVALINK_VERSION}/Lavalink.jar`;

// Local verified recipe paths (read-only reference)
const LOCAL_REF_DIR = resolve(process.cwd(), '.local', 'how-to-setup-lavamusic', 'Lavalink');
const LOCAL_REF_JAR = join(LOCAL_REF_DIR, 'Lavalink.jar');
const LOCAL_REF_PLUGINS = join(LOCAL_REF_DIR, 'plugins');

export async function setupLavalink(): Promise<void> {
  console.log('🚀 [Ririko Lavalink Autoinstaller] Starting setup...');

  // 1. Check Java Environment
  try {
    const javaVersionOutput = execSync('java -version 2>&1', { encoding: 'utf8' });
    console.log(
      '✅ Java detected:\n' +
        javaVersionOutput
          .trim()
          .split('\n')
          .map((l) => `   ${l}`)
          .join('\n'),
    );
  } catch {
    console.error('❌ Java 17+ is required but not found in PATH! Please install OpenJDK 17 or 21.');
    process.exit(1);
  }

  // 2. Ensure lavalink/ and lavalink/plugins/ directories
  if (!existsSync(LAVALINK_DIR)) {
    mkdirSync(LAVALINK_DIR, { recursive: true });
    console.log(`📁 Created directory: ${LAVALINK_DIR}`);
  }
  if (!existsSync(PLUGINS_DIR)) {
    mkdirSync(PLUGINS_DIR, { recursive: true });
    console.log(`📁 Created directory: ${PLUGINS_DIR}`);
  }

  // 3. Ensure Lavalink.jar (prefer verified local copy from .local, else download)
  const needsJar = !existsSync(JAR_PATH) || statSync(JAR_PATH).size < 10_000_000;
  if (needsJar) {
    if (existsSync(LOCAL_REF_JAR) && statSync(LOCAL_REF_JAR).size > 10_000_000) {
      console.log(`📋 Copying verified Lavalink.jar from reference recipe (${LOCAL_REF_JAR})...`);
      copyFileSync(LOCAL_REF_JAR, JAR_PATH);
      const sizeMb = (statSync(JAR_PATH).size / (1024 * 1024)).toFixed(2);
      console.log(`✅ Lavalink.jar copied (${sizeMb} MB) to ${JAR_PATH}`);
    } else {
      console.log(`📥 Downloading Lavalink v${LAVALINK_VERSION} from GitHub releases...`);
      console.log(`   URL: ${LAVALINK_JAR_URL}`);
      const res = await fetch(LAVALINK_JAR_URL);
      if (!res.ok || !res.body) {
        throw new Error(`Failed to download Lavalink.jar: HTTP ${res.status} ${res.statusText}`);
      }
      const fileStream = createWriteStream(JAR_PATH);
      await pipeline(Readable.fromWeb(res.body as any), fileStream);
      const sizeMb = (statSync(JAR_PATH).size / (1024 * 1024)).toFixed(2);
      console.log(`✅ Downloaded Lavalink.jar (${sizeMb} MB) to ${JAR_PATH}`);
    }
  } else {
    const sizeMb = (statSync(JAR_PATH).size / (1024 * 1024)).toFixed(2);
    console.log(`✅ Lavalink.jar already present (${sizeMb} MB)`);
  }

  // 4. Sync exact verified plugins from reference recipe
  if (existsSync(LOCAL_REF_PLUGINS)) {
    console.log('🔄 Synchronizing verified plugins from reference recipe...');
    const refJars = readdirSync(LOCAL_REF_PLUGINS).filter((f) => f.endsWith('.jar'));

    // Remove any stale or incompatible plugins in lavalink/plugins
    const existingJars = readdirSync(PLUGINS_DIR).filter((f) => f.endsWith('.jar'));
    for (const existing of existingJars) {
      if (!refJars.includes(existing)) {
        console.log(`🗑️ Removing superseded plugin: ${existing}`);
        try {
          unlinkSync(join(PLUGINS_DIR, existing));
        } catch {
          // ignore if locked
        }
      }
    }

    // Copy all verified plugin jars
    for (const jar of refJars) {
      const srcPath = join(LOCAL_REF_PLUGINS, jar);
      const destPath = join(PLUGINS_DIR, jar);
      if (!existsSync(destPath) || statSync(destPath).size !== statSync(srcPath).size) {
        copyFileSync(srcPath, destPath);
        const kb = (statSync(destPath).size / 1024).toFixed(0);
        console.log(`   + Synced plugin: ${jar} (${kb} KB)`);
      }
    }
    console.log(`✅ Verified plugins synchronized: ${refJars.length} plugin(s) active.`);
  }

  // 5. Generate application.yml with exact YouTube & LavaSrc recipe
  const spotifyClientId =
    process.env.SPOTIFY_CLIENT_ID || '***REMOVED_SPOTIFY_CLIENT_ID***';
  const spotifyClientSecret =
    process.env.SPOTIFY_CLIENT_SECRET || '***REMOVED_SPOTIFY_CLIENT_SECRET***';
  const spotifySpDc =
    process.env.SPOTIFY_SP_DC ||
    '***REMOVED_SPOTIFY_SP_DC***';
  const lavalinkPassword = process.env.LAVALINK_PASSWORD || 'youshallnotpass';
  const lavalinkPort = process.env.LAVALINK_PORT || '2333';

  console.log('⚙️ Generating production application.yml (exact LavaMusic recipe)...');

  const configContent = `server:
  port: ${lavalinkPort}
  address: 0.0.0.0
lavalink:
  server:
    sources:
      youtube: false # Native YouTube disabled in Lavalink v4, handled by youtube-plugin
    password: "${lavalinkPassword}"
    bufferDurationMs: 225
    frameBufferDurationMs: 5000
    youtubePlaylistLoadLimit: 3
    opusEncodingQuality: 5
    resamplingQuality: MEDIUM
    trackStuckThresholdMs: 5000
    playerUpdateInterval: 3
    useSeekGhosting: true
    youtubeSearchEnabled: true
    soundcloudSearchEnabled: true
    gc-warnings: true
  plugins:
    - dependency: "com.github.topi314.lavasrc:lavasrc-plugin:4.8.3"
      repository: "https://maven.lavalink.dev/releases"
    - dependency: "com.github.topi314.lavasearch:lavasearch-plugin:1.0.0"
      repository: "https://maven.lavalink.dev/releases"
    - dependency: "com.dunctebot:skybot-lavalink-plugin:1.7.0"
      repository: "https://maven.lavalink.dev/releases"
    - dependency: "com.github.devoxin:lavadspx-plugin:0.0.5"
      repository: "https://jitpack.io"
    # Pinned YouTube snapshot build with ANDROID_VR and remoteCipher support
    - dependency: "dev.lavalink.youtube:youtube-plugin:f45bbb7aebfcbc1c553769e04af6cd43afa8b7c3"
      snapshot: true
    - dependency: "com.github.topi314.lavalyrics:lavalyrics-plugin:1.1.0"
      repository: "https://maven.lavalink.dev/releases"
    - dependency: "me.duncte123:java-lyrics-plugin:1.6.6"
      repository: "https://maven.lavalink.dev/releases"
plugins:
  lyrics:
    countryCode: en-US
    geniusApiKey: "<insert>"
  lavalyrics:
    sources:
      - genius
      - spotify
      - youtube
  youtube:
    enabled: true
    # Public yt-cipher instance for dynamic signature deciphering
    remoteCipher:
      url: "https://cipher.kikkia.dev/"
      userAgent: "ririko-bot"
    oauth:
      enabled: false
    allowSearch: true
    allowDirectVideoIds: true
    allowDirectPlaylistIds: true
    clients:
      # ANDROID_VR first: needs no login and returns plain audio formats without SABR blocks
      - "ANDROID_VR"
      - "TV"
      - "MWEB"
      - "TVHTML5_SIMPLY"
      - "ANDROID_MUSIC"
      - "MUSIC"
      - "WEB"
      - "WEBEMBEDDED"
    TVHTML5_SIMPLY:
      playback: true
      playlistLoading: true
      searching: true
      videoLoading: true
    ANDROID_MUSIC:
      playlistLoading: false
      videoLoading: true
      searching: true
      playback: true
    MUSIC:
      playlistLoading: false
      videoLoading: false
      searching: true
      playback: false
    WEB:
      playlistLoading: false
      videoLoading: true
      searching: true
      playback: true
    WEBEMBEDDED:
      playlistLoading: false
      videoLoading: false
      searching: false
      playback: true
  lavasrc:
    providers:
      # Exact-recording match via ISRC first, text query fallback, then SoundCloud
      - 'ytsearch:"%ISRC%"'
      - "ytsearch:%QUERY%"
      - "scsearch:%QUERY%"
    sources:
      spotify: true
      applemusic: false
      deezer: false
      jiosaavn: false
      pandora: false
      yandexmusic: false
      flowerytts: true
      youtube: true
      tidal: false
      vkmusic: false
      qobuz: false
      ytdlp: false
    lyrics-sources:
      spotify: true
      deezer: false
      youtube: true
      yandexmusic: false
      vkmusic: false
      lrcLib: true
    spotify:
      clientId: "${spotifyClientId}"
      clientSecret: "${spotifyClientSecret}"
      spDc: "${spotifySpDc}"
      countryCode: "US"
      playlistLoadLimit: 6
      albumLoadLimit: 6
      resolveArtistsInSearch: false
      localFiles: false
      preferPartnerApi: false
      preferV1SearchApi: false
metrics:
  prometheus:
    enabled: false
    endpoint: /metrics
logging:
  file:
    max-history: 5
    max-size: 10MB
    path: ./logs/
  level:
    root: INFO
    lavalink: INFO
    dev.lavalink.youtube: DEBUG
  logback:
    rollingpolicy:
      max-file-size: 10MB
      max-history: 5
`;

  writeFileSync(YML_PATH, configContent, 'utf8');
  console.log(`✅ Configuration generated at: ${YML_PATH}`);
  console.log('🎉 [Ririko Lavalink Autoinstaller] Setup complete! You can start Lavalink using: pnpm lavalink:start');
}

if (process.argv[1]?.endsWith('lavalink-setup.ts')) {
  void setupLavalink().catch((err) => {
    console.error('❌ Setup error:', err);
    process.exit(1);
  });
}

