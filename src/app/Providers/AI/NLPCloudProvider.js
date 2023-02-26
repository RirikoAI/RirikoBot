const NLPCloudClient = require("nlpcloud");
const { AIProviderBase } = require("../AIProviderBase");
const config = require("../../../../config");

class NLPCloudProvider extends AIProviderBase {
  constructor() {
    super();
    this.nlpcloudToken = config.AI.Token;

    if (this.nlpcloudToken === null) {
      console.error("No NLP Cloud token received");
      return;
    }

    this.nlpCloudClient = new NLPCloudClient(
      "finetuned-gpt-neox-20b",
      this.nlpcloudToken,
      true
    );
  }

  getClient() {
    return this.nlpCloudClient;
  }

  async sendChat(messageText, context, history) {
    try {
      // Send request to NLP Cloud.
      const response = await this.nlpCloudClient.chatbot(
        messageText,
        context + history
      );

      if (typeof response.data["response"] !== "undefined") {
        return response.data["response"];
      } else {
        return "(no response)";
      }
    } catch (e) {
      throw e;
    }
  }
}

module.exports = { NLPCloudProvider };
