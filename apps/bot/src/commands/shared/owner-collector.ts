import type { Message, MessageComponentInteraction } from 'discord.js';

const COLLECTOR_TIME_MS = 120_000;

/**
 * Listens to `customIds` components on `message` for the invoker only. Other users get an
 * ephemeral hint. Each use resets the idle timer; the components are removed when it expires.
 */
export function attachOwnerCollector(
  message: Message,
  options: {
    ownerId: string;
    customIds: string[];
    notOwnerHint: string;
    onCollect: (interaction: MessageComponentInteraction) => Promise<void>;
  },
): void {
  if (typeof message?.createMessageComponentCollector !== 'function') return;

  const collector = message.createMessageComponentCollector({
    filter: (i) => options.customIds.includes(i.customId),
    time: COLLECTOR_TIME_MS,
  });

  collector.on('collect', async (interaction) => {
    if (interaction.user.id !== options.ownerId) {
      await interaction.reply({ content: options.notOwnerHint, ephemeral: true });
      return;
    }
    collector.resetTimer();
    await options.onCollect(interaction);
  });

  collector.on('end', async () => {
    await message.edit({ components: [] }).catch(() => undefined);
  });
}
