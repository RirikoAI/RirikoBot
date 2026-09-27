import { PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import {
  AdventureError,
  ADVENTURE_SCENARIOS,
  ADVENTURE_REWARD_RANKS,
  searchAdventureScenarios,
  type AdventureCardSnapshot,
} from '@ririko/services';
import type { BotServices } from '../../services.js';
import { AdventureController } from './adventure-controller.js';
import { adventureView } from './adventure-view.js';

export function createAdventureCommand(
  services: BotServices,
  controller = new AdventureController(services),
): Command {
  return {
    metadata: {
      name: 'adventure',
      category: CommandCategory.GAMES,
      description: 'Embark on a branching RPG adventure with your equipped card',
      aliases: ['adv', 'journey', 'quest-adventure'],
      isGuildOnly: true,
      cooldownSeconds: 0,
      botPermissions: [
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory,
      ],
      usage:
        '/adventure [action:start|status|abandon|settings|ranks] [scenario:id] [energy:true|false]',
      options: [
        {
          name: 'action',
          description: 'Start, check, abandon, or configure adventures',
          type: 'STRING',
          choices: ['start', 'status', 'abandon', 'settings', 'ranks'].map((value) => ({
            name: value,
            value,
          })),
        },
        {
          name: 'scenario',
          description: 'Search adventures by title or theme, or leave empty for a random story',
          type: 'STRING',
          autocomplete: true,
        },
        {
          name: 'energy',
          description: 'Settings only: require energy (false uses a 15-minute cooldown)',
          type: 'BOOLEAN',
        },
      ],
    },
    async autocomplete(interaction) {
      const focused = interaction.options.getFocused(true);
      await interaction.respond(
        focused.name === 'scenario'
          ? searchAdventureScenarios(String(focused.value)).map((scenario) => ({
              name: scenario.title,
              value: scenario.id,
            }))
          : [],
      );
    },
    async execute(ctx: CommandContext) {
      if (!ctx.guildId) {
        await ctx.reply({ content: 'Adventures are available in servers.', ephemeral: true });
        return;
      }
      const args = ctx.options.getRawArgs();
      const action = (ctx.options.getString('action') ?? args[0] ?? 'start').toLowerCase();
      const respond = async (content: string) => {
        if (ctx.isDeferred) await ctx.editReply({ content, allowedMentions: { parse: [] } });
        else await ctx.reply({ content, ephemeral: true, allowedMentions: { parse: [] } });
      };
      if (!['start', 'status', 'abandon', 'settings', 'ranks'].includes(action)) {
        await respond(
          'Use `adventure start`, `adventure status`, `adventure abandon`, or `adventure ranks`.',
        );
        return;
      }
      if (ctx.source === 'slash') await ctx.deferReply({ ephemeral: true });
      try {
        if (action === 'ranks') {
          await respond(
            [
              '**Adventure reward ranks**',
              ...ADVENTURE_REWARD_RANKS.map((tier, i) => {
                const next = ADVENTURE_REWARD_RANKS[i + 1];
                const levels = next ? `${tier.level}–${next.level - 1}` : `${tier.level}+`;
                return `**${tier.rank}** · Lv.${levels}${i === 0 ? ' / solo' : ''} · ${tier.bonus ? `+${tier.bonus}%` : 'Normal'} rewards and drop chances`;
              }),
              '',
              'Amounts boost credits, player XP, dust and companion XP. Completed failures earn reduced progression rewards. Card chances start at 20% for success, 15% mixed, 10% failure; rank bonuses are relative and capped at 100%. Existing guaranteed drops remain.',
              'For example, S+ turns a 10% chance into 60%. Companion XP goes to the original card if it is still eligible; rarity level caps apply.',
              'Rank is fixed when you start. Costs, losses and fixed wager components stay unchanged. New adventures restore at most 7 energy on completion.',
            ].join('\n'),
          );
          return;
        }
        if (action === 'settings') {
          if (!ctx.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
            await respond('Manage Server permission is required to change adventure settings.');
            return;
          }
          const energy =
            (ctx.source === 'slash' ? ctx.options.getBoolean('energy') : null) ??
            (args[1] === 'true' ? true : args[1] === 'false' ? false : null);
          if (energy !== null)
            await services.adventureSessions.setSettings(ctx.guildId, { energyEnabled: energy });
          const settings = await services.adventureSessions.getSettings(ctx.guildId);
          await respond(
            settings.energyEnabled
              ? 'Adventures cost 15 energy. Insufficient energy blocks entry.'
              : 'Adventures use a global 15-minute start cooldown. Energy rewards and penalties are disabled.',
          );
          return;
        }
        let session =
          action === 'start' ? null : await services.adventureEngine.status(ctx.user.id);
        if (action === 'start') {
          if (await services.economyRepo.isAccountFrozen(ctx.user.id)) {
            await respond('Your economy account is frozen.');
            return;
          }
          const scenarioId = ctx.source === 'slash' ? ctx.options.getString('scenario') : args[1];
          if (scenarioId && !ADVENTURE_SCENARIOS.some((scenario) => scenario.id === scenarioId)) {
            await respond('Unknown adventure scenario. Choose one from the slash-command list.');
            return;
          }
          session = await services.adventureEngine.start({
            ...(scenarioId ? { scenarioId } : {}),
            userId: ctx.user.id,
            guildId: ctx.guildId,
            channelId: ctx.channelId,
            resolveCard: async (tx) => {
              const [equipped] = await services.waifuCardRepo.listUserCards(
                ctx.user.id,
                {
                  state: 'EQUIPPED',
                  limit: 1,
                },
                tx,
              );
              const companion = equipped
                ? await services.loadoutService.buildCombatant(equipped, 'TEAM_A', tx)
                : null;
              const card: AdventureCardSnapshot | null = companion
                ? {
                    name: companion.name,
                    userCardId: equipped!.id,
                    level: equipped!.level,
                    element: companion.element,
                    attack: companion.attack,
                    defense: companion.defense,
                    speed: companion.speed,
                  }
                : null;

              return card;
            },
          });
        }
        if (!session) {
          await respond('You have no adventure yet. Use `/adventure` to start one.');
          return;
        }
        if (action === 'abandon')
          session = await services.adventureEngine.cancel(ctx.user.id, session.id);
        if (action === 'status' && session.receipt) {
          // A receipt remains accessible even when the original channel or message disappeared.
          if (ctx.isDeferred) await ctx.editReply(adventureView(session));
          else await ctx.reply({ ...adventureView(session), ephemeral: true });
          return;
        }
        session = await controller.deliver(ctx.client, session);
        if (action === 'start' && session.messageId) {
          // The public story is the response. Remove the temporary slash acknowledgement;
          // prefix starts must not post a second jump-link reply.
          if (ctx.source === 'slash') {
            await (ctx.raw as ChatInputCommandInteraction).deleteReply().catch((error) => {
              console.error('[Adventure] Could not remove start acknowledgement:', error);
            });
          }
          return;
        }
        await respond(
          session.messageId
            ? `Your adventure: https://discord.com/channels/${session.guildId}/${session.channelId}/${session.messageId}`
            : 'Your adventure ended before it could be displayed. Check `/adventure action:status` for your refund.',
        );
      } catch (error) {
        console.error('[Adventure] Command failed:', error);
        if (error instanceof AdventureError) {
          const session = error.session;
          await respond(
            error.message +
              (session?.messageId
                ? ` https://discord.com/channels/${session.guildId}/${session.channelId}/${session.messageId}`
                : ''),
          );
        } else
          await respond(
            'Adventure delivery is interrupted. Use `/adventure action:status` to check your saved progress or refund.',
          );
      }
    },
  };
}
