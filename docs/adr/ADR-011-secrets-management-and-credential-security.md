# ADR-011: Secrets and credential boundaries

## Status

Accepted for the implemented environment configuration, trusted authorization and redacted logging foundation. A dynamic credential vault, secret import and key-rotation workflow remain proposed and unimplemented.

## Problem

Legacy stores Twitch client secrets and a Replicate token in plaintext Configuration fields; its setup CLI also prints parsed credential arguments. Secret exposure can therefore occur through databases, backups and logs. The new platform needs operator-held secrets and eventual per-guild credential configuration without treating arbitrary guild settings as a vault.

## Options considered

- Continue plaintext settings/CLI output and rely on filesystem privacy.
- Use environment/runtime secret injection only.
- Use environment/runtime injection for process credentials plus a separately designed encrypted vault when dynamic credentials are needed.

## Decision

Keep process secrets in operator-provided environment/runtime secret storage. Local `.env` files are development inputs, not committed configuration. Do not persist secret values in ordinary guild settings or expose them through commands, dashboard responses, diagnostics or raw logs. Use structured redaction and safe error messages; callers must still avoid logging user/provider payloads because a finite redaction list cannot cover arbitrary strings.

For future dynamic credentials, use a reviewed **AES-256-GCM** envelope with a cryptographically random 256-bit key, unique nonce per encryption, authentication tag, key/version identifiers and authenticated scope metadata. Keep master keys separate from ciphertext/backups, reject authentication failures and define rotation/restore procedures. Do not derive a key from an unspecified weak `ENCRYPTION_SECRET` string. The vault's configuration names/API will be introduced with its implementation.

Retain compatible owner-only secret-setup entry points when ported, but route them to the new boundary and never echo credentials. Migration must report plaintext secret fields and follow an explicit secure import/reconfiguration path; silently dropping credentials is not a completed compatibility migration.

## Consequences

Encryption at rest protects ciphertext without the key; it does not protect a compromised process, leaked environment, unsafe logs or backups containing keys. Zod validates structure, not all SSRF or prompt-injection threats. URL fetching and AI tools need their own network/authorization controls. No compliance certification or guarantee that every dump is safe is asserted.

## Validation and evidence

Test redaction and safe-error paths, missing/malformed credentials, authorization and accidental serialization. Vault work additionally needs nonce uniqueness, scope binding, tamper rejection, rotation, wrong-key and restore tests plus security review. See [legacy credential findings](../legacy-feature-inventory.md), [configuration authorization](ADR-013-configuration-permissions-and-concurrency.md), and [AI tool boundary](ADR-005-ai-chatbot-and-tool-calling-architecture.md).
