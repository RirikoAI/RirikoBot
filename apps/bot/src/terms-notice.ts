import { MessageFlags } from 'discord.js';
import { createNoticeMiddleware, type CommandMiddleware } from '@ririko/discord';
import type { ConsentService } from '@ririko/services';

/** The pages the terms notice links to (`TERMS_URL` and `PRIVACY_URL`). */
export interface LegalLinks {
  termsUrl: string;
  privacyUrl: string;
}

/** The one-time notice a user sees after their first command. */
export function buildTermsNotice(links: LegalLinks): string {
  return [
    `By continuing to use Ririko, you accept the [Terms of Service](<${links.termsUrl}>) and the [Privacy Policy](<${links.privacyUrl}>).`,
    'If a server owner hosts this bot, that host is responsible for your data.',
  ].join('\n');
}

/**
 * Shows the terms notice once, after a user's first command that passed the other middlewares, and
 * records that they saw it. The command runs first and its reply is not delayed. Slash and context
 * menu commands get an ephemeral message; prefix commands get a reply to the message. A user who
 * accepted the current `TERMS_VERSION` never sees it again. Read, write and delivery failures are
 * logged and never stop a command; the notice is then tried again on the next command.
 */
export function createTermsNoticeMiddleware(services: {
  consentService: Pick<ConsentService, 'hasAccepted' | 'accept'>;
  legalLinks: LegalLinks;
}): CommandMiddleware {
  const { consentService, legalLinks } = services;
  return createNoticeMiddleware({
    shouldNotify: async (ctx) => !(await consentService.hasAccepted(ctx.user.id, 'terms')),
    notify: async (ctx) => {
      const content = buildTermsNotice(legalLinks);
      if (ctx.source === 'prefix') {
        await ctx.reply(content);
      } else if (ctx.isReplied || ctx.isDeferred) {
        await ctx.followUp({ content, flags: MessageFlags.Ephemeral });
      } else {
        await ctx.reply({ content, flags: MessageFlags.Ephemeral });
      }
    },
    onNotified: (ctx) => consentService.accept(ctx.user.id, 'terms'),
    onError: (ctx, error) => {
      console.error(`[TermsNotice] Could not show or record the notice for ${ctx.user.id}:`, error);
    },
  });
}
