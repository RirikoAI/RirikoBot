# Web Dashboard & Management Portal Specification (Ririko AI 2.0.0)

## 1. Overview & Fullstack Architecture
The **Ririko Management Dashboard** (`apps/web`) is a modern web application built on **Next.js 16 (App Router)** and **React 19**. It provides server administrators with complete graphical control over bot settings, server analytics, card collections, and moderation cases without requiring Discord commands.

---

## 2. Authentication, Guild Discovery & Authorization

```text
User Browser
     │
     ▼
Discord OAuth2 Flow (/api/auth/login)
     │ [Scopes: identify, guilds]
     ▼
Next.js Session Engine (Encrypted HTTP-Only Session Cookie)
     │
     ▼
Guild Discovery Pipeline
 ├── 1. Fetch User Guilds from Discord API
 ├── 2. Filter Guilds where User has `ManageGuild` (0x20) or `Administrator` (0x8)
 ├── 3. Match against active guilds in Ririko database
 └── 4. Render Server Selector Grid
```

### Authorization Rules:
- If a user loses `ManageGuild` permission on Discord, their dashboard session is immediately rejected upon the next request.
- Guild ID parameters in URLs are strictly validated against the user's authorized guild list on every Server Action and API route.

---

## 3. Comprehensive Module Configuration Pages

The dashboard provides dedicated management views for all 20+ bot modules:
1. **Overview**: Live server stats (member count, active voice channels, command usage graphs, bot latency).
2. **General**: Server prefix, default embed color, bot language, timezone.
3. **Moderation**: Case logs, warning escalation policy builder, moderation history inspector.
4. **AutoMod**: Toggles and threshold sliders for invite spam, phishing shields, caps lock, and mention limits.
5. **Music**: Default volume, DJ role picker, music channel binding, audio filter presets.
6. **AI Chatbot**: Personality prompt editor, model selection (Gemini / OpenAI / Ollama), tool toggles.
7. **Image Generation**: Provider selector, daily user quota limits, style presets.
8. **Economy & Banking**: Currency name, daily reward base amount, bank interest rates, item shop manager.
9. **XP & Ranking**: XP rate multipliers, voice XP toggles, level-up announcement channel.
10. **Waifu TCG**: Drop channel picker, drop message frequency, rarity weight sliders, marketplace tax rate.
11. **Games**: Enable/disable specific mini-games, wager limits, cooldown sliders.
12. **Giveaways**: Active giveaway list, winner reroll buttons, historical log.
13. **Reaction Roles**: Visual message builder and role mapping manager.
14. **Auto Voice**: Join-to-create channel assigner, user limit, bitrate presets.
15. **Stream Alerts**: Streamer subscription list (Twitch/YouTube/TikTok), announcement templates, mention roles.
16. **Free Games**: Epic/Steam/GOG announcement channels and notification ping roles.
17. **Welcome & Farewell**: Interactive canvas preview card editor with custom background uploads.
18. **Logging**: Channel bindings for message edits, deletes, voice joins, and role updates.
19. **Command Overrides**: Enable/disable specific commands or limit them to staff roles.
20. **Integrations & Secrets**: Third-party API status (`Configured ✓`). Secrets are **never** displayed.

---

## 4. Shared Zod Validation & Dashboard-to-CLI Parity

In compliance with Sections 43 and 72 of `BLUEPRINT.md`:
- Configuration schemas are defined once in `packages/core` using **Zod**.
- Both the **Web Dashboard** and the **CLI** invoke the exact same application services and validation schemas.
- Any change that can be configured via the web UI can also be executed via `ririko guild:config <guild_id> <key> <value>`.

---

## 5. Security & Secret Redaction
1. **Zero Secret Exposure**: Third-party tokens, Discord bot tokens, and database passwords are never rendered to HTML or sent to client React components. The UI displays:
   ```text
   Twitch Integration: Configured ✓
   Gemini API:         Configured ✓
   ```
2. **CSRF Protection**: All mutation endpoints use Next.js Server Actions with built-in origin verification and CSRF token validation.
3. **Audit Trail**: Every modification performed on the dashboard generates an entry in `audit_logs` capturing user ID, IP address, timestamp, and field diffs.
