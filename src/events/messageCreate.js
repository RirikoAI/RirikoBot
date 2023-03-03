const { EmbedBuilder, PermissionsBitField, codeBlock } = require("discord.js");
const client = require("ririko");
const config = require("config");
const { QuickDB } = require("quick.db");
const { RirikoAINLP } = require("app/RirikoAI-NLP");
const getconfig = require("utils/getconfig");
const generateImage = require("../tools/generateImage");
const db = new QuickDB();

module.exports = {
  name: "messageCreate",
};

client.on("messageCreate", async (message) => {
  if (message.channel.type !== 0) return;
  if (message.author.bot) return;

  const RirikoAiNlp = RirikoAINLP.getInstance();
  await RirikoAiNlp.handleMessage(message);

  const prefix =
    (await db.get(`guild_prefix_${message.guild.id}`)) ||
    getconfig.discordPrefix() ||
    "!";

  if (!message.content.startsWith(prefix)) return;
  if (!message.guild) return;
  if (!message.member)
    message.member = await message.guild.fetchMember(message);

  const args = message.content.slice(prefix.length).trim().split(/ +/g);
  const cmd = args.shift().toLowerCase();
  if (cmd.length == 0) return;

  let command = client.prefix_commands.get(cmd);

  if (!command) return;

  if (command) {
    if (command.permissions) {
      if (
        !message.member.permissions.has(
          PermissionsBitField.resolve(command.permissions || [])
        )
      )
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(
                `🚫 Unfortunately, you are not authorized to use this command.`
              )
              .setColor("Red"),
          ],
        });
    }

    if ((command.owner, command.owner == true)) {
      if (getconfig.discordBotOwners()) {
        const allowedUsers = []; // New Array.

        getconfig.discordBotOwners().forEach((user) => {
          const fetchedUser = message.guild.members.cache.get(user);
          if (!fetchedUser) return allowedUsers.push("*Unknown User#0000*");
          allowedUsers.push(`${fetchedUser.user.tag}`);
        });

        if (
          !getconfig
            .discordBotOwners()
            .some((ID) => message.member.id.includes(ID))
        )
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setDescription(
                  `🚫 Sorry but only owners can use this command! Allowed users:\n**${allowedUsers.join(
                    ", "
                  )}**`
                )
                .setColor("Red"),
            ],
          });
      }
    }

    try {
      command.run(client, message, args, prefix, config, db);
    } catch (error) {
      console.error(error);
    }
  }
});
