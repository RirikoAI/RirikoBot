import 'server-only';
import {
  DEFAULT_CARD_TEXT_COLOR,
  DEFAULT_FAREWELL_MESSAGE,
  DEFAULT_WELCOME_MESSAGE,
  type WelcomerCardKind,
} from '@ririko/core';
import {
  withTransaction,
  type AuditLogRepository,
  type DatabaseClient,
  type WelcomeConfig,
  type WelcomerRepository,
} from '@ririko/database';
import type { WelcomerBackgroundStore } from '@ririko/services/welcomer-backgrounds';

/** Who changed a background, recorded in `audit_logs`. */
export interface BackgroundActor {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface WelcomerBackgroundDeps {
  db: DatabaseClient;
  welcomer: WelcomerRepository;
  store: WelcomerBackgroundStore;
  audit: AuditLogRepository;
  now?: () => Date;
}

/**
 * Uploaded welcome and farewell backgrounds. The file is written to the shared volume first,
 * then the card points at it (and drops its link) with an audit entry in one transaction, then
 * the guild's older uploads for that card are deleted. The bot reads the card on every join or
 * leave, so the change needs no signal. Callers must have passed `requireGuildAccess`.
 */
export class WelcomerBackgroundService {
  private readonly now: () => Date;

  constructor(private readonly deps: WelcomerBackgroundDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /** Checks and stores an upload (throws `BackgroundUploadError`) and makes it the background. */
  async upload(
    guildId: string,
    kind: WelcomerCardKind,
    image: Buffer,
    actor: BackgroundActor,
  ): Promise<void> {
    const fileName = await this.deps.store.save(guildId, kind, image);
    await this.point(guildId, kind, fileName, actor, 'upload');
    await this.deps.store.prune(guildId, kind, fileName);
  }

  /** Removes the uploaded background (and any link), back to the default one. */
  async remove(guildId: string, kind: WelcomerCardKind, actor: BackgroundActor): Promise<void> {
    await this.point(guildId, kind, null, actor, 'remove');
    await this.deps.store.prune(guildId, kind, null);
  }

  /** Deletes uploads the card no longer uses, such as after a link replaced one. */
  async pruneUnused(guildId: string, kind: WelcomerCardKind): Promise<void> {
    const row = await this.card(guildId, kind);
    await this.deps.store.prune(guildId, kind, row?.backgroundFile ?? null);
  }

  /** The stored card row, or null when the card was never set up. */
  card(
    guildId: string,
    kind: WelcomerCardKind,
    tx?: DatabaseClient,
  ): Promise<WelcomeConfig | null> {
    return kind === 'welcome'
      ? this.deps.welcomer.getWelcomeConfig(guildId, tx)
      : this.deps.welcomer.getFarewellConfig(guildId, tx);
  }

  private async point(
    guildId: string,
    kind: WelcomerCardKind,
    fileName: string | null,
    actor: BackgroundActor,
    change: 'upload' | 'remove',
  ): Promise<void> {
    await withTransaction(this.deps.db, async (tx) => {
      const current = await this.card(guildId, kind, tx);
      // A card that is not set up yet keeps the background for when it is.
      const data: WelcomeConfig = {
        guildId,
        channelId: current?.channelId ?? '',
        messageTemplate:
          current?.messageTemplate ??
          (kind === 'welcome' ? DEFAULT_WELCOME_MESSAGE : DEFAULT_FAREWELL_MESSAGE),
        cardTheme: current?.cardTheme ?? 'DEFAULT',
        backgroundUrl: null,
        backgroundFile: fileName,
        textColor: current?.textColor ?? DEFAULT_CARD_TEXT_COLOR,
        isEnabled: current?.isEnabled ?? false,
      };
      if (kind === 'welcome') await this.deps.welcomer.setWelcomeConfig(data, tx);
      else await this.deps.welcomer.setFarewellConfig(data, tx);
      await this.deps.audit.create(
        {
          guildId,
          actorUserId: actor.userId,
          action: `welcomer.${kind}.background_${change}`,
          details: {
            source: 'dashboard',
            before: {
              backgroundUrl: current?.backgroundUrl ?? null,
              file: current?.backgroundFile ?? null,
            },
            after: { backgroundUrl: null, file: fileName },
          },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        },
        this.now(),
        tx,
      );
    });
  }
}
