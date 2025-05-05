[![RirikoAI](https://circleci.com/gh/RirikoAI/RirikoBot.svg?style=svg)](https://app.circleci.com/pipelines/github/RirikoAI/RirikoBot?branch=beta/1.0.0)
[![codecov](https://codecov.io/github/ririkoai/ririkobot/branch/beta%2F1.0.0/graph/badge.svg?token=EBD0B7CJ76)](https://codecov.io/github/ririkoai/ririkobot)
[![CodeFactor](https://www.codefactor.io/repository/github/ririkoai/ririkobot/badge/beta/1.0.0)](https://www.codefactor.io/repository/github/ririkoai/ririkobot/overview/beta/1.0.0)
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-2-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

## Description

Ririko AI BETA (Still in development).

### Important Note

If you are running Windows 10/11 x64, please use **Node v18 only** (blame `canvas` and `sqlite3` for not supporting
newer versions on Windows 10/11 x64).

## Download Node

Download Node here: https://nodejs.org/en/download (Scroll down the versions and find v18.x.x for Windows 10/11 x64,
download the MSI installer)

```bash
# Check node version (Ensure it is v18.x.x in Windows 10/11 x64)
$ node -v
```

## Project setup

```bash
# Install the dependencies and configure the project
$ npm run setup

# Copy .env.example to .env
$ cp .env.example .env # Set your Discord bot token here
```

## Compile and run the project

```bash
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
      <td align="center" valign="top" width="14.28%"><a href="https://angel.net.my"><img src="https://avatars.githubusercontent.com/u/57413115?v=4?s=100" width="100px;" alt="Earnest Angel"/><br /><sub><b>Earnest Angel</b></sub></a><br /><a href="https://github.com/RirikoAI/RirikoBot/commits?author=earnestangel" title="Code">💻</a> <a href="#design-earnestangel" title="Design">🎨</a> <a href="#infra-earnestangel" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/True-Aki"><img src="https://avatars.githubusercontent.com/u/154510235?v=4?s=100" width="100px;" alt="Aki"/><br /><sub><b>Aki</b></sub></a><br /><a href="https://github.com/RirikoAI/RirikoBot/commits?author=True-Aki" title="Code">💻</a> <a href="#design-True-Aki" title="Design">🎨</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification.
Contributions of any kind welcome!
