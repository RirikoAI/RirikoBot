const {Guild} = require("app/Schemas/Guild");

export async function getMusicInfo(guildID: string) {
  const guild = await Guild.findOne({
    _id: guildID
  });
  
  if (!guild.musicplayer.enabled) return false;
  return {
    cover_url: guild.musicplayer.cover_url,
    now_playing: guild.musicplayer.now_playing,
    current_time: guild.musicplayer.current_time,
    maximum_time: guild.musicplayer.maximum_time,
    requested_by: guild.musicplayer.requested_by
  };
}