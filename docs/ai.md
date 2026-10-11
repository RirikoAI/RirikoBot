# AI Chat and Images

Ririko can talk with your members, translate messages and make pictures. It remembers each member's chat on its own, and it only does what the member is allowed to do.

## 1. Turn It On

### 1.1. For the Host

Ririko needs at least one AI provider.

1. Get a key from a provider. Gemini is the default.
   - Gemini: [Google AI Studio](https://aistudio.google.com/)
   - OpenAI: [OpenAI](https://platform.openai.com/), or any OpenAI-compatible service (set `OPENAI_BASE_URL`)
   - Ollama: a server you run yourself (set `OLLAMA_BASE_URL`)
2. Add the key to `.env`:

   ```env
   DEFAULT_AI_PROVIDER=gemini
   GEMINI_API_KEY=your_key_here
   ```

3. Restart the bot.
4. Run `ririko doctor` to check the connection. See [development.md](development.md).

Other variables:

| Variable | Default | What it does |
|---|---|---|
| `DEFAULT_AI_PROVIDER` | `gemini` | The provider tried first: `gemini`, `openai` or `ollama`. |
| `DEFAULT_AI_MODEL` | Empty | A model for that provider. Empty uses the provider's default. |
| `GEMINI_API_KEY` | Empty | Gemini key. |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL` | Empty | OpenAI key, and an optional address for compatible services. |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Your Ollama server. |

If the first provider fails or runs out of quota, Ririko tries the next provider that you have set up. See [adapters.md](adapters.md).

### 1.2. For the Server Admin

Members can chat with Ririko with `/chat` or `/ai` in any channel. For a better experience, make an AI channel.

1. Open the dashboard **AI Chatbot** page. See [dashboard.md](dashboard.md).
2. Pick the **AI channel**.
3. Pick a **speaking style**.
4. Optional: write a **persona**.
5. Save.

Or run `/aichannel channel:#ririko-ai`. With no `channel`, `/aichannel` uses the channel where you run it. To remove the AI channel, clear it on the dashboard or type `!aichannel reset`. Ririko answers every message in the AI channel without a prefix.

## 2. How Chat Works

- In the AI channel, Ririko answers every message.
- In any other channel, Ririko answers when you mention it (`@Ririko how are you?`) or run `/chat` or `/ai`.
- Messages that start with the command prefix go to the command, not to the AI.
- Ririko remembers the last 20 messages of each member in each channel. Members do not see each other's memory, even in the same channel.
- Ririko sees only your public Discord name, display name and the server name. It never sees internal IDs, keys or account details.
- A reply longer than 2000 characters is sent in more than one message.

## 3. Commands

| Command | Aliases | Options | Who can use it |
|---|---|---|---|
| `/chat` | `c` | `prompt` (required) | Everyone |
| `/ai` | `ask` | `action`, `prompt`, `model`, `channel`, `style` | Everyone. See below. |
| `/aiclear` | `clearchat`, `reset-ai` | None | Everyone |
| `/aichannel` | `setaichannel` | `channel` | Manage Server or Manage Channels |
| `/aipersona` | `aistyle` | `style`, `prompt` | Manage Server to change. Everyone to view |
| `/aimodel` | `setmodel` | `model` | Manage Server to change. Everyone to view |

`/ai` does different things depending on `action`:

| Action | What it does | Who can use it |
|---|---|---|
| `chat` (default) | Chats. Use `prompt` for your message. | Everyone |
| `model` | Shows or sets the model. Use `model`. | Manage Server to set |
| `channel` | Sets the AI channel with `channel`. With no `channel`, it shows the current AI channel. To remove the channel, type `!ai channel reset`. | Manage Server or Manage Channels |
| `persona` | Sets the style and persona. Use `style` and `prompt`. | Manage Server |
| `clear` | Clears your memory in this channel. | Everyone |

- Speaking styles: `FRIENDLY_ANIME` (default), `TSUNDERE`, `KUUDERE`, `DANDERE`, `GENKI` and `FORMAL`.
- The model is a choice for the whole server. Run `/aimodel` with no option to see what you can choose. A choice is `provider`, such as `openai`, or `provider/model`, such as `gemini/gemini-2.5-pro`. Type `default` to reset it.
- Models you can choose:
  - Gemini: `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-3.5-flash-lite`, `gemini-3.7-flash`
  - OpenAI: `gpt-4o-mini`, `gpt-4o`, `o3-mini`
  - Ollama: `llama3.3`, `llama3.2`, `mistral`, `qwen2.5`, `deepseek-r1`
- The server chooses the provider that Ririko tries first. If it fails, the next provider answers with its own default model.

## 4. Server Settings

Open the dashboard **AI Chatbot** page.

| Setting | What it does |
|---|---|
| AI channel | The channel where Ririko answers every message. |
| Speaking style | The tone of Ririko. |
| Persona | Extra instructions for Ririko's personality, up to 1500 characters. |
| Tools | The actions Ririko may take while chatting. Remove every tool to turn tools off. |
| Provider and model | The provider and model to try first. The page lists only providers the host has set up. |

You can also use the command line: `ririko guild:config <server> ai.<key> <value>`.

## 5. Tools

A tool lets Ririko do something for a member while it chats. Ririko checks the permissions of the member before it uses a tool.

| Tool | What it does |
|---|---|
| Current time | Tells the time in your time zone. Ririko uses your own zone, then the server zone, then UTC. |
| Coin flip | Flips a coin. |
| Anime search | Looks up an anime. |
| Check a balance | Shows your credits. |
| Play music | Adds a song to the music queue. |
| Create a reminder | Sets a reminder for you. |

Ririko cannot run programs, read files, make web requests, change the database or use admin functions. It cannot ban, kick or change roles. If you ask it to do something you may not do, it refuses.

## 6. Translate to English

Right-click a message, choose **Apps**, then **Translate to English**. Only you see the result. See [commands.md](commands.md).

## 7. Images

`/imagine` makes a picture from a text description.

### 7.1. Turn It On

The host sets at least one image provider in `.env`:

| Variable | What it does |
|---|---|
| `GEMINI_API_KEY` | Uses Google Gemini Imagen. |
| `REPLICATE_API_TOKEN` | Uses Replicate (Flux models). |
| `COMFYUI_URL` | Uses your own ComfyUI or Stable Diffusion server. `COMFYUI_BASE_URL` and `SD_WEBUI_URL` also work. |
| `IMAGE_DEFAULT_PROVIDER` | The provider to use when nobody picks one: `gemini`, `replicate`, `comfyui` or `mock`. Default: `gemini`. |
| `IMAGE_DAILY_QUOTA` | The number of images each member may make in 24 hours, across all servers. Default: 30. 0 means no limit. |

The `mock` provider makes a simple test picture. Ririko uses it when the first provider fails and the member did not pick one.

Never put image keys in Discord. The `/setup-stablediffusion-api` command only explains this.

### 7.2. Commands

`/imagine` (aliases `img`, `ai-image`, `generate-image`). The cooldown is 5 seconds.

| Option | Required | What it does |
|---|---|---|
| `prompt` | Yes | What to draw. |
| `preset` | No | A style: `anime` (default), `photoreal`, `pixel-art`, `fantasy`, `cyberpunk` or `none`. |
| `aspect_ratio` | No | `1:1` (default), `16:9`, `9:16`, `4:3` or `3:4`. |
| `negative_prompt` | No | What to leave out. |
| `provider` | No | `auto` (default), `gemini`, `comfyui`, `replicate` or `mock`. |

Prefix form: `!imagine a castle at night --ar 16:9 --preset fantasy --negative people`.

`/stablediffusion-model` (aliases `sdmodel`, `sd-model`, `imagemodel`, `image-model`) sets or shows the defaults of the server. It needs **Manage Server**.

| Option | What it does |
|---|---|
| `preset` | The default style. |
| `provider` | The default provider: `gemini`, `replicate`, `comfyui` or `auto`. |

### 7.3. Server Settings

Open the dashboard **Image Generation** page.

| Setting | What it does |
|---|---|
| Default provider | The provider for `/imagine` when a member picks none. Only providers the host set up are listed. |
| Images per member (24 hours) | A limit for your server. It can be lower than the host's quota, not higher. |
| Default style | The style used when a member picks none. |

## 8. Limits

- Ririko needs a working provider and quota. If the provider fails, Ririko tells the member.
- Ririko remembers the last 20 messages of each member in a channel.
- Image requests wait in a queue. A request that waits long can take time.
- Input for translation is limited to 12,000 characters.
