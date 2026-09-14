# RIR-110 / A-002 — delivery-guard return

Coordinator persisted the completed worker return on 2026-09-14. Only `tools/workboard/git.ts` and `tools/workboard/git-store.test.ts` were assigned/changed. Branch `feat/RIR-110-review-evidence`; unchanged inherited HEAD `c1018829abf42fd2f8aad22948de343e51dc1e95`; integration target `develop/2.0.0-astra`. Worker made no board changes, Git mutations, publication or delegations.

Added `deliveryBase()` and `requirePublishedBase()`. Approved stacks resolve to the exact preserved parent branch/SHA until integration. An absent remote parent permits a concrete review plan but blocks publication. Parent movement, wrong PR target/SHA, arbitrary local integration anchors and undeclared inherited delivery commits are rejected. Path overlap is not implicit consent to inherit a prior scope.

Scope checks now use the actual integration merge-base or explicit parent anchor. Exact publication approval includes target branch as well as head/base/batch. Existing protected-branch, remote identity, staged-state, scope, clean-checkpoint and fast-forward checks remain. `guardPullRequest(board,event,expectedTarget?)` accepts verified branch/SHA; default stack validation checks the exact parent SHA too.

Evidence returned: **20 Git/store tests passed** using disposable repositories/worktrees; file-specific ESLint and repository strict typecheck passed. One initial run hit the existing five-second per-test timeout in a multi-push case; redundant resolver calls were removed and subsequent full runs passed without raising timeouts. No network push or real PR was part of tests.

Next: coordinator integrates the resolver into CLI approval/PR paths, adds schema/transition tests, records the actual user-approved stack, and runs combined verification. Cached refs alone do not prove current remote state: fetch exact integration and immediate target refs before approval. An advanced integration target must still be incorporated before publication. Accept this return before changing the story status.
