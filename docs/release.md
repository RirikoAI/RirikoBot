# Release Ririko

This guide is for the maintainer. It explains how to publish a release, how to deploy it to staging and production, and how to recover when a deploy fails.

**Agents never push, retag or log in to Docker Hub. They never create release tags, never move `latest` and never approve a deploy.** They prepare the code and the documents. The maintainer does every step below.

For launch day, follow the checklist in section 10. For the npm package (`npx ririko`), follow section 11.

## Branches

- `develop` is the base of every pull request. Work lands here first.
- `master` holds released code. You merge `develop` into `master` for a release and tag the release on `master`. The published documentation (ririko.ai) is built from `master`.
- `1.x` holds the 1.4.0 line. It takes no new work.

CircleCI has no branch filters for releases: the `release` workflow runs for `v*` tags, so the branch names do not change what it runs.

**After the rename.** The branch `develop/2.0.0` was renamed to `develop` on GitHub. Git cannot keep `develop` and `develop/2.0.0` in one clone, so every existing clone needs these steps once:

1. Drop the old remote-tracking branch:

   ```bash
   git fetch --prune
   ```

2. Rename your local branch (or delete it with `git branch -d develop/2.0.0`):

   ```bash
   git branch -m develop/2.0.0 develop
   ```

3. Point it at the new remote branch:

   ```bash
   git branch -u origin/develop develop
   ```

Open pull requests move to `develop` by themselves when the maintainer renames the branch on GitHub.

## How Releases Work

- The CircleCI `release` workflow (`.circleci/config.yml`) runs only for git tags such as `v2.1.3` or `v2.1.3-beta.1`. A branch push never starts it.
- The workflow builds `bot-runner` and `web-runner`. It runs `scripts/docker-smoke.ts` on both images. Then it pushes them to Docker Hub:
  - `ririkoai/ririkobot` and `ririkoai/ririkobot-dashboard`;
  - with the tags `2.1.3`, `2.1` and `2` for a release, or only `2.1.3-beta.1` for a prerelease (`scripts/release-tags.ts`).
- The workflow never pushes `latest`. You move `latest` by hand (section 6).
- The Docker Hub login comes from the CircleCI context `dockerhub`.
- After the push, the workflow deploys. `deploy-staging` runs for every release tag. For a final tag `vX.Y.Z`, the workflow then waits for your approval and runs `deploy-production` (section 8).

## 1. One-Time Setup

1. In Docker Hub, open **Account settings**, then **Personal access tokens**. Create a token with **Read & Write** scope.
2. In CircleCI, open **Organization settings**, then **Contexts**. Create a context named `dockerhub`.
3. Add two variables to the context:
   - `DOCKERHUB_USERNAME`: the Docker Hub account that owns `ririkoai`.
   - `DOCKERHUB_TOKEN`: the token from step 1.
4. Optional: limit the context to a security group, so only maintainers can use it.
5. In Docker Hub, check that the repository `ririkoai/ririkobot-dashboard` exists. If it does not, create it as a public repository.

## 2. Keep 1.4.0 Available as `1.4.0`

`latest` points to Ririko 1.4.0 until you move it. Give that exact image a permanent tag first.

1. Log in to Docker Hub:

   ```bash
   docker login
   ```

2. Show the image:

   ```bash
   docker buildx imagetools inspect ririkoai/ririkobot:latest
   ```

   Copy the top-level `Digest:` line. For 1.4.0 it is `sha256:c11e8defda3beb390a8ef673b92f82bb958952abfe214d49436388ab6bc9c012`. If the digest is different, find out why before you go on.

3. Add the tag. Docker Hub copies the manifest for every platform. Nothing is pulled or built:

   ```bash
   docker buildx imagetools create --tag ririkoai/ririkobot:1.4.0 ririkoai/ririkobot@sha256:<digest from step 2>
   ```

4. Check the new tag:

   ```bash
   docker buildx imagetools inspect ririkoai/ririkobot:1.4.0
   ```

   The digest is the same as in step 2.

The package version inside that image is 1.4.1. If you want that tag too, repeat step 3 with `--tag ririkoai/ririkobot:1.4.1`.

## 3. Update the Docker Hub Descriptions

1. Open the file `docs/dockerhub/ririkobot.md`. Copy all of it into the **Overview** of `ririkoai/ririkobot` on Docker Hub.
2. Open the file `docs/dockerhub/ririkobot-dashboard.md`. Copy all of it into the **Overview** of `ririkoai/ririkobot-dashboard`.
3. Check that the links in both files point to the branch `master`.

## 4. Publish a Release

1. Merge `develop` into `master` with a pull request, so `master` holds the release.
2. Check that `package.json` has the version you are about to tag.
3. Optional: publish a prerelease first. A prerelease checks the pipeline and does not move the tag `2`:

   ```bash
   git tag -a v2.0.0-beta.1 -m "Ririko 2.0.0 beta 1"
   ```

   ```bash
   git push origin v2.0.0-beta.1
   ```

4. Go to `master` and update it:

   ```bash
   git checkout master
   ```

   ```bash
   git pull
   ```

5. Create the release tag:

   ```bash
   git tag -a v2.0.0 -m "Ririko 2.0.0"
   ```

6. Push the tag. This starts the `release` workflow:

   ```bash
   git push origin v2.0.0
   ```

7. Watch the `release` workflow in CircleCI. Staging deploys by itself. Check staging, then approve production (section 8).
8. When the workflow is green, check the Docker Hub tags. Each command shows a manifest:

   ```bash
   docker buildx imagetools inspect ririkoai/ririkobot:2.0.0
   ```

   ```bash
   docker buildx imagetools inspect ririkoai/ririkobot-dashboard:2
   ```

   ```bash
   docker buildx imagetools inspect ririkoai/ririkobot:latest
   ```

   The last command still shows the 1.4.0 digest.

9. Publish a GitHub release for the tag. Add a link to `docs/upgrading-from-1.4.md` in the notes.

If the workflow fails, fix the cause and run it again in CircleCI. A new run pushes the same tags again from the same commit. Never use a version number for a different commit. Tag a new patch version instead.

## 5. Announce When `latest` Will Move

Choose a date at least 30 days after the 2.0.0 release. On that date `latest` moves to 2.x.

1. Write the date in the GitHub release notes and in the README.
2. Write the date in the Docker Hub descriptions. The tag table there already says that `latest` moves after the sunset.
3. Post the date on the support Discord server.

The announcement says:

- `latest` moves to 2.x on that date;
- 1.4.0 stays available as `ririkoai/ririkobot:1.4.0`;
- users should pin a version tag (`2` or `1.4.0`) and follow `docs/upgrading-from-1.4.md`;
- a 2.x bot that starts with an unchanged 1.4.0 compose file stops, prints the upgrade steps and leaves the 1.4.0 data untouched.

## 6. Move `latest`

Do this on the announced date. It points `latest` to the current 2.x release, by digest, for both repositories.

1. Show the bot image and copy its digest:

   ```bash
   docker buildx imagetools inspect ririkoai/ririkobot:2
   ```

2. Move `latest` of the bot image:

   ```bash
   docker buildx imagetools create --tag ririkoai/ririkobot:latest ririkoai/ririkobot@sha256:<digest from step 1>
   ```

3. Show the dashboard image and copy its digest:

   ```bash
   docker buildx imagetools inspect ririkoai/ririkobot-dashboard:2
   ```

4. Move `latest` of the dashboard image:

   ```bash
   docker buildx imagetools create --tag ririkoai/ririkobot-dashboard:latest ririkoai/ririkobot-dashboard@sha256:<digest from step 3>
   ```

5. In `docs/dockerhub/` and on Docker Hub, change the tag tables: `latest` is now 2.x.

Later releases do not move `latest`. Repeat this section after a release if `latest` must follow it.

## 7. Move `latest` Back to 1.4.0

Do this only if 2.x must be pulled back after `latest` moved.

1. Point `latest` of the bot image to 1.4.0:

   ```bash
   docker buildx imagetools create --tag ririkoai/ririkobot:latest ririkoai/ririkobot:1.4.0
   ```

2. Check the result. The digest is the 1.4.0 digest again:

   ```bash
   docker buildx imagetools inspect ririkoai/ririkobot:latest
   ```

The dashboard had no 1.4.0 image. Point its `latest` to the last good 2.x version, or leave it. The 1.4.0 bot does not use the dashboard.

This does not touch anyone's data. A 1.4.0 user never let 2.x write to the `./data` folder. A user who upgraded keeps the 2.x data in its own volume.

## 8. Deploy to Staging and Production

After the images are pushed, the same `release` workflow deploys them. CircleCI holds no app secrets and has no Docker access on the hosts. For each host it holds one SSH key and one Cloudflare Access service token. It can only ask a host for `deploy <version>` or `status`. The key's forced command, `deploy/host/bin/ririko-deploy-ssh.sh`, enforces this.

There are three kinds of hosts: the staging app host, the production app host, and the Lavalink host that serves them. The maintainer's private runbook (not in the repository) explains how to set up the hosts, the tunnels and the contexts, and how to recover a host.

### 8.1. Pipeline Order

```text
release -> deploy-lavalink-staging -> deploy-staging -> approve-production -> deploy-lavalink-production -> deploy-production
```

| Git tag         | Jobs that run                                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v2.1.3-beta.1` | `release`, `deploy-lavalink-staging`, `deploy-staging`. The pipeline stops there. It does not ask for approval and does not deploy to production.                         |
| `v2.1.3`        | `release`, `deploy-lavalink-staging`, `deploy-staging`. Then `approve-production` waits for a maintainer. After approval, `deploy-lavalink-production` and `deploy-production` run one after the other. |

- `deploy-lavalink-staging` starts when `release` is green. `deploy-staging` follows it. If one of them fails, production is never offered.
- Each environment updates its Lavalink instance first. A release ships `docker/lavalink/application.yml`, which pins the Lavalink plugins. The instance must run the new file before the bot that needs it starts. A Lavalink restart stops every player on that instance. So the host restarts it only when `deploy/lavalink/docker-compose.yml` or `docker/lavalink/application.yml` changed since the last deploy (section 8.5). Most releases leave it alone.
- `approve-production` is a CircleCI approval job (`type: approval`). Open the workflow in CircleCI. After you check staging, click **Approve**.
- Every job has its own tag filter and ignores all branches. A branch push never deploys. The separate `ci` workflow never deploys.
- The `release` job pushes the tags `2.1` and `2` before you approve production. The hosts always deploy the exact version of the tag, for example `2.1.3`. They never deploy a moving tag.
- You can run a failed deploy job again. The host starts from its recorded state. You can also deploy the version that already runs.

### 8.2. CircleCI Contexts

Create four organization contexts:

- `deploy-staging` and `deploy-production` for the app hosts;
- `deploy-lavalink-staging` and `deploy-lavalink-production` for the Lavalink host (section 8.5).

The `deploy` job in `.circleci/config.yml` is the same for all four. Its `host` parameter is `app` or `lavalink`. Each context holds the values of its own host, with the same five variable names:

| Variable                      | Value                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `DEPLOY_SSH_HOST`             | The SSH tunnel hostname of the host, for example `ssh-staging.example.com`. Not an IP address.               |
| `DEPLOY_SSH_KEY_B64`          | The private key of the `deploy` user in base64 on one line. CircleCI values must be one line.                |
| `DEPLOY_KNOWN_HOSTS`          | The host key on one line, under the name in `DEPLOY_SSH_HOST`.                                               |
| `TUNNEL_SERVICE_TOKEN_ID`     | The Client ID of the Cloudflare Access service token.                                                        |
| `TUNNEL_SERVICE_TOKEN_SECRET` | The Client Secret of that token.                                                                             |

Use a different key and token in each context. A leaked staging value then cannot reach production.

To make the values for one context:

1. Make a key pair for the deploy user:

   ```bash
   ssh-keygen -t ed25519 -N '' -f deploy_key
   ```

2. Print the private key as base64 on one line, and store the output as `DEPLOY_SSH_KEY_B64`:

   ```bash
   base64 -w0 < deploy_key
   ```

3. Give the public key `deploy_key.pub` to the host with `bootstrap.sh --deploy-key`. The host makes it a forced-command key.
4. Delete the private file `deploy_key`.
5. On the host, print the host key line. Use the hostname of that host in place of `ssh-staging.example.com`. Store the output as `DEPLOY_KNOWN_HOSTS`:

   ```bash
   echo "ssh-staging.example.com $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"
   ```

   The job checks this key with `StrictHostKeyChecking=yes`. It never trusts a host key on first use.
6. In Cloudflare Zero Trust, create a service token. Give the Access application of the SSH hostname a **Service Auth** policy that includes the token. `cloudflared access ssh` reads the token from the environment variables, so the secret never appears in a command line.

Then limit who can deploy to production:

1. In CircleCI, open **Organization settings**, **Contexts**, `deploy-production`, **Security**.
2. Add a **security group** that holds only the maintainers.
3. Do the same for `deploy-lavalink-production`.

A job that uses a restricted context runs only for a member of the group. A collaborator who is not a maintainer cannot make production deploy, even if they click **Approve**. The approval job has no context of its own, so the restriction on `deploy-production` is what protects it. Restricting the staging contexts is optional.

Agents never create these contexts, push tags or approve a deploy.

### 8.3. What the Job Does

1. The job runs on `cimg/base:current` without a checkout. It installs a pinned `cloudflared` from its GitHub release, checks the `.deb` file against a sha256 in the repository, and installs it with `dpkg`.
2. It checks that all five variables exist. It writes the key (mode 0600) and `known_hosts`.
3. It runs `ssh` with `StrictHostKeyChecking=yes`, `IdentitiesOnly=yes` and `ProxyCommand="cloudflared access ssh --hostname %h"`. It sends `deploy ${CIRCLE_TAG#v}` to `deploy@$DEPLOY_SSH_HOST`. The host prints its progress, and the job shows it.
4. On an app host, `ririko-deploy` does these steps in order:
   1. It downloads the compose files of the release.
   2. It dumps the database. It skips the dump when no release runs yet.
   3. It pulls the images.
   4. It runs `ririko db:migrate` from the new bot image while the old release still runs (section 8.6).
   5. It starts the stack.
   6. It waits until the bot and the dashboard are ready.

   On a first deploy, it starts the `postgres` service before the migration.
5. The job fails with the exit status of the host (section 8.4) and prints what it means.

On a host, `ririko-deploy` runs every compose call with `DB_AUTO_MIGRATE=false` in its environment. This wins over the env file. So `ririko db:migrate` is the only step that changes the schema. A self-hosted stack uses the default `true` and migrates when the bot starts.

The command `ririko-deploy status` prints the container states and the latest and pending migration ids.

To update `cloudflared`:

1. Change `CLOUDFLARED_VERSION` and `CLOUDFLARED_SHA256` together in the `ssh-host` command of `.circleci/config.yml`.
2. Download the file yourself:

   ```bash
   gh release download <version> --repo cloudflare/cloudflared --pattern cloudflared-linux-amd64.deb
   ```

3. Print its checksum:

   ```bash
   sha256sum cloudflared-linux-amd64.deb
   ```

4. Compare the result with the digest that GitHub shows for the file. Use the value only if they are equal.

### 8.4. Host Exit Codes

`ririko-deploy` (`deploy/host/bin/ririko-deploy.sh`) keeps these exit codes. The job passes them through.

| Exit | Meaning                                                                                                                                                                                                                                                   |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Deployed. The bot and the dashboard are ready, and the host recorded the version.                                                                                                                                                                         |
| 1    | Failed before the running release was touched (bad tag or file, the dump failed, invalid `ririko.conf`). Nothing changed. Read the output and fix the cause.                                                                                              |
| 2    | The host rejected the command or the version. The tag is not `X.Y.Z` or `X.Y.Z-prerelease`, or the job sent something other than `deploy <version>` or `status`. A Lavalink host also rejects an instance it does not run (section 8.5).                  |
| 3    | The lock stayed busy for `DEPLOY_LOCK_WAIT` seconds. Another deploy, backup or watchdog run holds it. Nothing changed. Run the job again when that run is done.                                                                                           |
| 4    | The new release did not become ready, so the host started the previous release again. The database was not restored. It keeps the migrations of the new release. They only add, so the previous release runs on them. The output names the dump (section 8.7). On a Lavalink host: `/version` did not answer, and the previous release of that instance runs again. |
| 5    | The new release did not become ready, and there is no previous release (first deploy, or the same version again). Nothing runs. Fix the problem on the host and deploy again.                                                                           |
| 6    | The database migration failed (`ririko db:migrate` exit 1) or was refused (exit 2: the database holds a migration this release does not know). The host started and stopped nothing. The previous release keeps running. The output names the dump (section 8.6). |
| 255  | `ssh` itself failed: the tunnel, the service token, the key or the pinned host key.                                                                                                                                                                       |

What to do next:

- After exit 4, the host runs the old version. Fix the cause and tag a new patch version. Restore the database only when the failed release damaged data (section 8.7).
- After exit 6, the host runs the old version and nothing changed. The cause is in the output of the migration. Run `ririko db:migrate --status` on the host to see the same state. If the guard refused, the tag is older than what the database holds (section 8.6).
- After exit 5, log in to the host before you deploy again. Run `ririko-deploy status` and `docker compose -p ririko ps`, and read `/opt/ririko/deploy.log`.

To see what a host runs without a deploy, run this command through the same `cloudflared` ProxyCommand:

```bash
ssh deploy@<DEPLOY_SSH_HOST> status
```

### 8.5. The Lavalink Host

The Lavalink host runs one container for each environment: `lavalink-production` on port 2333 and `lavalink-staging` on port 2334. The compose project is `ririko-lavalink`. CI reaches the host through its own tunnel hostname, for example `lavalink-staging-ssh.example.com`.

`bootstrap.sh --role lavalink` sets up the host and writes `RIRIKO_ROLE=lavalink` into `/etc/ririko/ririko.conf`. The file `deploy/host/ririko.conf.example` describes the keys that follow.

- **One key for each instance.** Run `bootstrap.sh --role lavalink --deploy-key-staging "<key>"` (or `--deploy-key-production`). It writes `restrict,command="/usr/local/bin/ririko-deploy-ssh staging"` (or `production`) for that key. The instance comes from this argument in the `authorized_keys` file that root owns. It never comes from the command that CI sends. So the staging key can update only the staging instance. Put each key in the matching context. The staging key and `DEPLOY_SSH_HOST=lavalink-staging-ssh.<domain>` go in `deploy-lavalink-staging`. The production values go in `deploy-lavalink-production`.
- **Which instances a host runs.** `LAVALINK_INSTANCES` (`production`, `staging` or both) names them. If it is not set, the Lavalink ports in the `WG_PEERS` entries decide: 2333 is production, 2334 is staging. A deploy for an instance the host does not run ends with exit 2. The watchdog checks only the instances the host runs.
- **Env files.** `/opt/ririko/lavalink-<instance>.env` (owner root, mode 0600) holds `LAVALINK_PASSWORD` and the `SPOTIFY_*` values. Start from `deploy/lavalink/lavalink.env.example`. Use one file for each instance, with different passwords. A deploy with a missing file or an empty password ends with exit 1.
- **What a deploy does.** `ririko-deploy deploy <version> <instance>` downloads `deploy/lavalink/docker-compose.yml` and `docker/lavalink/application.yml` of the tag into `releases/<version>/`. It compares their sha256 with `state/lavalink-<instance>.sha`.
  - If both are equal, it prints `unchanged`, records the version and ends with exit 0. The container is not touched, so no player stops.
  - Otherwise it pulls the image and recreates only `lavalink-<instance>`. This also runs the one-shot plugin-volume service of that instance. It never touches the other instance. Then it waits up to `LAVALINK_READY_TIMEOUT` (default 180) seconds until `GET http://<WG_ADDRESS>:<port>/version` answers `200` with the password of the instance. If it never answers, the previous release of that instance starts again (exit 4), or the deploy ends with exit 5 when there is none.
  - The password goes to `curl` on standard input, never in a command line.
  - A watchdog or backup run delays a deploy. It does not fail it.
- **A change in the env file is not a deploy.** The env file is not part of the release. If you change it, the deploy prints `unchanged`. Recreate the container yourself ([deployment.md section 8.2](deployment.md#82-change-the-lavalink-settings)).
- **Watchdog.** With `RIRIKO_ROLE=lavalink`, `ririko-watchdog` pings `HEALTHCHECK_PING_URL` only when every configured instance runs and its `/version` answers. Each failed check posts `/fail` with the reason. After 3 failed checks in a row, it restarts that container and starts counting again. The counter is the file `/opt/ririko/state/watchdog-lavalink-<instance>`.
- **Memory.** `LAVALINK_PRODUCTION_HEAP` and `LAVALINK_STAGING_HEAP` in `ririko.conf` set the Java memory limit, for example `768m`.

### 8.6. Migrations on a Host

The host applies the migrations of a release as a separate step. It runs between the image pull and `up -d` (section 8.3). The bot on a host only checks the schema. `ririko db:migrate`, run once from the new bot image, is the only step that changes it.

The host scripts (`/usr/local/bin/ririko-deploy` and the other files in `deploy/host/bin`) change only when `bootstrap.sh --ref <ref>` runs on the host. A deploy never updates them. If a release changes them, run `bootstrap.sh` on every host before you deploy that release (section 8.8, step 1).

- **The old release keeps running during the migration.** Every migration leaves the schema usable by the previous release. It adds tables, nullable or defaulted columns, indexes or data. A change that removes something ships in a later release, as a migration whose first line is `-- ririko:contract`. The host starts the new containers after the migration is done.
- **Each migration is one transaction.** PostgreSQL rolls back a failed migration by itself. The database stays at the last migration that worked. Migrations of the same run that already finished stay applied. They only add.
- **Exit 6 with `ririko db:migrate` exit 1: the migration failed.** The old release still runs on the database. The job output and `/opt/ririko/deploy.log` hold the output of the migration. Each line starts with `db:migrate:`. Nothing needs a restore. Fix the cause, which is usually the migration, and tag a new patch version. If the cause is a one-time problem in the data of that host, fix the data there and run the failed job again.
- **Exit 6 with `ririko db:migrate` exit 2: the downgrade guard refused.** The database holds a contract migration that the tag does not contain. So the tag is older than the database. Nothing changed. Deploy a newer version that contains the migration. Do not restore a dump to get past the guard.
- **First deploy.** When nothing runs yet, the host starts the `postgres` service before the migration and takes no dump. The exit message then says `Pre-deploy dump: none taken`.
- **`ririko-deploy status`** prints the container states and these lines of `ririko db:migrate --status`: `Latest`, `Pending`, `Unknown` (recorded by a newer release) and `Adopted`. After a good deploy, `Pending` is `(none)`.

What a rollback (exit 4) does and does not undo:

- **It undoes the code.** The host starts the previous release again from `releases/<previous>`. It tries to pull the images and uses the ones on the host if the pull fails. It runs no migration, and leaves `state/current` on that version.
- **It does not undo the database.** There is no down migration. The database keeps the migrations of the failed release, and the previous release runs on them. It also keeps every row that the failed release wrote.
- **A contract migration breaks the rollback.** The downgrade guard also stops a bot that only checks (`DB_AUTO_MIGRATE=false`). So the previous release cannot start on a database with a contract migration it does not know. The log then says `ROLLBACK FAILED` and nothing runs. Deploy the newer release. Restoring the dump (section 8.7) is the last choice. The first release with a contract migration has no rollback. Check its dump before you approve production.
- **The dump is the only way back in time.** It is a snapshot from just before the deploy. A restore also removes everything written after it.

### 8.7. Restore the Pre-Deploy Dump

Restore only when the failed release damaged data, or when a contract migration is on the database and the previous release must run. After a failed deploy that left the old release running (exit 1, 3, 4 or 6), there is nothing to restore.

Before it pulls anything, `ririko-deploy` runs `pg_dump -Fc` in the `postgres` container of the running release. It writes the dump to `/opt/ririko/backups/predeploy/<UTC timestamp>-from-<version>.dump` (owner root, mode 0600). `<version>` is the release that ran when the dump was made. The host keeps the newest five dumps. It makes no dump when no release runs. The dump uses the custom format, so restore it with `pg_restore`, not `psql`. The nightly `ririko-backup` keeps a similar dump off the host. How to restore that one is in the maintainer's private runbook.

Do these steps as root on the host, in one shell. They follow what `ririko-deploy` does (project `ririko`, the compose files of the release, the env file of the host).

1. Go to the folder of the host:

   ```bash
   cd /opt/ririko
   ```

2. List the dumps. Choose the newest one from before the problem:

   ```bash
   ls -l backups/predeploy/
   ```

3. Show the version that runs now:

   ```bash
   cat state/current
   ```

4. Set `V` to the version in the file name of the dump. It is normally the same as the line from step 3:

   ```bash
   V=<the version in the dump file name>
   ```

5. Set the path of the dump:

   ```bash
   DUMP=/opt/ririko/backups/predeploy/<the file>
   ```

6. Read the list of compose files of that release:

   ```bash
   files=(); while read -r f; do files+=(-f "/opt/ririko/releases/$V/$f"); done < "releases/$V/.compose-files"
   ```

7. Define a helper for compose. The env file is `/opt/ririko/.env.production` unless `RIRIKO_ENV_FILE` in `/etc/ririko/ririko.conf` names another file. Use the same path here:

   ```bash
   rc() { RIRIKO_VERSION=$V RIRIKO_ENV_FILE=/opt/ririko/.env.production DB_AUTO_MIGRATE=false docker compose -p ririko "${files[@]}" --env-file /opt/ririko/.env.production "$@"; }
   ```

   The restore returns the database to the schema of that release. So you start the images of that release, not the failed one.

8. Check the dump. If the list is empty or the command fails, the file is bad. Take an older dump:

   ```bash
   rc exec -T postgres pg_restore --list < "$DUMP" | head
   ```

9. Take the lock that `ririko-deploy`, `ririko-backup` and `ririko-watchdog` share. It is released when the shell ends:

   ```bash
   exec 9>/run/lock/ririko-deploy.lock; flock -w 300 9
   ```

10. Optional: dump the current state, if anything in it might still matter. The file is outside `predeploy/`, so nothing deletes it:

    ```bash
    umask 077; rc exec -T postgres sh -c 'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "/opt/ririko/backups/before-restore-$(date -u +%Y%m%dT%H%M%SZ).dump"
    ```

11. Stop the writers. `postgres` keeps running. Nothing else may use the database, because `--clean` drops objects that a connection still uses:

    ```bash
    rc stop bot web
    ```

12. Restore the dump. `--clean --if-exists` drops each object of the dump before it makes it again. `--single-transaction` makes the restore all or nothing, so a failure leaves the database as it was. The single quotes are needed, because the variables belong to the container:

    ```bash
    rc exec -T postgres sh -c 'exec pg_restore --clean --if-exists --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$DUMP"
    ```

    The dump holds the migration records (`ririko_schema_migrations`), so the restored database knows which migrations it has.

13. Download the images of that release, only if they are gone from the host:

    ```bash
    rc pull
    ```

14. Start that release:

    ```bash
    rc up -d --no-build --remove-orphans
    ```

15. Wait until `rc ps` shows `bot` and `web` as `healthy`. Then run `ririko-deploy status`. `Pending` must be `(none)`.
16. Fix the cause. The files in `state/` are unchanged, so `current` still names `V`. Tag a new patch version with the fix. The next deploy dumps, migrates and starts as usual. If `V` is not the version in `state/current`, deploy a fixed version at once. Do not leave the host on `V`.

A restore removes every change since the dump. This includes what users did while the old release ran during the migration. Tell the maintainer before you restore production.

### 8.8. Adopt a Database Without Migration Records

A database made before the migration runner existed has tables but no `ririko_schema_migrations` table. The first deploy with the runner does not run `0000_baseline` on it. It adopts the database ([database.md section 1](database.md#1-how-the-schema-is-managed)). It compares the live schema with the baseline, adds what is missing in one transaction, and records `0000_baseline` as applied. If it cannot repair the difference by adding, it stops and changes nothing.

A database that the runner made from an empty one is never adopted. Do this section once for each host whose database has no migration records. Run `ririko-deploy status` on production before the first approval to see which case you have.

1. Update the host scripts. A deploy never does this. Run `bootstrap.sh` as root on the host. Set `--ref` to the release that adds the runner. The private runbook has the full command.

   ```bash
   sudo bash <path-to>/bootstrap.sh --ref <ref>
   ```

   To keep the run going if your SSH session drops, start it as a transient unit, then read its output:

   ```bash
   sudo systemd-run --unit=ririko-bootstrap --collect bash <path-to>/bootstrap.sh --ref <ref>
   ```

   ```bash
   journalctl -u ririko-bootstrap
   ```

   Check that the migration step is in the installed script. The command must print a number above 0:

   ```bash
   grep -c db:migrate /usr/local/bin/ririko-deploy
   ```

   A host that skips this step still deploys safely. The bot adopts and migrates when it starts, and a failed start ends in the rollback (exit 4). But this is not the gated path of section 8.6. Do not skip the step before the first deploy with the runner.

2. Make a manual dump. The deploy makes its own, but the host keeps only the newest five. Your manual dump stays. As root on the host, do this:
   1. Run steps 1 and 3 of section 8.7.
   2. Set `V` to the version that step 3 prints.
   3. Run steps 6 and 7 of section 8.7. They define `files` and the helper `rc`.
   4. Run step 10 of section 8.7, but name the file `backups/before-adoption-<UTC>.dump`.
3. Check the dump. The file is not empty, and this command lists tables:

   ```bash
   rc exec -T postgres pg_restore --list < <file> | head
   ```

4. Deploy the first release with the runner as a prerelease tag, for example `v2.1.3-beta.1`. It runs `release`, `deploy-lavalink-staging` and `deploy-staging`, and stops before production (section 8.1).
5. Read the adoption lines in the job output or in `/opt/ririko/deploy.log`. Each starts with `db:migrate:`. They come after the line `migrating the database from the <version> bot image`. A good adoption looks like this:

   ```text
   Target: PostgreSQL, host postgres, port 5432, database <database>
   Adoption: the database has tables but no migration records; recorded 0000_baseline as applied.
     N table(s) created
     N column(s) added
     N index(es) created
   ✔ Adopted the database and applied N migration(s): <ids>
   ```

   If the release has no migration after the baseline, the last line is `✔ Adopted the database: recorded 0000_baseline as applied.`

   A `⚠` line under the counts is a difference that was left as it is, for example a column type with the same storage. Read each one.

   PostgreSQL has no `Backup` line, because the pre-deploy dump is the backup.

   Then the deploy logs `the database is migrated for <version>`. It starts the stack and waits until it is ready.

6. Check the result with `ririko-deploy status`:

   ```bash
   ssh deploy@<DEPLOY_SSH_HOST> status
   ```

   Run it through the same ProxyCommand as the job. You see `Pending: (none)`, `Unknown: (none)`, `Adopted: yes (the database existed before migration records)` and `healthy` containers. Open the dashboard once. It answers ready only on a migrated schema.
7. Tag the plain version. The pipeline offers production after the approval job.

If the adoption is refused, the job fails with exit 6 and prints a report:

```text
✖ Migration failed: The existing database cannot be adopted. Nothing was changed.
  - <one line per problem>
```

The old release still runs, and the database is as it was. A problem is one of these:

- a `NOT NULL` column without a default is missing;
- a column cannot be added;
- a column type differs from the baseline (PostgreSQL compares types exactly);
- card serials are duplicated.

1. Read the whole report. It lists every problem at once.
2. Fix each problem, with the manual dump at hand.
   - For a schema problem, change the database by hand in a transaction until it matches `packages/database/migrations/pg/0000_baseline.sql` of the tag. Add the column with a default, or correct the type.
   - For duplicate serials, decide which owner keeps each serial.
   - If every old database would have the same problem, fix the adoption in the code and tag a new prerelease instead.
3. To check a fix without a new deploy, run the plan on the host. Set `V` to the tag that failed. Its release files are already on the host. The helper `rc` is from section 8.7. The command prints the same report, or the plan, and changes nothing:

   ```bash
   rc run --rm --no-deps -T bot ririko db:migrate --dry-run </dev/null
   ```

4. Deploy again. If only the database changed, run the failed job again. The host downloads the release again and starts from its recorded state. If the code changed, tag the next prerelease.

## 9. The Website (ririko.ai)

The documentation site in `website/` is published with GitHub Pages on <https://ririko.ai>. It hosts neither the bot nor the dashboard.

- The workflow `.github/workflows/docs.yml` runs on every push to `master` and on **Run workflow** (`workflow_dispatch`). It runs `pnpm install --frozen-lockfile`, `pnpm build` and `pnpm docs:build`, uploads `website/build` and deploys it with `actions/deploy-pages`. Other branches never deploy, so the site and the install files always match a release.
- `website/static/CNAME` holds `ririko.ai`.
- `pnpm docs:build` also runs `pnpm docs:install`. It copies `docker-compose.production.yml` to `website/static/install/docker-compose.yml` and `.env.production.example` to `website/static/install/.env.example`. The copies are git-ignored and are never edited by hand. The site then serves <https://ririko.ai/install/docker-compose.yml> and <https://ririko.ai/install/.env.example>.
- The Kanban board is published separately, as a read-only static site on the Vercel project `ririko-bot` (`vercel.json` runs `node scripts/kanban/build-board-site.mjs` and serves `board-dist/`). It is not part of ririko.ai.

### 9.1. One-Time Setup (Maintainer)

Do these once, after 2.0 is on `master`. Until then ririko.ai stays down.

1. In the repository on GitHub, open **Settings**, then **Pages**. Under **Build and deployment**, set **Source** to **GitHub Actions**.
2. In Cloudflare, open the DNS records of `ririko.ai`. Replace the old apex record with the GitHub Pages addresses: four `A` records (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`), or one `CNAME` on `@` to `ririkoai.github.io` (Cloudflare flattens it). Replace `ririkoai` with the GitHub organization name if it differs: the value is `<organization>.github.io`.
3. Set the apex records to **DNS only** (grey cloud) until GitHub has issued the certificate. Leave the other records as they are.
4. Back in **Settings**, **Pages**, wait for the DNS check to pass, set the custom domain to `ririko.ai` if it is empty, then tick **Enforce HTTPS** when GitHub offers it.
5. Run the workflow once from the **Actions** tab (**Docs site**, **Run workflow**) or push to `master`. Open <https://ririko.ai> and <https://ririko.ai/install/docker-compose.yml> to check.
6. Keep the Vercel project `ririko-bot`: it hosts the Kanban board. In its **Settings**, check that the **Production Branch** is the branch whose board you want to publish, and that **Root Directory** is the repository root.

To build the site on your computer:

```bash
pnpm build
pnpm docs:build
pnpm docs:serve
```

## 10. Production Go-Live

This is the one list to follow on launch day. Every step says who does it, the exact command or setting, and the check that proves it. Do the steps in order. Do not go on until the check of a step passes.

- **Maintainer**: accounts, secrets, tags, approvals, and the GitHub, Docker Hub and Cloudflare settings.
- **Coordinator**: the commands on the hosts over SSH, only after the maintainer says go. The commands run as root on the host (`sudo`). The maintainer's private runbook has the SSH details.
- Workers do none of these steps.

Placeholders: `<DEPLOY_SSH_HOST>` is the tunnel hostname of a host (section 8.2). `<dashboard-url>` is the public HTTPS address of the production dashboard, for example the value of `DASHBOARD_URL`. `<path-to>` is the folder on the host that holds `bootstrap.sh`. Never put a real IP address, provider, region or machine size in a file of the repository.

Production starts with an empty database. The first deploy runs the migrations from `0000_baseline` and does not adopt anything, so section 8.8 does not apply.

### 10.1. Before You Tag

1. **Maintainer.** Check that the release is on `master` and that its version is right. Update `master` (section 4, step 4), then print the version:

   ```bash
   node -p "require('./package.json').version"
   ```

   Check: it prints `2.0.0`, and the `ci` workflow of CircleCI is green for the newest commit of `master`.

2. **Maintainer.** Check that staging runs and is healthy before you start. The coordinator runs this on the staging host:

   ```bash
   sudo ririko-deploy status
   ```

   Check: `Pending: (none)`, `Unknown: (none)`, and `bot` and `web` are `healthy`.

3. **Maintainer.** Make or choose the Discord application of the production bot. Follow [deployment.md section 2.2](deployment.md#22-create-the-discord-application). Under **OAuth2**, **Redirects**, add `<dashboard-url>/api/auth/callback`. Keep the bot token, the application ID and the client secret for step 8.

   Check: the Developer Portal shows the redirect after **Save Changes**.

4. **Maintainer.** Make three new secrets for production. Do not reuse the staging values. Run the command three times: once for `SECRET_VAULT_KEY`, once for `LAVALINK_PASSWORD` and once for `POSTGRES_PASSWORD`:

   ```bash
   openssl rand -hex 32
   ```

   Check: each run prints 64 characters. Keep an offline copy of the vault key: without it the stored credentials cannot be read again.

5. **Maintainer.** Set up the Cloudflare tunnel for the production app host. In Cloudflare Zero Trust, create the tunnel and save its token in a file that you give to the coordinator. Add two public hostnames: the dashboard to `http://localhost:3000`, and the SSH hostname (`<DEPLOY_SSH_HOST>`) to `ssh://localhost:22`. Create a service token and give the Access application of the SSH hostname a **Service Auth** policy that includes it (section 8.2, step 6).

   Check: both hostnames show in the tunnel, and the service token is in the Service Auth policy.

6. **Maintainer.** Make a new key pair for the production app host, and one for the production Lavalink instance (section 8.2, steps 1 and 2). Keep each private key for step 10, and give the coordinator the two public keys (`deploy_key.pub`).

   Check: each private key is one line of base64, and the two key pairs are different.

7. **Coordinator.** Bootstrap the production app host. Put `bootstrap.sh` on the host (the private runbook says how). Use the branch `master`: the tag does not exist yet. Pass the public key of the app host and the tunnel token file:

   ```bash
   sudo bash <path-to>/bootstrap.sh --ref master --role app --deploy-key "<public key of the app host>" --tunnel-token-file <path to the token file>
   ```

   Check: the output ends with `Done: ... (role app)`, and shows `CI deploy key: installed` and `Cloudflare tunnel: service present`. This command prints a number above 0:

   ```bash
   grep -c db:migrate /usr/local/bin/ririko-deploy
   ```

8. **Maintainer gives the values, coordinator writes the files.** Write the settings of the production app host. Never put these values in a commit, a ticket or a chat.
   1. Create `/opt/ririko/.env.production` (owner root, mode 0600) from `.env.production.example`. Fill in the seven values of [deployment.md section 2.4](deployment.md#24-write-the-settings-file) with the secrets from steps 3 and 4. Set `DASHBOARD_URL` to `<dashboard-url>`. Set `CLIENT_IP_HEADER=cf-connecting-ip`, because every request comes through Cloudflare ([deployment.md section 4](deployment.md#4-show-the-dashboard-on-the-internet)). Set `LAVALINK_HOST` to the WireGuard address of the Lavalink host and `BOT_OWNER_ID` to the Discord user ID of the owner.
   2. Edit `/etc/ririko/ririko.conf` (see `/etc/ririko/ririko.conf.example` for every key). Set `RIRIKO_COMPOSE_FILES="docker-compose.production.yml docker-compose.remote-lavalink.yml"`, `WG_ADDRESS`, `WG_PEERS` and `HEALTHCHECK_PING_URL`.
   3. Run the command of step 7 again, so that WireGuard is set up.

   Check: this command prints `root:root 600`:

   ```bash
   stat -c '%U:%G %a' /opt/ririko/.env.production
   ```

   The output of `bootstrap.sh` shows `WireGuard: wg0 up as <address>`, not `key only`.

9. **Coordinator.** Make sure that the Lavalink host runs the production instance (section 8.5).
   1. If `LAVALINK_INSTANCES` on the Lavalink host already includes `production`, skip to the check.
   2. Otherwise run `bootstrap.sh --ref master --role lavalink --deploy-key-production "<public key of the Lavalink production instance>"` on the Lavalink host. Add the WireGuard public key of the production app host to `WG_PEERS` with the port 2333, then run `bootstrap.sh` again. Create `/opt/ririko/lavalink-production.env` (owner root, mode 0600) from `deploy/lavalink/lavalink.env.example`. Its `LAVALINK_PASSWORD` is the value of step 4.

   Check: on the Lavalink host, `sudo ririko-deploy status production` prints `status: lavalink-production current=none previous=none`, and `stat -c '%U:%G %a' /opt/ririko/lavalink-production.env` prints `root:root 600`.

10. **Maintainer.** Create the two CircleCI contexts `deploy-production` and `deploy-lavalink-production`, each with the five variables of section 8.2. The coordinator prints the value of `DEPLOY_KNOWN_HOSTS` on each host (section 8.2, step 5). Then delete the private key files (section 8.2, step 4). Add the security group of the maintainers to both contexts (section 8.2).

    Check: **Organization settings**, **Contexts** lists both contexts with five variables each, and **Security** shows the group.

11. **Coordinator.** Print the state of the production app host before the first deploy:

    ```bash
    sudo ririko-deploy status
    ```

    Check: it prints `status: current=none previous=none`. This is the proof that nothing runs yet, so the first deploy starts from an empty database.

### 10.2. Tag and Approve

12. **Maintainer.** Create and push the release tag from `master` (section 4, steps 4 to 6):

    ```bash
    git checkout master
    ```

    ```bash
    git pull
    ```

    ```bash
    git tag -a v2.0.0 -m "Ririko 2.0.0"
    ```

    ```bash
    git push origin v2.0.0
    ```

    Check: the `release` workflow starts in CircleCI.

13. **Maintainer.** Wait for `release`, `deploy-lavalink-staging` and `deploy-staging` to turn green. Then `approve-production` shows **On Hold**.

    Check: the three jobs are green. If one fails, production is not offered. Read the exit code in section 8.4 and fix the cause. Tag a new patch version: never reuse `v2.0.0` for another commit.

14. **Coordinator.** Check staging before the approval:

    ```bash
    sudo ririko-deploy status
    ```

    Check: on the staging host, `Latest` is the newest file in `packages/database/migrations/pg` of the tag, `Pending: (none)`, and `bot` and `web` are `healthy`. Also run this command on the staging host. It prints a body with `"ready":true`:

    ```bash
    curl -fsS http://127.0.0.1:3000/api/ready
    ```

15. **Maintainer.** Open the workflow in CircleCI and click **Approve** on `approve-production`.

    Check: `deploy-lavalink-production` and then `deploy-production` run, and both turn green. A job that stays in **Blocked** means that you are not in the security group (section 8.2).

16. **Coordinator.** Read the output of `deploy-production`.

    Check: it shows the line `postgres is not running, starting it for the migration`, then lines that start with `db:migrate:` and end with `Applied N migration(s): 0000_baseline, ...`. There is no `Adoption:` line. The job ends with `deployed 2.0.0` and the message `The host command succeeded.`

### 10.3. Check Production

17. **Coordinator.** Print the state of the production app host:

    ```bash
    sudo ririko-deploy status
    ```

    Check: `current=2.0.0`, `Latest` is the newest file in `packages/database/migrations/pg`, `Pending: (none)`, `Unknown: (none)`, `Adopted: no`, and `bot` and `web` are `healthy`.

18. **Coordinator.** Check that the dashboard answers on the host and in public:

    ```bash
    curl -fsS http://127.0.0.1:3000/api/ready
    ```

    ```bash
    curl -fsS <dashboard-url>/api/ready
    ```

    Check: both commands exit with 0 and print a body with `"ready":true`. The second command runs on any computer.

19. **Coordinator.** Register the slash commands. Run steps 1, 3, 4, 6 and 7 of section 8.7 to get the helper `rc`, then:

    ```bash
    rc exec -T bot ririko commands:sync --global --all-guilds
    ```

    Check: the command prints the commands it registered, and exits with 0.

20. **Maintainer.** Add the production bot to your server ([deployment.md section 2.6](deployment.md#26-add-the-bot-to-your-server)). Type `/ping`. Open `<dashboard-url>` and sign in with Discord.

    Check: the bot answers `/ping`, and the dashboard lists your server. Global commands can take a while to show; press Ctrl+R in Discord.

21. **Coordinator.** Turn on the backup of production. Set the five backup keys in `/etc/ririko/ririko.conf` (`RIRIKO_ENV_NAME`, `RESTIC_REPOSITORY`, `RESTIC_PASSWORD`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`; see `/etc/ririko/ririko.conf.example`). The maintainer keeps an offline copy of `RESTIC_PASSWORD`. Then run:

    ```bash
    sudo ririko-backup init
    ```

    ```bash
    sudo systemctl start ririko-backup.service
    ```

    Check: `journalctl -u ririko-backup` ends without an error, and the monitor of `BACKUP_PING_URL` shows a ping. The monitor of `HEALTHCHECK_PING_URL` shows a ping every minute.

22. **Maintainer.** Check the Docker Hub tags (section 4, step 8).

    Check: `ririkoai/ririkobot:2.0.0` and `ririkoai/ririkobot-dashboard:2` show a manifest, and `ririkoai/ririkobot:latest` still shows the 1.4.0 digest.

### 10.4. Launch Day: Site, Texts and Settings

All of these steps are the maintainer's. The texts are written already. Paste them from the file named in each step.

23. **Maintainer.** Publish a GitHub release for the tag (section 4, step 9). Add a link to `docs/upgrading-from-1.4.md` in the notes.

    Check: the release shows on the **Releases** page of the repository.

24. **Maintainer.** Turn on HTTPS for the website. Section 9.1 must be done, and the workflow **Docs site** must have deployed from `master` at least once. Open **Settings**, **Pages**, and tick **Enforce HTTPS**. If the box is grey, wait for GitHub to issue the certificate and open the page again.

    Check: this command prints a `Location: https://ririko.ai/` header:

    ```bash
    curl -sI http://ririko.ai
    ```

    Also open <https://ririko.ai/docs> in a browser. It loads without a warning.

25. **Maintainer.** Set the description, the website and the topics of the GitHub repository. Click the gear next to **About**. The texts are in the entry "Proposed GitHub texts" of `docs/kanban/handovers/TASK-1913.md`. Use `https://ririko.ai` as the website.

    Check: this command shows the new description, the homepage and 16 topics:

    ```bash
    gh repo view RirikoAI/RirikoBot --json description,homepageUrl,repositoryTopics
    ```

26. **Maintainer.** Update the two Docker Hub overviews (section 3). Copy `docs/dockerhub/ririkobot.md` and `docs/dockerhub/ririkobot-dashboard.md` into the **Overview** of their repositories.

    Check: both pages show the 2.0.0 tag table and the links to <https://ririko.ai/docs>.

27. **Maintainer.** Replace the wiki. Open the Home page of the wiki and replace all of it with the text in the entry "Replacement wiki Home text" of `docs/kanban/handovers/TASK-1894.md`. In that text, change the branch in the GitHub link to `master`. Then open **Settings**, **Features** and untick **Wikis**.

    Check: before you untick it, the Home page of the wiki shows the pointer to <https://ririko.ai/docs>. After that, the repository has no **Wiki** tab.

### 10.5. The 1.4.0 Sunset and `latest`

28. **Maintainer.** Choose the date on which `latest` moves, at least 30 days after the release, and announce it (section 5).

    Check: the date is in the GitHub release notes, the README, the Docker Hub descriptions and on the support Discord server.

29. **Maintainer.** On that date, move `latest` of both images (section 6, steps 1 to 4).

    Check: the digest of `ririkoai/ririkobot:latest` equals the digest of `ririkoai/ririkobot:2`, and the same for `ririkoai/ririkobot-dashboard`:

    ```bash
    docker buildx imagetools inspect ririkoai/ririkobot:latest
    ```

30. **Maintainer.** Change the `latest` row in the tag table of both Docker Hub texts. The text of the new row is in the "Decisions & gotchas" part of the `PROGRESS` entry of `docs/kanban/handovers/TASK-1913.md`. Change it in `docs/dockerhub/ririkobot.md` and `docs/dockerhub/ririkobot-dashboard.md` through a pull request, then paste both files into Docker Hub again (step 26).

    Check: both Docker Hub pages show `latest` as the newest 2.x release.

### 10.6. Roll Back

Nothing in this section touches 1.4.0 data. A 1.4.0 user never let 2.x write to the `./data` folder.

31. **Coordinator.** If `deploy-production` fails, read its exit code in section 8.4. On the first deploy there is no previous release, so the host does not roll back.
    - Exit 5: nothing runs. Find the cause in `/opt/ririko/deploy.log` and `docker compose -p ririko ps`, fix it on the host, and run the job again in CircleCI.
    - Exit 6: the migration failed or was refused. Nothing was started and the database is as the failed migration left it. Read the lines that start with `db:migrate:` (section 8.6). If the cause is in the code, tag a new patch version.
    - Exit 255: the tunnel, the service token, the key or the pinned host key is wrong (section 8.2). Fix the context and run the job again.

    Check: the job turns green, and step 17 passes.

32. **Maintainer.** If a later release breaks production, tag a new patch version with the fix and approve it. Never reuse a version number.

    Check: `sudo ririko-deploy status` shows the new version as `current` and `Pending: (none)`.

33. **Coordinator.** If the new release did not become ready (exit 4), the host started the previous release again. The database keeps the migrations. Restore the dump only when the failed release damaged data (section 8.7). Tell the maintainer before you restore production.

    Check: `sudo ririko-deploy status` shows the previous version as `current` and `healthy` containers.

34. **Coordinator.** To take the bot and the dashboard offline while you fix a problem, run steps 1, 3, 4, 6 and 7 of section 8.7, then:

    ```bash
    rc stop bot web
    ```

    Check: `rc ps` shows no running `bot` and `web`. A deploy job, or `rc up -d --no-build`, starts them again.

35. **Maintainer.** If 2.x must be pulled back after `latest` moved, follow section 7.

    Check: `ririkoai/ririkobot:latest` shows the 1.4.0 digest again.

## 11. npm Package

The npm package `ririko` is the starter that runs with `npx ririko` (`apps/starter`). It is not the bot. It looks up the newest bot release when it runs, so a bot release does not need an npm release.

- The workflow `.github/workflows/npm-publish.yml` runs only when you push a tag that starts with `npm-v`, such as `npm-v2.0.0`. Image releases use `v*` tags in CircleCI and never start it.
- It uses npm trusted publishing. GitHub gives the job an identity token, and npm accepts it for the package you linked in section 11.1. The repository holds no npm token.
- The workflow builds the starter, runs its tests, and fails when the tag version differs from the `version` in `apps/starter/package.json`. Then it runs `npm publish --provenance --access public`, so the npm page shows where the package was built. A version with a dash, such as `2.1.0-beta.1`, is published with the tag `next` and not `latest`.
- The starter has its own version number. Raise it only when the starter itself changes.

### 11.1. One-Time Setup (Maintainer)

1. Sign in to <https://www.npmjs.com> as an owner of the package `ririko`.
2. Open the package page, then **Settings**. Find **Trusted Publisher** and choose **GitHub Actions**.
3. Fill in the form. Spelling and case must match GitHub exactly:
   - **Organization or user**: `RirikoAI`
   - **Repository**: `RirikoBot`
   - **Workflow filename**: `npm-publish.yml`
   - **Environment name**: leave it empty.
4. Click **Set up connection**.
5. After the first successful publish, you can set **Publishing access** on the same page to **Require two-factor authentication and disallow tokens**. Trusted publishing keeps working.

Check: the **Trusted Publisher** section shows the repository and the workflow file name.

### 11.2. Release a New Version

1. Change `version` in `apps/starter/package.json` through a pull request, and merge it into `master`. The first release is `2.0.0`, which is the version in the file now.
2. Go to `master` and update it:

   ```bash
   git checkout master
   ```

   ```bash
   git pull
   ```

3. Create the tag. The part after `npm-v` is the exact version:

   ```bash
   git tag -a npm-v2.0.0 -m "ririko 2.0.0 on npm"
   ```

4. Push the tag. This starts the workflow:

   ```bash
   git push origin npm-v2.0.0
   ```

5. Open the **Actions** tab on GitHub and watch **Publish to npm**.

Check: the workflow is green.

### 11.3. Check the Release

1. Show the newest version on npm:

   ```bash
   npm view ririko version
   ```

   Check: it prints the version you tagged.

2. Show the dist-tags:

   ```bash
   npm view ririko dist-tags
   ```

   Check: `latest` is the version you tagged (for a prerelease, `next` is).

3. Run the starter from npm:

   ```bash
   npx ririko@latest --version
   ```

   Check: it prints the same version.

4. Open <https://www.npmjs.com/package/ririko>. Check that the README shows the banner and that the page shows the provenance badge.

### 11.4. Deprecate the 1.x Versions (Once)

The versions before 2.0.0 are the old 1.x bot, and their installer no longer works. After 2.0.0 is on npm, mark them as deprecated:

1. Log in to npm. This asks for your password and a one-time code:

   ```bash
   npm login
   ```

2. Deprecate every version below 2.0.0:

   ```bash
   npm deprecate "ririko@<2.0.0" "This is the old Ririko 1.x bot and its installer no longer works. Run npx ririko to install the current Ririko, or see https://ririko.ai"
   ```

Check: `npm view ririko@1.0.0 deprecated` prints the message. Use a version that exists in `npm view ririko versions`.

### 11.5. If the Publish Fails

- **The tag and the version differ.** The check step fails before anything is published. Delete the tag, fix the version, and tag again:

  ```bash
  git tag -d npm-v2.0.0
  ```

  ```bash
  git push origin :refs/tags/npm-v2.0.0
  ```

- **npm answers with a 404 or a sign-in error.** The trusted publisher does not match. Check the four values in section 11.1 against the repository and the workflow file name. They are case sensitive. Then run the failed job again from the **Actions** tab.
- **The npm CLI is too old.** Trusted publishing needs npm 11.5.1 or newer. The workflow installs npm 11. If the step that prints the npm version shows an older number, fix the workflow.
- **The version already exists on npm.** npm never accepts the same version twice, not even after an unpublish. Raise the version and tag the next one.
