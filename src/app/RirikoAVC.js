const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ChannelType,
} = require("discord.js");
const config = require("config");
const { getLang } = require("helpers/language");
const getconfig = require("../helpers/getconfig");
const { QuickDB } = require("quick.db");
const fs = require("fs");
const db = new QuickDB();

/**
 * Ririko Auto Voice Channel (AVC) Class
 *
 * @author moncorp-autovoice https://github.com/Mondotosz/moncorp-autovoice/
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
class RirikoAVC {
  #_path;
  #_content = {
    primary: [],
    children: [],
  };

  constructor(path = "vc.json") {
    this.#_path = path;
    this.#load();
  }

  get PrimaryChannels() {
    return this.#_content.primary;
  }

  #save() {
    try {
      fs.writeFileSync(this.#_path, JSON.stringify(this.#_content));
    } catch (err) {
      console.error(err);
    }
  }

  #load() {
    try {
      this.#_content = JSON.parse(fs.readFileSync(this.#_path, "utf8"));
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  createPrimaryVoice(guild) {
    guild.channels
      .create({
        name: "🔊 Join To Create",
        type: ChannelType.GuildVoice,
      })
      .then((channel) => {
        this.#_content.primary.push(channel.id);
        this.#save();
        return true;
      });
  }

  deletePrimaryVoice(channel) {}

  createChildVoice(primary, user) {
    primary.guild.channels
      .create({
        name: `${user.user.username}'s Channel`,
        type: ChannelType.GuildVoice,
        parent: primary.parentId,
      })
      .then((channel) => {
        channel.setPosition(primary.position + 1);
        channel.permissionOverwrites.edit(user.id, {
          ManageChannels: true,
        });
        user.voice.setChannel(channel.id);
        this.#_content.children.push(channel.id);
        this.#save();
        return true;
      });
  }

  deleteChildrenVoice(channel) {
    this.#_content.children.splice(
      this.#_content.children.indexOf(channel.id),
      1
    );
    channel.delete("removing unused voice channel");
  }

  checkAVC(client) {
    try {
      //remove deleted channels from data
      let updatePersistance = false;
      this.#_content.primary.forEach((id) => {
        if (client.channels.cache.get(id) == null) {
          this.#_content.primary.splice(this.#_content.primary.indexOf(id), 1);
          updatePersistance = true;
        }
      });
      this.#_content.children.forEach((id) => {
        if (client.channels.cache.get(id) == null) {
          this.#_content.children.splice(
            this.#_content.children.indexOf(id),
            1
          );
          updatePersistance = true;
        }
      });
      if (updatePersistance) this.#save();

      // Check if channels need to be created
      this.#_content.primary.forEach((id) => {
        let primary = client.channels.cache.get(id);
        if (primary?.members.first() != null) {
          primary.members.every((member) => {
            this.createChildVoice(primary, member);
          });
        }
      });
      //Check if channels need to be deleted
      this.#_content.children.forEach((id) => {
        let children = client.channels.cache.get(id);
        if (children != null && children?.members.first() == null) {
          this.deleteChildrenVoice(children);
        }
      });
    } catch (e) {}
  }
}

module.exports = {
  RirikoAVC,
};
