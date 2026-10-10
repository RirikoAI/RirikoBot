# Releasing 2.x and Sunsetting 1.4.0 on Docker Hub

This runbook is for the maintainer. **Agents never push, retag or log in to Docker Hub, never create release tags, never move `latest`, and never approve a deploy.** They prepare the code and the documents; every step below is done by the maintainer.

## How Releases Work

- The CircleCI `release` workflow (`.circleci/config.yml`) runs only for git tags like `v2.1.3` or `v2.1.3-rc.1`. Branch pushes never run it.
- It builds `bot-runner` and `web-runner`, runs `scripts/docker-smoke.ts` against both, then pushes:
  - `ririkoai/ririkobot` and `ririkoai/ririkobot-dashboard`;
  - as `2.1.3`, `2.1` and `2` for a release, or only `2.1.3-rc.1` for a prerelease (`scripts/release-tags.ts`).
- It never pushes `latest`. Moving `latest` is a manual step (section 6).
- The Docker Hub credentials come from the CircleCI context `dockerhub`.
- After the push it deploys: `deploy-staging` for every release tag, then, only for a final `vX.Y.Z`, a maintainer approval and `deploy-production` (section 8).

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

4. Watch the `release` workflow in CircleCI. Staging deploys by itself after the push; check it, then approve production (section 8). When it is green, check the tags:

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

## 8. Deploy to Staging and Production

After the images are pushed, the same `release` workflow deploys them. CircleCI holds no app secrets and no Docker access on the hosts: it holds one SSH key and one Cloudflare Access service token per host, and it can only ask a host for `deploy <version>` or `status` (`deploy/host/bin/ririko-deploy-ssh.sh`, the key's forced command). The hosts are the two app hosts (staging and production Lightsail) and the Lavalink node that serves them (a separate VPS, STORY-180). Setting up the hosts, the tunnels and the contexts is a one-time job; the private hosting runbook (`docs/hosting.md`, not in the repository) covers it, and recovery.

### 8.1 Pipeline Order

```text
release -> deploy-lavalink-staging -> deploy-staging -> approve-production -> deploy-lavalink-production -> deploy-production
```

| Git tag       | Jobs that run                                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v2.1.3-rc.1` | `release`, `deploy-lavalink-staging`, `deploy-staging`. The pipeline stops there: no approval, no production.                                                                      |
| `v2.1.3`      | `release`, `deploy-lavalink-staging`, `deploy-staging`, then `approve-production` waits for a maintainer, then `deploy-lavalink-production` and `deploy-production` run in turn. |

- `deploy-lavalink-staging` starts by itself once `release` is green, and `deploy-staging` follows it. If either fails, production is never offered.
- Each environment updates its Lavalink instance first: a release ships `docker/lavalink/application.yml`, which pins the Lavalink plugins, so the instance has to run the new files before the bot that needs them starts. A Lavalink restart drops every playing session on that instance, so the host restarts it only when `deploy/lavalink/docker-compose.yml` or `docker/lavalink/application.yml` changed since the last deploy (8.5); most releases leave it alone.
- `approve-production` is a CircleCI approval job (`type: approval`). Open the workflow in CircleCI and press **Approve** after you have checked staging.
- Every job has its own tag filter and ignores all branches, because CircleCI skips a job on tags without one. Branch pushes never deploy. The `ci` workflow is separate and never deploys.
- The `release` job already pushed `2.1` and `2` before you approve production. That is the release design for self-hosters. The hosts always deploy the exact version of the tag (`2.1.3`), never a moving tag.
- Re-running a failed deploy job is safe: the host starts from its recorded state. Deploying the version that already runs is allowed.

### 8.2 CircleCI Contexts

Create four organization contexts: `deploy-staging` and `deploy-production` for the app hosts, and `deploy-lavalink-staging` and `deploy-lavalink-production` for the Lavalink node (8.5). The `deploy` job in `.circleci/config.yml` is the same for all four (its `host` parameter is `app` or `lavalink`); each context supplies its host's values, with the same five variable names.

| Variable                      | Value                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `DEPLOY_SSH_HOST`             | The host's SSH tunnel hostname, for example `ssh-staging.example.com`. Not an IP address.                                |
| `DEPLOY_SSH_KEY_B64`          | The private key of the `deploy` user, base64 on one line: `base64 -w0 < deploy_key` (CircleCI values are single-line). |
| `DEPLOY_KNOWN_HOSTS`          | The host key, one line, under the name in `DEPLOY_SSH_HOST` (see below).                                               |
| `TUNNEL_SERVICE_TOKEN_ID`     | The Client ID of the Cloudflare Access service token.                                                                  |
| `TUNNEL_SERVICE_TOKEN_SECRET` | The Client Secret of that token.                                                                                       |

- Use a different key and token for each context, so a leaked staging value cannot reach production.
- **SSH key.** Make a dedicated key pair (`ssh-keygen -t ed25519 -N '' -f deploy_key`). The public half goes to the host with `bootstrap.sh --deploy-key` (it becomes a forced-command key). Delete the private file once the base64 copy is stored.
- **Host key.** The job pins it with `StrictHostKeyChecking=yes` and never trusts a key on first use. On the host run `echo "ssh-staging.example.com $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"` (with that host's own hostname) and store the output line.
- **Service token.** In Cloudflare Zero Trust, create a service token and make sure the Access application of the SSH hostname has a **Service Auth** policy that includes it. `cloudflared access ssh` reads the two values from the environment variables above, so the secret never appears on a command line or in the process list.
- **Restrict `deploy-production` to maintainers.** In CircleCI open Organization settings, Contexts, `deploy-production`, Security, and add a **security group** that holds only the maintainers. A job that uses a restricted context runs only for a member of that group, so a collaborator who is not a maintainer cannot make production deploy, even if they press **Approve**. The approval job has no context of its own, so this restriction on `deploy-production` is what limits it. Restrict `deploy-lavalink-production` the same way. Restricting the staging contexts is optional.
- Agents never create these contexts, push tags or approve a deploy. The maintainer does all of it.

### 8.3 What the Job Does

1. `cimg/base:current` (no checkout) installs a pinned `cloudflared` from its GitHub release (`cloudflared-linux-amd64.deb`), checks the `.deb` against a committed sha256 with `sha256sum --check`, then installs it with `dpkg`.
2. It checks that all five variables exist, then writes the key (mode 0600) and `known_hosts`.
3. It runs `ssh` with `StrictHostKeyChecking=yes`, `IdentitiesOnly=yes` and `ProxyCommand="cloudflared access ssh --hostname %h"`, sending `deploy ${CIRCLE_TAG#v}` to `deploy@$DEPLOY_SSH_HOST`. The host prints its progress and the job shows it. On an app host `ririko-deploy` runs, in this order: download the release's compose files, dump the database (when a release runs), pull the images, run `ririko db:migrate` from the new bot image while the previous release still runs (`ririko-deploy` runs every compose call with `DB_AUTO_MIGRATE=false` in its environment, which wins over the host's env file, so this is the only thing that migrates on a host; the compose file itself defaults to `true` for self-hosters), start the stack, wait for the bot and the dashboard to be ready. It starts the Postgres service first when nothing runs yet (a first deploy). `ririko-deploy status` also prints the database's latest and pending migration ids. 8.6 explains the migration step, 8.7 how to restore the pre-deploy dump, and 8.8 is the one-time checklist for a database that predates migration records.
4. The job fails with the host's exit status (8.4) and prints what it means.

To update `cloudflared`, change `CLOUDFLARED_VERSION` and `CLOUDFLARED_SHA256` together in the `ssh-host` command of `.circleci/config.yml`. Download the file yourself (`gh release download <version> --repo cloudflare/cloudflared --pattern cloudflared-linux-amd64.deb`), run `sha256sum` on it and compare the result with the digest GitHub shows for the asset. The pinned release is 2026.9.3.

### 8.4 Host Exit Codes

`ririko-deploy` (`deploy/host/bin/ririko-deploy.sh`) keeps these codes stable, and the job passes them through:

| Exit | Meaning                                                                                                                                                                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Deployed: the bot and the dashboard both reported ready, and the host recorded the version.                                                                                              |
| 1    | Failed before the running release was touched (bad tag or file, pre-deploy dump failed, invalid `ririko.conf`). Nothing changed; read the output and fix the cause.                      |
| 2    | The host rejected the command or the version: the tag is not `X.Y.Z` or `X.Y.Z-prerelease`, or the job sent something other than `deploy <version>` or `status`. A Lavalink host also refuses an instance it does not run (8.5). |
| 3    | The host's lock stayed busy for `DEPLOY_LOCK_WAIT` seconds (another deploy, backup or watchdog run holds it). Nothing changed. Run the job again when that run has finished.              |
| 4    | The new release did not become ready, so the host started the previous release again. The database was **not** restored and keeps the new release's migrations (they only add, so the previous release runs on them); the output names the pre-deploy dump (restore it only if you must, 8.7). On a Lavalink host: `/version` did not answer, and the previous release of that instance runs again. |
| 5    | The new release did not become ready and there is no previous release (first deploy, or the same version again). Nothing is running. Fix it on the host and deploy again.               |
| 6    | The database migration of the new release failed (`ririko db:migrate` exit 1) or was refused by its downgrade guard (exit 2: the database holds a migration this release does not know). The host started and stopped nothing; the previous release keeps running. The output has the migration's own output and names the pre-deploy dump. Fix the cause and tag a new patch version (8.6). |
| 255  | `ssh` itself failed: the tunnel, the Access service token, the key or the pinned host key.                                                                                               |

After 4, production runs the old version: fix the cause and tag a new patch version; the database is restored only when the failed release damaged data (8.7). After 6, production also runs the old version, untouched; the cause is in the migration output (`ririko db:migrate` on the host shows the same state with `--status`), and a guard refusal means the tag is older than what the database already holds (8.6). After 5, log in to the host (`ririko-deploy status`, `docker compose -p ririko ps`, `/opt/ririko/deploy.log`) before you deploy again.

To see what a host runs without deploying, run `ssh deploy@<DEPLOY_SSH_HOST> status` through the same `cloudflared` ProxyCommand.

### 8.5 The Lavalink Node

The Lavalink VPS runs one container per environment (`lavalink-production` on port 2333, `lavalink-staging` on 2334, compose project `ririko-lavalink`) and is reached through its own tunnel hostname, for example `lavalink-staging-ssh.example.com`. `bootstrap.sh --role lavalink` sets it up and writes `RIRIKO_ROLE=lavalink` into `/etc/ririko/ririko.conf`; see `deploy/host/ririko.conf.example` for the keys below.

- **One key per instance.** `bootstrap.sh --role lavalink --deploy-key-staging "<key>"` (and `--deploy-key-production`) writes `restrict,command="/usr/local/bin/ririko-deploy-ssh staging"` (or `production`) for that key. The instance comes from that argument in the root-owned `authorized_keys`, never from the command CI sends, so the staging key can only update the staging instance. CI still sends only `deploy <version>` or `status`. Put the key in the matching context: the staging key and `DEPLOY_SSH_HOST=lavalink-staging-ssh.<domain>` in `deploy-lavalink-staging`, the production ones in `deploy-lavalink-production`.
- **Which instances a host runs.** `LAVALINK_INSTANCES` (`production`, `staging` or both) names them, or else the Lavalink ports in the `WG_PEERS` entries do (2333 is production, 2334 is staging). Today the VPS runs staging only; when production Lavalink moves to its own VM, that VM lists production only, and its own context points at it. A deploy for an instance the host does not run exits 2, and the watchdog checks only the instances the host runs.
- **Env files.** `/opt/ririko/lavalink-<instance>.env` (root, 0600) holds `LAVALINK_PASSWORD` and the `SPOTIFY_*` values (`deploy/lavalink/lavalink.env.example`), one file per instance with different passwords. The deploy refuses a missing file or an empty password with exit 1.
- **What a deploy does.** `ririko-deploy deploy <version> <instance>` downloads `deploy/lavalink/docker-compose.yml` and `docker/lavalink/application.yml` of the tag into `releases/<version>/` (repository layout) and compares their sha256 with `state/lavalink-<instance>.sha`.
  - Both equal: it prints `unchanged`, records the version, and exits 0 without touching the container, so no player is dropped.
  - Otherwise: it pulls and recreates only `lavalink-<instance>` (`docker compose -p ririko-lavalink up -d lavalink-<instance>`, which also runs that instance's one-shot plugin-volume init service when the compose file has one, and never the other instance), then waits up to `LAVALINK_READY_TIMEOUT` (180) seconds for `GET http://<WG_ADDRESS>:<port>/version` to answer 200 with the instance's password. The password goes to `curl` on stdin, never on a command line. When it never answers, the previous release of that instance starts again (exit 4), or exit 5 when there is none.
  - Same lock and order as the app deploy (settings, env file, lock, temporary directories, state), so a watchdog or backup run delays it instead of failing it.
- **Watchdog.** With `RIRIKO_ROLE=lavalink`, `ririko-watchdog` pings `HEALTHCHECK_PING_URL` only when every configured instance has a running container and its `/version` answers. Every failed check posts `/fail` with the reason; after 3 failed checks in a row (the counter is `/opt/ririko/state/watchdog-lavalink-<instance>`) it restarts that container and starts counting again.
- **Heap.** `LAVALINK_PRODUCTION_HEAP` and `LAVALINK_STAGING_HEAP` in `ririko.conf` set the JVM heap (for example `768m` for production while both instances share a small VM).

### 8.6 Migrations on a Host

The host applies the schema migrations of the release it deploys as its own step (ADR-015, decision 9), between the pull and `up -d` (the order is in 8.3). `ririko-deploy` runs every compose call with `DB_AUTO_MIGRATE=false`, so the bot never migrates on a host: it only checks the schema, and `ririko db:migrate`, run once from the new bot image, is the only schema writer. Self-hosters run the same compose file without that override and keep migrate-on-start (`docs/deployment.md` section 2.3).

- **The old release keeps running during the migration.** Every migration follows the expand rule: it leaves the schema usable by the previous release (new tables, new nullable or defaulted columns, indexes, backfills). Destructive changes ship in a later release as a `-- ririko:contract` migration. The host starts the new containers only after the migration finished.
- **Each migration is one transaction.** On PostgreSQL the DDL is transactional, so a failing migration rolls back by itself and the database stays at the last migration that succeeded. Migrations of the same run that already committed stay applied; they only add. The adoption of an old database (8.8) is one transaction as well.
- **Exit 6, `ririko db:migrate` exit 1: the migration failed.** The host started and stopped nothing, and the old release still runs on the database. The job output and `/opt/ririko/deploy.log` hold the migration's own output (each line starts with `db:migrate:`); the exit message repeats its last line and names the pre-deploy dump. Nothing needs restoring. Fix the cause, which is usually the migration itself, and tag a new patch version. When the cause is a one-off problem in the data of that host, fix it there and run the failed job again.
- **Exit 6, `ririko db:migrate` exit 2: the downgrade guard refused.** The database already holds a contract migration that the release of the tag does not contain, so the tag is older than the database (for example a re-tag of an old version after a release with a contract migration). Nothing was changed. Deploy a newer version that contains the migration. Do not restore a dump just to get past the guard.
- **First deploy.** When nothing runs yet, the host starts the `postgres` service itself before the migration, and takes no pre-deploy dump (the exit message then says `Pre-deploy dump: none taken`).
- **`ririko-deploy status`** prints the container states and the `ririko db:migrate --status` lines of the running release: `Latest`, `Pending`, `Unknown` (recorded by a newer release) and `Adopted`. After a good deploy `Pending` is `(none)`.

What a rollback does and does not undo (exit 4):

- **It undoes the code.** The host starts the previous release again from `releases/<previous>` (it tries to pull its images and uses the ones already on the host when the pull fails), without running a migration, and leaves `state/current` on that version.
- **It does not undo the database.** Migrations are forward-only: there is no down migration, and the image of the previous release could not migrate backwards. The database keeps the expand migrations of the failed release, and the previous release runs on them. It keeps every row that the failed release wrote as well.
- **A contract migration breaks the rollback.** The downgrade guard also stops a bot that only checks (`DB_AUTO_MIGRATE=false`), so the previous release does not start on a database that holds a contract migration it does not know. The log then says `ROLLBACK FAILED` and nothing runs. Deploy the newer release; restoring the dump (8.7) is the last resort. Treat the first release with a contract migration as one that has no rollback, and check its pre-deploy dump before you approve production.
- **The pre-deploy dump is the only way back in time.** It is a snapshot taken just before the deploy. Restoring it also removes everything written after it, by the old release (which ran during the migration) and by whichever release ran since (8.7).

### 8.7 Restoring the Pre-Deploy Dump

Restore only when the failed or unwanted release damaged data, or when a contract migration is on the database and the previous release must run. After a failed deploy that left the old release running (exit 1, 3, 4 or 6) there is nothing to restore.

What the dump is: before it pulls anything, `ririko-deploy` runs `pg_dump -Fc` inside the `postgres` container of the running release (`-U "$POSTGRES_USER" -d "$POSTGRES_DB"`) into `/opt/ririko/backups/predeploy/<UTC timestamp>-from-<version>.dump` (root only, mode 0600). `<version>` is the release that ran when the dump was taken. The host keeps the newest five and prunes the older ones. It takes no dump when no release runs. The format is the custom one, so restore it with `pg_restore`, not `psql`. The nightly `ririko-backup` (restic, off-site) holds a similar dump; its restore is in the private hosting runbook.

Run these as root on the host, in one shell. They follow what `ririko-deploy` does (project `ririko`, the compose files of the release, the host env file).

1. **Pick the dump and set up.** Take the newest dump from before the incident, and the version in its name:

   ```bash
   cd /opt/ririko
   ls -l backups/predeploy/
   cat state/current
   V=<the version in the dump file name>
   DUMP=/opt/ririko/backups/predeploy/<the file>
   files=(); while read -r f; do files+=(-f "/opt/ririko/releases/$V/$f"); done < "releases/$V/.compose-files"
   rc() { RIRIKO_VERSION=$V RIRIKO_ENV_FILE=/opt/ririko/.env.production DB_AUTO_MIGRATE=false \
     docker compose -p ririko "${files[@]}" --env-file /opt/ririko/.env.production "$@"; }
   ```

   `V` is normally the content of `state/current`. The env file is `/opt/ririko/.env.production` unless `RIRIKO_ENV_FILE` in `/etc/ririko/ririko.conf` says otherwise; use the same path in `rc`. The restore returns the database to the schema of that release, so you start that release's images, not the failed one's.

2. **Check the dump.** `rc exec -T postgres pg_restore --list < "$DUMP" | head` prints its table of contents. An empty or failing listing means a bad file: take an older dump.
3. **Keep other jobs out.** `exec 9>/run/lock/ririko-deploy.lock; flock -w 300 9` takes the lock that `ririko-deploy`, `ririko-backup` and `ririko-watchdog` share. It is released when the shell exits. The watchdog skips its run silently while it is held.
4. **Dump the current state** if anything in it might still matter. Under `umask 077`: `rc exec -T postgres sh -c 'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "/opt/ririko/backups/before-restore-$(date -u +%Y%m%dT%H%M%SZ).dump"`. The file sits outside `predeploy/`, so nothing prunes it.
5. **Stop the writers, keep the database.** `rc stop bot web`. `postgres` stays up. Nothing else may be connected, because `--clean` drops objects that a connection still uses.
6. **Restore into the database.**

   ```bash
   rc exec -T postgres sh -c 'exec pg_restore --clean --if-exists --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$DUMP"
   ```

   `--clean --if-exists` drops each object of the dump before it recreates it, and `--single-transaction` makes the restore all or nothing, so a failure leaves the database as it was. The variables are the container's own, which is why the command is in single quotes. The dump contains the migration records (`ririko_schema_migrations`), so the restored database says exactly which migrations it holds.
7. **Start the matching release.** `rc pull` (only when its images are gone), then `rc up -d --no-build --remove-orphans`. Wait until `rc ps` shows `bot` and `web` as `healthy`, and check `ririko-deploy status`: `Pending` must be `(none)`.
8. **Fix the cause.** The `state/` files of the host are untouched, so `current` still names `V`. Tag a new patch version with the fix; the next deploy dumps, migrates and starts as usual. If `V` is not `state/current`, deploy a fixed version straight away instead of leaving the host on `V`.

What it costs: every change since the dump is gone, including what users did while the old release ran during the migration. Tell the maintainer before you restore production.

### 8.8 Adopting a Database That Predates Migration Records (Staging, One Time)

Staging was built before the migration runner existed: it has tables but no `ririko_schema_migrations` table. The first deploy with the runner does not run `0000_baseline` on it; it adopts the database (`docs/database.md` section 1). It compares the live schema with the baseline, adds what is missing (tables, indexes, nullable or defaulted columns) in one transaction, and records `0000_baseline` as applied. Anything it cannot repair additively refuses the adoption and changes nothing. Do this once on staging, and the same way on any other host whose database predates the runner. A database that the runner created from empty is never adopted, but look at `status` on production before the first approval.

1. **Take a manual dump first.** The deploy takes its own, but the host keeps only the newest five of those. A manual dump is yours and survives repeated deploys. On the host, as root, under `umask 077`: run steps 1 and 4 of 8.7 (with `V` set to the content of `state/current`) and name the file `backups/before-adoption-<UTC>.dump`. Check that it is not empty and that `rc exec -T postgres pg_restore --list < <file> | head` lists tables.
2. **Deploy the first release with the runner as a prerelease tag.** A tag like `v2.1.3-rc.1` runs `release`, `deploy-lavalink-staging` and `deploy-staging`, and stops before production (8.1).
3. **Read the adoption lines** in the job output or in `/opt/ririko/deploy.log` (each starts with `db:migrate:`), after the line `migrating the database from the <version> bot image`. A good adoption looks like this:

   ```text
   Target: PostgreSQL, host postgres, port 5432, database <database>
   Adoption: the database has tables but no migration records; recorded 0000_baseline as applied.
     N table(s) created
     N column(s) added
     N index(es) created
   ✔ Adopted the database and applied N migration(s): <ids>
   ```

   The last line reads `✔ Adopted the database: recorded 0000_baseline as applied.` when the release has no migration after the baseline. A `⚠` note under the counts is a difference that was left as it is (for example a column type with the same storage); read each one. There is no `Backup` line on PostgreSQL: the pre-deploy dump is the backup. The deploy then logs `the database is migrated for <version>`, starts the stack and waits for ready.
4. **Check the result with `ririko-deploy status`** (`ssh deploy@<DEPLOY_SSH_HOST> status`, through the same ProxyCommand as the job). Expect `Pending: (none)`, `Unknown: (none)` and `Adopted: yes (the database existed before migration records)`, and `healthy` containers. Open the dashboard once: it answers ready only on a migrated schema.
5. **Then release as usual.** Tag the plain version; the pipeline offers production after the approval job.

When adoption refuses, the job fails with exit 6 and prints a report:

```text
✖ Migration failed: The existing database cannot be adopted. Nothing was changed.
  - <one line per problem>
```

The old release still runs, and the database is exactly as it was. The problems are a missing `NOT NULL` column without a default, a column that cannot be added, a column type that differs from the baseline (PostgreSQL compares types exactly), and duplicate card serials.

1. Read the whole report. It lists every problem at once, not only the first.
2. Fix each one, with the manual dump in hand. Repair a schema problem on the staging database by hand, in a transaction, so that it matches `packages/database/migrations/pg/0000_baseline.sql` of the tag (add the column with a default, or correct the type). Resolve duplicate serials by deciding which owner keeps each one. If the same problem would hit every old database, fix the adoption in code and tag a new prerelease instead.
3. To check a fix without a new deploy, run the plan on the host: `rc run --rm --no-deps -T bot ririko db:migrate --dry-run </dev/null`, with `V` set to the tag that failed (its release files are already on the host; the `rc` helper is in step 1 of 8.7). It prints the same report, or the plan, and changes nothing.
4. Deploy again. When only the database changed, run the failed job again (the host downloads the release again and starts from its recorded state). When the code changed, tag the next prerelease (`-rc.2`).
