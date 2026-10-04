# Handover Notes: EPIC-017 Production Hosting & Continuous Deployment (AWS Lightsail, Cloudflare Tunnel, CircleCI)

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-04T18:50:17Z · Claude Code (Opus 5.5)

**Decisions** (maintainer, 2026-10-05)
- Hosting: AWS Lightsail. Production and staging are separate instances, both Ubuntu 24.04 LTS in us-east-1, each running `docker-compose.production.yml` (Postgres, Lavalink, bot, dashboard).
- Ingress: Cloudflare Tunnel only. Production dashboard on `dashboard.ririko.ai`; staging on `dashboard-staging.ririko.ai` behind Cloudflare Access. SSH reaches each host through its own tunnel hostname behind Access. The Lightsail firewall has no inbound rules at all.
- Pipeline: the existing tag-driven `release` workflow pushes the images; then every release tag deploys to staging, and a final `vX.Y.Z` waits for a CircleCI approval before production.

**Why this shape**
- The bot holds a gateway websocket and Lavalink is a long-running JVM, so serverless or scale-to-zero platforms do not fit.
- The bot and dashboard share the `card_images`, `ririko_data` and `welcomer_backgrounds` volumes, so they must run on one host. A PaaS that puts them on separate machines would need object storage first.
- BLUEPRINT section 68 rules out Kubernetes; one compose stack per host matches it.
- A tunnel needs no public port and hides the origin IP. The bot needs no inbound connection at all.

**Trust boundaries**
- CI holds only an SSH key whose forced command can run `deploy <version>` or `status`, plus a Cloudflare Access service token. The compose file comes from the tagged GitHub repository (public: RirikoAI/RirikoBot), and all app secrets stay on the host.
- The `deploy` user is not in the `docker` group (that is root-equivalent); it reaches `ririko-deploy` through one sudoers rule.

**Order**
- TASK-1761, TASK-1762, TASK-1771, TASK-1781, TASK-1782, TASK-1791, TASK-1792, TASK-1772 (the runbook documents the finished scripts).

**Shared conventions for the host scripts**
- Everything lives in `deploy/host/`: `bootstrap.sh`, `bin/*.sh` (installed to `/usr/local/bin` without the suffix), `systemd/*`, `files/*`, `ririko.conf.example`.
- Bash with `set -euo pipefail`, LF line endings, shellcheck clean.
- One config file `/etc/ririko/ririko.conf` (root, 0600) and one deploy lock shared by deploy, backup and watchdog.
- Tests live in `scripts/deploy-host.test.ts` and drive the scripts with fake `docker`, `curl` and `df` executables on PATH, using the override variables each task lists.

**Out of scope**
- Creating AWS, Cloudflare, CircleCI or Healthchecks.io resources. Agents never do provider-side steps, push images, create tags or approve deploys.
- Object storage for card images, multi-host or high-availability setups.

---

## GROOMING · 2026-10-04T18:58:43Z · Claude Code (Opus 5.5)

**Regroomed: Lavalink moves to its own VPS** (maintainer, 2026-10-05)
- Lightsail sizes confirmed: production 8 GB (44 USD), staging 4 GB (24 USD).
- Lavalink runs on one VPS Malaysia Linux KVM PRO instance (4+1 vCPU, 4 GB RAM, 100 GB NVMe, 4 TB transfer, Cyberjaya), with two containers: production (port 2333, heap 1536m) and staging (port 2334, heap 512m). Separate passwords, so a leaked staging secret cannot drive production audio.
- Link: WireGuard 10.77.0.0/24. VPS 10.77.0.1 listens on UDP 51820, production is 10.77.0.2, staging is 10.77.0.3. The Lavalink password never crosses the internet in clear text, and the Lavalink ports are never public.
- The Lightsail instances now need static IPs (free while attached) so the VPS firewall can allowlist them. This replaces "no static IP is needed" from the first grooming.
- Why not TLS on a public port: the bot has no env setting for a secure Lavalink connection (`LavalinkService` reads `secure` only from code options, `packages/music/src/lavalink/lavalink-service.ts:207`), and a public port would still need an IP allowlist. WireGuard also needs no third-party coordinator such as Tailscale.
- Latency: us-east-1 to Cyberjaya is about 230 ms round trip. Player commands get slower by roughly that much per Lavalink call; audio itself flows straight from Lavalink to Discord's voice servers, so it gets better for Southeast Asian guilds.
- If the link is down, the bot falls back to its built-in FFmpeg player on the app host (`isLavalinkActive`).
- New story STORY-180 (TASK-1801, TASK-1802, TASK-1803). The epic stays at 21 points, the top of the scale; its tasks now total 34.

---

## GROOMING · 2026-10-04T21:52:37Z · Claude Code (Opus 5.5)

**Lavalink hosts** (maintainer, 2026-10-05)
- For now, one VPS (`lavalink-staging`, 168.222.124.164, VPS Malaysia, 2 vCPU / 2 GB plus 2 GB swap) runs both Lavalink instances, as STORY-180 is written.
- Production Lavalink moves to its own VM later. Keep the design ready for that:
  - `deploy/lavalink/docker-compose.yml` must work when a host starts only one of its two services.
  - The WireGuard peers and per-port firewall rules must allow one instance per host.
  - The CI job for each instance takes its target host from its own context.
- With 2 GB RAM, the production heap on this VM stays below the 1536m default until the move. Set `LAVALINK_PRODUCTION_HEAP=768m` here.

**Live host state**
- Both hosts reach SSH only through Cloudflare Tunnel behind Access: `ssh-staging.ririko.ai` and `ssh-lavalink-staging.ririko.ai`.
- The Lavalink VM firewall is the interim `table inet ririko_interim`. It drops all inbound traffic except UDP 51820 from staging's 100.29.245.110. TASK-1802 replaces it.
