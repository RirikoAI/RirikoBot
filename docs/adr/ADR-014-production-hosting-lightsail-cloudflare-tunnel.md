# ADR-014: Production Hosting on AWS Lightsail Behind Cloudflare Tunnel, With a Separate Lavalink Host

## Status
Accepted (2026-10-05, EPIC-017 grooming). Amended the same day by STORY-180, which moved Lavalink off the app hosts onto its own VPS; see [Revision 2026-10-05](#revision-2026-10-05). The step-by-step runbook holds provider account and network details, so it is private (`docs/hosting.md`, not in the repository). This ADR records the decision and the rejected options only.

## Context
Until EPIC-017 the repository had images, a production compose file and a Vercel status page, but nowhere to run the bot and the dashboard, and no way to ship a release to them. The constraints that decide the shape:

- The bot holds a Discord gateway websocket and Lavalink is a long-running JVM. Both want a process that stays up and keeps its memory.
- The bot and the dashboard share the `card_images`, `ririko_data` and `welcomer_backgrounds` volumes, so they must run on the same machine. Moving them apart needs object storage first.
- BLUEPRINT sections 68 and 69 forbid over-engineering: no Kubernetes, no service mesh, no message broker. One compose stack per host is the intended unit.
- There is one maintainer, one production environment and one staging environment. Operations must be cheap to understand and repeatable from a runbook.
- The dashboard is public and sensitive (Discord OAuth, ADR-013). The bot needs no inbound connection at all. The fewer public ports, the better.
- A release is already a git tag that builds and pushes images to Docker Hub (CircleCI `release` workflow). Deploying must hang off that tag and keep every app secret out of CI.

## Decision
1. **AWS Lightsail, two separate instances.** Production and staging each get their own Ubuntu 24.04 LTS instance with an IPv4 bundle, running `docker-compose.production.yml` (Postgres, bot, dashboard). Static IPv4 addresses are attached because the Lavalink host allowlists them.
2. **Cloudflare Tunnel is the only ingress.** The Lightsail firewall has no inbound rules. One remotely managed tunnel per host serves the dashboard (bound to loopback) and SSH, on hostnames one level below the zone. Cloudflare Access protects the SSH hostnames (maintainers plus a Service Auth policy for that environment's CI service token) and the staging dashboard. The origin address is hidden, and the dashboard trusts `CF-Connecting-IP` (`CLIENT_IP_HEADER`) because nothing else can reach it.
3. **Deploys are pulled by the host through a forced command.** CircleCI holds one SSH key and one Access service token per host. The key's forced command, `ririko-deploy-ssh`, accepts only `deploy <version>` and `status` and runs one `sudo` rule, `ririko-deploy`. The host downloads the tag's compose files from GitHub, takes a pre-deploy `pg_dump`, pulls, starts, waits for the bot's `/ready` and the dashboard's `/api/ready`, and starts the previous release again if they never answer. App secrets stay on the host. Every release tag deploys to staging; a final `vX.Y.Z` waits for a maintainer's approval before production.
4. **Host setup is one idempotent script plus a runbook, not infrastructure code.** `deploy/host/bootstrap.sh` prepares a bare Ubuntu 24.04 host (Docker, cloudflared, hardening, the `deploy` user, WireGuard, timers); it is safe to run again and is also how scripts are updated. A runbook is cheaper than Terraform for two instances.
5. **Lavalink runs on a separate VPS reached over WireGuard.** One Lavalink container per environment, each with its own password. App hosts are WireGuard peers; the VPS firewall drops everything except the WireGuard port from the app hosts' static IPs and each peer's own Lavalink port on the tunnel interface. The same pipeline updates it, through its own tunnel hostname, with one CI key per instance.
6. **Off-site backups and alerts without extra services.** A nightly restic backup (a Postgres dump and the shared volumes, encrypted on the host) goes to a Lightsail bucket per environment, with a bucket-scoped access key. A one-minute watchdog restarts unhealthy containers and feeds a Healthchecks.io check, so a dead host, a stopped timer and a Docker outage all alert by silence.

## Rejected Options
- **Serverless or scale-to-zero platforms (Vercel and similar).** The bot needs a process that holds a websocket for days, and Lavalink is a JVM with a warm cache. The status page stays on Vercel because it is a static build.
- **A PaaS that runs the bot and the dashboard on separate machines.** They share three volumes, so they would need object storage and a rewrite of how cards and backgrounds are read and written. That cost buys nothing for one bot.
- **Kubernetes.** BLUEPRINT section 68 rules it out. A cluster for two small stacks is the over-engineering the project avoids.
- **Public SSH.** An open port 22 (even key-only) gets scanned and brute-forced for as long as the host lives, needs fail2ban or an allowlist to be tolerable, and gives CI an address to hit. SSH through the tunnel behind Access needs no inbound rule, and the forced-command key limits what a stolen CI key can do.
- **A Lavalink port with TLS on the public internet.** The bot reads the `secure` option only from code, not from the environment, and a public port would still need an IP allowlist. A WireGuard link keeps the password off the internet and the port unreachable.
- **Tailscale or another coordinated mesh for that link.** Plain WireGuard between a few hosts needs no third-party coordinator or account.
- **Terraform, CloudFormation or Ansible.** One maintainer, two app hosts and a VPS: the bootstrap script and a runbook are less to learn and less to maintain than code that is run twice a year.
- **Deploying from CI by pushing images or compose files to the host.** CI would need Docker access (root-equivalent) or the compose file contents. Letting the host pull a published tag keeps the trust boundary at one forced command.

## Consequences
### Positive
- No inbound port on any host: nothing to scan, and the dashboard origin address is not public.
- A stolen CI credential can only ask a host to deploy a version that is already published, or to report its status. It sees no application secret.
- Releases are tag-driven and uniform: staging first, a maintainer's approval for production, an automatic return to the previous release when a new one never becomes ready.
- Data is recoverable from an encrypted off-site copy, and the failure of a host, a container or a backup is visible without a monitoring stack.
- The bot keeps working on its built-in player when the Lavalink link is down.

### Negative
- A host is a single point of failure (one instance per environment, no failover). A rebuild follows the private runbook, and `.env.production` and `ririko.conf` must be kept elsewhere because the backup excludes them.
- The Lavalink link adds round-trip latency to player commands, because the Lavalink host is far from the app hosts. Audio itself flows from Lavalink to Discord's voice servers, which helps guilds near the Lavalink host.
- A deploy rolls the application back automatically but never restores the database; the pre-deploy dump is restored by hand.
- The Lavalink VPS currently serves both environments. Production Lavalink moves to its own VM later.
- Lightsail bundles are burstable: sustained load can throttle the CPU, so a burst-capacity alarm is part of the setup.
- Several music sources limit requests from cloud-provider addresses. Playback must be tested from the Lavalink host before each environment goes live.

## Revision 2026-10-05
Lavalink first ran as a container on each app host. The maintainer moved it to a separate VPS on the same day (STORY-180): the Lightsail hosts keep `docker-compose.remote-lavalink.yml` and their static IPs, the VPS is reached over WireGuard, and the instance password never crosses the internet in clear text. The decisions above describe the final shape.
