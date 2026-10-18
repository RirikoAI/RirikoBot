---
slug: /
title: Ririko AI Documentation
---

# Ririko AI Documentation

Ririko AI is a Discord bot with music, AI chat, moderation, an economy, a card game and a web dashboard. This site is the project wiki: it is built from the `docs/` folder of the repository, so every page here is a Markdown file you can read on GitHub too.

## Where to start

- **Run your own Ririko**: [Deploy Ririko With Docker](./deployment.md), then [After You Install](./after-installing.md) and [Integrations](./adapters.md) for the optional settings and the keys each feature needs.
- **Coming from Ririko 1.4**: [Upgrade From Ririko 1.4.0 to 2.0](./upgrading-from-1.4.md) and [Move Your Data](./migrations.md).
- **Use the bot**: [Commands](./commands.md), [Music](./music.md), [AI Chat and Images](./ai.md) and [Waifu TCG Player Guide](./tcg-player-guide.md).
- **Contribute**: [Contributing & Development Standards](./contributing.md) and the [Developer Guide](./development.md).

## Read this wiki on your own machine

The documentation runs locally with one command, and search works offline.

1. Install dependencies once: `pnpm install`.
2. Start the site with hot reload: `pnpm docs:dev`. It opens at <http://localhost:3000>, or the next free port if 3000 is taken.
3. To check the finished site instead, run `pnpm docs:build` and then `pnpm docs:serve`. The built site works without a network connection.

`pnpm docs:build` fails on any broken link, so a documentation change that breaks a link does not pass CI.
