# Integrations

Ririko connects to outside services for AI, images, music, streams, anime data and free games. This page lists each service, what it needs, and what happens when it is missing. It is for the person who hosts the bot.

You set every key in the `.env` file. Never put a key in Discord or in the database. Restart the bot after you change `.env`. The `.env.example` file shows every variable.

## 1. Check Your Setup

- Run `ririko doctor`. It checks Node.js, the database settings, the Discord token and client ID, FFmpeg, the AI keys, the stream keys, Spotify and image generation. See [development.md](development.md).
- Open the dashboard **Integrations** page. It shows `Configured` or `Not configured` for each service. It never shows a key. See [dashboard.md](dashboard.md).

## 2. Summary

| Feature | Service | Needed? | Variables |
|---|---|---|---|
| The bot | Discord | Yes | `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` |
| The dashboard | Discord OAuth | For the dashboard | `DISCORD_CLIENT_SECRET`, `DASHBOARD_URL`, `SECRET_VAULT_KEY` |
| AI chat | Gemini, OpenAI or Ollama | At least one, for AI | See section 3 |
| Images | Gemini, Replicate or ComfyUI | At least one, for `/imagine` | See section 4 |
| Music | Lavalink | Recommended | See section 5 |
| Spotify links | Spotify | For Spotify links | See section 5 |
| Twitch alerts | Twitch | For Twitch alerts | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` |
| YouTube alerts | YouTube Data API | Optional | `YOUTUBE_API_KEY` |
| TikTok alerts | TikTok session | Optional | `TIKTOK_SESSION_ID`, `TIKTOK_API_KEY` |
| Free games | Epic Games Store, Steam | No key | None |
| Anime search | Jikan (MyAnimeList), AniList | No key | None |
| Waifu images | waifu.im | No key | None |
| Wallpapers | WallHaven, Zerochan, Konachan | No key | None |
| Reaction GIFs | OtakuGIFs | No key | None |
| Lyrics | LRCLIB | No key | None |

Full setup of Discord, the dashboard and Docker is in [SETUP.md](https://github.com/RirikoAI/RirikoBot/blob/master/SETUP.md) and [deployment.md](deployment.md).

## 3. AI Chat Providers

| Provider | Variables | Notes |
|---|---|---|
| Google Gemini | `GEMINI_API_KEY` | The default. |
| OpenAI | `OPENAI_API_KEY`, optional `OPENAI_BASE_URL` | Set `OPENAI_BASE_URL` for an OpenAI-compatible service. |
| Ollama | `OLLAMA_BASE_URL` | A server you run yourself. |

`DEFAULT_AI_PROVIDER` picks the first provider. `DEFAULT_AI_MODEL` picks its model.

When a provider fails or runs out of quota, Ririko tries the next provider that you have set up. A provider that keeps failing is skipped for a short time. Each server can choose its own first provider and model. See [ai.md](ai.md).

## 4. Image Providers

| Provider | Variables | Notes |
|---|---|---|
| Google Gemini (Imagen) | `GEMINI_API_KEY` | The default. |
| Replicate | `REPLICATE_API_TOKEN` | Flux models. |
| ComfyUI or Stable Diffusion WebUI | `COMFYUI_URL` (or `COMFYUI_BASE_URL`, `SD_WEBUI_URL`) | A server you run yourself. |
| Mock | None | A placeholder picture for tests. |

`IMAGE_DEFAULT_PROVIDER` picks the default. `IMAGE_DAILY_QUOTA` limits the images a member can make in 24 hours (default 30). Image requests wait in a queue, so a busy bot does not freeze.

## 5. Music

| Part | Variables | Notes |
|---|---|---|
| Lavalink | `LAVALINK_ENABLED`, `LAVALINK_HOST`, `LAVALINK_PORT`, `LAVALINK_PASSWORD`, `LAVALINK_SECURE` | Plays YouTube, Spotify, SoundCloud and more. Without it, Ririko uses a built-in player with fewer sources. |
| YouTube cipher | `LAVALINK_YOUTUBE_CIPHER_URL` | Optional. |
| Spotify | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_DC`, `SPOTIFY_KEY`, `SPOTIFY_SP_DC` | Needed to play Spotify links. |

See [music.md](music.md).

## 6. Stream Alerts

| Platform | Variables | Notes |
|---|---|---|
| Twitch | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | Needed for Twitch alerts. Create an app at the [Twitch developer console](https://dev.twitch.tv/console/apps). |
| YouTube | `YOUTUBE_API_KEY` | Optional. Without it, Ririko reads public pages. |
| TikTok | `TIKTOK_SESSION_ID`, `TIKTOK_API_KEY` | Optional. Without them, Ririko reads public pages. |

`STREAM_CHECK_INTERVAL_MS` sets how often Ririko checks for live streams. The default is 60000 (1 minute). The dashboard reads the same Twitch keys, to look up Twitch names.

Ririko saves the preview picture of a stream and attaches it to the alert, so the alert still works after the stream ends. It sends each alert once for each stream, server and channel. See [modules.md](modules.md).

## 7. Services Without Keys

These services need no setup. If one is down, the feature that uses it shows an error message.

- **Jikan and AniList** answer anime, manga and character searches. Ririko asks Jikan first. If Jikan fails, it asks AniList and skips Jikan for 60 seconds.
- **waifu.im** gives waifu images. The card game also uses it for card art.
- **WallHaven, Zerochan and Konachan** give wallpapers.
- **OtakuGIFs** gives reaction GIFs.
- **LRCLIB** gives lyrics.
- **Epic Games Store and Steam** give free games.

Every request has a time limit and a retry rule, so a slow service does not freeze the bot.
