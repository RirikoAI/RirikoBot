# ADR-011: Secrets Management and Credential Security

## Status
Accepted

## Context
In Ririko 1.4.0, Twitch OAuth client secrets and Stable Diffusion API tokens were saved in plaintext inside the SQLite `Configuration` table (`twitchClientSecret`, `stableDiffusionApiToken`). If a database file was leaked or committed to source control, all external API credentials were compromised.

## Decision
1. **Eliminate Plaintext DB Secrets**: Deprecate storing unencrypted credentials in relational tables.
2. **Environment-First Configuration**: Primary credentials (Discord bot token, Twitch secrets, AI provider API keys) must be injected strictly via environment variables (`.env`).
3. **Encrypted Vault for Dynamic Guild Credentials**: If guild-specific third-party API keys are supported, they must be encrypted at rest using **AES-256-GCM** with an initialization vector (IV), auth tag, and an encryption master key derived from `ENCRYPTION_SECRET`.
4. **Input Sanitization**: Strictly validate and sanitize all command inputs using Zod to mitigate SSRF and prompt injection.

## Consequences
### Positive
- Production-grade security posture compliant with modern security standards.
- Database dumps and backups do not expose sensitive API keys or Discord tokens.

### Negative
- Administrators must configure environment variables properly during bot deployment.
