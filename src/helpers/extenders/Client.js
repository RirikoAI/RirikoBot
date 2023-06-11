const { Guild, ChannelType } = require("discord.js");
const colors = require("colors");

const ROLE_MENTION = /<?@?&?(\d{17,20})>?/;
const CHANNEL_MENTION = /<?#?(\d{17,20})>?/;
const MEMBER_MENTION = /<?@?!?(\d{17,20})>?/;

const { log } = require("helpers/logger");

module.exports = async function (client, config) {
  log("[EXTENDERS - CLIENT] Registered".brightGreen);

  /**
   * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot
   * @param {string} search
   * @param {Boolean} exact
   */
  client.resolveUsers = async (search, exact = false) => {
    if (!search || typeof search !== "string") return [];
    const users = [];

    // check if userId is passed
    const patternMatch = search.match(/(\d{17,20})/);
    if (patternMatch) {
      const id = patternMatch[1];
      const fetched = await client.users
        .fetch(id, { cache: true })
        .catch(() => {}); // check if mentions contains the ID
      if (fetched) {
        users.push(fetched);
        return users;
      }
    }

    // check if exact tag is matched in cache
    const matchingTags = client.users.cache.filter(
      (user) => user.tag === search
    );
    if (exact && matchingTags.size === 1) users.push(matchingTags.first());
    else matchingTags.forEach((match) => users.push(match));

    // check matching username
    if (!exact) {
      client.users.cache
        .filter(
          (x) =>
            x.username === search ||
            x.username.toLowerCase().includes(search.toLowerCase()) ||
            x.tag.toLowerCase().includes(search.toLowerCase())
        )
        .forEach((user) => users.push(user));
    }

    return users;
  };
};
