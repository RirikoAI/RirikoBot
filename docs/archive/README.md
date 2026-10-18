# Archive

This folder holds the design history of Ririko AI 2.0.0: the blueprint, the decision records, the plans and the migration specification. It is kept for contributors and for future development sessions, and it is not maintained as user documentation.

For installation, configuration and commands, read the documents in [docs/](../) and the project [README](../../README.md). The files here are the earlier design specifications of the features. They hold the internal workings (tables, services and balance math) that the user documents leave out. Section numbers in code comments refer to them.

## Contents

- [BLUEPRINT.md](BLUEPRINT.md): the master platform specification for 2.0.0.
- [adr/](adr/): Architecture Decision Records, ADR-001 to ADR-015.
- [implementation-roadmap.md](implementation-roadmap.md): phases and milestones of the 2.0.0 build.
- [dependency-evaluation.md](dependency-evaluation.md): the dependency evaluations and selections.
- [legacy-feature-inventory.md](legacy-feature-inventory.md): the audit of the 1.4.0 commands and entities.
- [migration-1.x-to-2.0.md](migration-1.x-to-2.0.md): the developer specification of the 1.x to 2.0.0 data migration. The user guide is [upgrading-from-1.4.md](../upgrading-from-1.4.md).
- [waifu-tcg-implementation_plan.md](waifu-tcg-implementation_plan.md): the implementation plan of the Waifu TCG.
- [adventure_game_plan.md](adventure_game_plan.md): the execution plan of the adventure game.
- [adventure-reward-ranks-plan.md](adventure-reward-ranks-plan.md): the plan of the companion reward ranks.

### Feature design specifications

Each file is the full design of a feature before its user page was rewritten. The user page has the same name without the suffix.

- [commands-design.md](commands-design.md): the command system and the middleware pipeline. User page: [commands.md](../commands.md).
- [modules-design.md](modules-design.md): the module catalog. User page: [modules.md](../modules.md).
- [adapters-design.md](adapters-design.md): the provider adapter design. User page: [adapters.md](../adapters.md).
- [dashboard-design.md](dashboard-design.md): the dashboard design, authentication and page specifications. User page: [dashboard.md](../dashboard.md).
- [music-design.md](music-design.md): the audio pipeline, package layout and the optional private package. User page: [music.md](../music.md).
- [ai-design.md](ai-design.md): the AI engine, tools and security rules. User page: [ai.md](../ai.md).
- [economy-design.md](economy-design.md): the ledger, anti-spam rules and ranking. User page: [economy.md](../economy.md).
- [moderation-design.md](moderation-design.md): permission checks, escalation and AutoMod. User page: [moderation.md](../moderation.md).
- [waifu-tcg-design.md](waifu-tcg-design.md): the card game design, scaling math and dungeon tools. User pages: [waifu-tcg.md](../waifu-tcg.md) and [tcg-player-guide.md](../tcg-player-guide.md).
- [tcg-card-synthesis.md](tcg-card-synthesis.md): how cards are drawn.
- [adventure-game-spec.md](adventure-game-spec.md): the adventure engine, contracts and scenario graphs. User page: [adventure-game.md](../adventure-game.md).
- [adventure-completion-economy.md](adventure-completion-economy.md): how adventure rewards are calibrated. User page: [adventure-completion-rewards.md](../adventure-completion-rewards.md).
- [adventure-runtime.md](adventure-runtime.md): the adventure rollout and verification notes.
- [adventure-reward-balance.md](adventure-reward-balance.md) and [adventure-reward-balance.json](adventure-reward-balance.json): the generated balance report (`scripts/adventure-reward-balance.ts`).
