# ADR-004: Music resolution and playback engine

## Status and scope

**Proposed; implementation and final engine selection pending.** This record specifies the application boundary and the evidence needed to select an engine. It does not certify source access, a deployed voice service or command availability. The [music specification](../music.md) defines exact legacy compatibility, proposed contracts, lifecycle, authorization and acceptance cases; [dependency evaluation](../dependency-evaluation.md) preserves historical version candidates.

## Context and observed problem

The immutable legacy snapshot `0d8be25b17e25dfa61812d6e7b5aaf8497687257` contains 17 music command files. DisTube and LavaShark adapters expose inconsistent identity/unit assumptions, and LavaShark playlist creation throws not implemented. DisTube plugin wiring names YouTube, Spotify, Deezer and SoundCloud, but wiring does not demonstrate present access. The ten-second controller refresh and channel-message deletion paths must become explicit, message-scoped presentation ownership. No supplied measurement establishes a playback failure rate or frequency of Discord 429 responses.

Compatibility includes behavior, not only command names: `/pause` toggles pause/resume; `/mute` toggles and restores gain; `/repeat` cycles modes; `/playtop` queues immediately after the current track; `/rewind time` uses relative seconds. Playlist commands have six distinct operations and need designed prefix parity. See the [audited manifest](../legacy-command-manifest.json) and the detailed syntax table in the music specification.

The required source targets remain **YouTube, Spotify, Deezer and SoundCloud**. A catalog result, preview and full playable recording are different capabilities. Playback must also coexist with AI tools, component requests and prefix/slash commands without four independently mutable queues.

## Proposed decision and invariants

Adopt one transport-independent music application service and a replaceable engine adapter. Final package selection is gated by the prototype below. A future implementation must enforce these invariants:

1. **One ordered authority per guild.** The application owns queue entry IDs, revision, history, loop/shuffle policy and durable receipts. The engine owns a voice connection and current resource. Library-managed autoplay/queue advancement must be disabled or adapted so that one engine event cannot advance both queues independently.
2. **Metadata is not audio.** Store original source identity and attribution separately from an expiring playable handle. A resolver reports full/preview/live/blocked/unknown access, seek capability and any alternative recording. Do not claim original-source playback after silently matching a different recording.
3. **Identity and units cross the boundary explicitly.** Pass guild/session/entry/command IDs, controller epoch and integer milliseconds. Never pass Discord interaction objects to a guild-ID API. Normalize adapter events into natural completion, replaced/stopped, failure and connection state; stale generations cannot advance the queue.
4. **Every transport uses the same authorization and receipt path.** Components and AI tool calls do not gain engine access. Authenticate the actor, check current guild/module/voice/DJ/vote policy, reserve the operation, then perform the bounded effect. A timeout after submission is an unknown outcome requiring reconciliation, not permission to repeat a destructive queue mutation.
5. **Network work is outside database transactions.** Reserve capacity and entry identity transactionally, resolve with cancellation/deadline, then attach a result only if the reservation and generation remain current. Cancelled work must dispose of resources even when its late result is rejected.
6. **Presentation is replaceable.** Store exact controller-message identity; publish current state through coalesced edits and handle Discord retry signals. Playback progress does not require unconditional UI polling, and controller recreation never recreates an audio command.
7. **Durability records intent, not stream bytes.** Persist order, stable track references, policy and receipts. Signed locators, access tokens and native handles are transient. Restart defaults to suspended recovery requiring explicit authorized resume; it does not promise sample-exact playback continuation.

Shared proposed request/result conventions are described in [adapters](../adapters.md). They are illustrative interfaces, not existing exported runtime APIs.

## Alternatives and tradeoffs

| Candidate | Benefits to verify | Costs and failure boundaries | Selection consequence |
|---|---|---|---|
| Repair DisTube/LavaShark wrappers | Smaller immediate compatibility change; historical command integration is available | Existing identity/unit inconsistencies still require repair; two wrapper models and source plugins require separate evidence; unimplemented playlist path remains | Keep as a comparison/migration baseline, not evidence that legacy defects disappear |
| Discord Player, historical candidate 7.2.0 | Higher-level in-process playback/extractor integration may reduce adapter work | Decoder/FFmpeg/voice load shares the bot's resource boundary; built-in queue semantics must not compete with application authority; extractor support varies | Preferred first prototype for operational simplicity, conditional on all hard gates |
| Direct `@discordjs/voice` plus custom resolution | Explicit resource and voice control with minimal hidden queue ownership | Team owns more extraction, buffering, reconnect and codec integration; larger implementation/test surface | Use only if higher-level adapters cannot enforce required semantics and the extra maintenance is justified |
| Lavalink 4 plus a thin adapter | Separate audio process; observable node/player protocol and independent resource limits | Adds deployment, JVM/node capacity, control credentials, plugin upgrades and session ownership; node reconnection does not restore application intent automatically | Select if measured isolation/capability benefits justify additional operations |

None of these alternatives makes an unavailable source available by itself. The official [Discord Player extractor guide](https://discord-player.js.org/docs/creating-a-music-bot/02_extractors_integration) distinguishes Spotify search from audio streaming and documents limitations of bridging. [Lavalink REST](https://lavalink.dev/api/rest) and [WebSocket](https://lavalink.dev/api/websocket) APIs describe player/session control; they do not certify all required third-party sources. A separately managed node needs actual exclusive controller ownership: an epoch in our database cannot fence an external server that does not enforce it.

## Prototype and decision gates

Run both principal candidates against the same sanitized, authorized fixture catalog, deployment CPU/memory limits, concurrency steps and bot revision. Record exact engine, voice, extractor/plugin, FFmpeg, Node/JVM and image versions plus credential scope and test date. Historical candidate versions are not a blanket compatibility claim; moving upstream documentation must be checked against the selected runtime before installation.

| Gate | Required evidence and pass condition |
|---|---|
| Four required source targets | Per-source URL/search/playlist metadata and playable outcomes, including full/preview/unavailable; record access conditions, recording match and permitted fallback. A required capability gap stays open and needs an explicit product decision before completion can be claimed |
| Compatibility and queue authority | Run all 17 legacy roots and playlist operations, both command transports, AI and components through one service; duplicate events/receipts, concurrent play/skip and stale controls do not duplicate or reorder effects |
| Audio controls | Finite/live tracks, pause toggles, previous, relative seek, queue/track repeat, shuffle, gain/mute, filters and unsupported capability responses match the documented policy |
| Recovery | Reconnect, kick, node loss, process crash, expired locator and disable/cancel at each submission phase leave a reconciliable queue, one active controller and no orphan decoder |
| Resource and latency | Report sample size, cold/warm resolve-to-audio and command latency distributions, CPU, RSS/heap, native child count and cleanup over a declared concurrency/soak duration. Set release budgets from measured deployment capacity before sign-off; do not invent an uptime result |
| Security and presentation | URL/redirect/manifest-segment restrictions, private-network rejection, credential redaction, process argument boundaries, controller authorization and rate-limit/coalescing cases pass |
| Operational feasibility | Reproducible deployment, health signals, safe node credentials, incident recovery and dependency upgrade process are demonstrated; their operator cost is included in the decision |

Start with offline service/adapter tests, then controlled integration faults, then authorized live probes. Mocked success proves our contract behavior only. Unavailable credentials or inaccessible provider enrollment are recorded as unverified, not as successful support. Deezer access remains specifically unverified; neither an installed plugin nor a preview URL settles full playback. The music specification records source-specific official references and current limitations.

Select Discord Player only if it satisfies the hard semantic, resource and access gates within the measured deployment budget. Select Lavalink if it satisfies those gates and its demonstrated isolation or capability benefit outweighs its operating cost. If neither qualifies, keep the decision open, preserve source gaps and groom a bounded follow-up; do not ship an unsupported feature claim. No unmeasured weighted score overrides a hard gate.

## Consequences, rollout and reversal

This boundary adds normalization, receipts and reconciliation code, but allows engine failure to be investigated without rewriting commands, playlists or authorization. In-process playback needs bot-level native-resource containment; Lavalink needs separate audio capacity, protected control access and node lifecycle ownership. Both require bounded resolver concurrency, per-guild serialization and cancellation cleanup. FFmpeg protocol/timeout settings supplement application-level network validation; they are not a complete SSRF boundary. Lyrics and recommendation metadata have their own access/rate limits and must fail independently of current playback.

Roll out to explicitly enabled test guilds after acceptance evidence is attached. Migrate durable references and ordering with a verified plan; do not invent ordering absent from legacy playlist-track rows. Drain or suspend a session before changing its engine. A rollout must retain the old adapter/build and compatible durable schema long enough to recover; switching binaries alone does not undo a data migration. Resume through fresh authorization/resolution and create a new session generation so old events/components cannot mutate the replacement session.

Revisit the selection when a required source changes access, a supported runtime/plugin upgrade breaks capabilities, measured native resource use exceeds the agreed budget, repeated ownership ambiguity appears, or operator cost exceeds the accepted deployment plan. Reversal means replacing the adapter behind the same application contracts and rerunning the gate matrix. It does not mean bypassing provider restrictions, promising uninterrupted fallback, or automatically enabling previously unsupported sources. Durable deferred work follows [ADR-012](ADR-012-job-scheduler-and-task-queue.md); live voice ownership remains a separate application concern.
