# After You Install

Ririko works as soon as it is online. This page lists the optional settings to do next. Each step links to the page with the full guide.

The steps are for two people: the **host** (who runs the bot and edits `.env`) and the **server admin** (who needs the **Manage Server** permission in Discord). Often they are the same person.

## 1. Check the Setup

1. Run `ririko doctor`. It tests Node.js, the database, the Discord token, FFmpeg and each optional key. See [development.md](development.md).
2. Open the dashboard **Integrations** page. It shows `Configured` or `Not configured` for each service. See [dashboard.md](dashboard.md).
3. Run `/ping` in Discord to check that the bot answers.

## 2. Host Steps

Every key goes in the `.env` file. Never type a key in Discord. Restart the bot after you change `.env`.

| I want | Do this | Guide |
|---|---|---|
| AI chat | Run `ririko ai:configure`, or set `GEMINI_API_KEY`. Gemini has a free tier. | [ai.md](ai.md) section 1.1 |
| Images with `/imagine` | Set `GEMINI_API_KEY`, `REPLICATE_API_TOKEN` or `COMFYUI_URL`. | [ai.md](ai.md) section 7.1 |
| Music | Set up Lavalink. Install FFmpeg for the fallback player. | [music.md](music.md) section 1.1 |
| Twitch alerts | Create an app in the [Twitch developer console](https://dev.twitch.tv/console/apps). Set `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`. | [adapters.md](adapters.md) section 6 |
| The dashboard | Set the Discord OAuth values and `DASHBOARD_URL`. | [dashboard.md](dashboard.md) section 7 |

The `/setup-stablediffusion-api` command only explains where the image keys go. It does not accept a key. The same is true for the other keys: they never go through Discord.

## 3. Server Admin Steps

All of these steps work from the dashboard or from a command.

| I want | Command | Guide |
|---|---|---|
| A welcome card | `/welcomer channel:#welcome enable:true` | [modules.md](modules.md) section 5 |
| A farewell card | `/farewell channel:#goodbye enable:true` | [modules.md](modules.md) section 5 |
| Stream alerts | `/setup-stream-notification channel:#live`, then `/stream` | [modules.md](modules.md) section 6 |
| A music channel | `/setup-music` | [music.md](music.md) section 1.2 |
| An AI channel | `/aichannel channel:#ririko-ai` | [ai.md](ai.md) section 1.2 |
| A different prefix | `/prefix` | [commands.md](commands.md) |

Open the dashboard to see every setting in one place. See [dashboard.md](dashboard.md).
