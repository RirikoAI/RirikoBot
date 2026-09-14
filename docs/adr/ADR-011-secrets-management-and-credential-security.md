# ADR-011: Credential authority, authenticated storage and recovery

## Status and evidence boundary

Accepted only for the existing environment configuration, trusted actor checks and structured redaction foundation. Dynamic credential storage, OAuth token persistence, encryption keys, rotation and recovery below are **proposed and unimplemented**. No vault table, encryption API, secret CLI or dashboard exists today. [Dashboard](../dashboard.md) and [web architecture](ADR-008-web-dashboard-architecture.md) own authentication/UX; this ADR owns secret lifecycle and decryption authority.

The legacy source stores Twitch client secrets and the Replicate token in application Configuration fields and prints parsed setup CLI arguments. The token's legacy name stableDiffusionApiToken does not make the actual Replicate integration a separate Stable Diffusion service. Scope is application-level, not evidence that every user already has a private vault. Preserve immutable source evidence and compatible setup intent while repairing storage/output. [Legacy inventory](../legacy-feature-inventory.md), [migration](../migration-1.x-to-2.0.md).

Current evidence: core config selects known environment fields and reports invalid field names; the logger redacts a finite list of named paths; publicError hides unknown errors but trusts AppError messages. Callers therefore must never construct AppError with raw secret-bearing provider text. No finite redaction list sanitizes arbitrary strings, renamed fields or all nested payloads. The operator CLI creates a trusted local actor from the first configured owner ID; it is not a remote login or proof of actual Discord guild membership.

## Threat boundary and alternatives

| Asset / boundary | Concrete risk | Required control |
|---|---|---|
| Provider credentials in SQL/backups | Database reader learns usable tokens | Authenticated ciphertext; keys separately controlled |
| Runtime keys/environment | Process or host compromise exposes usable material | Restricted runtime identity, minimal consumers, bounded memory lifetime and incident recovery |
| Web form → server | Cross-site submission, hostile guild ID, accidental echo | Session/CSRF and effect-time scope checks; write-only DTOs |
| Server → provider | Token sent to attacker-selected endpoint | Operator-controlled endpoint/capability binding and network policy |
| Logs/traces/errors | Raw request/config/argv contains secrets | Safe metadata allowlist, redaction defense and synthetic leak fixtures |
| Rotation/restore | Wrong key, stale token or lost generation breaks consumers | Versioned records, bounded migration, rehearsed restore and reconciliation |

Environment/runtime injection alone is simplest for process credentials but cannot satisfy arbitrary dynamic guild setup without deployment changes. Plaintext SQL with filesystem permissions is insufficient for SQL/backup readers. An external secret manager can supply strong operational separation, but adds an availability/identity/service boundary. Proposed initial choice: process credentials remain runtime-injected, and dynamic records use a small reviewed vault interface with a separately supplied key ring; a managed key/secret backend may implement that interface later. Do not build a general credential-sharing platform before a concrete feature needs it.

Authenticated encryption and cryptographically secure random generation are the selected primitives. Their protection depends on correct key/nonce management and deployment boundaries; they do not establish compliance or protect a compromised decrypting process. [OWASP cryptographic storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html).

## Secret classes and authority

| Class | Proposed owner / consumer | Public metadata |
|---|---|---|
| Discord bot token, database credentials | Operator runtime; bot/database connector only | Configured, last safe diagnostic state |
| OAuth application secret | Operator web runtime; OAuth callback client | Configured; never browser bundle |
| User OAuth access/refresh token | Session-bound server store; OAuth client only | Session/account status and scope labels |
| Guild provider key | Authorized guild configuration owner; approved provider worker | Provider, scope, configured/verified/failed, changed time/revision |
| Operator local/hosted provider key | Operator; permitted workers under global policy | Available capability, no credential substring |
| Encryption key ring | Operator key storage; vault service only | Nonsecret key IDs and migration/availability status |

A guild manager may replace an allowed guild-owned key, but cannot read it back, select another guild's reference, decrypt operator credentials or redirect an operator token to a custom URL. Provider IDs and operation capability are bound to each reference. Local ComfyUI/Ollama network destinations are operator configuration, not arbitrary tenant-controlled fetch URLs. A secret reference is an identifier, not a bearer grant.

Ordinary settings/read-model serializers exclude ciphertext and raw secret fields. Browser output says Configured, with last verification time/outcome where authorized; it does not expose prefix/suffix fragments as a supposed safe mask. Blank means unchanged; replace and remove are explicit operations. Clear fields after submission, avoid browser storage/analytics capture, use TLS, suppress request-body logging and set sensitive response caching policy. Clipboard contents and third-party browser extensions remain outside the application's complete control.

## Proposed vault contract

Use narrow server-only operations: write/replace a purpose-bound credential, read permitted metadata, resolve for an authorized consumer, disable/remove a reference, and perform operator key migration. No general read-secret route or Discord secret-display command. A callback-style resolver can limit accidental propagation, but TypeScript visibility cannot enforce process isolation; trusted code review and runtime identity still matter.

An illustrative stored record contains:

| Field | Constraint |
|---|---|
| secretId / credentialRevision | Stable logical reference and monotonic replacement revision |
| ownerKind / ownerId / purpose / providerConfigId | Trusted scope binding; immutable for a ciphertext version |
| envelopeVersion / algorithm / keyId | Allowlisted format and AES-256-GCM key selector; reject unknown versions |
| nonce / ciphertext / tag | Strict encoded lengths/maximum payload; fresh nonce for every encryption |
| state / changedAt / changedBy | Lifecycle and audit metadata without plaintext |
| verification | Credential revision tested, time, capability and safe result; separate from configured |

Proposed format uses a random 32-byte key, 12-byte nonce and 16-byte authentication tag. Decode canonical base64 with exact length checks; never derive a key by truncating/padding an arbitrary ENCRYPTION_SECRET string. If a passphrase-based deployment is later supported, it needs a separately specified KDF, salt, cost and recovery design. Key configuration names will be introduced only with implementation.

Authenticated additional data uses a canonical versioned encoding of secret ID, owner kind/ID, purpose, provider configuration and credential revision. An attacker swapping ciphertext between tenants/purposes must get authentication failure. Renaming mutable presentation fields does not alter this binding; authorized owner/purpose migration decrypts and re-encrypts with a new nonce and audited version.

Node's authenticated cipher API provides AAD/tag operations, and finalization rejects failed authentication. The implementation must set the expected tag length and discard all tentative plaintext unless final verification succeeds. Never log partial decipher output or fall back to treating failed ciphertext as plaintext. Use the selected Node 24 release's actual APIs and tests; the moving documentation is API evidence, not a runtime upgrade. [Node 24 crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html).

Generate a fresh unpredictable nonce per encryption and prevent reuse under the same key. A proposed unique keyId/nonce constraint catches reuse in the active database; retry a collision with a new nonce before committing. This is additional protection, not proof against forgotten historical nonces after restore or arbitrary unsafe encryption outside the service. Set reviewed per-key volume/rotation limits and use one authority for writes. Multiple workers and restored snapshots must follow the same generation policy. No deterministic nonce from guild ID, timestamp or credential text.

## Write, resolve and replacement flow

1. Authenticate and authorize the actual caller for owner/purpose/provider and expected configuration revision. Validate size and credential-specific structure without claiming validity from syntax alone.
2. Obtain the active write key through the trusted vault runtime. Encrypt with new nonce/AAD and create a pending credential revision. Persist encrypted value and safe audit in one transaction; no plaintext in settings, outbox or error evidence.
3. A separately requested bounded verification job uses the exact credential revision and approved provider endpoint. Probe capability without generating paid content merely to show a green badge. Record configured, verification pending, verified, rejected or unknown distinctly.
4. Activate according to documented policy. A failed replacement should leave the last known active credential available if it remains valid; an explicitly compromised credential is disabled, not kept as fallback. Do not silently try every historical key/token after an authorization failure.
5. Resolve only for an authenticated server consumer with matching owner/purpose/provider and current active revision. Recheck revocation at effect time; bound caches by revision/lifetime and invalidate on replacement. An in-flight call may still use the old token, so revocation is not instantaneous cancellation.
6. Return safe metadata/receipt to the caller and clear transient buffers where feasible. JavaScript copies and garbage collection mean complete memory zeroization is not guaranteed. Never include credential bytes in telemetry or persisted job payloads.

Deleting a reference disables new use and records a tombstone. Physical ciphertext deletion follows retention/recovery policy; deleting a local row does not revoke the vendor credential. Existing jobs referring to a removed revision fail visibly or require reviewed migration; they do not substitute another tenant's key. Unknown paid requests remain reconciliation work even when a credential is disabled.

## Rotation and recovery

Encryption-key rotation is different from provider-token rotation. Re-encrypting SQL does not invalidate a leaked provider token. Replacing an OAuth refresh token can have provider-specific single-use/concurrency behavior and needs a shared refresh claim plus generation-checked update. A stale refresh response cannot overwrite a newer session token. The exact selected provider lifecycle must be verified before implementation.

For encryption-key rotation, prepare and securely back up a new key ID, load old/new read keys, select the new write key, then migrate bounded ciphertext batches with compare-and-swap on record revision. Each row uses a fresh nonce; concurrent credential replacements win over stale migration writes. Verify counts and decryptability without printing values. Resume by persisted cursor/state after crash. Keep old keys for retained ciphertext/backups until their retirement policy is satisfied. Retiring a key without accounting for old backups destroys recoverability.

Provider-token rotation instead creates/configures the replacement at the provider, verifies intended scopes under a bounded policy, switches references, observes consumers and revokes the old token when appropriate. Providers may not allow overlap or reversible rotation; record that behavior. The workflow itself must be auditable and recoverable rather than assuming no downtime. [OWASP secrets lifecycle guidance](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html).

| Incident | Proposed response |
|---|---|
| Unknown/missing key ID | Disable affected resolution; safe unavailable state; restore correct key through operator channel |
| Tag/AAD failure | Quarantine record metadata, no plaintext fallback; investigate tampering/version error |
| Lost active encryption key | Restore separately controlled key backup or reconfigure affected credentials; ciphertext alone is insufficient |
| Key/token exposure | Contain affected consumers, determine scope, rotate actual exposed credentials and keys as needed; preserve redacted evidence |
| Migration interrupted | Resume bounded revision-checked batches; do not overwrite newer replacements |
| Restore older SQL snapshot | Restore matching key availability, verify references and reconcile token/session versions before enabling workers |
| Provider unknown completion during rotation | Preserve receipt and reconcile; rotation does not authorize another chargeable attempt |

A restore rehearsal needs encrypted database, format/version manifest, required key IDs and separately obtained key material, plus tests that old and current records resolve under their intended scope. Perform it in isolation with no live provider effects, verify safe counts, and only then consider activation. Define who can recover keys and how access is logged. This documentation neither creates nor rotates any live key.

## Migration, diagnostics and acceptance

The legacy importer identifies secret fields without echoing values. Preserve protected raw source provenance where required, and choose explicit secure import or operator reconfiguration; skipping secrets silently is not completed compatibility. A staging database/export containing plaintext is still sensitive even if the final vault is encrypted. Keep source immutable and record the cleanup/retention boundary for staging and backups separately. New ordinary configuration export includes references/status only and lists credentials needing re-entry on another installation.

Observe metadata-only write/resolve/denial/verification/rotation counts, safe key IDs, migration lag and unavailable references. Audit actor, scope, purpose, action, revision, reason and outcome; never store raw secret before/after values. Do not use high-cardinality secret IDs as metric labels or expose ciphertext through diagnostics. Avoid credentials in CLI argv/history, URLs, process launch text, crash dumps or client-prefixed environment variables; future secret input should use a reviewed hidden prompt/stdin/runtime injection path.

Required tests: same plaintext encrypts differently; nonce collision handling; malformed encoding/length/version rejection; wrong-key/tag/ciphertext/AAD tamper; cross-tenant/purpose swap; no partial plaintext; unauthorized resolve/write/metadata; same-revision replacement race; refresh/rotation race; interrupted migration; old-backup restore; removed reference/in-flight request; missing key; export/HTTP/log/trace/CLI serialization using synthetic canary values. Framework/driver integration tests must prove secrets do not enter browser payloads, not merely assert field names are absent from a TypeScript interface.

Current core tests cover selected config/redaction/public-error paths; they are not vault or OAuth coverage. No encryption implementation, runtime security test, provider probe, key provisioning or live rotation was performed in this documentation epic. Revisit the backend if key separation, availability, audit or rotation requirements exceed a local key ring; preserve interface/scope/restore semantics through any migration. Zod schemas do not replace authorization, SSRF controls or mediated [AI tools](ADR-005-ai-chatbot-and-tool-calling-architecture.md).
