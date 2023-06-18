const { PermissionsBitField, Routes, REST, User } = require("discord.js");
const fs = require("fs");
const colors = require("colors");
const getconfig = require("helpers/getconfig");

/**
 * Register all application commands
 * @author TFAGaming https://github.com/TFAGaming/DiscordJS-V14-Bot-Template
 *
 * @param client
 * @param config
 * @returns {boolean}
 */
module.exports = (client, config) => {
  console.info("0------------------| Application commands Handler:".blue);

  let commands = [];

  console.info("[!] Started loading slash commands...".yellow);

  // Slash commands handler:
  fs.readdirSync("./dist/commands/slash/").forEach((dir) => {
    const SlashCommands = fs
      .readdirSync(`./dist/commands/slash/${dir}`)
      .filter((file) => file.endsWith(".js") && !file.endsWith(".test.js"));

    for (let file of SlashCommands) {
      let pull = require(`../commands/slash/${dir}/${file}`);

      if ((pull.name, pull.description, pull.type == 1)) {
        client.slash_commands?.set(pull.name, pull);
        console.info(
          `[HANDLER - SLASH] Loaded a file: ${pull.name} (#${client.slash_commands?.size})`
            .brightGreen
        );

        commands.push({
          name: pull.name,
          description: pull.description,
          type: pull.type || 1,
          options: pull.options ? pull.options : null,
          default_permission: pull.permissions?.DEFAULT_PERMISSIONS
            ? pull.permissions?.DEFAULT_PERMISSIONS
            : null,
          default_member_permissions: pull.permissions
            .DEFAULT_MEMBER_PERMISSIONS
            ? PermissionsBitField.resolve(
                pull.permissions.DEFAULT_MEMBER_PERMISSIONS
              ).toString()
            : null,
        });
      } else {
        console.info(
          `[HANDLER - SLASH] Couldn't load the file ${file}, missing module name value, description, or type isn't 1.`
            .red
        );
        continue;
      }
    }
  });

  console.info("[!] Started loading user commands...".yellow);

  // User commands handler:
  fs.readdirSync("./dist/commands/user/").forEach((dir) => {
    const UserCommands = fs
      .readdirSync(`./dist/commands/user/${dir}`)
      .filter((file) => file.endsWith(".js") && !file.endsWith(".test.js"));

    for (let file of UserCommands) {
      let pull = require(`../commands/user/${dir}/${file}`);

      if ((pull.name, pull.type == 2)) {
        client.user_commands?.set(pull.name, pull);
        console.info(
          `[HANDLER - USER] Loaded a file: ${pull.name} (#${client.user_commands?.size})`
            .brightGreen
        );

        commands.push({
          name: pull.name,
          type: pull.type || 2,
        });
      } else {
        console.info(
          `[HANDLER - USER] Couldn't load the file ${file}, missing module name value or type isn't 2.`
            .red
        );
        continue;
      }
    }
  });

  console.info("[!] Started loading message commands...".yellow);

  // Message commands handler:
  fs.readdirSync("./dist/commands/message/").forEach((dir) => {
    const UserCommands = fs
      .readdirSync(`./dist/commands/message/${dir}`)
      .filter((file) => file.endsWith(".js") && !file.endsWith(".test.js"));

    for (let file of UserCommands) {
      let pull = require(`../commands/message/${dir}/${file}`);

      if ((pull.name, pull.type == 3)) {
        client.message_commands?.set(pull.name, pull);
        console.info(
          `[HANDLER - MESSAGE] Loaded a file: ${pull.name} (#${client.user_commands?.size})`
            .brightGreen
        );

        commands.push({
          name: pull.name,
          type: pull.type || 3,
        });
      } else {
        console.info(
          `[HANDLER - MESSAGE] Couldn't load the file ${file}, missing module name value or type isn't 2.`
            .red
        );
        continue;
      }
    }
  });

  if (typeof config.isMock !== "undefined") {
    return true;
  }

  const discordBotID = getconfig.discordBotID();

  // Registering all the application commands:
  if (!discordBotID) {
    console.info(
      "[CRASH] You need to provide your bot ID in config.js or .env file!".red +
        "\n"
    );
    return process.exit();
  }

  const rest = new REST({ version: "10" }).setToken(getconfig.discordToken());

  (async () => {
    try {
      await rest.put(Routes.applicationCommands(discordBotID), {
        body: commands,
      });

      client.commands = commands;

      console.info(
        "Successfully registered all the application commands to Discord"
          .brightGreen
      );
    } catch (err) {
      console.info(err);
    }
  })();
};
