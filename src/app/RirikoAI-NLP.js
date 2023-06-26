/**
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
const colors = require("colors");

const { OpenAIProvider } = require("./Providers/AI/OpenAIProvider");
const { NLPCloudProvider } = require("app/Providers/AI/NLPCloudProvider");

const getconfig = require("helpers/getconfig");
const { AIProvider, AIPersonality, AIPrompts } = require("helpers/getconfig");

const {
  findChatHistory,
  addChatHistory,
  updateChatHistory,
  deleteChatHistory,
} = require("./Schemas/ChatHistory");

const { getAndIncrementUsageCount } = require("helpers/commandUsage");
const { AI } = require("config");

/**
 * Now, this is going to be an awesome AI that can remember past conversations by saving it into the
 * "brain"
 *
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
class RirikoAINLP {
  //  Begin Static Class implementations -------------------------------------------------------------------------------

  static instance = null;

  static getInstance() {
    if (this.instance === null) {
      this.instance = new this();
    }
    return this.instance;
  }

  //  Begin Class implementations --------------------------------------------------------------------------------------

  constructor() {
    try {
      this.prefix = getconfig.AIPrefix();
      this.chatHistory = [];
      this.costPerToken = 0.00003;

      if (AIProvider() === "NLPCloudProvider") {
        this.provider = new NLPCloudProvider();
      } else {
        this.provider = new OpenAIProvider();
      }

      this.isInitialized = true;
      console.log("[RirikoAI-NLP] Initialized successfully".blue);
    } catch (e) {
      console.error(
        "[RirikoAI-NLP] Something went wrong during the initialization! Check your config (try copy and paste the example config files again)"
          .red
      );
      this.isInitialized = false;
      throw e;
    }
  }

  // Business Logic implementations ------------------------------------------------------------------------------------

  getPersonalitiesAndAbilities() {
    try {
      // Get the current time
      let currentTime = new Date();

      // Use regular expressions and the replace() method to replace the string
      let personality = AIPersonality().join("\n");

      return (
        personality.replace("%CURRENT_TIME%", currentTime) +
        "\n" +
        AIPrompts().join("\n") +
        "\n"
      );
    } catch (e) {
      console.error("Error in RIRIKO AI:", e);
      throw (
        "[ERROR] Something when wrong trying to read the AI Personality and Prompts. " +
        "Check the config file (and config.example files), see if there are missing configs"
      );
    }
  }

  getCurrentTime() {
    return new Date();
  }

  calculateToken(text) {
    return parseInt(text.length / 4); // we are making simple assumption that 4 chars = 1 token
  }

  getChatHistory(discordMessage) {
    if (this.chatHistory[discordMessage.author.id]) {
      return this.chatHistory[discordMessage.author.id];
    } else {
      // This user has not chatted with Ririko recently, returns empty string
      return "";
    }
  }

  // Async methods ----------------------------------------------------------------------------------------------------

  /**
   *
   * @param message
   * @returns {Promise<void>}
   */
  async handleMessage(message) {
    if (message.content.substring(0, 1) === this.prefix) {
      if (AI.DailyLimit !== false)
        try {
          const usageCount = await getAndIncrementUsageCount(
            message.member.user.id,
            AI.DailyLimit,
            "ai"
          );
        } catch (e) {
          return await message.reply(e.message);
        }

      await message.channel.sendTyping();

      const prompt = message.content.substring(1); //remove the prefix from the message
      const answer = await this.ask(prompt, message);

      if (!answer) {
        return;
      }

      await message.channel.sendTyping();

      // Send response to Discord bot.
      for (let i = 0; i < answer.length; i += 2000) {
        const toSend = answer.substring(i, Math.min(answer.length, i + 2000));
        message.reply(toSend);
      }

      const pa = this.processAnswer(answer);

      if (pa.isMusic) {
        if (message.member.voice.channelId !== null) {
          await message.client.player.play(
            message.member.voice.channel,
            pa.name,
            {
              member: message.member,
              textChannel: message.channel,
              message,
            }
          );
        }
      }
      return;
    }
  }

  /**
   * Check if we have anything else to do when we receive the answer.
   * @param answer
   */
  processAnswer(answer) {
    const matches = answer.match(/(?<=\🎵).+?(?=\🎵)/g);
    if (matches !== null) {
      console.info("Playing " + matches[0] + "now. ");
      return {
        isMusic: true,
        name: matches[0],
      };
    } else {
      return {
        isMusic: false,
      };
    }
  }

  async ask(messageText, discordMessage) {
    if (messageText === "clear")
      return await this.clearChatHistory(discordMessage);

    await this.setPromptAndChatHistory(messageText, discordMessage);
    const currentToken = this.calculateToken(
      this.getPersonalitiesAndAbilities() + this.getChatHistory(discordMessage)
    );

    try {
      // Send request to NLP Cloud.
      const answer = await this.provider.sendChat(
        messageText,
        this.getPersonalitiesAndAbilities(),
        this.getChatHistory(discordMessage)
      );

      await this.saveAnswer(answer, discordMessage);

      const totalToken = currentToken + this.calculateToken(answer);

      console.info(
        "[RirikoAI-NLP] Request complete, costs ".blue +
          totalToken +
          ` tokens, that's about `.blue +
          `$${(this.costPerToken * totalToken).toFixed(5)}`
      );

      return answer;
    } catch (e) {
      console.error(
        "Something went wrong when trying to send the request to the AI provider:" +
          " Check if your API key is still valid, or if your prompts are not corrupted / too long."
      );
      console.error(
        "Also try to clear your chat history with Ririko by entering .clear in Discord.",
        e
      );
    }
  }

  async setPromptAndChatHistory(message, discordMessage) {
    const currentPrompt = "Human: " + message + "\n";

    let perUserChatHistory = await findChatHistory(
      discordMessage.guildId,
      discordMessage.author.id
    );

    // this user never chatted with Ririko before, create a new chathistory
    if (perUserChatHistory === null) {
      perUserChatHistory = await addChatHistory(discordMessage, "");
    }

    this.chatHistory[discordMessage.author.id] =
      perUserChatHistory.chat_history;

    this.chatHistory[discordMessage.author.id] += currentPrompt;

    const prompt = this.chatHistory[discordMessage.author.id];

    const chatTokens = this.calculateToken(
      this.getPersonalitiesAndAbilities() + prompt
    );

    console.info(
      "[RirikoAI-NLP] A new request with ".blue +
        chatTokens +
        " tokens is being prepared.".blue
    );

    if (chatTokens > 1900) {
      /**
       * The actual maximum number of tokens is around 2048 (new models support 4096).
       * But I do not plan to hit it but put the ceiling a bit much lower then remove
       * old messages after it is reached to continue chatting.
       */

      console.info(
        "[RirikoAI-NLP] The prompt has reached the maximum of ".blue +
          chatTokens +
          ". Trimming now.".blue
      );

      /**
       * This code takes the chatHistory string, splits it into an array of lines, removes the first 21 lines,
       * and then joins the remaining lines back into a single string with newline separators.
       * The purpose is to keep only the most recent chat history, removing older entries.
       *
       * Proudly explained by Ririko herself
       *
       * @type {string[]}
       */
      let tmpData = this.chatHistory[discordMessage.author.id]
        .split("\n")
        .filter((d, i) => i > 20);
      this.chatHistory[discordMessage.author.id] = tmpData.join("\n");
    }
  }

  async saveAnswer(answer, discordMessage) {
    this.chatHistory[discordMessage.author.id] += "Friend: " + answer + "\n";
    // save chat history into mongodb
    await updateChatHistory(
      discordMessage.guildId,
      discordMessage.author.id,
      this.chatHistory[discordMessage.author.id]
    );
  }

  async clearChatHistory(discordMessage) {
    await deleteChatHistory(discordMessage.guildId, discordMessage.author.id);
    return "Your chat history with Ririko has been cleared.";
  }
}

module.exports = { RirikoAINLP };
