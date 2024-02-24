const { PermissionsBitField, Routes, REST, User } = require("discord.js");
const fs = require("fs");
import "@ririkoai/colors.ts";
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
  const applicationCommands = new ApplicationCommands(client, config);
  applicationCommands.loadMessageCommands();
  applicationCommands.loadSlashCommands();
  applicationCommands.loadUserCommands();
  applicationCommands.registerCommands();
};

class ApplicationCommands {
  private client: any;
  private config: any;
  private commands: any[];

  constructor(client, config) {
    this.client = client;
    this.config = config;
    this.commands = [];
  }

  loadSlashCommands() {
    console.info("[!] Started loading slash commands...".yellow);

    fs.readdirSync("./src/commands/slash/").forEach((dir) => {
      const SlashCommands = fs
        .readdirSync(`./src/commands/slash/${dir}`)
        .filter(
          (file) =>
            (file.endsWith(".ts") || file.endsWith(".ts")) &&
            !file.endsWith(".test.ts")
        );

      for (let file of SlashCommands) {
        let pull = require(`../../src/commands/slash/${dir}/${file}`);

        if (pull.name && pull.description && pull.type === 1) {
          this.client.slash_commands?.set(pull.name, pull);
          console.info(
            `[HANDLER - SLASH] Loaded a file: ${pull.name} (#${this.client.slash_commands?.size})`
              .brightGreen
          );

          const options = pull.options || null;
          const defaultPermission =
            pull.permissions?.DEFAULT_PERMISSIONS || null;
          const defaultMemberPermissions = pull.permissions
            ?.DEFAULT_MEMBER_PERMISSIONS
            ? PermissionsBitField.resolve(
                pull.permissions.DEFAULT_MEMBER_PERMISSIONS
              ).toString()
            : null;

          this.commands.push({
            name: pull.name,
            description: pull.description,
            type: pull.type || 1,
            options,
            default_permission: defaultPermission,
            default_member_permissions: defaultMemberPermissions,
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
  }

  loadUserCommands() {
    console.info("[!] Started loading user commands...".yellow);

    fs.readdirSync("./src/commands/user/").forEach((dir) => {
      const UserCommands = fs
        .readdirSync(`./src/commands/user/${dir}`)
        .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));

      for (let file of UserCommands) {
        let pull = require(`../../src/commands/user/${dir}/${file}`);

        if (pull.name && pull.type === 2) {
          this.client.user_commands?.set(pull.name, pull);
          console.info(
            `[HANDLER - USER] Loaded a file: ${pull.name} (#${this.client.user_commands?.size})`
              .brightGreen
          );

          this.commands.push({
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
  }

  loadMessageCommands() {
    console.info("[!] Started loading message commands...".yellow);

    fs.readdirSync("./src/commands/message/").forEach((dir) => {
      const MessageCommands = fs
        .readdirSync(`./src/commands/message/${dir}`)
        .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));

      for (let file of MessageCommands) {
        let pull = require(`../../src/commands/message/${dir}/${file}`);

        if (pull.name && pull.type === 3) {
          this.client.message_commands?.set(pull.name, pull);
          console.info(
            `[HANDLER - MESSAGE] Loaded a file: ${pull.name} (#${this.client.user_commands?.size})`
              .brightGreen
          );

          this.commands.push({
            name: pull.name,
            type: pull.type || 3,
          });
        } else {
          console.info(
            `[HANDLER - MESSAGE] Couldn't load the file ${file}, missing module name value or type isn't 3.`
              .red
          );
          continue;
        }
      }
    });
  }

  registerCommands() {
    if (typeof this.config.isMock !== "undefined") {
      return true;
    }

    const discordBotID = getconfig.discordBotID();

    if (!discordBotID) {
      console.info(
        "[CRASH] You need to provide your bot ID in config.ts or .env file!"
          .red + "\n"
      );
      return process.exit();
    }

    const rest = new REST({ version: "10" }).setToken(getconfig.discordToken());

    (async () => {
      try {
        await rest.put(Routes.applicationCommands(discordBotID), {
          body: this.commands,
        });

        this.client.commands = this.commands;

        console.info(
          "Successfully registered all the application commands to Discord"
            .brightGreen
        );
      } catch (err) {
        console.info(err);
      }
    })();
  }
}
