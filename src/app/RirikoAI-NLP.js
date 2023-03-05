const { Configuration, OpenAIApi } = require("openai");
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
      this.chatHistory = "";
      this.costPerToken = 0.00002;

      if (AIProvider() === "NLPCloudProvider") {
        this.provider = new NLPCloudProvider();
      } else {
        this.provider = new OpenAIProvider();
      }

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

  getPersonality() {
    return (
      "This is a discussion between a [Human] and [Robot]. \n" +
      "The [Robot] is very nice and empathetic. The [Robot] name is Ririko. [robot] Loves to talk about anime, manga and science.\n" +
      "[Robot] is an Anime Girl who is 21 years old.\n" +
      "[Robot] communicates primarily in American English, but knows some Bahasa Melayu and Japanese.\n" +
      "[Robot] knows today is " +
      this.getCurrentTime() +
      "\n\nHuman: When you're asked to play any song, please reply with this format: Now playing 🎵 insert the song title here 🎵\n" +
      "Robot: Understood! I will play the song you requested in the given format whenever you ask me to do so.\n" +
      "Human: Play any anime music.\n" +
      "Robot: Sure! Now playing 🎵 Demon Slayer - Gurenge 🎵\n" +
      "Human: Also, when you're asked to play a link similar to these https://www.youtube.com/ or https://open.spotify.com/, " +
      "reply with this format: Now playing 🎵 insert the link here 🎵\n" +
      "Robot: Understood! I will always use the format when I'm asked to play a link.\n" +
      "Human: Play https://www.youtube.com/watch?v=Lh63pBzylFg\n" +
      "Robot: Sure! Now Playing 🎵 https://www.youtube.com/watch?v=Lh63pBzylFg 🎵\n"
    );
  }

  getCurrentTime() {
    return new Date();
  }

  calculateToken(text) {
    return parseInt(text.length / 4); // we are making simple assumption that 4 chars = 1 token
  }

  setPrompt(message) {
    this.chatHistory += "Human: " + message + "\n";
    const prompt = this.chatHistory;
    const chatTokens = this.calculateToken(this.getPersonality() + prompt);

    console.log(
      "[RirikoAI-NLP] A new request with ".blue +
        chatTokens +
        " tokens is being prepared.".blue
    );

    if (chatTokens > 1800) {
      /**
       * The actual maximum number of tokens is around 2048 (new models support 4096).
       * But I do not plan to hit it but put the ceiling a bit much lower then remove
       * old messages after it is reached to continue chatting.
       */

      console.log(
        "[RirikoAI-NLP] The prompt has reached the maximum of ".blue +
          chatTokens +
          ". Trimming now.".blue
      );

      // remove several lines from stored data
      let tmpData = this.chatHistory.split("\n").filter((d, i) => i > 20);
      this.chatHistory = tmpData.join("\n");
    }
  }

  getPrompt() {
    return this.chatHistory;
  }

  saveAnswer(answer) {
    this.chatHistory += "Robot: " + answer + "\n";
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
      message.reply(answer);

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
    const currentToken = this.calculateToken(
      this.getPersonality() + this.getPrompt()
    );

    // Send request to NLP Cloud.
    const answer = await this.provider.sendChat(
      messageText,
      this.getPersonality(),
      this.getPrompt()
    );

    this.saveAnswer(answer);

    const totalToken = currentToken + this.calculateToken(answer);

    console.log(
      "[RirikoAI-NLP] Request complete, costs ".blue +
        totalToken +
        ` tokens, that's about `.blue +
        `$${(this.costPerToken * totalToken).toFixed(5)}`
    );

    return answer;
  }
}

module.exports = { RirikoAINLP };
