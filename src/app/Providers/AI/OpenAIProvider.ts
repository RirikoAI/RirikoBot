const { AIProviderBase } = require("app/Providers/AIProviderBase");
const config = require("config");
const getconfig = require("helpers/getconfig");
const openai = require("openai");
const OpenAIApi = require("openai");

class OpenAIProvider extends AIProviderBase {
  constructor() {
    super();
    this.token = getconfig.AIToken();

    if (this.token === null) {
      console.error("No token received");
      return;
    }

    this.openAiClient = new OpenAIApi({
      apiKey: this.token,
    });
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

      if (model) {
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
          { role: "user", content: messageText }
        ];

        const response = await this.openAiClient.chat.completions.create({
          model: model,
          messages: newPrompt,
          temperature: 1,
          max_tokens: 2000,
          top_p: 1,
          frequency_penalty: 0.9,
          presence_penalty: 0.9,
        });

        return response.choices[0].message.content; 
      } else {
        throw new Error("Invalid GPT model. Check config.ts");
      }
    } catch (e) {
      throw e;
    }
  }
}

module.exports = { OpenAIProvider };
