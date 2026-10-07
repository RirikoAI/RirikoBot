# Handover Notes: STORY-180 Remote Lavalink Node on a KVM VPS Host Over WireGuard

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-04T18:58:43Z · Claude Code (Opus 5.5)

**Approach**
- TASK-1801 (compose files) has no host dependency and can run right after TASK-1761.
- TASK-1802 extends the bootstrap with roles, WireGuard and the VPS firewall, after TASK-1771 and TASK-1792.
- TASK-1803 adds the Lavalink role to the deploy and watchdog scripts and the CI jobs, after the app-host pipeline exists.

**Addresses**
| Host | WireGuard | Lavalink |
|---|---|---|
| Lavalink VPS | 10.77.0.1, UDP 51820 | production :2333, staging :2334 on 10.77.0.1 |
| Lightsail production | 10.77.0.2 | uses :2333 |
| Lightsail staging | 10.77.0.3 | uses :2334 |

**Relevant code**
- `packages/music/src/lavalink/lavalink-service.ts:200-238`: the bot reads `LAVALINK_HOST`, `LAVALINK_PORT` and `LAVALINK_PASSWORD` from the environment; `secure` defaults to false. Plain WebSocket inside WireGuard is fine.
- `scripts/lavalink-setup.ts:60` `renderLavalinkConfig` and `docker/lavalink/application.yml`: `server.address: 0.0.0.0`. On the VPS, the `SERVER_ADDRESS` and `SERVER_PORT` environment variables override it (Spring Boot gives OS environment variables precedence over application.yml). Check this on the first boot.

**Out of scope**
- More than one Lavalink node per environment, or load balancing across nodes.

---

## REVIEW · 2026-10-05T00:29:47Z · Claude Code (Opus 5.5) · DONE

- TASK-1801, TASK-1802 and TASK-1803 are DONE. BUG-0036 (found by the first live Lavalink start) is DONE.
- Live: WireGuard 10.77.0.3 ↔ 10.77.0.1 (RTT about 295 ms). The VM firewall allows only 10.77.0.3 → TCP 2334. lavalink-staging answers `/version` 4.2.2 to the bot's password over the tunnel.
