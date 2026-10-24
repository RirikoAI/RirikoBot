---
name: release
description: Release a new Ririko version. Use for /release, and for any plain request to release, tag, publish or ship a version ("release 2.2.0", "let's release", "cut a release", "tag v2.2.0"). Starts in plan mode, then runs the scripted release with one stop for the maintainer to merge the PR.
argument-hint: '[x.y.z]'
---

# Release Ririko

You run the whole release by default: version bump, release PR, tag, waiting for the images, GitHub release and moving `latest`. The scripts do the work and check the real state before every step. Do this by hand (`docs/release.md` section 4.2, "By Hand") only when the maintainer asks to release by hand.

The maintainer does two things: merges the release PR, and approves production in CircleCI. You never merge the PR and you never approve production.

The version comes from the argument (`$ARGUMENTS`) or from your proposal in the plan.

## 1. Enter plan mode first

Call `EnterPlanMode` before anything else, even when the session runs in auto mode. Nothing is bumped, committed, pushed or tagged until the maintainer approves the plan.

## 2. Gather the facts (read only)

1. Check the prerequisites and put the result in the plan:
   - `gh auth status` shows a logged-in account that can create pull requests and releases.
   - `docker` is logged in to Docker Hub with push rights to `ririkoai/ririkobot` and `ririkoai/ririkobot-dashboard` (`release:publish` moves `latest` with `docker buildx imagetools create`). If the maintainer must run `docker login` first, say so in the plan.
   - The account can push to `develop` and push tags to `origin`.
   - The working tree is clean, the branch is `develop` and it equals `origin/develop`. If not, say what is wrong. Do not fix it by discarding changes.
2. Run `pnpm release:notes <x.y.z>` with the version you propose (or the argument). It writes the draft to `.local/release-notes-v<x.y.z>.md` (git-ignored) and lists the merged PRs, the tickets that became DONE, the new migrations and the image tags. Read the draft. If you change the version, run the command again: the file name follows the version.
3. Read what changed, not only the titles: new commands or options, new or changed environment variables and compose settings, new intents or Discord permissions, new migrations (note any `-- ririko:contract` migration), and anything that needs a step from the people who run the bot.

## 3. Write the plan

The plan has these parts. Then call `ExitPlanMode` and wait for the maintainer.

- **Version:** the proposed `x.y.z` and why. Pick it from the tickets by semver: a breaking change to commands, settings or data is a major; a Story, a new feature or a new migration is a minor; only fixes and chores is a patch. Name the tickets or PRs that decide it. Prereleases are not supported by the scripts.
- **Features:** one line each, in user words.
- **Tickets:** the DONE tickets since the last tag, grouped by Story, Bug and the rest. Cut Tasks that only belong to a Story already listed.
- **Bug fixes.**
- **Migrations:** the new files for both dialects, and whether any is destructive.
- **Discord or config changes:** new commands, permissions, intents, environment variables, compose or Lavalink changes, and what an operator must do.
- **Release notes:** the full edited text of the notes, ready to be the GitHub release body. Keep the style of earlier releases. Do not invent items that are not in the range.
- **Prerequisites:** the checklist result from step 2.
- **Steps:** the commands of sections 4 to 6 below, and the one stop for the PR.

## 4. Prepare (after approval)

1. Write the approved notes text to `.local/release-notes-v<x.y.z>.md`.
2. Pass the commit attribution line of this session with `--trailer`. It is the line the session's attribution reminder gives for commit messages, for example `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Use the line of your own model, not the script default. Run the dry run first, read it, then run the real command:

   ```bash
   pnpm release:prepare <x.y.z> --notes .local/release-notes-v<x.y.z>.md --trailer "<attribution line>" --dry-run
   ```

   ```bash
   pnpm release:prepare <x.y.z> --notes .local/release-notes-v<x.y.z>.md --trailer "<attribution line>"
   ```

   It refuses a dirty tree, a branch other than `develop`, a `develop` that differs from `origin/develop`, a version that is not greater, and an open develop-to-master PR. It then bumps the version in every place, runs build, typecheck, the version tests and `format:check`, commits the bump to `develop`, pushes it and opens the PR from `develop` to `master`.
3. **If a check fails, the version bump stays in the working tree and nothing is committed.** Read the error and fix the cause on its own ticket if it is a code problem. Then the coordinator reverts the bump before running prepare again, because prepare refuses a dirty tree: put the old version back in the version files (`scripts/release/version-files.ts` lists them) and nothing else. Never run `git checkout`, `git restore`, `git reset`, `git stash` or `git clean`, and ask the maintainer before you discard any other change.

## 5. Stop for the maintainer

Give the maintainer the PR link and say exactly this: merge it with a merge commit (not squash, not rebase), then tell me. Do nothing else until the maintainer says it is merged. Do not poll for the merge, merge the PR yourself or enable auto-merge.

## 6. Publish (after the merge)

1. Run the dry run first and read it. It checks that `origin/master` holds the version in every place and that the PR is merged, and it prints every step:

   ```bash
   pnpm release:publish <x.y.z> --dry-run
   ```

2. Then the real run:

   ```bash
   pnpm release:publish <x.y.z>
   ```

   It tags `origin/master`, pushes the tag (this starts the CircleCI `release` workflow), waits for both images on Docker Hub (up to 40 minutes), publishes the GitHub release as Latest only after that, moves `latest` of both images and prints the staging status. The wait is long: run it in the background and watch the output.
3. If it stops or times out, read the message and run the same command again. It looks at the real state and skips what is done. Never reuse a version number for another commit.
4. When it ends, report to the maintainer: the release link, the image tags, the staging status. Say that approving production in CircleCI is theirs. Never click or call `approve-production`.

## Out of scope

The npm `ririko` starter release (`npm-v*` tags, `docs/release.md` section 11) and the production deploy approval.
