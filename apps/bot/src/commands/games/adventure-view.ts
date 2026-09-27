import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  escapeMarkdown,
} from 'discord.js';
import {
  CANONICAL_ITEMS,
  getAdventureScenario,
  type ActiveAdventureSession,
  type AdventureChoice,
} from '@ririko/services';
import { adventureArtwork } from './adventure-art.js';

const itemNames = new Map(CANONICAL_ITEMS.map((item) => [item.code, item.name]));
const itemName = (code: string) => itemNames.get(code) ?? code.toLowerCase().replaceAll('_', ' ');
const signed = (amount: number | bigint) => `${amount > 0 ? '+' : ''}${amount}`;

function choiceLabel(choice: AdventureChoice): string {
  let label = choice.label.replace(/[A-Z]+(?:_[A-Z]+)+/g, (code) => itemNames.get(code) ?? code);
  if (choice.cost?.credits && !label.includes(String(choice.cost.credits)))
    label += ` (${choice.cost.credits} credits)`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function adventureView(session: ActiveAdventureSession) {
  const scenario = getAdventureScenario(session.scenarioId, session.scenarioVersion);
  const node = scenario.nodes[session.currentNodeId]!;
  const embed = new EmbedBuilder().setColor(scenario.color).setTitle(`🗺️ ${scenario.title}`);
  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  const rank = session.rewardRank;
  const rankLine = rank
    ? `Reward rank ${rank.rank}${rank.amountBps > 10_000 ? ` · +${(rank.amountBps - 10_000) / 100}% rewards · +${(rank.chanceBps - 10_000) / 100}% drop chance` : ''}`
    : '';

  if (session.status === 'ACTIVE' && node.type === 'decision') {
    embed.setDescription(
      node.title === scenario.title ? node.narrative : `**${node.title}**\n\n${node.narrative}`,
    );
    embed.addFields({
      name: 'Companion',
      value: [
        session.card
          ? `${escapeMarkdown(session.card.name)}${session.card.level && !session.card.name.includes(`(Lv.${session.card.level})`) ? ` (Lv.${session.card.level})` : ''} • ${session.card.element}`
          : 'You venture onward alone.',
        rankLine,
      ]
        .filter(Boolean)
        .join('\n'),
    });
    embed.setFooter({
      text: `Chapter ${node.stage} of ${scenario.totalDecisions} • 90 seconds to choose`,
    });
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const choice of node.choices)
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`adventure:${session.id}:${session.revision}:${choice.id}`)
          .setLabel(choiceLabel(choice).slice(0, 80))
          .setStyle(ButtonStyle.Primary),
      );
    components.push(
      row,
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`adventure:${session.id}:${session.revision}:abandon`)
          .setLabel('Abandon')
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  } else if (session.status === 'SETTLING') {
    embed.setDescription(
      'Your journey has ended. Your rewards are being delivered. Check `/adventure action:status` in a moment.',
    );
  } else {
    const receipt = session.receipt!;
    const completed = session.status === 'COMPLETED' && node.type === 'terminal';
    embed.setColor(
      completed
        ? node.outcome.type.includes('SUCCESS')
          ? 0x57f287
          : node.outcome.type === 'MIXED'
            ? 0xfee75c
            : 0xed4245
        : 0x95a5a6,
    );
    embed.setDescription(
      completed
        ? `**${node.title}**\n\n${node.outcome.narrative}`
        : session.status === 'START_FAILED'
          ? 'Your adventure could not begin. Your entry cost has been refunded up to your energy capacity.'
          : session.status === 'TIMED_OUT'
            ? 'The moment passes, and your journey comes to an end. Unclaimed rewards are left behind.'
            : 'You turn back from the adventure, leaving its unclaimed rewards behind.',
    );

    const credits: string[] = [];
    if (BigInt(receipt.grossCredits)) credits.push(`Rewards: **${receipt.grossCredits}**`);
    if (BigInt(receipt.lostCredits)) credits.push(`Losses: **−${receipt.lostCredits}**`);
    if (BigInt(receipt.paidCredits)) credits.push(`Spent: **−${receipt.paidCredits}**`);
    if (credits.length > 1 && BigInt(receipt.netCredits))
      credits.push(`Net: **${signed(BigInt(receipt.netCredits))}**`);
    if (credits.length)
      embed.addFields({ name: 'Credits', value: credits.join('\n'), inline: true });

    const progress: string[] = [];
    if (receipt.xp) progress.push(`XP: **+${receipt.xp}**`);
    if (receipt.dust) progress.push(`Dust: **+${receipt.dust}**`);
    if (receipt.companionXp?.expGained) {
      progress.push(`Companion XP: **+${receipt.companionXp.expGained}**`);
      if (receipt.companionXp.levelsGained)
        progress.push(
          `Companion level: **${receipt.companionXp.previousLevel} → ${receipt.companionXp.newLevel}**`,
        );
    }
    if (receipt.companionXpUnavailable)
      progress.push('Companion XP unavailable: original card is no longer eligible.');
    const netEnergy = receipt.energyChange - session.entryEnergyCharged;
    if (netEnergy) progress.push(`Energy: **${signed(netEnergy)}**`);
    if (progress.length)
      embed.addFields({ name: 'Progress', value: progress.join('\n'), inline: true });

    const loot = [
      ...receipt.items
        .filter((item) => item.quantity > 0)
        .map((item) => `${item.quantity} × ${itemName(item.code)}`),
      ...receipt.cards.map(
        (card) =>
          `${escapeMarkdown(card.name)} — ${card.rarity.replaceAll('_', ' ')}, #${card.serial}`,
      ),
    ];
    if (receipt.unavailableCards)
      loot.push(`${receipt.unavailableCards} card reward(s) unavailable.`);
    if (loot.length) embed.addFields({ name: 'Loot', value: loot.join('\n').slice(0, 1024) });
    const spent = new Map<string, number>();
    for (const step of session.history)
      for (const item of step.paidItems)
        spent.set(item.code, (spent.get(item.code) ?? 0) + item.quantity);
    const spentItems = [...spent]
      .filter(([, quantity]) => quantity > 0)
      .map(([code, quantity]) => `${quantity} × ${itemName(code)}`);
    if (spentItems.length)
      embed.addFields({ name: 'Items spent', value: spentItems.join('\n').slice(0, 1024) });
    // Internal receipts remain for idempotency; do not publish a repeatable route.
    if (receipt.rewardRank) embed.setFooter({ text: `Reward rank ${receipt.rewardRank.rank}` });
  }
  const artwork = adventureArtwork(session.scenarioId, session.currentNodeId);
  if (artwork) embed.setImage('attachment://adventure-scene.png');
  return {
    content: `<@${session.userId}>`,
    embeds: [embed],
    components,
    files: artwork ? [artwork] : [],
    attachments: [],
    allowedMentions: { parse: [] as [] },
  };
}
