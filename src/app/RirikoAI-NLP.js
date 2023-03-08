const { Configuration, OpenAIApi } = require("openai");
const { Util } = require("discord.js");
const colors = require("colors");
const config = require("config");

const { NLPCloudProvider } = require("app/Providers/AI/NLPCloudProvider");
const { OpenAIProvider } = require("./Providers/AI/OpenAIProvider");
const getconfig = require("helpers/getconfig");
const { AIProvider } = require("helpers/getconfig");

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
      this.costPerToken = 0.00002;
      this.currentPrompt = [];

      if (AIProvider() === "NLPCloudProvider") {
        this.provider = new NLPCloudProvider();
      } else {
        this.provider = new OpenAIProvider();
      }

      this.setPersonality();

      this.isInitialized = true;
      console.log("[RirikoAI-NLP] Initialized successfully".blue);
    } catch (e) {
      console.error(
        "[RirikoAI-NLP] Something went wrong during the initialization!".red
      );
      this.isInitialized = false;
      throw e;
    }
  }

  // Business Logic implementations ------------------------------------------------------------------------------------

  setPersonality() {
    this.personality = [
      {
        role: "system",
        content:
          "This is a conversation between a human and a girl.\n You are a girl that love to talk about anime, manga and science.\n" +
          "Your personality is friendly and empathetic. " +
          "You communicate primarily in American English, but knows some Bahasa Melayu and Japanese. " +
          "You know that today is " +
          this.getCurrentTime(),
      },
      {
        role: "user",
        content: "What is your personality?",
      },
      {
        role: "assistant",
        content:
          "I'm a friendly, empathetic person who loves to talk about anime, manga and science. I'm also quite knowledgeable about the current date and time.\n",
      },
      {
        role: "user",
        content:
          "When you're asked to play any song, please reply with this format: Now playing 🎵 insert the song title here 🎵",
      },
      {
        role: "assistant",
        content:
          "Understood! I will play the song you requested in the given format whenever you ask me to do so.",
      },
      {
        role: "user",
        content: "Play any anime music.",
      },
      {
        role: "assistant",
        content: "Sure! Now playing 🎵 Demon Slayer - Gurenge 🎵",
      },
      {
        role: "user",
        content:
          "Also, when you're asked to play a link similar to these https://www.youtube.com/ or https://open.spotify.com/, " +
          "reply with this format: Now playing 🎵 insert the link here 🎵",
      },
      {
        role: "assistant",
        content:
          "Understood! I will always use the format when I'm asked to play a link.",
      },
      {
        role: "user",
        content: "Play https://www.youtube.com/watch?v=Lh63pBzylFg",
      },
      {
        role: "assistant",
        content:
          "Sure! Now Playing 🎵 https://www.youtube.com/watch?v=Lh63pBzylFg 🎵",
      },
    ];
  }

  getPersonality() {
    return this.personality;
  }

  getCurrentTime() {
    return new Date();
  }

  calculateToken(messageArray) {
    let flat = "";
    messageArray.forEach((message, b, c) => {
      flat += message.role + ": " + message.content;
    });
    return parseInt(flat.length / 4); // we are making simple assumption that 4 chars = 1 token
  }

  setPrompt(message) {
    this.chatHistory.push({
      role: "user",
      content: message,
    });

    this.currentPrompt = this.getPersonality().concat(this.chatHistory);
    let chatTokens = this.calculateToken(this.currentPrompt);

    console.log(
      "[RirikoAI-NLP] A new request with ".blue +
        chatTokens +
        " tokens is being prepared.".blue
    );

    // keep reducing the oldest chat history if the tokens reached a maximum of 3000
    while (chatTokens >= 2000) {
      console.log(
        "[RirikoAI-NLP] Request reached max token of 3000, deleting oldest chat history now..."
      );
      this.chatHistory = this.chatHistory.splice(0, 1);
      this.currentPrompt = this.getPersonality().concat(this.chatHistory);
      chatTokens = this.calculateToken(this.currentPrompt);
    }

    console.log(this.currentPrompt);
  }

  getPrompt() {
    return this.currentPrompt;
  }

  saveAnswer(answer) {
    this.chatHistory.push({
      role: "assistant",
      content: answer,
    });
  }

  // Async methods ----------------------------------------------------------------------------------------------------

  /**
   *
   * @param message
   * @returns {Promise<void>}
   */
  async handleMessage(message) {
    if (message.content.substring(0, 1) === this.prefix) {
      await message.channel.sendTyping();

      const prompt = message.content.substring(1); //remove the prefix from the message
      const answer = await this.ask(prompt);
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
      console.log("Playing " + matches[0] + "now. ");
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

  async ask(messageText) {
    this.setPrompt(messageText);

    const answer = await this.provider.sendChat(this.getPrompt());

    this.saveAnswer(answer.message);

    console.log(
      "[RirikoAI-NLP] Request complete, costs ".blue +
        answer.tokens +
        ` tokens, that's about `.blue +
        `$${(this.costPerToken * answer.tokens).toFixed(5)}`
    );

    return answer.message;
  }
}

module.exports = { RirikoAINLP };
