# Ririko AI

A powerful AI-powered general Discord bot that you can call your companion. With Twitch Live Notifier, Giveaways,
OpenAI, Stable Diffusion, Moderations, Anime / Manga Finder and more features. Based on Discord.js v14.

<img align="left" width="400px" style="padding-right: 20px" src="https://repository-images.githubusercontent.com/606736855/f1ef8a0f-dfc1-4477-b42d-ac2e9945e77e">

<p>&nbsp;</p>

[![RirikoAI](https://circleci.com/gh/RirikoAI/RirikoBot.svg?style=svg)](https://app.circleci.com/pipelines/github/RirikoAI/RirikoBot?branch=master)
[![CodeQL](https://github.com/RirikoAI/RirikoBot/workflows/CodeQL/badge.svg)](https://github.com/RirikoAI/RirikoBot/actions?query=workflow%3ACodeQL)

[![NPM Version](https://badge.fury.io/js/ririko.svg)](https://npmjs.org/package/ririko)
[![GitHub tag](https://img.shields.io/github/tag/RirikoAI/RirikoBot?include_prereleases=&sort=semver&color=blue)](https://github.com/RirikoAI/RirikoBot/releases/)
[![NPM Download Stats](https://img.shields.io/npm/dw/ririko)](https://www.npmjs.com/package/ririko)
[![All Contributors](https://img.shields.io/github/all-contributors/RirikoAI/RirikoBot?color=ee8449&style=flat-square)](#contributors)
[![License](https://img.shields.io/badge/License-MIT-blue)](#license)
[![issues - RirikoBot](https://img.shields.io/github/issues/RirikoAI/RirikoBot)](https://github.com/RirikoAI/RirikoBot/issues)
[![Discord](https://img.shields.io/discord/1084420682995224716?color=blue&label=Discord&logo=discord&logoColor=white)](https://discord.gg/VWzecBNTVv)
[![Made In](https://img.shields.io/badge/made%20in-Malaysia-red.svg)](https://www.google.com/search?q=malaysia)

<p>&nbsp;</p>

## How RirikoAI Works?

RirikoAI is a Discord bot that is powered by `NodeJS`, it connects to several APIs (which you need to sign up for) so
the bot can work its magic. RirikoAI can be hosted on a PC or a Server and it also works with Pterodactyl (Docker)
servers.

| **RirikoAI Hosted Version is Coming Soon** | 
|--------------------------------------------|

No more using your PC to run the bot 24/7

| Please consider giving the repo a star ⭐ if you like it. It gives me motivation 😊 |
|------------------------------------------------------------------------------------|

## How to Install?

Now have web installer! Simply run without configuring anything `npm i --include=dev && npm run start` after downloading
this source files.

**Please follow the step by step instructions here to
install: [WIKI: how-to-install](https://github.com/RirikoAI/RirikoBot/wiki/How-to-Install)**

## Quickstart:

Requirements: [node.js LTS](https://nodejs.org/en/download), [git](https://git-scm.com/download/win) and npx (install
via npm like below)

[!!] To install, do not use `npm install Ririko`. Follow this instead:

```bash
  # install Ririko using the npx command:
  npx ririko RirikoBot 
  # change directory
  cd RirikoBot
  # To run the bot, configure your bot first (config.js or .env) before running this:
  npm run start:prod
```

If you dont have npx:

```bash
  # Install npx globally (-g) using npm
  npm install -g npx
```

## Note for Linux users
Please follow these steps to get the Music bot working: (For Ubuntu/Debian based distros)

```bash
apt install ffmpeg
npm uninstall ffmpeg-static
npm uninstall ffmpeg
npm update
```

**Please follow the step by step instructions here to
install: [WIKI: how-to-install](https://github.com/RirikoAI/RirikoBot/wiki/How-to-Install)**

Official RirikoAI Support Discord (see the bot live on action/get help here): https://discord.gg/VWzecBNTVv

**[!] This project is still under heavy developments. Update 10th June 2023 - I've started to spend more and more time
into this project, more features will come 😀**

###

### Join Our Discord

<p>Official RirikoAI Support Discord (see the bot live on action/get help here): https://discord.gg/VWzecBNTVv</p>

<img src="https://i.imgur.com/85Z84vf.png" width="300px" align="center">

## Features

### 🤖1. AI

**💬Companion / Chatbot:**
The AI chatbot uses the `.` prefix. Try it out by linking to your Discord bot and inviting it to your server. Start
with `.hello`

Whats unique compared to the thousands of AI chatbots out there?
Ririko can remember your past conversations. It is also personalized to each user, so no more cross contaminating
prompts and no more forgetting or confused about your own name

**🎵AI Powered Music bot:**
Try asking it to play a random anime music or suggesting you a Nightcore music. Something
like `.Hey can you play me an anime music?`

**🖼️Stable Diffusion:**
What you imagine can be a reality. Ririko can create art based on your imagination. Try it out by issuing this
command `/imagine` and follow the instructions.

### 🎥2. Twitch Stream Notifier

Do you want to get notified when your favourite streamer is live on Twitch? Take a look at Ririko Twitch Stream Notifier
by issuing this command `!info twitch`

### 🎉3. Giveaways

Create giveaways using `!giveaway-create`, drops using `!giveaway-drop` and more! (see !help).

### ☂️4. General Purpose bot

**Anime:** Collection of anime commands
`!foxgirl`, `!manga`, `!nekogif`, `!react`, `!waifu`, `!wallpaper`, `!wink`

**Announcer:** Get announced when someone joined or left the server
`!leave-announcer`, `!nitro-announcer`, `!welcomer`

**AutoVoiceChannel:** Eliminate empty voice channels, create them on the go when needed
`!setupavc`

**Fun:** More to come
`!spoiler`

**Music:** Play your favourite music
`!autoplay`, `!filter`, `!forward`, `!join`, `!leave`, `!lyrics`, `!nowplaying`, `!pause`, `!play`, `!playskip`, `!playtop`, `!previous`, `!queue`, `!repeat`, `!resume`, `!rewind`, `!seek`, `!shuffle`, `!skip`, `!skipto`, `!stop`, `!volume`

**Ririko:** Setup the prefix, get info of commands, other general stuffs
`!info`, `!help`, `!owners`, `!ping`, `!prefix`

**Roles:** Reaction roles, auto roles
`!addrr`, `!autorole`, `!removerr`

**Moderations:** Ban, kick, mute, purge, warn, etc
`!ban`, `!kick`, `!mute`, `!purge`, `!unban`, `!unmute`, `!warn` and more!

### 🥷🏻4. Anime / Manga Finder

Find your favourite anime / manga using this command: `!anime`
For example: `!anime Oshi No Ko`

I'm still working hard to make the anime recommendation function works, so you can find similar anime by a given keyword
or genre. Stay tuned.

## Contributing

Contributions are always welcome! If you have any feature you want to add, feel free to fork the repo and create a PR.
It doesn't have to be too fancy, so long as we both understand each other :D

See `CONTRIBUTING.md` for ways to get started.

Please adhere to this project's `code of conduct` in `CODE_OF_CONDUCT.md`.

## Contributors

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

[![Use this template](https://img.shields.io/badge/Generate-Use_this_template-2ea44f?style=for-the-badge)](https://github.com/RirikoAI/RirikoBot/generate)

<img src="https://api.visitorbadge.io/api/VisitorHit?user=RirikoAI&repo=RirikoBot&countColor=%237B1E7A" />
