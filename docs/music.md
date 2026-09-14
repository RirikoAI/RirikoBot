# Music subsystem: contracts, compatibility and recovery

**Pending implementation.** The foundation has no music package, registered music commands, source resolver or voice player. Examples below are future contracts, not callable commands. Requirements: [blueprint](../BLUEPRINT.md) sections 10 and 75 and [requirement ledger](requirements.md). [ADR-004](adr/ADR-004-audio-and-music-engine.md) keeps engine selection open until representative tests pass.

## 1. Source baseline and ownership

The immutable [legacy manifest](legacy-command-manifest.json) records 17 music command files at `0d8be25b17e25dfa61812d6e7b5aaf8497687257`. The [legacy service](https://github.com/RirikoAI/RirikoBot/blob/0d8be25b17e25dfa61812d6e7b5aaf8497687257/src/music/music.service.ts) wires DisTube/LavaShark and refreshes player messages every ten seconds per tracked guild. Its update/clear paths delete fetched channel messages; the replacement must manage only its recorded controller message. No measured frequency of playback failures or HTTP 429s was supplied.

DisTube registers YouTube, Spotify, SoundCloud and Deezer plugins, establishing historical wiring rather than current access. LavaShark `createPlaylist` throws not implemented. Several callers pass interaction/message objects where adapters expect guild IDs, and duration units differ. `.env.example` declares `DISABLE_YOUTUBE`, but the application never reads it. Do not reproduce an ineffective toggle or infer source support from package presence.

| Boundary | Owns | Excludes |
|---|---|---|
| Command/AI/component transport | Authenticated actor, normalized request, acknowledgment | Raw player access, credentials and queue mutation |
| Music application service | Authorization, ordered queue/history, receipts, settings/recovery | Provider DTOs and FFmpeg shell strings |
| Metadata resolver | Classification, search, playlist pages, attribution/access evidence | Promise that catalog metadata has playable audio |
| Playback resolver | Authorized playable candidate and transient locator | Queue order or silent recording substitution |
| Engine adapter | Voice connection, current audio resource and typed events | Independently authoritative queue/playlist database |
| UI publisher | Exact controller-message identity and coalesced presentation | Arbitrary channel-message editing or repeated business operations |

Use the common request/error/capability conventions in [adapters](adapters.md). Physical repositories/migrations belong in [database](database.md) and must be implemented with their owning services.

## 2. Metadata versus playable audio

Illustrative proposed contracts, **not existing exports**. IDs are strings; durations/positions are integer milliseconds, with `null` for unknown duration. Live is explicit, never inferred from zero duration.

```ts
type MusicSource = 'youtube' | 'spotify' | 'deezer' | 'soundcloud';
interface TrackReference {
  source: MusicSource;
  sourceId: string;
  canonicalUrl: string; // validated attribution link, never a signed locator
}
interface TrackMetadata {
  reference: TrackReference;
  title: string;
  artists: readonly string[];
  durationMs: number | null;
  live: boolean;
  artworkAssetId?: string;
  observedAccess: 'metadata-only' | 'full' | 'preview' | 'blocked' | 'unknown';
  observedAt: string;
}
interface PlayableHandle {
  handleId: string; // transient adapter-owned handle; never persisted/logged
  playbackReference: TrackReference;
  audioKind: 'full' | 'preview' | 'live';
  seekable: boolean;
  expiresAt?: string;
  match: 'original' | 'confirmed-alternative';
}
interface QueueEntry {
  entryId: string; // unique occurrence, including intentional repeated tracks
  requestedBy: string;
  original: TrackMetadata;
  addedAt: string;
  resolution: 'pending' | 'ready' | 'unavailable';
}
```

Declare search, metadata, playlist pagination, playable acquisition, preview/full access, live and seek capabilities independently. `canResolve` is cheap syntax classification without network calls, not health or authorization. Requests carry the shared operation/context envelope, deadline and abort signal. Playlist expansion returns bounded pages and an opaque cursor rather than downloading an unbounded audio list. Acquire playable handles near playback time; never export signed stream URLs, cookies or private-track tokens.

Keep original requested metadata and actual playback attribution distinct. An allowed alternative must be checked for title, artist, recording/version, duration and content eligibility. A cover, remix, karaoke version or preview is not automatically the requested track. Ambiguous matches need user selection saved in the receipt. Switching an active track to another recording must not masquerade as uninterrupted continuation.

### Required-source assessment, checked 2026-09-14

| Required source | Primary-source evidence | Admission and unresolved gate |
|---|---|---|
| YouTube | Data API provides catalog/search resources; policies constrain audiovisual handling. Metadata is not an audio-download grant. [API](https://developers.google.com/youtube/v3/docs), [policies](https://developers.google.com/youtube/terms/developer-policies) | Bot playback remains unverified. Require an independently assessed authorized route; no cookie rotation, client impersonation or block-bypass fallback |
| Spotify | Track API provides metadata; Discord Player's official Spotify extractor is search-only and bridging can mismatch. [Track API](https://developer.spotify.com/documentation/web-api/reference/get-track), [extractors](https://discord-player.js.org/docs/creating-a-music-bot/02_extractors_integration) | Verify credentials/quota/market and permitted use. A Spotify URI is not direct audio; failed allowed matching returns unavailable |
| Deezer | Official API entry redirected to developer login during review. [Portal](https://developers.deezer.com/api) | Current app/API/preview/full-stream access was not established. Preserve the required target as an open gate; historical plugins do not prove native playback |
| SoundCloud | Official guide distinguishes playable, preview and blocked access and requires attribution. [Streaming guide](https://developers.soundcloud.com/docs/api/guide#streaming-tracks) | Verify credentials, access/region and stream capability per request. Public URL does not guarantee streaming; private access needs authorization |

Direct HTTP/HLS, local files, Bandcamp and other sources are optional future capabilities, not silent substitutes for the four required targets. Install/allow each resolver explicitly. Do not evade blocked, region-restricted or unauthorized access. A different permitted recording may be offered transparently only where the applicable provider rules allow it.

## 3. Queue state and engine boundary

Proposed authoritative session fields: guild/session ID, ownership epoch, revision, desired playback state, voice/text/controller IDs, current entry, upcoming entry order, bounded history, repeat/autoplay policy, desired volume/mute state, last observed engine state/position/time and operation receipts. Saved metadata is not a network connection.

Serialize transitions **per guild**; other guilds progress independently. Commit operation intent and reserved capacity, perform slow resolution/engine work outside a database transaction, then reconcile by operation/session/epoch. Stop/replacement increments a generation so late resolutions or track-end events cannot restart playback or consume another entry.

```ts
interface EngineCommand {
  guildId: string;
  sessionId: string;
  ownershipEpoch: number;
  operationId: string;
  generation: number;
  action:
    | { kind: 'connect'; voiceChannelId: string }
    | { kind: 'play'; entryId: string; handleId: string; positionMs: number }
    | { kind: 'set-paused'; paused: boolean }
    | { kind: 'seek'; positionMs: number }
    | { kind: 'set-gain'; percent: number }
    | { kind: 'stop' }
    | { kind: 'disconnect' };
}
interface EngineObservation {
  sessionId: string;
  generation: number;
  state: 'disconnected' | 'connecting' | 'idle' | 'buffering' | 'playing'
    | 'paused' | 'reconnecting' | 'failed';
  entryId: string | null;
  positionMs: number | null;
  observedAt: string;
}
```

Expose typed apply/observe/close operations and capabilities. Filters are validated preset operations, never arbitrary process options. Engine acceptance may precede confirmed playback; report queued/loading/playing separately. Normalize natural end, replaced, stopped, load failure and disconnect with session/generation/entry identity. Only a valid natural end or authorized skip advances the queue.

A local mutex cannot coordinate multiple bot writers. Such deployment needs a durable lease/epoch plus engine-specific exclusive ownership. Application event fencing does not make an external engine honor a fencing token; if stale controllers cannot be excluded, fail that deployment gate. Queue capacity includes committed and reserved entries so parallel imports cannot overfill it.

| Trigger | Domain transition | Engine/receipt obligation |
|---|---|---|
| Enqueue while idle | Reserve entries, commit order and receipt | Resolve/connect/start current generation; initially report queued |
| Natural end | History update, next entry under repeat policy | Duplicate terminal event does not advance twice |
| Skip | Record skip, select next, override one track-repeat iteration | Replaced/stopped event cannot skip another entry |
| Stop | Clear current/upcoming desired playback; stop session autoplay | Abort pending resolution; retain bounded history/receipts |
| Voice loss | Reconnecting or suspended with queue retained | Reconcile actual connection; saved queue is not audible playback |
| Disable | Block admission and new actions | Bounded stop/disconnect, retained data and explicit later recovery |

## 4. Exact legacy compatibility

All rows remain **pending in v2**. Names/options come from the manifest. Slash and prefix call the same service. Prefix uses configured prefix in place of `!`. Preserve legacy free-text `!play song name` through a deliberate compatibility adapter: today's foundation parser does not join trailing words automatically.

| Legacy slash | Prefix | Meaning or required repair |
|---|---|---|
| `/back` | `!back`, `!previous` | Previous history entry; clear no-history outcome |
| `/filter` | `!filter` | Permitted filter menu; source has no slash filter-name option |
| `/join` | `!join` | Join requester's allowed voice channel without creating a song |
| `/leave` | `!leave` | Leave bot session; await completion, invalidate pending starts |
| `/lyrics [song]` | `!lyrics`, `!lyrics "song name"` | Current track if omitted; isolated search session |
| `/mute` | `!mute` | Toggle, restoring recorded desired volume |
| `/pause` | `!pause` | Legacy **pause/resume toggle**, distinct from new explicit actions |
| `/play music name:...` | `!play song name` | Search/resolve/enqueue with configured music channel |
| `/play playlist name:...` | Proposed `!play playlist "Mix"` | Explicit saved-playlist parity; old prefix treats text as a query |
| `/playlist ...` | Six paths below | Implement the missing legacy prefix handler |
| `/playtop song:...` | `!playtop song name` | Insert after current (source position 1); do not interrupt |
| `/queue` | `!queue` | Bounded ordered current/upcoming view |
| `/repeat` | `!repeat` | Cycle off → track → queue → off |
| `/rewind time:30` | `!rewind 30` | Positive seconds backwards; clamp at beginning |
| `/setup-music` | `!setup-music` | Administrative controller setup; no blanket channel deletion |
| `/skip` | `!skip` | Advance once; await lookup and operation before success |
| `/stop` | `!stop` | Stop and clear queue; do not swallow failure and claim success |
| `/volume volume:50` | `!volume 50` | Preserve valid 0–100 inputs; reject malformed text rather than stripping non-digits |

There are 18 table rows because `play` has two slash subcommands: **17 distinct roots**. Resume, seek, shuffle, queue move/remove/clear, replay, now-playing, autoplay, favorites and import/export are blueprint-required future operations; final registration names remain to be groomed.

| Exact playlist slash | Prefix parity to implement |
|---|---|
| `/playlist create name:Mix public:false` | `!playlist create "Mix" --public false` |
| `/playlist delete name:Mix` | `!playlist delete "Mix"` |
| `/playlist add-music playlist-name:Mix name:...` | `!playlist add-music --playlist-name "Mix" --name "song name"` |
| `/playlist delete-music playlist-name:Mix name:...` | `!playlist delete-music --playlist-name "Mix" --name "song name"` |
| `/playlist list name:Mix` | `!playlist list "Mix"` |
| `/playlist lists` | `!playlist lists` |

Follow [command contracts](commands.md) before adding nested options/components. Ambiguity between legacy free-text queries and new prefix subcommands needs a deterministic escape/disambiguation rule and fixtures, not an undocumented parser change.

## 5. Operation semantics

| Operation | Proposed behavior | Race/failure rule |
|---|---|---|
| Pause/resume | Idempotent explicit set-paused; legacy toggle translated once | Duplicate receipt never toggles twice |
| Previous/replay | Previous selects eligible history; replay restarts current at zero | Record history cursor/current disposition; missing history is not skip |
| Seek/rewind | Milliseconds internally, validated seconds converted once | Reject live/non-seekable; clamp finite position to track bounds and report it |
| Repeat | Track loops on natural completion; queue appends completed eligible entries | Skip overrides one track loop; permanently failed entries cannot loop forever |
| Shuffle/move/remove | Stable upcoming occurrence IDs; save shuffled order | Expected revision prevents stale positions targeting other entries |
| Clear | Remove upcoming; current continues unless explicitly stopped | Canceled expansion reservations cannot append later |
| Autoplay | Only on real exhaustion, bounded allowed-source recommendations | User entries win; late recommendations cannot resurrect stopped sessions |
| Volume/mute | Desired gain separate from mute; effective gain zero while muted | Service clamps finite values and reports applied value; no hearing-safety guarantee |
| Filters | Approved preset IDs, validated parameters, supported capability | Report unsupported; stream restart/seek preservation only where verified |
| Lyrics | Current or selected track via independent read-only adapter | Bounded scoped results; attribution/link when full-text delivery unavailable |

Proposed volume default 50%, maximum 100% preserves the valid legacy range; guilds may lower the cap. Raw AI requests of 500% are clamped by the service, with effective value reported. Do not adopt a 150% “safe” guarantee. NaN, infinity and malformed values fail validation. Volume changes while muted update desired volume without unmuting; legacy mute remains deliberate toggle.

Autoplay excludes failed/blocked/recently repeated candidates and has session expansion/time bounds. Shuffle preserves attribution. Lyrics search uses an authorized provider with applicable content permissions, never raw HTML injection or a claim that a search API automatically grants full lyric text. Recommendations/provider outputs cannot change queue policy.

## 6. Authorization, voice membership and AI

Every command/button/AI tool passes the same checks: authenticated guild actor, music enabled/configured, allowed text/command channel, fresh voice membership, allowed voice channel, bot capability, DJ/role policy, queue state and quotas. Verify fresh voice state before connect/control. A guild administrator does not implicitly relocate an occupied session by issuing play elsewhere; transfer is an explicit audited action.

Proposed default: ordinary members in the active voice channel may enqueue within limits and view permitted metadata; control of others' playback, queue entries, filters and volume requires DJ authority or a defined vote path. Requesters may remove their own upcoming entry. Setup requires guild management and channel-management capability when creating/editing channels. Stage-channel support needs separate tests and remains unavailable until verified.

Vote-skip binds session/current-entry/generation and distinct eligible non-bot listeners. A candidate threshold is `floor(eligibleListeners / 2) + 1`, with a documented recalculation policy for membership changes. This is a proposed product rule: one vote per actor/current track, no cross-channel votes or votes carried to the next song. DJ override still passes module/voice checks. Keep limited decision evidence without retaining listening history indefinitely.

The planned initial AI registry exposes `queue_song`, as specified in [AI](ai.md). It invokes the music service's search/resolution and enqueue operations; `music.search` and `music.play` describe domain operations, not additional registered tools. A separate read-only music search tool is optional future scope. Transport supplies guild/user/channel authority; model arguments only contain bounded query/selection data. Recheck voice state after slow model/search work. Suggestions do not authorize private media playback in a public guild. No raw engine object, node password, local path, FFmpeg option or “disconnect everyone” capability is exposed. Tool results distinguish queued/loading/playing; the model must not claim audible playback before observation.

## 7. Persistence, playlists and restart

Persist queue order/attribution/source references, desired controls, receipts, controller IDs and bounded history. Do not persist buffers or assume expiring locators are reusable. Checkpoint confirmed position/time at transitions and, if justified, a bounded recovery cadence. Event-driven UI does not prohibit engine heartbeats, lease renewal or recovery checkpoints.

Legacy playlists are global owner-associated records: the [data manifest](legacy-data-manifest.json) has no playlist guildId, and tracks have no ordering column. Preserve IDs, owners, public flags, timestamps and raw source rows. Add explicit track position with a documented deterministic migration order; never claim recovery of ordering absent from source. Guild-curated playlists are a distinct explicit scope.

Playlist create/add/delete/reorder and ownership/revision checks commit transactionally. Names are display/compatibility lookup; stable IDs are mutation targets. Ambiguous names must resolve within authorized scope, not by the first global match. Public read/play never grants edit rights. Private-source access must still hold at playback even for a public playlist. Deletion deliberately handles child tracks; legacy foreign keys do not provide an assumed cascade.

Queue import accepts a bounded versioned metadata document. Validate every source link and reject embedded credentials, paths, oversized/nested input and unsupported sources. Preview capacity and unavailable entries. Reserve capacity before expansion; commit known ordering or return an explicit partial receipt under a declared partial-admission policy. Export metadata/order only, without tokens or private signed locators. Favorites are owner-scoped unique source references, not provider-access grants.

| Recovery window | Required result |
|---|---|
| Commit enqueue, crash before play | Recover accepted queue; acquire owner and revalidate policy/voice/source |
| Engine accepted, response lost | Observe/correlate engine state; uncertain identity remains uncertain, not a blind second start |
| Bot reconnects, external session survives | Verify remote session/current-entry ownership before reconciling desired state |
| Engine/node restart | Retain queue, reacquire permitted source, report interruption; no seamless-resume claim |
| Interrupted live/non-seekable source | Offer live edge or next entry by policy; historical position is unrecoverable |
| Expired/blocked source | Re-resolve authorized original; mark permanent unavailability; offer only transparent permitted alternatives |
| Deleted/empty voice channel | Suspend/disconnect after grace; no migration to arbitrary destination |
| Stop/disable during resolve | Abort where possible; discard old generation and dispose unused handle |

Proposed restart default is **suspended until explicit resume**, avoiding surprise playback after long downtime. Later opt-in automatic recovery needs bounded resume age/position staleness and the same authorized destination/listeners. Persistence preserves intent, not uninterrupted audio.

## 8. Controller UI and native resource safety

Store exact guild/channel/message/session identity for the bot-owned controller. Render on track/state/queue/policy changes and user refresh. Coalesce bursts to newest revision; one outstanding edit per controller, skip identical payloads and honor Discord retry timing. Recreate a deleted controller through one authorized deduplicated repair path. Never fetch “last message” as authority or clear a channel to make room.

Buttons use opaque server-held action/session references with version and message/guild/entry-generation binding. Recheck voice/DJ access on each click. Public shared controls authorize every actor independently; personal search/pagination sessions remain requester-bound. Queue pages use a consistent snapshot/revision and stable entry IDs. Stale numeric positions trigger refresh, not mutation of whichever track now occupies the position. Replacing the controller invalidates old controls.

Show original source and actual playback source when different, loading/playing/paused/reconnecting state, volume/mute/repeat, requester, bounded upcoming list and last-updated position. Do not simulate continuous progress with unconditional ten-second edits. Suppress mention parsing. Optional channel-topic updates have their own slower budget and require permission. UI failure neither stops correct playback nor erases queue state.

Native/audio work runs in a bounded pool with explicit CPU/memory/process/file-descriptor/time limits. Spawn FFmpeg with an argument array and no shell. User input cannot become arbitrary options, executable paths or filter expressions. Prefer validated input streams. If the worker fetches URLs, constrain destinations/redirects/protocols and every manifest/segment hop. Untrusted media cannot reference local/private/link-local/metadata endpoints or file/pipe/concat protocols. FFmpeg provides protocol allowlists and network timeouts; protocol allowlisting alone is not SSRF protection. [FFmpeg protocol options](https://ffmpeg.org/ffmpeg-protocols.html).

Dispose child processes, decoders, streams, listeners and timers on skip/stop/failed start/shutdown. Bound stalled reads/buffered audio; never buffer entire unbounded live streams. Audio caching requires explicit permitted use and retention policy. Artwork uses shared validated asset storage. An external Lavalink host needs equivalent limits/network controls, protected credentials and a nonpublic control endpoint.

## 9. Proposed configuration and error catalog

These are candidate design fields/defaults, **not current settings keys or environment variables**. Operator hard limits cap guild settings; changes require expected revision and audit.

| Setting | Proposed default/shape | Validation/owner |
|---|---|---|
| Enabled | false until implementation/probes | Guild manager; installed code required |
| Engine/sources | Explicit engine and allowed-source set | Operator credentials/plugins; guild may narrow |
| Controller channel | Explicit guild text channel | Read/send/embed capability; setup permissions |
| Voice policy | Same-channel controls, allowed channel IDs | Fresh state; stage capability separately gated |
| DJ/vote policy | Explicit role set and rule | Manager; deleted role cannot create fallback privilege |
| Queue capacity | Candidate 100 current/upcoming/reserved entries | Atomic reservation and operator ceiling |
| Per-user pending | Candidate 10 | Fair-use bound; autoplay has its own quota |
| Expansion/search | Candidate 50 items/expansion, 10 search results | Provider page limits, deadline and total capacity |
| Volume | Default 50, maximum 100 | Finite values; guild may lower |
| Idle/empty grace | Candidate 180 seconds | Bounded timer canceled when activity resumes |
| Recovery | Suspended; optional bounded resume | Explicit age/position tolerance and destination checks |
| Filters/autoplay | Disabled unless configured/supported | Preset allowlist and bounded recommendations |
| History/receipts | Bounded retention/visibility | No tokens/raw audio; explicit operator/guild policy |

Set request/engine timeouts and concurrent-guild capacity from measured prototype behavior. Map results to the illustrative common `ProviderResult<T>` in [adapters](adapters.md): completed, accepted, failed and unknown. A provider/network deadline after submission can be unknown, not necessarily a safe retry. Distinguish unsupported/not-configured/authentication/forbidden, invalid request, rate limit/quota, unavailable, timeout, cancellation and invalid response. Domain missing-media/no-match outcomes retain useful meaning without leaking credentials or raw provider bodies.

Retry only safe operations within bounded attempts/deadline and provider backoff. A failed large playlist must not produce a tight loop of hundreds of requests. Per-guild fairness and global resource admission remain separate from command cooldown. Operator health shows sampled capability/time/scope and recent failures; one successful metadata probe does not certify playable audio, every region or every credential.

## 10. Engine evaluation and acceptance

Historical candidates remain **Discord Player 7.2.0** and **Lavalink 4**, per [dependency evaluation](dependency-evaluation.md). The moving `@discordjs/voice` main page currently advertises Node >=24.17.0 and DAVE dependencies, above this workspace's Node 24.13.1. Do not assume arbitrary latest voice dependencies fit the historical baseline. Pin and test a supported exact combination; this review changes no dependency. [Voice documentation](https://discord.js.org/docs/packages/voice/main).

| Probe | Same fixture for both engines | Required evidence |
|---|---|---|
| Four required sources | Authorized track/search/playlist requests where permitted | Metadata/full/preview/blocked result, app/region/scope, adapter version and gaps |
| Controls | Toggle compatibility, explicit pause/resume, seek, previous/replay, loop/skip, shuffle/move | Correct state/events, no duplicate advance |
| Format/duration | Short/unknown/live/seekable/non-seekable/invalid media | Millisecond normalization and decoder behavior |
| Voice | Join/leave/empty, removed permission, disconnect, resumed session, node loss | Recovery timing and interruption semantics without token logs |
| Resources | Same tracks at increasing concurrent guild counts | CPU/RSS/event-loop delay/process count/bandwidth/starvation and cleanup plateau |
| Concurrency/crash | Parallel enqueue, stop during resolve, duplicate end, crashes at intent/apply/receipt | Revision/ownership invariants and bounded recovery |
| UI | Rapid events, deleted controller, stale buttons, rate-limited edit | Coalescing/repair counts and playback independence |
| Security | Cross-channel DJ/AI, private playlist, hostile redirect/filter input | Denial before effects, no credential/path leakage |

Discord Player extractors may resolve metadata without audio and may bridge sources; configure the chosen adapters rather than inheriting an unreviewed fallback. Lavalink offers track loading/player updates and session resumption, but APIs alone do not prove application restart continuity. [Extractors](https://discord-player.js.org/docs/creating-a-music-bot/02_extractors_integration), [Lavalink REST](https://lavalink.dev/api/rest), [WebSocket](https://lavalink.dev/api/websocket).

Unit/service fixtures must prove operation invariants with fake engines/resolvers and controlled time. Integration verifies real repository order/revisions/ownership/recovery receipts. Authenticated provider/voice probes are distinct opt-in evidence. This documentation task ran no playback, provider or native-engine tests; source support, engine choice and subsystem completion remain unverified until their implementation story records results.
