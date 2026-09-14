# Verified legacy feature inventory — Ririko 1.4.0

Audit date: 2026-09-14. Scope: static source inspection of public `master`, commit `0d8be25b17e25dfa61812d6e7b5aaf8497687257`, package version `1.4.0`. The requested `.local/RirikoBot` checkout was absent. The public source was obtained in `.audit/RirikoBot` and treated as immutable. This is a substitute reference snapshot, not evidence about an unavailable private deployment or its production data.

This document supersedes the earlier speculative inventory. Every source link is pinned to the audited commit. The companion [command manifest](legacy-command-manifest.json) records all 141 command declarations, exact regexes, prefix aliases, usage examples, nested slash options, declared permission expressions, context menu names, component metadata, file hashes, and all 191 asset paths/hashes. Metadata extraction reads source without importing or running legacy code.

**Parity status:** no legacy feature is certified as migrated or runtime compatible by this audit. Counts of declared handlers describe source structure, not successful Discord execution. Follow the implementation roadmap for the current 2.0 delivery status. External APIs, native audio/image dependencies, Discord registration, database contents, and legacy test execution were not exercised during this static audit.

## 1. Verified counts and corrections

| Item | Verified observation |
|---|---|
| Command class files | 141 `*.command.ts` files |
| Slash handler declarations, including inheritance | 141 |
| Prefix handler declarations, including inheritance | 138; 11 meme handlers are broken inherited implementations |
| Missing prefix handlers | `playlist`, `setup-stablediffusion-api`, `setup-twitch-api` |
| Context handlers | 3 user menus and 4 message menus |
| CLI handlers | `help`, `ping`, `setup-stablediffusion-api`, `setup-twitch-api` |
| Registration split | 84 global slash commands; 57 guild slash commands; all seven context entries are guild scoped |
| Reactions | 68, not the draft's 60 |
| Database source | 17 entity files; 12 migration files; exact fields and drift are in the data audit |
| Assets | 96 meme JPG files; 94 badge files (85 SVG + 9 PNG); one extensionless icons file |
| Tests | 205 `src/**/*.spec.ts` files plus one `test/app.e2e-spec.ts`; source presence only, no passing baseline asserted |

Directory counts: AI 2, anime 5, economy 2, games 3, general 4, giveaway 5, guild 10, meme 11, moderation 6, music 17, reactions 68, stablediffusion 3, twitch 5. `freegames` lives in the guild directory but declares category `general`; metadata counts are therefore general 5 / guild 9. The loader uses directory names to choose registration scope.

Several draft command names were wrong: actual identifiers are `high-low`, `guildinfo`, `memberinfo`, `freegames`, and `alwaysbeen`. Giveaway slash commands are separate `giveaway-create`, `giveaway-delete`, `giveaway-edit`, `giveaway-end`, and `giveaway-reroll` commands; spaced names are prefix aliases. Reactions include `stopit` and `shout`, not reaction commands named `stop` or `scream`. `stop` belongs to music.

## 2. Complete command contract index

The source link on each command is its definition. Slash notation lists nested subcommands and exact option names/types; `?` means optional. Prefix examples are verbatim legacy help declarations, **not proof they work**. All legacy aliases must remain accepted when a replacement dispatcher is implemented. Raw regex matching is authoritative for accidental broad matches; do not reproduce unsafe accidental matches as intentional aliases. All commands are pending 2.0 parity verification.

Action: **KEEP** preserves the user-facing feature; **REWORK** preserves its contract while repairing internals; **DEPRECATE WITH COMPATIBILITY PATH** retains the command entry point but replaces unsafe secret persistence. No existing user-facing feature is approved for silent removal.

### ai (2)

| Command / source | Slash options | Legacy prefix examples / aliases | Action |
|---|---|---|---|
| [ai-model](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/ai/ai-model.command.ts) | `set(model:String), pull, pull-default, reset` | ai-model; ai-model set <model>; ai-model pull; ai-model pull-default | REWORK |
| [ai](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/ai/ai.command.ts) | `prompt:String` | ai <prompt> | REWORK |

### anime (5)

| Command / source | Slash options | Legacy prefix examples / aliases | Action |
|---|---|---|---|
| [anime-character](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/anime/anime-character.command.ts) | `search:String` | anime-character <search> | REWORK |
| [anime](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/anime/anime.command.ts) | `search:String` | anime <search> | REWORK |
| [manga](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/anime/manga.command.ts) | `search:String` | manga <search> | REWORK |
| [waifu](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/anime/waifu.command.ts) | `(none)` | waifu | REWORK |
| [wallpaper](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/anime/wallpaper.command.ts) | `search:String` | wallpaper <keyword> | REWORK |

### economy (2)

| Command / source | Slash options | Legacy prefix examples / aliases | Action |
|---|---|---|---|
| [balance](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/economy/balance.command.ts) | `(none)` | balance; bal; money; coins; aliases: bal, money, coins | REWORK |
| [profile](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/economy/profile.command.ts) | `set-banner(url:String), view(user?:User)` | profile | REWORK |

### games (3)

| Command / source | Slash options | Legacy prefix examples / aliases | Action |
|---|---|---|---|
| [coin-flip](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/games/coin-flip.command.ts) | `(none)` | coin-flip | REWORK |
| [dice](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/games/dice.command.ts) | `(none)` | dice | REWORK |
| [high-low](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/games/highlow.command.ts) | `(none)` | high-low | REWORK |

### general (5)

| Command / source | Slash options | Legacy prefix examples / aliases | Action |
|---|---|---|---|
| [get-avatar](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/general/get-avatar.command.ts) | `user?:User` | get-avatar | REWORK |
| [help](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/general/help.command.ts) | `command?:String` | help <command> | REWORK |
| [ping](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/general/ping.command.ts) | `(none)` | ping | REWORK |
| [reminder](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/general/reminder.command.ts) | `set(time:String, message:String), list, cancel(id:String)` | remindme 1h Take a break; remindme 30m Check the oven; remindme 2d Call mom; remindme 2023-12-25 08:00 Open presents; aliases: remindme | REWORK |
| [freegames](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/guild/free-games.command.ts) | `show, setchannel(channel:Channel), remove` | freegames; freegames setchannel #channel; freegames remove | REWORK |

### giveaway (5)

| Command / source | Slash options | Legacy prefix examples / aliases | Action |
|---|---|---|---|
| [giveaway-create](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/giveaway/create.command.ts) | `prize:String, winners:Integer, duration:String, channel:Channel` | giveaway-create; giveaway create; gcreate; aliases: giveaway create, gcreate | REWORK |
| [giveaway-delete](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/giveaway/delete.command.ts) | `message_id:String` | giveaway-delete <message_id>; giveaway delete <message_id>; gdelete <message_id>; aliases: giveaway delete, gdelete | REWORK |
| [giveaway-edit](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/giveaway/edit.command.ts) | `message_id:String, prize:String, winners:Integer, duration:String` | giveaway-edit; giveaway edit; gedit; aliases: giveaway edit, gedit | REWORK |
| [giveaway-end](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/giveaway/end.command.ts) | `message_id:String` | giveaway-end <messageid>; giveaway end <messageid>; gend <messageid>; aliases: giveaway end, gend | REWORK |
| [giveaway-reroll](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/giveaway/reroll.command.ts) | `message_id:String` | giveaway-reroll <messageid>; giveaway reroll <messageid>; greroll <messageid>; aliases: giveaway reroll, greroll | REWORK |

### guild (9)

| Command / source | Slash options | Legacy prefix examples / aliases | Action |
|---|---|---|---|
| [create-reaction-role](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/guild/create-reaction-role.command.ts) | `message-id:String, emoji:String, role:Role` | create-reaction-role <message-id> <emoji> <role> | REWORK |
| [farewell](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/guild/farewell.command.ts) | `status, enable, disable, bg(image:String), channel(channel:Channel)` | farewell status; farewell enable; farewell disable; farewell bg [background image]; farewell channel [channel id] | REWORK |
| [guildinfo](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/guild/guild-info.command.ts) | `(none)` | guildinfo; info; aliases: info | REWORK |
| [karma](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/guild/karma.command.ts) | `server(enable-server, disable-server), enable, disable, view` | karma; karma enable; karma disable; karma enable-server; karma disable-server | REWORK |
| [memberinfo](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/guild/member-info.command.ts) | `user?:User` | memberinfo; memberinfo @user; userinfo; userinfo @user; aliases: userinfo | REWORK |
| [prefix](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/guild/prefix.command.ts) | `newprefix?:String` | prefix; prefix <prefix>; setprefix <prefix>; aliases: setprefix | REWORK |
| [reaction-roles](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/guild/reaction-roles.command.ts) | `list, remove(id:String)` | reaction-roles; reaction-roles remove <id> | REWORK |
| [setup-avc](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/guild/setup-avc.command.ts) | `(none)` | setup-avc; set-avc; aliases: set-avc | REWORK |
| [welcomer](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/guild/welcomer.command.ts) | `status, enable, disable, bg(image:String), channel(channel:Channel)` | welcomer status; welcomer enable; welcomer disable; welcomer bg [background image]; welcomer channel [channel id] | REWORK |

### meme (11)

| Command / source | Slash options | Legacy prefix examples / aliases | Action |
|---|---|---|---|
| [0days](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/meme/0days.command.ts) | `text1:String, text2?:String` | BROKEN: 0days <text1> <text2> | REWORK |
| [allmyhomies](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/meme/allmyhomies.command.ts) | `text1:String, text2?:String` | BROKEN: allmyhomies <text1> [text2] | REWORK |
| [alwaysbeen](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/meme/always-been.command.ts) | `text1:String, text2?:String` | BROKEN: alwaysbeen <text1> <text2> | REWORK |
| [american-chopper](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/meme/american-chopper.command.ts) | `text1:String, text2?:String, text3?:String, text4?:String, text5?:String` | BROKEN: american-chopper <text1> <text2> | REWORK |
| [chad](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/meme/chad.command.ts) | `text1:String, text2?:String` | BROKEN: chad <text1> <text2> | REWORK |
| [everywhere](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/meme/everywhere.command.ts) | `text1:String, text2?:String` | BROKEN: everywhere <text1> <text2> | REWORK |
| [getting-paid](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/meme/getting-paid.command.ts) | `text1:String, text2?:String` | BROKEN: getting-paid <text1> <text2> | REWORK |
| [got-any-more](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/meme/got-any-more.command.ts) | `text1:String, text2?:String` | BROKEN: got-any-more <text1> <text2> | REWORK |
| [train-bus](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/meme/train-bus.command.ts) | `text1:String, text2?:String` | BROKEN: undertaker <text1> <text2> | REWORK |
| [undertaker](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/meme/undertaker.command.ts) | `text1:String, text2?:String` | BROKEN: undertaker <text1> <text2> | REWORK |
| [woman-yelling-at-cat](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/meme/woman-yelling-at-cat.command.ts) | `text1:String, text2?:String` | BROKEN: woman-yelling-at-cat <text1> <text2> | REWORK |

### moderation (6)

| Command / source | Slash options | Legacy prefix examples / aliases | Action |
|---|---|---|---|
| [admin-note](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/moderation/admin-note.command.ts) | `add(user:User, notes:String), remove(user:User), list(user:User)` | admin-note add @user <notes>; admin-note remove @user; admin-note list @user; note add @user <notes>; note remove @user; note list @user; aliases: note | REWORK |
| [ban](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/moderation/ban.command.ts) | `user:User` | ban @user | REWORK |
| [delete](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/moderation/delete.command.ts) | `amount:Integer` | delete 5; del 10; aliases: del | REWORK |
| [kick](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/moderation/kick.command.ts) | `user:User` | kick @user | REWORK |
| [lock](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/moderation/lock.command.ts) | `(none)` | lock | REWORK |
| [unlock](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/moderation/unlock.command.ts) | `(none)` | unlock | REWORK |

### music (17)

| Command / source | Slash options | Legacy prefix examples / aliases | Action |
|---|---|---|---|
| [back](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/music/back.command.ts) | `(none)` | back; previous; aliases: previous | REWORK |
| [filter](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/music/filter.command.ts) | `(none)` | filter; filter <filter name> | REWORK |
| [join](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/music/join.command.ts) | `(none)` | join | REWORK |
| [leave](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/music/leave.command.ts) | `(none)` | leave | REWORK |
| [lyrics](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/music/lyrics.command.ts) | `song?:String` | lyrics; lyrics <songname> | REWORK |
| [mute](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/music/mute.command.ts) | `(none)` | mute | REWORK |
| [pause](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/music/pause.command.ts) | `(none)` | pause | REWORK |
| [play](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/music/play.command.ts) | `music(name:String), playlist(name:String)` | play; play <song name> | REWORK |
| [playlist](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/music/playlist.command.ts) | `create(name:String, public:Boolean), delete(name:String), add-music(playlist-name:String, name:String), delete-music(playlist-name:String, name:String), list(name:String), lists` | No prefix handler. CLI/help text: playlist | REWORK |
| [playtop](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/music/playtop.command.ts) | `song:String` | playtop; playtop <song name> | REWORK |
| [queue](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/music/queue.command.ts) | `(none)` | queue | REWORK |
| [repeat](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/music/repeat.command.ts) | `(none)` | repeat | REWORK |
| [rewind](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/music/rewind.command.ts) | `time:Integer` | rewind; rewind <time in second> | REWORK |
| [setup-music](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/music/setup-music.command.ts) | `(none)` | setup-music | REWORK |
| [skip](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/music/skip.command.ts) | `(none)` | skip | REWORK |
| [stop](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/music/stop.command.ts) | `(none)` | stop | REWORK |
| [volume](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/music/volume.command.ts) | `volume:Integer` | volume; volume <number> | REWORK |

### reactions (68)

| Command / source | Slash options | Legacy prefix examples / aliases | Action |
|---|---|---|---|
| [airkiss](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/airkiss.command.ts) | `target?:User` | airkiss @user | KEEP |
| [angrystare](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/angrystare.command.ts) | `target?:User` | angrystare @user | KEEP |
| [bite](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/bite.command.ts) | `target?:User` | bite @user | KEEP |
| [bleh](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/bleh.command.ts) | `target?:User` | bleh @user | KEEP |
| [blush](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/blush.command.ts) | `target?:User` | blush @user | KEEP |
| [brofist](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/brofist.command.ts) | `target?:User` | brofist @user | KEEP |
| [celebrate](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/celebrate.command.ts) | `target?:User` | celebrate @user | KEEP |
| [cheers](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/cheers.command.ts) | `target?:User` | cheers @user | KEEP |
| [clap](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/clap.command.ts) | `target?:User` | clap @user | KEEP |
| [confused](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/confused.command.ts) | `target?:User` | confused @user | KEEP |
| [cool](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/cool.command.ts) | `target?:User` | cool @user | KEEP |
| [cry](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/cry.command.ts) | `target?:User` | cry @user | KEEP |
| [cuddle](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/cuddle.command.ts) | `target?:User` | cuddle @user | KEEP |
| [dance](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/dance.command.ts) | `target?:User` | dance @user | KEEP |
| [drool](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/drool.command.ts) | `target?:User` | drool @user | KEEP |
| [evillaugh](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/evillaugh.command.ts) | `target?:User` | evillaugh @user | KEEP |
| [facepalm](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/facepalm.command.ts) | `target?:User` | facepalm @user | KEEP |
| [handhold](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/handhold.command.ts) | `target?:User` | handhold @user | KEEP |
| [happy](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/happy.command.ts) | `target?:User` | happy @user | KEEP |
| [headbang](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/headbang.command.ts) | `target?:User` | headbang @user | KEEP |
| [hug](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/hug.command.ts) | `target?:User` | hug @user | KEEP |
| [kiss](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/kiss.command.ts) | `target?:User` | kiss @user | KEEP |
| [laugh](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/laugh.command.ts) | `target?:User` | laugh @user | KEEP |
| [lick](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/lick.command.ts) | `target?:User` | lick @user | KEEP |
| [love](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/love.command.ts) | `target?:User` | love @user | KEEP |
| [mad](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/mad.command.ts) | `target?:User` | mad @user | KEEP |
| [nervous](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/nervous.command.ts) | `target?:User` | nervous @user | KEEP |
| [no](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/no.command.ts) | `target?:User` | no @user | KEEP |
| [nom](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/nom.command.ts) | `target?:User` | nom @user | KEEP |
| [nosebleed](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/nosebleed.command.ts) | `target?:User` | nosebleed @user | KEEP |
| [nuzzle](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/nuzzle.command.ts) | `target?:User` | nuzzle @user | KEEP |
| [nyah](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/nyah.command.ts) | `target?:User` | nyah @user | KEEP |
| [pat](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/pat.command.ts) | `target?:User` | pat @user | KEEP |
| [peek](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/peek.command.ts) | `target?:User` | peek @user | KEEP |
| [pinch](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/pinch.command.ts) | `target?:User` | pinch @user | KEEP |
| [poke](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/poke.command.ts) | `target?:User` | poke @user | KEEP |
| [pout](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/pout.command.ts) | `target?:User` | pout @user | KEEP |
| [punch](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/punch.command.ts) | `target?:User` | punch @user | KEEP |
| [roll](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/roll.command.ts) | `target?:User` | roll @user | KEEP |
| [run](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/run.command.ts) | `target?:User` | run @user | KEEP |
| [sad](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/sad.command.ts) | `target?:User` | sad @user | KEEP |
| [scared](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/scared.command.ts) | `target?:User` | scared @user | KEEP |
| [shout](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/shout.command.ts) | `target?:User` | shout @user | KEEP |
| [shrug](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/shrug.command.ts) | `target?:User` | shrug @user | KEEP |
| [shy](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/shy.command.ts) | `target?:User` | shy @user | KEEP |
| [sigh](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/sigh.command.ts) | `target?:User` | sigh @user | KEEP |
| [sip](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/sip.command.ts) | `target?:User` | sip @user | KEEP |
| [slap](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/slap.command.ts) | `target?:User` | slap @user | KEEP |
| [sleep](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/sleep.command.ts) | `target?:User` | sleep @user | KEEP |
| [slowclap](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/slowclap.command.ts) | `target?:User` | slowclap @user | KEEP |
| [smack](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/smack.command.ts) | `target?:User` | smack @user | KEEP |
| [smile](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/smile.command.ts) | `target?:User` | smile @user | KEEP |
| [smug](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/smug.command.ts) | `target?:User` | smug @user | KEEP |
| [sneeze](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/sneeze.command.ts) | `target?:User` | sneeze @user | KEEP |
| [sorry](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/sorry.command.ts) | `target?:User` | sorry @user | KEEP |
| [stare](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/stare.command.ts) | `target?:User` | stare @user | KEEP |
| [stopit](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/stopit.command.ts) | `target?:User` | stopit @user | KEEP |
| [surprised](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/surprised.command.ts) | `target?:User` | surprised @user | KEEP |
| [sweat](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/sweat.command.ts) | `target?:User` | sweat @user | KEEP |
| [thumbsup](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/thumbsup.command.ts) | `target?:User` | thumbsup @user | KEEP |
| [tickle](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/tickle.command.ts) | `target?:User` | tickle @user | KEEP |
| [tired](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/tired.command.ts) | `target?:User` | tired @user | KEEP |
| [wave](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/wave.command.ts) | `target?:User` | wave @user | KEEP |
| [wink](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/wink.command.ts) | `target?:User` | wink @user | KEEP |
| [woah](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/woah.command.ts) | `target?:User` | woah @user | KEEP |
| [yawn](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/yawn.command.ts) | `target?:User` | yawn @user | KEEP |
| [yay](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/yay.command.ts) | `target?:User` | yay @user | KEEP |
| [yes](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/reactions/yes.command.ts) | `target?:User` | yes @user | KEEP |

### stablediffusion (3)

| Command / source | Slash options | Legacy prefix examples / aliases | Action |
|---|---|---|---|
| [imagine](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/stablediffusion/imagine.command.ts) | `prompt:String` | imagine; imagine <something> | REWORK |
| [setup-stablediffusion-api](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/stablediffusion/setup-stablediffusion-api.command.ts) | `(none)` | No prefix handler. CLI/help text: setup-stablediffusion-api --api-token <api-token> | DEPRECATE WITH COMPATIBILITY PATH |
| [stablediffusion-model](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/stablediffusion/stablediffusion-model.command.ts) | `set(model:String)` | stablediffusion-model; stablediffusion-model set <model> | REWORK |

### twitch (5)

| Command / source | Slash options | Legacy prefix examples / aliases | Action |
|---|---|---|---|
| [setup-twitch-api](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/twitch/setup-twitch-api.command.ts) | `(none)` | No prefix handler. CLI/help text: setup-twitch-api --client-id <client-id> --client-secret <client-secret> | DEPRECATE WITH COMPATIBILITY PATH |
| [setup-twitch](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/twitch/setup-twitch.command.ts) | `channel:Channel` | setup-twitch; setup-twitch <channel> | REWORK |
| [subscribe](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/twitch/subscribe.command.ts) | `streamer:String` | subscribe; subscribe <twitch username> | REWORK |
| [twitch-status](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/twitch/twitch-status.command.ts) | `(none)` | twitch-status | REWORK |
| [unsubscribe](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/twitch/unsubscribe.command.ts) | `streamer:String` | unsubscribe; unsubscribe <twitch username> | REWORK |

### Context menus and component routes

- `View profile` — user menu for `profile`.
- `Ping from user context` — user menu for `ping`.
- `Ping from chat context` — message menu for `ping`.
- `End giveaway` — message menu for `giveaway-end`.
- `Reroll giveaway` — message menu for `giveaway-reroll`.
- `View admin notes` — user menu for `admin-note`.
- `View admin notes` — message menu for `admin-note`.

Global routing recognizes buttons and modal submissions; select menus are handled by per-message collectors in menu helpers. There is no explicit autocomplete branch. Static button and modal maps are preserved in the manifest. Music/filter, wallpaper/anime, image-generation follow-up, help/pagination, and giveaway flows also create temporary collectors; those cannot be recovered after a process restart.

## 3. Runtime, dispatch, events, and API

[Bootstrap](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/main.ts) starts a Nest HTTP application on `app.port`, binds `0.0.0.0`, enables URI versioning, publishes Swagger at `/docs`, connects Discord, registers events and application commands, and starts a readline CLI. There is no implemented dashboard or OAuth login/session boundary. `uncaughtException` is logged; graceful shutdown ownership is not established here.

[Command loading](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/util/command/commands-loader.util.ts) recursively requires `.command.ts` or `.command.js` files, instantiates shared mutable command objects, and registers slash/user/message definitions. Its module-level command arrays accumulate when loading repeats. [Dispatch](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/command.service.ts) scans arrays for prefix and slash/context matches. Prefix parsing looks up the guild row per message, strips the configured prefix, mutates `message.content`, and stores `params`/`allParams` on the command instance. Concurrent users can overwrite those fields across awaits. Command execution wrappers call async handlers without awaiting them, so their surrounding try/catch does not catch asynchronous rejections. Unknown prefixes return a command-not-found embed. Prefix DMs are ignored; handlers frequently assume guild/member context.

The permission helper accepts string permission names; reaction-role commands instead declare `PermissionFlagsBits.Administrator`, which does not match that lookup representation. Many configuration commands have no declared permission metadata. Owner-only API setup checks occur in their slash and modal methods. Required bot permissions, channel overrides, role allowlists, per-command enablement, and cooldown middleware do not exist as a unified pipeline. [Permission source](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/util/features/permissions.util.ts).

| Event source | Observed behavior | 2.0 action |
|---|---|---|
| `ready.event.ts` | Logs readiness and initial guild/member information; see source for startup DB initialization | REWORK into explicit awaited startup |
| `message-create.event.ts` | Ignores bots; sequential prefix dispatch, music-channel input handling, then economy message rewards | REWORK with independent failure boundaries and immutable request context |
| `interaction-create.event.ts` | Buttons, modals, then slash/context dispatch | REWORK with typed branches, acknowledgment state, autocomplete, component ownership |
| `voice-state-update.event.ts` | Calls auto-voice cleanup/create behavior | REWORK with per-guild coordination |
| `guild-member-add.event.ts` / `guild-member-remove.event.ts` | Guild-configured welcome/farewell cards | KEEP cards and configuration names; REWORK rendering and failures |
| `guild-create.event.ts` | Registers guild application commands on join | KEEP, await and reconcile registration |
| `message-reaction-add.event.ts` / `message-reaction-remove.event.ts` | Fetches partials and applies/removes configured emoji roles | KEEP emoji behavior; REWORK permissions, persistence constraints, partial handling |

All nine event source files are under [src/discord/events](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/discord/events).

HTTP declarations: root service information; economy user-count information with intended `/economy` and version `1`; `/discord/invite` redirect; version `1` `/discord/get-invite`; Swagger `/docs`. The root/economy/Discord controllers contain duplicate `@Controller` decorators, so intended path/version annotations are not a verified effective routing table. Verify the running route map before defining compatibility redirects. No authentication guards are present on these informational controllers. Preserve response contracts where useful, add explicit health/readiness endpoints, and keep the future admin API behind authorization.

## 4. Domain behavior and migration decisions

The following summary uses the requested feature/implementation/commands/data/API/behavior/action columns. Paths are relative to the pinned source checkout; exact command sources and fields are linked above and in the two manifests.

| Feature | Existing implementation | Existing commands | Existing database structures | Existing APIs | Existing behavior | Keep/replace/rework |
|---|---|---|---|---|---|---|
| Dispatch/help/CLI | `src/command`, `src/cli`, loader utilities | All 141; help/ping plus CLI handlers | guild prefix; configuration | Discord REST/Gateway; readline | Mutable shared command instances; prefix/slash/context routing; paginated help | REWORK |
| AI conversations/models | `src/ai`, `src/command/ai` | ai, ai-model | guild_config model; conversation RAM | Ollama, Google, OpenRouter, OpenAI | Streaming; user-only memory key; unfinished post-reply music action | REWORK |
| Anime/manga/images | `src/command/anime` | anime, anime-character, manga, waifu, wallpaper | No dedicated entity | Jikan, waifu.im, wallpaper sources | Search/selection/attribution and random images | KEEP interfaces; REWORK adapters |
| Coins/XP/rank/profile | `src/economy`, economy commands, card utilities | balance, profile, karma | user global coins/karma and profile fields | Discord avatar/badge metadata | Message rewards, level/profile rendering, no transaction ledger | REWORK |
| Item rarity | economy item extension | Background message reward path | item, item_category; no owned inventory | None | Logs candidate rarity; ownership insertion unfinished | REWORK |
| Mini-games | `src/command/games` | coin-flip, dice, high-low | No persisted game state | None | Random draws; high-low reply is not graded | KEEP names; REWORK |
| Giveaways | `src/giveaways`, giveaway commands | giveaway-create/delete/edit/end/reroll; spaced prefix aliases | External giveaways.json | Discord reactions/messages | Collector wizards, winners and flat-file state | REPLACE persistence; KEEP interfaces |
| Guild settings/info | guild commands | prefix/setprefix, guildinfo, memberinfo, karma | guild, guild_config, user | Discord guild/member metadata | Custom prefix and info/preferences | REWORK |
| Welcome/farewell | guild commands; member add/remove events; card utilities | welcomer, farewell | guild_config enabled/channel/background keys | Discord; remote backgrounds | Configured join/leave card delivery | KEEP interfaces; REWORK |
| Reaction roles | `src/reaction-role`, reaction events | create-reaction-role, reaction-roles | reaction_role | Discord emoji/message/role APIs | Emoji adds/removes mapped roles | REWORK |
| Auto voice | `src/avc`, voice event | setup-avc | voice_channel | Discord voice/channel APIs | Parent join creates owned child and empty channels are deleted | REWORK |
| Music | `src/music`, music commands | All 17 music commands above | music_channel, playlist, track | DisTube sources; LavaShark/Lavalink; lyrics providers | Queue/playback/buttons, saved playlists, periodic player edits | REPLACE engine after evaluation; KEEP interfaces |
| Moderation/notes | `src/moderation`, moderation commands | admin-note, ban, kick, delete, lock, unlock | user_note; user warning field | Discord moderation/permissions | Notes and direct actions; empty moderation scheduler | REWORK |
| Reactions | `src/command/reactions` shared base | All 68 exact reaction names above | No dedicated entity | OtakuGIFs | Optional target, narration and remote GIF with failure text | KEEP interfaces; REWORK cache/transport |
| Memes/assets | meme commands and canvas utilities | All 11 active meme names above | No dedicated entity | Local 96 JPG templates; canvas | Image/text rendering; broken inherited prefix path | KEEP templates; REPLACE renderer as justified |
| Generated images | stablediffusion commands and helpers | imagine, stablediffusion-model, setup-stablediffusion-api | configuration token; guild_config model; RAM prompts | Replicate | Generate/repeat images without durable jobs | REWORK providers/jobs |
| Stream alerts | `src/twitch` and commands | subscribe, unsubscribe, twitch-status, setup-twitch, setup-twitch-api | stream_subscription, stream_notification, twitch_streamer; config | Twitch OAuth/Helix | Minute polling and incorrectly global stream deduplication | REWORK |
| Free games | `src/free-games`, guild freegames command | freegames | free_game_notification; guild_config target | Epic promotions JSON; Steam scraping | Hourly announcements and prematurely stored notification flags | REWORK |
| Reminders | `src/reminder` | reminder | reminder | Discord DM/channel delivery | Persistent one-shot reminders; list/cancel; unleased polling | REWORK |
| API setup secrets | owner-only setup commands/modals | setup-twitch-api, setup-stablediffusion-api | configuration plaintext fields | Twitch, Replicate | Persists credentials in legacy DB | DEPRECATE WITH COMPATIBILITY PATH to env/vault |
| HTTP/deployment | `src/api`, Discord/economy controllers, Docker/Render/CI files | informational routes; operator scripts | SQLite path and separate giveaway file | Nest HTTP/Swagger | Informational API/static assets, no authenticated dashboard | REWORK routes/deployment; new dashboard separately |

| Domain | Evidence-based legacy behavior and limits | Decision / compatibility requirements |
|---|---|---|
| AI | Four adapters: Ollama, Google AI, OpenRouter, OpenAI. `ai-model` exposes set/pull/pull-default/reset. `ai` streams, stores unbounded prompts in command RAM keyed only by user ID, and reads guild model only on slash path. | REWORK adapters behind typed contracts; isolate sessions by guild/channel/user, persist bounded memory, preserve OpenRouter, and unify both invocation paths. |
| AI actions | Reply regex finds `🎵...🎵`, but post-reply play only logs “not implemented”; it does not queue music. | REPLACE placeholder with validated, permission-aware tool calls; do not count legacy music tool calling as working parity. |
| Anime | Jikan wrappers support anime/manga/character searches; waifu.im returns image/tag/favorite/artist information; wallpaper offers WallHaven, Wallpapers.com, MoeWalls, Pinterest, ZeroChan choices. | KEEP all five commands and source attribution; REWORK API adapters, paging, timeouts, provider failure handling. AniList/TCG ingestion is new work. |
| Economy | Global user coins/karma; normal non-gibberish messages award 1 each under 10 space-separated words or 2 each otherwise. Coins use read-modify-save without atomic debit protection. Profile renders banner/rank/badges. | REWORK atomic balances, anti-spam limits, scoped XP policy, and card graphics. Bank, daily streaks, marketplace, ledger, user inventory and TCG are not complete legacy features. |
| Item discovery | A 2% message chance logs a rarity; inventory insertion is TODO. Nine labels (Trash through Godly), not the requested new eight-tier TCG design. Integer rounding makes the stated fractional rare tiers inaccurate. | REWORK inventory and RNG from tested contracts. Do not migrate invented item ownership. |
| Games | Coin flip and six-sided dice; `high-low` draws two integers 1–100, waits 15 seconds for one author message, reveals comparison, but never checks whether the reply guessed correctly. | KEEP names; REWORK game state, grading, timeout responses; wagers/Tic-Tac-Toe/RPS are additions. |
| Giveaways | `discord-giveaways` stores `./giveaways.json`; create/edit use message-collector wizards for prefix and structured slash options; end/reroll support message context menus. | REPLACE persistence while importing flat-file state; retain every alias and ownership checks; recover deadlines and active entries. |
| Guild | Custom prefix; welcome/farewell enable/bg/channel/status; karma personal/server notification toggles; auto-voice; reaction roles; info commands; free-games notifications. | KEEP all entry points/config values; REWORK typed settings, manager authorization, role hierarchy, cache invalidation. |
| Moderation | Notes with user/message contexts and modals; ban/kick/delete/lock/unlock. Scheduler is an empty every-minute method. Ban/kick do not take reason options. | REWORK cases/warnings/escalations; adding reasons is compatible expansion. Retain note authors/timestamps. Automated filters and case history are new work. |
| Music | Selects LavaShark only when `MUSIC_PLAYER=lavashark`, otherwise DisTube. DisTube registers YouTube, Spotify, SoundCloud, Deezer plugins. Persistent music-channel UI refresh every 10 seconds. | REPLACE backend as needed after provider validation; preserve Deezer as well as requested sources; move updates to player events, with bounded progress refresh if desired. |
| Music controls | Slash `play music name` and `play playlist name`; plain prefix `play <query>` only. Playlist CRUD/add/delete/list with 300 playlist and 300 track limits, slash-only. 15 filter buttons. | REWORK parity for playlists, seeking, queue/history, buttons; retain exact slash option names and add prefix equivalents. LavaShark `createPlaylist` explicitly throws not implemented. |
| Reactions | All 68 inherit OtakuGIFs request behavior, optional target user, self/no-target narration, image-fetch fallback text. | KEEP every exact name and narration; use metadata instead of copy/paste; add bounded response cache and retries. |
| Meme rendering | Eleven active templates use canvas; 96 JPGs are present. Prefix inherits a call to an absent base method and regexes reject documented text arguments. | KEEP all active templates/assets, REPLACE renderer as appropriate, implement usable prefix input. `train-bus` help incorrectly says undertaker. |
| Image generation | Replicate client uses DB token; guild `stablediffusion_model`, default `luma/photon`; repeated-image select menu with RAM prompt state. No durable job queue. | REPLACE backend abstraction, persist jobs/status, preserve `imagine` and model selection. Secret commands retain owner-only entry points and migrate to vault/env without printing secrets. |
| Twitch | OAuth client credentials, minute polling of Helix streams, subscriptions, 1280×720 thumbnail URL substitution, database notifications. | REWORK resilient token refresh, per-channel dedup, rate limits and thumbnails; keep Twitch and evaluate required TikTok/Facebook access independently; YouTube is a future optional adapter. |
| Free games | Epic promotion JSON + Steam Cheerio search-page scraping, current/upcoming Epic labeling, guild notification history; hourly scheduler calls the command singleton. | REWORK into a service independent of commands, provider-specific errors, deliver-then-record recovery. No GOG implementation found. |
| Reminders | DB-backed one-shot reminders; relative minutes/hours/days or date parsing via JS Date, up to one year ahead; 30-second scan; DM delivery with original-channel fallback; owner-scoped list/cancel. | KEEP stored reminders; REWORK durable claiming, retries, timezone parsing. No chrono dependency or recurring reminder implementation. |
| Auto voice | Parent marker `parentId='0'`; creates username channel, clones join-channel overwrites, grants creator management, moves creator, deletes empty children on voice changes. | KEEP permission cloning and parent/child semantics; REWORK startup reconciliation and create/delete race handling. |
| Reaction roles | Persists emoji/message/role/guild mappings; validates bot role position; add/remove reaction events mutate member roles. | KEEP emoji roles, add buttons as new compatible surface, scope deletion and enforce shared permission contracts. |

Representative domain sources: [AI adapters](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/ai/ai.service.ts), [AI state](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/command/ai/ai.command.ts), [AI placeholder](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/ai/actions/post-reply.actions.ts), [karma](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/economy/karma/karma.extension.ts), [items](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/economy/items/items.extension.ts), [DisTube](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/music/adapters/distube.adapter.ts), [LavaShark](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/music/adapters/lavashark.adapter.ts), [music timers](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/music/music.service.ts), [giveaway storage](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/giveaways/giveaways.service.ts), [Twitch](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/twitch/twitch.service.ts), [reminders](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/reminder/reminder.service.ts), [auto voice](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/avc/avc.service.ts). Each command source above provides its full input and error behavior.

## 5. Concrete defects to resolve before parity certification

1. **Async dispatch and shared mutable parameters:** await handlers and pass immutable invocation arguments; test concurrent calls to the same command.
2. **Slash moderation type mismatch:** ban/kick retrieve a `User` then use member-only `bannable`/`kickable`/ban/kick members. Fetch `GuildMember` and check both moderator and bot hierarchy. `delete` checks ManageChannels, accepts 100, then calls `bulkDelete(amount + 1)` on both paths; correct permissions/count semantics and old-message handling.
3. **Permission representation mismatch:** permission helper maps string keys, while reaction-role commands use bigint flags. Normalize contracts. Giveaway create slash path lacks the prefix wizard's ManageMessages/Giveaways-role gate; configuration routes likewise require explicit manager policy.
4. **Twitch dedup scope:** comparison uses only `streamId` across all notification rows. A notification already recorded for one guild/channel can suppress future delivery to another. Key by provider/stream/guild/channel and track retries.
5. **Free-game delivery ordering:** notification rows are marked notified while collecting games, before channel send. A send failure can permanently suppress the alert. Separate pending/claimed/sent states.
6. **Reminder duplicate delivery and parsing:** scans have no atomic claim; restart/concurrent sends can duplicate messages. Prefix parser captures time only to the next space, so the documented `YYYY-MM-DD HH:mm` form splits differently from slash. Enforce actual timezone/calendar validation and preserve pending rows.
7. **Model/stream mismatches:** AI prefix ignores guild model; initial reply fetch races streaming edits; user-only RAM history crosses guild/channel contexts. Capture sessions and await reply state. Several music methods pass objects to adapter methods expecting guild IDs, and LavaShark cannot create playlists.
8. **Prefix holes:** playlist/setup-secret handlers absent; 11 meme handlers broken. Fix deliberate compatibility gaps instead of asserting 100% parity from method counts.
9. **Secret exposure:** setup CLI prints parsed credential arguments; DB fields are plaintext. Redact all logs and use encrypted vault/environment migration. Source also mixes `APPLICATION_ID` and `DISCORD_APPLICATION_ID` in configuration lookup.
10. **Economy and state:** unbounded per-user arrays/collectors, no atomic coin debit floor, no cooldown around XP, item ownership TODO. Persist real state and test insufficient-funds/concurrency boundaries. No functioning eight-tier TCG exists in this source.
11. **Lock restoration:** unlock writes SendMessages=true rather than restoring prior overwrite; permission edits are not awaited. Persist original states and await changes.
12. **Configuration drift:** `.env.example` says DISABLE_YOUTUBE=true, but no production source reads that variable and DisTube always registers YouTube. Do not present it as an effective safety/configuration switch.

These are source-derived defects or risks, not measurements of live failures. Fixes should preserve valid legacy entry points while giving actionable errors for formerly broken calls.

## 6. Persistence, settings, schedulers, and assets

Use [legacy-data-manifest.json](legacy-data-manifest.json) and [migration-1.x-to-2.0.md](migration-1.x-to-2.0.md) for exact entity columns, relations, migration history, constraints, and deployment drift. The earlier invented entity field lists are deliberately removed from this inventory. No real legacy database or `giveaways.json` production file was supplied; data completeness cannot yet be certified.

Guild configuration keys observed in handlers include `ai_model`, `stablediffusion_model`, `twitch_channel`, `welcomer_enabled`, `welcomer_bg`, `welcomer_channel`, `farewell_enabled`, `farewell_bg`, `farewell_channel`, `karma-notification-enabled`, and `freeGamesChannelId`. Preserve unknown keys during migration as well as these known keys; string values use inconsistent conventions (`true/false` and `enabled/disabled`).

| Scheduled work | Source cadence | Durable state / recovery concern |
|---|---|---|
| Twitch | EVERY_MINUTE | DB subscription/notification rows; retries/token state in RAM |
| Free games | EVERY_HOUR | DB notification rows; marked before successful send |
| Reminders | EVERY_30_SECONDS | DB pending rows; no claim/lease boundary |
| Moderation | EVERY_MINUTE | Empty method, no actual work |
| Music UI | 10,000 ms per tracked guild | RAM intervals; channel fetch/message edits |
| Giveaways | library-managed scheduler | Flat file `./giveaways.json` |
| Interactive collectors | e.g. high-low 15s, filters 60s, giveaway wizard 120s | RAM only; lose sessions on restart |

The command manifest includes every asset path, byte size, and SHA-256. Keep all 96 meme source images, not only the 11 currently wired templates. `assets/badges` contains SVG/PNG variations used by rank rendering; image transforms live in `src/util/banner`, `src/util/image`, `src/util/discord/badges.util.ts`, and meme base. `public/index.html` is the sole public file. No bundled custom font files are present in this snapshot. Review upstream/third-party attribution when redistributing images; this audit does not invent licensing clearance.

## 7. Environment, build, tests, and operator compatibility

| Configuration group | Observed keys |
|---|---|
| App | NODE_ENV, APP_PORT (fallback PORT), npm_package_name/version for root information |
| Discord | DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID, DEFAULT_PREFIX, BOT_OWNER_ID; inconsistent APPLICATION_ID lookup in config service |
| AI | AI_SERVICE_TYPE, AI_SERVICE_API_KEY, AI_SERVICE_BASE_URL, AI_SERVICE_DEFAULT_MODEL |
| Database | DATABASE_TYPE, DATABASE_URL, DATABASE_HOST, DATABASE_PORT, DATABASE_USERNAME, DATABASE_PASSWORD, DATABASE_NAME, DATABASE_SYNCHRONIZE, DATABASE_LOGGING, DATABASE_MAX_CONNECTIONS, DATABASE_SSL_ENABLED, DATABASE_REJECT_UNAUTHORIZED, DATABASE_CA, DATABASE_KEY, DATABASE_CERT |
| Music | MUSIC_PLAYER, LAVALINK_HOST, LAVALINK_PORT, LAVALINK_PASSWORD |
| Example-only switch | DISABLE_YOUTUBE appears in `.env.example` but is not read by application code |
| DB secrets | twitchClientId, twitchClientSecret, stableDiffusionApiToken via Configuration; preserve credential usability through a secure migration path |

Runtime package declares NestJS 10.4, Discord.js 14.19, TypeORM 0.3, DisTube 5 and LavaShark 2, canvas 3 RC, Axios/Cheerio, Ollama, Replicate, native voice and SQLite modules. These are recorded legacy dependency ranges, not recommendations or claims of current support. Consult [dependency-evaluation.md](dependency-evaluation.md) for replacement research.

`tsconfig.json` emits CommonJS/ES2021 and explicitly disables strictNullChecks and noImplicitAny. Build uses Nest plus Unix `cp`; test:ci uses Unix cp/mkdir/mv, Jest forceExit and coverage. Docker is a single Node 22 slim image that installs compilation/image/audio system packages, uses npm install, builds, then runs migrations and seed before starting. Production/development Compose, render.yaml, upgrade bash script, Hygen generators, package-lock, `.eslintrc.js`, and Prettier config are present. CI is CircleCI; `.github` contains Dependabot only, no GitHub Actions workflows. The old lint command auto-fixes files.

The 205 source specs cover a mixture of metadata checks and mocked behavior; example reaction specs verify names/regex/options while music specs mock adapter behavior. There is one HTTP e2e source. These do not establish real provider/audio/native-library interoperability. Legacy npm scripts were not run because they can mutate source-adjacent files and require a separate disposable execution fixture. The snapshot remains read-only.

## 8. Acceptance checklist for each migrated feature

- [ ] Preserve canonical slash names, nesting, option names, prefix aliases, and documented valid input semantics from the manifest.
- [ ] Implement both invocation paths, owner/member/bot permissions, module/command/channel overrides, cooldowns, and fresh per-call context.
- [ ] Verify success, empty input, malformed input, unauthorized target, missing guild/provider, failure acknowledgment, and restart/concurrency behavior as applicable.
- [ ] Compare persisted source rows/relationships/timestamps against migration receipts and verification output; retain unknown legacy settings.
- [ ] Add Vitest service/command tests and updated Slash + Prefix help; count parity only when tests and required integration checks pass.
- [ ] Track new requested features (dashboard, TCG, expanded games/economy/providers) separately from legacy preservation.
