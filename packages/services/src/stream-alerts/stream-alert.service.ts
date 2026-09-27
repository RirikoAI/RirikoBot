import {
  withTransaction,
  type AuditLogRepository,
  type DatabaseClient,
  type Streamer,
  type StreamRepository,
  type StreamSubscription,
} from '@ririko/database';
import type { StreamPlatform, StreamPlatformAdapter } from '../stream-platforms/types.js';
import { MAX_STREAM_TEMPLATE_LENGTH } from './format.js';
import { cleanStreamerIdentifier, fallbackPlatformUserId, inferPlatform } from './handles.js';

/**
 * Most streamers one server can follow. It is also the most fields a Discord embed can hold,
 * which `/stream list` uses one per subscription.
 */
export const MAX_STREAM_SUBSCRIPTIONS = 25;

/** Longest streamer name, handle or channel ID (`streamers.platform_user_id` is varchar(64)). */
const MAX_IDENTIFIER_LENGTH = 64;

/** A subscription change the rules refuse; the message is for the user. */
export class StreamAlertError extends Error {}

/** Who changed a subscription, recorded in `audit_logs`. */
export interface StreamAlertActor {
  userId: string;
  source: 'dashboard' | 'command';
  ipAddress?: string | null | undefined;
  userAgent?: string | null | undefined;
}

export interface StreamAlert {
  subscription: StreamSubscription;
  streamer: Streamer;
}

export interface SubscribeStreamInput {
  guildId: string;
  /** A name, handle, channel ID or profile link. */
  streamer: string;
  /** Wins over the platform the link implies; a bare name without one is Twitch. */
  platform?: StreamPlatform | null | undefined;
  channelId: string;
  mentionRoleId?: string | null | undefined;
  customMessage?: string | null | undefined;
}

export interface UpdateStreamAlertInput {
  channelId: string;
  mentionRoleId: string | null;
  customMessage: string | null;
}

export interface StreamAlertServiceDeps {
  db: DatabaseClient;
  streams: StreamRepository;
  audit: AuditLogRepository;
  adapters: readonly StreamPlatformAdapter[];
  now?: () => Date;
}

/**
 * Stream alert subscriptions for `/stream` and the dashboard. Both resolve streamers through
 * the same platform adapters, so a subscription looks the same whichever made it. Callers
 * check the member's permissions and that the channel and role belong to the guild.
 */
export class StreamAlertService {
  private readonly now: () => Date;

  constructor(private readonly deps: StreamAlertServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /** The guild's subscriptions, oldest first. */
  async list(guildId: string): Promise<StreamAlert[]> {
    const rows = await this.deps.streams.listGuildSubscriptionsWithStreamers(guildId);
    return rows.sort(
      (a, b) =>
        (a.subscription.createdAt?.getTime() ?? 0) - (b.subscription.createdAt?.getTime() ?? 0),
    );
  }

  /** One of the guild's subscriptions, or null. */
  async get(guildId: string, subscriptionId: string): Promise<StreamAlert | null> {
    const subscription = await this.deps.streams.findSubscriptionById(subscriptionId);
    if (!subscription || subscription.guildId !== guildId) return null;
    const streamer = await this.deps.streams.findById(subscription.streamerId);
    return streamer ? { subscription, streamer } : null;
  }

  /**
   * Follows a streamer, or changes the existing subscription when the guild already follows
   * them. The platform resolves the handle to its user ID; when it cannot (no credentials, or
   * the platform is down), the cleaned handle is stored instead, as `/stream` always did.
   */
  async subscribe(
    input: SubscribeStreamInput,
    actor: StreamAlertActor,
  ): Promise<{ alert: StreamAlert; created: boolean }> {
    const identifier = cleanStreamerIdentifier(input.streamer);
    if (!identifier) {
      throw new StreamAlertError('Enter a streamer name, handle, channel ID or profile link.');
    }
    if (identifier.length > MAX_IDENTIFIER_LENGTH) {
      throw new StreamAlertError(
        `A streamer name can be at most ${MAX_IDENTIFIER_LENGTH} characters.`,
      );
    }
    const platform = inferPlatform(input.streamer, input.platform);
    const customMessage = normalizeTemplate(input.customMessage);
    const adapter = this.deps.adapters.find((candidate) => candidate.platform === platform);
    const profile = adapter ? await adapter.resolveStreamer(identifier).catch(() => null) : null;

    return withTransaction(this.deps.db, async (tx) => {
      const streamer = await this.deps.streams.upsertStreamer(
        {
          platform,
          platformUserId: profile?.platformUserId ?? fallbackPlatformUserId(identifier),
          username: profile?.username || identifier,
          displayName: profile?.displayName || profile?.username || identifier,
          avatarUrl: profile?.avatarUrl ?? null,
        },
        tx,
      );
      const existing = await this.deps.streams.findSubscription(input.guildId, streamer.id, tx);
      if (!existing) {
        const count = await this.deps.streams.countSubscriptionsByGuild(input.guildId, tx);
        if (count >= MAX_STREAM_SUBSCRIPTIONS) {
          throw new StreamAlertError(
            `This server already follows ${MAX_STREAM_SUBSCRIPTIONS} streamers, the most it can. Remove one first.`,
          );
        }
      }
      const subscription = await this.deps.streams.addSubscription(
        {
          streamerId: streamer.id,
          guildId: input.guildId,
          channelId: input.channelId,
          mentionRoleId: input.mentionRoleId ?? null,
          customMessage,
        },
        tx,
      );
      await this.record(
        input.guildId,
        existing ? 'stream_alerts.update' : 'stream_alerts.subscribe',
        actor,
        describe(subscription, streamer),
        tx,
      );
      return { alert: { subscription, streamer }, created: !existing };
    });
  }

  /** Changes where and how a subscription announces. */
  async update(
    guildId: string,
    subscriptionId: string,
    input: UpdateStreamAlertInput,
    actor: StreamAlertActor,
  ): Promise<StreamAlert> {
    const customMessage = normalizeTemplate(input.customMessage);
    return withTransaction(this.deps.db, async (tx) => {
      const subscription = await this.deps.streams.updateSubscription(
        guildId,
        subscriptionId,
        { channelId: input.channelId, mentionRoleId: input.mentionRoleId, customMessage },
        tx,
      );
      const streamer = subscription
        ? await this.deps.streams.findById(subscription.streamerId, tx)
        : null;
      if (!subscription || !streamer) {
        throw new StreamAlertError('That subscription no longer exists.');
      }
      await this.record(
        guildId,
        'stream_alerts.update',
        actor,
        describe(subscription, streamer),
        tx,
      );
      return { subscription, streamer };
    });
  }

  /** Stops a subscription and returns what it was (the streamer is null if it is gone). */
  async remove(
    guildId: string,
    subscriptionId: string,
    actor: StreamAlertActor,
  ): Promise<{ subscription: StreamSubscription; streamer: Streamer | null }> {
    return withTransaction(this.deps.db, async (tx) => {
      const subscription = await this.deps.streams.findSubscriptionById(subscriptionId, tx);
      const streamer = subscription
        ? await this.deps.streams.findById(subscription.streamerId, tx)
        : null;
      if (
        !subscription ||
        subscription.guildId !== guildId ||
        !(await this.deps.streams.removeSubscriptionById(guildId, subscriptionId, tx))
      ) {
        throw new StreamAlertError('That subscription no longer exists.');
      }
      await this.record(
        guildId,
        'stream_alerts.remove',
        actor,
        streamer
          ? describe(subscription, streamer)
          : { subscriptionId: subscription.id, streamerId: subscription.streamerId },
        tx,
      );
      return { subscription, streamer };
    });
  }

  private async record(
    guildId: string,
    action: string,
    actor: StreamAlertActor,
    details: Record<string, unknown>,
    tx: DatabaseClient,
  ): Promise<void> {
    await this.deps.audit.create(
      {
        guildId,
        actorUserId: actor.userId,
        action,
        details: { source: actor.source, ...details },
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
      },
      this.now(),
      tx,
    );
  }
}

/** A trimmed custom message, or null for the default one; refuses messages that are too long. */
function normalizeTemplate(template: string | null | undefined): string | null {
  const trimmed = template?.trim() ?? '';
  if (trimmed.length > MAX_STREAM_TEMPLATE_LENGTH) {
    throw new StreamAlertError(
      `The announcement message can be at most ${MAX_STREAM_TEMPLATE_LENGTH} characters.`,
    );
  }
  return trimmed.length > 0 ? trimmed : null;
}

function describe(subscription: StreamSubscription, streamer: Streamer): Record<string, unknown> {
  return {
    subscriptionId: subscription.id,
    platform: streamer.platform,
    streamer: streamer.username,
    channelId: subscription.channelId,
    mentionRoleId: subscription.mentionRoleId,
    customMessage: subscription.customMessage,
  };
}
