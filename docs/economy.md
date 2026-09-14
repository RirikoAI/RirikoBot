# Economy design — pending implementation
Legacy coins and karma are global user fields. Preserve them as global balances/XP and retain source meaning. There is no reliable historical ledger or user inventory to reconstruct; never invent one. New foundation settings tables do not import economy data.

Define repositories and transactions before wallet/bank/reward commands. Use integer checked nonnegative amounts, idempotency keys, debit/credit conservation, before/after balances and actor/source metadata. Concurrent purchases/transfers/trades must commit atomically or fail without partial changes.

Message, voice, attachment, game and quest events feed one reward engine. Check repeated content, bursts, cooldowns, attachment hashes, minimum participants, mute/deaf/AFK state before any credits or XP. Persist important reward cooldowns and test restart/replay abuse. Maintain indexed global/guild rankings; do not fetch every user per profile. Inventory, games and TCG use the same transaction boundary.

