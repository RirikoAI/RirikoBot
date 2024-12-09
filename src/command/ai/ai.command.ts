import { Injectable } from '@nestjs/common';
import { Message, TextChannel } from 'discord.js';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';

import ollama from 'ollama';
import {
  PostReplyActionType,
  PromptType,
  UserPrompts,
} from '#command/ai/ai.types';
import { AiPresets, SystemPrompt } from '#command/ai/system-prompt';
import { PostReplyActions } from '#command/ai/actions/post-reply.actions';

/**
 * AI Command
 * @description This command allows users to chat with the AI using Ollama
 * @category Command
 * @author Earnest Angel (https://angel.net.my)
 */
@Injectable()
export default class AiCommand extends Command implements CommandInterface {
  name = 'ai';
  regex = new RegExp('^ai$|^ai ', 'i');
  description = 'Chat with the intelligent AI';
  category = 'ai';
  usageExamples = ['ai <prompt>'];

  slashOptions = [
    {
      type: SlashCommandOptionTypes.String, // STRING type
      name: 'prompt',
      description: 'Input the prompt to send to the AI',
      required: true,
    },
  ];

  defaultModel = 'llama3.2:1b';
  userPrompts: UserPrompts = [];

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    const prompt = interaction.options.getString('prompt');
    const channelId = interaction.channel.id;
    const userId = interaction.user.id;
    await interaction.reply('Thinking...');

    const guildDB = await this.db.guildRepository.findOne({
      where: { id: interaction.guild.id },
    });

    const model = guildDB.configurations.find(
      (config) => config.name === 'ai_model',
    );

    const firstReply = await interaction.fetchReply();
    this.streamToChannel(
      interaction,
      prompt,
      userId,
      channelId,
      firstReply,
      model?.value,
    );
  }

  async runPrefix(message: DiscordMessage): Promise<void> {
    const prompt = this.allParams;
    const firstReply = await message.reply('Thinking...');
    const channelId = message.channel.id;
    const userId = message.author.id;

    this.streamToChannel(message, prompt, userId, channelId, firstReply);
  }

  /**
   * Stream the AI replies to the channel.
   * The AI replies are streamed to the channel in parts.
   * The AI replies are buffered and sent in parts to prevent the
   * message from being too long.
   *
   * @param interaction
   * @param prompt
   * @param userId
   * @param channelId
   * @param firstReply
   * @param model
   * @private
   */
  private async streamToChannel(
    interaction: DiscordInteraction | DiscordMessage,
    prompt: string,
    userId: string,
    channelId: string,
    firstReply: DiscordMessage | DiscordInteraction,
    model?: string,
  ) {
    // Store all replies from the AI
    let replies = '';

    // Buffer replies coming from the AI, limited to 1800 characters
    let replyBuffer = '';
    const newMessages: PromptType = { role: 'user', content: prompt };

    // store the prompt
    this.storePrompt(userId, newMessages);

    try {
      const response = await ollama.chat({
        model: model || this.defaultModel,
        messages: [
          {
            role: 'system',
            content: SystemPrompt(),
          },
          // Adding presets (or abilities) here
          ...AiPresets(),
          // Add the past prompts including the new one
          ...this.getPrompts(userId)?.prompts,
        ],
        stream: true,
      });

      let counter = 0;
      let currentReply: Message;

      const channel = this.client.channels.cache.get(channelId);
      (channel as TextChannel).messages
        .fetch(firstReply.id)
        .then((message) => {
          currentReply = message;
        })
        .catch((err) => {
          console.error(err);
        });

      for await (const part of response) {
        replies += part.message.content;
        replyBuffer += part.message.content;
        counter++;

        // check if replies has 1800 characters.
        // if so, send a new reply, set currentReply to the new reply, and reset replies
        if (replyBuffer.length >= 1800) {
          currentReply = await (channel as TextChannel).send(replyBuffer);
          replyBuffer = '';
        }

        // Check if the counter has reached 4, then only edit the message with the new replies
        if (counter === 7) {
          // Edit the message by id with the new replies
          await currentReply.edit(replyBuffer);
          // Reset the counter
          counter = 0;
        }
      }

      // Optionally, handle any remaining replies after the loop
      if (counter > 0) {
        await currentReply.edit(replyBuffer);
      }

      // Store replies
      this.storePrompt(userId, { role: 'assistant', content: replies });
      const postReplyActions = this.checkPostReplyActions(replies);
      if (postReplyActions)
        await this.executePostReplyActions(postReplyActions, interaction);
    } catch (error) {
      console.error(error);
      await firstReply.channel.send(error.message);
    }
  }

  checkPostReplyActions(reply: string): PostReplyActionType {
    try {
      let postReplyActions: PostReplyActionType = [];
      // check if the command contains enclosing 🎵 insert the song title here 🎵.
      // if so, send the play command to the music command.
      if (reply.includes('🎵')) {
        let songTitle = reply.match(/🎵(.*?)🎵/)[1];
        postReplyActions.push({ action: 'play', payload: songTitle });
      }

      return postReplyActions;
    } catch (e) {
      return null;
    }
  }

  async executePostReplyActions(
    actions: PostReplyActionType,
    message: DiscordMessage | DiscordInteraction,
  ) {
    try {
      for (const action of actions) {
        switch (action.action) {
          case 'play':
            await PostReplyActions.play(action, message, this.services);
            break;
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * Store the prompt in the userPrompts array.
   * !todo: add a limit to the number of prompts stored.
   * !todo: store the prompts in a database.
   * @param userId
   * @param prompt
   */
  storePrompt(userId: string, prompt: PromptType) {
    const userPrompt = this.userPrompts.find(
      (userPrompt) => userPrompt.userId === userId,
    );
    if (userPrompt) {
      userPrompt.prompts.push(prompt);
    } else {
      this.userPrompts.push({
        userId,
        prompts: [prompt],
      });
    }
  }

  /**
   * Get the prompts for a specific user.
   * !todo: get the prompts from a database.
   * @param userId
   */
  getPrompts(userId: string) {
    const userPrompt = this.userPrompts.find(
      (userPrompt) => userPrompt.userId === userId,
    );
    return userPrompt;
  }
}
