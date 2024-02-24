const { ApplicationCommandOptionType, EmbedBuilder } = require("discord.js");

module.exports = {
  category: "Roles",
  userPermissions: ["ManageGuild"],
  config: {
    name: "autorole",
    description: "setup role to be given when a member joins the server",
    enabled: true,
    usage: "autorole off\nautorole [role name / id]",
    minArgsCount: 1,
  },
  /**
   * Command runner
   * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot
   * @author earnestangel https://github.com/RirikoAI/RirikoBot
   *
   * @param {import("discord.js").Client} client Discord.js client
   * @param {import("discord.js").Message | import("discord.js").CommandInteraction} message
   * @param args Arguments, excludes the command name (e.g: !command args[0] args[1] args[2]...)
   * @param prefix Guild specific prefix, falls back to config.ts prefix
   * @param {import("config")} config config.ts file
   * @param {import("Quick.db").QuickDB} db Quick.db client
   *
   * @returns {Promise<*>}
   */
  async run(client, message, args, prefix, config, db) {
    if (!args[0])
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Missing argument")
            .setDescription(`See **${prefix}info autorole** for more info`),
        ],
      });

    const input = args.join(" ");
    let response;

    if (input.toLowerCase() === "off") {
      response = await setAutoRole(message, null, db);
    } else {
      const roles = message.guild.findMatchingRoles(input);
      if (roles.length === 0)
        response = "No matching roles found matching your query";
      else response = await setAutoRole(message, roles[0], db);
    }

    await message.reply(response);
  },
};

/**
 * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 * @param {import("discord.js").Message | import("discord.js").CommandInteraction} message
 * @param {import("discord.js").Role} role
 * @param db
 */
async function setAutoRole({ guild }, role, db) {
  if (role) {
    if (role.id === guild.roles.everyone.id)
      return "You cannot set `@everyone` as the autorole";
    if (!guild.members.me.permissions.has("ManageRoles"))
      return "I don't have the `ManageRoles` permission";
    if (guild.members.me.roles.highest.position < role.position)
      return "I don't have the permissions to assign this role";
    if (role.managed) return "Oops! This role is managed by an integration";
  }

  if (!role) await db.set(`guild_autorole_${guild.id}`, null);
  else await db.set(`guild_autorole_${guild.id}`, role.id);

  return `Configuration saved! Autorole is ${
    !role ? "disabled" : `set to ${role}`
  }`;
}
