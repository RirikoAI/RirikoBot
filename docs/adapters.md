# Provider adapter contracts
Provider adapters are planned; none is claimed live in the foundation. Keep provider-specific authentication and DTO conversion inside each adapter. Application requests/results are typed domain contracts. Expose capabilities, supported models/formats/sources, limits and health information so UI does not offer unsupported features.

For each implementation, record official API availability, authentication, quotas/pricing, retention, webhook semantics and terms/license evidence at implementation time. Give requests a timeout, validate external responses, bound retries to safe/idempotent operations, respect rate-limit delays and configure primary/fallback/disabled states. Failed paid requests may have ambiguous billing; do not blindly retry generation indefinitely.

Use fake transports for deterministic failure/contract tests and separate optional live smoke checks. Never log bearer credentials, token-bearing URLs or private prompts. AI tools use a strict allowlist and authenticated actor context; provider output cannot create a new HTTP/shell/database capability.

