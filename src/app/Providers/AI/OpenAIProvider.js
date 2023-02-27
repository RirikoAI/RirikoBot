const { AIProviderBase } = require("app/Providers/AIProviderBase");
const config = require("config");
const getconfig = require("utils/getconfig");
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

  async sendChat(messageText, context, history) {
    const prompt = context + history;
    try {
      // Send request to NLP Cloud.
      const response = await this.openAiClient.createCompletion({
        model: "text-davinci-003",
        prompt,
        temperature: 0.5,
        max_tokens: 350,
        top_p: 1,
        frequency_penalty: 0.5,
        presence_penalty: 0,
        stop: ["Human:"],
      });

      const answer = response?.data.choices[0].text.split("Robot:")[1]?.trim();
      return answer;
    } catch (e) {
      throw e;
    }
  }
}

module.exports = { OpenAIProvider };
