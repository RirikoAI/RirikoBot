const {RirikoHuggingChatClient} = require("ririkohuggingchat-bot-client");
const {AIProviderBase} = require("app/Providers/AIProviderBase");
const config = require("config");
const getconfig = require("helpers/getconfig");

class RirikoHuggingChatProvider extends AIProviderBase {
  constructor() {
    super();
    this.ririkoHuggingChatClient = new RirikoHuggingChatClient({
      apiUrl: getconfig.localAIServerURL(),
      token: this.token = getconfig.AIToken(),
      settings: {
        system_prompt: ""
      }
    });
  }

  getClient() {
    return this.ririkoHuggingChatClient;
  }

  /**
   * Send chat to NLP Cloud
   * @param {String} messageText
   * @param {String} context
   * @param {Array} history
   * @param discordMessage
   * @returns {Promise<*>}
   */
  async sendChat(messageText, context, history, discordMessage) {
    try {
      // Send request to NLP Cloud.
      this.ririkoHuggingChatClient.settings = {
        system_prompt: context
      }

      const response = await this.ririkoHuggingChatClient.ask(
        messageText,
        discordMessage.author.username
      );

      if (typeof response.data["answer"] !== "undefined") {
        return response.data["answer"];
      } else {
        return "(no response)";
      }
    } catch (e) {
      throw e;
    }
  }
}

module.exports = {RirikoHuggingChatProvider};
