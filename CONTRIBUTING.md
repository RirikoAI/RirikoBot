# Contributing to Ririko AI

Thank you for helping. The full guide is in [docs/contributing.md](docs/contributing.md), and the developer checks are in [docs/development.md](docs/development.md).

## Read and edit the documentation

The documentation is the project wiki. It lives in `docs/` and is built into a Docusaurus site in `website/`.

1. Install dependencies once: `pnpm install`.
2. Run the site with hot reload: `pnpm docs:dev`. It opens at <http://localhost:3000>, or the next free port.
3. To check the built site offline, run `pnpm docs:build` and then `pnpm docs:serve`.

`pnpm docs:build` fails on a broken link, and so does CI.
