# Adventures

An adventure is a short story game with choices. You play it with buttons in a server channel. Your choices decide the ending and your rewards. There are 35 adventures. Each one has 4 or 5 decisions.

## 1. How It Works

- Ririko posts a story with 2 to 4 buttons. Only you can press them.
- Some choices cost credits or an item. Others are free. Some depend on the element or the stats of your companion.
- After the last decision, the story ends and you get your rewards.
- Your **companion** is your active card (see [tcg-player-guide.md](tcg-player-guide.md)). You can play without a card. Your card's element and stats help in some choices. Its level sets your reward rank (see [adventure-completion-rewards.md](adventure-completion-rewards.md)).

## 2. Turn It On

Adventures work in every server as soon as the bot is in it. There is nothing to set up.

- **Server admins.** You can turn off the energy cost for your server (section 7).
- **Hosts.** Keep the folder `assets/adventure/scenes/` with the bot. It holds the pictures. Without a picture, the story still works as text. The bot needs the **Attach Files** permission in the channel. The bot makes its own tables when it starts.

## 3. Start an Adventure

1. Run `/adventure`. Ririko picks a random story.
2. Or pick one: run `/adventure action:start scenario:<name>`. Type a title, a theme or an element in `scenario` to search. The list shows up to 25 results.
3. Read the story and press a button.
4. Keep pressing buttons until the story ends.

With the prefix, run `!adv start the-goblin-bazaar`. See [adventure-catalog.md](adventure-catalog.md) for the IDs.

### 3.1. Commands

Command: `/adventure`. Aliases: `adv`, `journey`, `quest-adventure`. It works in a server only.

| Option | What it does |
|---|---|
| `action` | `start` (the default), `status`, `abandon`, `settings` or `ranks`. |
| `scenario` | For `start`: the adventure. Leave it empty for a random one. |
| `energy` | For `settings`: `true` or `false`. |

| Action | Slash | Prefix | What it does |
|---|---|---|---|
| Start | `/adventure` | `!adv start [id]` | Starts a story. |
| Status | `/adventure action:status` | `!adv status` | Shows your current story or your last result. |
| Abandon | `/adventure action:abandon` | `!adv abandon` | Ends your story early. |
| Ranks | `/adventure action:ranks` | `!adv ranks` | Shows the reward ranks. |
| Settings | `/adventure action:settings energy:false` | `!adv settings false` | Turns the energy cost on or off. Needs **Manage Server**. |

## 4. Rules

- **One story at a time.** You can have only one active adventure for your account. This counts across all channels and all servers.
- **Public story, private buttons.** Everyone can read the story. Only you can press its buttons.
- **90 seconds.** Each decision has a 90-second limit. Wrong or old clicks do not extend it.
- **Start limit.** You can start an adventure once every 10 seconds. `status` and `abandon` work at any time.
- **Costs.** A bribe, a purchase, a bet or an item offering is paid at once when you choose it. You need the full price in your wallet. Rewards you have not received yet cannot pay it. These costs are not returned.
- **Penalties.** A credit loss from a bad event waits until the end. It can never take your wallet below 0.
- **Rewards.** All rewards arrive together at the end of the story, in one step.
- **No history.** Ririko does not show the route you took.

## 5. Energy

Each adventure costs **15 energy**. See [tcg-player-guide.md](tcg-player-guide.md) for how energy works.

| Situation | What happens |
|---|---|
| Energy is 15 or more | Ririko takes 15 energy. |
| Energy is below 15 | You cannot start. |
| The server turned energy off | There is no energy cost. You wait 15 minutes between starts instead. The wait applies on all servers. |

- When you abandon a story, or when time runs out, Ririko gives back 7 energy. If you started in a server without energy, you get nothing back.
- If Ririko cannot post the first decision, it gives all your energy back.
- At the end, a story can restore at most 7 energy.
- Events in a story can also take energy away. The final energy change shows once, and includes the entry cost.

## 6. Rewards

Every ending pays something, even a bad ending. A good ending pays more. You can get credits, XP, Crafting Dust, items, and sometimes a card. Your companion also gets XP. The amounts depend on your companion's level. See [adventure-completion-rewards.md](adventure-completion-rewards.md).

## 7. Server Settings

You need **Manage Server**.

- `/adventure action:settings energy:false` turns off the energy cost in your server. Starts then use a 15-minute wait.
- `/adventure action:settings energy:true` turns it on again. This is the default.
- `/adventure action:settings` shows the current setting.

The mode is fixed for each story when it starts. A change does not affect stories that already run.

## 8. Limits

- You need enough energy, or a server with energy turned off.
- A story you do not finish counts as abandoned. You lose the costs you paid.
- If the bot restarts, your story continues where it was, until its 90-second time runs out.
- If the first message does not arrive, use `/adventure action:status` to find your story again.
