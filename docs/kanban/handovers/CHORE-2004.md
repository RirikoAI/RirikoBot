# CHORE-2004 · Add the New Discord, Gemini, OpenAI, YouTube and Spotify Screenshots to the Setup Wizard Guides

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-11T15:13:00Z · claude-opus-5-5 (coordinator)

**Maintainer steps (before the chore starts)**

Take each screenshot in a browser window about 1280 px wide. Hide or blur tokens, secrets, email addresses and real server or user names. Save as PNG in `assets/installer/images/` with these names:

| File | Page | What it shows |
|---|---|---|
| `discord-new-application.png` | Discord Developer Portal, Applications | The **New Application** button. |
| `discord-application-id.png` | Your application, General Information | The **Application ID** with its **Copy** button. |
| `discord-reset-token.png` | Your application, Bot | The **Reset Token** button. |
| `discord-intents.png` | Your application, Bot | **Privileged Gateway Intents** with Server Members Intent and Message Content Intent on, and **Save Changes**. |
| `discord-oauth2-secret.png` | Your application, OAuth2 | **Client Secret** with **Reset Secret**. |
| `discord-oauth2-redirect.png` | Your application, OAuth2 | **Redirects** with `http://localhost:3000/api/auth/callback` added. |
| `discord-copy-user-id.png` | Discord app, your profile | Developer Mode on and the **Copy User ID** menu item. |
| `gemini-api-key.png` | Google AI Studio | **Get API key**, then **Create API key**. |
| `openai-api-key.png` | OpenAI platform, API keys | **Create new secret key**. |
| `youtube-api-key.png` | Google Cloud console, APIs & Services, Credentials | **Create credentials**, **API key**, with YouTube Data API v3 enabled. |
| `spotify-app.png` | Spotify for Developers, Dashboard, your app | **Client ID** and **View client secret**. |

**Worker approach**
1. Check that every file in the table exists. If one is missing, set BLOCKED with the missing names.
2. Add each image to its guide step in `apps/cli/src/installer/guides.ts`, with a caption in the 1.x style ("Copy the application ID").
3. Compress any file over 300 KB (lossless PNG optimisation; keep it readable).
4. Open each image and confirm in the PROGRESS entry that it shows no secret or private name.

**Out of scope**
- Taking screenshots. Changing guide text beyond the captions.
