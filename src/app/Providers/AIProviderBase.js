/**
 * Base class for all AI Providers within this directory
 */
class AIProviderBase {
  /**
   * Set the provider's token, instantiate provider's client and other
   * parameters required
   */
  constructor() {}

  /**
   * Get the client object which is instantiated in the constructor
   * @returns {Object} Provider's main client object
   */
  getClient() {}

  /**
   * Asynchronous call to the actual service provider, takes 3 parameters.
   *
   * @param messageText {string} A new input from the user
   * @param context {string} The context, eg: A conversation between A and B. Can also be
   * set as the AI's personality.
   * @param history {*} Some providers requires the chat history to be in a separate payload,
   * but oftentimes can be combined with the context parameter.
   * @param discordMessage (Optional) Discord Message object
   * Returns response from the provider as string.
   * @returns {Promise<string>} Response from the provider
   */
  async sendChat(messageText, context, history, discordMessage) {}
}

module.exports = { AIProviderBase };
