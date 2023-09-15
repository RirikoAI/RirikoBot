/**
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
const colors = require("colors");

const { OpenAIProvider } = require("app/Providers/AI/OpenAIProvider");
const { NLPCloudProvider } = require("app/Providers/AI/NLPCloudProvider");
const { RirikoLLaMAProvider } = require("app/Providers/AI/RirikoLLaMAProvider");

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
  static instance = null;

  static getInstance() {
    if (this.instance === null) {
      this.instance = new this();
    }
    return this.instance;
  }

  /**
   * Initialize the AI
   */
  constructor() {
    try {
      this.prefix = getconfig.AIPrefix(); // Prefix for the AI
      this.chatHistory = []; // This is where we store the chat history
      this.currentUserPrompt = []; // This is where we store the current user prompt
      this.costPerToken = 0.00003; // Cost per token in USD
      this.maxChatTokens = 1900; // Maximum number of prompt tokens per chat
      this.retries = [];
      this.maxRetries = 3;
      this.retryDelay = 1000;

      // Initialize the AI provider
      if (AIProvider() === "NLPCloudProvider") {
        // If the provider is NLPCloudProvider, initialize the NLPCloudProvider
        this.provider = new NLPCloudProvider();
      } else if (AIProvider() === "OpenAIProvider") {
        // If the provider is OpenAIProvider, initialize the OpenAIProvider
        this.provider = new OpenAIProvider();
      } else if (AIProvider() === 'RirikoLLaMAProvider') {
        this.provider = new RirikoLLaMAProvider();
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

  /**
   * The first entry point for the AI, from Discord event handler
   * @param message
   * @returns {Promise<void>}
   */
  async handleMessage(message) {
    // Check if the message contains the prefix
    if (message.content.substring(0, 1) === this.prefix) {
      // Check if Daily limit is enabled
      if (AI.DailyLimit !== false)
        // If Daily limit is enabled, check if the user has exceeded the limit
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

      // remove the prefix from the message so to make it a prompt
      const prompt = message.content.substring(1);

      // Ask the AI
      const answer = await this.ask(prompt, message);

      // If the answer is empty, return
      if (!answer) {
        return;
      }

      await message.channel.sendTyping();

      // Send response to Discord bot.
      // Discord has a limit of 2000 characters per message, so we need to split the answer into multiple messages
      for (let i = 0; i < answer.length; i += 2000) {
        const toSend = answer.substring(i, Math.min(answer.length, i + 2000));
        message.reply(toSend);
      }

      // Process the answer and see if we should take any action
      const pa = this.processAnswer(answer);

      // The answer is a music command, will now play the music
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
    }
  }

  async ask(messageText, discordMessage) {
    if (messageText === "clear") {
      return await this.clearChatHistory(discordMessage);
    }

    try {
      const chatHistory = await this.setPromptAndChatHistory(
        messageText,
        discordMessage
      );

      if (!chatHistory) {
        return "Your current prompt is too long / is empty. Please try again.";
      }

      const currentToken = this.calculateTokenWithEverything(discordMessage);

      let answer = await this.sendChatRequest(messageText, chatHistory);

      if (!answer) {
        return await this.retryAsk(messageText, discordMessage);
      }

      answer = this.removeDuplicates(answer, chatHistory);

      await this.saveAnswer(answer, messageText, discordMessage);

      const totalToken = this.calculateTotalToken(currentToken, answer);

      this.logTokenCost(totalToken);

      return answer;
    } catch (e) {
      return this.handleRequestError(e);
    }
  }

  /**
   * Send the chat request to the AI provider
   * @param {String} messageText
   * @param {Array} chatHistory
   * @returns {Promise<*>}
   */
  async sendChatRequest(messageText, chatHistory) {
    return await this.provider.sendChat(
      messageText,
      this.getPersonalitiesAndAbilities(),
      chatHistory
    );
  }

  async retryAsk(messageText, discordMessage) {
    let retries = this.retries[discordMessage.author.id] || 0;

    if (retries < this.maxRetries) {
      retries++;
      this.retries[discordMessage.author.id] = retries;

      console.info("retrying...");
      await this.sleep(this.retryDelay);
      return await this.ask(messageText, discordMessage);
    } else {
      console.error("Max retries reached, aborting.");
      this.retries[discordMessage.author.id] = 0;
      throw new Error(
        "Max retries reached, aborting. The answer is always empty."
      );
    }
  }

  calculateTotalToken(currentToken, answer) {
    return currentToken + this.calculateToken(answer);
  }

  logTokenCost(totalToken) {
    console.info(
      "[RirikoAI-NLP] Request complete, costs ".blue +
        totalToken +
        ` tokens, that's about `.blue +
        `$${(this.costPerToken * totalToken).toFixed(5)}`
    );
  }

  handleRequestError(e) {
    console.error(
      "Something went wrong when trying to send the request to the AI provider: " +
        "Check if your API key is still valid, or if your prompts are not corrupted / too long. Also try to clear your " +
        "chat history with Ririko by entering .clear in Discord."
    );

    if (e.response) {
      console.error(e.response.data.error.message);
      return "Your current prompt is too long, please try again with a shorter prompt. Alternatively, you can clear your chat with `.clear` and try again.";
    } else {
      console.error("", e);
      return "Something went wrong when trying to reply to you. Please try with a different/shorter prompt or clear your chat with `.clear` and try again.";
    }
  }

  // ==========================================  All about current prompt ==============================================

  /**
   * Get the current prompt
   * @param discordMessage
   * @returns {*}
   */
  getCurrentPrompt(discordMessage) {
    return this.currentUserPrompt[discordMessage.author.id];
  }

  /**
   * Set the current prompt
   * @param message
   * @param discordMessage
   * @returns {*}
   */
  setCurrentPrompt(message, discordMessage) {
    this.currentUserPrompt[discordMessage.author.id] = "Human: " + message;
    return this.currentUserPrompt[discordMessage.author.id];
  }

  /**
   * Set and check the current prompt with chat history
   * @param message
   * @param discordMessage
   * @returns {Promise<*|boolean>}
   */
  async setPromptAndChatHistory(message, discordMessage) {
    // Set the current prompt into array
    this.setCurrentPrompt(message, discordMessage);

    // check upfront if the current message does not exceed the maxChatToken
    const tokens = this.calculateToken(
      this.getPersonalitiesAndAbilities() +
        this.getCurrentPrompt(discordMessage)
    );

    if (tokens > this.maxChatTokens - 1000) {
      console.error(
        `Your current prompt is too long, please try again with a shorter prompt`
      );
      return false;
    }

    try {
      await this.initializeChatHistory(discordMessage);

      const lengthIsValid = this.validateTokenLength(discordMessage);

      if (!lengthIsValid) {
        await this.truncateChatHistory(discordMessage);
      }

      return this.chatHistory[discordMessage.author.id];
    } catch (e) {
      throw e;
    }
  }

  /**
   * Get Personality and Abilities
   * @returns {string}
   */
  getPersonalitiesAndAbilities() {
    try {
      // Get the current time
      let currentTime = new Date();

      // Use regular expressions and the replace() method to replace the string
      let personality = AIPersonality().join("\n"),
        ability = AIPrompts().join("\n");

      // Return the personality and abilities
      return (
        // Replace the %CURRENT_TIME% placeholder with the current time
        personality.replace("%CURRENT_TIME%", currentTime) +
        "\n\n" + // Space between the personality and abilities
        ability + // Joins the abilities with a new line
        "\n" // Ends with a new line
      );
    } catch (e) {
      console.error("Error in RIRIKO AI:", e);
      throw (
        "[ERROR] Something when wrong trying to read the AI Personality and Prompts. " +
        "Check the config file (and config.example files), see if there are missing configs"
      );
    }
  }

  // =========================================  All about token calculations ===========================================

  /**
   * Calculate the number of token
   * @param historyString
   * @returns {number}
   */
  calculateToken(historyString) {
    // Calculate the number of tokens, we're making the assumption that length of the string divided by 4 is the number of tokens
    // This is not 100% accurate, but it's good enough for now
    return parseInt(historyString.length / 4);
  }

  /**
   * Calculate the number of token with everything (personalities, abilities, chat history, and current prompt)
   * @param discordMessage
   * @returns {number}
   */
  calculateTokenWithEverything(discordMessage) {
    return this.calculateToken(
      this.getPersonalitiesAndAbilities() +
        this.getChatHistory(discordMessage).toString() +
        this.getCurrentPrompt(discordMessage)
    );
  }

  /**
   * Check if the current token length is valid
   * @param discordMessage
   * @returns {boolean}
   */
  validateTokenLength(discordMessage) {
    // Calculate the current token with everything
    const chatTokens = this.calculateTokenWithEverything(discordMessage);

    console.info(
      "[RirikoAI-NLP] A new request with ".blue +
        chatTokens +
        " tokens is being prepared.".blue
    );

    return chatTokens < this.maxChatTokens;
  }

  // ============================================  All about chat history ==============================================

  /**
   *
   * @param discordMessage
   * @returns {Array} - Array of strings, or empty array if no chat history found
   */
  getChatHistory(discordMessage) {
    if (this.chatHistory[discordMessage.author.id]) {
      return this.chatHistory[discordMessage.author.id];
    } else {
      // This user has not chatted with Ririko recently, returns empty array
      return [];
    }
  }

  /**
   * Initialize chat history. If the user has never chatted with Ririko before, create a new chat history
   * If the user has chatted with Ririko before, get the chat history from the database.
   * If the chat history in the database is a string, convert it to an array
   *
   * @param discordMessage
   * @returns {Promise<void>}
   */
  async initializeChatHistory(discordMessage) {
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
  }

  /**
   * Truncate the chat history if the current token length is too long.
   * Maximum retries is 100, to prevent infinite loop.
   *
   * @throws {string} - If truncating the chat history takes more than 100 retries, throw an error.
   * @param discordMessage
   * @returns {Promise<void>}
   */
  async truncateChatHistory(discordMessage) {
    let totalToken = this.calculateTokenWithEverything(discordMessage);

    // Just in case, set a maxRetries to prevent infinite loop
    const maxRetries = 100;
    let retries = 0;

    // Truncate the chat history until the total token is less than the maxChatTokens
    while (totalToken > this.maxChatTokens) {
      if (retries > maxRetries) {
        throw "Your current prompt is too long, please try again with a shorter prompt";
      }

      this.chatHistory[discordMessage.author.id] =
        this.chatHistory[discordMessage.author.id].slice(1);

      totalToken = this.calculateTokenWithEverything(discordMessage);
    }

    console.info(
      `[RirikoAI-NLP] Truncated chat history to ${totalToken} tokens.`.blue
    );
  }

  /**
   * Clear the chat history. This is useful if the user wants to start a new conversation or have any issues with the AI.
   * The user can clear the chat history by entering the command .clear
   *
   * @param discordMessage
   * @returns {Promise<string>}
   */
  async clearChatHistory(discordMessage) {
    await deleteChatHistory(discordMessage.guildId, discordMessage.author.id);
    return "Your chat history with Ririko has been cleared.";
  }

  // ===========================================  All about post AI answer =============================================

  /**
   * Save the answer into the chat history db
   * @param answer
   * @param messageText
   * @param discordMessage
   * @returns {Promise<void>}
   */
  async saveAnswer(answer, messageText, discordMessage) {
    // Save current user prompt and answer into chat history
    this.chatHistory[discordMessage.author.id].push(
      this.getCurrentPrompt(discordMessage)
    );

    // Save the answer into the chat history
    this.chatHistory[discordMessage.author.id].push("Friend: " + answer);

    // Push the chat history containing personalities and abilities + past conversations + the current prompt + the answer into the database
    await updateChatHistory(
      discordMessage.guildId,
      discordMessage.author.id,
      this.chatHistory[discordMessage.author.id]
    );
  }

  /**
   * Remove duplicate sentences from the reply, based on the last 2 replies
   * @param reply
   * @param chatHistory
   * @returns {*}
   */
  removeDuplicates = (reply, chatHistory) => {
    // Get the last 2 replies from the AI
    const previousReplies = chatHistory
      .filter((entry) => entry.startsWith("Friend:"))
      .slice(-2);

    // Returns the reply with duplicate sentences removed
    return reply
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
  };

  /**
   * Check if we have anything else to do when we receive the answer.
   * @param answer
   */
  processAnswer(answer) {
    // Check if the answer is a music command
    const matches = answer.match(/(?<=\🎵).+?(?=\🎵)/g);

    // If the answer is a music command, return the name of the song, and set isMusic to true.
    // Otherwise, return isMusic as false.
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

  /**
   * Sleep for a certain amount of time
   * @param ms
   * @returns {Promise<unknown>}
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get the current time
   * @returns {Date}
   */
  getCurrentTime() {
    return new Date();
  }
}

module.exports = { RirikoAINLP };
