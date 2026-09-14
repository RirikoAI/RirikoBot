# RIR-110 — review evidence improvement story

Owner: coordinator. Planned estimate **13 points**, grouped under foundation epic RIR-100 before implementation. User explicitly approved **one stacked improvement story**, with the governance PR deferred. Original scope RIR-001 remains done; BATCH-001 is closed by D-001. No publication is approved.

Topic `feat/RIR-110-review-evidence` starts from the completed governance topic's metadata closing commit. Integration target remains `develop/2.0.0-astra`; pending parent topic is `chore/RIR-001-work-governance`. Record the actual parent SHA in the batch stack contract before any commit/publication check. This story must not hide inherited governance changes in an integration-target PR: use the parent topic as the immediate PR base until it is integrated, and explicitly verify the target.

Acceptance: preserve the user's full blueprint verbatim with provenance; map its numbered requirements to actual/pending implementation, tests and backlog; provide a pinned branch comparison; automatically detect missing requirement IDs, broken references and unsupported completion claims; guard the expressly authorized stack with tests; update future-session instructions and stop at this story's PR checkpoint.

Initial comparison: remote Astra `801103c0e4c70eca6a380d7d1122b11234695bb1`; remote Gemini `c07c2d6485b50e46041f51be48faa593549c3524`; local governance `dd5a0aef26ae56d4ee826bc54a10c5187f447552`. Findings were read-only review of the previous publication checkpoint. Gemini preserves BLUEPRINT.md but its only production TS file is a console greeting; no runtime/test/CI implementation there. Its displayed STORY-010/011/012 are missing from canonical JSON. Astra needs full blueprint preservation and explicit requirement traceability; existing major product modules remain unimplemented on both branches.

No bot feature, schema or provider is being implemented in this story. RIR-210 and the other platform epics stay outside execution. Sub-agents may assist only this story through recorded bounded assignments. Preserve findings, exact checks and next steps in subsequent handoffs; no automatic second story after completion.
