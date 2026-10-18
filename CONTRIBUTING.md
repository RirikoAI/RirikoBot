# Contributing to Ririko AI

Thank you for helping. This page has the short version. The full guide is in [docs/contributing.md](docs/contributing.md).

## Set up

1. Install Node.js 22 or newer, pnpm 10 (run `corepack enable`), Git and [gitleaks](https://github.com/gitleaks/gitleaks). The Git hooks need gitleaks.
2. Fork the repository, then clone your fork.
3. Run `pnpm install`.
4. Follow [SETUP.md](SETUP.md) to create your Discord application and your `.env` file. Run `pnpm installer` to use the setup wizard.
5. Run the bot with `pnpm dev:bot`.

## Make a change

1. Create a branch from `develop`. (`master` holds released code and `1.x` is the old 1.4.0 line; neither takes pull requests.) Name it `feat/<name>`, `fix/<name>` or `chore/<name>`.
2. Keep the change small. One module or one problem for each pull request.
3. Write tests for the code you add or change. Tests that use random numbers must use a fixed seed.
4. Write commit messages in the [conventional commits](https://www.conventionalcommits.org/) style, for example `fix(music): clamp volume requests to 150%`.

## Before you open a pull request

Run these commands. CI runs the same checks, and a pull request is not merged if one of them fails.

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:coverage
pnpm db:check
```

- `pnpm test:coverage` fails if coverage is below a threshold in `vitest.config.ts`. Never lower a threshold. Write tests instead.
- If you changed a database schema in `packages/database/src/schema/`, run `pnpm db:generate` and commit the new migration files. `pnpm db:check` fails without them. Never edit a migration that is already released.
- Open the pull request against `develop`.

More about the checks: [docs/development.md](docs/development.md) and [docs/testing.md](docs/testing.md).

## Edit the documentation

The files in `docs/` are also the documentation site. Run `pnpm docs:dev` to see your edits. `pnpm docs:build` fails on a broken link, and so does CI.

## Ask for help

- Join the [Discord support server](https://discord.gg/UNMZx4qx8G).
- Open an [issue](https://github.com/RirikoAI/RirikoBot/issues) for a bug or an idea.
