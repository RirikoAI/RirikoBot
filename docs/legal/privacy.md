# Privacy Policy

Last updated: 2026-10-22

Read this text in Bahasa Malaysia: [Dasar Privasi](ms/privacy.md). If the two versions differ, this English version prevails.

This policy explains what data Ririko AI 2.0 ("Ririko") stores and sends, why, and for how long. Read it together with the [Terms of Service](terms.md).

## 1. Who Is Responsible

1.1. Ririko is open-source software. The operator of a copy of Ririko is responsible for the data in that copy.

- **Public bot.** The operator is the maintainer, Earnest Angel (see section 14). Requests about your data go to the maintainer.
- **Self-hosted bot.** The operator is the host, the person who runs that copy. The host controls the data and answers your requests. The maintainer does not run it and cannot see its data. The maintainer takes no responsibility and no liability for self-hosted bots.

1.2. This policy describes what the Ririko code does. A host can change the code or the settings, so ask the host for their policy.

1.3. Ririko 2.0 does not send data about its use to the maintainer. A copy that someone else runs does not report to the maintainer.

1.4. For both the public bot and self-hosted bots, the maintainer gives no guarantee and accepts no liability for any loss, to the fullest extent the law allows.

## 2. Our Approach

2.1. Ririko follows the principles of data protection laws such as the GDPR and Malaysia's PDPA. It does not claim certified compliance with any law.

2.2. In practice:

- Ririko stores only the data that a feature needs.
- Each kind of data has a stated purpose and basis (section 3).
- AI features need your explicit consent (section 5).
- Old data is deleted on a schedule (section 7).
- You have rights over your data (section 8).

2.3. Privacy contact for the public bot: me@angel.net.my.

## 3. What Ririko Stores

Ririko keeps its data in the operator's database. Each item below has a purpose and a basis. The basis is one of three:

- **Service:** the data is needed to give you the feature you use.
- **Server's legitimate interest:** the server's managers need the data to run and protect their community.
- **Consent:** you agreed to it (AI features only).

| Data | What it holds | Purpose and basis |
|---|---|---|
| 3.1. Discord IDs and basic profile | User IDs, usernames, display names, avatar links and a few personal settings, such as level-up notices. Server IDs, names, icons, the owner and who invited the bot. | Needed to know who and where a command comes from. Service. |
| 3.2. Server settings | The settings that server managers make: prefix, language, time zone, channels, roles, welcome and farewell cards (including a background image that a manager uploads), command rules, AutoMod rules, music, stream alert and free game settings. | To run the bot as the server wants. Service. |
| 3.3. Economy, levels and games | Credits and bank balances, the daily streak, the transaction ledger, shop items, inventories, XP, levels and karma, leaderboard rankings, giveaway entries and winners, mini-game statistics and wagers. | To run the economy, levels, giveaways and games. Service. XP is also the server's legitimate interest (see 3.13). |
| 3.4. Waifu TCG data | The cards, items, energy, achievements, quests, dungeon progress, trades, market listings and card guilds that you own or take part in. | To run the card game. Service. |
| 3.5. Moderation records | Cases (warn, timeout, kick, ban and similar), warnings, staff notes about a member, and the IDs of the member and of the moderator. | To keep the server safe and to keep its moderation history. Server's legitimate interest. |
| 3.6. AI chat | The messages that you send to the AI chat, the answers, and the tool calls that were used, per user, server and channel. Also your AI settings (nickname, time zone, language) and the AI settings of a server (persona, speaking style, allowed tools, model, AI channel). | To give you AI answers with memory of the chat. Consent. |
| 3.7. Images | The prompt and status of each image request, the link to the result, and how many images you made today. | To make images and apply the daily limit. Consent. |
| 3.8. Music | The songs played in a server (title, link, length, source and who asked for it). | To show the history and queue of the player. Service. |
| 3.9. Reminders | The text, time and channel of reminders that you set. | To send the reminder. Service. |
| 3.10. Consent records | Your user ID, which notice or consent you accepted (terms or AI), which version, and when. | To know that you accepted, and to show the notice again after a change. Service. |
| 3.11. Dashboard sessions and passkeys | When you sign in to the dashboard with Discord: a session (a hash of the session cookie, your user ID, the times of use, your IP address, your browser name, and your Discord access tokens in encrypted form); passkeys (only the public key, a name, a counter and dates); the browsers you signed in from (a hash of a random cookie and two dates). | To keep you signed in and to warn you about a new browser or a passkey change. Service. |
| 3.12. Audit log | A record of changes that managers and owners make to settings: who, what changed (before and after), when, the IP address and the browser name. | To keep the settings safe and to trace changes. Server's legitimate interest. |
| 3.13. Messages read for XP and AutoMod | Ririko reads the messages in a server to count XP and to apply AutoMod rules. AutoMod case reasons store the part of a message that triggered the rule (an invite code, a link domain or a flagged phrase). The XP spam check keeps a user's last 10 messages in memory only, for a short time, and never saves them. Ririko keeps no other copy of messages for this. This happens before you see any notice. | The legitimate interest of the server in levels and in a safe community. |
| 3.14. Command usage counts | For each server, each day and each command, a number that says how many times the command ran. The count does not say who ran it. Commands outside a server are not counted. | To show server managers how the bot is used. Server's legitimate interest. |
| 3.15. Bot status | The bot's connection delay, the number of servers, the version, and the voice channels that have members (channel IDs and the number of members). It holds no names of members. | To show the health of the bot. Service. |
| 3.16. Support tickets | The number and channel of each ticket, the ID of the member who opened it, the subject that member typed, the staff who claimed or closed it, the close reason, and the open and close times. Ririko does not keep the messages. A transcript is posted to a channel in the server and is not stored by Ririko. When you ask for erasure, your ID and your subject are removed from the tickets you opened. If you claimed or closed a ticket, your ID is replaced by a code that does not name you. | To run support tickets and to show who handled each one. Service. |
| 3.17. Event logs | Off until a server's managers pick a log channel. When they do, Ririko posts to that channel, as an embed, the content of messages that were edited or deleted (and the list of attachment names), members who joined, left, changed nickname or roles, were timed out or banned, changes to channels and roles, and members who joined, left or moved between voice channels. Each post names the member (mention and ID) and the time. Ririko does not store these posts. It reads the content of a deleted message only from the short-lived memory of messages it saw in the last hour, and it saves nothing. Only the server's settings (the chosen channels, the ignored channels and the bots switch) are stored, and they hold no member data. The posts stay in the Discord channel under that server's rules and Discord's policy. | To give server managers a record of what happens in their server. Server's legitimate interest. |
| 3.18. Starboard | Off until a server's managers pick a starboard channel. When they do, Ririko posts a copy of each message that gets enough stars to that channel, as an embed: the text of the message, the link to its first image, the names of other attachments, the author's name (the server nickname, if there is one) and avatar, the channel, a link to the message and its time. Ririko also stores one record for each starred message: the IDs of the message, the channel, the server, the author and the copy, the star count, whether staff removed the copy, and two times. It does not store the text of the message. The record is deleted when the original message is deleted, when its stars fall below the number needed, with the server's data (section 7.1), and when you ask for erasure (section 8). If staff delete a copy, the record stays so that the message is not posted again. The server's settings (the channel, the emoji, the number of stars, the switch for the author's own star and the ignored channels) are stored and hold no member data. The copy is a Discord message in the server and stays under that server's rules and Discord's policy. An erasure request removes the record, not the copy. The server's staff can delete the copy. | To show the best messages of a server in one channel. Server's legitimate interest. |

3.19. Ririko does not collect email addresses. It does not sell personal data and does not send marketing.

## 4. Notice and Consent

4.1. **Terms notice.** After your first command, Ririko shows you a short notice one time. It says that by continuing to use the bot you accept the [Terms of Service](terms.md) and this policy, and it links both. On a self-hosted bot the notice also says that the host is responsible for your data. Ririko records that you accepted (section 3.10). The notice shows once more if the texts change. A host may link their own pages instead.

4.2. **No notice before the first command.** The reading of messages for XP and AutoMod (3.13) runs in a server before you press any command. It rests on the server's legitimate interest, not on the notice.

4.3. **AI consent.** This is separate from the notice. See section 5.

## 5. AI Features

5.1. AI chat, translation and image generation send your text to an AI provider. Ririko does not send anything to a provider until you press "I agree" on a consent prompt. Without consent, nothing is sent and nothing is stored.

5.2. The prompt names the providers that this bot uses: OpenAI, Google Gemini or Replicate. Ollama and ComfyUI run on the host's own machine. The prompt says that the providers keep what they receive under their own policies, which the maintainer and the operator cannot control or recall. It says that chats are stored for 90 days. It names `ai clear`, `ai clear all` and `ai consent withdraw`, and links these texts. It has the buttons "I agree" and "No thanks". Only you can press the buttons on your prompt.

5.3. This is the same on the public bot and on self-hosted bots. There is no setting that turns the prompt off.

5.4. If you press "No thanks", Ririko records nothing and the AI features stay off for you.

5.5. **What Ririko records.** Your chats are recorded: your messages, the answers and the tool calls, per server and channel. Ririko uses the last 20 messages of a chat as context.

5.6. **What a provider receives.** When you chat with the AI, Ririko sends:

- your message;
- up to the last 20 messages of your chat in that server and channel;
- a system prompt with the safety rules, the speaking style and persona text that the server chose, your username and display name, the server name, the date you joined the server (year, month and day) and your time zone;
- the definitions of the tools the server allows the AI to use.

For images, Ririko sends the prompt and the settings of your request.

5.7. **Your commands.**

- `ai clear` deletes the conversation of the current server and channel.
- `ai clear all` deletes all your AI conversations, in every server and channel. It does not remove your AI settings (nickname, time zone, language).
- `ai consent withdraw` withdraws your AI consent. It also deletes all your AI conversations and your AI settings.
- `ai consent status` shows whether and when you agreed.

5.8. **Data a provider already has.** Data that was already sent to a provider cannot be recalled. If you ask for deletion, the operator can only pass your request on to the provider. The provider decides what it does.

## 6. What Is Sent to Other Services

Ririko sends data to an outside service only when the operator has set it up and a feature needs it.

6.1. **AI providers** (OpenAI or a service that works like OpenAI, Google Gemini, Replicate). See section 5. With Ollama and ComfyUI, the data goes to a machine that the host runs.

6.2. **Music sources** (such as YouTube, Spotify, SoundCloud and Deezer, or a Lavalink server). The song names or links that you ask for. These services handle that data under their own policies.

6.3. **Stream, game and card image services.** Ririko asks about public streamers, free games and card images. It does not send your personal data to them.

6.4. **Discord.** Ririko works through Discord. Discord handles data under its own [Privacy Policy](https://discord.com/privacy). Ririko sends you direct messages only for dashboard security notices (a new browser, a passkey change) and for features you asked for.

6.5. The operator may be required by law to share data. Otherwise Ririko does not share your data with other people.

## 7. How Long Data Is Kept

7.1. Ririko 2.0 deletes this data by itself:

| Data | How long |
|---|---|
| AI chat (conversations and messages) | 90 days. Chat summaries older than that are cleared. |
| Music history | 90 days |
| Image jobs (finished or failed) | 90 days |
| Audit log | 365 days |
| Command usage counts | 90 days |
| Dashboard session | 12 hours at most. It also ends after 30 minutes without use. The dashboard deletes ended sessions when it cleans up. |
| Known browsers | Deleted when not seen for a year |
| Warnings | Expire after 30 days. The case record stays. |
| Bot status | Only the latest state is kept |
| Server data (after the bot leaves) | 90 days after the bot leaves or is removed from the server, the bot deletes everything it stores for that server: its settings, XP and levels, moderation records, giveaways, support tickets, starboard records, music, AI and image settings, and the audit log entries about it. If the bot is added back first, the data stays. |

7.2. All other data in section 3 stays while the feature uses it. It is deleted when you ask (sections 8 and 9). Data that is tied to a user and not to a server (for example balances, cards, AI settings and consent records) is not part of the server rule in 7.1. Three kinds of your own data record the server where you made them: your reminders, your saved playlists and the history of your balance. When a server's data is deleted they stay with you and lose only the link to the server.

7.3. An AI consent record stays while the consent is active. It is deleted when you withdraw the consent. A terms-notice record stays while you use the bot.

7.4. Backups made by the operator expire on their own schedule. Deleted data can stay in a backup until that backup expires.

## 8. Your Rights

8.1. You have these rights over your data:

- **Access:** ask what the operator holds about you.
- **Correction:** ask to fix data that is wrong.
- **Erasure:** ask to delete your data.
- **Objection:** object to processing that rests on a legitimate interest.
- **Withdrawing consent:** withdraw your AI consent at any time with `ai consent withdraw`. Data processed before that stays lawful.
- **Complaint:** complain to a data protection regulator where you live.

8.2. You can use some rights yourself: clear your AI chats (section 5.7), sign out of the dashboard, remove your passkeys and end other sessions there. Server managers can change or remove their server's settings on the dashboard.

8.3. Some records may stay when the law requires it, or when a server's moderation history must stay complete. The operator decides this for each request. Some records involve other people, such as trades, the ledger and moderation cases. For these, deletion may be limited, or the operator may remove your ID from the record and keep the rest.

8.4. Data that an AI provider already received is covered in section 5.8.

## 9. How to Make a Request

9.1. For the public bot, write to me@angel.net.my and give your Discord user ID. The maintainer answers within 30 days where able. The maintainer may ask you to prove that the account is yours. Never send passwords or tokens in a request.

9.2. For a self-hosted bot, ask its host. The host answers.

9.3. The host can erase all data about one user with one command, `ririko user erase <your Discord user ID>` (see section 8.3 for what stays). The command deletes the rows that only you hold. Rows that involve other people, such as trades and the ledger, stay and lose your ID. Moderation records stay unless the operator decides to remove you from them too. The host cannot recall data that an AI provider already received (section 5.8).

9.4. **Complaints.** Contact the maintainer first. You may also complain to a data protection regulator, such as Malaysia's Personal Data Protection Commissioner.

## 10. Security

10.1. Ririko reads secrets (API keys and tokens) from environment variables. The Discord tokens of dashboard sessions are stored encrypted with AES-256-GCM. The dashboard stores a SHA-256 hash of the session cookie, not the cookie itself. Passkeys keep only public keys.

10.2. Ririko does not write chat text, prompts or AI answers to its logs.

10.3. No system is completely safe. The operator is responsible for protecting the server and the database of their copy. The maintainer cannot promise absolute security.

10.4. **Breach.** If personal data of the public bot is lost or exposed, the maintainer assesses and contains the problem. The maintainer tells the authorities or the people affected where the law requires it.

## 11. Children

11.1. Ririko is not meant for people under 18. Ririko does not knowingly collect data from children. If you think a child has given data to the public bot, write to me@angel.net.my and the maintainer will remove it.

## 12. Where Data Is Kept

12.1. The operator chooses where the database and the services are. Your data may be processed outside your country, including where the AI providers operate.

## 13. Changes

13.1. The maintainer may change this policy. The "Last updated" date shows the version. If the change matters, the notice in section 4.1 shows once more. If you keep using Ririko after a change, you accept the new policy.

## 14. Contact

14.1. For questions, requests and complaints about the public bot: me@angel.net.my. Maintainer: Earnest Angel (https://angel.net.my/).
