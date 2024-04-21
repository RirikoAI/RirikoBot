## The Config file
This is where you set the configurations for Ririko. Your giveaway data and autovoice data
will also be here in this directory.

You can either use the installer to setup the configuration file or manually copy
the `config.example.ts` file to `config.ts` and modify it to your needs.

#### Table of contents
(Wow look at these, so much features :D)
- [Application configuration](#application-configuration)
- [Discord configuration](#discord-configuration)
- [Stable Diffusion configuration](#stable-diffusion-configuration)
- [AI configuration](#ai-configuration)
- [Database configuration](#database-configuration)
- [Stream Live Notifier configuration](#stream-live-notifier-configuration)
- [Welcomer configuration](#welcomer-configuration)
- [Nitro Announcer configuration](#nitro-announcer-configuration)
- [Giveaways configuration](#giveaways-configuration)
- [Lyrics configuration](#lyrics-configuration)
- [Music Embed configuration](#music-embed-configuration)
- [Music Emoji configuration](#music-emoji-configuration)
- [Bot sponsor configuration](#bot-sponsor-configuration)
- [Vote manager configuration](#vote-manager-configuration)
- [Shard manager configuration](#shard-manager-configuration)
- [Music Playlist configuration](#music-playlist-configuration)
- [Music Miscellaneous configuration](#music-miscellaneous-configuration)
- [Stats configuration](#stats-configuration)
- [Moderation configuration](#moderation-configuration)
- [Cache configuration](#cache-configuration)
- [Debug configuration](#debug-configuration)
- [Version](#version)

The configuration file is a TypeScript file that exports an object with the following properties:


### Application configuration
- `PORT` (string) The port the server will listen on.
- `BACKEND_PORT` (string): The port the backend server will listen on.
- `DOMAIN_NAME` (string): The domain name of the server.
- `PUBLIC_URL` (string): The public URL of the server.
- `LANGUAGE` (string): The default language of the server.

[Back to top](#table-of-contents)

### Discord configuration
- `DISCORD` (object): The Discord configuration.
  - `PREFIX` (string): The prefix of the bot.
  - `DiscordToken` (string): The token of the bot.
  - `DiscordBotID` (string): The Application ID of the bot.
  - `DiscordClientSecret` (string): The client secret of the bot.
  - `Users` (object): The users configuration.
    - `Owners` (string[]): The list of owner user IDs.
    - `AIAllowedUsers` (string[]): The list of users allowed to use the AI.

[Back to top](#table-of-contents)

### Stable Diffusion configuration
- `StableDiffusion` (object): The StableDiffusion configuration.
  - `ReplicateToken` (string): The Replicate.com API Token.
  - `Model` (string): The model to use. Must be one of the available models set below:
  - `AvailableModels` (object): The available models. You can find the model ID by going to 
  - https://replicate.com/models and clicking on the model you want to use.
      - `key` (string): The name of the model. (No spaces, only underscores)
    - `value` (string): The model ID. (The ID from replicate for the model you want to use)

[Back to top](#table-of-contents)


### AI configuration
- `AI` (object): The AI configuration.
  - `Prefix` (string): The prefix of the AI part of the bot.
  - `Provider` (string): The provider to use for the bot. Must be one of:
    - `NLPCloudProvider` # Requires NLPCloud API key
    - `OpenAIProvider` # Requires OpenAI API key 
    - `RirikoLLaMAProvider` # Host the AI model and run locally with your GPUs/CPUs # 
    You have to host a server to use this https://github.com/RirikoAI/RirikoLLaMA-Server
    - `RirikoHuggingChatProvider` # Uses the chat.huggingface.co API, you have to run 
    a server to use this https://github.com/RirikoAI/RirikoHuggingChat-Server
  - `AIToken` (string): The provider token. (NLPCloud API key, OpenAI API key, etc.)
  - `GPTModel` (string): The model to use. # Use any model in this page 
  https://platform.openai.com/docs/models/overview
  - `LocalServerURL` (string): The URL of the local server for Ririko AI.
  - `EnableWhitelist` (boolean): Enable or disable the whitelist.
  - `Personality` (string[]): The personality of Ririko. # You can set the AI chat bot personality,
  including it's name, age, traits, etc
  - `Prompts` (string[]): The past prompts. Will be injected into the conversation everytime. # 
  Use this part to set ability. For example, in Ririko, you
  can set the ability to play music by responding to user's prompt a certain way.
  - `DailyLimit` (boolean): Enable daily limit for each member.

[Back to top](#table-of-contents)

### Database configuration
- `DATABASE` (object): The database configuration.
  - `Engine` (string): The database engine to use. Must be one of:
    - `sqlite`
    - `mongodb` # Sign up here for free: https://www.mongodb.com/cloud/atlas
    - `mysql` 
  - `MongoDB` (object): The MongoDB configuration.
    - `AccessURI` (string): The MongoDB access URI. # You can get this from MongoDB Atlas,
    it looks like this: mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<dbname>

[Back to top](#table-of-contents)

### Stream Live Notifier configuration
- `TWITCH` (object): The Twitch configuration.
  - `TwitchClientId` (string): The Twitch client ID. # Get it from https://dev.twitch.tv/console
  - `TwitchClientSecret` (string): The Twitch client secret. # Same as above

[Back to top](#table-of-contents)

### Welcomer configuration    
- `welcomer` (object): The welcomer configuration. 
  - `defaultImageUrl` (string): The default image URL. # You can host images on imgur (https://imgur.com/upload)
  or any other image hosting service.

[Back to top](#table-of-contents)

### Nitro Announcer configuration
- `nitroAnnouncer` (object): The nitro announcer configuration.
  - `message` (string): The message to send when someone boosts the server.

[Back to top](#table-of-contents)

### Giveaways configuration
- `giveaways` (object): The giveaways configuration.
  - `everyoneMention` (boolean): Whether to mention everyone.

[Back to top](#table-of-contents)

### Lyrics configuration
- `GENIUS_TOKEN` (string): The Genius token.
- `GENIUS_ENABLED` (boolean): Whether Genius is enabled.
- `LYRIST_URL` (string): The Lyrist URL.
- `LYRIST_ENABLED` (boolean): Whether Lyrist is enabled.

[Back to top](#table-of-contents)

### Music Embed configuration
- `embedColor` (string): The embed color.

[Back to top](#table-of-contents)

### Music Emoji configuration
- `emoji` (object): The emoji configuration.
  - `play` (string): The play emoji.
  - `stop` (string): The stop emoji.
  - `queue` (string): The queue emoji.
  - `success` (string): The success emoji.
  - `repeat` (string): The repeat emoji.
  - `error` (string): The error emoji.

[Back to top](#table-of-contents)

### Bot sponsor configuration
- `sponsor` (object): The sponsor configuration.
  - `status` (boolean): Whether the sponsor is enabled.
  - `url` (string): The Discord sponsor URL.

[Back to top](#table-of-contents)

### Vote manager configuration
- `voteManager` (object): The vote manager configuration.
  - `status` (boolean): Whether the vote manager is enabled.
  - `api_key` (string): The Top.gg API key.
  - `vote_commands` (string[]): The vote commands.
  - `vote_url` (string): The Top.gg vote URL.

[Back to top](#table-of-contents)

### Shard manager configuration
- `shardManager` (object): The shard manager configuration.

[Back to top](#table-of-contents)

### Music Playlist configuration
- `playlistSettings` (object): The playlist settings.
  - `maxPlaylist` (number): The maximum playlist count.
  - `maxMusic` (number): The maximum music count.

[Back to top](#table-of-contents)

### Music Miscellaneous configuration
- `opt` (object): The opt configuration.
  - `DJ` (object): The DJ configuration.
    - `commands` (string[]): The DJ commands.
  - `voiceConfig` (object): The voice configuration.
    - `leaveOnFinish` (boolean): Whether to leave the channel when the music ends.
    - `leaveOnStop` (boolean): Whether to leave the channel when the music is stopped.
    - `leaveOnEmpty` (object): The leave on empty configuration.
      - `status` (boolean): Whether to leave on empty.
      - `cooldown` (number): The cooldown.
  - `maxVol` (number): The maximum volume level.

[Back to top](#table-of-contents)

### Stats configuration
- `STATS` (object): The stats configuration.
  - `ENABLED` (boolean): Whether stats are enabled.
  - `XP_COOLDOWN` (number): The XP cooldown.
  - `DEFAULT_LVL_UP_MSG` (string): The default level up message.

[Back to top](#table-of-contents)

### Moderation configuration
- `MODERATION` (object): The moderation configuration.
  - `ENABLED` (boolean): Whether moderation is enabled.
  - `EMBED_COLORS` (object): The embed colors.

[Back to top](#table-of-contents)

### Cache configuration
- `CACHE_SIZE` (object): The cache size.
  - `GUILDS` (number): The guilds cache size.
  - `USERS` (number): The users cache size.
  - `MEMBERS` (number): The members cache size.

[Back to top](#table-of-contents)

### Debug configuration
- `DEBUG` (object): The debug configuration.
  - `Level` (number): The debug level.
  - `LogDir` (string): The log directory.

[Back to top](#table-of-contents)

### Version
We iterate the version of the configuration file to ensure that the configuration file is up-to-date.
- `VERSION` (string): The version of the configuration file. Do not modify this.

[Back to top](#table-of-contents)