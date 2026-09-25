import 'server-only';
import { DiscordAPIError, type REST } from '@discordjs/rest';
import type { GuildSettingsRepository } from '@ririko/database';
import type { FieldChange } from '@ririko/services/guild';
import {
  Routes,
  type APIDMChannel,
  type APIEmbed,
  type APIEmbedField,
  type RESTPostAPIChannelMessageJSONBody,
} from 'discord-api-types/v10';
import { GUILD_NAV_ITEMS } from '@/lib/dashboard-nav';
import { describeUserAgent } from '@/lib/user-agent';

const ALERT_COLOR = 0xf59e0b;
const NOTICE_COLOR = 0xf472b6;
/** Field changes listed in one guild notice; the audit log keeps all of them. */
const MAX_LISTED_CHANGES = 10;
const IP_PATTERN = /^[0-9A-Fa-f:.]{2,45}$/;

/** When and from where an account change was made. */
export interface AccountEventContext {
  at: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface GuildSettingsChange {
  userId: string;
  module: string;
  changes: readonly FieldChange[];
}

export interface DiscordNotifierDeps {
  /** Discord REST client authenticated with the bot token. */
  rest: Pick<REST, 'post'>;
  guildSettings: Pick<GuildSettingsRepository, 'findById'>;
  dashboardUrl: string;
}

/**
 * Security DMs and guild change notices sent with the bot token (ADR-013 detection). Every
 * method is best effort: failures, such as a user who blocks DMs, are logged and never thrown,
 * so callers can run them after the response with `after()`.
 */
export class DiscordNotifier {
  constructor(private readonly deps: DiscordNotifierDeps) {}

  newDeviceSignIn(userId: string, context: AccountEventContext): Promise<void> {
    return this.directMessage(userId, 'new-device sign-in', {
      title: 'New sign-in to the Ririko dashboard',
      description:
        'Your Discord account was used to sign in to the Ririko dashboard from a browser that has not signed in before.',
      color: ALERT_COLOR,
      fields: [...contextFields(context), this.notYouField()],
      timestamp: context.at.toISOString(),
    });
  }

  passkeyAdded(userId: string, name: string, context: AccountEventContext): Promise<void> {
    return this.directMessage(userId, 'passkey added', {
      title: 'A passkey was added to your dashboard account',
      description: `The passkey ${inlineCode(name)} can now be used to sign in to the Ririko dashboard.`,
      color: ALERT_COLOR,
      fields: [...contextFields(context), this.notYouField()],
      timestamp: context.at.toISOString(),
    });
  }

  passkeyRemoved(
    userId: string,
    name: string,
    remaining: number,
    context: AccountEventContext,
  ): Promise<void> {
    const left =
      remaining === 0
        ? 'You have no passkeys left, so signing in to the dashboard only needs Discord again.'
        : `You have ${remaining} ${remaining === 1 ? 'passkey' : 'passkeys'} left.`;
    return this.directMessage(userId, 'passkey removed', {
      title: 'A passkey was removed from your dashboard account',
      description: `The passkey ${inlineCode(name)} was removed. ${left}`,
      color: ALERT_COLOR,
      fields: [...contextFields(context), this.notYouField()],
      timestamp: context.at.toISOString(),
    });
  }

  /** Posts a summary of a dashboard settings change to the guild's log channel, if it has one. */
  async guildSettingsChanged(guildId: string, change: GuildSettingsChange): Promise<void> {
    try {
      const channelId = (await this.deps.guildSettings.findById(guildId))?.logChannelId;
      if (!channelId) return;
      const label = GUILD_NAV_ITEMS.find((item) => item.slug === change.module)?.label;
      const lines = change.changes
        .slice(0, MAX_LISTED_CHANGES)
        .map(
          ({ field, before, after }) =>
            `${inlineCode(field)}: ${formatValue(before)} → ${formatValue(after)}`,
        );
      const hidden = change.changes.length - lines.length;
      if (hidden > 0) lines.push(`…and ${hidden} more (see the audit log).`);
      await this.send(channelId, {
        title: 'Dashboard settings changed',
        url: `${this.deps.dashboardUrl}/dashboard/${guildId}/${change.module}`,
        description: [
          `<@${change.userId}> changed the **${label ?? change.module}** settings on the dashboard.`,
          ...lines,
        ].join('\n'),
        color: NOTICE_COLOR,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logFailure(`change notice for guild ${guildId}`, error);
    }
  }

  private notYouField(): APIEmbedField {
    return {
      name: 'Not you?',
      value: `Sign out the other sessions at ${this.deps.dashboardUrl}/account/sessions, then secure your Discord account: change your password and turn on two-factor authentication.`,
    };
  }

  private async directMessage(userId: string, what: string, embed: APIEmbed): Promise<void> {
    try {
      const channel = (await this.deps.rest.post(Routes.userChannels(), {
        body: { recipient_id: userId },
      })) as APIDMChannel;
      await this.send(channel.id, embed);
    } catch (error) {
      logFailure(`${what} DM to user ${userId}`, error);
    }
  }

  private async send(channelId: string, embed: APIEmbed): Promise<void> {
    const body: RESTPostAPIChannelMessageJSONBody = {
      embeds: [embed],
      allowed_mentions: { parse: [] },
    };
    await this.deps.rest.post(Routes.channelMessages(channelId), { body });
  }
}

/** Discord's own timestamp markup renders in each reader's time zone. */
function contextFields(context: AccountEventContext): APIEmbedField[] {
  const ip = context.ipAddress && IP_PATTERN.test(context.ipAddress) ? context.ipAddress : null;
  return [
    { name: 'When', value: `<t:${Math.floor(context.at.getTime() / 1000)}:F>`, inline: true },
    { name: 'Browser', value: describeUserAgent(context.userAgent), inline: true },
    { name: 'IP address', value: ip ?? 'Unknown', inline: true },
  ];
}

/**
 * Shows user-controlled text as inline code, where Discord renders no markdown, links or
 * mentions. Backticks are swapped for a look-alike so the text cannot close the code span.
 */
function inlineCode(text: string, maxLength = 100): string {
  const clean = text.replace(/`/g, 'ˋ').replace(/[\r\n]+/g, ' ');
  if (clean.length === 0) return '*empty*';
  return `\`${clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean}\``;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '*none*';
  return inlineCode(typeof value === 'string' ? value : JSON.stringify(value));
}

function logFailure(what: string, error: unknown): void {
  if (error instanceof DiscordAPIError) {
    // 50007: the user blocks DMs from server members or shares no server with the bot.
    console.warn(`[web] Could not send ${what}: Discord error ${error.code} (${error.message})`);
    return;
  }
  console.error(`[web] Could not send ${what}:`, error instanceof Error ? error.message : error);
}
