# Releasing 2.x and Sunsetting 1.4.0 on Docker Hub

This runbook is for the maintainer. **Agents never push, retag or log in to Docker Hub, never create release tags, and never move `latest`.** They prepare the code and the documents; every step below is done by the maintainer.

## How Releases Work

- The CircleCI `release` workflow (`.circleci/config.yml`) runs only for git tags like `v2.1.3` or `v2.1.3-rc.1`. Branch pushes never run it.
- It builds `bot-runner` and `web-runner`, runs `scripts/docker-smoke.ts` against both, then pushes:
  - `ririkoai/ririkobot` and `ririkoai/ririkobot-dashboard`;
  - as `2.1.3`, `2.1` and `2` for a release, or only `2.1.3-rc.1` for a prerelease (`scripts/release-tags.ts`).
- It never pushes `latest`. Moving `latest` is a manual step (section 6).
- The Docker Hub credentials come from the CircleCI context `dockerhub`.

## 1. One-Time Setup

1. In Docker Hub, create an access token with **Read & Write** scope (Account settings → Personal access tokens).
2. In CircleCI, create an organization context named `dockerhub` (Organization settings → Contexts) with two variables:
   - `DOCKERHUB_USERNAME`: the Docker Hub account that owns `ririkoai`.
   - `DOCKERHUB_TOKEN`: the access token from step 1.
3. Optional: restrict the context to a security group, so only maintainers' tags can use it.
4. Make sure the repository `ririkoai/ririkobot-dashboard` exists on Docker Hub. Create it as public if it does not.

## 2. Keep 1.4.0 Available as `1.4.0`

`latest` is 1.4.0 today. Give that exact image a permanent tag before anything else changes.

```bash
docker login
docker buildx imagetools inspect ririkoai/ririkobot:latest
```

Note the top-level `Digest:`. On 2026-10-01 it was `sha256:c11e8defda3beb390a8ef673b92f82bb958952abfe214d49436388ab6bc9c012` (docs/migrations.md section 2.1). If it differs, find out why before you go on.

```bash
docker buildx imagetools create \
  --tag ririkoai/ririkobot:1.4.0 \
  ririkoai/ririkobot@sha256:<digest from above>
docker buildx imagetools inspect ririkoai/ririkobot:1.4.0
```

`imagetools create` copies the manifest on Docker Hub, with every platform. Nothing is pulled or rebuilt. The image's own package version is 1.4.1. If you want that tag too, repeat the command with `--tag ririkoai/ririkobot:1.4.1`.

## 3. Update the Docker Hub Descriptions

Paste these files into each repository's **Overview** on Docker Hub:

- `docs/dockerhub/ririkobot.md` → `ririkoai/ririkobot`
- `docs/dockerhub/ririkobot-dashboard.md` → `ririkoai/ririkobot-dashboard`

Their links point to the `develop/2.0.0` branch. Once 2.0 is merged into `master`, change `blob/develop/2.0.0/` to `blob/master/` in both files and paste them again.

## 4. Push the First 2.x Release

1. Merge the release into `master`. Check that `package.json` has the version you are about to tag.
2. Optional: tag a prerelease first, so the pipeline can be checked without moving `2`:

   ```bash
   git tag -a v2.0.0-rc.1 -m "Ririko 2.0.0 RC 1"
   git push origin v2.0.0-rc.1
   ```

3. Tag the release:

   ```bash
   git checkout master && git pull
   git tag -a v2.0.0 -m "Ririko 2.0.0"
   git push origin v2.0.0
   ```

4. Watch the `release` workflow in CircleCI. When it is green, check the tags:

   ```bash
   docker buildx imagetools inspect ririkoai/ririkobot:2.0.0
   docker buildx imagetools inspect ririkoai/ririkobot-dashboard:2
   docker buildx imagetools inspect ririkoai/ririkobot:latest   # still the 1.4.0 digest
   ```

5. Publish a GitHub release for the tag that links `docs/upgrading-from-1.4.md`.

If the workflow fails, fix the cause and re-run it from CircleCI. Re-running pushes the same tags again from the same commit. Never reuse a version number for a different commit; tag a new patch version instead.

## 5. Announce the Sunset

Announce, with a fixed date at least 30 days after the 2.0.0 release, that `latest` will move to 2.x:

- in the GitHub release notes and the README;
- in the Docker Hub descriptions (the tag table already says `latest` moves after the sunset; add the date);
- on the support Discord server.

The announcement says:

- `latest` moves to 2.x on that date;
- 1.4.0 stays available as `ririkoai/ririkobot:1.4.0`;
- users should pin a version tag (`2` or `1.4.0`) and follow `docs/upgrading-from-1.4.md`;
- a 2.x bot started with an unchanged 1.4.0 compose file stops with the upgrade steps and leaves the 1.4.0 data untouched.

## 6. Move `latest` After the Sunset Date

Point `latest` at the current 2.x release by digest, for both repositories:

```bash
docker buildx imagetools inspect ririkoai/ririkobot:2       # note the Digest
docker buildx imagetools create --tag ririkoai/ririkobot:latest ririkoai/ririkobot@sha256:<2.x digest>

docker buildx imagetools inspect ririkoai/ririkobot-dashboard:2
docker buildx imagetools create --tag ririkoai/ririkobot-dashboard:latest ririkoai/ririkobot-dashboard@sha256:<2.x digest>
```

Then update the tag tables in `docs/dockerhub/` and on Docker Hub: `latest` is 2.x.

Later releases do not move `latest`. Repeat this section after a release if `latest` should follow it.

## 7. Roll `latest` Back

If 2.x has to be pulled back after `latest` moved:

```bash
docker buildx imagetools create --tag ririkoai/ririkobot:latest ririkoai/ririkobot:1.4.0
docker buildx imagetools inspect ririkoai/ririkobot:latest   # the 1.4.0 digest again
```

For the dashboard, which had no 1.4.0 image, point `latest` back to the previous good 2.x version, or leave it. The 1.4.0 bot does not use the dashboard.

Rolling `latest` back does not touch anyone's data:

- 1.4.0 users never let 2.x write to their `./data` folder.
- Users who upgraded keep their 2.x data in its own volume.
