import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
} from 'discord.js';
import {
  CommandCategory,
  DEFAULT_COMMAND_PREFIX,
  type Command,
  type CommandContext,
} from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { resolveContextPrefix } from '../shared/prefix-resolver.js';

export type TcgInfoTopic =
  | 'overview'
  | 'starter'
  | 'elements'
  | 'gear'
  | 'crafting'
  | 'tutorial'
  | 'dungeon'
  | 'trade'
  | 'market'
  | 'guild'
  | 'achievements';

export function buildTcgInfoEmbed(
  topic: TcgInfoTopic,
  prefix: string = DEFAULT_COMMAND_PREFIX,
): EmbedBuilder {
  switch (topic) {
    case 'starter':
      return new EmbedBuilder()
        .setTitle('🔰 Waifu TCG — Getting Started & Your First Card')
        .setColor(0x57f287)
        .setDescription(
          `Welcome to the Waifu TCG! Before fighting in battles, you need at least **one combat card**.\n\n` +
            `### 1. The Instant Starter Kit (Best First Step!)\n` +
            `Run the Prologue Tutorial:\n` +
            `\`\`\`\n/dungeon action:tutorial\n# or: ${prefix}dungeon tutorial\n\`\`\`\n` +
            `• **Free Starter Card**: If you don't have any cards, Ririko will immediately grant you a starter card!\n` +
            `• **Novice Blade**: +15 ATK weapon gear.\n` +
            `• **3x Minor HP Potions**: Restore 150 HP each.\n` +
            `• **TUTORIAL_COMPLETE Achievement**: Grants +100 EXP & +250 Credits!\n\n` +
            `### 2. Chat Drops (Free Cards Just for Chatting!)\n` +
            `• Cards drop randomly into active server chat channels.\n` +
            `• When a card appears, type \`/card action:claim\` or \`${prefix}card claim\` to claim it!\n` +
            `• Follows 8 rarity tiers: Common (50%), Uncommon (25%), Rare (12%), Super Rare (7%), Ultra Rare (4%), Secret Rare (1.5%), SIR (0.45%), Mythic (0.05%).\n\n` +
            `### 3. Community Marketplace\n` +
            `• Buy cards listed by other players with \`/market action:browse\` and \`/market action:buy\`!`,
        )
        .setFooter({ text: 'Tip: Always run /dungeon tutorial first before attempting the real tower!' });

    case 'elements':
      return new EmbedBuilder()
        .setTitle('⚔️ Waifu TCG — 7-Element Affinity Matrix & Status Effects')
        .setColor(0x3498db)
        .setDescription(
          `Mastering elemental matchups is the key to conquering high-level duels and dungeon floors!\n\n` +
            `### 🔄 The Affinity Wheel\n` +
            `\`\`\`\n` +
            `FIRE ──► ICE ──► EARTH ──► LIGHTNING ──► WATER ──► FIRE\n` +
            `            LIGHT ◄──────────► SHADOW\n` +
            `\`\`\`\n` +
            `• **Advantage (1.5x Damage)**:\n` +
            `  - 🔥 **Fire** melts ❄️ **Ice**\n` +
            `  - ❄️ **Ice** shatters 🌿 **Earth**\n` +
            `  - 🌿 **Earth** grounds ⚡ **Lightning**\n` +
            `  - ⚡ **Lightning** conducts through 💧 **Water**\n` +
            `  - 💧 **Water** extinguishes 🔥 **Fire**\n` +
            `• **Disadvantage (0.75x Damage)**: Attacking backwards (e.g. Ice into Fire) deals reduced damage.\n` +
            `• **Light & Shadow (Polar Opposition)**: ☀️ **Light** and 🌑 **Shadow** deal **2.0x mutual extreme damage** to each other!\n\n` +
            `### 💥 Tactical Status Effects\n` +
            `• 🔥 **Burn**: 5% max HP true damage per turn (stacks up to 3x).\n` +
            `• ❄️ **Freeze / Chill**: -30% Speed. At 2 stacks, target is frozen solid and skips turn!\n` +
            `• 🌿 **Fortify**: Barrier absorbing incoming physical strikes.\n` +
            `• ⚡ **Surge**: +25% Critical Chance & bonus MP on attack.\n` +
            `• 💧 **Purify**: Cleanses debuffs and provides HP regeneration.\n` +
            `• ☀️ **Radiance**: Blinds targets (reduces hit accuracy).\n` +
            `• 🌑 **Decay**: Drains enemy HP and leeches health back.`,
        )
        .setFooter({ text: 'Ice is the 7th element in Ririko 2.0, completely counters Earth and is weak to Fire!' });

    case 'gear':
      return new EmbedBuilder()
        .setTitle('🛡️ Waifu TCG — Equipments, Accessories & +10 Enhancement')
        .setColor(0x9b59b6)
        .setDescription(
          `Equip and refine powerful gear to survive brutal dungeon boss enrage mechanics!\n\n` +
            `### 🎒 6 Gear Slots\n` +
            `Each waifu card can equip items in 6 slots:\n` +
            `1. ⚔️ **Weapon**: Boosts Attack and Crit Rate (e.g. Novice Blade, Frostfang Dagger).\n` +
            `2. 🛡️ **Armor**: Boosts Health and Defense (e.g. Iron Plate, Dragon Mail).\n` +
            `3. 🔮 **Relic**: Boosts Speed, MP regeneration, or elemental mastery.\n` +
            `4. 💍 **Ring**: Boosts Critical Damage and bonus Attack.\n` +
            `5. 📿 **Amulet**: Damage mitigation barrier or bonus Max HP.\n` +
            `6. 📜 **Talisman**: Specialized battle perks (e.g. Phoenix Ward revive, Turn 1 shield).\n\n` +
            `### 🔨 The +10 Enhancement System\n` +
            `• Upgrade items from **+0 to +10** using **Crafting Dust** and **Credits**.\n` +
            `• **Crafting Dust**: Obtained by dismantling duplicate cards (\`/card action:dismantle id:<id>\`).\n` +
            `• \`+1 to +3\`: 100% success rate.\n` +
            `• \`+4 to +6\`: +15% stat growth per tier.\n` +
            `• \`+7 to +9\`: Unlocks secondary battle perks (Lifesteal, Burn Resist, etc.).\n` +
            `• \`+10 Masterwork\`: Unlocks radiant aura and card passive boosts!\n\n` +
            `### ⚙️ Equipping Gear\n` +
            `Gear is worn by a **card**, not by you. Set your active ⭐ card with \`/card action:equip id:<card_id>\`.\n` +
            `• Open the gear menu: \`/loadout\` (prefix \`${prefix}loadout\`, \`${prefix}gear\`, \`${prefix}equipment\`). Add a card ID to pick a card.\n` +
            `• In the menu, choose a card, then a slot, then an item. Each item shows its stat change (\`ATK +40 ▲\`).\n` +
            `• Press **Equip**. The old piece goes back to your inventory. **Unequip**, **Unequip All** and **Enhance** are on the same screen.\n` +
            `• Empty a card: \`/card action:unequip-all id:<card_id>\`. Without an ID it empties every card you own.\n` +
            `• Gear stays yours: only empty cards can be sold or traded, and dismantling a card returns its gear to your inventory.\n` +
            `• Check worn gear: \`/item action:inventory\` tags it \`[EQUIPPED: <SLOT>]\`.\n` +
            `• By ID: \`/card action:equip-gear id:<card_id> item_id:<item_id> slot:<SLOT>\` and \`/card action:unequip-gear item_id:<item_id>\`.`,
        )
        .setFooter({ text: 'Buy gear with /game action:shop, or craft it with /craft!' });

    case 'crafting':
      return new EmbedBuilder()
        .setTitle('🔨 Waifu TCG — Crafting & Forging')
        .setColor(0xe67e22)
        .setDescription(
          `Turn **Crafting Dust**, **Credits** and lower-tier gear into stronger gear and potions.\n\n` +
            `### 📜 What You Can Craft\n` +
            `• Drop-only gear in 6 upgrade chains, one per slot (Rare ➜ Super Rare ➜ Ultra Rare ➜ top tier).\n` +
            `• Major HP Potions and Greater Mana Potions.\n` +
            `• Boss signature drops can't be crafted. Beat the boss to earn them.\n\n` +
            `### 🔒 Unlocks & Costs\n` +
            `• Recipes unlock by the highest dungeon floor you've cleared (floors 10, 20, 30, 40, 45).\n` +
            `• Each recipe costs Crafting Dust and Credits. Gear upgrades also use the lower-tier piece.\n` +
            `• Only **unequipped** gear is used as an ingredient. Equipped gear is never consumed.\n` +
            `• Gear is crafted 1 at a time. Potions up to 10 at a time.\n\n` +
            `### 🧪 Getting Crafting Dust\n` +
            `Dismantle duplicate cards (\`/card action:dismantle id:<id>\`), clear dungeon floors, and earn 3★ floor clears.\n\n` +
            `### ⚙️ Crafting Commands\n` +
            `• Open the crafting menu: \`/craft\` (prefix \`${prefix}craft\`, \`${prefix}forge\`).\n` +
            `• Craft directly: \`/craft recipe:<code> quantity:<n>\` (e.g. \`${prefix}craft POTION_MAJOR_HP 3\`).\n` +
            `• Crafted gear goes to your inventory. Equip it with \`/loadout\`.`,
        )
        .setFooter({ text: 'Recipes locked? Climb higher in /dungeon to unlock them!' });

    case 'tutorial':
      return new EmbedBuilder()
        .setTitle('🏰 Waifu TCG — Tutorial Prologue vs. S1 Tower')
        .setColor(0xe67e22)
        .setDescription(
          `⚠️ **CRITICAL WARNING FOR NEW SUMMONERS** ⚠️\n` +
            `**Do NOT jump straight into \`/dungeon climb\` (or \`${prefix}dungeon climb\`) without finishing the tutorial!**\n` +
            `Floor 1 of the real tower features scorching environmental heat affixes and high-stat enemies.\n\n` +
            `### 🔰 The Tutorial Prologue (Floors T1–T4)\n` +
            `• **Command**: \`/dungeon action:tutorial\` or \`${prefix}dungeon tutorial\`\n` +
            `• **Energy Cost**: **0 Energy** (completely free!)\n` +
            `• **Encounter Progression**:\n` +
            `  - **T1: Target Dummy** (150 HP, 10 ATK) — Learn turn order and basic strikes.\n` +
            `  - **T2: Training Automaton** (300 HP, 20 ATK) — Learn skills and MP usage.\n` +
            `  - **T3: Elemental Sprite** (450 HP, 35 ATK) — Learn elemental type advantage.\n` +
            `  - **T4: Novice Instructor** (600 HP, 50 ATK) — Comprehensive combat graduation.\n\n` +
            `### 🎁 Graduation Rewards\n` +
            `• Starter Waifu Card (if you have no cards)\n` +
            `• \`Novice Blade\` (+15 ATK weapon)\n` +
            `• \`3x Minor Health Potions\` (150 HP restore each)\n` +
            `• \`TUTORIAL_COMPLETE\` Achievement (+100 EXP, +250 Credits)\n\n` +
            `*Once completed, equip your Novice Blade and begin climbing Season 1 with \`/dungeon climb\` (or \`${prefix}dungeon climb\`)!*`,
        )
        .setFooter({ text: `Run /dungeon action:tutorial or ${prefix}dungeon tutorial right now to claim your starter gear!` });

    case 'dungeon':
      return new EmbedBuilder()
        .setTitle('🔥 Waifu TCG — PvE Seasonal Dungeon Tower (S1: Infernal Crucible)')
        .setColor(0xe74c3c)
        .setDescription(
          `The Seasonal Tower is a 100-floor PvE gauntlet that resets every 60–90 days with fresh themes!\n\n` +
            `### 🌋 Season 1 Theme: Infernal Crucible\n` +
            `• **Theme Element**: 🔥 Fire\n` +
            `• **Active Affixes**:\n` +
            `  - \`SCORCHED_EARTH\`: All non-Water and non-Ice cards take 3% burn damage each turn.\n` +
            `  - \`HEAT_HAZE\`: -10% base hit accuracy unless wearing a protective Relic.\n\n` +
            `### ⚡ Floor Brackets & Energy Costs\n` +
            `• **Tutorial (T1–T4)**: \`0 Energy\`\n` +
            `• **Floors 1–10**: \`10 Energy\` (Standard Grunts)\n` +
            `• **Floors 11–25**: \`15 Energy\` (Elite Squads)\n` +
            `• **Floors 26–40**: \`20 Energy\` (Mini-Bosses — 1.75x Stats)\n` +
            `• **Floors 41–50+**: \`25 Energy\` (Major Bosses — 3.2x Stats + Multi-Layer Wards)\n\n` +
            `### ⏳ Boss Mechanics\n` +
            `• **Multi-Layer Elemental Wards**: Absorb all damage until shattered with opposing elements!\n` +
            `• **Soft Enrage Clock (Turn 10+)**: Bosses gain +100% ATK per turn with unblockable true damage strikes. Finish battles quickly!\n\n` +
            `### 📜 Dungeon Commands\n` +
            `• \`/dungeon action:status\` (or \`${prefix}dungeon status\`)\n` +
            `• \`/dungeon action:climb\` (or \`${prefix}dungeon climb\` / \`${prefix}climb\`)\n` +
            `• \`/dungeon action:floor floor_number:<n>\` (or \`${prefix}dungeon floor <n>\`)\n` +
            `• \`/dungeon action:leaderboard\` (or \`${prefix}dungeon leaderboard\`)`,
        )
        .setFooter({ text: 'Use water/ice combatants in Season 1 to bypass Scorched Earth burn damage!' });

    case 'trade':
      return new EmbedBuilder()
        .setTitle('🔄 Waifu TCG — Peer-to-Peer (P2P) Trading System')
        .setColor(0x1abc9c)
        .setDescription(
          `Trade cards and credits safely with other players through our atomic dual-confirmation engine!\n\n` +
            `### 🔒 Safety First: IN_TRADE State Locking\n` +
            `• When a trade is proposed, all offered and requested cards are locked with \`state = 'IN_TRADE'\`.\n` +
            `• Locked cards cannot be sold, dismantled, or offered in other simultaneous trades.\n` +
            `• If a trade is rejected or cancelled, cards unlock back to \`IDLE\` immediately.\n` +
            `• **Only empty cards can be traded.** Gear never moves with a card. Unequip everything first with \`/card action:unequip-all id:<card_id>\` or \`${prefix}card unequip-all <card_id>\`.\n\n` +
            `### 🤝 How to Trade\n` +
            `1. **Propose a Trade**:\n` +
            `   \`\`\`\n` +
            `   /trade action:request target:@User offer_card_ids:id1,id2 request_card_ids:id3 offer_credits:500 request_credits:0\n` +
            `   # or: ${prefix}trade request @User id1,id2 id3 500\n` +
            `   \`\`\`\n` +
            `2. **Inspect the Proposal**:\n` +
            `   The target user checks details with \`/trade action:view id:<trade_id>\` or \`${prefix}trade view <trade_id>\`.\n` +
            `3. **Accept or Reject**:\n` +
            `   - Accept: \`/trade action:accept id:<trade_id>\` (or \`${prefix}trade accept <trade_id>\`)\n` +
            `   - Reject: \`/trade action:reject id:<trade_id>\` (or \`${prefix}trade reject <trade_id>\`)\n` +
            `   - Cancel: \`/trade action:cancel id:<trade_id>\` (or \`${prefix}trade cancel <trade_id>\`)\n\n` +
            `### ⚡ Atomic ACID Guarantee\n` +
            `Card ownerships and credits are transferred inside a single database transaction. If either party lacks funds or cards, the entire trade reverts safely!`,
        )
        .setFooter({ text: `View your pending incoming and outgoing trades with /trade action:list or ${prefix}trade list.` });

    case 'market':
      return new EmbedBuilder()
        .setTitle('🏪 Waifu TCG — Community Player Marketplace')
        .setColor(0xf1c40f)
        .setDescription(
          `Buy and sell cards in the open player economy!\n\n` +
            `### 🏷️ How to List a Card\n` +
            `\`\`\`\n/market action:list card_id:<id> price:<credits>\n# or: ${prefix}market list <id> <credits>\n\`\`\`\n` +
            `• The card is locked with \`state = 'IN_MARKET'\`.\n` +
            `• **Only empty cards can be sold.** Gear never moves with a card. Unequip everything first with \`/card action:unequip-all id:<card_id>\` or \`${prefix}card unequip-all <card_id>\`.\n` +
            `• Set your own price in Credits.\n\n` +
            `### 🔍 How to Browse\n` +
            `\`\`\`\n/market action:browse page:1 filter_element:ICE filter_rarity:UR\n# or: ${prefix}market browse 1 ICE UR\n\`\`\`\n` +
            `• Filter by elemental affinity or rarity tier.\n` +
            `• Displays seller username, card level, stats, and asking price.\n\n` +
            `### 💰 5% Market Tax Sink\n` +
            `• A 5% platform fee is deducted from the seller's proceeds on sale (\`tax = Math.floor(price * 0.05)\`).\n` +
            `• Helps control server inflation and maintains a balanced credit economy.\n\n` +
            `### ⏳ 7-Day Auto-Expiration\n` +
            `• Listings stay active for **7 days**.\n` +
            `• If unsold after 7 days, listings automatically expire and cards return to your inventory in \`IDLE\` state!\n` +
            `• You can also manually cancel anytime with \`/market action:cancel listing_id:<id>\` or \`${prefix}market cancel <id>\`.`,
        )
        .setFooter({ text: `View all your active listings with /market action:my-listings or ${prefix}market my-listings.` });

    case 'guild':
      return new EmbedBuilder()
        .setTitle('🏛️ Waifu TCG — WaifuGuilds & Factions')
        .setColor(0x9b59b6)
        .setDescription(
          `Team up with fellow summoners to form a guild, level up together, and climb the guild leaderboards!\n\n` +
            `### 🚩 Creating a Guild\n` +
            `\`\`\`\n/waifuguild action:create name:"Crimson Lotus" tag:"LOTUS" description:"Top fire guild"\n# or: ${prefix}waifuguild create "Crimson Lotus" LOTUS "Top fire guild"\n\`\`\`\n` +
            `• **Creation Fee**: 5,000 Credits.\n` +
            `• Creator becomes the **Guild Leader**.\n\n` +
            `### 📈 Guild Leveling & Capacity\n` +
            `• **Capacity Formula**: Starts at 12 members and scales with level:\n` +
            `  $$\\text{Max Capacity} = 10 + (\\text{Level} \\times 2)$$\n` +
            `• **Level Progression**: XP required = $\\lfloor 1000 \\times \\text{Level}^{1.5} \\rfloor$.\n` +
            `• Guild members earn Guild XP from winning dungeon battles and duels!\n\n` +
            `### 🏦 Guild Bank\n` +
            `• Members can contribute credits to the shared guild bank:\n` +
            `  \`\`\`\n  /waifuguild action:deposit amount:1000\n  # or: ${prefix}waifuguild deposit 1000\n  \`\`\`\n` +
            `• Used to unlock future guild upgrades and perks.\n\n` +
            `### 👑 Guild Commands\n` +
            `• \`/waifuguild action:info\` (or \`${prefix}waifuguild info\`)\n` +
            `• \`/waifuguild action:join guild_id:<id>\` (or \`${prefix}waifuguild join <id>\`)\n` +
            `• \`/waifuguild action:leave\` (or \`${prefix}waifuguild leave\`)\n` +
            `• \`/waifuguild action:leaderboard\` (or \`${prefix}waifuguild leaderboard\`)`,
        )
        .setFooter({ text: 'Guild leaders can promote/demote officers and manage the member roster.' });

    case 'achievements':
      return new EmbedBuilder()
        .setTitle('🏆 Waifu TCG — Achievements & Multi-Asset Rewards')
        .setColor(0xf39c12)
        .setDescription(
          `Ririko features a multi-asset achievement system rewarding milestones across all gameplay areas!\n\n` +
            `### 🎯 6 Achievement Tracks\n` +
            `1. 🎴 **Gacha / Drops Track**: Claiming chat drops and expanding your card roster.\n` +
            `2. ⚔️ **Combat Track**: Winning duels, expeditions, and boss battles.\n` +
            `3. 📈 **Leveling Track**: Leveling cards to Lv.50, Lv.100, and max ascension.\n` +
            `4. 💰 **Economy Track**: Earning credits, bank interest, and market sales.\n` +
            `5. 🌟 **Collection Track**: Collecting complete elemental sets.\n` +
            `6. 🤝 **Social Track**: Guild membership, trading, and community activity.\n\n` +
            `### 🎁 7-Asset Multi-Reward Engine\n` +
            `Achievements reward up to 7 distinct asset types:\n` +
            `• **Account EXP**: Levels up your overall Discord rank.\n` +
            `• **Credits**: Deposited directly into your wallet balance.\n` +
            `• **Exclusive Cards**: Rare collectible cards granted to your inventory.\n` +
            `• **Combat Weapons**: High-tier weapons for your loadout.\n` +
            `• **Accessories**: Rings, amulets, and relics.\n` +
            `• **Consumables**: Energy potions and health elixirs.\n` +
            `• **Custom Titles & Badges**: Displayed on your canvas profile card!\n\n` +
            `### 📜 Achievement Commands\n` +
            `• \`/achievement action:list\` (or \`${prefix}achievement list\`)\n` +
            `• \`/achievement action:claim achievement_id:<id>\` (or \`${prefix}achievement claim <id>\`)`,
        )
        .setFooter({ text: 'Complete the tutorial to instantly claim your first achievement: TUTORIAL_COMPLETE!' });

    case 'overview':
    default:
      return new EmbedBuilder()
        .setTitle('📚 Waifu TCG 2.0 — Information & Strategy Hub')
        .setColor(0xe91e63)
        .setDescription(
          `Welcome to the **Ririko Waifu TCG Information Hub**!\n` +
            `Select a topic from the dropdown menu below, run \`/tcg-info topic:<name>\`, or run \`${prefix}tcg-info <topic>\` to read specific guides.\n\n` +
            `### 📑 Available Guides\n` +
            `• 🔰 **Getting Started & First Card**: How to claim your starter pack and chat drops.\n` +
            `• ⚔️ **7-Element Type Advantages**: The affinity wheel, multipliers, and status effects.\n` +
            `• 🛡️ **Equipments & Accessories**: 6 gear slots, equipping with \`/loadout\`, and +10 enhancement.\n` +
            `• 🔨 **Crafting & Forging**: Craft gear and potions from Crafting Dust with \`/craft\`.\n` +
            `• 🏰 **Tutorial vs. S1 Tower**: Why you must start with \`/dungeon tutorial\` before \`/dungeon climb\`.\n` +
            `• 🔥 **Dungeon Tower Mechanics**: S1 Infernal Crucible, energy scaling, and boss enrage.\n` +
            `• 🔄 **P2P Trading System**: Atomic card swaps, \`IN_TRADE\` locking, and dual confirmation.\n` +
            `• 🏪 **Community Marketplace**: Listing cards, 5% tax sink, and 7-day auto-expiration.\n` +
            `• 🏛️ **WaifuGuilds & Factions**: Creating a guild (5,000c), capacity, and guild bank.\n` +
            `• 🏆 **Achievements & Rewards**: 6 tracks, 5 tiers, and 7-asset reward dispatch.\n\n` +
            `*Tip: Use the dropdown menu below to navigate between guides immediately!*`,
        )
        .setFooter({ text: 'Full handbook documentation is also available in docs/tcg-player-guide.md.' });
  }
}

export function buildTcgInfoSelectMenu(currentTopic: TcgInfoTopic = 'overview'): ActionRowBuilder<StringSelectMenuBuilder> {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('tcg_info_select')
    .setPlaceholder('📖 Choose a TCG Guide Topic...')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Overview & Quick Reference')
        .setValue('overview')
        .setDescription('Main hub and command cheat sheet')
        .setEmoji('📚')
        .setDefault(currentTopic === 'overview'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Getting Started & First Card')
        .setValue('starter')
        .setDescription('How to get cards via starter pack & chat drops')
        .setEmoji('🔰')
        .setDefault(currentTopic === 'starter'),
      new StringSelectMenuOptionBuilder()
        .setLabel('7-Element Type Advantages')
        .setValue('elements')
        .setDescription('Affinity wheel (including Ice), multipliers & status effects')
        .setEmoji('⚔️')
        .setDefault(currentTopic === 'elements'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Equipments & +10 Enhancement')
        .setValue('gear')
        .setDescription('6 gear slots, equipping with /loadout & enhancement')
        .setEmoji('🛡️')
        .setDefault(currentTopic === 'gear'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Crafting & Forging')
        .setValue('crafting')
        .setDescription('Craft gear & potions from Crafting Dust with /craft')
        .setEmoji('🔨')
        .setDefault(currentTopic === 'crafting'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Tutorial vs. S1 Tower')
        .setValue('tutorial')
        .setDescription('Why you must do /dungeon tutorial before climbing')
        .setEmoji('🏰')
        .setDefault(currentTopic === 'tutorial'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Dungeon Tower Mechanics')
        .setValue('dungeon')
        .setDescription('S1 Infernal Crucible, energy scaling & boss enrage')
        .setEmoji('🔥')
        .setDefault(currentTopic === 'dungeon'),
      new StringSelectMenuOptionBuilder()
        .setLabel('P2P Trading System')
        .setValue('trade')
        .setDescription('Atomic card trades & IN_TRADE state locking')
        .setEmoji('🔄')
        .setDefault(currentTopic === 'trade'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Community Marketplace')
        .setValue('market')
        .setDescription('Listing cards, 5% tax sink & 7-day expiration')
        .setEmoji('🏪')
        .setDefault(currentTopic === 'market'),
      new StringSelectMenuOptionBuilder()
        .setLabel('WaifuGuilds & Factions')
        .setValue('guild')
        .setDescription('Creating a guild (5,000c), leveling & guild bank')
        .setEmoji('🏛️')
        .setDefault(currentTopic === 'guild'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Achievements & Rewards')
        .setValue('achievements')
        .setDescription('6 tracks, 5 tiers & 7-asset reward dispatch')
        .setEmoji('🏆')
        .setDefault(currentTopic === 'achievements'),
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
}

export function createTcgInfoCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'tcg-info',
      category: CommandCategory.TCG,
      description: 'Comprehensive Waifu TCG guide: tutorials, type advantages, gear, trading, market, and guilds.',
      aliases: ['tcginfo', 'tcgguide', 'tcg-guide', 'card-guide', 'waifu-guide'],
      usage: '/tcg-info [topic: overview|starter|elements|gear|crafting|tutorial|dungeon|trade|market|guild|achievements]',
      examples: [
        '/tcg-info',
        '/tcg-info topic:elements',
        '/tcg-info topic:starter',
        '/tcg-info topic:gear',
        '/tcg-info topic:tutorial',
        '/tcg-info topic:trade',
        '/tcg-info topic:market',
        '/tcg-info topic:guild',
      ],
      options: [
        {
          name: 'topic',
          description: 'The specific guide topic to view',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Overview & Cheat Sheet', value: 'overview' },
            { name: 'Getting Started & First Card', value: 'starter' },
            { name: '7-Element Type Advantages', value: 'elements' },
            { name: 'Equipments & +10 Enhancement', value: 'gear' },
            { name: 'Crafting & Forging', value: 'crafting' },
            { name: 'Tutorial vs. S1 Tower', value: 'tutorial' },
            { name: 'Dungeon Tower Mechanics', value: 'dungeon' },
            { name: 'P2P Trading System', value: 'trade' },
            { name: 'Community Marketplace', value: 'market' },
            { name: 'WaifuGuilds & Factions', value: 'guild' },
            { name: 'Achievements & Rewards', value: 'achievements' },
          ],
        },
      ],
    },
    execute: async (ctx: CommandContext): Promise<void> => {
      const rawArgs = ctx.options.getRawArgs?.() ?? [];
      const topicInput =
        ctx.options.getString('topic')?.toLowerCase() ??
        rawArgs[0]?.toLowerCase() ??
        'overview';

      const validTopics: TcgInfoTopic[] = [
        'overview',
        'starter',
        'elements',
        'gear',
        'crafting',
        'tutorial',
        'dungeon',
        'trade',
        'market',
        'guild',
        'achievements',
      ];

      const topic: TcgInfoTopic = validTopics.includes(topicInput as TcgInfoTopic)
        ? (topicInput as TcgInfoTopic)
        : 'overview';

      const prefix = await resolveContextPrefix(ctx, services);

      const embed = buildTcgInfoEmbed(topic, prefix);
      const row = buildTcgInfoSelectMenu(topic);

      const response = await ctx.reply({
        embeds: [embed],
        components: [row],
      });

      // If interactive component collector is supported in this context
      if (response && 'createMessageComponentCollector' in response) {
        const collector = response.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          time: 120000, // 2 minutes active
        });

        collector.on('collect', async (interaction) => {
          if (interaction.user.id !== ctx.user.id) {
            await interaction.reply({
              content: 'Only the summoner who opened this guide can switch topics. Run `/tcg-info` to open your own!',
              ephemeral: true,
            });
            return;
          }

          const selected = interaction.values[0] as TcgInfoTopic;
          const updatedEmbed = buildTcgInfoEmbed(selected, prefix);
          const updatedRow = buildTcgInfoSelectMenu(selected);

          await interaction.update({
            embeds: [updatedEmbed],
            components: [updatedRow],
          });
        });

        collector.on('end', async () => {
          try {
            // Disable select menu when collector expires
            const disabledMenu = StringSelectMenuBuilder.from(row.components[0]!).setDisabled(true);
            const disabledRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(disabledMenu);
            await response.edit({
              components: [disabledRow],
            });
          } catch {
            // Message might have been deleted, ignore
          }
        });
      }
    },
  };
}
