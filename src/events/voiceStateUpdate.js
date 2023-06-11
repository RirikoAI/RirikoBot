const db = require("../app/Schemas/MusicBot");
let client = require("ririkoBot");
const { getLang } = require("helpers/language");

module.exports = {
  name: "voiceStateUpdate",
};

/**
 * on voiceStateUpdate event
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
client.on("voiceStateUpdate", async (oldState, newState) => {
  client.avc.checkAVC(client);

  const queue = client.player.getQueue(oldState.guild.id);
  if (queue || queue?.playing) {
    if (client?.config?.opt?.voiceConfig?.leaveOnEmpty?.status === true) {
      let lang = await db?.musicbot?.findOne({
        guildID: queue?.textChannel?.guild?.id,
      });
      lang = getLang();
      setTimeout(async () => {
        let botChannel = oldState?.guild?.channels?.cache?.get(
          queue?.voice?.connection?.joinConfig?.channelId
        );
        if (botChannel) {
          if (botChannel.id == oldState.channelId)
            if (botChannel?.members?.find((x) => x == client?.user?.id)) {
              if (botChannel?.members?.size == 1) {
                await queue?.textChannel
                  ?.send({ content: `${lang.msg15}` })
                  .catch((e) => {});
                if (queue || queue?.playing) {
                  return queue?.stop(oldState.guild.id);
                }
              }
            }
        }
      }, client?.config?.opt?.voiceConfig?.leaveOnEmpty?.cooldown || 60000);
    }

    if (newState.id === client.user.id) {
      let lang = getLang();
      if (oldState.serverMute === false && newState.serverMute === true) {
        if (queue?.textChannel) {
          try {
            await queue?.pause();
          } catch (e) {
            return;
          }
          await queue?.textChannel
            ?.send({ content: `${lang.msg128}` })
            .catch((e) => {});
        }
      }
      if (oldState.serverMute === true && newState.serverMute === false) {
        if (queue?.textChannel) {
          try {
            await queue.resume();
          } catch (e) {
            return;
          }
        }
      }
    }
  }
});
