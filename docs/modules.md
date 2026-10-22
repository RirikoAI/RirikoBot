# Server Modules

This page covers the community features of Ririko: roles, giveaways, support tickets, voice channels, welcome cards, stream alerts, free games, reminders, mini-games, fun commands, and the starboard. Music, AI, economy, moderation and the card game have their own pages.

## 1. Overview

Most features work as soon as the bot is in your server. Some need a few settings first.

| Feature | Dashboard page | Needs setup | Section |
|---|---|---|---|
| Auto roles | Auto Roles | Yes. Pick the roles. | 2.1 |
| Reaction roles | Reaction Roles | Yes. Build a panel. | 2.2 |
| Temporary roles | None (command only) | No | 2.3 |
| Giveaways | Giveaways | No | 3 |
| Support tickets | Tickets | Yes. Pick a category and staff roles. | 4 |
| Auto voice channels | Auto Voice | Yes. Pick a voice channel. | 5 |
| Welcome and farewell cards | Welcome Card, Farewell Card | Yes. Pick a channel. | 6 |
| Stream alerts | Stream Alerts | Yes. Pick a channel, add streamers. | 7 |
| Free games | Free Games | Yes. Pick a channel. | 8 |
| Reminders | None | No | 9 |
| Server settings | General | No | 10 |
| Mini-games | Games | No | 11 |
| Anime, reactions, memes | None | No | 12 |
| Starboard | Starboard | Yes. Pick a channel. | 13 |

To use the dashboard, see [dashboard.md](dashboard.md). To turn a command off, use the **Commands** page. See [commands.md](commands.md).

## 2. Roles

Ririko needs the **Manage Roles** permission. It can only give roles that sit below its own highest role. It cannot give `@everyone` or roles that belong to an integration.

The role commands need **Manage Roles** or **Manage Server** (or **Administrator**).

### 2.1. Auto Roles

Auto roles give roles to new members and bots when they join. They also set up a verification button.

**Turn it on.**

1. Open the dashboard **Auto Roles** page.
2. Pick up to 10 roles for new members.
3. Pick up to 10 roles for new bots.
4. Turn on **Give join roles**.
5. Save.

**Command.** `/autorole`

| Option | Required | What it does |
|---|---|---|
| `action` | Yes | `show`, `humans`, `bots`, `verify`, `disable` or `send-verify`. |
| `role` | For `humans`, `bots`, `verify` | The role to set. |
| `target` | For `disable` | What to turn off: `humans`, `bots`, `both`, `verify` or `all`. |
| `channel` | No | Where `send-verify` posts the button. |
| `message` | No | The text on the verification message. |

To set up verification:

1. Run `/autorole action:verify role:@Verified`.
2. Run `/autorole action:send-verify channel:#verify`.
3. Members click the button to get the role.

### 2.2. Reaction Roles

A reaction role gives a role when a member clicks a button or a reaction.

**Turn it on.** The dashboard has a message builder.

1. Open the **Reaction Roles** page.
2. Write the message. You can add an embed.
3. Add up to 25 role buttons. Or add one role menu with up to 25 options.
4. Pick a click mode: toggle, give only, remove only, or pick one.
5. Check the preview. Then publish.

This page needs a passkey check. See [dashboard.md](dashboard.md). The page also lists every message with roles. You can remove a role or delete a panel.

**Commands.**

`/create-reaction-role` adds a role to a message that already exists.

| Option | Required | What it does |
|---|---|---|
| `message-id` | Yes | The ID of the message. |
| `emoji` | Yes | The emoji or the button label. |
| `role` | Yes | The role to give. |
| `mode` | No | `toggle` (default), `give_only`, `remove_only` or `unique`. |
| `type` | No | `emoji` (default) or `button`. |
| `group` | No | A group name. In a `unique` group, a member keeps one role. |

`/reaction-roles` lists the roles of the server.

| Option | Required | What it does |
|---|---|---|
| `action` | No | `list` or `remove`. |
| `id` | For `remove` | The ID of the reaction role to remove. |

### 2.3. Temporary Roles

A temporary role is removed by Ririko after a set time. There is no dashboard page.

**Command.** `/temprole`

| Option | Required | What it does |
|---|---|---|
| `action` | Yes | `add`, `remove` or `list`. |
| `user` | For `add`, `remove` | The member. |
| `role` | For `add`, `remove` | The role. |
| `duration` | For `add` | How long, such as `30m`, `2h`, `1d` or `1w`. |

## 3. Giveaways

A giveaway has a prize, an end time and a button. Members click the button to enter. Giveaways continue after a restart of the bot.

**Turn it on.** Nothing to turn on. Members with **Manage Messages**, **Manage Server** or **Administrator** can create giveaways.

**Command.** `/giveaway`

| Option | Used by | What it does |
|---|---|---|
| `action` | All | `create`, `end`, `reroll`, `delete`, `edit` or `list`. With no action, Ririko lists the giveaways. |
| `prize` | `create`, `edit` | What you give away. |
| `duration` | `create`, `edit` | Time until the end, such as `30m`, `12h` or `1d`. At least 5 seconds and at most 30 days. |
| `winners` | `create`, `edit`, `reroll` | How many winners. The default is 1. |
| `channel` | `create` | The channel for the giveaway. |
| `role` | `create` | A role that members must have to enter. |
| `giveaway` | `end`, `reroll`, `delete`, `edit` | The message ID or the giveaway ID. |

- `list` is open to everyone. Every other action needs the permissions above.
- You cannot edit a giveaway after it ends.
- You can reroll only a giveaway that has ended.
- The dashboard **Giveaways** page lists running giveaways and the last 25 that ended. You can end one or reroll winners there. Create giveaways in Discord.

Prefix form: `!giveaway create <duration> <winners> <prize>`. The old names `!gcreate`, `!gend`, `!greroll`, `!gdelete`, `!gedit` and `!glist` still work.

## 4. Support Tickets

Support tickets give each member a private channel for help. A member presses **Open Ticket** on a panel and types a subject. Ririko makes a channel for them under a category you pick. Only the member, the staff roles and Ririko can see it. When the ticket closes, Ririko saves a text transcript in a channel of your server and deletes the ticket channel.

**Turn it on.**

1. Open the dashboard **Tickets** page. It is in the Members group.
2. Turn on **Allow tickets**.
3. Pick the **Ticket category**. Ririko creates each ticket channel under it.
4. Pick the **Staff roles**. Members with these roles see every ticket. You can pick up to 10 roles.
5. Pick a **Transcript channel**. If you leave it empty, transcripts go to the log channel from the **Logging** page.
6. Pick how many tickets one member can have open at once (1 to 5, default 1). You can also write a welcome message for new tickets.
7. Save. Then post the panel with `/ticket action:panel` in the channel where members should open tickets.

The panel is a message with one **Open Ticket** button. Only a member with **Manage Server** or **Administrator** can post it. The command refuses when tickets are off or have no category.

**What members do.**

1. Press **Open Ticket**.
2. Type a subject. It is required, and it can be up to 200 characters.
3. Ririko makes a channel named `ticket-0042` under the category. It posts a welcome message with **Claim** and **Close** buttons, and it mentions the member and the staff.
4. Ririko replies with a link to the new channel.

If the member already has as many open tickets as the limit allows, Ririko says so and makes no channel.

**What staff do.**

- **Claim** the ticket with the button or `/ticket action:claim`. Ririko says who is handling it. If someone has already claimed it, Ririko says who.
- Add a member with `/ticket action:add user:@member`. Remove one with `/ticket action:remove user:@member`. The member who opened the ticket cannot be removed, and neither can Ririko.
- Staff are members with a staff role. Members with **Administrator** or **Manage Channels** also count as staff.

**Closing a ticket.**

The member who opened the ticket and the staff can close it. Press **Close** and type an optional reason. Or use `/ticket action:close reason:Solved`.

Then Ririko does this, in order:

1. Builds a transcript. It is a plain text file named `ticket-0042.txt`. The top of the file has the server, the ticket number, the subject, who opened, claimed and closed the ticket, the reason, and the open and close times in UTC. Below that are the messages, oldest first. Attachment links and embed titles are included.
2. Posts the transcript in the transcript channel, or in the log channel when the transcript channel is empty.
3. Marks the ticket closed, and deletes the ticket channel.

Ririko closes the ticket only after the transcript is posted. If the post fails, the ticket stays open, and the person who closed it sees why. Fix the problem, such as a missing permission, and close the ticket again.

If the server has no transcript channel and no log channel, Ririko closes the ticket with no transcript.

A transcript holds up to 5,000 messages. A longer ticket keeps the newest 5,000, and the file says so.

After a close, the channel is deleted. The person who closed the ticket may not see a confirmation message. The transcript in the transcript channel is the record.

If someone deletes a ticket channel by hand, Ririko marks the ticket closed with the reason "Channel deleted". No transcript is made.

Ririko does not keep transcripts. It keeps only the ticket details.

**Permissions.** Ririko needs these permissions.

- In the ticket category: **Manage Channels**, **View Channel** and **Send Messages**.
- In the panel channel: **View Channel**, **Send Messages** and **Embed Links**.
- In the transcript channel, or the log channel: **View Channel**, **Send Messages**, **Embed Links** and **Attach Files**.

**Command.** `/ticket`

| Option | Required | What it does |
|---|---|---|
| `action` | Yes | `panel`, `close`, `claim`, `add` or `remove`. |
| `channel` | No | For `panel`. Where to post the panel. The default is this channel. |
| `message` | No | For `panel`. The text on the panel. Up to 1,000 characters. |
| `reason` | No | For `close`. Up to 500 characters. |
| `user` | For `add` and `remove` | The member. |

- `panel` needs **Manage Server** or **Administrator**.
- `close` works for the opener and the staff. `claim`, `add` and `remove` work for staff.
- Every action except `panel` works only inside a ticket channel.

Prefix form: `!ticket` (or `!tickets`).

- `!ticket panel [#channel] [message]`. Example: `!ticket panel #support Need help?`
- `!ticket close [reason]`. Example: `!ticket close spam`
- `!ticket claim`
- `!ticket add <user>` and `!ticket remove <user>`. Mention the member or give their ID.

## 5. Auto Voice Channels

A member joins a "Join to Create" voice channel. Ririko makes a new voice channel for them and moves them in. When everyone leaves, Ririko deletes the channel. After a restart, Ririko removes channels that were left behind.

**Turn it on.**

1. Open the dashboard **Auto Voice** page.
2. Add a hub (up to 20). Pick the voice channel.
3. Set a name template. Use `{user}` for the member name.
4. Set a user limit and a bitrate.
5. Save.

Or run `/autovoice action:setup channel:<voice channel>`.

**Commands.** `/autovoice` needs **Manage Channels** or **Manage Server**.

| Option | Required | What it does |
|---|---|---|
| `action` | Yes | `setup`, `remove` or `list`. |
| `channel` | For `setup`, `remove` | The "Join to Create" voice channel. |
| `template` | No | The name of new channels. Use `{user}` for the member name. |
| `limit` | No | The user limit. 0 means no limit. The most is 99. |
| `bitrate` | No | The bitrate in bps, such as 64000. Ririko lowers it to what the server allows. |

`/voice` manages your own temporary channel. Only the channel owner can use it. You must be in that channel.

| Option | Required | What it does |
|---|---|---|
| `action` | Yes | `name`, `limit`, `lock`, `permit`, `kick`, `claim` or `transfer`. |
| `name` | For `name` | The new channel name. |
| `limit` | For `limit` | The user limit, 0 to 99. |
| `locked` | For `lock` | `true` locks the channel. `false` unlocks it. |
| `user` | For `permit`, `kick`, `transfer` | The member. |

`claim` lets you take a channel when its owner has left it. The old names `!avc`, `!vname`, `!vlimit`, `!vlock`, `!vunlock`, `!vpermit`, `!vkick`, `!vclaim` and `!vtransfer` still work as prefix commands.

## 6. Welcome and Farewell Cards

Ririko posts a picture card when a member joins or leaves.

**Turn it on.**

1. Open the dashboard **Welcome Card** page. For leaves, open **Farewell Card**.
2. Turn on the card.
3. Pick the channel. Ririko needs to send messages and attach files there.
4. Write the message. It can be up to 200 characters.
5. Pick a text and border color, such as `#ffffff`.
6. Pick a background. Give a link, or upload a file.
7. Check the preview. Then save.

The message can use `{user}`, `{server}` and `{memberCount}`.

- A link must be public and point to a PNG, JPEG, WebP or GIF image.
- An upload can be a PNG, JPEG, WebP or GIF file. It can be up to 2 MB and 4096 pixels on each side. An upload replaces the link, and a link replaces the upload.
- You can also send a text message in the same Discord message as the card. It can be up to 2000 characters. Placeholders: `{user}`, `{username}`, `{server}` and `{memberCount}`. A word like `#rules` that names a channel becomes a channel link. The text never pings `@everyone`, `@here` or roles.

**Commands.** `/welcomer` and `/farewell` need **Manage Server**. They have the same options.

| Option | What it does |
|---|---|
| `channel` | The channel for the card. |
| `message` | The text on the card. Use `{user}`, `{server}` and `{memberCount}`. |
| `background` | A public link to the background image, or `none`. |
| `color` | A hex color for the text and border. |
| `text` | The text message sent with the card, or `none`. |
| `enable` | `true` or `false`. |

The aliases are `/welcome` and `/goodbye`.

## 7. Stream Alerts

Ririko posts a message when a streamer goes live. It supports Twitch, YouTube and TikTok. A server can follow up to 25 streamers.

**Turn it on.**

1. For Twitch alerts, the host sets the Twitch keys. YouTube and TikTok alerts work without keys. See [adapters.md](adapters.md).
2. Open the dashboard **Stream Alerts** page.
3. Add a streamer. Give a name, an `@handle`, a YouTube channel ID or a profile link.
4. Pick the platform, or leave it on automatic.
5. Pick the channel for the alerts.
6. Optional: pick a role to mention, and write your own message.
7. Save.

The message can use `{streamer}`, `{title}`, `{game}`, `{platform}`, `{url}` and `{role}`. It can be up to 1000 characters. Ririko pings only the role you picked.

**Commands.** All actions except `list` need **Manage Server**.

`/stream`

| Option | Used by | What it does |
|---|---|---|
| `action` | All | `subscribe`, `unsubscribe`, `list`, `channel` or `check`. |
| `streamer` | `subscribe`, `unsubscribe` | The name, handle, channel ID or profile link. |
| `platform` | No | `TWITCH`, `YOUTUBE` or `TIKTOK`. |
| `channel` | `subscribe`, `channel` | The channel for the alerts. |
| `role` | No | The role to mention. |
| `custom_message` | No | Your own message. |

- `!subscribe <streamer> [platform]` and `!unsubscribe <streamer> [platform]` are prefix shortcuts.
- `/setup-stream-notification channel:<channel>` sets the default alert channel.
- `/stream-status` lists the followed streamers and shows who is live. Everyone can use it.
- Ririko checks for live streams every minute. The host can change this with `STREAM_CHECK_INTERVAL_MS`.

## 8. Free Games

Ririko announces free games from the Epic Games Store and Steam.

**Turn it on.**

1. Open the dashboard **Free Games** page.
2. Pick the announcement channel. Ririko needs to send messages and embed links there.
3. Optional: pick a role to ping above each announcement.
4. Save. Leave the channel empty to turn the announcements off.

**Command.** `/freegames`

| Option | What it does |
|---|---|
| `action` | `show`, `setchannel` or `remove`. |
| `channel` | The announcement channel (for `setchannel`). |
| `role` | The role to ping. When you leave it out, the old role stays. |

`setchannel` and `remove` need **Manage Server**. `show` is open to everyone.

## 9. Reminders

`/reminder` sets a reminder for you. Ririko sends it as a direct message.

| Option | What it does |
|---|---|
| `time` | When. For example `30m`, `2h`, `tomorrow 9am`, `next friday 8pm` or `2026-12-25 08:00`. Up to 100 characters. |
| `message` | What to remind you about. Up to 500 characters. |
| `repeat` | `none`, `daily` or `weekly`. |
| `action` | `set`, `list`, `cancel` or `timezone`. With a time, the default is `set`. Without one, it is `list`. |
| `id` | The reminder ID to cancel. The list shows it. |
| `zone` | Your time zone, such as `Asia/Kuala_Lumpur`. |

Prefix examples:

- `!remindme 1h take a break`
- `!remindme daily 9am take pills`
- `!reminder list`
- `!reminder cancel <id>`
- `!reminder tz Asia/Kuala_Lumpur`

Limits:

- The time must be in the future and at most 1 year away.
- You can have 25 active reminders.
- Ririko checks for due reminders every 15 seconds.
- If Ririko cannot send a direct message, it posts in the channel where you set the reminder and mentions only you. If that also fails, the reminder is dropped.
- A repeating reminder keeps the same clock time when summer time changes. It skips times missed while the bot was offline.

Ririko reads times in your time zone. If you set none, it uses the time zone of the server. If that is not set either, it uses UTC.

## 10. Server Settings and Information

| Command | What it does |
|---|---|
| `/prefix` | Shows the prefix. `/prefix set:<prefix>` changes it. Needs **Manage Server**. `!setprefix <prefix>` also works. |
| `/timezone` | Shows a time zone. `/timezone set:<zone> scope:server` sets the server zone (**Manage Server**). `scope:user` sets your own zone. |
| `/get-avatar` | Shows the avatar of a member. Options: `user`, and `server_avatar` for the server avatar. |
| `/guild-info` | Shows the server's information and settings. Server only. |
| `/member-info` | Shows a member's profile, roles, permissions and time zone. Option: `user`. Server only. |

The dashboard **General** page sets the prefix and time zone too. Time zone names come from the IANA list, such as `Europe/London` or `UTC`.

## 11. Mini-Games

Mini-games use credits. See [economy.md](economy.md). A wager is optional. When you play with a wager, Ririko takes the credits first. A win pays double the wager. A tie gives the wager back. A loss keeps the credits.

**Turn it on.** The games are on by default. Open the dashboard **Games** page to:

- set the largest wager (empty means no limit),
- turn each game on or off,
- set a cooldown for each game.

| Command | Options | How it works |
|---|---|---|
| `/tictactoe` | `opponent` (required), `wager` | A 3x3 game with buttons. Pick a member to play a person. Pick Ririko to play the AI, which never loses. Each turn has 60 seconds. |
| `/rps` | `opponent`, `wager` | Rock-Paper-Scissors with secret buttons. With no opponent, you play Ririko. |
| `/highlow` | `wager` | Ririko shows a number from 1 to 100. Guess if the next number is higher or lower. A tie gives the wager back. |
| `/coinflip` | `guess` (`heads` or `tails`), `wager` | Flips a coin. A wager needs a guess. |
| `/dice` | `count` (1 to 6), `sides` (2 to 100), `wager` | Rolls dice. With a wager, you and Ririko each roll one six-sided die. The higher roll wins. |

Prefix examples: `!cf heads 100`, `!roll 2`, `!rps @friend 50`.

`/adventure` is a story game with choices. See [adventure-game.md](adventure-game.md).

## 12. Anime, Reactions and Memes

### 12.1. Anime Search

`/anime`, `/manga` and `/anime-character` search for a title or a character. Each has one required option, `search`.

1. Run the command.
2. Pick a result in the menu (up to 10 results).
3. Read the details. Pick another result in the same menu if you want.

Only you can use the menu. It stops working after 2 minutes.

- Ririko asks MyAnimeList (through Jikan) first. If that fails, it asks AniList.
- Adult entries show only in age-restricted channels.
- Ririko remembers search results for 10 minutes.

### 12.2. Waifu Images and Wallpapers

- `/waifu` sends a random safe image from waifu.im. The **Another one** button sends a new image. Only you can use it.
- `/wallpaper search:<keyword>` finds anime wallpapers. Pick a source (WallHaven, Zerochan or Konachan). Ririko shows 3 wallpapers. Then you can load more, switch the source, or stop. Wallpapers are safe for work and never repeat.

### 12.3. Reactions

`/react type:<name> [target:@user]` sends an anime GIF. With no target, it is aimed at you. Start typing in `type` to see the list.

There are 68 reactions: airkiss, angrystare, bite, bleh, blush, brofist, celebrate, cheers, clap, confused, cool, cry, cuddle, dance, drool, evillaugh, facepalm, handhold, happy, headbang, hug, kiss, laugh, lick, love, mad, nervous, no, nom, nosebleed, nuzzle, nyah, pat, peek, pinch, poke, pout, punch, roll, run, sad, scared, shout, shrug, shy, sigh, sip, slap, sleep, slowclap, smack, smile, smug, sneeze, sorry, stare, stopit, surprised, sweat, thumbsup, tickle, tired, wave, wink, woah, yawn, yay, yes.

Each name also works as a prefix command, such as `!hug @friend`. The exception is `roll`, which is also `/dice`. Use `!react roll`. The cooldown is 2 seconds.

### 12.4. Memes

`/meme template:<name> text1:<text> [text2] [text3] [text4] [text5]` makes a meme picture. Start typing in `template` to see the list.

Templates: `0days`, `allmyhomies`, `always-been`, `american-chopper`, `chad`, `everywhere`, `getting-paid`, `got-any-more`, `train-bus`, `undertaker` and `woman-yelling-at-cat`.

- Each template uses its own number of texts. `american-chopper` has up to five panels.
- Prefix forms: `!meme chad text1 | text2` and `!chad text1 | text2`.
- The cooldown is 3 seconds.

## 13. Starboard

The starboard shows the best messages of your server. When a message gets enough stars, Ririko posts a copy of it in a channel you pick. Members can find the highlights there without scrolling. The starboard is off until you pick the channel.

**Turn it on.**

1. Open the dashboard **Starboard** page. It is in the Engagement group. You need the **Manage Server** permission.
2. Pick the **Starboard channel**. Leave it on **Off** to keep the starboard off.
3. Check the **Emoji**. The default is ⭐. You can use any one emoji, or a custom server emoji.
4. Set **Stars needed**, from 1 to 100. The default is 3.
5. Pick **Ignored channels** if some channels should never reach the starboard. You can pick up to 25.
6. Save. The change takes effect at once. Ririko reads the settings again within 5 minutes at the latest.

For a custom server emoji, type its text as `<:name:id>` (animated: `<a:name:id>`). To get that text, type a backslash before the emoji in Discord, like `\:name:`, and send. Keycap emoji such as 1️⃣ are not accepted. There is no command for the starboard. With the command line, the keys are `starboard.channelId`, `starboard.emoji`, `starboard.threshold`, `starboard.allowSelfStar` and `starboard.ignoredChannelIds`. Saves show in the Audit Log as "Starboard settings changed".

**How stars are counted.**

- Only the emoji you chose counts. Other reactions do not.
- Stars are counted on the original message. Stars on the copy do not count.
- The author's own star does not count. To count it, turn on **Count the author's own star**.
- Stars from bots never count, and neither does Ririko's own reaction.
- Ririko checks a message when someone adds or removes a star on it. Stars given while Ririko was offline are counted at the next change. Old messages work too.

**When a copy is posted, updated and removed.**

- **Posted.** When a message reaches the number of stars, Ririko posts one copy. It posts only once for a message, even when many stars arrive at the same time.
- **Updated.** The line above the copy shows the emoji, the stars and the channel, such as `⭐ 5 | #general`. It changes when stars are added or removed.
- **Removed when stars fall.** If the stars fall below the number needed, Ririko deletes the copy. If the message gets enough stars again later, Ririko posts a new copy.
- **Removed with the original.** When the original message is deleted, Ririko deletes the copy too. This includes a bulk delete.
- **Not updated for edits.** The copy shows the message as it was when posted. If the author edits the original later, the copy does not change.
- **Turning it off.** If you choose **Off**, new stars are ignored. Copies already posted stay, and their counts stop changing.

**What the copy shows.** The copy is an embed with the author's name (the server nickname, if there is one) and avatar, the text of the message (cut to 4,096 characters), the first image, the names of other attachments, and a **Source** line with the channel and a **Jump to message** link. The embed has the time of the original message. Mentions inside the copy never ping anyone.

**What is skipped.** Ririko never posts:

- messages in the starboard channel itself,
- messages in the ignored channels, and in the threads under them,
- messages from an age-restricted (NSFW) channel, or a thread of one, when the starboard channel is not age-restricted too,
- messages from webhooks, system messages (such as "member joined"), and direct messages,
- anything at all, when the starboard channel was deleted or is not a text channel.

**If staff delete a copy.** Ririko marks that message as removed and never posts it again, even if more stars arrive. Ririko sees this at once. If it was offline, it finds out the next time it tries to change the count.

**Known limit: a changed starboard channel.** Ririko finds the copy in the channel that is set now. If you change the starboard channel or turn it off, then delete an original, Ririko removes its record but cannot delete a copy left in the old channel. Staff can delete that copy by hand.

**Permissions.** Ririko needs these permissions.

- In the starboard channel: **View Channel**, **Send Messages**, **Embed Links** and **Read Message History**.
- In the channels you want to count: **View Channel**, so Ririko sees the stars. It also needs **Read Message History** to read a message that it did not see before.

If Ririko cannot post, it writes a note in the host's console and tries again the next time that message gets or loses a star.

**What Ririko stores.** For each starred message, Ririko stores the IDs of the message, channel, author and copy, the star count, and whether staff removed the copy. It does not store the text. Ririko deletes this record when the original is deleted, when the stars fall below the number needed, with the server's data, and when a member asks for their data to be deleted. The copy itself is a normal Discord message in your channel. See the [privacy policy](legal/privacy.md), section 3.18.
