import { EmbedBuilder, type User, type GuildMember } from 'discord.js';
import type {
  ModerationRepository,
  ModerationCase,
  ModerationWarning,
  ModerationNote,
} from '@ririko/database';

export type DisciplinaryRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface DisciplinaryStatistics {
  activeWarningCount: number;
  totalWarningCount: number;
  timeoutCount: number;
  kickCount: number;
  banCount: number;
  totalInfractions: number;
}

export interface UserDisciplinarySummary {
  guildId: string;
  userId: string;
  activeWarnings: ModerationWarning[];
  cases: ModerationCase[];
  notes: ModerationNote[];
  statistics: DisciplinaryStatistics;
  riskLevel: DisciplinaryRiskLevel;
}

export class DisciplinaryHistoryService {
  constructor(private readonly modRepo: ModerationRepository) {}

  /**
   * Aggregates all active warnings, historical cases, staff notes, and risk score for a user.
   */
  async getSummary(guildId: string, userId: string): Promise<UserDisciplinarySummary> {
    const [activeWarnings, caseResult, notes] = await Promise.all([
      this.modRepo.getActiveWarnings(guildId, userId),
      this.modRepo.listCases(guildId, { targetUserId: userId, limit: 100 }),
      this.modRepo.getNotesByUser(guildId, userId),
    ]);

    const cases = caseResult.items;

    let totalWarningCount = 0;
    let timeoutCount = 0;
    let kickCount = 0;
    let banCount = 0;

    for (const c of cases) {
      const type = (c.type ?? '').toUpperCase();
      if (type === 'WARN') totalWarningCount++;
      else if (type === 'TIMEOUT') timeoutCount++;
      else if (type === 'KICK') kickCount++;
      else if (type === 'BAN' || type === 'SOFTBAN') banCount++;
    }

    const statistics: DisciplinaryStatistics = {
      activeWarningCount: activeWarnings.length,
      totalWarningCount,
      timeoutCount,
      kickCount,
      banCount,
      totalInfractions: cases.length,
    };

    const riskLevel = this.calculateRiskLevel(statistics);

    return {
      guildId,
      userId,
      activeWarnings,
      cases,
      notes,
      statistics,
      riskLevel,
    };
  }

  /**
   * Builds an informative disciplinary history embed.
   */
  buildHistoryEmbed(summary: UserDisciplinarySummary, user: User | GuildMember): EmbedBuilder {
    const userTag = 'user' in user ? user.user.tag : user.tag;
    const userAvatar = 'displayAvatarURL' in user ? user.displayAvatarURL() : undefined;

    const riskColorMap: Record<DisciplinaryRiskLevel, number> = {
      LOW: 0x57f287, // Green
      MEDIUM: 0xfee75c, // Yellow
      HIGH: 0xe67e22, // Orange
      CRITICAL: 0xed4245, // Red
    };

    const embed = new EmbedBuilder()
      .setColor(riskColorMap[summary.riskLevel])
      .setTitle(`Disciplinary Record — ${userTag}`)
      .setDescription(`Disciplinary profile and infraction ledger for <@${summary.userId}>.`)
      .setThumbnail(userAvatar ?? null)
      .setTimestamp()
      .setFooter({ text: `User ID: ${summary.userId}` });

    embed.addFields(
      {
        name: 'Risk Level',
        value: `**${summary.riskLevel}**`,
        inline: true,
      },
      {
        name: 'Active Warnings',
        value: `${summary.statistics.activeWarningCount}`,
        inline: true,
      },
      {
        name: 'Total Cases',
        value: `${summary.statistics.totalInfractions}`,
        inline: true,
      },
      {
        name: 'Infraction Breakdown',
        value: `⚠️ Warnings: ${summary.statistics.totalWarningCount} | ⏳ Timeouts: ${summary.statistics.timeoutCount}\n👢 Kicks: ${summary.statistics.kickCount} | 🔨 Bans: ${summary.statistics.banCount}`,
        inline: false,
      },
    );

    // List recent cases (up to 5)
    if (summary.cases.length > 0) {
      const recentCases = summary.cases
        .slice(0, 5)
        .map(
          (c) => `• **Case #${c.caseNumber}** [${c.type}]: ${c.reason} (<@${c.moderatorUserId}>)`,
        )
        .join('\n');
      embed.addFields({
        name: 'Recent Cases',
        value: recentCases,
        inline: false,
      });
    } else {
      embed.addFields({
        name: 'Recent Cases',
        value: '*No prior cases on record.*',
        inline: false,
      });
    }

    // List staff notes (up to 3)
    if (summary.notes.length > 0) {
      const recentNotes = summary.notes
        .slice(0, 3)
        .map((n) => `• *"${n.content}"* — <@${n.authorUserId}>`)
        .join('\n');
      embed.addFields({
        name: `Staff Notes (${summary.notes.length})`,
        value: recentNotes,
        inline: false,
      });
    }

    return embed;
  }

  // --- Staff Notes CRUD ---

  async addNote(
    guildId: string,
    targetUserId: string,
    authorUserId: string,
    content: string,
  ): Promise<ModerationNote> {
    return this.modRepo.createNote({
      guildId,
      targetUserId,
      authorUserId,
      content,
    });
  }

  async getNotes(guildId: string, targetUserId: string): Promise<ModerationNote[]> {
    return this.modRepo.getNotesByUser(guildId, targetUserId);
  }

  async deleteNote(id: string): Promise<boolean> {
    return this.modRepo.deleteNote(id);
  }

  // --- Internal Risk Calculator ---

  private calculateRiskLevel(stats: DisciplinaryStatistics): DisciplinaryRiskLevel {
    if (stats.banCount > 0 || stats.activeWarningCount >= 5 || stats.totalInfractions >= 10) {
      return 'CRITICAL';
    }
    if (stats.kickCount > 0 || stats.activeWarningCount >= 3 || stats.timeoutCount >= 2) {
      return 'HIGH';
    }
    if (stats.activeWarningCount >= 2 || stats.timeoutCount >= 1) {
      return 'MEDIUM';
    }
    return 'LOW';
  }
}
