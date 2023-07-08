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
      this.prefix = getconfig.AIPrefix(); // Prefix for the AI
      this.chatHistory = []; // This is where we store the chat history
      this.costPerToken = 0.00003; // Cost per token in USD
      this.minRepetition = 6; // Minimum number of times a phrase must occur to be considered a repetition

      // Initialize the AI provider
      if (AIProvider() === "NLPCloudProvider") {
        // If the provider is NLPCloudProvider, initialize the NLPCloudProvider
        this.provider = new NLPCloudProvider();
      } else if (AIProvider() === "OpenAIProvider") {
        // If the provider is OpenAIProvider, initialize the OpenAIProvider
        this.provider = new OpenAIProvider();
      }

      // AI provider has been initialized
      this.isInitialized = true;
      console.log("[RirikoAI-NLP] Initialized successfully".blue);
    } catch (e) {
      console.error(
        "[RirikoAI-NLP] Something went wrong during the initialization! Check your config (try copy and paste the example config files again)"
          .red
      );
      // AI provider has not been initialized
      this.isInitialized = false;
      throw e;
    }
  }

  // Business Logic implementations ------------------------------------------------------------------------------------

  /**
   * Get Personality and Abilities
   * @returns {string}
   */
  getPersonalitiesAndAbilities() {
    try {
      // Get the current time
      let currentTime = new Date();

      // Use regular expressions and the replace() method to replace the string
      let personality = AIPersonality().join("\n");

      // Return the personality and abilities
      return (
        // Replace the %CURRENT_TIME% placeholder with the current time
        personality.replace("%CURRENT_TIME%", currentTime) +
        "\n" +
        AIPrompts().join("\n") + // Join the prompts with a new line
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

  calculateToken(historyString) {
    return parseInt(historyString.length / 4); // we are making simple assumption that 4 chars = 1 token
  }

  getChatHistory(discordMessage) {
    if (this.chatHistory[discordMessage.author.id]) {
      return this.chatHistory[discordMessage.author.id];
    } else {
      // This user has not chatted with Ririko recently, returns empty string
      return "";
    }
  }

  removeDuplicates = (reply, chatHistory) => {
    // Remove duplicate sentences from the reply, based on the last 2 replies
    const previousReplies = chatHistory
      .filter((entry) => entry.startsWith("Friend:"))
      .slice(-2);

    const replyWithoutDuplicates = reply
      .split(". ")
      .map((sentence) => {
        const normalizedSentence = sentence.trim();
        if (
          normalizedSentence &&
          previousReplies.some((prevReply) =>
            prevReply.includes(normalizedSentence)
          )
        ) {
          return ".";
        }
        return sentence;
      })
      .join(". ");

    return replyWithoutDuplicates;
  };

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

  retries = 0;
  maxRetries = 3;
  retryDelay = 1000;

  async ask(messageText, discordMessage) {
    if (messageText === "clear")
      return await this.clearChatHistory(discordMessage);

    await this.setPromptAndChatHistory(messageText, discordMessage);
    const currentToken = this.calculateToken(
      this.getPersonalitiesAndAbilities() + this.getChatHistory(discordMessage)
    );

    try {
      const chatHistory = await this.getChatHistory(discordMessage);

      // Send request to NLP Cloud.
      let answer = await this.provider.sendChat(
        messageText,
        this.getPersonalitiesAndAbilities(),
        chatHistory
      );

      // if the answer is empty, retry
      if (answer === undefined || answer === null) {
        if (this.retries < this.maxRetries) {
          this.retries++;
          console.log("retrying...");
          await this.sleep(this.retryDelay);
          return await this.ask(messageText, discordMessage);
        } else {
          console.log("Max retries reached, aborting.");
          this.retries = 0;
          throw "Max retries reached, aborting. The answer is always empty.";
        }
      }

      let originalAnswer = answer;

      answer = this.removeDuplicates(answer, chatHistory);

      await this.saveAnswer(answer, discordMessage);

      const totalToken = currentToken + this.calculateToken(originalAnswer);

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
    try {
      const currentPrompt = "Human: " + message;

      let perUserChatHistory = await findChatHistory(
        discordMessage.guildId,
        discordMessage.author.id
      );

      // this user never chatted with Ririko before, create a new chathistory
      if (perUserChatHistory === null) {
        this.chatHistory[discordMessage.author.id] = [];
        perUserChatHistory = await addChatHistory(discordMessage, []);
      }

      // Check if perUserChatHistory is an array or a string. If it's a string, convert it to an array.
      // For compatibility with older versions of Ririko AI < 0.9.0
      if (typeof perUserChatHistory.chat_history === "string") {
        perUserChatHistory.chat_history = [perUserChatHistory.chat_history];
      }

      // Set the chat history to the one stored in the database
      this.chatHistory[discordMessage.author.id] =
        perUserChatHistory.chat_history;

      // Add the current prompt to the chat history
      this.chatHistory[discordMessage.author.id].push(currentPrompt);

      // Join the chat history array into a single string
      const prompt = this.chatHistory[discordMessage.author.id].join("\n");

      // Calculate the number of tokens the prompt costs approximately
      const chatTokens = this.calculateToken(
        this.getPersonalitiesAndAbilities() + prompt
      );

      console.info(
        "[RirikoAI-NLP] A new request with ".blue +
          chatTokens +
          " tokens is being prepared.".blue
      );

      // If the prompt is too long, trim it
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
         * This code takes the chatHistory array, removes the first 20 elements,
         * and keeps the remaining elements as the most recent chat history.
         */
        this.chatHistory[discordMessage.author.id] =
          this.chatHistory[discordMessage.author.id].slice(-20);
      }
    } catch (e) {
      console.log("Something went wrong:", e);
    }
  }

  /**
   * Save the answer into the chat history db
   * @param answer
   * @param discordMessage
   * @returns {Promise<void>}
   */
  async saveAnswer(answer, discordMessage) {
    this.chatHistory[discordMessage.author.id].push("Friend: " + answer);
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

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = { RirikoAINLP };
