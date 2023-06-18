
# Ririko AI
A powerful AI-powered general Discord bot that you can call your companion.

[![A mushroom-head robot](https://i.imgur.com/85Z84vf.png 'Codey the Codecademy mascot')](https://discord.gg/VWzecBNTVv)

Official RirikoAI Support Discord: https://discord.gg/VWzecBNTVv

**[!] This project is still under heavy developments. Update 10th June 2023 - I've started to spend more and more time into this project, more features will come 😀**

[![RirikoAI](https://circleci.com/gh/RirikoAI/RirikoBot.svg?style=svg)](https://app.circleci.com/pipelines/github/RirikoAI/RirikoBot?branch=master)
[![CodeQL](https://github.com/RirikoAI/RirikoBot/workflows/CodeQL/badge.svg)](https://github.com/RirikoAI/RirikoBot/actions?query=workflow%3ACodeQL)

[![GitHub tag](https://img.shields.io/github/tag/RirikoAI/RirikoBot?include_prereleases=&sort=semver&color=blue)](https://github.com/RirikoAI/RirikoBot/releases/)
[![License](https://img.shields.io/badge/License-MIT-blue)](#license)
[![issues - RirikoBot](https://img.shields.io/github/issues/RirikoAI/RirikoBot)](https://github.com/RirikoAI/RirikoBot/issues)
[![Made In](https://img.shields.io/badge/made%20in-Malaysia-red.svg)](https://www.google.com/search?q=malaysia)

## Features
### 1. AI
**Companion / Chatbot:**
The AI chatbot uses the `.` prefix. Try it out by linking to your Discord bot and inviting it to your server. Start with `.hello`

Whats unique compared to the thousands of AI chatbots out there? 
Ririko can remember your past conversations. It is also personalized to each user, so no more cross contaminating prompts and no more forgetting or confused about your own name

**AI Powered Music bot:**
Try asking it to play a random anime music or suggesting you a Nightcore music. Something like `.Hey can you play me an anime music?`

### 2. Twitch Stream Notifier
Do you want to get notified when your favourite streamer is live on Twitch? Take a look at Ririko Twitch Stream Notifier by issuing this command `!info twitch`

### 3. General Purpose bot
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

### 4. Anime / Manga Finder
Find your favourite anime / manga using this command: `!anime` 
For example: `!anime Oshi No Ko`

I'm still working hard to make the anime recommendation function works, so you can find similar anime by a given keyword or genre. Stay tuned.

## Interested to run Ririko AI in your Discord servers?
Before starting, you'll need a couple of things:
1. Of course, your own Discord bot tokens. Create a bot here if you still didn't have one: [Discord Developer Portal — My Applications](https://discord.com/developers/applications). Create a new application, and bot for the new application. 
2. Your own OpenAI or NLPCloud API keys. Get OpenAI key here: [Sign Up for OpenAI)](https://platform.openai.com/signup?launch) OR NLPcloud [Sign Up for NLPCloud)](https://nlpcloud.com/home/register)
3. A MongoDB server OR cloud. Get it here: [MongoDB Cloud Database (Official)](https://www.mongodb.com/free-cloud-database).  Then get the URI / connection string. They looks like this: `mongodb+srv://yourownuser:yourownpassword@yourdomain.onss3te.mongodb.net/?retryWrites=true&w=majority`
4. LTS version of Node.js: [Download | Node.js (nodejs.org)](https://nodejs.org/en/download)
5. (optional) Genius token - if you want the lyrics feature: http://genius.com/api-clients
6. (non-optional) A little bit of patience. Keep calm and learn to ask for help. Read the instructions properly, ⚠️ DO NOT SKIP A SINGLE PART. No matter how smart you think you are⚠️

### Download and Setup
**Step 1: Clone the project**
There are two choices to download the files. Use the git command
```bash
  git clone https://github.com/RirikoAI/RirikoBot.git
```
**OR** Just download the zip files from the releases page: [Releases · RirikoAI/RirikoBot (github.com)](https://github.com/RirikoAI/RirikoBot/releases)

**Step 2: Go to the project directory and install the dependencies**
Open your command prompt and change directory to where you downloaded / cloned Ririko:
```bash
  cd RirikoBot
```
Install the dependencies (including the dev dependencies):

```bash
  npm install --dev
```

**Step 3: Configure settings**
⚠️ These things are super important: ⚠️
1. Copy the file `config.example.js` into `config.js` - You can set your AI chatbot personality in this file. This is your primary configuration file.
2. You need to copy the file `.env.example`  into `.env`  - The .env file contains mostly required settings like your bot token, bot ID number, prefix, owner IDs etc.
3. Fill in the config files. Check the configs and make sure they are correct.
4. (Upgrading) If you are upgrading from older version to a new major version (like 0.4 to 0.5 or 1.0.0 to 2.0.0), big chances the config files need to be re-copied. Repeat step 1-3 above.

Also good to note that `.env` file will override `config.js` file (for deployments)

**Step 4: Start the server**
```bash
  npm run start
```
Generally, if you've reached to this point, the bot should work already, but that. It is also advisable to run the bot in production mode:
```bash
npm run build
npm run start:prod
```
Good luck, and enjoy!

If you believe there is a bug in the codes, please report them here: [New Issue · RirikoAI/RirikoBot (github.com)](https://github.com/RirikoAI/RirikoBot/issues/new/choose)

## Contributing

Contributions are always welcome!

See `CONTRIBUTING.md` for ways to get started.

Please adhere to this project's `code of conduct` in `CODE_OF_CONDUCT.md`.

[![Use this template](https://img.shields.io/badge/Generate-Use_this_template-2ea44f?style=for-the-badge)](https://github.com/RirikoAI/RirikoBot/generate)
