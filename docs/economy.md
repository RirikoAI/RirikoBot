# Centralized Economy & Leveling Engine (Ririko AI 2.0.0)

## 1. Overview
The **Economy & Leveling Engine** is a unified, event-driven subsystem that provides currency, experience (XP), banking, rankings, and item inventories across all bot modules. It adheres strictly to financial transaction integrity and proactive anti-abuse protections as defined in Sections 32–36 and 76 of `BLUEPRINT.md`.

---

## 2. Event-Driven Economy Architecture

Rather than hardcoding coin or XP grants across commands and event handlers, all rewarding actions publish a standardized `EconomyEvent`:

```typescript
export interface EconomyEvent {
  type: EconomyEventType;
  userId: string;
  guildId?: string;
  source: string;
  metadata?: Record<string, unknown>;
}

export enum EconomyEventType {
  MESSAGE_SENT = 'MESSAGE_SENT',
  VOICE_MINUTE = 'VOICE_MINUTE',
  ATTACHMENT_UPLOADED = 'ATTACHMENT_UPLOADED',
  GAME_WON = 'GAME_WON',
  GAME_LOST = 'GAME_LOST',
  QUEST_COMPLETE = 'QUEST_COMPLETE',
  CARD_DROPPED = 'CARD_DROPPED',
  CARD_CLAIMED = 'CARD_CLAIMED',
  CARD_SOLD = 'CARD_SOLD',
  DAILY_REWARD = 'DAILY_REWARD',
  ACHIEVEMENT_UNLOCKED = 'ACHIEVEMENT_UNLOCKED',
}
```

The centralized `EconomyService` intercepts these events, evaluates anti-spam criteria, calculates multipliers (roles, boosts, events), and commits ledger entries.

---

## 3. Anti-Spam & Abuse Protection

A core invariant of Ririko 2.0 is: **Spam must NEVER generate money or EXP.**

### 3.1. Text Anti-Spam Heuristics
1. **Rolling Window Cooldown**: XP and coins from text chatting are awarded at most **once every 60 seconds per user**.
2. **Burst & Copy-Paste Detection**: Messages identical or >80% similar (Levenshtein distance) to the user's previous 3 messages are discarded with zero reward.
3. **Length & Quality Threshold**: Messages with fewer than 5 non-whitespace characters or composed purely of punctuation/emojis award zero XP/coins.
4. **Automated & Self-Bot Guard**: Inhuman typing rates or message intervals with low variance (<100ms variance across messages) automatically trigger a 30-minute shadow cooldown on economy rewards.

### 3.2. Voice XP / Economy Anti-AFK Rules
Voice participation generates higher XP rewards than text chatting, but AFK farming is strictly mitigated:
- **Participant Quorum**: Minimum of **2 unmuted, undeafened human members** must be present in the voice channel.
- **Mute & Deafen Disqualification**: Self-deafened, self-muted, or server-muted users earn zero XP/coins.
- **AFK Channel Exclusions**: The guild's designated AFK voice channel is hard-excluded.
- **Interval Accrual**: XP is accrued in 60-second discrete buckets validated against gateway voice state updates.

---

## 4. Double-Entry Ledger & Financial Security

All monetary operations are treated as audited financial transactions:

```typescript
export interface EconomyTransactionRecord {
  transactionId: string;
  userId: string;
  guildId?: string;
  type: 'TRANSFER' | 'DEPOSIT' | 'WITHDRAW' | 'DAILY' | 'GAMBLE' | 'SHOP_BUY' | 'MARKET_FEE' | 'TCG_REWARD';
  amount: bigint;
  currency: 'CREDITS' | 'GEMS';
  balanceBefore: bigint;
  balanceAfter: bigint;
  source: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}
```

### Safety Rules:
- Every balance mutation occurs inside an ACID database transaction.
- Database schemas enforce `CHECK (wallet_balance >= 0)` and `CHECK (bank_balance >= 0)`. Race conditions attempting to double-spend immediately fail at the database constraint level.
- Multi-party transfers (e.g. `/pay <@user> <amount>`) acquire deterministic row locks sorted by user ID to prevent database deadlocks.

---

## 5. Banking & Daily Rewards

### 5.1. Bank Features
- **Wallet vs. Bank**: Wallet balance is vulnerable to loss in gambling or robbery (if robbery is enabled by the guild). Bank balance is 100% secure.
- **Deposit & Withdrawal**: `/deposit <amount | all>` and `/withdraw <amount | all>`.
- **Bank Capacity**: Base bank capacity scales with user level (e.g. $10,000 + \text{Level} \times 2,500$) and can be expanded through item purchases.
- **Interest**: Guilds can enable a small daily bank interest yield (e.g. 0.5% - 1.0% per day, capped at max yield limits) to encourage saving.

### 5.2. Daily Claim Streaks (`/daily`)
- Base reward: 250 credits.
- Daily streak multiplier: $+5\%$ per consecutive day, capping at 30 days ($+150\%$).
- 24-hour claim window with an additional 12-hour grace period (36 hours total before streak resets).

---

## 6. Ranking 2.0 & High-Performance Leaderboards

### 6.1. Performance Architecture
Legacy bots suffer severe query latency when calculating ranks by scanning the entire user table on every profile view. Ririko 2.0 resolves this via:
1. **Periodic Snapshot Materialization**: Background workers compute global and guild rank percentiles every 10 minutes and populate `leaderboard_snapshots`.
2. **Dense Rank Queries**: Point lookups use indexed rank snapshots for $O(1)$ rank retrieval.
3. **Dual Leaderboards**:
   - **Global Leaderboard (`/leaderboard global`)**: Ranks all users across all servers.
   - **Guild Leaderboard (`/leaderboard server`)**: Ranks active members within the current Discord server.

### 6.2. Profile Card 2.0 Rendering (`/profile`)
Rendered dynamically via `@napi-rs/canvas`:
- Discord avatar & display name.
- Server Rank & Global Rank badges.
- Level, Total XP, and visual XP Progress Bar.
- Wallet Credits & Bank Balance.
- Equipped Waifu TCG card thumbnail and serial number.
- Custom Profile Background (`/profile background <url>`): Remote images are fetched, DNS/SSRF validated, scanned for dimensions (1200x400 px limit), and cached locally to eliminate dead image URLs.
