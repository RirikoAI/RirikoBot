# Command System & Interactive Help Specification (Ririko AI 2.0.0)

## 1. Dual-Dispatch Architecture & Parity
In Ririko AI 2.0.0, every user-facing command supports both **Slash Commands** (`/command`) and **Prefix Commands** (`!command` or custom guild prefix). Business logic is never implemented twice.

```text
User Interaction
 ├── /play query: YOASOBI Idol (Slash Interaction)
 └── !play YOASOBI Idol        (Message Content)
        │
        ▼
 Unified Command Router (O(1) Hash Map Lookup)
        │
        ▼
 Middleware Pipeline (RateLimit, Cooldown, GuildCheck, PermCheck)
        │
        ▼
 Application Command Execution Context
        │
        ▼
 Domain Application Services
```

---

## 2. Command Metadata Schema

Every command exposes machine-readable metadata consumed by the command router, interactive help system, and web dashboard:

```typescript
export interface CommandMetadata {
  name: string;
  category: CommandCategory;
  description: string;
  aliases: string[];
  slashEnabled: boolean;
  prefixEnabled: boolean;
  defaultMemberPermissions?: bigint;
  userPermissions?: string[];
  botPermissions?: string[];
  cooldownSeconds: number;
  rateLimit: { max: number; windowSeconds: number };
  usage: string;
  examples: string[];
  isOwnerOnly?: boolean;
  isGuildOnly?: boolean;
  isHidden?: boolean;
  options?: CommandOptionDefinition[];
}
```

---

## 3. Middleware Pipeline

Prior to command invocation, the dispatcher passes the execution context through an extensible middleware chain:
1. **Maintenance Middleware**: Blocks command execution if maintenance mode is enabled (except for bot developers).
2. **Module Toggle Middleware**: Verifies whether the command's parent module is enabled for the guild.
3. **Channel Override Middleware**: Checks if the command is disabled in the specific channel.
4. **Rate Limit & Cooldown Middleware**: Evaluates per-user and per-channel token buckets, returning ephemeral time-to-reset warnings if exceeded.
5. **Centralized Permission Middleware**: Evaluates Discord bitfields, role hierarchy, and blacklists.

---

## 4. Interactive Help System (`/help`)

The legacy static help embed is replaced by an interactive, component-driven help browser generated dynamically from the command registry:

```text
┌───────────────────────────────────────────────┐
│ Ririko AI Help Center                        │
│ Browse commands by category or search below.  │
│                                               │
│ [ Select Category ▼ ]                         │
│   • AI Chatbot                                │
│   • Music & Audio                             │
│   • Moderation & Safety                       │
│   • Waifu TCG & Gamification                  │
│   • Economy & Leveling                        │
│   • Server Utilities                          │
│   • Stream Alerts                             │
│                                               │
│ [◀ Previous] [Page 1/4] [Next ▶] [🔍 Search] │
└───────────────────────────────────────────────┘
```

### Detailed Command Inspector:
Selecting a specific command displays:
- Name, category, and full description.
- Slash syntax: `/music play <query>`
- Prefix syntax: `!play <query>`
- Aliases: `!p`, `!queue`
- Required permissions (User & Bot).
- Cooldown and rate limits.
- Real-world usage examples.
- Direct link to configure the module on the web dashboard.
