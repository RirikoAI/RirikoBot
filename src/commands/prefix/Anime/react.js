const { EmbedBuilder } = require("discord.js");
const fs = require("fs");
const { getLang } = require("helpers/language");
const { getJson } = require("helpers/httpUtils");
const NekosLife = require("nekos.life");
const neko = new NekosLife();

const choices = [
  "airkiss",
  "angrystare",
  "bite",
  "bleh",
  "blush",
  "brofist",
  "celebrate",
  "cheers",
  "clap",
  "confused",
  "cool",
  "cry",
  "cuddle",
  "dance",
  "drool",
  "evillaugh",
  "facepalm",
  "feed",
  "handhold",
  "happy",
  "headbang",
  "hug",
  "kiss",
  "laugh",
  "lick",
  "love",
  "mad",
  "nervous",
  "no",
  "nom",
  "nosebleed",
  "nuzzle",
  "nyah",
  "pat",
  "peek",
  "pinch",
  "poke",
  "pout",
  "punch",
  "roll",
  "run",
  "sad",
  "scared",
  "shout",
  "shrug",
  "shy",
  "sigh",
  "sip",
  "slap",
  "sleep",
  "slowclap",
  "smack",
  "smile",
  "smug",
  "sneeze",
  "sorry",
  "stare",
  "stop",
  "surprised",
  "sweat",
  "thumbsup",
  "tickle",
  "tired",
  "wave",
  "wink",
  "woah",
  "yawn",
  "yay",
  "yes",
];

const suffix = {
airkiss: "kissed the air infront of",
angrystare: "stared angrily at",
bite: "bit",
bleh: "bleh'ed at",
blush: "blushed at",
brofist: "brofisted",
celebrate: "celebrated with",
cheers: "had a toast with",
clap: "clapped for",
confused: "is confused with",
cool: "is cool with",
cry: "cried becuase of",
cuddle: "cuddled with",
dance: "danced with",
drool: "drooled over",
evillaugh: "laughed evily at",
facepalm: "facepalmed at",
feed: "fed",
handhold: "held hands with",
happy: "is happy with",
headbang: "headbanged with",
hug: "hugged",
kiss: "kissed",
laugh: "laughed at",
lick: "licked",
love: "loves",
mad: "is mad at",
nervous: "is nervouse because of",
no: "disagrees with",
nom: "ate",
nosebleed: "gets nose bleed because of",
nuzzle: "nuzzled with",
nyah: "nyahs at",
pat: "patted",
peek: "peeked at",
pinch: "pinched",
poke: "poked",
pout: "pouted at",
punch: "punched",
roll: "rolled with",
run: "runs from",
sad: "is sad because of",
scared: "is scared of",
shout: "shouted at",
shrug: "shrugged at",
shy: "is shy because of",
sigh: "sighed at",
sip: "sips with",
slap: "slapped",
sleep: "slept with",
slowclap: "claps slowly at",
smack: "smacked",
smile: "smiled at",
smug: "smugged at",
sneeze: "sneezed at",
sorry: "is sorry to",
stare: "stared at",
stop: "stopped",
surprised: "is surprised at",
sweat: "sweats because of",
thumbsup: "gives a thumbs up to",
tickle: "tickled",
tired: "is tired with",
wave: "waved at",
wink: "winked at",
woah: "is surprised at",
yawn: "yawned at",
yay: "is happy with",
yes: "agrees with"
};

module.exports = {
  config: {
    name: "react",
    description:
      "Send reaction anime images. Must be one of " + choices.join(", "),
    usage: "react [choice]",
  },
  owner: false,
  category: "Anime",
  /**
   * Command runner
   * @author earnestangel https://github.com/RirikoAI/RirikoBot
   *
   * @param {import("discord.js").Client} client Discord.js client
   * @param {import("discord.js").Message | import("discord.js").CommandInteraction} message
   * @param args Arguments, excludes the command name (e.g: !command args[0] args[1] args[2]...)
   * @param prefix Guild specific prefix, falls back to config.js prefix
   * @param {import("config")} config Config.js file
   * @param {import("Quick.db").QuickDB} db Quick.db client
   *
   * @returns {Promise<*>}
   */
  run: async (client, message, args, prefix, config, db) => {
    if (!args[0]) {
      return message.reply(
        `Invalid command. Try \`${prefix}react ${choices.join(", ")}\``
      );
    }

    const category = args[0].toLowerCase();
    if (!choices.includes(category)) {
      return message.reply(
        `Invalid choice: \`${category}\`.\nAvailable reactions: ${choices.join(
          ", "
        )}`
      );
    }

    let embed;
    if (args[1]) {
      embed = await genReaction(category, message.author, args[1]);
    } else {
      embed = await genReaction(category, message.author);
    }

    await message.reply({ embeds: [embed] });
  },
};

/**
 * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot
 * @param category
 * @param user
 * @returns {Promise<EmbedBuilder>}
 */
const genReaction = async (category, user, secondUser = false) => {
  try {
    let imageUrl;

    // neko api
    if (category === "feed") {
      imageUrl = (await neko[category]()).url;
    }

    // otakugif api
    else {
      let reactUrl = `https://api.otakugifs.xyz/gif?reaction=${category}&format=gif`;
      const response = await getJson(reactUrl);
      if (!response.success) throw new Error("API error");
      imageUrl = response.data.url;
    }

    let response = new EmbedBuilder()
      .setImage(imageUrl)
      .setColor("Random")
      .setFooter({ text: `Requested By ${user.tag}` });


    if (secondUser) { 
      if (secondUser.match(/\d+/)[0] == user.id) {
        secondUser = "themselves";
      }
      response.setDescription(`${user} ${suffix[category]} ${secondUser}`);
    }

    return response;
  } catch (ex) {
    return new EmbedBuilder()
      .setColor("Red")
      .setDescription("Failed to fetch meme. Try again!")
      .setFooter({ text: `Requested By ${user.tag}` });
  }
};
