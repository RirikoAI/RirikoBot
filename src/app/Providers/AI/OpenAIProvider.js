const { AIProviderBase } = require("app/Providers/AIProviderBase");
const config = require("config");
const getconfig = require("helpers/getconfig");
const openai = require("openai");
const { OpenAIApi, Configuration } = require("openai");

class OpenAIProvider extends AIProviderBase {
  constructor() {
    super();
    this.token = getconfig.AIToken();

    if (this.token === null) {
      console.error("No token received");
      return;
    }

    this.configuration = new Configuration({
      apiKey: this.token,
    });

    this.openAiClient = new OpenAIApi(this.configuration);
  }

  getClient() {
    return this.openAiClient;
  }

  async sendChat(messageArray, context, history) {
    try {
      // Send request to NLP Cloud.
      const response = await this.openAiClient.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: messageArray,
        temperature: 0.5,
        max_tokens: 2000,
        top_p: 1,
        frequency_penalty: 0.5,
        presence_penalty: 0,
      });

      return {
        message: response.data.choices[0].message.content,
        tokens: response.data.usage.total_tokens,
      };
    } catch (e) {
      throw e;
    }
  }
}

module.exports = { OpenAIProvider };
