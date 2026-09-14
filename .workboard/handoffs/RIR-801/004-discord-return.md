# RIR-801 / A-006 — discord-docs return

Agent discord-docs; thirteen-point RIR-801, scope RIR-800, branch feat/RIR-800-documentation-depth starting at 314cfec. Integration anchor 801103c0e4c70eca6a380d7d1122b11234695bb1; immediate PR #557 parent a04753a473c8a807892848052cc248cff3695805. Owned only docs/commands.md, docs/modules.md and ADR-002. Files settled and unstaged; no source/board/Git/publication mutations.

Read standing instructions, current ticket, blueprint and legacy source contracts, actual parser/registry/dispatcher/access/builtins, transport/presentation and settings. Compared complete Gemini counterparts at 1ba45ee3308b1bb5c7ecb4ea850c0009abb65d33. Official Discord interaction/application-command/component/permission references support external rules.

Commands now specifies actual syntax/grammar/coercion, registration and immutable dispatch, cooldown capacity, acknowledgement/privacy, help sessions and errors. Added manifest-backed legacy examples and proposed future TCG syntax. Corrected Gemini's excessive nesting: tcg-admin/config/energy is route, max-cap is an option; today's parser cannot implement that planned tree. Prefix replies cannot be ephemeral; metadata resolution is not full target authorization. Existing versus future tests remain distinct, including role loss between help clicks and capacity acceptance.

Modules now covers 27 required blueprint capabilities, installed/enabled/configured/available distinctions, policy ownership, durable admission/settlement/disable recovery, roles and entitlements, giveaways and saved draw, tracked auto-voice resources, timezone-aware reminders, region-aware free-game offers, welcome/farewell, games/escrow, social rendering, analytics and optional module admission. No module beyond core is claimed installed. ADR-002 gives alternatives, routing/authority/acknowledgement invariants, evolution costs, failure tests and reversal criteria.

Worker checks: 48 relative links, zero missing after fixing an incorrect ADR-007 link to actual ADR-012; scoped git diff --check passed. No duplicate unit runs. Coordinator reviewed actual three files against source contracts and broader corpus; required link correction and explicit future-test labels were incorporated. Central validation recorded separately.

Accept A-006 after persistence. Finish all twelve RIR-801 documents then close that leaf before data ticket RIR-802. Full source parity, nested routes, durable modules and live Discord still require implementation and separate validation. No new epic or publication authorized.
