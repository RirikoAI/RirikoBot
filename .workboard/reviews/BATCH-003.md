# RIR-800 documentation epic — prepared PR review

The platform guides lacked enough operational detail to implement and review the requested domains consistently. This epic reviews all40 original docs, deepens38 and preserves two independently checked factual manifests. It adds a per-file review and aligns contracts, transaction identity, failure recovery, authority and acceptance evidence across13 ADRs and their guides.

Scope: BATCH-003 / RIR-800 only, seven documentation leaves plus explicitly approved RIR-808 prerequisite (76 leaf points:71+5). Proposed head feat/RIR-800-documentation-depth targets the preserved feat/RIR-110-review-evidence at a04753a473c8a807892848052cc248cff3695805. Eventual integration remains develop/2.0.0-astra at801103c0e4c70eca6a380d7d1122b11234695bb1, repository RirikoAI/RirikoBot. The approved local publication receipt de7504b is inherited and preserved separately.

- Foundation/developer guidance describes actual CLI, dispatcher, settings, migration and package behavior. Future APIs and missing services stay explicitly proposed.
- Domain guides add detailed source/playback and provider result contracts, durable jobs, AI isolation/tools, moderation outcomes, balanced economy/escrow, complete TCG examples, dashboard authority and credential rotation/recovery.
- Database/import/deployment/test guides expose real driver/schema/runtime limits and concrete reconciliation, recovery and failure-injection gates. Worked TCG arithmetic corrects inconsistent examples without declaring game balance accepted.
- All91 blueprint sections and35 exact acceptance criteria retain their statuses while gaining specific documentation evidence and owning-ticket links. Original blueprint and two source manifests retain exact bytes/hashes.
- RIR-808 is the approved minimal prerequisite: distinct fresh stack consent after a parent batch closes. It does not implement the separate unstarted RIR-005 integration fix. Bot/runtime/dependencies/container/CI sources did not change.

Validation:119 unit cases passed after the prerequisite; fresh lint, strict typecheck and build passed during RIR-806;13 SQLite/CLI cases passed with seven PostgreSQL cases skipped. Final corpus:41files,40-row original-file matrix,452 local references valid,126 requirement statuses unchanged. Board/requirements/diff checks passed. Source-object and manifest audits and exact commands/limits are in docs/testing.md and RIR-807 handoffs. No live Discord/provider/browser/container/production import or restore certification.

Fresh remote review found PR #557 was squash-merged into governance at7f0fd9ae589ec140adc4ab7f01ec63299ac4a42b. Its exact topic a04753a remains preserved; Astra integration is unchanged. The existing approved stack therefore still resolves to that topic. Do not silently retarget to governance or integration: squash ancestry is different and any changed integration plan requires explicit review. This branch was not pushed and no PR was created by this epic. This prepared description is not publication consent; ask the user at this checkpoint and stop before another scope.

Review entry point: docs/documentation-review.md. Preserve previous batches and RIR-005 backlog. No force/reset/rebase/merge or branch deletion is authorized.
