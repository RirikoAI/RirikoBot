const {RirikoLLaMAClient} = require("ririkollama-bot-client");
const {AIProviderBase} = require("app/Providers/AIProviderBase");
const config = require("config");
const getconfig = require("helpers/getconfig");

class RirikoLLaMAProvider extends AIProviderBase {
  constructor() {
    super();
    this.ririkoLlamaClient = new RirikoLLaMAClient({
      apiUrl: getconfig.localAIServerURL(),
      token: this.token = getconfig.AIToken(),
      settings: {
        "max_new_tokens": 30,
        "temperature": 1.0,
        "repetition_penalty": 1,
        "top_p": 0.2,
        "start": "",
        "break": "\nHuman:"
      }
    });
  }

  getClient() {
    return this.ririkoLlamaClient;
  }

  /**
   * Send chat to NLP Cloud
   * @param {String} messageText
   * @param {String} context
   * @param {Array} history
   * @returns {Promise<*>}
   */
  async sendChat(messageText, context, history) {
    try {
      let prompt = context + history.join("\n");
      prompt = prompt.replace(/\n$/, '');

      prompt += "\nHuman: " + messageText + "\nFriend:";

      // Send request to NLP Cloud.
      const response = await this.ririkoLlamaClient.ask(
        prompt,
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

module.exports = {RirikoLLaMAProvider};
