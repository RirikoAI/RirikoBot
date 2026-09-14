# ADR-004: Music resolution and playback engine

## Status

Proposed future subsystem. No new playback engine or provider support is certified by this ADR; engine selection remains pending live source/playback/reconnect tests.

## Problem

Legacy music has 17 command files, DisTube and LavaShark adapters, and a 10-second per-guild player-message refresh. DisTube registers YouTube, Spotify, SoundCloud and Deezer plugins. LavaShark's playlist creation explicitly throws not implemented. `.env.example` declares `DISABLE_YOUTUBE=true`, but the audited application never reads that switch. The source does not prove a frequency of playback failures or HTTP 429 responses.

## Options considered

- Repair and retain the existing DisTube/LavaShark adapters.
- Use Discord Player 7 with in-process voice playback.
- Use Lavalink 4 behind a bot adapter, accepting an additional service/plugin lifecycle.

## Decision proposed

Define separate **metadata resolvers** and an **audio playback engine**. Required source targets are **YouTube, Spotify, Deezer and SoundCloud**. A Spotify/Deezer catalog match is not a playable audio stream; report when a matching, permitted playable source cannot be resolved. Do not claim source support merely because a URL parses or an extractor package exists.

Compare Discord Player and Lavalink using the same queue, history, pause/resume, seek, filter, volume, playlist, cancellation and reconnection scenarios. Make the engine choice after deployment-representative tests. Direct URLs or additional sources can be added through explicit capabilities and validation rather than silently broadening network access.

Keep per-guild player ownership and transport-independent queue contracts. Preserve every legacy command, option and alias while adding missing prefix parity. Publish now-playing changes from player lifecycle events and user actions; coalesce edits and obey Discord retry signals. Do not retain unconditional per-guild message polling as the UI architecture.

## Consequences

Provider access and matching behavior can change independently of the engine. Lavalink adds a process and plugins to operate; in-process playback consumes bot resources. Neither choice guarantees uptime, uninterrupted fallbacks, voice reconnection success or elimination of rate limits. Queue persistence and stream recovery require explicit semantics; a stored URL alone cannot resume a live stream.

## Validation and evidence

Test each required source with authorized credentials and current access conditions, then exercise missing/deleted tracks, blocked/quota responses, leave/rejoin, restart, queue mutations and disposal. Measure latency/resource use before setting operational targets. See [provider evaluation](../dependency-evaluation.md), [legacy music contracts](../legacy-command-manifest.json), and [job/lifecycle decision](ADR-012-job-scheduler-and-task-queue.md).
