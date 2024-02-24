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

  /**
   * Send chat to OpenAI
   * @param {String} messageText
   * @param {String} context
   * @param {Array} history
   * @returns {Promise<*>}
   */
  async sendChat(messageText, context, history) {
    try {
      const model = config.AI.GPTModel; // davinci or gpt35
      const prompt = `${context}${history.join("\n")}\nHuman: ${messageText}\n`;

      if (model === "gpt35") {
        const convertedChatHistory = history.map((message) => {
          const [role, content] = message.split(": ");
          return {
            role: role === "Human" ? "user" : "assistant",
            content: content.trim(),
          };
        });

        const newPrompt = [
          { role: "system", content: context },
          ...convertedChatHistory,
        ];

        const response = await this.openAiClient.createChatCompletion({
          model: "gpt-3.5-turbo",
          messages: newPrompt,
          temperature: 1,
          max_tokens: 2000,
          top_p: 1,
          frequency_penalty: 0.9,
          presence_penalty: 0.9,
        });

        return response.data.choices[0].message.content; // Uncomment for GPT-3.5-turbo
      } else if (model === "davinci") {
        // Send request to OpenAI for text-davinci-002
        // NOTE: text-davinci-003 is now removed from OpenAI API
        const response = await this.openAiClient.createCompletion({
          model: "text-davinci-002",
          prompt,
          temperature: 1,
          max_tokens: 2000,
          top_p: 0.2,
          frequency_penalty: 0.9,
          presence_penalty: 1.9,
          stop: ["Human:"],
        });

        return response?.data.choices[0].text.split("Friend:")[1]?.trim();
      } else {
        throw new Error("Invalid GPT model. Check config.ts");
      }
    } catch (e) {
      throw e;
    }
  }
}

module.exports = { OpenAIProvider };
