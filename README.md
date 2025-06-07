[![RirikoAI](https://circleci.com/gh/RirikoAI/RirikoBot.svg?style=svg)](https://app.circleci.com/pipelines/github/RirikoAI/RirikoBot?branch=master)
[![codecov](https://codecov.io/github/ririkoai/ririkobot/branch/beta%2F1.0.0/graph/badge.svg?token=EBD0B7CJ76)](https://codecov.io/github/ririkoai/ririkobot)
[![CodeFactor](https://www.codefactor.io/repository/github/ririkoai/ririkobot/badge/master)](https://www.codefactor.io/repository/github/ririkoai/ririkobot/overview/master)
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-3-orange.svg?style=flat-square)](#contributors-)<!-- ALL-CONTRIBUTORS-BADGE:END -->

<img src="https://i.imgur.com/sNtvyAK.jpeg" style="max-width: 1000px;" alt="Ririko AI" />

# Hi there! I'm Ririko AI! 👋

I am a Discord bot that can do a lot of things, including:

<table>
    <tr>
        <td>Image Generation</td>
        <td>Chatbot</td>
        <td>Fun Commands</td>
        <td>Moderation</td>
        <td>Music</td>
    </tr>
    <tr>
        <td>Economy</td>
        <td>Games</td>
        <td>Giveaways</td>
        <td>EXP System</td>
        <td>...and many more!</td>
    </tr>
</table>

See [full list of commands here](https://github.com/RirikoAI/RirikoBot/wiki/LIST:-All-commands-supported-by-Ririko-AI)

Join [our Discord server](https://discord.gg/uw3JTwwWYT) if you need help or just want to chat.

## Deploy to Render (Recommended, Easiest)

Click the button below to deploy Ririko AI to Render. You'll need to provide your Discord bot token, App ID, and other
configurations in the Render
dashboard. [Click here to see the instructions](https://github.com/RirikoAI/RirikoBot/wiki/DEPLOY:-Deploying-to-Render.com).

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FRirikoAI%2FRirikoBot)

## Running Ririko AI using Docker (Recommended)

You also need to have Docker installed on your machine. You can find the installation instructions for your OS below:

| Windows Install Link                                                           | Linux Install Link                                          | MacOS Install Link                                                     | Raspberry Pi Install Link                                                          |
|--------------------------------------------------------------------------------|-------------------------------------------------------------|------------------------------------------------------------------------|------------------------------------------------------------------------------------|
| [Docker for Windows](https://docs.docker.com/desktop/install/windows-install/) | [Docker for Linux](https://docs.docker.com/engine/install/) | [Docker for Mac](https://docs.docker.com/desktop/install/mac-install/) | [Docker for Raspberry Pi](https://docs.docker.com/engine/install/raspberry-pi-os/) |

### Setup docker-compose.yml

```bash
# Download the docker-compose.yml file
$ curl -o docker-compose.yml https://install.ririko.ai/docker-compose.yml

# Configure the docker-compose.yml file by adding your Discord bot token, App ID, and other configurations
$ notepad docker-compose.yml # Windows
$ nano docker-compose.yml # Linux / MacOS

# After configuring the docker-compose.yml file, run the following command to start the bot
$ docker compose up -d
```

That's it. You should now have Ririko AI running on your machine. You can rerun `docker compose up -d` to start the bot
again after stopping it or if you changed the configuration in the docker-compose.yml file.

If you want to build the image yourself,
click [here](https://github.com/RirikoAI/RirikoBot/wiki/TUTORIAL:-Building-your-own-Docker-image)

## Install without using Docker (Not recommended)

### Download and install prerequisites

1. Download Node here: https://nodejs.org/en/download.
2. Download FFmpeg here: https://github.com/RirikoAI/RirikoBot/wiki/Extra-configurations-for-Music-Bot.

### Note:

Here's the tricky part, `canvas` and `better-sqlite3` are notoriously known for being difficult to install on Windows.
If you are using Windows and just wants to enjoy using Ririko, we extremely recommend using the recommended methods
above. Save yourself the headache.

```bash
# Install the dependencies and configure the project
$ npm run setup

# Copy .env.example to .env
$ cp .env.example .env # Set your Discord bot token here

# development mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Contributors ✨

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://angel.net.my"><img src="https://avatars.githubusercontent.com/u/57413115?v=4?s=100" width="100px;" alt="Earnest Angel"/><br /><sub><b>Earnest Angel</b></sub></a><br /><a href="https://github.com/RirikoAI/RirikoBot/commits?author=earnestangel" title="Code">💻</a> <a href="#design-earnestangel" title="Design">🎨</a> <a href="#infra-earnestangel" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="https://github.com/RirikoAI/RirikoBot/commits?author=00ZenDaniel" title="Tests">⚠️</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/True-Aki"><img src="https://avatars.githubusercontent.com/u/154510235?v=4?s=100" width="100px;" alt="Aki"/><br /><sub><b>Aki</b></sub></a><br /><a href="https://github.com/RirikoAI/RirikoBot/commits?author=True-Aki" title="Code">💻</a> <a href="#design-True-Aki" title="Design">🎨</a><a href="https://github.com/RirikoAI/RirikoBot/commits?author=00ZenDaniel" title="Tests">⚠️</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/00ZenDaniel"><img src="https://avatars.githubusercontent.com/u/112818992?v=4?s=100" width="100px;" alt="Muhammad Afiq Danial Bin Azruliswal"/><br /><sub><b>Muhammad Afiq Danial Bin Azruliswal</b></sub></a><br /><a href="https://github.com/RirikoAI/RirikoBot/commits?author=00ZenDaniel" title="Tests">⚠️</a> <a href="https://github.com/RirikoAI/RirikoBot/commits?author=00ZenDaniel" title="Code">💻</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification.
Contributions of any kind welcome!
