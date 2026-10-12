# STORY-192 · Guided Setup Wizard: the 1.x Installer Rebuilt as ririko setup

<!--
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-11T15:13:00Z · claude-opus-5-5 (coordinator)

**The 1.x installer** (read-only copy in `.local/installer-1x/`)
- `index.html`: a jQuery Steps form with Bootstrap 4, Select2 and jQuery Validate, all loaded from CDNs. `assets/scss/bd-wizard.scss` is the layout; `assets/js/bd-wizard.js` the behaviour; `server/ririkoExpress.js` the server.
- The bot's Express server served it on `localhost:3000` whenever `config.js` was missing, and printed "You can now install Ririko Ai by visiting: http://localhost:3000".
- Pages: Welcome, then Step 1 Discord Bot, Step 2 AI (chatbot and Stable Diffusion), Step 3 Twitch, Step 4 Database (MongoDB), Step 5 Install (invite the bot, accept the terms and the privacy policy).
- Every step has the same shape: the fields; a **Note** box with numbered points; a button "Click here to show/hide the guide" that opens a card of numbered "Step N: ..." headings with text, links and screenshots; a click on a screenshot opens it full size with its caption. Feature switches ("Enable AI Chatbot") show their fields; those fields are required only while the switch is on.
- Step 4 checked the MongoDB address live: "Verifying connection..." and the Next button hidden until the check passed, then a success or error box.
- Finish posted the form as JSON, copied `config.example.js` to `config.js` and replaced the values with regular expressions, then asked the user to restart the bot.

**Do not carry over**
- `/submit_install` and `/test_mongodb` had no authentication: anything that reached the port could write the bot token or make the bot connect somewhere.
- The server printed the bot token to the console.
- Finish showed "Installation complete!" even when the request failed.
- The invite asked for every permission (`1099511627775`). 2.0 uses `BOT_INVITE_PERMISSIONS` (the 1.4.0 set, no Administrator).
- The intents were a tick-box the reader set. 2.0 needs two privileged intents (Server Members, Message Content; see `DEFAULT_GATEWAY_INTENTS`), not three, and the wizard reads them from the application flags.
- MongoDB, NLPCloud, the Hugging Chat and LLaMA providers do not exist in 2.0.

**Maintainer decisions (2026-10-11)**
- Keep the guides, the wizard layout and the fixed, predictable steps.
- Colors: the 2.0 dashboard palette (ink `#0f0d17`, panel `#1a1726`, edge `#2c2840`, sakura `#f472b6`, sakura-strong `#ec4899`), not the 1.x purple and green. The layout stays.
- Keep the terms and privacy tick-boxes. A worker drafts 2.0 texts in `docs/legal/` (TASK-1923); the maintainer approves the wording.
- 2.0.0 does not go to master without the wizard: STORY-191 and TASK-1911 require STORY-192.
- New screenshots: the maintainer takes them later (CHORE-2004). Until then the guides without a current image are text only.

**Design (coordinator)**
- **Where**: a local web wizard that the CLI starts (`ririko setup`; `pnpm installer` at the root). Not the dashboard: it cannot start without the values the wizard collects (`WebConfigSchema` requires `DISCORD_CLIENT_SECRET`, `DASHBOARD_URL`, `SECRET_VAULT_KEY`). Not a page on ririko.ai: readers would paste bot tokens into a website. The CLI already edits `.env` (`env-editor.ts` and three terminal wizards) and ships in the bot image.
- **Pages**: Welcome (which file is written, new or update) · Step 1 Discord Bot · Step 2 AI · Step 3 Stream Alerts · Step 4 Database & Music · Step 5 Dashboard · Step 6 Install. The 1.x step names and order are kept where the feature still exists.
- **Server-rendered, no JavaScript**: guides are `<details>`; the switches and the full-size image view are CSS only; Next is a form POST that the server validates. This keeps every step deterministic and testable over plain HTTP.
- **Deterministic rules**: fixed order; Next only when the page is valid and its required checks passed for the current values; a feature that is off writes nothing; the file starts from the example file and is filled in place, so the same answers give the same file; the result is parsed with the core schemas before it is written; a second run is update mode and never replaces `SECRET_VAULT_KEY` or `POSTGRES_PASSWORD`.
- **Security**: bound to 127.0.0.1; one-time token in the start URL, then an HttpOnly SameSite=Strict cookie; Host and Origin checks against DNS rebinding; a form token on every POST; secrets never logged or echoed; file mode 0600; the server stops after Finish or 30 idle minutes.

**Order**: TASK-1921 and TASK-1923 (independent), TASK-1922, TASK-1924, TASK-1925, TASK-1926. CHORE-2004 (screenshots) after TASK-1924, when the maintainer has the files.

**Finding during grooming**: `.env.example` as shipped fails `AppConfigSchema` and `WebConfigSchema` (`OPENAI_BASE_URL=` and `COMFYUI_URL=` are empty strings, and both are `.url()`), so a dashboard started from a copied `.env.example` refuses to start. The bot is not affected because `main.ts` reads `process.env` directly. TASK-1921 fixes it at the root (empty means unset), because the wizard writes from that file.

**Out of scope**: new bot features; a hosted installer on ririko.ai; changing the dashboard's own invite flow beyond moving `BOT_INVITE_PERMISSIONS`; the README rework (TASK-1901).
