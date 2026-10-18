import 'server-only';
import type { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import type { AuditLogRepository, Giveaway, GiveawayRepository } from '@ririko/database';
import {
  buildEndedMessages,
  buildRerollAnnouncement,
  giveawayMessageUrl,
  GiveawayEngine,
  type GiveawayAnnouncement,
  type GiveawayEndResult,
} from '@ririko/services/giveaways';
import type { GuildResourceDirectory } from './guild-resources';

/** Who ended or rerolled a giveaway, recorded in `audit_logs`. */
export interface GiveawayActor {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface GiveawayView {
  id: string;
  prize: string;
  channelId: string;
  /** Null when the channel no longer exists. */
  channelName: string | null;
  /** Null when the giveaway message was never sent. */
  messageUrl: string | null;
  winnerCount: number;
  entryCount: number;
  endsAt: Date;
  isEnded: boolean;
  createdBy: string;
  winners: Array<{ userId: string; isReroll: boolean }>;
}

export interface GiveawayLists {
  active: GiveawayView[];
  /** Ended giveaways, newest first. */
  ended: GiveawayView[];
}

/** An end or reroll the giveaway's state refuses; the message is for the user. */
export class GiveawayError extends Error {}

export interface GiveawayManagementDeps {
  giveaways: GiveawayRepository;
  audit: AuditLogRepository;
  rest: Pick<REST, 'post' | 'patch'>;
  resources: Pick<GuildResourceDirectory, 'channelNames'>;
  now?: () => Date;
}

/** Ended giveaways shown on the page. */
export const GIVEAWAY_HISTORY_LIMIT = 25;
/** Most winners one reroll can draw. */
export const MAX_REROLL_WINNERS = 20;

/**
 * Ends and rerolls giveaways from the dashboard with the same engine as `/giveaway`, so winners
 * are drawn the same way. Its engine is never started: the bot's scheduler ends giveaways on
 * time, and the repository lets only one caller end a giveaway. Results reach Discord through
 * the bot token; a Discord failure does not undo the result. Callers must have passed
 * `requireGuildAccess` for `guildId`.
 */
export class GiveawayManagementService {
  private readonly engine: GiveawayEngine;
  private readonly now: () => Date;

  constructor(private readonly deps: GiveawayManagementDeps) {
    this.now = deps.now ?? (() => new Date());
    this.engine = new GiveawayEngine(deps.giveaways, {
      onGiveawayEnded: (result) => this.postEnded(result),
    });
  }

  async list(guildId: string): Promise<GiveawayLists> {
    const [active, recent, channels] = await Promise.all([
      this.deps.giveaways.listActiveGiveaways(guildId),
      this.deps.giveaways.listGuildGiveaways(guildId, GIVEAWAY_HISTORY_LIMIT * 2),
      this.deps.resources.channelNames(guildId).catch(() => new Map<string, string>()),
    ]);
    const ended = recent.filter((giveaway) => giveaway.isEnded).slice(0, GIVEAWAY_HISTORY_LIMIT);
    const view = async (giveaway: Giveaway): Promise<GiveawayView> => {
      const [entryCount, winners] = await Promise.all([
        this.deps.giveaways.getEntryCount(giveaway.id),
        giveaway.isEnded ? this.deps.giveaways.getWinners(giveaway.id) : [],
      ]);
      return {
        id: giveaway.id,
        prize: giveaway.prize,
        channelId: giveaway.channelId,
        channelName: channels.get(giveaway.channelId) ?? null,
        messageUrl: giveawayMessageUrl(giveaway),
        winnerCount: giveaway.winnerCount,
        entryCount,
        endsAt: new Date(giveaway.endsAt),
        isEnded: giveaway.isEnded,
        createdBy: giveaway.createdBy,
        winners: winners
          .map((winner) => ({ userId: winner.userId, isReroll: winner.isReroll, at: winner.wonAt }))
          .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
          .map(({ userId, isReroll }) => ({ userId, isReroll })),
      };
    };
    return {
      active: await Promise.all(
        [...active]
          .sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime())
          .map(view),
      ),
      ended: await Promise.all(ended.map(view)),
    };
  }

  /** Ends a running giveaway now and draws its winners. */
  async end(
    guildId: string,
    giveawayId: string,
    actor: GiveawayActor,
  ): Promise<{ prize: string; winnerIds: string[] }> {
    const giveaway = await this.find(guildId, giveawayId);
    if (giveaway.isEnded) throw new GiveawayError('This giveaway has already ended.');
    const result = await this.engine.rollAndEndGiveaway(giveaway.id);
    // Null means the scheduler or `/giveaway end` ended it between the check and the draw.
    if (!result) throw new GiveawayError('This giveaway has already ended.');
    await this.audit('giveaways.end', guildId, giveaway, result.winnerIds, actor);
    return { prize: giveaway.prize, winnerIds: result.winnerIds };
  }

  /** Draws `count` new winners (default: the giveaway's winner count) from members who have not won. */
  async reroll(
    guildId: string,
    giveawayId: string,
    count: number | null,
    actor: GiveawayActor,
  ): Promise<{ prize: string; winnerIds: string[]; posted: boolean }> {
    const giveaway = await this.find(guildId, giveawayId);
    if (!giveaway.isEnded) {
      throw new GiveawayError('This giveaway is still running. End it before rerolling.');
    }
    const result = await this.engine.reroll(giveaway.id, count ?? undefined);
    if (!result || result.winnerIds.length === 0) {
      throw new GiveawayError('Nobody is left to draw: every entrant has already won.');
    }
    await this.audit('giveaways.reroll', guildId, giveaway, result.winnerIds, actor);
    const posted = await this.announce(
      giveaway.channelId,
      buildRerollAnnouncement(giveaway, result.winnerIds),
    );
    return { prize: giveaway.prize, winnerIds: result.winnerIds, posted };
  }

  private async find(guildId: string, giveawayId: string): Promise<Giveaway> {
    const giveaway = await this.deps.giveaways.findById(giveawayId);
    // Another guild's giveaway reads as missing, so IDs from other servers reveal nothing.
    if (!giveaway || giveaway.guildId !== guildId) {
      throw new GiveawayError('That giveaway no longer exists.');
    }
    return giveaway;
  }

  private async postEnded(result: GiveawayEndResult): Promise<void> {
    const { giveaway, winnerIds } = result;
    const entryCount = await this.deps.giveaways.getEntryCount(giveaway.id);
    const messages = buildEndedMessages(this.engine, giveaway, entryCount, winnerIds);
    if (giveaway.messageId) {
      await this.deps.rest
        .patch(Routes.channelMessage(giveaway.channelId, giveaway.messageId), {
          body: messages.edit,
        })
        .catch((error: unknown) => {
          console.warn(`[Giveaways] Could not update the message of ${giveaway.id}:`, error);
        });
    }
    await this.announce(giveaway.channelId, messages.announcement);
  }

  /** Posts in the giveaway's channel; false when Discord refused. */
  private async announce(channelId: string, announcement: GiveawayAnnouncement): Promise<boolean> {
    try {
      await this.deps.rest.post(Routes.channelMessages(channelId), {
        body: {
          content: announcement.content,
          allowed_mentions: { parse: [], users: announcement.mentionUserIds },
        },
      });
      return true;
    } catch (error) {
      console.warn(`[Giveaways] Could not post in channel ${channelId}:`, error);
      return false;
    }
  }

  private async audit(
    action: string,
    guildId: string,
    giveaway: Giveaway,
    winnerIds: string[],
    actor: GiveawayActor,
  ): Promise<void> {
    await this.deps.audit.create(
      {
        guildId,
        actorUserId: actor.userId,
        action,
        details: {
          source: 'dashboard',
          giveawayId: giveaway.id,
          channelId: giveaway.channelId,
          prize: giveaway.prize,
          winnerIds,
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
      this.now(),
    );
  }
}
