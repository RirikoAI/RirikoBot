# Handover Note: [STORY-140] Automatic Role System & Interactive Reaction Roles (Buttons & Select Menus)

## 1. Executive Summary
**STORY-140** delivers a complete modernization and expansion of Ririko's role automation suite under **EPIC-014** (Server Utilities, AutoRoles & Community Systems). It preserves 100% backward compatibility with legacy 1.4.0 reaction role commands while introducing modern Discord component roles (Buttons & Dropdown Select Menus), multi-mode behavior (Toggle, Give Only, Remove Only, Unique Radio Groups), automated join roles for humans vs. bots, a one-click verification gateway, and temporary expiring roles with a background sweeper.

---

## 2. Completed Tasks Breakdown
1. **`TASK-1401` (Database Schemas & Dual-Dialect Repositories)**:
   - Extended `reaction_roles` table with `type`, `mode`, `groupId`, `label`, and `description`.
   - Created `guild_auto_roles` table for human and bot join roles plus verification gateway config.
   - Created `temporary_roles` table with `expiresAt` index for TTL role management.
   - Implemented `ReactionRoleRepository` and `AutoRoleRepository` across PostgreSQL and SQLite.
2. **`TASK-1402` (AutoRole Engine)**:
   - Implemented `AutoRoleService` with permission/hierarchy validation (`hasManageRolesPermission`, `isValidAssignableRole`, `canManageMember`).
   - Implemented automated join roles on member join (differentiating human users from bot accounts).
   - Implemented verification gateway (`handleVerification`) and temporary expiring roles (`assignTemporaryRole`, `removeTemporaryRole`, `sweepExpiredRoles`).
3. **`TASK-1403` (ReactionRole Engine)**:
   - Implemented `ReactionRoleService` handling emoji reactions (`handleReactionAdd`, `handleReactionRemove`), interactive button components (`handleButtonInteraction`), and dropdown select menus (`handleSelectMenuInteraction`).
   - Implemented 4 modes: `TOGGLE`, `GIVE_ONLY`, `REMOVE_ONLY`, and `UNIQUE` (radio groups).
4. **`TASK-1404` (Dual-Dispatch Commands)**:
   - `/create-reaction-role` & `!create-reaction-role`: binds messages to roles via emoji or button with custom modes.
   - `/reaction-roles` & `!reaction-roles`: lists configured reaction roles in the guild and supports removal (`remove <id>`).
   - `/autorole` & `!autorole`: configures `humans`, `bots`, `verify`, displays settings (`show`), disables rules (`disable`), and posts verification button prompt (`send-verify`).
   - `/temprole` & `!temprole`: assigns temporary roles (`add`), removes them (`remove`), and lists active temporary roles (`list`).
5. **`TASK-1405` (Gateway Listeners & Wiring)**:
   - `reaction.listener.ts`: listens to `messageReactionAdd` and `messageReactionRemove`, handles partials, resolves candidate emoji identifiers, and invokes `ReactionRoleService`.
   - `member.listener.ts`: triggers `AutoRoleService.handleMemberJoin` on `guildMemberAdd`.
   - `main.ts`: registers commands, wires listeners, routes `rr:btn:`, `rr:select:`, and `verify:btn:` components, and manages background sweeper lifecycle.

---

## 3. Verification & Quality Gates
- **Automated Tests**:
  - `packages/database/src/repositories/reaction-role.repository.test.ts`: 5/5 passed.
  - `packages/database/src/repositories/autorole.repository.test.ts`: 6/6 passed.
  - `packages/services/src/roles/__tests__/reaction-role.service.test.ts`: 6/6 passed.
  - `packages/services/src/roles/__tests__/autorole.service.test.ts`: 10/10 passed.
  - `apps/bot/src/commands/roles/__tests__/role-commands.test.ts`: 15/15 passed.
  - `apps/bot/src/listeners/__tests__/role-listeners.test.ts`: 5/5 passed.
  - **Total**: 47/47 passing tests.
- **Typecheck**:
  - `pnpm typecheck` passed with 0 errors across all monorepo packages.
- **Linting**:
  - `pnpm eslint` passed with 0 errors across all role files.

---

## 4. Manual Testing Instructions for User
You can now test the following features directly in your Discord testing server:

### A. Reaction Roles (Legacy Parity + Modern Components)
1. **Emoji Reaction Role**:
   - Post any message and copy its ID.
   - Run `/create-reaction-role message-id:<id> emoji:🎮 role:@YourRole` (or `!create-reaction-role <id> 🎮 @YourRole`).
   - React with 🎮: verify you get the role.
   - Unreact: verify the role is removed.
2. **Button Reaction Role**:
   - Run `/create-reaction-role message-id:<id> emoji:🔴 role:@Red type:button mode:toggle`.
   - Click the button: verify role is granted.
   - Click again: verify role is removed.
3. **Unique Radio Group**:
   - Run `/create-reaction-role message-id:<id> emoji:🔵 role:@Blue type:button mode:unique group:colors`.
   - Clicking between `@Red` and `@Blue` should toggle between the two without keeping both.
4. **List & Remove**:
   - Run `/reaction-roles` to view all bindings.
   - Run `/reaction-roles action:remove id:<id>` to delete a binding.

### B. AutoRoles (Join Roles & Verification Gateway)
1. **Human & Bot Join Roles**:
   - Run `/autorole action:humans role:@Member`.
   - Run `/autorole action:bots role:@Bots`.
   - Run `/autorole action:show` to view the configuration.
2. **Verification Gateway**:
   - Run `/autorole action:verify role:@Verified`.
   - Run `/autorole action:send-verify channel:#welcome message:Click below to enter!`.
   - Click the **Verify** button: verify `@Verified` is assigned with ephemeral confirmation.

### C. Temporary Expiring Roles
1. **Assign Temporary Role**:
   - Run `/temprole action:add user:@User role:@TempVIP duration:2m`.
   - Verify the role is assigned immediately.
   - Wait 2 minutes: verify the background sweeper revokes the role automatically.
2. **List & Remove**:
   - Run `/temprole action:list` to view active temporary roles and their countdown timestamps.
   - Run `/temprole action:remove user:@User role:@TempVIP` to manually revoke.
