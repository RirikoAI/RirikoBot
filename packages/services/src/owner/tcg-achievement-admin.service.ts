import {
  TcgAchievementInputSchema,
  TRACKED_ACHIEVEMENT_TYPES,
  ValidationError,
} from '@ririko/core';
import {
  withTransaction,
  type AchievementRepository,
  type AuditLogRepository,
  type DatabaseClient,
  type GameAchievement,
} from '@ririko/database';
import {
  diffFields,
  fieldErrorsOf,
  GuildConfigValidationError,
  type GuildConfigActor,
} from '../guild/guild-config.service.js';

export interface TcgAchievementAdminServiceDeps {
  db: DatabaseClient;
  achievements: AchievementRepository;
  audit: AuditLogRepository;
  now?: () => Date;
}

export interface AchievementView {
  achievement: GameAchievement;
  /** The bot records progress for this requirement, so players can unlock it. */
  tracked: boolean;
}

export interface GuildAchievementCompletion extends AchievementView {
  unlocked: number;
  claimed: number;
}

function editable(achievement: GameAchievement): Record<string, unknown> {
  return {
    title: achievement.title,
    description: achievement.description,
    tier: achievement.tier,
    rewardXp: achievement.rewardXp,
    rewardCredits: Number(achievement.rewardCredits),
    rewardTitle: achievement.rewardTitle,
    badgeIcon: achievement.badgeIcon,
    isHidden: achievement.isHidden,
  };
}

function view(achievement: GameAchievement): AchievementView {
  return { achievement, tracked: TRACKED_ACHIEVEMENT_TYPES.includes(achievement.requirementType) };
}

function byCategoryThenTitle(a: AchievementView, b: AchievementView): number {
  return (
    a.achievement.category.localeCompare(b.achievement.category) ||
    a.achievement.title.localeCompare(b.achievement.title)
  );
}

/**
 * Waifu TCG achievements. The owner changes wording, tier, rewards and visibility; the
 * requirement stays, because the bot only records progress for `TRACKED_ACHIEVEMENT_TYPES`.
 * The bot seeds missing achievements at start without touching existing rows, so edits last.
 * Guild managers get read-only completion counts for their members.
 */
export class TcgAchievementAdminService {
  private readonly now: () => Date;

  constructor(private readonly deps: TcgAchievementAdminServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async list(): Promise<AchievementView[]> {
    return (await this.deps.achievements.listAchievements()).map(view).sort(byCategoryThenTitle);
  }

  async get(achievementId: string): Promise<AchievementView | null> {
    const achievement = await this.deps.achievements.findById(achievementId);
    return achievement ? view(achievement) : null;
  }

  async update(
    achievementId: string,
    raw: Record<string, unknown>,
    actor: GuildConfigActor,
  ): Promise<{ achievement: GameAchievement; changed: boolean }> {
    return withTransaction(this.deps.db, async (tx) => {
      const existing = await this.deps.achievements.findById(achievementId, tx);
      if (!existing) throw new ValidationError('This achievement no longer exists.');
      const parsed = TcgAchievementInputSchema.safeParse(raw);
      if (!parsed.success) {
        throw new GuildConfigValidationError(fieldErrorsOf(parsed.error.issues), 'achievement');
      }

      const changes = diffFields(editable(existing), parsed.data);
      if (changes.length === 0) return { achievement: existing, changed: false };
      const achievement = await this.deps.achievements.update(existing.id, parsed.data, tx);
      await this.record(actor, { achievementId: existing.id, code: existing.code, changes }, tx);
      return { achievement, changed: true };
    });
  }

  /** Every visible achievement with how many of the guild's members unlocked and claimed it. */
  async guildCompletion(
    guildId: string,
  ): Promise<{ members: number; achievements: GuildAchievementCompletion[] }> {
    const [all, { members, counts }] = await Promise.all([
      this.deps.achievements.listAchievements(),
      this.deps.achievements.guildCompletionCounts(guildId),
    ]);
    return {
      members,
      achievements: all
        .filter((achievement) => !achievement.isHidden)
        .map(view)
        .sort(byCategoryThenTitle)
        .map((entry) => ({
          ...entry,
          unlocked: counts.get(entry.achievement.id)?.unlocked ?? 0,
          claimed: counts.get(entry.achievement.id)?.claimed ?? 0,
        })),
    };
  }

  private async record(
    actor: GuildConfigActor,
    details: Record<string, unknown>,
    tx: DatabaseClient,
  ): Promise<void> {
    await this.deps.audit.create(
      {
        guildId: null,
        actorUserId: actor.userId,
        action: 'owner.achievement.update',
        details: { source: actor.source, ...details },
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
      },
      this.now(),
      tx,
    );
  }
}
