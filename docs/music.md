# Music subsystem design — pending implementation
Preserve exact command names/options and playlists from the inventory. The foundation currently has no player or extractor. Playback-engine selection remains proposed in ADR-004.

Required resolution sources are YouTube, Spotify, Deezer and SoundCloud. Model source capabilities separately from the playback engine. Spotify/Deezer metadata does not imply direct audio availability; matching another source must be explained/tested. Evaluate Discord Player and Lavalink with Node24 and current Discord voice requirements before choosing the concrete backend.

Services must implement per-guild queue operations, persistence/recovery where meaningful, DJ/channel/voice restrictions, inactivity cleanup, safe volume/seek ranges and structured AI actions. Update player messages from state events. Test queue invariants and failure recovery offline; verify actual audio/playlist access in live provider smoke tests before claiming source support.

