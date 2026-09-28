# CHORE-1703 — Remove Adventure User-Specific S+ Rank Override

DONE (2026-09-28), 1 point. User requested removing the temporary forced S+ rank and creating a separate PR after #656 merged.

Removed the user-ID argument and exception from adventureRewardRank and its admission caller. All new runs derive reward rank solely from companion level; solo remains F and level 100 remains S+. The multipliers, completion economy and saved sessions/receipts are unchanged. No deployed data is rewritten.

Updated the prior override regression to prove the formerly privileged account matches another account for solo, level 1, level 18 and level 100, including stored rank, amount/chance multipliers and settled credits. Updated current runtime/policy documentation and annotated TASK-1712 as superseded.

Verification: 52 engine/rank tests passed; pnpm build, targeted ESLint, changed-code formatting and git diff --check passed. Board IDs/WIP validated. The unrelated full suite was not rerun for this small policy removal; prior environment/locale failures remain documented in STORY-170 and TASK-1715. No new command, service or database schema was introduced.

Branch: codex/remove-adventure-rank-override, based on develop/2.0.0 at 8e276f9. The unrelated assets/tcg/catalog/manifest.json change remains excluded. Restart with the new code for new admissions to use normal ranks; in-flight adventures keep their frozen rank. Next step: review and merge the separate PR.
