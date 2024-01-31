switch (item.name) {
  /**
   * { name: 'application_id', value: 'a' }
   * { name: 'bot_token', value: 'b' }
   * { name: 'privileged_intents', value: 'on' }
   * { name: 'enable_chatbot', value: 'on' }
   * { name: 'ai_provider', value: 'OpenAI' }
   * { name: 'ai_token', value: 'c' }
   * { name: 'enable_stablediffusion', value: 'on' }
   * { name: 'replicate_token', value: 'd' }
   * { name: 'enable_twitch', value: 'on' }
   * { name: 'twitch_client_id', value: 'e' }
   * { name: 'twitch_client_secret', value: 'f' }
   * { name: 'mongodb_uri' value: 'mongodb+srv://' }
   * { name: 'accept_tos', value: 'true' }
   * { name: 'accept_privacypolicy', value: 'true' }
   */
  case "application_id":
    console.log("application_id", item.value);
    break;
  case "bot_token":
    console.log("bot_token", item.value);
    break;
  case "privileged_intents":
    console.log("privileged_intents", item.value);
    break;
  case "enable_chatbot":
    console.log("enable_chatbot", item.value);
    break;
  case "ai_provider":
    console.log("ai_provider", item.value);
    break;
  case "ai_token":
    console.log("ai_token", item.value);
    break;
  case "enable_stablediffusion":
    console.log("enable_stablediffusion", item.value);
    break;
  case "replicate_token":
    console.log("replicate_token", item.value);
    break;
  case "enable_twitch":
    console.log("enable_twitch", item.value);
    break;
  case "twitch_client_id":
    console.log("twitch_client_id", item.value);
    break;
  case "twitch_client_secret":
    console.log("twitch_client_secret", item.value);
    break;
  case "mongodb_uri":
    console.log("mongodb_uri", item.value);
    break;
  case "accept_tos":
    console.log("accept_tos", item.value);
    break;
  case "accept_privacypolicy":
    console.log("accept_privacypolicy", item.value);
    break;
  default:
    break;
}
