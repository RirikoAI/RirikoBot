# Developer Guide

This guide is for people who change the Ririko code. It shows how to check your work, how to change the database, and how to use the command-line tool.

To get a working copy first, follow [SETUP.md](https://github.com/RirikoAI/RirikoBot/blob/develop/2.0.0/SETUP.md). To send your change, read [contributing.md](contributing.md).

---

## 1. How the Code Is Organized

Ririko is a monorepo that uses pnpm workspaces. The code follows these rules:

- **Keep it simple.** Write plain, explicit code. Do not use global singletons or deep inheritance.
- **Type the borders.** Every package border has a strict TypeScript interface.
- **Reuse the structure.** New commands, modules and adapters follow the existing ones. [architecture.md](architecture.md) shows the layout of the packages.

---

## 2. Check Your Work

Run these commands in the repository folder. CircleCI runs the same checks (see [testing.md](testing.md#4-continuous-integration)).

| Command | What it checks |
| --- | --- |
| `pnpm lint` | ESLint. `pnpm lint:fix` fixes what it can. |
| `pnpm format:check` | Prettier. `pnpm format` fixes the files. |
| `pnpm typecheck` | `tsc --noEmit` in every workspace package, and in the test-only projects. |
| `pnpm test` | All Vitest tests, including the integration tests. |
| `pnpm test:coverage` | The same tests with coverage. The report is in `coverage/index.html`. |
| `pnpm test:integration` | Only the bot integration tests and the tests of the fake Discord API. |
| `pnpm test:e2e` | Builds the dashboard, then runs the Playwright end-to-end tests. |

Before you open a pull request:

1. Run the lint check:

   ```bash
   pnpm lint
   ```

2. Run the format check:

   ```bash
   pnpm format:check
   ```

3. Run the type check:

   ```bash
   pnpm typecheck
   ```

4. Run the tests with coverage. A pull request is not merged if a coverage threshold fails ([testing.md section 4.1](testing.md#41-coverage)):

   ```bash
   pnpm test:coverage
   ```

The end-to-end tests start their own fake Discord API on port 3199 and the dashboard on port 3100, with a throwaway SQLite database. So they can run while `next dev` runs on port 3000. They use the Chromium browser of Playwright. If it is missing, install it once:

```bash
pnpm --filter @ririko/web exec playwright install chromium
```

The report is in `apps/web/e2e-results/report/index.html`.

The Git hooks that `pnpm install` sets up run checks for you:

- `pre-commit` blocks `.env` files, scans the staged changes with gitleaks, and runs ESLint and Prettier on the staged files.
- `pre-push` runs `pnpm lint --quiet` and `pnpm format:check`.

Optional: make `git blame` skip the commit that formatted the whole repository:

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

---

## 3. Change the Database

When you change a Drizzle schema in `packages/database/src/schema/`, you must ship the migration in the same change. The steps are in [database.md section 1.3](database.md#13-change-the-schema). In short:

1. Run `pnpm db:generate`.
2. Read the new SQL.
3. Run `pnpm db:check`.
4. Commit all the output.

`pnpm db:push` is a shortcut for your own development database. Never run it against a staging or production database.

---

## 4. The Ririko Command-Line Tool

The tool is in `apps/cli`. In a checkout, run it with `pnpm cli <command>`. In the bot image, run `ririko <command>`, for example `docker exec <bot container> ririko doctor`. Add `--help` to see the options of a command.

| Command | What it does |
| --- | --- |
| `ririko info` | Prints the version and the runtime. |
| `ririko doctor` | Checks Node.js, the database, the Discord token, FFmpeg and the optional integrations. |
| `ririko setup [--docker] [--env-file <path>] [--port <n>] [--listen <host>] [--no-open]` | Opens the step-by-step setup wizard in your browser. In a checkout, `pnpm installer` is the same command. See the table below. |
| `ririko db:migrate [--status\|--dry-run]` | Applies the schema migrations to the database in `DATABASE_URL`. See [database.md section 1.2](database.md#12-who-changes-the-schema). |
| `ririko db:copy --from <sqlite path> [--dry-run\|--yes]` | Copies a 2.0 SQLite database into an empty PostgreSQL database. See [migrations.md section 5](migrations.md#5-move-a-20-sqlite-database-to-postgresql). |
| `ririko migrate:legacy`, `ririko migrate:verify` | Migrate and verify a 1.4.0 database. See [migrations.md section 3](migrations.md#3-migrate-with-the-command-line-tool). |
| `ririko commands:sync` | Registers the slash commands with Discord, without a restart of the bot. Without options it only shows how many slots are used. |
| `ririko commands:reset` | Lists the registered commands. Add `--yes` to remove all of them. |
| `ririko ai:configure` | Sets up the AI providers, keys and models. |
| `ririko image-configure` | Sets up the image providers, keys and daily limits. |
| `ririko stream-configure` | Sets up the stream alert providers. |
| `ririko guild:config <guild_id> [key] [value]` | Lists, reads or sets the settings of a server, with the same rules and audit trail as the dashboard. |
| `ririko economy:config [key] [value]` | Lists, reads or sets the global economy values. |
| `ririko tcg:rules [key] [value]` | Lists, reads or sets the global Waifu TCG rules. |
| `ririko passkeys:reset <user_id>` | Removes the passkeys of a dashboard user and ends their sessions. Add `--yes` to apply it. |
| `ririko user erase <discord_user_id> [--yes] [--include-moderation]` | Deletes or anonymises every row the database holds about one Discord user. Without `--yes` it only prints the row counts. See section 4.1. |
| `ririko bot:maintenance [status\|on\|off\|toggle]` | Shows or changes the maintenance mode of the bot. |

Options of `ririko setup`:

| Option | What it does |
| --- | --- |
| `--docker` | Sets up the Docker install and writes `.env.production`. Without it, the wizard sets up the source install and writes `.env`. |
| `--env-file <path>` | The settings file to read and write. Its name must be `.env` for the source install or `.env.production` for the Docker install. The default is that file in the current folder. |
| `--port <n>` | The port of the wizard, from 1 to 65535. The default is 3999. |
| `--listen <host>` | The address to listen on. The default is `127.0.0.1`. Any other address prints a warning, because other machines can then reach the wizard. |
| `--no-open` | Prints the address and does not open the browser. |

The root `package.json` has more scripts:

| Script | What it does |
| --- | --- |
| `pnpm dev:bot`, `pnpm dev:web` | Run the bot or the dashboard and restart when you save a file. |
| `pnpm doctor` | The same as `ririko doctor`. |
| `pnpm db:reset` | Deletes the development database and builds it again with the default data. |
| `pnpm tcg:card-builder --help`, `pnpm tcg:boss-builder --help` | Build the card and boss catalogs. |
| `pnpm tcg:reset-user <discord_user_id>` | Resets the Waifu TCG progress of one player. |
| `pnpm tcg:simulate` | Runs the offline balance simulation. |
| `pnpm docs:install` | Copies the production compose file and env example into `website/static/install/` (git-ignored; `docs:build` runs it). |

### 4.1. Erase One User's Data

Use `ririko user erase` when a user asks the host to delete their data (see [the privacy policy](legal/privacy.md), section 9). It works on the database in `DATABASE_URL`, for both SQLite and PostgreSQL.

1. The bot can keep running. If the user uses the bot again after the erasure, new rows are created.
2. Run `pnpm cli user erase <discord_user_id>` (in the bot image: `ririko user erase <discord_user_id>`). It prints how many rows it would delete, anonymise or keep in each table, and changes nothing.
3. Read the list. Rows the user holds alone are deleted: AI chats and preferences, consents, balance, inventory, cards, XP, reminders, music history, image jobs, dashboard sessions, passkeys and known browsers. Rows that other people depend on stay and lose the ID: the ledger, trades, giveaway winners, cases where the user is the moderator, audit entries. The ID becomes `erased:<16 hex digits>`, the start of its SHA-256.
4. Moderation cases, notes and warnings about the user are kept, because a server's moderation history must stay complete (privacy policy, section 8.3). Add `--include-moderation` to remove the user from them too: cases get the tombstone, notes and warnings about the user are deleted.
5. Run the same command with `--yes` (and `--include-moderation` if you decided so). The whole erasure is one transaction and writes one audit entry (`user.erase`) with the row counts and the first 16 hex digits of the SHA-256 of the ID, never the ID.
6. Running the command again is safe and changes nothing. A user without data prints zeros.

What the command does not do: it does not touch backups, it does not search free text (the reason of a case, the content of a note, or a message that names the user), and it cannot recall data that an AI provider already received. The bot keeps the acceptance of the terms in memory, so a user may not see the terms notice again until the bot restarts. The full list of columns and the action for each is `USER_DATA_INVENTORY` in `packages/database/src/repositories/user-data-inventory.ts`; [database.md section 4.2](database.md#42-erase-one-users-data) explains it.
