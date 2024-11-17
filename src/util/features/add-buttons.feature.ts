import { ActionRowBuilder, ButtonBuilder } from 'discord.js';

export const addButtons = (rawButtons): any => {
  const buttons = rawButtons.map((button) => {
    return new ButtonBuilder()
      .setCustomId(button.customId)
      .setLabel(button.label)
      .setStyle(button.style);
  });

  const row = new ActionRowBuilder();
  buttons.forEach((button) => row.addComponents(button));
  return row;
};